import { GoogleGenerativeAI } from '@google/generative-ai';
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
const TARGET_WORK_TYPES = ['serie', 'filme', 'anime'];

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

const REFERENCE_FALLBACKS = [
  { categoria: 'Diretor', nome: 'Christopher Nolan', wiki_query: 'Christopher_Nolan' },
  { categoria: 'Diretor', nome: 'Quentin Tarantino', wiki_query: 'Quentin_Tarantino' },
  { categoria: 'Criador de Série', nome: 'Vince Gilligan', wiki_query: 'Vince_Gilligan' },
  { categoria: 'Ator', nome: 'Cillian Murphy', wiki_query: 'Cillian_Murphy' },
  { categoria: 'Personagem', nome: 'Walter White', wiki_query: 'Walter_White' },
  { categoria: 'Personagem', nome: 'Daenerys Targaryen', wiki_query: 'Daenerys_Targaryen' },
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

function buildWorkReason(workType, profile, archetype) {
  const traitHook = buildTraitHook(profile);
  const archetypeHook = archetype?.name ? ` e a energia parecida com ${archetype.name}` : '';

  if (workType === 'serie') {
    return `Conecta com ${traitHook}, com conflitos e decisões que refletem seu modo de agir${archetypeHook}.`;
  }
  if (workType === 'filme') {
    return `Dialoga com ${traitHook}, trazendo ambição, profundidade e escolhas de alto impacto${archetypeHook}.`;
  }
  return `Resoa com ${traitHook}, especialmente pela intensidade emocional e evolução pessoal${archetypeHook}.`;
}

function buildReferenceReason(profile, archetype) {
  const traitHook = buildTraitHook(profile);
  const archetypeHook = archetype?.name ? `, em linha com ${archetype.name}` : '';
  return `Reflete ${traitHook}${archetypeHook}, com uma combinação de visão, intensidade e execução.`;
}

function normalizeReferences(referencias, context = {}) {
  const excludedReferenceNames = normalizeStringList(context.excludedReferenceNames);
  const excludedSet = new Set(excludedReferenceNames.map(name => normalizeToken(name)));

  const normalized = (referencias || [])
    .filter(ref => ref && typeof ref === 'object')
    .map(ref => ({
      categoria: sanitizeString(ref.categoria) || 'Personalidade',
      nome: sanitizeString(ref.nome),
      motivo: sanitizeString(ref.motivo),
      wiki_query: sanitizeString(ref.wiki_query) || sanitizeString(ref.nome),
    }))
    .filter(ref => ref.nome && ref.motivo)
    .filter(ref => !excludedSet.has(normalizeToken(ref.nome)));

  const unique = uniqueByNormalized(normalized, ref => ref.nome);

  if (unique.length >= 3) {
    return unique.slice(0, 3);
  }

  const usedNames = new Set(unique.map(ref => normalizeToken(ref.nome)));
  const fallbackReason = buildReferenceReason(context.profile, context.archetype);

  for (const fallback of REFERENCE_FALLBACKS) {
    const nameKey = normalizeToken(fallback.nome);
    if (excludedSet.has(nameKey) || usedNames.has(nameKey)) continue;
    unique.push({
      ...fallback,
      motivo: fallbackReason,
    });
    usedNames.add(nameKey);
    if (unique.length === 3) break;
  }

  if (unique.length === 0) {
    throw new Error('Missing or empty referencias array');
  }

  return unique.slice(0, 3);
}

function normalizeWorks(works, context = {}) {
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
        motivo: work.motivo || buildWorkReason(work.tipo, context.profile, context.archetype),
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
      motivo: buildWorkReason(missingType, context.profile, context.archetype),
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

Regras obrigatórias (respeite sempre):
- Responda EXCLUSIVAMENTE com JSON válido. Nunca use markdown, blocos de código ou comentários.
- Todo o texto gerado deve estar em português brasileiro.
- Cada referência deve trazer um nome real e buscável na Wikipedia, uma categoria precisa e um motivo conectando ao perfil.
- O campo "vibe_resumo" NUNCA pode exceder 10 palavras — conte antes de responder.
- Evite repetir pessoas/títulos dentro da mesma resposta e evite sugestões obscuras.
- Varie a categoria das referências (ex.: não três atores seguidos).
- As obras devem ser EXATAMENTE destes tipos: 1 série, 1 filme e 1 anime (uma de cada).

FUJA DE CLICHÊS (REGRA CRÍTICA):
Os seguintes nomes são os "default" que qualquer LLM escolhe quando o perfil
é vago — USE-OS APENAS se houver uma conexão muito específica com uma
resposta narrativa do usuário, e NUNCA mais de UM deles na mesma resposta:
  Immanuel Kant, Marie Curie, Albert Einstein, Friedrich Nietzsche,
  Leonardo da Vinci, Sigmund Freud, Carl Sagan, Stephen Hawking,
  William Shakespeare, Frida Kahlo, Vincent van Gogh, Steve Jobs,
  Elon Musk, Keanu Reeves, Hermione Granger, Sherlock Holmes.
Prefira sempre figuras um pouco menos óbvias mas ainda reconhecíveis
(ex.: em vez de Einstein, considere Richard Feynman, Lise Meitner,
Alan Turing, Barbara McClintock; em vez de Nietzsche, Hannah Arendt,
Simone de Beauvoir, Byung-Chul Han, Gaston Bachelard). Duas pessoas com
perfis BFI-2-S diferentes JAMAIS devem acabar com a mesma lista de
referências — se você sentir que o "óbvio" para aquele traço é Kant,
escolha outro filósofo.`;
}

const INTERPRETATIVE_CATEGORY_LABELS = {
  moral_dilemma: 'Dilemas morais',
  paradoxical: 'Paradoxos',
  interest: 'Interesses manifestados',
};

function isPlainSignalString(signal) {
  return typeof signal === 'string';
}

function groupInterpretativeSignals(signals) {
  const groups = new Map();

  for (const signal of signals || []) {
    if (isPlainSignalString(signal)) {
      if (!signal.trim()) continue;
      const list = groups.get('interest') || [];
      list.push({ question_text: null, alternative_text: signal.trim(), user_observation: null });
      groups.set('interest', list);
      continue;
    }

    if (!signal || typeof signal !== 'object') continue;
    const slug = signal.category_slug || 'interest';
    const list = groups.get(slug) || [];
    list.push({
      question_text: sanitizeString(signal.question_text) || null,
      alternative_text: sanitizeString(signal.alternative_text) || null,
      user_observation: sanitizeString(signal.user_observation) || null,
    });
    groups.set(slug, list);
  }

  return groups;
}

function formatInterpretativeBlock(signals) {
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
        if (entry.user_observation) {
          lines.push(`  (comentário do usuário: "${entry.user_observation}")`);
        }
      } else if (entry.user_observation) {
        // Reflexão livre: a "voz" da resposta é a própria observação.
        lines.push(`- ${qPreview}(reflexão do usuário)`);
        lines.push(`  "${entry.user_observation}"`);
      } else {
        lines.push(`- ${qPreview}(sem resposta registrada)`);
      }
    }

    lines.push('');
  }

  return lines.join('\n').trim();
}

function buildUserPrompt(profile, consistency, interpretativeSignals, archetype, options = {}) {
  const dimensionLines = DIMENSIONS.map(dim => {
    const score = profile.scores[dim.key];
    const level = profile.dimensions.find(d => d.key === dim.key)?.level || 'moderado';
    return `- ${dim.name} (${dim.key}): ${score}% — ${level}`;
  }).join('\n');

  let tensionsBlock = '';
  if (consistency) {
    const tensions = Object.entries(consistency)
      .filter(([, val]) => val.tension)
      .map(([key, val]) => {
        const dim = DIMENSIONS.find(d => d.key === key);
        return `- ${dim?.name || key} (desvio: ${val.stddev}) — respostas oscilaram entre extremos.`;
      });

    tensionsBlock = tensions.length > 0
      ? `Tensões internas detectadas (desvio-padrão por eixo > 1.2):\n${tensions.join('\n')}`
      : 'Sem tensões internas relevantes — respostas coerentes dentro de cada eixo.';
  }

  const interpretativeBlock = formatInterpretativeBlock(interpretativeSignals);

  const archetypeBlock = archetype?.name
    ? `${archetype.name}${archetype.universe ? ` (universo ${archetype.universe})` : ''}${
        archetype.distance !== undefined ? ` — distância euclidiana ${Number(archetype.distance).toFixed(2)}` : ''
      }.`
    : 'Nenhum arquétipo identificado — calibre o tom livremente.';

  const excludedReferenceNames = normalizeStringList(options.excludedReferenceNames);
  const excludedWorkTitles = normalizeStringList(options.excludedWorkTitles);
  const exclusionLines = [];
  if (excludedReferenceNames.length > 0) {
    exclusionLines.push(`NÃO repita nenhuma destas referências já usadas: ${excludedReferenceNames.join(', ')}.`);
    exclusionLines.push('Prefira categorias diferentes das referências anteriores (ex.: se antes veio um ator, tente cientista, escritor ou personagem de ficção).');
  }
  if (excludedWorkTitles.length > 0) {
    exclusionLines.push(`NÃO repita nenhuma destas obras já usadas: ${excludedWorkTitles.join(', ')}.`);
  }
  const exclusionBlock = exclusionLines.length > 0
    ? `\n========================================\n[EXCLUSÕES]\n========================================\n${exclusionLines.join('\n')}\n`
    : '';

  return `Você está interpretando o perfil de um usuário que respondeu um questionário
dual-core (camada objetiva validada + camada interpretativa narrativa).

========================================
[1] PERFIL BIG FIVE — QUANTITATIVO
(Calculado a partir de 30 itens BFI-2-S — Soto & John, 2017)
========================================
${dimensionLines}

${tensionsBlock}

========================================
[2] RESPOSTAS INTERPRETATIVAS — QUALITATIVO
(Autorais; NÃO influenciam o cálculo. Servem apenas como contexto narrativo.)
========================================
${interpretativeBlock}

========================================
[3] ARQUÉTIPO ESTATÍSTICO MAIS PRÓXIMO
========================================
${archetypeBlock}
${exclusionBlock}
========================================
TAREFA
========================================
Cruze os números do bloco [1] com as escolhas narrativas do bloco [2].
Dentro de "interpretacao", destaque CONVERGÊNCIAS (onde dilemas/paradoxos
reforçam os escores) e, se existirem, DIVERGÊNCIAS (onde respostas
qualitativas contradizem o que os números sozinhos sugeririam). Se não
houver divergência real, diga isso em vez de forçar uma.
Cite ao menos uma resposta específica do usuário (entre aspas, máx 20 palavras)
para ancorar a análise. Use o arquétipo [3] apenas como calibrador de tom,
sem transformá-lo em rótulo principal.

Gere EXATAMENTE 3 referências culturais com CATEGORIAS DIFERENTES entre si.
Gere EXATAMENTE 3 obras (1 série, 1 filme, 1 anime), todas reconhecíveis no
zeitgeist contemporâneo. Não repita pessoas nem títulos dentro da mesma resposta.

Diversificação obrigatória — MUITO IMPORTANTE:
- Cada referência deve iluminar um ÂNGULO DIFERENTE do perfil (ex.: uma foca
  em um traço específico do Big Five, outra em um dilema moral citado, outra
  em um interesse ou paradoxo). NÃO descreva as três sob o mesmo prisma.
- Cada "motivo" deve usar um léxico distinto — evite repetir as mesmas
  palavras-chave (ex.: "intensidade", "visão", "ambição") em mais de uma
  referência. Se usar uma, troque nas outras.
- Varie também o foco das obras: cada obra deve ressoar com uma faceta
  distinta (uma pode refletir traço dominante, outra uma tensão interna,
  outra um interesse revelado nas respostas narrativas).

Retorne JSON com esta estrutura exata:
{
  "schema_version": "${INTERPRETATION_SCHEMA_VERSION}",
  "vibe_resumo": "Frase de impacto resumindo a energia da pessoa (OBRIGATÓRIO: no máximo 10 palavras)",
  "referencias": [
    { "categoria": "Tipo", "nome": "Nome Real", "motivo": "1 frase curta conectando aos traços", "wiki_query": "Nome_Wikipedia" },
    { "categoria": "Tipo", "nome": "...", "motivo": "...", "wiki_query": "..." },
    { "categoria": "Tipo", "nome": "...", "motivo": "...", "wiki_query": "..." }
  ],
  "obras_culturais": [
    { "tipo": "serie", "titulo": "Título da série", "autor_ou_artista": "Criador(a) ou showrunner", "motivo": "1 frase conectando ao perfil" },
    { "tipo": "filme", "titulo": "Título do filme", "autor_ou_artista": "Diretor(a)", "motivo": "1 frase conectando ao perfil" },
    { "tipo": "anime", "titulo": "Título do anime", "autor_ou_artista": "Autor(a) ou estúdio", "motivo": "1 frase conectando ao perfil" }
  ],
  "interpretacao": "Parágrafo de até 4 frases integrando números do bloco [1] e escolhas narrativas do bloco [2], citando ao menos uma convergência e, se houver, uma divergência."
}`;
}

function buildDetailSystemInstruction() {
  return `Você é um analista de personalidade especializado em Big Five e em
referências culturais amplas (figuras históricas, artistas, pensadores,
cientistas e personagens de ficção). Compare o perfil psicológico do usuário
com uma personalidade específica, sendo honesto sobre semelhanças E tensões.
Responda EXCLUSIVAMENTE com JSON válido em português brasileiro.
O texto deve ser claro, específico e ancorado nas respostas reais do usuário.`;
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

  const dimensionLines = DIMENSIONS.map(dim => {
    const score = profile.scores[dim.key];
    const level = profile.dimensions.find(d => d.key === dim.key)?.level || 'moderado';
    return `- ${dim.name} (${dim.key}): ${score}% — ${level}`;
  }).join('\n');

  const interpretativeContext = formatInterpretativeBlock(interpretativeSignals);

  let tensionsBlock = '';
  if (consistency) {
    const tensions = Object.entries(consistency)
      .filter(([, val]) => val.tension)
      .map(([key, val]) => {
        const dim = DIMENSIONS.find(d => d.key === key);
        return `- ${dim?.name || key} (desvio: ${val.stddev}) — oscilação entre extremos dentro do eixo.`;
      });

    tensionsBlock = tensions.length > 0
      ? `Tensões internas detectadas (desvio-padrão por eixo > 1.2):\n${tensions.join('\n')}`
      : 'Sem tensões internas relevantes — respostas coerentes dentro de cada eixo.';
  }

  const archetypeBlock = archetype?.name
    ? `${archetype.name}${archetype.universe ? ` (universo ${archetype.universe})` : ''}${
        archetype.distance !== undefined ? ` — distância euclidiana ${Number(archetype.distance).toFixed(2)}` : ''
      }.`
    : 'Nenhum arquétipo identificado — calibre o tom livremente.';

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
Construa uma comparação honesta entre o usuário e ${referenceName}. Destaque
tanto CONVERGÊNCIAS (onde perfil + respostas se alinham com a referência)
quanto DIVERGÊNCIAS / pontos de tensão (quando houver — não force semelhança
artificial). Cite ao menos uma resposta específica do usuário entre aspas
(máx 20 palavras) para ancorar a análise.

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
  "titulo": "Usuário x ${referenceName}",
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
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('No JSON object found in LLM response');
  }

  return text
    .slice(firstBrace, lastBrace + 1)
    .replace(/^[`\s]+|[`]+$/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1');
}

function parseStructuredJson(text) {
  const directCandidate = text.trim();

  try {
    return JSON.parse(directCandidate);
  } catch {
    const recoveredCandidate = extractJsonCandidate(text);
    return JSON.parse(recoveredCandidate);
  }
}

function parseResponse(text, context = {}) {
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

  parsed.referencias = normalizeReferences(parsed.referencias, context);
  parsed.obras_culturais = normalizeWorks(parsed.obras_culturais, context);

  return parsed;
}

function parseReferenceDetailResponse(text, referenceName) {
  const parsed = parseStructuredJson(text);

  const fallbackTitle = referenceName ? `Usuário x ${referenceName}` : 'Comparação detalhada';
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT);

  try {
    return await Promise.race([
      model.generateContent(prompt, { signal: controller.signal }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('LLM timeout reached')), LLM_TIMEOUT)
      ),
    ]);
  } finally {
    clearTimeout(timeout);
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

  const banner = '─'.repeat(72);
  console.log(`\n${banner}`);
  console.log(`[LLM PROMPT] ${label} · model=${MODEL_NAME} · temp=${temperature}`);
  console.log(banner);
  console.log('--- system_instruction ---');
  console.log(systemInstruction);
  console.log('--- user_prompt ---');
  console.log(prompt);
  console.log(`${banner}\n`);
}

async function generateStructuredOutput({
  systemInstruction,
  prompt,
  temperature = 0.9,
  parser,
  parseContext = {},
  errorLabel,
}) {
  const client = getClient();
  if (!client) {
    logger.info(`${errorLabel} skipped: GEMINI_API_KEY not configured`);
    return null;
  }

  const budget = checkDailyBudget();
  if (!budget.allowed) {
    logger.info(`${errorLabel} skipped: daily limit reached (${budget.used}/${budget.limit})`);
    return null;
  }

  try {
    const model = client.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction,
      generationConfig: {
        temperature,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
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

    recordLLMCall();
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
 * @param {Object} options - { temperature?: number, excludedReferenceNames?: string[], excludedWorkTitles?: string[] }
 * @returns {Promise<Object|null>} { schema_version, vibe_resumo, referencias[], obras_culturais[], interpretacao } or null
 */
export async function generateInterpretation(profile, consistency, interpretativeSignals, archetype, options = {}) {
  const prompt = buildUserPrompt(profile, consistency, interpretativeSignals, archetype, options);
  const interpretation = await generateStructuredOutput({
    systemInstruction: buildSystemInstruction(),
    prompt,
    temperature: options.temperature || 0.9,
    parser: parseResponse,
    parseContext: {
      profile,
      archetype,
      excludedReferenceNames: options.excludedReferenceNames,
      excludedWorkTitles: options.excludedWorkTitles,
    },
    errorLabel: 'LLM interpretation',
  });

  if (!interpretation) return null;
  interpretation.referencias = await fetchReferenceImages(interpretation.referencias);
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
