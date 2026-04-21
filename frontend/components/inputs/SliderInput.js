'use client';

import { useState } from 'react';

const SCALE_LABELS = [
  'discordo totalmente',
  'discordo',
  'neutro',
  'concordo',
  'concordo totalmente',
];

const VALUES = [0, 25, 50, 75, 100];

/**
 * SliderInput — escala de concordância 5-pontos (0/25/50/75/100).
 *
 * Pós teste de usabilidade, o controle foi trocado por 5 ancores discretas:
 * cada toque commita imediatamente o valor correspondente. Sem botão
 * "confirmar" — se o usuário errar, ele usa "voltar" na página do quiz.
 */
export default function SliderInput(props) {
  const {
    onSelect,
    disabled = false,
    isSubmitting = false,
    submitting = false,
  } = props;

  const [activeIndex, setActiveIndex] = useState(null);
  const busy = disabled || isSubmitting || submitting;

  function commit(index) {
    if (busy) return;
    setActiveIndex(index);
    const payload = {
      alternative_id: null,
      slider_value: VALUES[index],
      text_value: null,
    };
    if (typeof onSelect === 'function') onSelect(payload);
  }

  const sizeMap = ['lg', 'md', 'sm', 'md', 'lg'];
  const sizeClasses = {
    lg: 'h-14 w-14 md:h-16 md:w-16',
    md: 'h-11 w-11 md:h-12 md:w-12',
    sm: 'h-8 w-8 md:h-10 md:w-10',
  };

  return (
    <div className="w-full max-w-[620px] mx-auto space-y-6">
      <div className="flex justify-between text-[10px] uppercase tracking-[0.25em] text-muted px-1">
        <span>Discordo</span>
        <span>Concordo</span>
      </div>

      <div className="flex items-start justify-between gap-2 md:gap-4">
        {VALUES.map((_, index) => {
          const isSelected = activeIndex === index;
          return (
            <div key={index} className="flex flex-col items-center gap-2 flex-1 min-w-0">
              <button
                type="button"
                onClick={() => commit(index)}
                disabled={busy}
                aria-label={SCALE_LABELS[index]}
                title={SCALE_LABELS[index]}
                className={`rounded-full border transition-all duration-200 flex items-center justify-center ${sizeClasses[sizeMap[index]]} ${
                  isSelected
                    ? 'bg-foreground border-foreground shadow-[0_0_18px_rgba(255,255,255,0.25)]'
                    : 'border-border hover:border-foreground/60'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              />
              <span
                className={`text-[9px] md:text-[10px] uppercase tracking-[0.12em] text-center leading-tight max-w-[72px] md:max-w-[84px] transition-colors ${
                  isSelected ? 'text-foreground font-semibold' : 'text-muted'
                }`}
              >
                {SCALE_LABELS[index]}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-center text-[10px] uppercase tracking-[0.22em] text-muted/70">
        toque em um círculo para confirmar
      </p>
    </div>
  );
}
