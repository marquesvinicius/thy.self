import { useState, useEffect } from 'react';

const TUTORIALS = {
    ranking: {
        title: 'Ordenação de Prioridades',
        desc: 'Ordene as opções clicando na ordem da sua preferência. O primeiro clique define sua maior prioridade, e o último, a menor.'
    },
    slider: {
        title: 'Nível de Concordância',
        desc: 'Deslize o controle para indicar o quanto você se alinha com a afirmação. Seja fiel ao seu instinto.'
    },
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
    // Verify if it has a valid tutorial module, otherwise skip
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
    }, [tutorial, currentIndex]);

    if (!tutorial) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in text-foreground p-6">
            <div className="max-w-md w-full bg-background border border-foreground/30 p-8 shadow-[0_0_40px_rgba(255,255,255,0.05)] relative">
                <h3 className="text-lg font-bold mb-3 uppercase tracking-widest">{tutorial.title}</h3>
                <p className="text-sm text-muted leading-relaxed mb-8">{tutorial.desc}</p>

                <div className="flex justify-between items-center mt-4">
                    <div className="flex gap-1.5">
                        {types.map((_, idx) => (
                            <div
                                key={idx}
                                className={`h-1 rounded-full transition-all duration-300 ${idx === currentIndex ? 'w-4 bg-foreground' : 'w-1 bg-foreground/20'}`}
                            />
                        ))}
                    </div>
                    <button
                        onClick={handleNext}
                        className="border border-foreground px-6 py-2.5 text-xs uppercase tracking-[0.2em] hover:bg-foreground hover:text-background transition-all"
                    >
                        {currentIndex < types.length - 1 ? 'Próximo' : 'Entendi'}
                    </button>
                </div>
            </div>
        </div>
    );
}
