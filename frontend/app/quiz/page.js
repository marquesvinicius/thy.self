'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getQuestions, submitAnswer, undoLastAnswer } from '@/services/api';
import Header from '@/components/Header';
import MysticBackground, { MysticEyesOverlay } from '@/components/MysticBackground';
import ProgressBar from '@/components/ProgressBar';
import MicroFeedback from '@/components/MicroFeedback';
import TutorialPopup from '@/components/TutorialPopup';
import StageTransition from '@/components/StageTransition';
import QuestionRenderer from '@/components/QuestionRenderer';
import { categoryLabel } from '@/lib/categoryLabel';
import {
  clearActiveSession,
} from '@/lib/activeSession';
import {
  narrativeLimitFor,
  setNarrativeMode,
  clearNarrativeMode,
} from '@/lib/narrativeMode';

const BLOCK_SIZE = 1;
// Pedimos 3 perguntas a mais que o bloco: ficam em memória (prefetch). Com
// só 1, quem respondia rápido pelo teclado esvaziava a fila antes de o
// servidor devolver a próxima, e a tela ficava vazia por um instante.
const FETCH_SIZE = BLOCK_SIZE + 3;

// Baselines de ritmo (segundos por pergunta) — ponto de partida da estimativa
// de tempo restante, substituídas pela mediana do ritmo real do usuário
// conforme ele responde.
const PACE_BASELINE = { objective: 8, interpretative: 25 };
const PACE_WINDOW = 7;      // mediana móvel das últimas N respostas
const PACE_CAP_MS = 120000; // pausas > 2min não entram na mediana

// Chave de sessionStorage que marca que o usuário já viu a tela de decisão
// entre BFI-2-S (objetiva) e a parte narrativa. Indexada por session_id para
// que uma nova sessão comece o fluxo do zero.
function stageTransitionKey(sessionId) {
  return `stage_transition_seen:${sessionId}`;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
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
  // Contagem por etapa (12/30 objetiva · 3/8 narrativa), vinda do backend.
  const [stageProgress, setStageProgress] = useState(null);

  // 3-phase transition: 'visible' | 'exiting' | 'entering'
  const [phase, setPhase] = useState('entering');
  // Espelho síncrono da fase: o teclado dispara mais rápido que o re-render,
  // então a trava de entrada precisa de um valor atualizado na hora.
  const phaseRef = useRef('entering');
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Fast lane (camada objetiva) ──
  // Fila de prefetch: a próxima pergunta já buscada, pronta para entrar sem
  // round-trip. Perguntas objetivas avançam de forma otimista (o POST roda
  // em background); as interpretativas mantêm o ritual completo.
  const queueRef = useRef([]);
  // Guarda ids já submetidos para ignorar cliques duplicados durante a troca.
  const submittedRef = useRef(new Set());
  // POSTs otimistas em voo — o "voltar" fica bloqueado enquanto houver um,
  // senão o undo apagaria a resposta anterior à que ainda não chegou.
  const [inFlight, setInFlight] = useState(0);
  // Ritmo real do usuário: timestamps da última resposta + amostras por camada.
  const paceRef = useRef({ lastAt: null });
  const [paceSamples, setPaceSamples] = useState({ objective: [], interpretative: [] });

  function recordPace(kind) {
    const now = Date.now();
    const last = paceRef.current.lastAt;
    paceRef.current.lastAt = now;
    if (!last) return;
    const deltaMs = now - last;
    if (deltaMs <= 0 || deltaMs > PACE_CAP_MS) return;
    setPaceSamples(prev => ({
      ...prev,
      [kind]: [...prev[kind], deltaMs / 1000].slice(-PACE_WINDOW),
    }));
  }

  // Estimativa de tempo restante do ATO atual (a parte 2 é opcional — seria
  // desonesto somá-la ao horizonte de quem ainda está na parte 1).
  function estimateRemainingMin() {
    if (!stageProgress) return null;
    const isObjective = stage === 'objective';
    const remaining = isObjective
      ? Math.max(0, stageProgress.objective_total - stageProgress.objective_answered)
      : Math.max(0, stageProgress.interpretative_total - stageProgress.interpretative_answered);
    if (remaining === 0) return null;
    const kind = isObjective ? 'objective' : 'interpretative';
    const secPerAnswer = median(paceSamples[kind]) ?? PACE_BASELINE[kind];
    return Math.max(1, Math.round((remaining * secPerAnswer) / 60));
  }

  const loadQuestions = useCallback(async (sid) => {
    try {
      const data = await getQuestions(
        sid,
        FETCH_SIZE,
        narrativeLimitFor(sid),
      );
      setProgress({
        answered: data.total_answered,
        total: data.total_answered + data.total_available,
        canAnalyze: data.can_analyze,
      });
      setStageProgress(data.stage_progress || null);

      if (data.questions.length > 0) {
        // Primeira pergunta entra na tela; o excedente vira prefetch.
        queueRef.current = data.questions.slice(BLOCK_SIZE);
        const onScreen = data.questions.slice(0, BLOCK_SIZE);
        setQuestions(onScreen);
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
        // Sem perguntas em tela ainda precisamos rotular a etapa corretamente
        // (um reload no fim do quiz não deve voltar a exibir "etapa 1/2").
        const sp = data.stage_progress;
        if (sp && sp.objective_answered >= sp.objective_total) {
          setStage('interpretative');
        }
        setPhase('visible');
      }
    } catch (err) {
      if (err?.status === 410 || err?.code === 'GONE') {
        // Uma aba antiga pode tentar retomar uma sessão já analisada. Não
        // mantenha esse id no storage: ele faria cada montagem repetir 410.
        sessionStorage.removeItem('session_id');
        clearActiveSession();
        clearNarrativeMode();
        setSessionId(null);
        router.replace('/');
        return;
      }
      console.error('Failed to load questions:', err);
    }
  }, [router]);

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
    if (submittedRef.current.has(questionId)) return;
    // Enquanto a pergunta anterior sai de cena, nenhuma resposta vale: sem
    // isso, uma tecla apertada rápido demais caía na troca de pergunta.
    if (phaseRef.current === 'exiting') return;

    setAnswers(prev => ({ ...prev, [questionId]: alternativeId }));

    const q = questions.find((x) => x.id === questionId);
    if (!q) return;

    // Fast lane: itens BFI-2-S avançam sem ritual — sem flash, sem pausa,
    // POST em background e a próxima pergunta (prefetch) entra na hora.
    // O ritual completo fica reservado à camada narrativa, o que faz a
    // mudança de ritmo entre os atos ser SENTIDA, não só anunciada.
    if (q.kind === 'objective') {
      fastSubmit(q, alternativeId);
      return;
    }

    // Pós teste de usabilidade (abril/2026): removemos os botões "Confirmar"
    // de TODOS os widgets onde a resposta não é digitável. Cada clique
    // commita imediatamente e avança. A única exceção é `reflection`, onde
    // o texto precisa ser redigido antes de ser submetido; para esta, o
    // botão "Confirmar" (externo) continua existindo e há também um botão
    // "Pular" para quem não consegue se lembrar de uma situação específica.
    const isAutoSubmit = q.type !== 'reflection';

    if (isAutoSubmit) {
      const immediateAnswers = { ...answers, [questionId]: alternativeId };
      if (Object.keys(immediateAnswers).length === questions.length) {
        handleSubmitBlock(immediateAnswers);
      }
    }
  };

  /**
   * Fast lane da camada objetiva: avança a UI imediatamente e envia a
   * resposta em background. Se o envio falhar, ressincroniza do servidor
   * (o botão "voltar" continua sendo a rede de segurança de correção).
   */
  async function fastSubmit(question, payload) {
    submittedRef.current.add(question.id);
    recordPace('objective');
    setInFlight(n => n + 1);

    // Reabastecimentos disparados por respostas rápidas podem chegar fora de
    // ordem e trazer de volta uma pergunta já respondida (ou a que está na
    // tela). Mostrá-la de novo travava o quiz, porque o clique nela é
    // ignorado. Por isso a fila é conferida na hora de tirar a próxima.
    let next = null;
    while (queueRef.current.length > 0) {
      const candidate = queueRef.current.shift();
      if (candidate.id !== question.id && !submittedRef.current.has(candidate.id)) {
        next = candidate;
        break;
      }
    }

    phaseRef.current = 'exiting';
    setPhase('exiting');
    setTimeout(() => {
      if (next) {
        setQuestions([next]);
        setAnswers({});
        const nextIsInterpretative = next.kind !== 'objective';
        setStage(nextIsInterpretative ? 'interpretative' : 'objective');
        if (nextIsInterpretative) {
          maybeShowStageDecision();
        }
        setPhase('entering');
        setTimeout(() => setPhase('visible'), 250);
      }
      // Sem prefetch disponível: o refill abaixo (pós-POST) recarrega tudo.
    }, 140);

    try {
      const res = await submitAnswer(sessionId, question.id, payload);
      setProgress(prev => ({
        ...prev,
        answered: res.progress.answered,
        canAnalyze: res.progress.can_analyze,
      }));
      setStageProgress(prev => (prev
        ? { ...prev, objective_answered: res.progress.objective_answered }
        : prev));

      if (!next) {
        // Fila secou (última objetiva ou prefetch perdido): busca completa,
        // que também detecta a fronteira entre atos.
        await loadQuestions(sessionId);
      } else {
        await refillQueue(next.id);
      }
    } catch (err) {
      console.error('Falha ao salvar resposta (fast lane):', err);
      submittedRef.current.delete(question.id);
      setUndoError('Uma resposta não foi salva — recarregando para ressincronizar.');
      queueRef.current = [];
      await loadQuestions(sessionId);
    } finally {
      setInFlight(n => Math.max(0, n - 1));
    }
  }

  /** Reabastece o prefetch com a pergunta seguinte à que está na tela. */
  async function refillQueue(currentQuestionId) {
    try {
      const data = await getQuestions(
        sessionId,
        FETCH_SIZE,
        narrativeLimitFor(sessionId),
      );
      setProgress({
        answered: data.total_answered,
        total: data.total_answered + data.total_available,
        canAnalyze: data.can_analyze,
      });
      setStageProgress(data.stage_progress || null);
      queueRef.current = (data.questions || []).filter(
        q => q.id !== currentQuestionId && !submittedRef.current.has(q.id)
      ).slice(0, FETCH_SIZE - BLOCK_SIZE);
    } catch (err) {
      // Prefetch é otimização: se falhar, o fluxo cai no caminho com loading.
      queueRef.current = [];
      if (err?.status === 410 || err?.code === 'GONE') {
        sessionStorage.removeItem('session_id');
        clearActiveSession();
        clearNarrativeMode();
        setSessionId(null);
        router.replace('/');
      }
    }
  }

  /** Mostra a tela de decisão entre atos (uma vez por sessão). */
  function maybeShowStageDecision() {
    let alreadySeen = false;
    try {
      alreadySeen = !!sessionStorage.getItem(stageTransitionKey(sessionId));
    } catch {}
    if (!alreadySeen) setShowStageTransition(true);
  }

  async function handleSubmitBlock(immediateAnswers = null) {
    const submitData = (immediateAnswers && !immediateAnswers.nativeEvent) ? immediateAnswers : answers;
    const readyToSubmit = questions.length > 0 && Object.keys(submitData).length === questions.length;

    if (submitting || !readyToSubmit) return;
    setSubmitting(true);
    recordPace('interpretative');

    // Flash oracular
    setFlashing(true);
    setTimeout(() => setFlashing(false), 550);

    // Notifica os olhos do MysticBackground: eles olham para o centro da
    // tela (onde o usuário acabou de agir) e contraem a pupila junto com
    // o flash — o observador percebeu a escolha.
    try {
      window.dispatchEvent(new CustomEvent('thyself:answered'));
    } catch {}

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
        if (!payload) continue;

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
      // A pergunta desfeita volta à tela e precisa aceitar resposta de novo:
      // sem limpar a marca local de "já respondida", o clique era ignorado e o
      // quiz travava. Limpar tudo é seguro — o voltar só funciona sem envio
      // em andamento, e a recarga abaixo traz o estado real do servidor.
      submittedRef.current.clear();
      queueRef.current = [];
      // A ordem persistida no servidor faz a pergunta desfeita voltar
      // naturalmente ao topo do próximo trecho.
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

  async function handleSkipQuestion(questionId, questionType = 'reflection') {
    if (submitting) return;
    // Pular vale para TODA a camada narrativa (nenhuma delas altera escores).
    // Submete resposta com alternative_id null — `getInterpretativeSignals`
    // descarta linhas sem conteúdo útil, então a pergunta conta como
    // respondida mas NÃO polui o contexto enviado à LLM. O backend rejeita
    // skip em perguntas objetivas (guard no answer.service).
    const skipPayload = {
      alternative_id: null,
      answer_type: questionType === 'reflection' ? 'reflection' : 'skipped',
      user_observation: '',
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

  /**
   * Escolha do ato narrativo na tela de decisão: 'short' (teto de perguntas)
   * ou 'full' (catálogo inteiro). Persiste o modo, marca a tela como vista e
   * recarrega o bloco já sob o novo teto — o `total_available` do backend
   * muda, então a barra de progresso precisa ser refeita.
   */
  const handleChooseNarrativeMode = async (mode) => {
    if (sessionId) {
      setNarrativeMode(sessionId, mode);
      try {
        sessionStorage.setItem(stageTransitionKey(sessionId), '1');
      } catch {}
    }
    setShowStageTransition(false);
    queueRef.current = [];
    await loadQuestions(sessionId);
  };

  function handleAnalyze() {
    sessionStorage.setItem('session_id', sessionId);
    // Avaliação concluída — não há mais o que retomar.
    clearActiveSession();
    clearNarrativeMode();
    router.push('/result?analyze=1');
  }

  function handleEndSession() {
    sessionStorage.removeItem('session_id');
    clearActiveSession();
    clearNarrativeMode();
    router.push('/');
  }

  // "Pausar — continuo depois": volta à landing SEM limpar o marcador de
  // sessão ativa; o banner "continuar de onde parei" cuida da volta.
  function handlePauseSession() {
    router.push('/');
  }

  const phaseClasses = {
    exiting: 'opacity-0 -translate-y-4 transition-all duration-300',
    entering: 'animate-fade-in-up',
    visible: 'opacity-100 translate-y-0 transition-all duration-500',
  };

  if (!sessionId) return null;

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <MysticBackground showEyes={false} />
      {showFeedback && (
        <MicroFeedback
          key={`feedback-${progress.answered}`}
          onComplete={handleFeedbackComplete}
        />
      )}

      {/* Ritual de passagem entre BFI-2-S e parte narrativa. Tem prioridade
          sobre o TutorialPopup de widget: se o usuário estiver vendo o card
          de transição, adiamos o tutorial de reflection/etc. até ele clicar
          em "continuar" — assim as duas camadas não aparecem empilhadas. */}
      {showStageTransition && (
        <StageTransition
          onChoose={handleChooseNarrativeMode}
          onAnalyze={handleAnalyze}
          onPause={handlePauseSession}
          narrativeTotal={stageProgress?.interpretative_total ?? null}
        />
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

      <main className="flex-1 flex flex-col pt-16 md:pt-20 relative z-[1] overflow-x-hidden">
        {/* Anúncio para leitor de tela. A troca de pergunta é puramente
            visual (animação + troca de nó); sem uma região live, quem usa
            leitor de tela não recebe aviso nenhum de que avançou. */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {questions.length > 0
            ? `Pergunta ${progress.answered + 1} de ${progress.total}. ${questions[0]?.text ?? ''}`
            : ''}
        </div>

        {/* Status bar */}
        <div className="flex flex-col gap-3 px-5 sm:px-6 md:px-10 py-4 border-b border-border">
          <ProgressBar current={progress.answered} total={progress.total} />
          <div className="flex flex-wrap items-center gap-5 text-[10px] uppercase tracking-widest text-muted">
            <span>respostas: {progress.answered}</span>
            {/* Indicador discreto da etapa atual. Referencia o mesmo texto
                usado no card de transição (StageTransition) para reforçar
                a separação entre camadas quantitativa e narrativa. */}
            <span className="hidden sm:inline text-faint">
              <span className="text-muted/40">·</span>{' '}
              {stage === 'objective'
                ? `etapa 1/2 — BFI-2-S${
                    stageProgress
                      ? ` · ${stageProgress.objective_answered}/${stageProgress.objective_total}`
                      : ''
                  }`
                : `etapa 2/2 — narrativa${
                    stageProgress
                      ? ` · ${stageProgress.interpretative_answered}/${stageProgress.interpretative_total}`
                      : ''
                  }`}
            </span>
            {/* Horizonte honesto: estimativa do ato atual, calibrada pelo
                ritmo real do usuário (baseline → mediana móvel). */}
            {estimateRemainingMin() !== null && (
              <span className="hidden md:inline text-faint">
                <span className="text-muted/40">·</span>{' '}
                ~{estimateRemainingMin()} min restantes
              </span>
            )}
          </div>
          {undoError && (
            <p className="text-[10px] text-foreground/80 tracking-wider">
              {undoError}
            </p>
          )}
        </div>

        {/* Ações abaixo da linha divisória */}
        <div className="flex flex-wrap justify-between items-center gap-3 px-5 sm:px-6 md:px-10 py-2 md:py-3 text-[11px] md:text-[10px] uppercase tracking-widest text-muted">
          <button
            onClick={handleUndo}
            disabled={undoing || submitting || inFlight > 0 || progress.answered === 0}
            className="inline-flex items-center gap-2 min-h-11 md:min-h-0 py-2 md:py-0 hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Desfazer a última resposta"
          >
            <span aria-hidden="true">←</span>
            {undoing ? 'voltando...' : 'voltar'}
          </button>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-6">
            {progress.canAnalyze && (
              <button onClick={handleAnalyze} className="text-foreground border border-foreground min-h-11 md:min-h-0 px-4 py-2 md:py-1 hover:bg-foreground hover:text-background transition-all">
                analisar
              </button>
            )}
            <button onClick={handleEndSession} className="min-h-11 md:min-h-0 px-2 py-2 md:py-0 hover:text-foreground transition-colors">
              terminar sessão
            </button>
          </div>
        </div>

        {/* Question Area */}
        {questions.length > 0 ? (
          <div className={`flex-1 flex flex-col items-center justify-start md:justify-center px-5 py-6 sm:px-6 sm:py-8 md:p-10 overflow-x-hidden md:overflow-hidden ${phaseClasses[phase]}`}>
            <MysticEyesOverlay />

            <div className="w-full max-w-6xl mx-auto min-w-0 flex-1 flex flex-col justify-start md:justify-center">
              {questions.map((q) => (
                <div key={q.id} className="w-full min-w-0 flex flex-col md:grid md:grid-cols-2 gap-8 md:gap-20 items-center justify-center relative z-10" style={phase === 'entering' ? { animationDelay: `0ms`, animationFillMode: 'both' } : undefined}>

                  {/* Left Side: Question */}
                  <div className={`w-full min-w-0 space-y-6 md:space-y-6 md:pr-10 md:border-r border-border/50 text-center md:text-left ${
                    q.kind === 'interpretative' ? 'md:pr-14' : ''
                  }`}>
                    <span className="text-[10px] uppercase tracking-widest text-muted">
                      {q.kind === 'objective' ? 'BFI-2-S' : categoryLabel(q.category)}
                    </span>
                    <h2
                      id={`question-${q.id}-text`}
                      className={`font-bold leading-tight tracking-tight break-words text-balance ${
                        q.kind === 'interpretative'
                          ? 'text-2xl md:text-3xl lg:text-4xl'
                          : 'text-xl md:text-2xl lg:text-3xl'
                      }`}
                    >
                      {q.text}
                    </h2>
                    {q.context && <p className="text-sm md:text-base text-muted leading-relaxed break-words">{q.context}</p>}
                  </div>

                  {/* Right Side: Options & Submit */}
                  <div className="w-full max-w-md min-w-0 mx-auto flex flex-col items-center justify-center space-y-10 md:space-y-12">
                    {/* As opções formam um grupo semanticamente ligado ao
                        enunciado: sem isso, o leitor de tela anuncia cinco
                        botões soltos, sem dizer a que pergunta respondem. */}
                    <div
                      className="w-full flex justify-center"
                      role="group"
                      aria-labelledby={`question-${q.id}-text`}
                    >
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
                      /* Pular à esquerda e confirmar à direita (ação principal no
                         fim da leitura). No celular, em coluna, confirmar fica em cima. */
                      <div className="flex flex-col-reverse sm:flex-row items-center justify-center gap-3 sm:gap-6 w-full">
                        <button
                          onClick={() => handleSkipQuestion(q.id, 'reflection')}
                          disabled={submitting}
                          className="text-[11px] uppercase tracking-[0.3em] text-muted hover:text-foreground transition-colors underline underline-offset-4 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Pule quando não se lembrar de uma situação específica"
                        >
                          pular pergunta
                        </button>
                        <button
                          onClick={() => handleSubmitBlock()}
                          disabled={!isBlockComplete || submitting}
                          className="border border-foreground px-10 py-4 text-xs uppercase tracking-[0.3em] transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-foreground hover:text-background"
                        >
                          {submitting ? 'Enviando...' : 'Confirmar'}
                        </button>
                      </div>
                    )}

                    {/* Pular vale para TODA a narrativa — nada aqui altera
                        escores, e o custo de pular é declarado, não escondido. */}
                    {q.kind === 'interpretative' && q.type !== 'reflection' && (
                      <button
                        onClick={() => handleSkipQuestion(q.id, q.type)}
                        disabled={submitting}
                        className="text-[10px] uppercase tracking-[0.25em] text-faint hover:text-foreground transition-colors underline underline-offset-4 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Não altera seu escore — mas é menos material seu na leitura final"
                      >
                        pular — não altera seu escore
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center px-5 py-8">
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
