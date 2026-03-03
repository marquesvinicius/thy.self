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
const INTERPRETATION_SCHEMA_VERSION = '1.1.0';

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
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function buildSystemInstruction() {
  return `Você é um analista comportamental e especialista em cultura, história e ficção.
Analise o perfil Big Five de um usuário e gere paralelos culturais personalizados.
Responda EXCLUSIVAMENTE com JSON válido, sem markdown, sem blocos de código, sem explicações extras.
Todas as respostas devem ser em português brasileiro.
Cada referência deve incluir o nome real (buscável na Wikipedia) e a categoria da referência.
As categorias devem ser DIVERSAS entre si — não repita o mesmo tipo (ex: não coloque dois músicos).
Priorize referências que o usuário reconheceria com base nos seus interesses declarados.
Inclua também recomendações de obras culturais reais (filme, livro e música), sempre uma de cada tipo.`;
}

function buildUserPrompt(profile, consistency, interestSignals, archetype) {
  const dimensionLines = DIMENSIONS.map(dim => {
    const score = profile.scores[dim.key];
    const level = profile.dimensions.find(d => d.key === dim.key)?.level || 'moderado';
    return `- ${dim.name} (${dim.key}): ${score}% — ${level}`;
  }).join('\n');

  let consistencyContext = '';
  if (consistency) {
    const tensions = Object.entries(consistency)
      .filter(([, val]) => val.tension)
      .map(([key, val]) => {
        const dim = DIMENSIONS.find(d => d.key === key);
        return `${dim?.name || key} (desvio: ${val.stddev})`;
      });

    if (tensions.length > 0) {
      consistencyContext = `\nAtenção: O usuário demonstrou tensão interna (respostas contraditórias) nos seguintes eixos: ${tensions.join(', ')}.
Isso sugere identidade em conflito nesses aspectos — não confunda com equilíbrio.
Mencione essa dualidade na interpretação.\n`;
    }
  }

  let interestContext = 'Nenhum interesse específico identificado.';
  if (interestSignals && interestSignals.length > 0) {
    interestContext = interestSignals.map(s => `- ${s}`).join('\n');
  }

  let archetypeContext = '';
  if (archetype) {
    archetypeContext = `\nBaseado na comparação de distância estatística (Euclidiana) do teste Big Five, a persona histórico-cultural/ficcional que esse usuário mais se aproxima é: **${archetype.name}**, do universo **${archetype.universe}**. 
Use essa informação vital para moldar a poesia e o tom da interpretação. O modelo mental ou a 'vibe' do usuário é muito similar ao de ${archetype.name}.`;
  }

  return `Perfil Big Five do usuário:
${dimensionLines}
${consistencyContext}
Interesses identificados do usuário:
${interestContext}
${archetypeContext}

Gere EXATAMENTE 3 referências culturais variadas e relevantes aos interesses acima e a semelhança estatística com ${archetype ? archetype.name : 'o perfil'}.
As categorias devem ser DIVERSAS (não repetir o mesmo tipo).
Exemplos de categorias: Músico, Cientista, Personagem, Ator, Líder Histórico.

Retorne JSON com esta estrutura exata:
{
  "schema_version": "${INTERPRETATION_SCHEMA_VERSION}",
  "vibe_resumo": "Frase de impacto (máx 10 palavras) resumindo a energia da pessoa",
  "referencias": [
    { "categoria": "Tipo", "nome": "Nome Real", "motivo": "1 frase curta conectando aos traços", "wiki_query": "Nome_Wikipedia" },
    { "categoria": "Tipo", "nome": "...", "motivo": "...", "wiki_query": "..." },
    { "categoria": "Tipo", "nome": "...", "motivo": "...", "wiki_query": "..." }
  ],
  "obras_culturais": [
    { "tipo": "filme", "titulo": "Título da obra", "autor_ou_artista": "Diretor ou elenco principal", "motivo": "1 frase conectando ao perfil" },
    { "tipo": "livro", "titulo": "Título da obra", "autor_ou_artista": "Autor(a)", "motivo": "1 frase conectando ao perfil" },
    { "tipo": "musica", "titulo": "Título da música", "autor_ou_artista": "Artista/Banda", "motivo": "1 frase conectando ao perfil" }
  ],
  "interpretacao": "Parágrafo de até 3 frases interpretando o perfil de forma poética"
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

function parseResponse(text) {
  let parsed;
  const directCandidate = text.trim();

  try {
    parsed = JSON.parse(directCandidate);
  } catch {
    const recoveredCandidate = extractJsonCandidate(text);
    parsed = JSON.parse(recoveredCandidate);
  }

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

  for (const ref of parsed.referencias) {
    if (!ref.categoria || !ref.nome || !ref.motivo) {
      throw new Error('Invalid reference: missing required fields');
    }
    if (!ref.wiki_query) {
      ref.wiki_query = ref.nome;
    }
  }

  parsed.obras_culturais = parsed.obras_culturais
    .filter(work => work && typeof work === 'object')
    .map(work => ({
      tipo: typeof work.tipo === 'string' ? normalizeToken(work.tipo) : '',
      titulo: typeof work.titulo === 'string' ? work.titulo.trim() : '',
      autor_ou_artista: typeof work.autor_ou_artista === 'string'
        ? work.autor_ou_artista.trim()
        : '',
      motivo: typeof work.motivo === 'string' ? work.motivo.trim() : '',
    }));

  if (parsed.obras_culturais.some(work => !work.tipo || !work.titulo || !work.motivo)) {
    throw new Error('Invalid obras_culturais item: missing required fields');
  }

  const requiredWorkTypes = ['filme', 'livro', 'musica'];
  const receivedTypes = new Set(parsed.obras_culturais.map(work => work.tipo));
  const missingType = requiredWorkTypes.find(type => !receivedTypes.has(type));
  if (missingType) {
    throw new Error(`Missing cultural work type: ${missingType}`);
  }

  return parsed;
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
 * Generates a narrative interpretation using Gemini.
 * Returns null gracefully on any failure (missing key, timeout, parse error).
 *
 * @param {Object} profile - From calculateProfile(): { scores, dimensions, ... }
 * @param {Object} consistency - From calculateConsistency(): { O: {stddev, tension}, ... }
 * @param {Array<string>} interestSignals - Texts of chosen interest alternatives
 * @param {Object} archetype - From findClosestArchetype(): { name, universe, distance }
 * @param {Object} options - { temperature?: number }
 * @returns {Promise<Object|null>} { schema_version, vibe_resumo, referencias[], obras_culturais[], interpretacao } or null
 */
export async function generateInterpretation(profile, consistency, interestSignals, archetype, options = {}) {
  const client = getClient();
  if (!client) {
    logger.info('LLM skipped: GEMINI_API_KEY not configured');
    return null;
  }

  const budget = checkDailyBudget();
  if (!budget.allowed) {
    logger.info(`LLM skipped: daily limit reached (${budget.used}/${budget.limit})`);
    return null;
  }

  try {
    const model = client.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: buildSystemInstruction(),
      generationConfig: {
        temperature: options.temperature || 0.9,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    });

    const prompt = buildUserPrompt(profile, consistency, interestSignals, archetype);
    const text = await generateRawInterpretation(model, prompt);

    let interpretation;
    try {
      interpretation = parseResponse(text);
    } catch (parseErr) {
      logger.error('LLM parse failed', {
        error: parseErr.message,
        raw_preview: text.slice(0, 500),
      });
      throw parseErr;
    }

    recordLLMCall();
    interpretation.referencias = await fetchReferenceImages(interpretation.referencias);
    return interpretation;
  } catch (err) {
    logger.error('LLM interpretation failed (graceful skip)', {
      error: err.message,
      name: err.name,
      model: MODEL_NAME,
    });
    return null;
  }
}
