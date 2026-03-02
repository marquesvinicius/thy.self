'use client';

import { useState, useEffect } from 'react';

export default function CulturalCard({ reference, index = 0, animate = true }) {
  const [visible, setVisible] = useState(!animate);

  useEffect(() => {
    if (!animate) {
      setVisible(true);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 400 + index * 200);
    return () => clearTimeout(timer);
  }, [animate, index]);

  const { categoria, nome, motivo, image_url } = reference;

  return (
    <div
      className="border border-border overflow-hidden transition-all duration-700 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
      }}
    >
      {/* Image area */}
      <div className="aspect-[4/3] bg-surface relative overflow-hidden">
        {image_url ? (
          <img
            src={image_url}
            alt={nome}
            className="w-full h-full object-cover opacity-80"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl text-muted/20 font-bold tracking-tighter">
              {nome?.charAt(0) || '?'}
            </span>
          </div>
        )}

        {/* Category badge */}
        <div className="absolute top-3 left-3">
          <span className="text-[9px] uppercase tracking-[0.2em] bg-background/80 backdrop-blur-sm border border-border px-2 py-1">
            {categoria}
          </span>
        </div>
      </div>

      {/* Text area */}
      <div className="p-4 space-y-2">
        <h3 className="text-sm font-bold tracking-tight">
          {nome}
        </h3>
        <p className="text-[11px] leading-relaxed text-muted">
          {motivo}
        </p>
      </div>
    </div>
  );
}
