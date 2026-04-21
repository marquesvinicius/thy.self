'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getQuestions, submitAnswer, undoLastAnswer } from '@/services/api';
import Header from '@/components/Header';
import MysticBackground, { MysticEyesOverlay } from '@/components/MysticBackground';
import ProgressBar from '@/components/ProgressBar';
import MicroFeedback from '@/components/MicroFeedback';
import TutorialPopup from '@/components/TutorialPopup';
import StageTransition from '@/components/StageTransition';
import QuestionRenderer from '@/components/QuestionRenderer';

const BLOCK_SIZE = 1;

// Chave de sessionStorage que marca que o usuário já viu o ritual de passagem
// entre BFI-2-S (objetiva) e a parte narrativa. Indexada por session_id para
// que uma nova sessão comece o fluxo do zero.
function stageTransitionKey(sessionId) {
  return `stage_transition_seen:${sessionId}`;
}

export default function Quiz() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState(null);

  // State for blocks
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({}); // { questionId: alternativeId }
  const [progress, setProgress] = useState({ answered: 0, total: 0, canAnalyze: false });

  const [submitting, setSubmitting] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState(null);
  const [flashing, setFlashing] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [pendingTutorials, setPendingTutorials] = useState([]);
  // Ritual de passagem BFI-2-S → narrativa. Acionado na primeira vez que o
  // backend serve uma pergunta de kind=interpretative (o picker prioriza
  // objetivas, então isso só acontece quando TODAS as 30 BFI-2-S foram
  // respondidas). Persistimos a flag em sessionStorage por session_id.
  const [showStageTransition, setShowStageTransition] = useState(false);
  // Etapa atual, usada no indicador discreto da barra de status.
  // 'objective' enquanto houver BFI-2-S pendente, 'interpretative' depois.
  const [stage, setStage] = useState('objective');

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

        // Detecta transição objetiva → interpretativa. Como o picker do
        // backend sempre esgota as BFI-2-S antes de servir uma interpretativa,
        // a primeira pergunta de kind=interpretative neste bloco é garantida
        // de ser a passagem entre etapas. Mostramos o card uma única vez
        // por sessão; se o usuário recarregar, a flag em sessionStorage
        // evita reexibição.
        const firstKind = data.questions[0]?.kind || 'interpretative';
        setStage(firstKind === 'objective' ? 'objective' : 'interpretative');

        if (firstKind === 'interpretative') {
          let alreadySeen = false;
          try {
            alreadySeen = !!sessionStorage.getItem(stageTransitionKey(sid));
          } catch {}
          if (!alreadySeen) {
            setShowStageTransition(true);
          }
        }

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
    // Pós teste de usabilidade (abril/2026): removemos os botões "Confirmar"
    // de TODOS os widgets onde a resposta não é digitável. Cada clique
    // commita imediatamente e avança. A única exceção é `reflection`, onde
    // o texto precisa ser redigido antes de ser submetido; para esta, o
    // botão "Confirmar" (externo) continua existindo e há também um botão
    // "Pular" para quem não consegue se lembrar de uma situação específica.
    const isAutoSubmit = q && q.type !== 'reflection';

    if (isAutoSubmit) {
      const immediateAnswers = { ...answers, [questionId]: alternativeId };
      // Ignora estados parciais de ranking (ainda montando a ordenação).
      if (alternativeId?.answer_type === 'ranking_incomplete') return;
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

  async function handleUndo() {
    if (undoing || submitting || !sessionId) return;
    setUndoError(null);
    setUndoing(true);
    try {
      await undoLastAnswer(sessionId);
      // Recarrega o bloco de perguntas — a pergunta desfeita voltará a
      // aparecer, pois o backend a reabre ao deletar a resposta.
      setAnswers({});
      await loadQuestions(sessionId);
    } catch (err) {
      console.error('Falha ao desfazer resposta:', err);
      const message = err?.message || '';
      if (message.includes('Não há respostas') || message.includes('não há respostas')) {
        setUndoError('Nada a desfazer — você ainda não respondeu nenhuma pergunta.');
      } else {
        setUndoError('Não consegui desfazer. Tente novamente.');
      }
    } finally {
      setUndoing(false);
    }
  }

  async function handleSkipReflection(questionId) {
    if (submitting) return;
    // Usuário optou por pular a pergunta dissertativa. Submete resposta
    // com user_observation vazio e alternative_id null — a migração 002
    // tornou `alternative_id` opcional, e `getInterpretativeSignals`
    // descarta linhas sem conteúdo útil (nem alternativa nem observação),
    // então a pergunta conta como respondida mas NÃO polui o contexto
    // narrativo enviado à LLM.
    const skipPayload = {
      alternative_id: null,
      answer_type: 'reflection',
      user_observation: '',
      slider_value: null,
    };
    const immediateAnswers = { ...answers, [questionId]: skipPayload };
    setAnswers(immediateAnswers);
    await handleSubmitBlock(immediateAnswers);
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

  const handleStageTransitionContinue = () => {
    setShowStageTransition(false);
    if (sessionId) {
      try {
        sessionStorage.setItem(stageTransitionKey(sessionId), '1');
      } catch {}
    }
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

      {/* Ritual de passagem entre BFI-2-S e parte narrativa. Tem prioridade
          sobre o TutorialPopup de widget: se o usuário estiver vendo o card
          de transição, adiamos o tutorial de reflection/etc. até ele clicar
          em "continuar" — assim as duas camadas não aparecem empilhadas. */}
      {showStageTransition && (
        <StageTransition onContinue={handleStageTransitionContinue} />
      )}

      {pendingTutorials.length > 0 && !showStageTransition && (
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
          <div className="flex flex-wrap justify-between gap-3 text-[10px] uppercase tracking-widest text-muted">
            <div className="flex items-center gap-5">
              <span>respostas: {progress.answered}</span>
              {/* Indicador discreto da etapa atual. Referencia o mesmo texto
                  usado no card de transição (StageTransition) para reforçar
                  a separação entre camadas quantitativa e narrativa. */}
              <span className="hidden sm:inline text-muted/60">
                <span className="text-muted/40">·</span>{' '}
                {stage === 'objective'
                  ? 'etapa 1/2 — BFI-2-S'
                  : 'etapa 2/2 — narrativa'}
              </span>
              <button
                onClick={handleUndo}
                disabled={undoing || submitting || progress.answered === 0}
                className="inline-flex items-center gap-2 hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Desfazer a última resposta"
              >
                <span aria-hidden="true">←</span>
                {undoing ? 'voltando...' : 'voltar'}
              </button>
            </div>
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
          {undoError && (
            <p className="text-[10px] text-foreground/80 tracking-wider">
              {undoError}
            </p>
          )}
        </div>

        {/* Question Area */}
        {questions.length > 0 ? (
          <div className={`flex-1 flex flex-col items-center justify-center p-6 md:p-10 overflow-hidden ${phaseClasses[phase]}`}>
            <MysticEyesOverlay />

            <div className="w-full max-w-6xl mx-auto flex-1 flex flex-col justify-center">
              {questions.map((q) => (
                <div key={q.id} className="w-full flex flex-col md:grid md:grid-cols-2 gap-10 md:gap-20 items-center justify-center relative z-10" style={phase === 'entering' ? { animationDelay: `0ms`, animationFillMode: 'both' } : undefined}>

                  {/* Left Side: Question */}
                  <div className={`w-full space-y-6 md:pr-10 md:border-r border-border/50 text-center md:text-left ${
                    q.kind === 'interpretative' ? 'md:pr-14' : ''
                  }`}>
                    <span className="text-[10px] uppercase tracking-widest text-muted">
                      {q.kind === 'objective' ? 'BFI-2-S' : q.category}
                    </span>
                    <h2 className={`font-bold leading-tight tracking-tight ${
                      q.kind === 'interpretative'
                        ? 'text-2xl md:text-4xl lg:text-5xl'
                        : 'text-xl md:text-3xl lg:text-4xl'
                    }`}>
                      {q.text}
                    </h2>
                    {q.context && <p className="text-sm md:text-base text-muted leading-relaxed">{q.context}</p>}
                  </div>

                  {/* Right Side: Options & Submit */}
                  <div className="w-full max-w-md mx-auto flex flex-col items-center justify-center space-y-12">
                    <div className="w-full flex justify-center">
                      <QuestionRenderer
                        question={q}
                        value={answers[q.id]}
                        onSelect={(val) => handleSelect(q.id, val)}
                        disabled={submitting}
                      />
                    </div>

                    {/* Botão "Confirmar" só aparece para respostas digitáveis
                        (reflection). Pós teste de usabilidade de abril/2026,
                        todos os outros widgets commitam diretamente no clique. */}
                    {q.type === 'reflection' && (
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
                        <button
                          onClick={() => handleSubmitBlock()}
                          disabled={!isBlockComplete || submitting}
                          className="border border-foreground px-10 py-4 text-xs uppercase tracking-[0.3em] transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-foreground hover:text-background"
                        >
                          {submitting ? 'Enviando...' : 'Confirmar'}
                        </button>
                        <button
                          onClick={() => handleSkipReflection(q.id)}
                          disabled={submitting}
                          className="text-[11px] uppercase tracking-[0.3em] text-muted hover:text-foreground transition-colors underline underline-offset-4 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Pule quando não se lembrar de uma situação específica"
                        >
                          pular pergunta
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
