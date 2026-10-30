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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/85 backdrop-blur-sm p-4 md:p-8"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className={`relative w-full ${maxWidth} max-h-[88vh] max-h-[85dvh] flex flex-col pt-5 border-2 border-foreground/60 bg-background animate-fade-in-up`}
      >
        {/* Rótulo flutuante sobre a borda superior (assinatura visual do site) */}
        {label && (
          <div className="absolute -top-3 left-6 px-3 bg-background">
            <p className="text-xs uppercase tracking-[0.18em] md:tracking-[0.4em] text-foreground font-bold">
              {label}
            </p>
          </div>
        )}

        {/* Botão fechar flutuante na borda, alinhado à direita */}
        <div className="hidden md:block absolute -top-3 right-6 px-3 bg-background">
          <button
            onClick={onClose}
            className="text-xs uppercase tracking-[0.15em] md:tracking-[0.3em] text-muted hover:text-foreground transition-colors inline-flex items-center gap-2"
            title="Fechar (Esc)"
          >
            <span aria-hidden="true">×</span> fechar
          </button>
        </div>

        {/* Área rolável do conteúdo. O respiro do topo é do painel (pt-5), não
            daqui: assim o conteúdo some sob a borda em vez de passar por baixo
            dos rótulos flutuantes. As bordas esmaecem para o corte não ser seco. */}
        <div className="overflow-y-auto py-4 pb-6 px-5 md:px-8 [mask-image:linear-gradient(to_bottom,transparent,black_16px,black_calc(100%-16px),transparent)]">
          {children}
        </div>

        {/* No celular o "fechar" da borda é pequeno e pode ficar fora do
            alcance do polegar: um botão largo no rodapé do painel resolve. */}
        <button
          onClick={onClose}
          className="md:hidden shrink-0 min-h-12 border-t border-border text-xs uppercase tracking-[0.3em] text-muted active:text-foreground"
        >
          fechar
        </button>
      </div>
    </div>
  );
}
