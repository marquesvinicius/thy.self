'use client';

import { useState, useEffect } from 'react';

export default function NarrativeBlock({ text, delay = 1800 }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  if (!text) return null;

  return (
    <div
      className="transition-all duration-1000 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
      }}
    >
      <div className="border-l border-muted/30 pl-6 py-2">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted mb-4">
          interpretação
        </p>
        <p className="text-sm md:text-base leading-relaxed text-foreground/80 italic">
          {text}
        </p>
      </div>
    </div>
  );
}
