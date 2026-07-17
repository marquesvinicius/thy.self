'use client';

import { useState, useEffect } from 'react';

export default function DimensionBar({ dimension, consistency = null, animate = false, delay = 0 }) {
  const [visible, setVisible] = useState(!animate);
  const [displayScore, setDisplayScore] = useState(animate ? 0 : dimension.score);

  // Delay before revealing
  useEffect(() => {
    if (!animate) {
      setVisible(true);
      setDisplayScore(dimension.score);
      return;
    }
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [animate, delay, dimension.score]);

  // Animate number counting from 0 to score
  useEffect(() => {
    if (!visible || !animate) return;

    const target = dimension.score;
    const duration = 1000;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(eased * target * 10) / 10);
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }, [visible, animate, dimension.score]);

  return (
    <div
      className={animate ? 'animate-stagger' : ''}
      style={animate ? { animationDelay: `${delay}ms` } : undefined}
    >
      <div className="border border-border p-4 md:p-6">
        <div className="flex items-baseline justify-between mb-1">
          <div className="flex items-baseline gap-3">
            <span className="text-2xl md:text-3xl font-bold tracking-tight">
              {dimension.key}
            </span>
            <span className="text-xs uppercase tracking-widest text-muted">
              {dimension.name}
            </span>
          </div>
          <span className="text-2xl md:text-3xl font-bold tabular-nums">
            {Math.round(displayScore)}
          </span>
        </div>

        <div className="w-full h-1 bg-border mt-3 mb-3">
          <div
            className="h-full bg-foreground transition-all duration-1000 ease-out"
            style={{ width: visible ? `${dimension.score}%` : '0%' }}
          />
        </div>

        <div className="flex justify-between text-[10px] uppercase tracking-widest text-muted">
          <span>{dimension.lowLabel}</span>
          <span className="text-foreground/60">{dimension.level}</span>
          <span>{dimension.highLabel}</span>
        </div>

        {dimension.description && (
          <p className="text-[11px] leading-relaxed text-muted/70 mt-3 pt-3 border-t border-border/50">
            {dimension.description}
          </p>
        )}

        {/* RF006 — tensão interna: as respostas deste eixo oscilaram entre
            extremos (desvio-padrão > 1.2 na escala Likert do BFI-2-S). */}
        {consistency?.tension && (
          <div className="mt-3 pt-3 border-t border-border/50 flex items-start gap-2">
            <span className="text-foreground/80 text-xs leading-none mt-[2px]">◆</span>
            <p className="text-[10px] uppercase tracking-[0.2em] text-foreground/70 leading-relaxed">
              tensão interna detectada
              <span className="normal-case tracking-normal text-muted/80 block mt-1 text-[11px]">
                suas respostas oscilaram entre extremos neste eixo
                (desvio {consistency.stddev}) — o escore médio esconde uma ambivalência real.
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
