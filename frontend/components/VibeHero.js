'use client';

import { useState, useEffect } from 'react';

export default function VibeHero({ text, kicker = 'tua essência' }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(timer);
  }, []);

  if (!text) return null;

  return (
    <div
      className="text-center py-8 transition-all duration-1000 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(16px)',
      }}
    >
      <p className="text-[10px] uppercase tracking-[0.5em] text-muted mb-4">
        {kicker}
      </p>
      <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight leading-snug px-4">
        &ldquo;{text}&rdquo;
      </h1>
    </div>
  );
}
