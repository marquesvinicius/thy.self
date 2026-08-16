// Modo do ato narrativo (parte 2 do quiz), escolhido pelo usuário na tela de
// decisão que aparece ao terminar os 30 itens BFI-2-S.
//
//   'short' → teto de NARRATIVE_SHORT_COUNT perguntas interpretativas
//   'full'  → sem teto (vai até esgotar o catálogo)
//   null    → ainda não escolheu (tela de decisão não foi respondida)
//
// Persistido em localStorage para sobreviver ao "pausar — continuo depois"
// (que fecha a aba). Guardamos um único registro { sessionId, mode }: assim o
// storage não cresce a cada sessão e um id diferente invalida a escolha antiga.

const NARRATIVE_MODE_KEY = 'thyself_narrative_mode';

/** Quantas perguntas narrativas a versão curta serve. */
export const NARRATIVE_SHORT_COUNT = 8;

function readStore() {
  try {
    const raw = localStorage.getItem(NARRATIVE_MODE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.sessionId) return null;
    if (parsed.mode !== 'short' && parsed.mode !== 'full') return null;
    return { sessionId: String(parsed.sessionId), mode: parsed.mode };
  } catch {
    return null;
  }
}

/** Modo escolhido para esta sessão ('short' | 'full'), ou null. */
export function getNarrativeMode(sessionId) {
  const entry = readStore();
  if (!entry || !sessionId) return null;
  return String(entry.sessionId) === String(sessionId) ? entry.mode : null;
}

export function setNarrativeMode(sessionId, mode) {
  if (!sessionId || (mode !== 'short' && mode !== 'full')) return;
  try {
    localStorage.setItem(
      NARRATIVE_MODE_KEY,
      JSON.stringify({ sessionId: String(sessionId), mode }),
    );
  } catch {}
}

export function clearNarrativeMode() {
  try {
    localStorage.removeItem(NARRATIVE_MODE_KEY);
  } catch {}
}

/**
 * Teto a enviar ao backend (`narrative_limit`). `null` significa sem teto —
 * tanto na versão completa quanto antes da escolha (durante o ato objetivo,
 * o teto é irrelevante porque o picker prioriza as objetivas).
 */
export function narrativeLimitFor(sessionId) {
  return getNarrativeMode(sessionId) === 'short' ? NARRATIVE_SHORT_COUNT : null;
}
