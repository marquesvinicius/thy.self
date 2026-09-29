import { useState } from 'react';

export default function ReflectionInput({ question, onSelect, disabled }) {
    const [text, setText] = useState('');

    const handleChange = (e) => {
        setText(e.target.value);
        onSelect({
            user_observation: e.target.value,
            answer_type: 'reflection',
            alternative_id: question.alternatives?.[0]?.id
        });
    };

    return (
        <div className="w-full">
            <textarea
                value={text}
                onChange={handleChange}
                disabled={disabled}
                placeholder="Escreva seus pensamentos..."
                className="w-full min-h-[150px] bg-background border border-border p-4 text-sm resize-none focus:outline-none focus:border-foreground transition-colors disabled:opacity-50"
            />
            <div className="flex justify-between gap-4 mt-2 text-[10px] text-muted tracking-widest uppercase">
                {/* RN016: o texto livre é o único lugar onde a pessoa poderia se identificar */}
                <span>não escreva nome, contato ou outros dados pessoais</span>
                <span>{text.length} caracteres</span>
            </div>
        </div>
    );
}
