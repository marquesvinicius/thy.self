'use client';

/**
 * RN010 — isenção de responsabilidade antes da revelação do perfil.
 * DERS §2.6.2 (a) + RN010: exibir na interface antes de revelar o resultado.
 */
export default function DisclaimerGate({ onAccept }) {
  return (
    <div className="w-full max-w-2xl mx-auto flex-1 flex flex-col justify-center py-8">
      <div className="relative border-2 border-foreground p-6 md:p-10 bg-surface/70">
        <div className="absolute -top-3 left-6 px-3 bg-background">
          <p className="text-[10px] uppercase tracking-[0.4em] text-foreground font-bold">
            antes de continuar
          </p>
        </div>

        <div className="space-y-5 pt-2">
          <h2 className="text-lg md:text-2xl font-bold tracking-tight leading-snug">
            este não é um diagnóstico.<br />
            <span className="text-muted">e nunca pretendeu ser.</span>
          </h2>

          <div className="space-y-3 text-sm md:text-base text-foreground/90 leading-relaxed">
            <p>
              o thy.self é uma <strong>ferramenta introdutória de reflexão</strong>.
              seus resultados <strong>não constituem diagnóstico clínico</strong>,
              parecer psicológico ou recomendação terapêutica — e não devem
              ser interpretados como tal em nenhum contexto.
            </p>
            <p>
              se algo aqui mobilizar você a ponto de querer entender melhor —{' '}
              <strong className="underline decoration-foreground/40 underline-offset-4">
                procure um profissional de saúde mental qualificado
              </strong>
              . nenhum algoritmo, por mais refinado, substitui uma escuta
              humana treinada.
            </p>
          </div>

          <div className="pt-4 border-t border-foreground/20 flex flex-wrap gap-x-6 gap-y-2 text-[10px] uppercase tracking-[0.25em] text-muted">
            <span>— não é diagnóstico</span>
            <span>— não é prescrição</span>
            <span>— uso reflexivo e educacional</span>
          </div>

          <div className="pt-6 flex justify-center">
            <button
              type="button"
              onClick={onAccept}
              className="border border-foreground px-10 py-3 text-[11px] uppercase tracking-[0.3em] hover:bg-foreground hover:text-background transition-all"
            >
              entendi — revelar meu perfil
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
