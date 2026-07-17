// Marcador de sessão em andamento (localStorage) — sobrevive ao fechamento
// da aba, permitindo retomar o quiz de onde parou. `session_id` continua em
// sessionStorage como fonte da sessão corrente; este marcador só alimenta o
// banner "continuar avaliação" da landing.
//
// Ciclo de vida:
//   set    → ao criar sessão nova (landing)
//   clear  → ao analisar (quiz→result), encerrar sessão ou descartar no banner

const ACTIVE_SESSION_KEY = 'thyself_active_session';

export function getActiveSession() {
  try {
    return localStorage.getItem(ACTIVE_SESSION_KEY) || null;
  } catch {
    return null;
  }
}

export function setActiveSession(sessionId) {
  try {
    localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
  } catch {}
}

export function clearActiveSession() {
  try {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {}
}
