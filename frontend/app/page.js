'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSession } from '@/services/api';
import Logo from '@/components/Logo';
import MysticBackground from '@/components/MysticBackground';

const QUESTION_TYPE_GUIDE = [
  {
    key: 'objective',
    title: 'Camada objetiva (BFI-2-S)',
    desc: '30 afirmacoes curtas respondidas em uma escala de 5 pontos (discordo totalmente -> concordo totalmente). Essas sao as unicas perguntas que alimentam o calculo dos cinco fatores.',
  },
  {
    key: 'interpretative',
    title: 'Camada interpretativa',
    desc: 'Dilemas morais, paradoxos e perguntas de preferencia. Nao influenciam os escores - servem apenas como contexto qualitativo para a leitura narrativa final.',
  },
  {
    key: 'ranking',
    title: 'Ordenacao de prioridades',
    desc: 'Em algumas perguntas interpretativas, clique nas opcoes na ordem da sua preferencia. O primeiro clique vira sua maior prioridade.',
  },
  {
    key: 'reflection',
    title: 'Reflexao livre',
    desc: 'Algumas perguntas interpretativas pedem um texto seu. Quanto mais autentico, mais rica fica a leitura final gerada pela IA.',
  },
];

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  async function handleStartQuiz() {
    setLoading(true);
    try {
      const session = await createSession();
      sessionStorage.setItem('session_id', session.session_id);
      router.push('/quiz');
    } catch (err) {
      console.error('Failed to create session:', err);
      setLoading(false);
    }
  }

  function handleStartClick() {
    if (loading) return;
    setShowGuide(true);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <MysticBackground mode="home" />

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl border border-foreground/25 bg-background p-6 md:p-8 space-y-6">
            <div className="space-y-2">
              <h2 className="text-sm md:text-base uppercase tracking-[0.2em]">Como responder o quiz</h2>
              <p className="text-xs md:text-sm text-muted">
                O thy.self funciona em duas camadas: uma objetiva (BFI-2-S) que
                alimenta o calculo dos cinco fatores, e uma interpretativa que
                apenas colore a leitura final. Leia rapido e siga pelo instinto.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {QUESTION_TYPE_GUIDE.map((item) => (
                <section key={item.key} className="border border-border/80 p-4 space-y-2">
                  <h3 className="text-[11px] uppercase tracking-[0.2em]">{item.title}</h3>
                  <p className="text-xs text-muted leading-relaxed">{item.desc}</p>
                </section>
              ))}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowGuide(false)}
                disabled={loading}
                className="border border-border px-6 py-2 text-[11px] uppercase tracking-[0.2em] hover:border-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                voltar
              </button>
              <button
                onClick={handleStartQuiz}
                disabled={loading}
                className="border border-foreground px-6 py-2 text-[11px] uppercase tracking-[0.2em] hover:bg-foreground hover:text-background transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? 'iniciando...' : 'entendi, comecar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-[1] text-center space-y-8 animate-fade-in">
        <Logo size="xl" />

        <p className="text-xs md:text-sm uppercase tracking-[0.3em] text-muted">
          Conhece-te a ti mesmo
        </p>

        <div className="pt-8">
          <button
            onClick={handleStartClick}
            disabled={loading}
            className="border border-foreground px-10 py-3 text-xs uppercase tracking-[0.3em] hover:bg-foreground hover:text-background transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {loading ? '...' : 'começar'}
          </button>
        </div>
      </div>

      <nav className="absolute top-6 right-6 md:top-8 md:right-10 flex gap-5 text-[10px] uppercase tracking-[0.3em] text-muted z-[1]">
        <Link href="/about" className="hover:text-foreground transition-colors">
          sobre
        </Link>
        <Link href="/method" className="hover:text-foreground transition-colors">
          método
        </Link>
      </nav>

      <footer className="absolute bottom-6 text-[10px] uppercase tracking-widest text-muted z-[1]">
        thy.self &mdash; big five ocean
      </footer>
    </main>
  );
}
