import { useState, useEffect } from 'react';

const TUTORIALS = {
    binary: {
        title: 'Escolha Extrema',
        desc: 'Sem meio-termo. Escolha a opção que mais se aproxima de você (ou a menos pior), mesmo que não seja o cenário perfeito.'
    },
    reflection: {
        title: 'Reflexão Livre',
        desc: 'Um espaço livre para escrever o que lhe vem à cabeça. Quanto mais direto, melhor a leitura no final.'
    }
};

export default function TutorialPopup({ types, onComplete }) {
    const [currentIndex, setCurrentIndex] = useState(0);

    // Filtramos os tipos sem tutorial cadastrado DURANTE o render, em vez de
    // pular via efeito. Isso mantém todos os hooks incondicionais (antes o
    // `return null` acima do useEffect violava as regras de hooks) e dispensa
    // o setState síncrono dentro do efeito.
    const requestedCount = Array.isArray(types) ? types.length : 0;
    const list = (Array.isArray(types) ? types : []).filter(t => TUTORIALS[t]);
    const tutorial = list.length > 0 ? TUTORIALS[list[Math.min(currentIndex, list.length - 1)]] : null;

    const handleNext = () => {
        if (currentIndex < list.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            onComplete?.();
        }
    };

    // Nenhum dos tipos pedidos tem tutorial: marca como visto e sai de cena.
    useEffect(() => {
        if (requestedCount > 0 && list.length === 0) {
            onComplete?.();
        }
    }, [requestedCount, list.length, onComplete]);

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
                    {currentIndex < list.length - 1 ? 'próximo' : 'entendido'}
                </button>
            </div>
        </div>
    );
}
