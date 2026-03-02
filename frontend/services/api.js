const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

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
 * Re-generates LLM interpretation with new, distinct references.
 * Uses higher temperature for variety. Does not recalculate scores.
 */
export async function reinterpret(sessionId) {
  return request('/interpret', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
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
