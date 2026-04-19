'use client';

import { useEffect } from 'react';

export default function ReferenceDetailModal({
  open = false,
  reference = null,
  detail = null,
  loading = false,
  error = null,
  onClose,
}) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = event => {
      if (event.key === 'Escape') onClose?.();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !reference) return null;

  const title = detail?.titulo || `você x ${reference.nome || 'referência'}`;
  const sections = Array.isArray(detail?.secoes) ? detail.secoes : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-6">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-border bg-background shadow-[0_0_40px_rgba(255,255,255,0.05)]">
        <div className="p-5 border-b border-border flex items-center justify-between gap-4">
          <p className="text-[10px] uppercase tracking-[0.34em] text-muted">comparação aprofundada</p>
          <button
            onClick={onClose}
            className="text-[10px] uppercase tracking-[0.22em] text-muted hover:text-foreground transition-colors"
          >
            fechar
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-5">
            <div className="aspect-[4/5] border border-border bg-surface overflow-hidden">
              {reference.image_url ? (
                <img
                  src={reference.image_url}
                  alt={reference.nome}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-5xl text-muted/20 font-bold tracking-tighter">
                    {reference.nome?.charAt(0) || '?'}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.24em] text-muted">{reference.categoria}</p>
              <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
              {reference.motivo && (
                <p className="text-sm text-muted leading-relaxed">{reference.motivo}</p>
              )}
            </div>
          </div>

          {loading && (
            <div className="border border-border p-4 animate-fade-in">
              <p className="text-xs uppercase tracking-[0.24em] text-muted">gerando análise detalhada...</p>
            </div>
          )}

          {!loading && error && (
            <div className="border border-border p-4">
              <p className="text-xs text-muted">{error}</p>
            </div>
          )}

          {!loading && !error && sections.length > 0 && (
            <div className="space-y-3">
              {sections.map((section, index) => (
                <article
                  key={`${section.titulo}-${index}`}
                  className="border border-border p-4 space-y-2 bg-surface/25"
                >
                  <h3 className="text-sm font-semibold tracking-tight">{section.titulo}</h3>
                  <p className="text-[12px] text-muted leading-relaxed">{section.conteudo}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
