const API_URL = process.env.NEXT_PUBLIC_API_URL;

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

export async function submitAnswer(sessionId, questionId, alternativeId) {
  return request('/answer', {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      question_id: questionId,
      alternative_id: alternativeId,
    }),
  });
}

export async function analyzeSession(sessionId) {
  return request('/analyze', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  });
}
