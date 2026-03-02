'use client';

import { useState, useEffect } from 'react';

const ORACLE_PHRASES = [
  'Calculando seus traços...',
  'Consultando os arquivos históricos...',
  'Lendo entre as linhas...',
  'Compondo sua narrativa...',
  'Decifrando padrões ocultos...',
  'Conectando referências...',
];

const ROTATION_INTERVAL = 3000;

export default function ImmersiveLoader() {
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      // Fade out
      setFade(false);

      // After fade-out completes, change text and fade in
      setTimeout(() => {
        setIndex(prev => (prev + 1) % ORACLE_PHRASES.length);
        setFade(true);
      }, 400);
    }, ROTATION_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8">
      <div className="relative">
        {/* Pulsating central dot */}
        <div className="w-2 h-2 rounded-full bg-foreground/40 animate-pulse-dot mx-auto" />
      </div>

      <p
        className="text-xs uppercase tracking-[0.3em] text-muted text-center transition-all duration-400 ease-in-out"
        style={{
          opacity: fade ? 1 : 0,
          transform: fade ? 'translateY(0)' : 'translateY(-6px)',
        }}
      >
        {ORACLE_PHRASES[index]}
      </p>
    </div>
  );
}
