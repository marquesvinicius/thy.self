'use client';

/**
 * Marca o ritual de passagem entre a etapa BFI-2-S (quantitativa) e a etapa
 * narrativa (interpretativa). Aparece UMA ÚNICA vez por sessão, na primeira
 * vez em que o backend começa a servir perguntas de `kind === 'interpretative'`
 * (o que acontece automaticamente assim que todas as 30 BFI-2-S foram
 * respondidas — ver `backend/src/services/question.service.js`).
 *
 * A escolha é deliberada: perguntas interpretativas NÃO influenciam o cálculo
 * OCEAN, só entram como contexto qualitativo para o LLM. Se o usuário sair
 * agora, o perfil quantitativo já é válido. Queremos que ele saiba disso, e
 * também entenda que o que vem a seguir é de outra natureza (texto, escolhas
 * simbólicas) e exige um segundo tipo de engajamento.
 */
export default function StageTransition({ onContinue }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm animate-fade-in text-foreground p-6">
      <div className="max-w-xl w-full bg-background border border-foreground/40 p-10 shadow-[0_0_60px_rgba(255,255,255,0.06)] relative space-y-6">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted">
          etapa 1 concluída
        </p>

        <h3 className="text-2xl md:text-3xl font-bold leading-tight tracking-tight">
          você terminou a parte quantitativa.
        </h3>

        <div className="space-y-4 text-sm text-muted leading-relaxed">
          <p>
            as 30 perguntas do BFI-2-S já desenharam o traçado dos seus
            cinco grandes eixos. este resultado é válido por si só — você
            pode sair agora e ele estará lá.
          </p>
          <p>
            a partir daqui começa a <span className="text-foreground">parte narrativa</span>:
            dilemas, paradoxos e pequenas reflexões livres. nada disso mexe
            nos seus scores OCEAN — essas respostas entram como contexto
            qualitativo na sua interpretação, ajudando a dar textura ao que
            os números dizem.
          </p>
          <p className="text-foreground/80">
            responda com o que vier primeiro, sem ensaiar.
          </p>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-foreground/10">
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.3em] text-muted">
            <span>etapa 2 de 2</span>
            <span className="text-muted/50">·</span>
            <span>autodescoberta narrativa</span>
          </div>
          <button
            onClick={onContinue}
            className="border border-foreground px-8 py-3 text-xs uppercase tracking-[0.3em] hover:bg-foreground hover:text-background transition-all"
          >
            continuar
          </button>
        </div>
      </div>
    </div>
  );
}
