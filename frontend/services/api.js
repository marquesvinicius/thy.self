const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await res.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'Request failed');
  }

  return data.data;
}

export async function createSession(nickname) {
  return request('/session', {
    method: 'POST',
    body: JSON.stringify({ nickname }),
  });
}

export async function getQuestions(sessionId, count = 1) {
  return request(`/questions?session_id=${sessionId}&count=${count}`);
}

export async function submitAnswer(sessionId, questionId, payload) {
  let body = { session_id: sessionId, question_id: questionId };
  if (typeof payload === 'object' && payload !== null) {
    body = { ...body, ...payload };
  } else {
    body.alternative_id = payload; // legacy support
  }

  return request('/answer', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Desfaz a última resposta da sessão. Usado pelo botão "voltar" do quiz
 * após o teste de usabilidade ter pedido a possibilidade de corrigir
 * respostas marcadas por engano.
 */
export async function undoLastAnswer(sessionId) {
  return request('/answer/undo', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export async function analyzeSession(sessionId) {
  return request('/analyze', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  });
}

/**
 * Fetches a previously saved result (no new LLM call).
 * Used on page refresh to avoid re-triggering the LLM.
 */
export async function getResult(sessionId) {
  return request(`/result/${sessionId}`);
}

/**
 * Busca todas as respostas da sessão anotadas com contexto de revisão
 * (traço influenciado, contribuição Likert assinada, observações).
 * Usado pelo modal "revisar respostas" na tela de resultados.
 */
export async function getAnswerReview(sessionId) {
  return request(`/result/${sessionId}/review`);
}

/**
 * Re-generates LLM interpretation with new, distinct references.
 * Uses higher temperature for variety. Does not recalculate scores.
 */
export async function reinterpret(sessionId, options = {}) {
  const excludeReferenceNames = Array.isArray(options.excludeReferenceNames)
    ? options.excludeReferenceNames
    : [];
  const excludeWorkTitles = Array.isArray(options.excludeWorkTitles)
    ? options.excludeWorkTitles
    : [];

  return request('/interpret', {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      exclude_reference_names: excludeReferenceNames,
      exclude_work_titles: excludeWorkTitles,
    }),
  });
}

/**
 * Generates deeper personality comparison for one selected cultural reference.
 */
export async function interpretReferenceDetail(sessionId, reference) {
  return request('/interpret/reference-detail', {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      reference,
    }),
  });
}

/**
 * [DEV ONLY] Creates a session with random answers and runs full analysis.
 * Skips the quiz entirely — used for testing the result page.
 */
export async function quickAnalyze(answerCount = 25) {
  return request('/dev/quick-analyze', {
    method: 'POST',
    body: JSON.stringify({ answer_count: answerCount }),
  });
}

/**
 * Flips the saved result's publication flag. When enabled, the result
 * becomes readable via the public-token endpoint (and thus via /r/[token]
 * on the frontend). Pass `{ isPublic: false }` to revoke.
 *
 * Returns { session_id, share: { is_public, public_token, published_at } }.
 */
export async function shareResult(sessionId, { isPublic = true } = {}) {
  return request(`/result/${sessionId}/share`, {
    method: 'POST',
    body: JSON.stringify({ is_public: isPublic }),
  });
}

/**
 * Fetches a public (opt-in) result by its share token. Used by the
 * read-only /r/[token] page — does NOT require a session_id in storage.
 */
export async function getPublicResult(token) {
  return request(`/public/result/${token}`);
}
