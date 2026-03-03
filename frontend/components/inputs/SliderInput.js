'use client';

import { useMemo, useState } from 'react';

const SCALE_LABELS = [
  'discordo totalmente',
  'discordo',
  'neutro',
  'concordo',
  'concordo totalmente',
];

function getIndexFromValue(value) {
  return Math.round(value / 25);
}

export default function SliderInput(props) {
  const {
    onSelect,
    onSubmit,
    onConfirm,
    disabled = false,
    isSubmitting = false,
    submitting = false,
    initialValue = 50,
  } = props;

  const [value, setValue] = useState(initialValue);
  const activeIndex = useMemo(() => getIndexFromValue(value), [value]);
  const busy = disabled || isSubmitting || submitting;

  async function handleConfirm() {
    const payload = {
      alternative_id: null,
      slider_value: value,
      text_value: null,
    };

    if (typeof onSubmit === 'function') {
      await onSubmit(payload);
      return;
    }

    if (typeof onConfirm === 'function') {
      await onConfirm(payload);
      return;
    }

    if (typeof onSelect === 'function') {
      await onSelect(payload);
    }
  }

  return (
    <div className="w-full max-w-[620px] mx-auto space-y-8">
      <div className="px-2">
        <input
          type="range"
          min={0}
          max={100}
          step={25}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          disabled={busy}
          className="thy-slider w-full"
          aria-label="Escala de concordância"
        />
      </div>

      <div className="grid grid-cols-5 gap-2 text-[10px] uppercase tracking-[0.18em] text-muted">
        {SCALE_LABELS.map((label, index) => (
          <span
            key={label}
            className={`text-center leading-tight transition-colors ${
              activeIndex === index ? 'text-foreground font-semibold' : ''
            }`}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="pt-2 text-center">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          className="min-w-[240px] border border-border px-8 py-3 text-xs uppercase tracking-[0.35em] hover:border-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? 'confirmando...' : 'confirmar'}
        </button>
      </div>

      <style jsx>{`
        .thy-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          border-radius: 999px;
          background: linear-gradient(to right, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.45));
          outline: none;
        }

        .thy-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          border: 2px solid rgba(255, 255, 255, 0.95);
          background: #050505;
          cursor: pointer;
          box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.08);
        }

        .thy-slider::-moz-range-thumb {
          width: 28px;
          height: 28px;
          border-radius: 999px;
          border: 2px solid rgba(255, 255, 255, 0.95);
          background: #050505;
          cursor: pointer;
          box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.08);
        }
      `}</style>
    </div>
  );
}
