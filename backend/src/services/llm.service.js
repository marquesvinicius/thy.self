import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { env } from '../config/environment.js';
import { DIMENSIONS } from '../engine/dimensions.js';
import { fetchReferenceImages } from './image.service.js';
import { checkDailyBudget, recordLLMCall } from './llm-limiter.js';
import { logger } from '../utils/logger.js';

const LLM_TIMEOUT = 60000;
const MODEL_NAME = 'gemini-2.5-flash-lite';
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 800;
const INTERPRETATION_SCHEMA_VERSION = '1.3.0';
const DETAIL_SCHEMA_VERSION = '1.0.0';
/** Bump when system/user prompt text changes materially (not JSON shape). */
export const PROMPT_VERSION = '2.3.0';
const TARGET_WORK_TYPES = ['serie', 'filme', 'anime'];
/** Abaixo disso, completamos com fallback só para não exibir seção vazia. */
const MIN_REAL_REFERENCES = 2;

// NÃO reintroduzir exemplos concretos de palavras a evitar nos "motivos"
// (ex.: "intensidade", "visão", "ambição"), como fazia o prompt pré-2.0.0.
// Medido em eval/ (n=12 por variante): não melhorou a diversidade léxica
// (0.017 vs 0.014 — idêntico nas gerações sem fallback) e QUINTUPLICOU a
// cópia do few-shot no vibe_resumo (8% → 42%). Ver eval/README.md.

export const REGEN_LENSES = [
  {
    id: 'contemporaneos',
    label: 'Contemporâneos',
    instruction:
      'Priorize figuras reais vivas ou cuja carreira principal é pós-1980. Evite personagens de ficção nesta rodada.',
  },
  {
    id: 'historicos',
    label: 'Históricos',
    instruction:
      'Priorize figuras reais históricas com vida/obra principal antes do século XX. Evite celebridades atuais.',
  },
  {
    id: 'ficcao',
    label: 'Ficção',
    instruction:
      'Priorize personagens ou universos fictícios reconhecíveis (literatura, cinema, TV, games, anime). Evite biografias de pessoas reais nesta rodada.',
  },
];

export function getRegenLens(usedCount = 0) {
  const index = Math.max(0, Math.min(Number(usedCount) || 0, REGEN_LENSES.length - 1));
  return REGEN_LENSES[index];
}

/**
 * Item de referência. A ORDEM das propriedades é funcional, não estética:
 * o modelo gera os campos na ordem declarada, então `ancora` (a resposta do
 * usuário) e `criterio` (a conduta) vêm ANTES de `nome`. Isso obriga o
 * raciocínio a partir do usuário em vez de escolher um nome conhecido e
 * racionalizar depois.
 */
const REFERENCE_ITEM_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    ancora: { type: SchemaType.STRING },
    criterio: { type: SchemaType.STRING },
    nome: { type: SchemaType.STRING },
    categoria: { type: SchemaType.STRING },
    motivo: { type: SchemaType.STRING },
    wiki_query: { type: SchemaType.STRING },
  },
  required: ['ancora', 'criterio', 'nome', 'categoria', 'motivo', 'wiki_query'],
};

const INTERPRETATION_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    schema_version: { type: SchemaType.STRING },
    vibe_resumo: { type: SchemaType.STRING },
    referencias: {
      type: SchemaType.ARRAY,
      // minItems 2 (não 3): o modelo pode concluir honestamente que só há
      // duas linhas comparativas defensáveis. Antes, sem minItems algum, ele
      // devolvia 2 e o fallback preenchia a terceira com nome enlatado.
      minItems: 2,
      maxItems: 3,
      // ORDEM IMPORTA (ver REFERENCE_ITEM_SCHEMA): o modelo gera os campos na
      // ordem declarada, então `ancora` e `criterio` vêm ANTES de `nome` — ele
      // precisa partir da resposta do usuário para chegar ao nome, em vez de
      // escolher um nome conhecido e racionalizar depois.
      items: REFERENCE_ITEM_SCHEMA,
    },
    obras_culturais: {
      type: SchemaType.ARRAY,
      minItems: 3,
      maxItems: 3,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          tipo: { type: SchemaType.STRING },
          titulo: { type: SchemaType.STRING },
          autor_ou_artista: { type: SchemaType.STRING },
          motivo: { type: SchemaType.STRING },
        },
        required: ['tipo', 'titulo', 'autor_ou_artista', 'motivo'],
      },
    },
    interpretacao: { type: SchemaType.STRING },
  },
  required: ['schema_version', 'vibe_resumo', 'referencias', 'obras_culturais', 'interpretacao'],
};

const WORK_TYPE_ALIASES = new Map([
  ['serie', 'serie'],
  ['series', 'serie'],
  ['seriado', 'serie'],
  ['tv', 'serie'],
  ['show', 'serie'],
  ['filme', 'filme'],
  ['movie', 'filme'],
  ['cinema', 'filme'],
  ['anime', 'anime'],
  ['animacao', 'anime'],
  ['animacao japonesa', 'anime'],
]);

const WORK_FALLBACKS = {
  serie: [
    { titulo: 'Breaking Bad', autor_ou_artista: 'Vince Gilligan' },
    { titulo: 'Game of Thrones', autor_ou_artista: 'David Benioff e D. B. Weiss' },
    { titulo: 'Succession', autor_ou_artista: 'Jesse Armstrong' },
  ],
  filme: [
    { titulo: 'Oppenheimer', autor_ou_artista: 'Christopher Nolan' },
    { titulo: 'Duna: Parte Dois', autor_ou_artista: 'Denis Villeneuve' },
    { titulo: 'Bastardos Inglórios', autor_ou_artista: 'Quentin Tarantino' },
  ],
  anime: [
    { titulo: 'Attack on Titan', autor_ou_artista: 'Hajime Isayama' },
    { titulo: 'Jujutsu Kaisen', autor_ou_artista: 'Gege Akutami' },
    { titulo: 'Demon Slayer', autor_ou_artista: 'Koyoharu Gotouge' },
  ],
};

// Rede de segurança quando a LLM falha ou a Wikipedia rejeita referências.
// Um nome por domínio (não três cineastas): se o fallback disparar, o trio
// final ainda cobre ângulos distintos.
const REFERENCE_FALLBACKS = [
  { categoria: 'Escritora', nome: 'Clarice Lispector', wiki_query: 'Clarice_Lispector' },
  { categoria: 'Cientista', nome: 'Alan Turing', wiki_query: 'Alan_Turing' },
  { categoria: 'Filósofa', nome: 'Hannah Arendt', wiki_query: 'Hannah_Arendt' },
  { categoria: 'Diretor', nome: 'Hayao Miyazaki', wiki_query: 'Hayao_Miyazaki' },
  { categoria: 'Música', nome: 'Björk', wiki_query: 'Björk' },
  { categoria: 'Personagem', nome: 'Walter White', wiki_query: 'Walter_White' },
];

let genAI = null;

function getClient() {
  if (!env.geminiApiKey) return null;
  if (!genAI) {
    genAI = new GoogleGenerativeAI(env.geminiApiKey);
  }
  return genAI;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeToken(value) {
  return `${value || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function sanitizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function truncateWords(text, maxWords) {
  const words = `${text || ''}`.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ').replace(/[,;:—-]+$/, '')}…`;
}

function uniqueByNormalized(items, getKey) {
  const seen = new Set();
  const unique = [];

  for (const item of items) {
    const rawKey = getKey(item);
    const key = normalizeToken(rawKey);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function normalizeStringList(values) {
  if (!Array.isArray(values)) return [];
  return uniqueByNormalized(
    values
      .map(v => sanitizeString(v))
      .filter(Boolean),
    item => item
  );
}

// Categorias que tornam uma referência imprópria como espelho de quem lê o
// resultado. A regra também está no prompt; aqui é a rede de segurança, porque
// o modelo às vezes ignora (caso real: "Serial Killer — Tsutomu Miyazaki").
const HARMFUL_CATEGORY_PATTERN = new RegExp(
  [
    'serial\\s*killer', 'assassin[oa]', 'homicida', 'criminos[oa]', 'terrorista',
    'genocida', 'ditador', 'estuprador', 'ped[oó]fil[oa]', 'traficante',
    'l[ií]der de seita', 'murderer', 'killer', 'terrorist', 'dictator', 'criminal',
  ].join('|'),
  'i'
);

export function isHarmfulReference(ref) {
  return HARMFUL_CATEGORY_PATTERN.test(`${ref?.categoria || ''}`);
}

/**
 * Tira da lista, antes da checagem na Wikipédia, as referências que não podem
 * ser mostradas: nomes já exibidos ao usuário (o modelo às vezes repete apesar
 * da lista de exclusão) e categorias impróprias. Elas contam como recusadas,
 * para o sistema pedir substitutas em vez de devolver menos de três.
 */
function screenReferences(referencias, excludedNames) {
  const excluded = new Set(excludedNames.map(name => normalizeToken(name)));
  const accepted = [];
  const refused = [];
  for (const ref of Array.isArray(referencias) ? referencias : []) {
    const name = sanitizeString(ref?.nome);
    if (name && excluded.has(normalizeToken(name))) {
      refused.push(name);
      logger.info('Reference refused: already shown to the user', { nome: name });
    } else if (name && isHarmfulReference(ref)) {
      refused.push(name);
      logger.info('Reference refused: harmful category', { nome: name, categoria: ref.categoria });
    } else {
      accepted.push(ref);
    }
  }
  return { accepted, refused };
}

function normalizeWorkType(value) {
  const normalized = normalizeToken(value);
  return WORK_TYPE_ALIASES.get(normalized) || '';
}

function getTopTraitNames(profile) {
  if (!profile?.scores || typeof profile.scores !== 'object') return [];

  return Object.entries(profile.scores)
    .filter(([, score]) => Number.isFinite(Number(score)))
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 2)
    .map(([key]) => DIMENSIONS.find(dim => dim.key === key)?.name || key);
}

function buildTraitHook(profile) {
  const topTraits = getTopTraitNames(profile);
  if (topTraits.length === 0) return 'seu perfil psicológico';
  if (topTraits.length === 1) return `seu traço de ${topTraits[0]}`;
  return `seus traços de ${topTraits[0]} e ${topTraits[1]}`;
}

// Motivos de fallback: secos e honestos — são aproximações pelos traços
// dominantes, não curadoria da LLM, e o texto não deve fingir o contrário.
function buildWorkReason(workType, profile) {
  const traitHook = buildTraitHook(profile);

  if (workType === 'serie') {
    return `Aproximação direta por ${traitHook} — decisões longas, consequências acumuladas.`;
  }
  if (workType === 'filme') {
    return `Aproximação direta por ${traitHook} — uma escolha central, condensada.`;
  }
  return `Aproximação direta por ${traitHook} — conflito interno em primeiro plano.`;
}

function buildReferenceReason(profile, archetype) {
  const traitHook = buildTraitHook(profile);
  const archetypeHook = archetype?.name ? `, próximo do eixo de ${archetype.name}` : '';
  return `Aproximação direta por ${traitHook}${archetypeHook}.`;
}

export function normalizeReferences(referencias, context = {}) {
  const excludedReferenceNames = normalizeStringList(context.excludedReferenceNames);
  const excludedCategories = normalizeStringList(context.excludedCategories);
  const excludedSet = new Set(excludedReferenceNames.map(name => normalizeToken(name)));
  const excludedCategorySet = new Set(excludedCategories.map(cat => normalizeToken(cat)));

  const normalized = (referencias || [])
    .filter(ref => ref && typeof ref === 'object')
    .map(ref => ({
      categoria: sanitizeString(ref.categoria) || 'Personalidade',
      nome: sanitizeString(ref.nome),
      // Motivo vazio NÃO descarta a referência: o nome é a curadoria da IA
      // (a parte cara e específica do perfil). Antes, um `motivo: ""` fazia
      // a referência inteira ser trocada por um nome enlatado do fallback.
      motivo: sanitizeString(ref.motivo)
        || buildReferenceReason(context.profile, context.archetype),
      wiki_query: sanitizeString(ref.wiki_query) || sanitizeString(ref.nome),
      // Rastro do raciocínio (âncora → critério → nome). Não é exibido ao
      // usuário; serve para auditar se a escolha partiu das respostas dele.
      ...(sanitizeString(ref.ancora) ? { ancora: sanitizeString(ref.ancora) } : {}),
      ...(sanitizeString(ref.criterio) ? { criterio: sanitizeString(ref.criterio) } : {}),
      ...(ref.image_url !== undefined ? { image_url: ref.image_url } : {}),
      ...(ref.wiki_found !== undefined ? { wiki_found: ref.wiki_found } : {}),
    }))
    .filter(ref => ref.nome)
    .filter(ref => !excludedSet.has(normalizeToken(ref.nome)))
    .filter(ref => !excludedCategorySet.has(normalizeToken(ref.categoria)));

  const unique = uniqueByNormalized(normalized, ref => ref.nome);

  if (unique.length >= 3) {
    return unique.slice(0, 3);
  }

  // Duas referências REAIS valem mais que três com uma enlatada: o fallback
  // aparece ao usuário indistinguível de curadoria, o que é o oposto da tese
  // do produto. Ele agora só entra para evitar a seção vazia (zero refs).
  if (unique.length >= MIN_REAL_REFERENCES) {
    return unique;
  }

  const usedNames = new Set(unique.map(ref => normalizeToken(ref.nome)));
  const usedCategories = new Set(unique.map(ref => normalizeToken(ref.categoria)));
  const fallbackReason = buildReferenceReason(context.profile, context.archetype);

  for (const fallback of REFERENCE_FALLBACKS) {
    const nameKey = normalizeToken(fallback.nome);
    const categoryKey = normalizeToken(fallback.categoria);
    if (excludedSet.has(nameKey) || usedNames.has(nameKey)) continue;
    if (excludedCategorySet.has(categoryKey)) continue;
    // Prefer unused categories when filling gaps
    if (usedCategories.has(categoryKey) && unique.length < 3) {
      // still allow if we are short, but skip if another unused-category fallback remains
      const hasUnusedCategoryFallback = REFERENCE_FALLBACKS.some(f => {
        const ck = normalizeToken(f.categoria);
        const nk = normalizeToken(f.nome);
        return !excludedSet.has(nk) && !usedNames.has(nk)
          && !excludedCategorySet.has(ck) && !usedCategories.has(ck);
      });
      if (hasUnusedCategoryFallback) continue;
    }
    unique.push({
      ...fallback,
      motivo: fallbackReason,
      wiki_found: true,
    });
    usedNames.add(nameKey);
    usedCategories.add(categoryKey);
    if (unique.length === 3) break;
  }

  if (unique.length === 0) {
    throw new Error('Missing or empty referencias array');
  }

  return unique.slice(0, 3);
}

export function normalizeWorks(works, context = {}) {
  const excludedWorkTitles = normalizeStringList(context.excludedWorkTitles);
  const excludedSet = new Set(excludedWorkTitles.map(title => normalizeToken(title)));

  const normalized = (works || [])
    .filter(work => work && typeof work === 'object')
    .map(work => ({
      tipo: normalizeWorkType(work.tipo),
      titulo: sanitizeString(work.titulo),
      autor_ou_artista: sanitizeString(work.autor_ou_artista),
      motivo: sanitizeString(work.motivo),
    }))
    .filter(work => TARGET_WORK_TYPES.includes(work.tipo))
    .filter(work => work.titulo)
    .filter(work => !excludedSet.has(normalizeToken(work.titulo)));

  const unique = uniqueByNormalized(normalized, work => work.titulo);
  const usedTitles = new Set(unique.map(work => normalizeToken(work.titulo)));
  const selectedByType = new Map();

  for (const work of unique) {
    if (!selectedByType.has(work.tipo)) {
      selectedByType.set(work.tipo, {
        ...work,
        motivo: work.motivo || buildWorkReason(work.tipo, context.profile),
      });
    }
  }

  for (const missingType of TARGET_WORK_TYPES.filter(type => !selectedByType.has(type))) {
    const fallback = (WORK_FALLBACKS[missingType] || []).find(item => {
      const titleKey = normalizeToken(item.titulo);
      return !excludedSet.has(titleKey) && !usedTitles.has(titleKey);
    });

    if (!fallback) continue;

    selectedByType.set(missingType, {
      tipo: missingType,
      titulo: fallback.titulo,
      autor_ou_artista: fallback.autor_ou_artista,
      motivo: buildWorkReason(missingType, context.profile),
    });
    usedTitles.add(normalizeToken(fallback.titulo));
  }

  const orderedWorks = TARGET_WORK_TYPES
    .map(type => selectedByType.get(type))
    .filter(Boolean);

  if (orderedWorks.length === 0) {
    throw new Error('Missing or empty obras_culturais array');
  }

  return orderedWorks;
}

function buildSystemInstruction() {
  return `Você é um analista comportamental especializado em Big Five e em referências
culturais amplas (figuras históricas, artistas, pensadores, cientistas e personagens
de ficção). Sua tarefa é cruzar um perfil Big Five com respostas interpretativas
do usuário e gerar paralelos culturais personalizados.

Tom da interpretação (obrigatório):
- Português brasileiro simples. Seco e específico — a atmosfera vem da precisão, não de floreio.
- NUNCA feche com frase de efeito, aforismo ou construção "não é X, é Y". Termine na evidência.
- Sempre fale com "você". Nunca diga "o usuário", "o perfil" ou "a pessoa analisada".
- Abra com observação concreta (escolha, contraste, tensão) — não com um número e não com metáfora de espelho/névoa/jornada.
- Números entram no meio da frase como evidência ("com abertura em 72%…").
- Sem coach ("sua jornada", "você está pronto") e sem laudo clínico ("o perfil exibe").
- Anti-Barnum: se uma frase serviria para qualquer um, corte. Toda afirmação deve ancorar em um escore ou numa resposta citável.

Regras do "vibe_resumo" (é o texto MAIS visível do resultado — mesmas regras de tom acima):
- Nomeia um COMPORTAMENTO ou CONTRASTE observável seu, em até 10 palavras.
- Proibido empilhar substantivos abstratos. Palavras banidas: energia, essência,
  jornada, equilíbrio, autoconsciência, dualidade, busca.
- Ruim: "Conflito interno de impulsos e autoconsciência, buscando equilíbrio."
- Bom:  "Decide rápido, mas revisa tudo antes de entregar."
- Bom:  "Você foge do meio-termo: escolhe lados."
- Os exemplos acima mostram o FORMATO — é proibido copiá-los ou parafraseá-los.
  Derive o comportamento do bloco [1]/[2] desta pessoa específica.

Regras obrigatórias (respeite sempre):
- Responda EXCLUSIVAMENTE com JSON válido. Nunca use markdown, blocos de código ou comentários.
- Todo o texto gerado deve estar em português brasileiro.
- Cada referência deve trazer um nome real e buscável na Wikipedia, uma categoria precisa e um motivo conectando ao perfil.
- O campo "vibe_resumo" NUNCA pode exceder 10 palavras — conte antes de responder.
- Evite repetir pessoas/títulos dentro da mesma resposta e evite sugestões obscuras.
- Varie a categoria das referências (ex.: não três atores seguidos).
- NUNCA cite pessoas conhecidas principalmente por crimes ou violência contra
  outros: assassinos (inclusive em série), terroristas, genocidas, ditadores,
  abusadores, traficantes ou líderes de seitas. A comparação é um espelho que a
  pessoa vai ler sobre si mesma; ninguém deve se ver comparado a um criminoso.
  Personagens de ficção que são vilões só entram se forem figuras culturais
  amplamente conhecidas e a conexão for com uma conduta não criminosa.
- As obras devem ser EXATAMENTE destes tipos: 1 série, 1 filme e 1 anime (uma de cada).

NÃO CAIA NA CARICATURA (REGRA CRÍTICA):
O erro a evitar NÃO é citar alguém famoso. É o atalho preguiçoso
"escore alto no traço X → ícone do traço X". Esse atalho descreve o
rótulo, não a pessoa, e produz comparação caricata.

Um nome muito conhecido é BEM-VINDO quando chega pela âncora: quando o
que conecta é uma conduta específica que ESTE usuário relatou. Teste:
se você não consegue justificar a escolha sem recorrer ao escore, é
caricatura — volte à âncora e recomece pela resposta dele.

Não force nomes obscuros para parecer original: um nome que você não
consegue verificar é pior que um nome conhecido bem ancorado. Prefira
figuras cuja existência e conduta você tem certeza.

Duas pessoas com perfis BFI-2-S diferentes JAMAIS devem acabar com a
mesma lista de referências.

COMO CHEGAR A CADA REFERÊNCIA (ordem obrigatória de raciocínio):
1. "ancora": escolha UMA resposta concreta do bloco [2] (cite o trecho) ou
   um eixo do bloco [1] com o escore. É o ponto de partida, não ilustração.
2. "criterio": descreva o COMPORTAMENTO que essa âncora revela — o que a
   pessoa fez ou faria, em linguagem de ação. Nada de adjetivo de perfil
   ("criativo", "intenso"): descreva a conduta.
3. "nome": só agora procure quem exibe ESSE comportamento de forma
   documentada. Se não existir uma linha comparativa honesta, devolva
   apenas 2 referências — é melhor que forçar uma terceira.
4. "motivo": explicite a ponte entre a âncora e a pessoa.

Exemplo do tom desejado em "interpretacao" (few-shot; não copie o conteúdo):
"Você quase não usou o meio da escala. Com conscienciosidade em 68%, o esperado era rotina rígida — mas no dilema da demissão você escolheu 'procuro alternativas criativas para manter o funcionário'. Você escreveu: 'já escolhi o caminho fácil sabendo que não era o certo'. Os números dizem controle; essa frase mostra o preço dele."`;
}

const INTERPRETATIVE_CATEGORY_LABELS = {
  moral_dilemma: 'Dilemas morais',
  paradoxical: 'Paradoxos',
  interest: 'Interesses manifestados',
};

function isPlainSignalString(signal) {
  return typeof signal === 'string';
}

function isReflectionSignal(signal) {
  if (!signal || typeof signal !== 'object') return false;
  if (signal.is_reflection === true || signal.question_type === 'reflection') return true;
  const observation = sanitizeString(signal.user_observation);
  const alternative = sanitizeString(signal.alternative_text);
  return !!observation && !alternative;
}

export function hasReflectionSignal(signals) {
  return (signals || []).some(isReflectionSignal);
}

export function getReflectionTexts(signals) {
  return (signals || [])
    .filter(isReflectionSignal)
    .map(sig => sanitizeString(sig.user_observation))
    .filter(Boolean);
}

/**
 * True when interpretacao quotes (loosely) at least one reflection snippet.
 */
export function interpretationCitesReflection(interpretacao, signals) {
  const text = normalizeToken(interpretacao);
  if (!text) return false;

  const reflections = getReflectionTexts(signals);
  if (reflections.length === 0) return true;

  return reflections.some(reflection => {
    const normalized = normalizeToken(reflection);
    if (normalized.length < 8) {
      return text.includes(normalized);
    }
    // Accept a contiguous 12-char window from the reflection (after normalize)
    const windowSize = Math.min(18, normalized.length);
    for (let i = 0; i <= normalized.length - windowSize; i += 1) {
      if (text.includes(normalized.slice(i, i + windowSize))) return true;
    }
    // Also try first ~6 significant words
    const words = normalized.split(/\s+/).filter(w => w.length > 2).slice(0, 6);
    if (words.length >= 3 && words.every(w => text.includes(w))) return true;
    return false;
  });
}

function groupInterpretativeSignals(signals) {
  const groups = new Map();

  for (const signal of signals || []) {
    if (isPlainSignalString(signal)) {
      if (!signal.trim()) continue;
      const list = groups.get('interest') || [];
      list.push({
        question_text: null,
        question_context: null,
        alternative_text: signal.trim(),
        user_observation: null,
        is_reflection: false,
      });
      groups.set('interest', list);
      continue;
    }

    if (!signal || typeof signal !== 'object') continue;
    const slug = signal.category_slug || 'interest';
    const list = groups.get(slug) || [];
    list.push({
      question_text: sanitizeString(signal.question_text) || null,
      question_context: sanitizeString(signal.question_context || signal.context) || null,
      alternative_text: sanitizeString(signal.alternative_text) || null,
      user_observation: sanitizeString(signal.user_observation) || null,
      is_reflection: isReflectionSignal(signal),
    });
    groups.set(slug, list);
  }

  return groups;
}

export function formatInterpretativeBlock(signals) {
  const groups = groupInterpretativeSignals(signals);
  if (groups.size === 0) {
    return 'Nenhuma resposta interpretativa registrada pelo usuário.';
  }

  const order = ['moral_dilemma', 'paradoxical', 'interest'];
  const remaining = [...groups.keys()].filter(k => !order.includes(k));
  const ordered = [...order, ...remaining];

  const lines = [];
  for (const slug of ordered) {
    const list = groups.get(slug);
    if (!list || list.length === 0) continue;

    const label = INTERPRETATIVE_CATEGORY_LABELS[slug] || slug;
    lines.push(`${label}:`);

    for (const entry of list) {
      const qPreview = entry.question_text
        ? `[${entry.question_text.slice(0, 80)}${entry.question_text.length > 80 ? '…' : ''}] `
        : '';

      if (entry.alternative_text) {
        lines.push(`- ${qPreview}→ "${entry.alternative_text}"`);
        if (entry.question_context) {
          lines.push(`  (cenário: "${entry.question_context}")`);
        }
        if (entry.user_observation) {
          lines.push(`  (comentário do usuário: "${entry.user_observation}")`);
        }
      } else if (entry.user_observation) {
        lines.push(`- ${qPreview}(reflexão do usuário)`);
        if (entry.question_context) {
          lines.push(`  (cenário: "${entry.question_context}")`);
        }
        lines.push(`  "${entry.user_observation}"`);
      } else {
        lines.push(`- ${qPreview}(sem resposta registrada)`);
      }
    }

    lines.push('');
  }

  return lines.join('\n').trim();
}

/**
 * Formata a assinatura de estilo de resposta (calculada em
 * engine/response-style.js) como evidência extra do bloco [1]. Só entram
 * sinais marcantes — um estilo mediano não vira linha de prompt.
 */
export function buildResponseStyleBlock(style) {
  if (!style || !style.answer_count) return '';

  const lines = [];

  if (style.extreme_rate >= 0.5) {
    lines.push(`- Convicção: ${style.extreme_count} de ${style.answer_count} respostas nos extremos da escala (±2). Quase não usou o meio.`);
  } else if (style.neutral_rate >= 0.3) {
    lines.push(`- Cautela: ${style.neutral_count} de ${style.answer_count} respostas no ponto neutro. Evitou se comprometer.`);
  } else if (style.extreme_rate <= 0.1 && style.neutral_rate < 0.3) {
    lines.push(`- Moderação: quase nenhuma resposta nos extremos (${style.extreme_count} de ${style.answer_count}). Prefere gradações a posições absolutas.`);
  }

  if (style.acquiescence) {
    lines.push('- Aquiescência: concordou tanto com itens diretos quanto com itens invertidos que se contradizem — tendência a concordar com o formato da frase, não só com o conteúdo.');
  }

  if (style.hesitation?.question_text) {
    lines.push(`- Hesitação: demorou ${style.hesitation.seconds}s (mediana: ${style.hesitation.median_seconds}s) para responder "${style.hesitation.question_text.slice(0, 90)}". Essa pausa é um dado.`);
  }

  if (lines.length === 0) return '';

  return `\nAssinatura de estilo de resposta (COMO respondeu, não O QUE respondeu — use apenas se for marcante, como evidência verificável):\n${lines.join('\n')}\n`;
}

// ── Fragmentos de prompt compartilhados ────────────────────────────────────
// Os três prompts (interpretação, detalhamento e substituição) descrevem o
// perfil do mesmo jeito; antes cada um tinha a própria cópia destas linhas.

function formatDimensionLines(profile) {
  return DIMENSIONS.map(dim => {
    const score = profile?.scores?.[dim.key];
    const level = profile?.dimensions?.find(d => d.key === dim.key)?.level || 'moderado';
    return `- ${dim.name} (${dim.key}): ${score}% — ${level}`;
  }).join('\n');
}

function formatTensionLines(consistency, description) {
  return Object.entries(consistency || {})
    .filter(([, val]) => val?.tension)
    .map(([key, val]) => {
      const name = DIMENSIONS.find(d => d.key === key)?.name || key;
      return `- ${name} (desvio: ${val.stddev}) — ${description}`;
    });
}

function formatArchetype(archetype, distanceLabel) {
  const universe = archetype.universe ? ` (universo ${archetype.universe})` : '';
  const distance = archetype.distance !== undefined
    ? ` — ${distanceLabel} ${Number(archetype.distance).toFixed(2)}`
    : '';
  return `${archetype.name}${universe}${distance}`;
}

const NO_TENSION_TEXT = 'Sem tensões internas relevantes — respostas coerentes dentro de cada eixo.';
const NO_ARCHETYPE_TEXT = 'Nenhum arquétipo identificado — calibre o tom livremente.';

function buildUserPrompt(profile, consistency, interpretativeSignals, archetype, options = {}) {
  const dimensionLines = formatDimensionLines(profile);
  const tensionAxes = formatTensionLines(consistency, 'respostas oscilaram entre extremos.');

  const tensionsBlock = tensionAxes.length > 0
    ? `Tensões internas detectadas (desvio-padrão por eixo > 1.2):\n${tensionAxes.join('\n')}\nIMPORTANTE: estas tensões são o fio condutor da "interpretacao" — não um rodapé.`
    : NO_TENSION_TEXT;

  const styleBlock = buildResponseStyleBlock(options.responseStyle);

  const interpretativeBlock = formatInterpretativeBlock(interpretativeSignals);
  const reflectionTexts = getReflectionTexts(interpretativeSignals);
  const hasReflections = reflectionTexts.length > 0;

  const antiArchetype = options.antiArchetype;
  const archetypeBlock = [
    archetype?.name
      ? `Mais próximo: ${formatArchetype(archetype, 'distância euclidiana')}.`
      : NO_ARCHETYPE_TEXT,
    antiArchetype?.name
      ? `Mais DISTANTE (anti-arquétipo): ${formatArchetype(antiArchetype, 'distância')}. Contraste útil: o que essa pessoa NÃO é também diz quem ela é.`
      : null,
  ].filter(Boolean).join('\n');

  const excludedReferenceNames = normalizeStringList(options.excludedReferenceNames);
  const excludedWorkTitles = normalizeStringList(options.excludedWorkTitles);
  const excludedCategories = normalizeStringList(options.excludedCategories);
  const exclusionLines = [];
  if (excludedReferenceNames.length > 0) {
    exclusionLines.push(`NÃO repita nenhuma destas referências já usadas: ${excludedReferenceNames.join(', ')}.`);
  }
  if (excludedCategories.length > 0) {
    exclusionLines.push(`NÃO use estas categorias já usadas: ${excludedCategories.join(', ')}. Escolha categorias diferentes.`);
  }
  if (excludedWorkTitles.length > 0) {
    exclusionLines.push(`NÃO repita nenhuma destas obras já usadas: ${excludedWorkTitles.join(', ')}.`);
  }
  const exclusionBlock = exclusionLines.length > 0
    ? `\n========================================\n[EXCLUSÕES]\n========================================\n${exclusionLines.join('\n')}\n`
    : '';

  const lens = options.regenLens;
  const lensBlock = lens?.instruction
    ? `\n========================================\n[LENTE DE REGENERAÇÃO: ${lens.label || lens.id}]\n========================================\n${lens.instruction}\n`
    : '';

  const reflectionRule = hasReflections
    ? `Há reflexão(ões) livre(s) no bloco [2]. A citação entre aspas na "interpretacao" DEVE vir de uma delas (máx 20 palavras), não de dilema/múltipla escolha. Reflexões disponíveis:\n${reflectionTexts.map(t => `- "${t.slice(0, 120)}${t.length > 120 ? '…' : ''}"`).join('\n')}`
    : 'Cite ao menos uma resposta específica do bloco [2] entre aspas (máx 20 palavras).';

  const tensionRule = tensionAxes.length > 0
    ? 'Estruture a "interpretacao" em torno da tensão detectada no bloco [1]: ela é o eixo, não um detalhe final.'
    : 'Se não houver tensão, não invente uma.';

  return `Você está interpretando alguém que respondeu um questionário dual-core
(camada objetiva validada + camada interpretativa narrativa).

========================================
[1] PERFIL BIG FIVE — QUANTITATIVO
(Calculado a partir de 30 itens BFI-2-S — Soto & John, 2017)
========================================
${dimensionLines}

${tensionsBlock}
${styleBlock}
========================================
[2] RESPOSTAS INTERPRETATIVAS — QUALITATIVO
(Autorais; NÃO influenciam o cálculo. Servem apenas como contexto narrativo.)
========================================
${interpretativeBlock}

========================================
[3] ARQUÉTIPO ESTATÍSTICO MAIS PRÓXIMO
========================================
${archetypeBlock}
${exclusionBlock}${lensBlock}
========================================
TAREFA
========================================
Escreva "interpretacao" em segunda pessoa ("você"), tom baixo e específico.
${tensionRule}
Destaque CONVERGÊNCIAS (onde dilemas/paradoxos reforçam os escores) e, se
existirem, DIVERGÊNCIAS. Se não houver divergência real, diga isso — não force.
${reflectionRule}
Use o arquétipo [3] só como calibrador de tom, nunca como rótulo principal.

Gere 3 referências com CATEGORIAS DIFERENTES entre si — ou 2, se a terceira
não tiver uma linha comparativa honesta com as respostas deste usuário.
Cada uma começa pela "ancora" (resposta real dele), depois "criterio"
(comportamento), e SÓ ENTÃO o "nome". Nunca o caminho inverso.
Gere EXATAMENTE 3 obras (1 série, 1 filme, 1 anime), reconhecíveis.
Não repita pessoas nem títulos dentro da mesma resposta.

Diversificação obrigatória:
- Cada referência ilumina um ÂNGULO DIFERENTE (traço, dilema, interesse/paradoxo).
- Léxico distinto em cada "motivo" — não repita as mesmas palavras-chave.
- Se o bloco [2] tiver interesses manifestados, 1 das 3 referências DEVE vir
  de um domínio distante desse interesse, com motivo que justifique o contraste.
- Varie o foco das obras (traço dominante / tensão / interesse narrativo).

Retorne JSON com esta estrutura exata:
{
  "schema_version": "${INTERPRETATION_SCHEMA_VERSION}",
  "vibe_resumo": "Um comportamento seu resumido em até 10 palavras, concreto, sem substantivos abstratos",
  "referencias": [
    {
      "ancora": "trecho literal de uma resposta do bloco [2] OU eixo+escore do bloco [1]",
      "criterio": "o comportamento concreto que essa âncora revela (conduta, não adjetivo)",
      "nome": "quem exibe ESSE comportamento de forma documentada",
      "categoria": "Tipo",
      "motivo": "a ponte entre a âncora e a pessoa, em 1 frase",
      "wiki_query": "Nome_Wikipedia"
    },
    { "ancora": "...", "criterio": "...", "nome": "...", "categoria": "...", "motivo": "...", "wiki_query": "..." }
  ],
  "obras_culturais": [
    { "tipo": "serie", "titulo": "Título da série", "autor_ou_artista": "Criador(a) ou showrunner", "motivo": "1 frase conectando ao perfil" },
    { "tipo": "filme", "titulo": "Título do filme", "autor_ou_artista": "Diretor(a)", "motivo": "1 frase conectando ao perfil" },
    { "tipo": "anime", "titulo": "Título do anime", "autor_ou_artista": "Autor(a) ou estúdio", "motivo": "1 frase conectando ao perfil" }
  ],
  "interpretacao": "Até 4 frases em segunda pessoa integrando números do bloco [1] com escolhas narrativas do bloco [2], citando resposta real e ao menos uma convergência (e divergência, se houver). Termine na evidência, sem frase de efeito."
}`;
}

function buildDetailSystemInstruction() {
  return `Você é um analista de personalidade especializado em Big Five e em
referências culturais amplas (figuras históricas, artistas, pensadores,
cientistas e personagens de ficção). Compare o perfil de quem responde com
uma personalidade específica, sendo honesto sobre semelhanças E tensões.
Responda EXCLUSIVAMENTE com JSON válido em português brasileiro.

Tom (obrigatório — mesmas regras do resultado principal):
- Português brasileiro simples. Seco e específico — a atmosfera vem da precisão, não de floreio.
- NUNCA feche com frase de efeito, aforismo ou construção "não é X, é Y". Termine na evidência.
- Sempre fale com "você". Nunca diga "o usuário", "o perfil" ou "a pessoa analisada".
- Números entram no meio da frase como evidência ("com abertura em 72%…").
- Sem coach ("sua jornada", "você está pronto") e sem laudo clínico ("o perfil exibe").
- Anti-Barnum: se uma frase serviria para qualquer um, corte. Toda afirmação deve ancorar em um escore ou numa resposta citável.

Exemplo do tom desejado numa seção (few-shot; não copie o conteúdo):
"Feynman abria as fechaduras do laboratório por diversão; você escreveu que perde a noção do tempo 'resolvendo problemas complexos ou puzzles'. Com abertura em 70%, a curiosidade de vocês opera parecido — a diferença é que a dele era pública, e a sua, com extroversão em 40%, acontece de porta fechada."`;
}

function buildReferenceDetailPrompt(profile, consistency, interpretativeSignals, archetype, reference, options = {}) {
  const referenceName = sanitizeString(reference?.nome);
  const referenceCategory = sanitizeString(reference?.categoria) || 'Personalidade cultural';
  const referenceMotivo = sanitizeString(reference?.motivo);

  const priorInterpretation = sanitizeString(options.priorInterpretation);
  const otherReferences = Array.isArray(options.otherReferences)
    ? options.otherReferences
        .map(ref => ({
          nome: sanitizeString(ref?.nome),
          motivo: sanitizeString(ref?.motivo),
        }))
        .filter(ref => ref.nome && ref.nome !== referenceName)
    : [];

  const dimensionLines = formatDimensionLines(profile);
  const interpretativeContext = formatInterpretativeBlock(interpretativeSignals);

  // Sem objeto de consistência o bloco é omitido; com ele, lista as tensões
  // ou declara a coerência.
  const tensions = formatTensionLines(consistency, 'oscilação entre extremos dentro do eixo.');
  let tensionsBlock = '';
  if (consistency) {
    tensionsBlock = tensions.length > 0
      ? `Tensões internas detectadas (desvio-padrão por eixo > 1.2):\n${tensions.join('\n')}`
      : NO_TENSION_TEXT;
  }

  const archetypeBlock = archetype?.name
    ? `${formatArchetype(archetype, 'distância euclidiana')}.`
    : NO_ARCHETYPE_TEXT;

  const priorInterpretationBlock = priorInterpretation
    ? `\n========================================\n[4] TEXTO INTERPRETATIVO JÁ ENTREGUE AO USUÁRIO\n(Você não deve REPETIR os argumentos abaixo nem parafraseá-los.)\n========================================\n${priorInterpretation}\n`
    : '';

  const otherReferencesBlock = otherReferences.length > 0
    ? `\n========================================\n[5] OUTRAS REFERÊNCIAS JÁ APRESENTADAS\n(Evite repetir os mesmos ângulos usados nos motivos destas referências.)\n========================================\n${otherReferences
        .map(ref => `- ${ref.nome}${ref.motivo ? ` — motivo anterior: "${ref.motivo}"` : ''}`)
        .join('\n')}\n`
    : '';

  return `Você vai comparar o perfil de um usuário com uma personalidade escolhida por ele.

========================================
[0] PERSONALIDADE SELECIONADA
========================================
- Nome: ${referenceName}
- Categoria: ${referenceCategory}
- Motivo inicial (não reescreva literalmente): ${referenceMotivo || 'Sem motivo inicial'}

========================================
[1] PERFIL BIG FIVE DO USUÁRIO — QUANTITATIVO
(Calculado a partir de 30 itens BFI-2-S — Soto & John, 2017)
========================================
${dimensionLines}

${tensionsBlock}

========================================
[2] RESPOSTAS INTERPRETATIVAS DO USUÁRIO — QUALITATIVO
(Autorais; NÃO alimentam o cálculo. Servem como contexto narrativo.)
========================================
${interpretativeContext}

========================================
[3] ARQUÉTIPO ESTATÍSTICO MAIS PRÓXIMO
========================================
${archetypeBlock}
${priorInterpretationBlock}${otherReferencesBlock}
========================================
TAREFA
========================================
Construa uma comparação honesta entre quem respondeu (trate por "você") e
${referenceName}. Destaque tanto CONVERGÊNCIAS (onde perfil + respostas se
alinham com a referência) quanto DIVERGÊNCIAS / pontos de tensão (quando
houver — não force semelhança artificial). Cite ao menos uma resposta
específica entre aspas (máx 20 palavras) para ancorar a análise.

Diversificação obrigatória (teste de usabilidade exigiu):
- NÃO repita argumentos, exemplos ou frases do bloco [4] acima.
- NÃO reaproveite os ângulos usados no "motivo anterior" de outras
  referências em [5] — escolha um prisma NOVO (pode ser um traço Big Five
  ainda pouco explorado, um dilema específico do usuário, um paradoxo ou
  um interesse manifestado).
- Cada seção deve trazer uma observação ORIGINAL, específica a esta
  referência — nada de repetir a mesma ideia só trocando o sujeito.

Formato: 2 a 3 seções, cada uma com título curto e conteúdo de 2 a 4 frases.
A última seção pode ser reservada para uma nuance ou ponto de tensão quando
isso agregar valor.

Retorne JSON com esta estrutura exata:
{
  "schema_version": "${DETAIL_SCHEMA_VERSION}",
  "titulo": "Você x ${referenceName}",
  "secoes": [
    { "titulo": "Convergências de traço", "conteudo": "2 a 4 frases com comparação objetiva dos eixos Big Five relevantes" },
    { "titulo": "Convergências de comportamento", "conteudo": "2 a 4 frases ancoradas em respostas interpretativas específicas" },
    { "titulo": "Nuance ou tensão (opcional)", "conteudo": "2 a 4 frases com divergência real, se houver; caso contrário, omita esta seção" }
  ]
}`;
}

function extractJsonCandidate(text) {
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace < firstBrace) {
    throw new Error('No JSON object found in LLM response');
  }

  // O recorte já começa em '{' e termina em '}' (cercas de markdown ficam de
  // fora); resta corrigir aspas tipográficas e vírgulas finais.
  return text
    .slice(firstBrace, lastBrace + 1)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1');
}

export function parseStructuredJson(text) {
  const directCandidate = text.trim();

  try {
    return JSON.parse(directCandidate);
  } catch {
    const recoveredCandidate = extractJsonCandidate(text);
    return JSON.parse(recoveredCandidate);
  }
}

export function parseResponse(text, context = {}) {
  const parsed = parseStructuredJson(text);

  if (!parsed.schema_version || typeof parsed.schema_version !== 'string') {
    throw new Error('Missing or invalid schema_version');
  }
  if (!parsed.vibe_resumo || typeof parsed.vibe_resumo !== 'string') {
    throw new Error('Missing or invalid vibe_resumo');
  }
  if (!Array.isArray(parsed.referencias) || parsed.referencias.length === 0) {
    throw new Error('Missing or empty referencias array');
  }
  if (!Array.isArray(parsed.obras_culturais) || parsed.obras_culturais.length === 0) {
    throw new Error('Missing or empty obras_culturais array');
  }
  if (!parsed.interpretacao || typeof parsed.interpretacao !== 'string') {
    throw new Error('Missing or invalid interpretacao');
  }

  // Guard defensivo: o limite de 10 palavras do vibe_resumo é instrução de
  // prompt; se o modelo estourar, truncamos aqui em vez de exibir um parágrafo
  // no maior heading da tela.
  parsed.vibe_resumo = truncateWords(parsed.vibe_resumo.trim(), 12);

  parsed.referencias = normalizeReferences(parsed.referencias, context);
  parsed.obras_culturais = normalizeWorks(parsed.obras_culturais, context);

  return parsed;
}

function parseReferenceDetailResponse(text, referenceName) {
  const parsed = parseStructuredJson(text);

  const fallbackTitle = referenceName ? `Você x ${referenceName}` : 'Comparação detalhada';
  const title = sanitizeString(parsed.titulo) || fallbackTitle;
  const sections = (parsed.secoes || [])
    .filter(section => section && typeof section === 'object')
    .map(section => ({
      titulo: sanitizeString(section.titulo),
      conteudo: sanitizeString(section.conteudo),
    }))
    .filter(section => section.titulo && section.conteudo)
    .slice(0, 3);

  if (sections.length < 2) {
    throw new Error('Invalid detail response: expected 2 to 3 sections');
  }

  return {
    schema_version: typeof parsed.schema_version === 'string'
      ? parsed.schema_version
      : DETAIL_SCHEMA_VERSION,
    titulo: title,
    secoes: sections,
  };
}

function shouldRetryError(err) {
  if (!err) return false;
  const message = `${err.message || ''}`.toLowerCase();
  const status = err.status || err.statusCode || 0;

  if (status === 429 || status >= 500) return true;
  return (
    message.includes('timeout') ||
    message.includes('aborted') ||
    message.includes('rate') ||
    message.includes('unavailable') ||
    message.includes('503') ||
    message.includes('429')
  );
}

async function callLLMWithTimeout(model, prompt) {
  // Um único timer aborta a requisição e rejeita a corrida. Antes havia um
  // segundo setTimeout de 60 s que nunca era limpo: cada chamada deixava um
  // timer pendurado no event loop mesmo depois de responder.
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('LLM timeout reached'));
    }, LLM_TIMEOUT);
  });

  try {
    return await Promise.race([
      model.generateContent(prompt, { signal: controller.signal }),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function generateRawInterpretation(model, prompt) {
  let attempt = 0;
  let lastError = null;

  while (attempt <= MAX_RETRIES) {
    const start = Date.now();
    try {
      const result = await callLLMWithTimeout(model, prompt);
      const durationMs = Date.now() - start;
      const text = result.response.text();
      const usage = result.response.usageMetadata || {};

      logger.info('LLM response received', {
        duration_ms: durationMs,
        response_length: text.length,
        prompt_tokens: usage.promptTokenCount || null,
        candidates_tokens: usage.candidatesTokenCount || null,
        total_tokens: usage.totalTokenCount || null,
        model: MODEL_NAME,
      });

      return text;
    } catch (err) {
      lastError = err;
      const durationMs = Date.now() - start;
      const retryable = shouldRetryError(err);

      logger.error('LLM call failed', {
        attempt: attempt + 1,
        retryable,
        duration_ms: durationMs,
        error: err.message,
      });

      if (!retryable || attempt === MAX_RETRIES) {
        break;
      }

      const backoffMs = RETRY_BASE_MS * Math.pow(2, attempt);
      await sleep(backoffMs);
      attempt += 1;
    }
  }

  throw lastError || new Error('LLM call failed');
}

/**
 * Pretty-prints the full payload being handed to Gemini. Kept as a plain
 * console banner (not logger.info) on purpose: the JSON-envelope logger
 * would escape newlines and make the prompt unreadable during local
 * verification runs. Controlled by LLM_LOG_PROMPT (default: enabled in
 * non-production).
 */
function logPromptPayload(label, systemInstruction, prompt, temperature) {
  const flag = (process.env.LLM_LOG_PROMPT || '').toLowerCase();
  const enabled = flag === ''
    ? env.nodeEnv !== 'production'
    : ['1', 'true', 'yes', 'on'].includes(flag);

  if (!enabled) return;

  logger.info(`${label} → prompt dispatched`, {
    model: MODEL_NAME,
    temperature,
    system_length: systemInstruction.length,
    prompt_length: prompt.length,
  });

  // Saída direta no console de propósito (ver comentário acima): o banner
  // precisa das quebras de linha que o logger JSON escaparia.
  /* eslint-disable no-console */
  const banner = '─'.repeat(72);
  console.log(`\n${banner}`);
  console.log(`[LLM PROMPT] ${label} · model=${MODEL_NAME} · temp=${temperature}`);
  console.log(banner);
  console.log('--- system_instruction ---');
  console.log(systemInstruction);
  console.log('--- user_prompt ---');
  console.log(prompt);
  console.log(`${banner}\n`);
  /* eslint-enable no-console */
}

async function generateStructuredOutput({
  systemInstruction,
  prompt,
  temperature = 0.9,
  parser,
  parseContext = {},
  errorLabel,
  responseSchema = null,
}) {
  const client = getClient();
  if (!client) {
    logger.info(`${errorLabel} skipped: GEMINI_API_KEY not configured`);
    return null;
  }

  const budget = await checkDailyBudget();
  if (!budget.allowed) {
    logger.info(`${errorLabel} skipped: daily limit reached (${budget.used}/${budget.limit})`);
    return null;
  }

  try {
    const generationConfig = {
      temperature,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    };
    if (responseSchema) {
      generationConfig.responseSchema = responseSchema;
    }

    const model = client.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction,
      generationConfig,
    });

    logPromptPayload(errorLabel, systemInstruction, prompt, temperature);

    const text = await generateRawInterpretation(model, prompt);

    let parsed;
    try {
      parsed = parser(text, parseContext);
    } catch (parseErr) {
      logger.error(`${errorLabel} parse failed`, {
        error: parseErr.message,
        raw_preview: text.slice(0, 500),
      });
      throw parseErr;
    }

    await recordLLMCall();
    return parsed;
  } catch (err) {
    logger.error(`${errorLabel} failed (graceful skip)`, {
      error: err.message,
      name: err.name,
      model: MODEL_NAME,
    });
    return null;
  }
}

const REPLACEMENT_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    referencias: {
      type: SchemaType.ARRAY,
      minItems: 1,
      maxItems: 3,
      items: REFERENCE_ITEM_SCHEMA,
    },
  },
  required: ['referencias'],
};

/**
 * Chamada focada: pede APENAS referências novas para repor as que foram
 * rejeitadas por não existirem. Prompt enxuto (só os blocos necessários
 * para ancorar), saída pequena — custa uma fração da geração completa.
 */
async function generateReplacementReferences({
  profile,
  interpretativeSignals,
  archetype,
  needed,
  excludedNames = [],
}) {
  const count = Math.max(1, Math.min(3, needed));
  const dimensionLines = formatDimensionLines(profile);

  const prompt = `Algumas referências da resposta anterior foram descartadas por não
existirem (nome inventado ou incorreto). Gere ${count} substituta(s).

========================================
[1] PERFIL BIG FIVE
========================================
${dimensionLines}

========================================
[2] RESPOSTAS INTERPRETATIVAS
========================================
${formatInterpretativeBlock(interpretativeSignals)}

========================================
[3] ARQUÉTIPO MAIS PRÓXIMO
========================================
${archetype?.name ? `${archetype.name}${archetype.universe ? ` (${archetype.universe})` : ''}` : 'nenhum'}

========================================
REGRAS
========================================
NÃO use nenhum destes nomes (já usados ou rejeitados): ${excludedNames.join(', ') || '—'}.

Cada referência começa pela "ancora" (resposta real do bloco [2] ou eixo do
bloco [1] com escore), depois "criterio" (a conduta que ela revela), e SÓ
ENTÃO o "nome". Nunca o caminho inverso.

CRÍTICO — a rodada anterior falhou por nome inexistente: use apenas figuras
cuja existência você tem CERTEZA, com o nome exato do verbete da Wikipedia.
Um nome conhecido bem ancorado é melhor que um nome obscuro inventado.
Evite o atalho "escore alto → ícone do traço": a ponte tem que ser a conduta.

Retorne JSON: { "referencias": [ { "ancora": "...", "criterio": "...", "nome": "...", "categoria": "...", "motivo": "...", "wiki_query": "..." } ] }`;

  const result = await generateStructuredOutput({
    systemInstruction: buildSystemInstruction(),
    prompt,
    temperature: 1.0,
    parser: text => {
      const parsed = parseStructuredJson(text);
      if (!Array.isArray(parsed?.referencias)) {
        throw new Error('Missing referencias in replacement response');
      }
      return parsed.referencias;
    },
    errorLabel: 'LLM reference replacement',
    responseSchema: REPLACEMENT_RESPONSE_SCHEMA,
  });

  return Array.isArray(result) ? result : [];
}

/**
 * Separa as referências que existem (verbete na Wikipedia) das alucinadas.
 * A checagem é o único detector de alucinação do pipeline: um nome que a IA
 * inventou (ex.: "George A. Stillson", quando o personagem é Greg Stillson)
 * morre aqui em vez de chegar à tela.
 */
async function partitionByWikipedia(referencias) {
  const withWiki = await fetchReferenceImages(referencias);
  const valid = [];
  const rejectedNames = [];

  for (const ref of withWiki) {
    // Só descartamos com 404 CONFIRMADO nas duas línguas. `unknown`
    // (timeout, 429, rede) mantém a referência: incerteza de infraestrutura
    // não pode custar uma referência legítima e bem ancorada — foi
    // exatamente isso que descartou Atticus Finch e Charles Chaplin.
    if (ref.wiki_status === 'missing') {
      rejectedNames.push(ref.nome);
      logger.info('Reference rejected: Wikipedia returned 404 in PT and EN', {
        nome: ref.nome,
        wiki_query: ref.wiki_query,
      });
    } else {
      if (ref.wiki_status === 'unknown') {
        logger.warn('Reference kept despite failed lookup', {
          nome: ref.nome,
          wiki_query: ref.wiki_query,
        });
      }
      valid.push(ref);
    }
  }

  return { valid, rejectedNames };
}

/**
 * Valida as referências e, quando alguma é rejeitada, PEDE SUBSTITUIÇÃO ao
 * modelo em vez de completar com nome enlatado.
 *
 * Decisão de produto: o /analyze pode demorar mais; o que não pode é o
 * usuário receber um nome de catálogo indistinguível de curadoria. O custo
 * é uma chamada extra, e só quando há rejeição (~25% das gerações).
 * O fallback determinístico vira último recurso.
 */
async function enrichAndValidateReferences(referencias, parseContext = {}) {
  const alreadyExcluded = normalizeStringList(parseContext.excludedReferenceNames);
  const screened = screenReferences(referencias, alreadyExcluded);
  const { valid, rejectedNames: missingNames } = await partitionByWikipedia(screened.accepted);
  const rejectedNames = [...screened.refused, ...missingNames];

  if (valid.length >= 3) {
    return valid.slice(0, 3);
  }

  let pool = valid;

  // Menos de 3 por qualquer motivo — nome inventado, impróprio, repetido ou o
  // modelo simplesmente devolveu menos (repetidos já saem na leitura da
  // resposta, sem virar "recusa") — pede as que faltam.
  if (parseContext.replacementContext) {
    const missing = 3 - pool.length;
    const excludedNames = [
      ...alreadyExcluded,
      ...rejectedNames,
      ...pool.map(ref => ref.nome),
    ];
    const replacements = await generateReplacementReferences({
      ...parseContext.replacementContext,
      needed: missing,
      excludedNames,
    });

    if (replacements?.length) {
      // As substitutas passam pela MESMA triagem e validação — nada entra
      // repetido, impróprio ou sem verbete.
      const again = screenReferences(replacements, excludedNames);
      const checked = await partitionByWikipedia(again.accepted);
      pool = [...pool, ...checked.valid];
      logger.info('Reference replacement round finished', {
        requested: missing,
        returned: replacements.length,
        accepted: checked.valid.length,
      });
    }
  }

  // Tudo que chega aqui já passou pela Wikipédia ou é fallback curado
  // (wiki_found: true), então não há nova consulta a fazer.
  return normalizeReferences(pool, {
    ...parseContext,
    excludedReferenceNames: [...alreadyExcluded, ...rejectedNames],
  });
}

/**
 * Generates a narrative interpretation using Gemini.
 * Returns null gracefully on any failure (missing key, timeout, parse error).
 *
 * @param {Object} profile - From calculateProfile(): { scores, dimensions, ... }
 * @param {Object} consistency - From calculateConsistency(): { O: {stddev, tension}, ... }
 * @param {Array<Object|string>} interpretativeSignals - Structured signals from
 *   interpretative answers (moral dilemmas, paradoxes, interests). Each entry
 *   may be either `{ category_slug, question_text, alternative_text, user_observation }`
 *   (new Dual-Core shape) or a plain string (legacy interest alternative text).
 * @param {Object} archetype - From findClosestArchetype(): { name, universe, distance }
 * @param {Object} options - { temperature?, excludedReferenceNames?, excludedWorkTitles?,
 *   excludedCategories?, regenLens? }
 * @returns {Promise<Object|null>} interpretation object or null
 */
export async function generateInterpretation(profile, consistency, interpretativeSignals, archetype, options = {}) {
  const parseContext = {
    profile,
    archetype,
    excludedReferenceNames: options.excludedReferenceNames,
    excludedWorkTitles: options.excludedWorkTitles,
    excludedCategories: options.excludedCategories,
    // Contexto para a chamada de substituição, quando alguma referência for
    // rejeitada por não existir (ver enrichAndValidateReferences).
    replacementContext: { profile, interpretativeSignals, archetype },
  };

  const systemInstruction = buildSystemInstruction();
  const prompt = buildUserPrompt(profile, consistency, interpretativeSignals, archetype, options);
  const temperature = options.temperature || 0.9;

  let interpretation = await generateStructuredOutput({
    systemInstruction,
    prompt,
    temperature,
    parser: parseResponse,
    parseContext,
    errorLabel: 'LLM interpretation',
    responseSchema: INTERPRETATION_RESPONSE_SCHEMA,
  });

  if (!interpretation) return null;

  // One retry if reflections exist but were not cited
  if (
    hasReflectionSignal(interpretativeSignals)
    && !interpretationCitesReflection(interpretation.interpretacao, interpretativeSignals)
  ) {
    const snippet = getReflectionTexts(interpretativeSignals)[0] || '';
    const retryPrompt = `${prompt}

========================================
[CORREÇÃO OBRIGATÓRIA]
========================================
Sua resposta anterior não citou a reflexão livre do usuário.
Reescreva "interpretacao" citando literalmente (entre aspas, máx 20 palavras)
um trecho de: "${snippet.slice(0, 160)}"
Mantenha o restante das regras.`;

    logger.info('LLM interpretation retry: missing reflection citation');
    const retried = await generateStructuredOutput({
      systemInstruction,
      prompt: retryPrompt,
      temperature,
      parser: parseResponse,
      parseContext,
      errorLabel: 'LLM interpretation (reflection retry)',
      responseSchema: INTERPRETATION_RESPONSE_SCHEMA,
    });
    if (retried) interpretation = retried;
  }

  interpretation.prompt_version = PROMPT_VERSION;
  interpretation.referencias = await enrichAndValidateReferences(
    interpretation.referencias,
    parseContext,
  );
  return interpretation;
}

/**
 * Generates a deeper comparison between user profile and selected cultural reference.
 * Returns null gracefully on any failure.
 *
 * @param {Object} profile
 * @param {Object} consistency
 * @param {Array<Object|string>} interpretativeSignals - See generateInterpretation.
 * @param {Object} archetype
 * @param {Object} reference - { nome, categoria, motivo, image_url? }
 * @param {Object} options - { temperature?: number }
 * @returns {Promise<Object|null>} { schema_version, titulo, secoes[] } or null
 */
export async function generateReferenceDetail(profile, consistency, interpretativeSignals, archetype, reference, options = {}) {
  const referenceName = sanitizeString(reference?.nome);
  if (!referenceName) {
    throw new Error('reference.nome is required');
  }

  const prompt = buildReferenceDetailPrompt(
    profile,
    consistency,
    interpretativeSignals,
    archetype,
    reference,
    {
      priorInterpretation: options.priorInterpretation,
      otherReferences: options.otherReferences,
    }
  );

  return generateStructuredOutput({
    systemInstruction: buildDetailSystemInstruction(),
    prompt,
    temperature: options.temperature || 0.85,
    parser: text => parseReferenceDetailResponse(text, referenceName),
    errorLabel: 'LLM reference detail',
  });
}
