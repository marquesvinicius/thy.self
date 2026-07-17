'use client';

import { useState, useEffect } from 'react';

/**
 * Loader narrativo do pipeline de análise (RF004 → RF005 → RF007).
 *
 * Em vez de frases aleatórias, a espera narra as etapas reais da
 * arquitetura dual-core na ordem em que acontecem no backend:
 *   1. cálculo determinístico dos escores (BigFiveEngine)
 *   2. arquétipo mais próximo por distância euclidiana (Postgres RPC)
 *   3. interpretação narrativa via LLM (a etapa mais longa)
 *
 * As durações são estimativas de UX, não telemetria — o backend responde
 * numa única chamada. Depois da última etapa, frases de espera suaves
 * entram em rotação para chamadas mais lentas da LLM.
 */
const PIPELINE_STAGES = [
  { label: 'calculando seus traços', detail: 'motor determinístico · 30 itens BFI-2-S', duration: 2600 },
  { label: 'buscando seu arquétipo', detail: 'distância euclidiana · 2.125 personagens', duration: 2600 },
  { label: 'compondo sua narrativa', detail: 'interpretação qualitativa via IA', duration: 3200 },
];

const WAITING_PHRASES = [
  'Lendo entre as linhas...',
  'Conectando referências...',
  'Decifrando padrões ocultos...',
  'Quase lá...',
];

const WAITING_ROTATION = 3000;

export default function ImmersiveLoader() {
  const [stageIndex, setStageIndex] = useState(0);
  const [waitingIndex, setWaitingIndex] = useState(0);
  const [fade, setFade] = useState(true);

  const inPipeline = stageIndex < PIPELINE_STAGES.length;

  // Avança pelas etapas do pipeline uma única vez.
  useEffect(() => {
    if (!inPipeline) return;

    const timer = setTimeout(() => {
      setFade(false);
      setTimeout(() => {
        setStageIndex(prev => prev + 1);
        setFade(true);
      }, 400);
    }, PIPELINE_STAGES[stageIndex].duration);

    return () => clearTimeout(timer);
  }, [stageIndex, inPipeline]);

  // Depois do pipeline, rotaciona frases de espera.
  useEffect(() => {
    if (inPipeline) return;

    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setWaitingIndex(prev => (prev + 1) % WAITING_PHRASES.length);
        setFade(true);
      }, 400);
    }, WAITING_ROTATION);

    return () => clearInterval(interval);
  }, [inPipeline]);

  const stage = inPipeline ? PIPELINE_STAGES[stageIndex] : null;

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8">
      <div className="relative">
        {/* Pulsating central dot */}
        <div className="w-2 h-2 rounded-full bg-foreground/40 animate-pulse-dot mx-auto" />
      </div>

      <div
        className="text-center space-y-2 transition-all duration-400 ease-in-out"
        style={{
          opacity: fade ? 1 : 0,
          transform: fade ? 'translateY(0)' : 'translateY(-6px)',
        }}
      >
        {stage ? (
          <>
            <p className="text-[9px] uppercase tracking-[0.35em] text-muted/60">
              etapa {stageIndex + 1} de {PIPELINE_STAGES.length}
            </p>
            <p className="text-xs uppercase tracking-[0.3em] text-muted">
              {stage.label}
            </p>
            <p className="text-[10px] tracking-[0.15em] text-muted/50">
              {stage.detail}
            </p>
          </>
        ) : (
          <p className="text-xs uppercase tracking-[0.3em] text-muted">
            {WAITING_PHRASES[waitingIndex]}
          </p>
        )}
      </div>

      {/* Marcadores das etapas */}
      <div className="flex items-center gap-2" aria-hidden="true">
        {PIPELINE_STAGES.map((s, i) => (
          <span
            key={s.label}
            className={`h-1 w-6 transition-all duration-500 ${
              !inPipeline || i < stageIndex
                ? 'bg-foreground/60'
                : i === stageIndex
                  ? 'bg-foreground/60 animate-pulse'
                  : 'bg-border'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
