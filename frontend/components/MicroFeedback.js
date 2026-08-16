import { useState, useEffect } from 'react';

const FEEDBACKS = [
  'Ainda há mais.',
  'Isso já diz alguma coisa.',
  'Não é o quadro inteiro.',
  'Há contraste nas suas respostas.',
  'Um traço pesa mais que os outros.',
  'Continue.',
  'Guarde isso.',
  'Ainda incompleto.',
];

const VISIBLE_MS = 3000;
const FADE_MS = 500;

/**
 * Pontuação entre blocos de perguntas. Montado condicionalmente pelo pai
 * (com `key` por contagem de respostas), de modo que cada aparição é uma
 * instância nova — a frase é sorteada no inicializador lazy do useState e o
 * fade-in vem do CSS. Assim nenhum setState roda de forma síncrona dentro de
 * um efeito (regra react-hooks/set-state-in-effect); o único setState é o de
 * saída, disparado dentro de um timer.
 */
export default function MicroFeedback({ onComplete }) {
    const [feedback] = useState(
        () => FEEDBACKS[Math.floor(Math.random() * FEEDBACKS.length)]
    );
    const [leaving, setLeaving] = useState(false);

    useEffect(() => {
        const fadeOut = setTimeout(() => setLeaving(true), VISIBLE_MS);
        const done = setTimeout(() => onComplete?.(), VISIBLE_MS + FADE_MS);
        return () => {
            clearTimeout(fadeOut);
            clearTimeout(done);
        };
    }, [onComplete]);

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm transition-opacity duration-500 pointer-events-none ${
                leaving ? 'opacity-0' : 'opacity-100'
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
