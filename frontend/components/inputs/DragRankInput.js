import { useState, useEffect } from 'react';

export default function DragRankInput({ question, currentValue, onSelect, disabled }) {
    const [ranked, setRanked] = useState([]);
    const alternatives = question.alternatives || [];

    // A simple click-to-rank implementation avoids heavy dnd dependencies
    // Users click alternatives in the order of their preference (1st, 2nd, 3rd, 4th)
    const handleToggle = (alt) => {
        if (disabled) return;

        setRanked((prev) => {
            const isAlreadyRanked = prev.find(item => item.id === alt.id);

            let nextRanked;
            if (isAlreadyRanked) {
                // Remove from ranks
                nextRanked = prev.filter(item => item.id !== alt.id);
            } else {
                // Add to ranks
                nextRanked = [...prev, alt];
            }

            // Invoke onSelect synchronously instead of using useEffect to prevent infinite loops
            if (nextRanked.length === alternatives.length) {
                onSelect({
                    alternative_id: nextRanked[0].id,
                    rank_position: 1,
                    answer_type: 'ranking'
                });
            } else {
                onSelect(null);
            }

            return nextRanked;
        });
    };

    return (
        <div className="flex flex-col gap-3 w-full">
            {alternatives.map((alt) => {
                const rankIndex = ranked.findIndex(item => item.id === alt.id);
                const rankNum = rankIndex !== -1 ? rankIndex + 1 : null;

                return (
                    <button
                        key={alt.id}
                        onClick={() => handleToggle(alt)}
                        disabled={disabled}
                        className={`flex items-center justify-between border px-5 py-4 text-sm leading-relaxed transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${rankNum
                            ? 'bg-foreground/10 border-foreground shadow-[0_0_15px_rgba(255,255,255,0.05)]'
                            : 'border-border hover:border-foreground/50 hover:bg-foreground/5'
                            }`}
                    >
                        <span className="text-left flex-1">{alt.text}</span>
                        {rankNum && (
                            <span className="ml-4 w-6 h-6 flex items-center justify-center rounded-full border border-foreground text-[10px] tabular-nums font-bold">
                                {rankNum}
                            </span>
                        )}
                    </button>
                );
            })}

            {ranked.length > 0 && ranked.length < alternatives.length && (
                <p className="text-[10px] text-muted tracking-widest uppercase text-center mt-2 animate-pulse">
                    Selecione os restantes na ordem de preferência
                </p>
            )}
        </div>
    );
}
