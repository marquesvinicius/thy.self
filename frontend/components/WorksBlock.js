'use client';

import { useEffect, useState } from 'react';

export default function WorksBlock({ works = [], delay = 1200 }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  if (!Array.isArray(works) || works.length === 0) return null;

  return (
    <section
      className="transition-all duration-1000 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
      }}
      >
      <p className="text-[10px] uppercase tracking-[0.4em] text-muted mb-4">
        obras culturais em destaque
      </p>
      <div className="space-y-3">
        {works.map((work, index) => (
          <article
            key={`${work.tipo || 'obra'}-${work.titulo || index}-${index}`}
            className="border border-border p-4 space-y-2 bg-surface/30"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold tracking-tight">{work.titulo}</h3>
              <span className="text-[9px] uppercase tracking-[0.2em] text-muted">
                {work.tipo}
              </span>
            </div>
            {work.autor_ou_artista && (
              <p className="text-[11px] text-foreground/70">{work.autor_ou_artista}</p>
            )}
            <p className="text-[11px] leading-relaxed text-muted">{work.motivo}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
