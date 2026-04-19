'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * LikertInput — 5-point Likert scale for BFI-2-S objective items.
 *
 * UX decisions (Dual-Core):
 *   1. Each circle is paired with a visible label ("Discordo totalmente",
 *      "Discordo", "Neutro", "Concordo", "Concordo totalmente"), so the
 *      meaning is never guessed.
 *   2. Clicking a circle only sets a local draft selection — the answer is
 *      NOT submitted until the user presses "confirmar". This keeps the
 *      same commit semantics as BinaryInput and gives the user a chance to
 *      reconsider before advancing.
 *
 * Payload submitted upstream: `{ alternative_id, answer_type: 'alternative_id' }`.
 */
export default function LikertInput({ question, currentValue, onSelect, disabled = false }) {
  const alternatives = useMemo(() => {
    const list = Array.isArray(question?.alternatives) ? [...question.alternatives] : [];
    list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return list;
  }, [question]);

  const externalSelectedId = currentValue?.alternative_id ?? currentValue ?? null;
  const [draftId, setDraftId] = useState(externalSelectedId);

  // If parent resets (e.g., new block), mirror that into the draft state.
  useEffect(() => {
    setDraftId(externalSelectedId);
  }, [externalSelectedId, question?.id]);

  function handleConfirm() {
    if (disabled || draftId == null) return;
    onSelect({ alternative_id: draftId, answer_type: 'alternative_id' });
  }

  if (alternatives.length !== 5) {
    return (
      <div className="grid grid-cols-1 gap-2 w-full">
        {alternatives.map((alt) => (
          <button
            key={alt.id}
            type="button"
            disabled={disabled}
            onClick={() => setDraftId(alt.id)}
            className={`border px-4 py-2 text-sm transition ${
              draftId === alt.id ? 'bg-foreground text-background border-foreground' : 'border-border'
            }`}
          >
            {alt.text}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled || draftId == null}
          onClick={handleConfirm}
          className="mt-4 border border-foreground px-8 py-3 text-xs uppercase tracking-[0.3em] transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-foreground hover:text-background"
        >
          confirmar
        </button>
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

  const selectedLabel = orderedPairs.find(p => p.alt.id === draftId)?.label;

  return (
    <div className="w-full max-w-xl mx-auto space-y-5">
      <div className="flex justify-between text-[10px] uppercase tracking-[0.25em] text-muted px-1">
        <span>Discordo</span>
        <span>Concordo</span>
      </div>

      <div className="flex items-start justify-between gap-2 md:gap-4">
        {orderedPairs.map(({ alt, size, tone, label }) => {
          const isSelected = draftId === alt.id;
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
                onClick={() => setDraftId(alt.id)}
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

      <div className="flex flex-col items-center gap-4 pt-2">
        <p className="text-xs text-muted min-h-[1.25rem] tracking-wide text-center">
          {selectedLabel
            ? <>Sua escolha: <span className="text-foreground">{selectedLabel}</span>. Clique em confirmar para prosseguir.</>
            : 'Escolha uma opção para continuar.'}
        </p>
        <button
          type="button"
          disabled={disabled || draftId == null}
          onClick={handleConfirm}
          className="min-w-[240px] border border-foreground px-8 py-3 text-xs uppercase tracking-[0.3em] transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-foreground hover:text-background"
        >
          confirmar
        </button>
      </div>
    </div>
  );
}
