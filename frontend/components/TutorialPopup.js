import { useState, useEffect } from 'react';

const TUTORIALS = {
    binary: {
        title: 'Escolha Extrema',
        desc: 'Sem meio-termo. Escolha a opção que mais se aproxima de você (ou a menos pior), mesmo que não seja o cenário perfeito.'
    },
    reflection: {
        title: 'Reflexão Livre',
        desc: 'Um espaço livre para escrever o que lhe vem à cabeça. Suas palavras são interpretadas para pintar um quadro fiel de quem você é.'
    }
};

export default function TutorialPopup({ types, onComplete }) {
    const [currentIndex, setCurrentIndex] = useState(0);

    if (!types || types.length === 0) return null;

    const type = types[currentIndex];
    const tutorial = TUTORIALS[type];

    const handleNext = () => {
        if (currentIndex < types.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            onComplete();
        }
    };

    useEffect(() => {
        if (!tutorial) {
            handleNext();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentIndex, tutorial]);

    if (!tutorial) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-6">
            <div className="w-full max-w-md border border-foreground bg-background p-8 space-y-6">
                <p className="text-[10px] uppercase tracking-[0.4em] text-muted">
                    como responder
                </p>
                <h3 className="text-xl font-bold tracking-tight">{tutorial.title}</h3>
                <p className="text-sm text-foreground/80 leading-relaxed">{tutorial.desc}</p>
                <button
                    type="button"
                    onClick={handleNext}
                    className="w-full border border-foreground px-6 py-3 text-[11px] uppercase tracking-[0.3em] hover:bg-foreground hover:text-background transition-all"
                >
                    {currentIndex < types.length - 1 ? 'próximo' : 'entendido'}
                </button>
            </div>
        </div>
    );
}
