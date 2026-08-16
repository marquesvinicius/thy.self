'use client';

import { useEffect } from 'react';

/**
 * ModalShell — casca compartilhada dos modais do site.
 *
 * Identidade visual: painel de borda dupla com o rótulo "flutuando" sobre a
 * borda superior (mesma linguagem do DisclaimerGate), fundo preto, tipografia
 * uppercase espaçada. Comportamento: fecha por ESC, clique no backdrop ou no
 * botão; trava o scroll do body enquanto aberto.
 *
 * Props:
 *   open, onClose  — controle externo.
 *   label          — rótulo curto flutuante na borda (ex.: "revisar respostas").
 *   maxWidth       — classe Tailwind do painel (default 'max-w-2xl').
 *   children       — conteúdo (o shell fornece o scroll interno).
 */
export default function ModalShell({
  open = false,
  onClose,
  label = '',
  maxWidth = 'max-w-2xl',
  children,
}) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = event => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm p-4 md:p-8"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className={`relative w-full ${maxWidth} max-h-[88vh] flex flex-col border-2 border-foreground/60 bg-background shadow-[0_0_60px_rgba(255,255,255,0.06)] animate-fade-in-up`}
      >
        {/* Rótulo flutuante sobre a borda superior (assinatura visual do site) */}
        {label && (
          <div className="absolute -top-3 left-6 px-3 bg-background">
            <p className="text-[10px] uppercase tracking-[0.4em] text-foreground font-bold">
              {label}
            </p>
          </div>
        )}

        {/* Botão fechar flutuante na borda, alinhado à direita */}
        <div className="absolute -top-3 right-6 px-3 bg-background">
          <button
            onClick={onClose}
            className="text-[10px] uppercase tracking-[0.3em] text-muted hover:text-foreground transition-colors inline-flex items-center gap-2"
            title="Fechar (Esc)"
          >
            <span aria-hidden="true">×</span> fechar
          </button>
        </div>

        {/* Área rolável do conteúdo */}
        <div className="overflow-y-auto pt-7 pb-6 px-5 md:px-8">
          {children}
        </div>
      </div>
    </div>
  );
}
