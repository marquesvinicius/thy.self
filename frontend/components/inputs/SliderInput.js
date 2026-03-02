import { useState } from 'react';

const LIKERT_OPTIONS = [
    { value: 0, label: 'Discordo Totalmente' },
    { value: 25, label: 'Discordo' },
    { value: 50, label: 'Neutro' },
    { value: 75, label: 'Concordo' },
    { value: 100, label: 'Concordo Totalmente' }
];

export default function SliderInput({ question, onSelect, disabled }) {
    const [value, setValue] = useState(50); // Padrão: Neutro
    const [dirty, setDirty] = useState(false);

    const handleChange = (e) => {
        const val = Number(e.target.value);
        setValue(val);
        setDirty(true);
        onSelect({
            slider_value: val,
            answer_type: 'slider',
            alternative_id: question.alternatives?.[0]?.id
        });
    };

    return (
        <div className="w-full space-y-12 mt-8 mb-4">
            <div className="relative pt-6 pb-2">
                <input
                    type="range"
                    min="0"
                    max="100"
                    step="25"
                    value={value}
                    onChange={handleChange}
                    disabled={disabled}
                    className={`absolute z-20 w-full h-2 opacity-0 cursor-pointer ${disabled ? 'opacity-0 cursor-not-allowed' : ''}`}
                />

                {/* Custom Track Background */}
                <div className="absolute top-1/2 left-0 w-full h-1 bg-foreground/20 rounded-full -translate-y-1/2 pointer-events-none z-0"></div>

                {/* Custom Track Progress */}
                <div
                    className="absolute top-1/2 left-0 h-1 bg-foreground rounded-full -translate-y-1/2 pointer-events-none z-0 transition-all duration-150"
                    style={{ width: `${value}%` }}
                ></div>

                {/* Custom Thumb Element */}
                <div
                    className="absolute top-1/2 w-8 h-8 -mt-4 -ml-4 rounded-full border-2 border-foreground bg-background flex flex-col items-center justify-center pointer-events-none transition-all duration-150 shadow-[0_0_15px_rgba(255,255,255,0.1)] z-10"
                    style={{ left: `${value}%` }}
                >
                    <div className="w-2 h-2 bg-foreground rounded-full"></div>
                </div>

                {/* Markers and Labels */}
                <div className="absolute top-8 left-0 w-full flex justify-between px-0 pointer-events-none z-0 mt-2">
                    {LIKERT_OPTIONS.map((opt) => (
                        <div key={opt.value} className="relative flex flex-col items-center" style={{ width: 0 }}>
                            <div className="absolute w-1 h-2 bg-foreground/40 -mt-6 rounded-full"></div>
                            <span
                                className={`absolute top-0 text-[9px] sm:text-[10px] uppercase tracking-widest whitespace-nowrap transition-colors ${value === opt.value ? 'text-foreground font-bold' : 'text-muted'
                                    }`}
                                style={{ transform: 'translateX(-50%)' }}
                            >
                                {opt.label}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
