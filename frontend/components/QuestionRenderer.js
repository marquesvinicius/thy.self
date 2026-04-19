'use client';

import LikertInput from '@/components/inputs/LikertInput';
import SliderInput from '@/components/inputs/SliderInput';
import BinaryInput from '@/components/inputs/BinaryInput';
import ReflectionInput from '@/components/inputs/ReflectionInput';
import DragRankInput from '@/components/inputs/DragRankInput';
import InterpretativeFrame from '@/components/InterpretativeFrame';

/**
 * QuestionRenderer — Dual-Core switchboard.
 *
 * Routing:
 *   1. `kind === 'objective'`  → always LikertInput (5-point scale).
 *   2. `kind === 'interpretative'` → wrapped in InterpretativeFrame, then
 *      routed by the legacy widget `type` (binary / ranking / reflection /
 *      multiple_choice).
 *
 * The multiple-choice branch is rendered inline because its layout (grid of
 * alternative buttons) was previously defined directly in quiz/page.js. We
 * reproduce it here verbatim so the extraction is behavior-preserving.
 */
export default function QuestionRenderer({ question, value, onSelect, disabled = false }) {
  const kind = question?.kind || 'interpretative';

  if (kind === 'objective') {
    return (
      <LikertInput
        question={question}
        currentValue={value}
        onSelect={onSelect}
        disabled={disabled}
      />
    );
  }

  const type = question?.type || 'multiple_choice';

  return (
    <InterpretativeFrame question={question}>
      {type === 'slider' && (
        <SliderInput question={question} currentValue={value} onSelect={onSelect} disabled={disabled} />
      )}
      {type === 'binary' && (
        <BinaryInput question={question} currentValue={value} onSelect={onSelect} disabled={disabled} />
      )}
      {type === 'ranking' && (
        <DragRankInput question={question} currentValue={value} onSelect={onSelect} disabled={disabled} />
      )}
      {type === 'reflection' && (
        <ReflectionInput question={question} currentValue={value} onSelect={onSelect} disabled={disabled} />
      )}
      {(!type || type === 'multiple_choice') && (
        <MultipleChoiceGrid question={question} value={value} onSelect={onSelect} disabled={disabled} />
      )}
    </InterpretativeFrame>
  );
}

function MultipleChoiceGrid({ question, value, onSelect, disabled }) {
  const alternatives = Array.isArray(question?.alternatives) ? question.alternatives : [];
  const selectedId = value?.alternative_id ?? value ?? null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-3xl">
      {alternatives.map((alt) => {
        const isSelected = selectedId === alt.id;
        return (
          <button
            key={alt.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect({ alternative_id: alt.id, answer_type: 'alternative_id' })}
            className={`text-left border px-5 py-3 text-sm leading-relaxed transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
              isSelected
                ? 'bg-foreground/10 border-foreground shadow-[0_0_15px_rgba(255,255,255,0.1)]'
                : 'border-border hover:border-foreground/50 hover:bg-foreground/5'
            }`}
          >
            {alt.text}
          </button>
        );
      })}
    </div>
  );
}
