'use client';

/**
 * Ações da sessão (voltar · analisar · terminar sessão).
 *
 * Duas apresentações das mesmas ações:
 *   - `inline`: linha abaixo do progresso, só a partir de `md`.
 *   - `dock`: barra presa ao rodapé no celular. No topo, junto da barra de
 *     progresso, a linha de ações tirava a altura de que a pergunta
 *     precisava — com "analisar" visível, as opções da etapa narrativa
 *     ficavam espremidas. No rodapé ela também fica ao alcance do polegar.
 */
export default function QuizActions({
  variant = 'inline',
  onUndo,
  undoDisabled,
  undoing,
  canAnalyze,
  onAnalyze,
  onEndSession,
}) {
  const undoLabel = undoing ? 'voltando...' : 'voltar';

  if (variant === 'dock') {
    return (
      <nav
        aria-label="Ações da sessão"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/90 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 h-14 text-xs uppercase tracking-[0.08em] text-muted whitespace-nowrap">
          <button
            onClick={onUndo}
            disabled={undoDisabled}
            className="justify-self-start inline-flex items-center gap-2 min-h-11 pr-2 hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Desfazer a última resposta"
          >
            <span aria-hidden="true">←</span>
            {undoLabel}
          </button>

          {canAnalyze ? (
            <button
              onClick={onAnalyze}
              className="min-h-10 px-5 text-background tracking-[0.2em] bg-foreground border border-foreground active:opacity-80 transition-opacity"
            >
              analisar
            </button>
          ) : (
            <span aria-hidden="true" />
          )}

          <button
            onClick={onEndSession}
            className="justify-self-end min-h-11 pl-2 hover:text-foreground transition-colors"
          >
            terminar sessão
          </button>
        </div>
      </nav>
    );
  }

  return (
    <div className="hidden md:flex flex-wrap justify-between items-center gap-3 px-10 py-3 text-xs uppercase tracking-widest text-muted">
      <button
        onClick={onUndo}
        disabled={undoDisabled}
        className="inline-flex items-center gap-2 hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Desfazer a última resposta"
      >
        <span aria-hidden="true">←</span>
        {undoLabel}
      </button>
      <div className="flex flex-wrap items-center justify-end gap-6">
        {canAnalyze && (
          <button onClick={onAnalyze} className="text-foreground border border-foreground px-4 py-1 hover:bg-foreground hover:text-background transition-all">
            analisar
          </button>
        )}
        <button onClick={onEndSession} className="px-2 hover:text-foreground transition-colors">
          terminar sessão
        </button>
      </div>
    </div>
  );
}
