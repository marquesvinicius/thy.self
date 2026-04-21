'use client';

import { useMemo } from 'react';

function normalizeAlternatives(question, alternatives) {
  if (Array.isArray(alternatives) && alternatives.length > 0) return alternatives;
  if (Array.isArray(question?.alternatives) && question.alternatives.length > 0) return question.alternatives;
  return [];
}

/**
 * BinaryInput — escolha entre opções discretas (dois ou mais blocos).
 *
 * Pós teste de usabilidade, o clique commita imediatamente: não há mais um
 * botão "confirmar" intermediário. Para desfazer uma escolha errada, o
 * usuário usa o botão "voltar" na página do quiz.
 */
export default function BinaryInput(props) {
  const {
    question,
    alternatives,
    currentValue,
    onSelect,
    disabled = false,
    isSubmitting = false,
    submitting = false,
  } = props;

  const items = useMemo(
    () => normalizeAlternatives(question, alternatives),
    [question, alternatives]
  );
  const busy = disabled || isSubmitting || submitting;
  const selectedId = currentValue?.alternative_id ?? currentValue ?? null;

  function commit(id) {
    if (busy || id === null || id === undefined) return;
    const payload = {
      alternative_id: id,
      answer_type: 'alternative_id',
      slider_value: null,
      text_value: null,
    };
    if (typeof onSelect === 'function') onSelect(payload);
  }

  return (
    <div className="w-full max-w-[680px] mx-auto">
      <div className="border border-border divide-y divide-border/80">
        {items.map((alt) => {
          const id = alt.id ?? alt.alternative_id ?? alt.value;
          const text = alt.text ?? alt.label ?? alt.content ?? '';
          const selected = selectedId === id;

          return (
            <button
              key={id}
              type="button"
              onClick={() => commit(id)}
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
    </div>
  );
}
