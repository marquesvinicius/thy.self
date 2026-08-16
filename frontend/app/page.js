'use client';

import { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { createSession } from '@/services/api';
import Logo from '@/components/Logo';
import Header from '@/components/Header';
import MysticBackground from '@/components/MysticBackground';
import {
  setActiveSession,
  clearActiveSession,
  getLastResultSnapshot,
  clearLastResultSession,
  subscribeActiveSession,
  getActiveSessionSnapshot,
  getActiveSessionServerSnapshot,
} from '@/lib/activeSession';

const QUESTION_TYPE_GUIDE = [
  {
    key: 'objective',
    title: 'Camada objetiva (BFI-2-S)',
    desc: '30 afirmações curtas respondidas em uma escala Likert de 5 pontos (discordo totalmente → concordo totalmente). São as únicas perguntas que alimentam o cálculo dos cinco fatores.',
  },
  {
    key: 'interpretative',
    title: 'Camada interpretativa',
    desc: 'Dilemas morais, paradoxos e perguntas de interesse. Não influenciam os escores numéricos — servem apenas como contexto qualitativo para a leitura narrativa gerada ao final.',
  },
  {
    key: 'binary',
    title: 'Escolha binária',
    desc: 'Em alguns paradoxos, você escolhe entre dois polos (ex.: amado ou temido?). Clique no que mais te representa e depois em “confirmar”.',
  },
  {
    key: 'reflection',
    title: 'Reflexão livre',
    desc: 'Algumas perguntas interpretativas pedem um texto seu. Quanto mais autêntico, mais rica fica a leitura final gerada pela IA.',
  },
];

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [startError, setStartError] = useState(null);

  // Marcador de sessão em andamento lido como external store: aparece no
  // primeiro paint do cliente e reage sozinho a set/clear (inclusive de
  // outra aba), sem efeito de mount nem setState em cascata.
  const resumableSession = useSyncExternalStore(
    subscribeActiveSession,
    getActiveSessionSnapshot,
    getActiveSessionServerSnapshot,
  );
  const lastResultSession = useSyncExternalStore(
    subscribeActiveSession,
    getLastResultSnapshot,
    () => null,
  );

  async function handleStartQuiz() {
    setLoading(true);
    setStartError(null);
    try {
      const session = await createSession();
      sessionStorage.setItem('session_id', session.session_id);
      setActiveSession(session.session_id);
      clearLastResultSession();
      router.push('/quiz');
    } catch (err) {
      console.error('Failed to create session:', err);
      const msg = err?.message || '';
      setStartError(
        /failed to fetch|networkerror|load failed/i.test(msg)
          ? 'Não foi possível conectar à API. Confirme que o backend está em http://localhost:3000 e tente de novo.'
          : (msg || 'Falha ao iniciar a sessão. Tente novamente.'),
      );
      setLoading(false);
    }
  }

  function handleResumeSession() {
    if (!resumableSession) return;
    sessionStorage.setItem('session_id', resumableSession);
    router.push('/quiz');
  }

  function handleResumeResult() {
    if (!lastResultSession || loading) return;
    sessionStorage.setItem('session_id', lastResultSession);
    router.push('/result');
  }

  function handleDiscardSession() {
    // clearActiveSession notifica o store — o banner desaparece sozinho.
    clearActiveSession();
  }

  function handleStartClick() {
    if (loading) return;
    setShowGuide(true);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <MysticBackground mode="home" />
      <Header />

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl border border-foreground/25 bg-background p-6 md:p-8 space-y-6">
            <div className="space-y-2">
              <h2 className="text-sm md:text-base uppercase tracking-[0.2em]">Como responder o quiz</h2>
              <p className="text-xs md:text-sm text-muted">
                O thy.self funciona em duas camadas: uma objetiva (BFI-2-S) que
                alimenta o cálculo dos cinco fatores OCEAN, e uma interpretativa que
                apenas enriquece o resultado final. Leia calmamente e responda de forma autêntica.
              </p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted/70 pt-1">
                parte 1: ~5 min · parte 2 (opcional): ~8 min
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

            <div className="flex flex-col items-end gap-3 pt-2">
              {startError && (
                <p className="w-full text-xs text-foreground/80 leading-relaxed border border-foreground/20 px-3 py-2">
                  {startError}
                </p>
              )}
              <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowGuide(false); setStartError(null); }}
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
                {loading ? 'iniciando...' : 'entendi, começar'}
              </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-[1] text-center space-y-8 animate-fade-in">
        <Logo size="xl" />

        <p className="text-xs md:text-sm uppercase tracking-[0.3em] text-muted">
          Conhece-te a ti mesmo
        </p>

        {!lastResultSession && (
          <div className="pt-8">
            <button
              onClick={handleStartClick}
              disabled={loading}
              className="border border-foreground px-10 py-3 text-xs uppercase tracking-[0.3em] hover:bg-foreground hover:text-background transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {loading ? '...' : 'começar'}
            </button>
          </div>
        )}

        {resumableSession && (
          <div className="pt-2 space-y-3 animate-fade-in">
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted/80">
              você tem uma avaliação em andamento
            </p>
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={handleResumeSession}
                disabled={loading}
                className="text-[11px] uppercase tracking-[0.25em] text-foreground underline underline-offset-4 hover:text-foreground/70 transition-colors disabled:opacity-40"
              >
                continuar de onde parei
              </button>
              <button
                onClick={handleDiscardSession}
                disabled={loading}
                className="text-[11px] uppercase tracking-[0.25em] text-muted hover:text-foreground transition-colors disabled:opacity-40"
              >
                descartar
              </button>
            </div>
          </div>
        )}

        {lastResultSession && !resumableSession && (
          <div className="pt-2 space-y-3 animate-fade-in">
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted/80">
              você tem um resultado disponível
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6">
              <button
                onClick={handleResumeResult}
                disabled={loading}
                className="border border-foreground px-5 py-2 text-[11px] uppercase tracking-[0.2em] hover:bg-foreground hover:text-background transition-all disabled:opacity-40"
              >
                ver resultado
              </button>
              <button
                onClick={handleStartClick}
                disabled={loading}
                className="border border-border px-5 py-2 text-[11px] uppercase tracking-[0.2em] hover:border-foreground transition-colors disabled:opacity-40"
              >
                começar nova sessão
              </button>
            </div>
          </div>
        )}
      </div>

      <footer className="absolute bottom-6 text-[10px] uppercase tracking-widest text-muted z-[1]">
        thy.self &mdash; big five ocean
      </footer>
    </main>
  );
}
