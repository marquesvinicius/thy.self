'use client';

import { NARRATIVE_SHORT_COUNT } from '@/lib/narrativeMode';

/**
 * Tela de decisão entre os dois atos do quiz. Aparece UMA vez por sessão,
 * quando o backend começa a servir perguntas de `kind === 'interpretative'`
 * (ou seja: as 30 BFI-2-S já foram todas respondidas).
 *
 * Não é um aviso — é uma bifurcação real. As perguntas narrativas NÃO entram
 * no cálculo OCEAN (arquitetura dual-core), então prosseguir é uma ESCOLHA:
 *
 *   encerrar  → resultado só com a camada objetiva (perfil já é válido)
 *   curta     → teto de NARRATIVE_SHORT_COUNT narrativas
 *   completa  → todas as narrativas do catálogo
 *
 * `onPause` é secundário: sai para a landing preservando o marcador de sessão
 * ativa, de modo que o banner "continuar de onde parei" retoma o fluxo.
 */
export default function StageTransition({
  onAnalyze,
  onChoose,
  onPause,
  narrativeTotal = null,
}) {
  const fullCount = Number.isFinite(Number(narrativeTotal)) && Number(narrativeTotal) > 0
    ? Number(narrativeTotal)
    : null;

  // Estimativas em minutos a ~25s por pergunta narrativa (mesma baseline do
  // indicador de tempo restante no quiz).
  const shortMinutes = Math.max(1, Math.round((NARRATIVE_SHORT_COUNT * 25) / 60));
  const fullMinutes = fullCount ? Math.max(1, Math.round((fullCount * 25) / 60)) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm animate-fade-in text-foreground p-4 md:p-6 overflow-y-auto">
      <div className="max-w-xl w-full bg-background border-2 border-foreground/60 p-6 md:p-10 shadow-[0_0_60px_rgba(255,255,255,0.06)] relative space-y-6 my-auto">
        <div className="absolute -top-3 left-6 px-3 bg-background">
          <p className="text-[10px] uppercase tracking-[0.4em] text-foreground font-bold">
            parte 1 concluída
          </p>
        </div>

        <h3 className="text-2xl md:text-3xl font-bold leading-tight tracking-tight pt-2">
          seus cinco eixos já podem ser calculados.
        </h3>

        <div className="space-y-2 text-[13px] text-muted leading-relaxed">
          <p className="text-foreground/80 text-[11px] uppercase tracking-[0.2em]">
            com as 30 respostas, já estão garantidos:
          </p>
          <ul className="space-y-1.5">
            <li>✓ perfil OCEAN completo</li>
            <li>✓ arquétipo estatístico</li>
            <li>✓ referências culturais e interpretação da IA</li>
          </ul>
        </div>

        <div className="border-t border-border pt-5 text-[13px] text-muted leading-relaxed">
          <p>
            a <span className="text-foreground">parte 2</span> é narrativa e não
            altera nenhum escore. o que ela adiciona: dilemas, paradoxos e
            palavras <em>suas</em> — material que a IA cita literalmente na
            interpretação. sem ela, a leitura sai dos números; com ela, sai de você.
          </p>
        </div>

        <div className="space-y-3 pt-1">
          <button
            onClick={() => onChoose?.('short')}
            className="w-full border border-foreground px-6 py-4 text-left transition-all hover:bg-foreground hover:text-background group"
          >
            <span className="block text-xs uppercase tracking-[0.3em]">
              versão curta
            </span>
            <span className="block text-[11px] text-muted group-hover:text-background/70 mt-1 normal-case tracking-normal">
              {NARRATIVE_SHORT_COUNT} perguntas · ~{shortMinutes} min — as mais reveladoras
            </span>
          </button>

          <button
            onClick={() => onChoose?.('full')}
            className="w-full border border-border px-6 py-4 text-left transition-all hover:border-foreground group"
          >
            <span className="block text-xs uppercase tracking-[0.3em]">
              versão completa
            </span>
            <span className="block text-[11px] text-muted mt-1 normal-case tracking-normal">
              {fullCount ? `${fullCount} perguntas · ~${fullMinutes} min` : 'todas as perguntas narrativas'}
              {' '}— leitura mais densa
            </span>
          </button>

          <button
            onClick={onAnalyze}
            className="w-full border border-border px-6 py-3 text-[11px] uppercase tracking-[0.25em] text-muted hover:text-foreground hover:border-foreground transition-all"
          >
            encerrar agora — ver meu resultado
          </button>

          {typeof onPause === 'function' && (
            <div className="text-center pt-1">
              <button
                onClick={onPause}
                className="text-[10px] uppercase tracking-[0.25em] text-muted/70 hover:text-foreground transition-colors underline underline-offset-4"
              >
                pausar — continuo depois
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
