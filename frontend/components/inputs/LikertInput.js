'use client';

import { useMemo } from 'react';

/**
 * LikertInput — 5-point Likert scale for BFI-2-S objective items.
 *
 * UX decisions (Dual-Core, pós-teste de usabilidade):
 *   1. Cada círculo é acompanhado de um rótulo visível ("Discordo totalmente",
 *      "Discordo", "Neutro", "Concordo", "Concordo totalmente") para que o
 *      significado nunca seja inferido.
 *   2. O clique COMMITA a resposta imediatamente (sem botão "confirmar"
 *      intermediário). Para corrigir respostas erradas, o usuário usa o
 *      botão "voltar" exposto na página do quiz, que desfaz a última
 *      resposta e re-exibe a pergunta.
 *
 * Payload submetido upstream: `{ alternative_id, answer_type: 'alternative_id' }`.
 */
export default function LikertInput({ question, currentValue, onSelect, disabled = false }) {
  const alternatives = useMemo(() => {
    const list = Array.isArray(question?.alternatives) ? [...question.alternatives] : [];
    list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return list;
  }, [question]);

  const externalSelectedId = currentValue?.alternative_id ?? currentValue ?? null;

  function commit(altId) {
    if (disabled || altId == null) return;
    onSelect({ alternative_id: altId, answer_type: 'alternative_id' });
  }

  if (alternatives.length !== 5) {
    return (
      <div className="grid grid-cols-1 gap-2 w-full">
        {alternatives.map((alt) => (
          <button
            key={alt.id}
            type="button"
            disabled={disabled}
            onClick={() => commit(alt.id)}
            className={`border px-4 py-2 text-sm transition ${
              externalSelectedId === alt.id ? 'bg-foreground text-background border-foreground' : 'border-border'
            }`}
          >
            {alt.text}
          </button>
        ))}
      </div>
    );
  }

  const [strongDisagree, disagree, neutral, agree, strongAgree] = alternatives;
  const orderedPairs = [
    { alt: strongDisagree, size: 'lg', tone: 'negative', label: 'Discordo totalmente' },
    { alt: disagree,       size: 'md', tone: 'negative', label: 'Discordo' },
    { alt: neutral,        size: 'sm', tone: 'neutral',  label: 'Neutro' },
    { alt: agree,          size: 'md', tone: 'positive', label: 'Concordo' },
    { alt: strongAgree,    size: 'lg', tone: 'positive', label: 'Concordo totalmente' },
  ];

  return (
    <div className="w-full max-w-xl mx-auto space-y-5">
      <div className="flex justify-between text-[10px] uppercase tracking-[0.25em] text-muted px-1">
        <span>Discordo</span>
        <span>Concordo</span>
      </div>

      <div className="flex items-start justify-between gap-2 md:gap-4">
        {orderedPairs.map(({ alt, size, tone, label }) => {
          const isSelected = externalSelectedId === alt.id;
          const sizeMap = {
            lg: 'h-14 w-14 md:h-16 md:w-16',
            md: 'h-11 w-11 md:h-12 md:w-12',
            sm: 'h-8 w-8 md:h-10 md:w-10',
          };
          const toneRing =
            tone === 'negative'
              ? 'hover:border-foreground/70'
              : tone === 'positive'
                ? 'hover:border-foreground/70'
                : 'hover:border-foreground/40';

          return (
            <div key={alt.id} className="flex flex-col items-center gap-2 flex-1 min-w-0">
              <button
                type="button"
                aria-label={label}
                aria-pressed={isSelected}
                title={label}
                disabled={disabled}
                onClick={() => commit(alt.id)}
                className={`rounded-full border transition-all duration-200 flex items-center justify-center ${sizeMap[size]} ${
                  isSelected
                    ? 'bg-foreground border-foreground shadow-[0_0_18px_rgba(255,255,255,0.25)]'
                    : `border-border ${toneRing}`
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              />
              <span
                className={`text-[9px] md:text-[10px] uppercase tracking-[0.12em] text-center leading-tight max-w-[72px] md:max-w-[84px] transition-colors ${
                  isSelected ? 'text-foreground' : 'text-muted'
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-center text-[10px] uppercase tracking-[0.22em] text-muted/70 pt-1">
        toque em um círculo para confirmar
      </p>
    </div>
  );
}
