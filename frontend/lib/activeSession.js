// Marcador de sessão em andamento (localStorage) — sobrevive ao fechamento
// da aba, permitindo retomar o quiz de onde parou. `session_id` continua em
// sessionStorage como fonte da sessão corrente; este marcador alimenta o
// banner "continuar avaliação" da landing.
//
// Ciclo de vida:
//   set    → ao criar sessão nova (landing)
//   clear  → ao analisar (quiz→result), encerrar sessão ou descartar no banner

const ACTIVE_SESSION_KEY = 'thyself_active_session';
const LAST_RESULT_KEY = 'thyself_last_result_session';

// ── Pub/sub para useSyncExternalStore ──
// O marcador vive no localStorage (fora do React). Expor subscribe/snapshot
// permite ler o valor no render, sem `useEffect` + setState no mount — que
// dispara render em cascata (regra react-hooks/set-state-in-effect).
const listeners = new Set();

function emitChange() {
  for (const listener of listeners) listener();
}

/** Assina mudanças do marcador (inclui edições feitas em outra aba). */
export function subscribeActiveSession(onStoreChange) {
  listeners.add(onStoreChange);
  const onStorage = event => {
    if (!event.key || event.key === ACTIVE_SESSION_KEY || event.key === LAST_RESULT_KEY) onStoreChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Snapshot para useSyncExternalStore. Retorna string ou null (primitivo),
 * portanto é estável entre chamadas enquanto o storage não mudar.
 */
export function getActiveSessionSnapshot() {
  return readStore()?.sessionId || null;
}

/** Snapshot no servidor: nunca há sessão em andamento durante o SSR. */
export function getActiveSessionServerSnapshot() {
  return null;
}

/** Último resultado disponível para reabertura na landing. */
export function getLastResultSnapshot() {
  try {
    return localStorage.getItem(LAST_RESULT_KEY) || null;
  } catch {
    return null;
  }
}

function readStore() {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.sessionId) {
        return { sessionId: String(parsed.sessionId) };
      }
    } catch {
      // legado: valor era só o session_id em string
    }
    return { sessionId: raw };
  } catch {
    return null;
  }
}

function writeStore(entry) {
  try {
    if (!entry?.sessionId) {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      return;
    }
    localStorage.setItem(
      ACTIVE_SESSION_KEY,
      JSON.stringify({ sessionId: String(entry.sessionId) }),
    );
  } catch {} finally {
    emitChange();
  }
}

/** session_id da avaliação em andamento, ou null. */
export function getActiveSession() {
  return readStore()?.sessionId || null;
}

export function setActiveSession(sessionId) {
  writeStore({ sessionId });
}

export function clearActiveSession() {
  try {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {} finally {
    emitChange();
  }
}

export function setLastResultSession(sessionId) {
  try {
    if (sessionId) {
      localStorage.setItem(LAST_RESULT_KEY, String(sessionId));
    } else {
      localStorage.removeItem(LAST_RESULT_KEY);
    }
  } catch {} finally {
    emitChange();
  }
}

export function clearLastResultSession() {
  setLastResultSession(null);
}
