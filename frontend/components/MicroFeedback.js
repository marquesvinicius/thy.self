import { useState, useEffect } from 'react';

const FEEDBACKS = [
    "As sementes estão sendo plantadas...",
    "O espelho começa a desanuviar...",
    "Os fios estão se conectando...",
    "O oráculo escuta com atenção...",
    "Suas escolhas moldam a narrativa..."
];

export default function MicroFeedback({ trigger, onComplete }) {
    const [feedback, setFeedback] = useState("");
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (trigger) {
            const randomFeedback = FEEDBACKS[Math.floor(Math.random() * FEEDBACKS.length)];
            setFeedback(randomFeedback);
            setVisible(true);

            const timer = setTimeout(() => {
                setVisible(false);
                setTimeout(onComplete, 500); // Wait for fade out
            }, 3000); // 3 seconds visible

            return () => clearTimeout(timer);
        }
    }, [trigger, onComplete]);

    if (!trigger && !visible) return null;

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm transition-opacity duration-500 pointer-events-none ${visible ? 'opacity-100' : 'opacity-0'
                }`}
        >
            <div className="text-center px-6">
                <p className="text-sm md:text-base uppercase tracking-widest font-light text-foreground animate-fade-in-up">
                    {feedback}
                </p>
            </div>
        </div>
    );
}
