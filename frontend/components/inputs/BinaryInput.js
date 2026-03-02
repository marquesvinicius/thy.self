export default function BinaryInput({ question, currentValue, onSelect, disabled }) {
    return (
        <div className="grid grid-cols-2 gap-4 w-full">
            <button
                onClick={() => onSelect({ alternative_id: question.alternatives?.[0]?.id, answer_type: 'binary' })}
                disabled={disabled}
                className={`border px-6 py-8 text-center uppercase tracking-widest text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${currentValue?.alternative_id === question.alternatives?.[0]?.id
                        ? 'bg-foreground/10 border-foreground shadow-[0_0_15px_rgba(255,255,255,0.1)]'
                        : 'border-border hover:border-foreground/50 hover:bg-foreground/5'
                    }`}
            >
                {question.alternatives?.[0]?.text || 'Sim'}
            </button>

            <button
                onClick={() => onSelect({ alternative_id: question.alternatives?.[1]?.id, answer_type: 'binary' })}
                disabled={disabled}
                className={`border px-6 py-8 text-center uppercase tracking-widest text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${currentValue?.alternative_id === question.alternatives?.[1]?.id
                        ? 'bg-foreground/10 border-foreground shadow-[0_0_15px_rgba(255,255,255,0.1)]'
                        : 'border-border hover:border-foreground/50 hover:bg-foreground/5'
                    }`}
            >
                {question.alternatives?.[1]?.text || 'Não'}
            </button>
        </div>
    );
}
