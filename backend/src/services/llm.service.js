import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/environment.js';
import { DIMENSIONS } from '../engine/dimensions.js';
import { fetchReferenceImages } from './image.service.js';
import { checkDailyBudget, recordLLMCall } from './llm-limiter.js';
import { logger } from '../utils/logger.js';

const LLM_TIMEOUT = 60000; // 60s max for LLM call
const MODEL_NAME = 'gemini-2.5-flash-lite';

let genAI = null;

function getClient() {
  if (!env.geminiApiKey) return null;
  if (!genAI) {
    genAI = new GoogleGenerativeAI(env.geminiApiKey);
  }
  return genAI;
}

/**
 * Builds the system instruction for the Gemini model.
 */
function buildSystemInstruction() {
  return `Você é um analista comportamental e especialista em cultura, história e ficção.
Analise o perfil Big Five de um usuário e gere paralelos culturais personalizados.
Responda EXCLUSIVAMENTE com JSON válido, sem markdown, sem blocos de código, sem explicações extras.
Todas as respostas devem ser em português brasileiro.
Cada referência deve incluir o nome real (buscável na Wikipedia) e a categoria da referência.
As categorias devem ser DIVERSAS entre si — não repita o mesmo tipo (ex: não coloque dois músicos).
Priorize referências que o usuário reconheceria com base nos seus interesses declarados.`;
}

/**
 * Builds the user prompt with profile data, consistency, and interests.
 */
function buildUserPrompt(profile, consistency, interestSignals) {
  const dimensionLines = DIMENSIONS.map(dim => {
    const score = profile.scores[dim.key];
    const level = profile.dimensions.find(d => d.key === dim.key)?.level || 'moderado';
    return `- ${dim.name} (${dim.key}): ${score}% — ${level}`;
  }).join('\n');

  // Build consistency context
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

  // Build interest context
  let interestContext = 'Nenhum interesse específico identificado.';
  if (interestSignals && interestSignals.length > 0) {
    interestContext = interestSignals.map(s => `- ${s}`).join('\n');
  }

  // Build archetype context
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
  "vibe_resumo": "Frase de impacto (máx 10 palavras) resumindo a energia da pessoa",
  "referencias": [
    { "categoria": "Tipo", "nome": "Nome Real", "motivo": "1 frase curta conectando aos traços", "wiki_query": "Nome_Wikipedia" },
    { "categoria": "Tipo", "nome": "...", "motivo": "...", "wiki_query": "..." },
    { "categoria": "Tipo", "nome": "...", "motivo": "...", "wiki_query": "..." }
  ],
  "interpretacao": "Parágrafo de até 3 frases interpretando o perfil de forma poética"
}`;
}

/**
 * Parses and validates the LLM JSON response.
 */
function parseResponse(text) {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  const parsed = JSON.parse(cleaned);

  // Validate required fields
  if (!parsed.vibe_resumo || typeof parsed.vibe_resumo !== 'string') {
    throw new Error('Missing or invalid vibe_resumo');
  }
  if (!Array.isArray(parsed.referencias) || parsed.referencias.length === 0) {
    throw new Error('Missing or empty referencias array');
  }
  if (!parsed.interpretacao || typeof parsed.interpretacao !== 'string') {
    throw new Error('Missing or invalid interpretacao');
  }

  // Validate each reference
  for (const ref of parsed.referencias) {
    if (!ref.categoria || !ref.nome || !ref.motivo) {
      throw new Error('Invalid reference: missing required fields');
    }
    // Ensure wiki_query exists (fallback to nome)
    if (!ref.wiki_query) {
      ref.wiki_query = ref.nome;
    }
  }

  return parsed;
}

/**
 * Generates a narrative interpretation using Gemini 2.0 Flash.
 * Returns null gracefully on any failure (missing key, timeout, parse error).
 *
 * @param {Object} profile - From calculateProfile(): { scores, dimensions, ... }
 * @param {Object} consistency - From calculateConsistency(): { O: {stddev, tension}, ... }
 * @param {Array<string>} interestSignals - Texts of chosen interest alternatives
 * @param {Object} archetype - From findClosestArchetype(): { name, universe, distance }
 * @param {Object} options - { temperature?: number }
 * @returns {Promise<Object|null>} { vibe_resumo, referencias[], interpretacao } or null
 */
export async function generateInterpretation(profile, consistency, interestSignals, archetype, options = {}) {
  const client = getClient();
  if (!client) {
    logger.info('LLM skipped: GEMINI_API_KEY not configured');
    return null;
  }

  // Check daily budget before making the call
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

    // Call with timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT);

    const result = await model.generateContent(prompt);
    clearTimeout(timer);

    const text = result.response.text();
    logger.info('LLM raw response received', { length: text.length });

    // Parse and validate
    let interpretation;
    try {
      interpretation = parseResponse(text);
    } catch (parseErr) {
      logger.error('JSON parsing failed. Raw text was:', { rawText: text });
      throw parseErr;
    }

    // Record successful LLM call for rate limiting
    recordLLMCall();

    // Fetch images for all references
    interpretation.referencias = await fetchReferenceImages(interpretation.referencias);

    return interpretation;
  } catch (err) {
    logger.error('LLM interpretation failed (graceful skip)', {
      error: err.message,
      name: err.name,
    });
    return null;
  }
}
