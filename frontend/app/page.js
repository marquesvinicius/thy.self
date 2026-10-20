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
    desc: 'Em alguns paradoxos, você escolhe entre dois polos (ex.: amado ou temido?). Clique no que mais te representa: a escolha vale na hora, e “voltar” desfaz.',
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
          ? 'Não foi possível conectar ao servidor. Aguarde alguns segundos e tente de novo.'
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm p-0 md:p-4">
          <div className="w-full max-w-3xl max-h-[100dvh] md:max-h-[90dvh] flex flex-col border-0 md:border border-foreground/25 bg-background">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 md:px-8 md:pt-8 md:pb-2 space-y-5 md:space-y-6">
            <div className="space-y-3">
              <p className="text-[0.65rem] uppercase tracking-[0.4em] text-faint">antes de começar</p>
              <h2 className="text-base md:text-lg uppercase tracking-[0.2em]">Como responder o quiz</h2>
              <p className="text-xs md:text-sm text-muted leading-relaxed">
                O thy.self funciona em duas camadas: uma objetiva (BFI-2-S) que
                alimenta o cálculo dos cinco fatores OCEAN, e uma interpretativa que
                apenas enriquece o resultado final. Leia calmamente e responda de forma autêntica.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-px bg-border/80 border border-border/80">
              <div className="bg-background p-3 md:p-4 space-y-1">
                <p className="text-[0.65rem] uppercase tracking-[0.25em] text-faint">parte 1</p>
                <p className="text-sm md:text-base tracking-wide">~5 min</p>
              </div>
              <div className="bg-background p-3 md:p-4 space-y-1">
                <p className="text-[0.65rem] uppercase tracking-[0.25em] text-faint">parte 2 · opcional</p>
                <p className="text-sm md:text-base tracking-wide">~8 min</p>
              </div>
            </div>

            <ol className="grid grid-cols-1 md:grid-cols-2 md:gap-x-8">
              {QUESTION_TYPE_GUIDE.map((item, i) => (
                <li
                  key={item.key}
                  className={`flex gap-4 border-border/80 py-4 ${
                    i === 0 ? 'pt-0'
                      : i === 1 ? 'border-t md:border-t-0 md:pt-0'
                      : 'border-t'
                  }`}
                >
                  <span className="text-xs text-faint tabular-nums pt-0.5">{String(i + 1).padStart(2, '0')}</span>
                  <div className="space-y-1.5">
                    <h3 className="text-xs uppercase tracking-[0.2em]">{item.title}</h3>
                    <p className="text-xs text-muted leading-relaxed">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ol>

            {/* RN015: recomendação declarada, sem verificação — verificar idade exigiria coletar dados.
                Fica neste guia, que só aparece ao começar uma sessão do zero. */}
            <p className="pt-2 text-[0.65rem] uppercase tracking-[0.2em] text-faint leading-relaxed">
              recomendado para adultos · use com responsabilidade · não é diagnóstico
            </p>
            </div>

            <div className="shrink-0 flex flex-col gap-3 bg-background p-4 md:px-8 md:pt-3 md:pb-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {startError && (
                <p className="w-full text-xs text-foreground/80 leading-relaxed border border-foreground/20 px-3 py-2">
                  {startError}
                </p>
              )}
              <div className="grid grid-cols-2 md:flex md:justify-end gap-3">
              <button
                onClick={() => { setShowGuide(false); setStartError(null); }}
                disabled={loading}
                className="border border-control px-6 py-3 md:py-2 text-xs uppercase tracking-[0.2em] hover:border-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                voltar
              </button>
              <button
                onClick={handleStartQuiz}
                disabled={loading}
                className="border border-foreground px-6 py-3 md:py-2 text-xs uppercase tracking-[0.2em] hover:bg-foreground hover:text-background transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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

        {resumableSession && (
          <div className="pt-4 space-y-5 animate-fade-in">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.25em] text-faint">
                avaliação em andamento
              </p>
              <button
                onClick={handleResumeSession}
                disabled={loading}
                aria-label="continuar de onde parei"
                className="border border-foreground px-10 py-3 text-xs uppercase tracking-[0.3em] hover:bg-foreground hover:text-background transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                continuar
              </button>
            </div>
            <div className="flex items-center justify-center gap-4 text-xs uppercase tracking-[0.2em] text-muted">
              <button
                onClick={handleStartClick}
                disabled={loading}
                className="min-h-11 px-2 hover:text-foreground transition-colors disabled:opacity-40"
              >
                começar do zero
              </button>
              <span className="text-faint" aria-hidden="true">·</span>
              <button
                onClick={handleDiscardSession}
                disabled={loading}
                className="min-h-11 px-2 hover:text-foreground transition-colors disabled:opacity-40"
              >
                descartar
              </button>
            </div>
          </div>
        )}

        {!lastResultSession && !resumableSession && (
          <div className="pt-4">
            <button
              onClick={handleStartClick}
              disabled={loading}
              className="border border-foreground px-10 py-3 text-xs uppercase tracking-[0.3em] hover:bg-foreground hover:text-background transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {loading ? '...' : 'começar'}
            </button>
          </div>
        )}

        {lastResultSession && !resumableSession && (
          <div className="pt-4 space-y-5 animate-fade-in">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.25em] text-faint">
                resultado disponível
              </p>
              <button
                onClick={handleResumeResult}
                disabled={loading}
                className="border border-foreground px-10 py-3 text-xs uppercase tracking-[0.3em] hover:bg-foreground hover:text-background transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ver resultado
              </button>
            </div>
            <div className="flex items-center justify-center text-xs uppercase tracking-[0.2em] text-muted">
              <button
                onClick={handleStartClick}
                disabled={loading}
                className="min-h-11 px-2 hover:text-foreground transition-colors disabled:opacity-40"
              >
                começar nova sessão
              </button>
            </div>
          </div>
        )}
      </div>

      <footer className="absolute bottom-6 text-xs uppercase tracking-widest text-muted z-[1]">
        thy.self &mdash; big five ocean
      </footer>
    </main>
  );
}
