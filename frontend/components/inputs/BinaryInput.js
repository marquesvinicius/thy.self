'use client';

import { useMemo, useState } from 'react';

function normalizeAlternatives(question, alternatives) {
  if (Array.isArray(alternatives) && alternatives.length > 0) return alternatives;
  if (Array.isArray(question?.alternatives) && question.alternatives.length > 0) return question.alternatives;
  return [];
}

export default function BinaryInput(props) {
  const {
    question,
    alternatives,
    onSelect,
    onSubmit,
    onConfirm,
    disabled = false,
    isSubmitting = false,
    submitting = false,
  } = props;

  const [selectedId, setSelectedId] = useState(null);
  const items = useMemo(
    () => normalizeAlternatives(question, alternatives),
    [question, alternatives]
  );
  const busy = disabled || isSubmitting || submitting;

  async function handleSubmit() {
    if ((selectedId === null || selectedId === undefined) || busy) return;

    const payload = {
      alternative_id: selectedId,
      answer_type: 'alternative_id',
      slider_value: null,
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
    <div className="w-full max-w-[680px] mx-auto space-y-6">
      <div className="border border-border divide-y divide-border/80">
        {items.map((alt) => {
          const id = alt.id ?? alt.alternative_id ?? alt.value;
          const text = alt.text ?? alt.label ?? alt.content ?? '';
          const selected = selectedId === id;

          return (
            <button
              key={id}
              type="button"
              onClick={() => setSelectedId(id)}
              disabled={busy}
              className={`w-full text-left px-5 py-5 text-sm md:text-base transition-colors ${
                selected
                  ? 'bg-foreground text-background'
                  : 'text-foreground/88 hover:bg-foreground/5'
              }`}
            >
              {text}
            </button>
          );
        })}
      </div>

      <div className="text-center">
        <button
          type="button"
          disabled={(selectedId === null || selectedId === undefined) || busy}
          onClick={handleSubmit}
          className="min-w-[240px] border border-border px-8 py-3 text-xs uppercase tracking-[0.35em] hover:border-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? 'confirmando...' : 'confirmar'}
        </button>
      </div>
    </div>
  );
}
