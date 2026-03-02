import { useState } from 'react';

export default function ReflectionInput({ question, onSelect, disabled }) {
    const [text, setText] = useState('');

    const handleChange = (e) => {
        setText(e.target.value);
        onSelect({ user_observation: e.target.value, answer_type: 'reflection' });
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
            <div className="text-right mt-2 text-[10px] text-muted tracking-widest uppercase">
                {text.length} caracteres
            </div>
        </div>
    );
}
