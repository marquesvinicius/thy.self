'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getQuestions, submitAnswer } from '@/services/api';
import Header from '@/components/Header';
import MysticBackground, { MysticEyesOverlay } from '@/components/MysticBackground';
import ProgressBar from '@/components/ProgressBar';
import MicroFeedback from '@/components/MicroFeedback';
import TutorialPopup from '@/components/TutorialPopup';
import SliderInput from '@/components/inputs/SliderInput';
import BinaryInput from '@/components/inputs/BinaryInput';
import ReflectionInput from '@/components/inputs/ReflectionInput';
import DragRankInput from '@/components/inputs/DragRankInput';

const BLOCK_SIZE = 1;

export default function Quiz() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState(null);

  // State for blocks
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({}); // { questionId: alternativeId }
  const [progress, setProgress] = useState({ answered: 0, total: 0, canAnalyze: false });

  const [submitting, setSubmitting] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [pendingTutorials, setPendingTutorials] = useState([]);

  // 3-phase transition: 'visible' | 'exiting' | 'entering'
  const [phase, setPhase] = useState('entering');

  const loadQuestions = useCallback(async (sid) => {
    try {
      const data = await getQuestions(sid, BLOCK_SIZE);
      setProgress({
        answered: data.total_answered,
        total: data.total_answered + data.total_available,
        canAnalyze: data.can_analyze,
      });

      if (data.questions.length > 0) {
        setQuestions(data.questions);
        setAnswers({}); // reset block answers

        // Calculate if we need to show a tutorial for any new types in this block
        const storedSeen = JSON.parse(localStorage.getItem('thySelf_seenTutorials') || '[]');
        const blockTypes = Array.from(new Set(data.questions.map(q => q.type)));
        const newTypes = blockTypes.filter(t => !storedSeen.includes(t) && t !== 'multiple_choice' && !!t);

        if (newTypes.length > 0) {
          setPendingTutorials(newTypes);
        }

        setPhase('entering');
        setTimeout(() => setPhase('visible'), 500);
      } else {
        setQuestions([]);
        setPhase('visible');
      }
    } catch (err) {
      console.error('Failed to load questions:', err);
    }
  }, []);

  useEffect(() => {
    const sid = sessionStorage.getItem('session_id');
    if (!sid) {
      router.push('/');
      return;
    }
    setSessionId(sid);
    loadQuestions(sid);
  }, [router, loadQuestions]);

  const isBlockComplete = questions.length > 0 && Object.keys(answers).length === questions.length;

  const handleSelect = (questionId, alternativeId) => {
    if (submitting) return;

    setAnswers(prev => ({ ...prev, [questionId]: alternativeId }));

    const q = questions.find((x) => x.id === questionId);
    if (q && (!q.type || q.type === 'multiple_choice' || q.type === 'binary' || q.type === 'slider')) {
      const immediateAnswers = { ...answers, [questionId]: alternativeId };
      if (Object.keys(immediateAnswers).length === questions.length) {
        handleSubmitBlock(immediateAnswers);
      }
    }
  };

  async function handleSubmitBlock(immediateAnswers = null) {
    const submitData = (immediateAnswers && !immediateAnswers.nativeEvent) ? immediateAnswers : answers;
    const validAnswersKeys = Object.keys(submitData).filter(key => submitData[key]?.answer_type !== 'ranking_incomplete');
    const readyToSubmit = questions.length > 0 && validAnswersKeys.length === questions.length;

    if (submitting || !readyToSubmit) return;
    setSubmitting(true);

    // Flash oracular
    setFlashing(true);
    setTimeout(() => setFlashing(false), 550);

    // Pausa contemplativa
    await new Promise(r => setTimeout(r, 250));

    // Fase de saída
    setPhase('exiting');
    await new Promise(r => setTimeout(r, 200));

    try {
      // Submit all answers sequentially
      let currentProgress = progress;
      for (const q of questions) {
        const payload = submitData[q.id];
        // Skip submission if payload is missing or incomplete
        if (!payload || payload.answer_type === 'ranking_incomplete') continue;

        const res = await submitAnswer(sessionId, q.id, payload);
        currentProgress = {
          answered: res.progress.answered,
          total: progress.total,
          canAnalyze: res.progress.can_analyze,
        };
      }
      setProgress(currentProgress);

      // Determine if we show micro-feedback (e.g., every 8 questions)
      if (currentProgress.answered > 0 && currentProgress.answered % 8 === 0) {
        setShowFeedback(true);
      } else {
        await loadQuestions(sessionId);
      }
    } catch (err) {
      console.error('Failed to submit block:', err);
      setPhase('visible');
    } finally {
      setSubmitting(false);
    }
  }

  const handleFeedbackComplete = async () => {
    setShowFeedback(false);
    await loadQuestions(sessionId);
  };

  const handleTutorialComplete = () => {
    const storedSeen = JSON.parse(localStorage.getItem('thySelf_seenTutorials') || '[]');
    const updatedSeen = Array.from(new Set([...storedSeen, ...pendingTutorials]));
    localStorage.setItem('thySelf_seenTutorials', JSON.stringify(updatedSeen));
    setPendingTutorials([]);
  };

  function handleAnalyze() {
    sessionStorage.setItem('session_id', sessionId);
    router.push('/result');
  }

  function handleEndSession() {
    sessionStorage.removeItem('session_id');
    router.push('/');
  }

  const phaseClasses = {
    exiting: 'opacity-0 -translate-y-4 transition-all duration-300',
    entering: 'animate-fade-in-up',
    visible: 'opacity-100 translate-y-0 transition-all duration-500',
  };

  if (!sessionId) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <MysticBackground showEyes={false} />
      <MicroFeedback trigger={showFeedback} onComplete={handleFeedbackComplete} />

      {pendingTutorials.length > 0 && (
        <TutorialPopup types={pendingTutorials} onComplete={handleTutorialComplete} />
      )}

      {flashing && (
        <div
          className="fixed inset-0 mystic-oracle-flash pointer-events-none"
          style={{ zIndex: 99 }}
          aria-hidden="true"
        />
      )}

      <Header />

      <main className="flex-1 flex flex-col pt-20 relative z-[1]">
        {/* Status bar */}
        <div className="flex flex-col gap-4 px-6 md:px-10 py-4 border-b border-border">
          <ProgressBar current={progress.answered} total={progress.total} />
          <div className="flex justify-between text-[10px] uppercase tracking-widest text-muted">
            <span>respostas: {progress.answered}</span>
            <div className="flex items-center gap-6">
              {progress.canAnalyze && (
                <button onClick={handleAnalyze} className="text-foreground border border-foreground px-4 py-1 hover:bg-foreground hover:text-background transition-all">
                  analisar
                </button>
              )}
              <button onClick={handleEndSession} className="hover:text-foreground transition-colors">
                terminar sessão
              </button>
            </div>
          </div>
        </div>

        {/* Question Area */}
        {questions.length > 0 ? (
          <div className={`flex-1 flex flex-col items-center justify-center p-6 md:p-10 overflow-hidden ${phaseClasses[phase]}`}>
            <MysticEyesOverlay />

            <div className="w-full max-w-6xl mx-auto flex-1 flex flex-col justify-center">
              {questions.map((q) => (
                <div key={q.id} className="w-full flex flex-col md:grid md:grid-cols-2 gap-10 md:gap-20 items-center justify-center relative z-10" style={phase === 'entering' ? { animationDelay: `0ms`, animationFillMode: 'both' } : undefined}>

                  {/* Left Side: Question */}
                  <div className="w-full space-y-6 md:pr-10 md:border-r border-border/50 text-center md:text-left">
                    <span className="text-[10px] uppercase tracking-widest text-muted">{q.category}</span>
                    <h2 className="text-xl md:text-3xl lg:text-4xl font-bold leading-tight tracking-tight">{q.text}</h2>
                    {q.context && <p className="text-sm text-muted leading-relaxed">{q.context}</p>}
                  </div>

                  {/* Right Side: Options & Submit */}
                  <div className="w-full max-w-md mx-auto flex flex-col items-center justify-center space-y-12">
                    <div className="w-full flex justify-center">
                      {q.type === 'slider' && (
                        <SliderInput question={q} currentValue={answers[q.id]} onSelect={(val) => handleSelect(q.id, val)} disabled={submitting} />
                      )}
                      {q.type === 'binary' && (
                        <BinaryInput question={q} currentValue={answers[q.id]} onSelect={(val) => handleSelect(q.id, val)} disabled={submitting} />
                      )}
                      {q.type === 'reflection' && (
                        <ReflectionInput question={q} currentValue={answers[q.id]} onSelect={(val) => handleSelect(q.id, val)} disabled={submitting} />
                      )}
                      {q.type === 'ranking' && (
                        <DragRankInput question={q} currentValue={answers[q.id]} onSelect={(val) => handleSelect(q.id, val)} disabled={submitting} />
                      )}
                      {(!q.type || q.type === 'multiple_choice') && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                          {q.alternatives.map((alt) => {
                            const isSelected = answers[q.id]?.alternative_id === alt.id || answers[q.id] === alt.id;
                            return (
                              <button
                                key={alt.id}
                                onClick={() => handleSelect(q.id, { alternative_id: alt.id, answer_type: 'alternative_id' })}
                                disabled={submitting}
                                className={`text-left border px-5 py-3 text-sm leading-relaxed transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${isSelected
                                  ? 'bg-foreground/10 border-foreground shadow-[0_0_15px_rgba(255,255,255,0.1)]'
                                  : 'border-border hover:border-foreground/50 hover:bg-foreground/5'
                                  }`}
                              >
                                {alt.text}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {(!(!q.type || q.type === 'multiple_choice' || q.type === 'binary' || q.type === 'slider')) && (
                      <div className="flex justify-center w-full">
                        <button
                          onClick={() => handleSubmitBlock()}
                          disabled={!isBlockComplete || submitting}
                          className="border border-foreground px-12 py-4 text-xs uppercase tracking-[0.3em] transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-foreground hover:text-background"
                        >
                          {submitting ? 'Enviando...' : 'Confirmar'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
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
                  analisar
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
