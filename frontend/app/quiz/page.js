'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getQuestions, submitAnswer } from '@/services/api';
import Header from '@/components/Header';

export default function Quiz() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState(null);
  const [question, setQuestion] = useState(null);
  const [progress, setProgress] = useState({ answered: 0, canAnalyze: false });
  const [submitting, setSubmitting] = useState(false);
  const [chosenId, setChosenId] = useState(null);

  // 3-phase transition: 'visible' | 'exiting' | 'entering'
  const [phase, setPhase] = useState('entering');
  const pendingQuestion = useRef(null);

  const loadQuestion = useCallback(async (sid) => {
    try {
      const data = await getQuestions(sid, 1);
      setProgress({
        answered: data.total_answered,
        canAnalyze: data.can_analyze,
      });

      if (data.questions.length > 0) {
        pendingQuestion.current = data.questions[0];
        // Start entering phase
        setQuestion(data.questions[0]);
        setPhase('entering');
        setTimeout(() => setPhase('visible'), 500);
      } else {
        setQuestion(null);
        setPhase('visible');
      }
    } catch (err) {
      console.error('Failed to load question:', err);
    }
  }, []);

  useEffect(() => {
    const sid = sessionStorage.getItem('session_id');
    if (!sid) {
      router.push('/');
      return;
    }
    setSessionId(sid);
    loadQuestion(sid);
  }, [router, loadQuestion]);

  async function handleAnswer(alternativeId) {
    if (submitting || !question) return;
    setSubmitting(true);
    setChosenId(alternativeId);

    // Pausa contemplativa — ritmo intencional
    await new Promise(r => setTimeout(r, 250));

    // Fase de saída
    setPhase('exiting');
    await new Promise(r => setTimeout(r, 200));

    try {
      const data = await submitAnswer(sessionId, question.id, alternativeId);
      setProgress({
        answered: data.progress.answered,
        canAnalyze: data.progress.can_analyze,
      });
      setChosenId(null);
      await loadQuestion(sessionId);
    } catch (err) {
      console.error('Failed to submit answer:', err);
      setPhase('visible');
    } finally {
      setSubmitting(false);
    }
  }

  function handleAnalyze() {
    sessionStorage.setItem('session_id', sessionId);
    router.push('/result');
  }

  function handleEndSession() {
    sessionStorage.removeItem('session_id');
    router.push('/');
  }

  // Phase-based CSS classes
  const phaseClasses = {
    exiting: 'opacity-0 -translate-y-2 transition-all duration-200',
    entering: 'animate-fade-in-up',
    visible: 'opacity-100 translate-y-0',
  };

  if (!sessionId) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 flex flex-col pt-20">
        {/* Status bar */}
        <div className="flex items-center justify-between px-6 md:px-10 py-3 border-b border-border text-[10px] uppercase tracking-widest text-muted">
          <span className="tabular-nums transition-all duration-300">
            responses: {progress.answered}
          </span>
          <div className="flex items-center gap-6">
            {progress.canAnalyze && (
              <button
                onClick={handleAnalyze}
                className="text-foreground border border-foreground px-4 py-1 hover:bg-foreground hover:text-background transition-all"
              >
                analyze
              </button>
            )}
            <button
              onClick={handleEndSession}
              className="hover:text-foreground transition-colors"
            >
              end session
            </button>
          </div>
        </div>

        {/* Question area */}
        {question ? (
          <div className={`flex-1 grid grid-cols-1 md:grid-cols-2 ${phaseClasses[phase]}`}>
            {/* Left: Question */}
            <div className="flex items-center justify-center p-8 md:p-16 border-b md:border-b-0 md:border-r border-border">
              <div className="max-w-md space-y-4">
                <span className="text-[10px] uppercase tracking-widest text-muted">
                  {question.category}
                </span>
                <h2 className="text-xl md:text-2xl lg:text-3xl font-bold leading-tight tracking-tight">
                  {question.text}
                </h2>
                {question.context && (
                  <p className="text-xs text-muted leading-relaxed">
                    {question.context}
                  </p>
                )}
              </div>
            </div>

            {/* Right: Alternatives (staggered) */}
            <div className="flex flex-col justify-center p-8 md:p-16 space-y-3">
              {question.alternatives.map((alt, index) => (
                <button
                  key={alt.id}
                  onClick={() => handleAnswer(alt.id)}
                  disabled={submitting}
                  style={phase === 'entering' ? { animationDelay: `${300 + index * 100}ms` } : undefined}
                  className={`text-left border px-6 py-4 text-sm leading-relaxed transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed ${
                    phase === 'entering' ? 'animate-stagger' : ''
                  } ${
                    chosenId === alt.id
                      ? 'bg-foreground/10 border-foreground'
                      : 'border-border hover:border-foreground hover:bg-foreground/5'
                  }`}
                >
                  {alt.text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-6 animate-fade-in">
              <p className="text-lg font-bold">
                {progress.canAnalyze
                  ? 'Todas as perguntas foram respondidas.'
                  : 'Carregando...'}
              </p>
              {progress.canAnalyze && (
                <button
                  onClick={handleAnalyze}
                  className="border border-foreground px-10 py-3 text-xs uppercase tracking-[0.3em] hover:bg-foreground hover:text-background transition-all"
                >
                  analyze
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
