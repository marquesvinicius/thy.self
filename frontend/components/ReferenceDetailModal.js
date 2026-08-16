'use client';

import ModalShell from '@/components/ModalShell';

/**
 * ReferenceDetailModal — comparação aprofundada usuário × referência cultural.
 *
 * Layout: retrato em P&B com moldura, cabeçalho com categoria + título,
 * e seções numeradas (01, 02, 03) no padrão de rótulo flutuante do site.
 */
export default function ReferenceDetailModal({
  open = false,
  reference = null,
  detail = null,
  loading = false,
  error = null,
  onClose,
}) {
  if (!open || !reference) return null;

  const title = detail?.titulo || `você x ${reference.nome || 'referência'}`;
  const sections = Array.isArray(detail?.secoes) ? detail.secoes : [];

  return (
    <ModalShell open={open} onClose={onClose} label="comparação aprofundada" maxWidth="max-w-2xl">
      <div className="space-y-8">
        {/* ── Cabeçalho: retrato + identificação ── */}
        <div className="grid grid-cols-[104px_1fr] md:grid-cols-[150px_1fr] gap-5 md:gap-7 items-start">
          <figure className="relative">
            <div className="aspect-[4/5] border border-foreground/40 bg-surface overflow-hidden">
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
            {/* Canto marcado — detalhe de moldura */}
            <span className="absolute -bottom-1.5 -right-1.5 w-4 h-4 border-b border-r border-foreground/60" aria-hidden="true" />
            <span className="absolute -top-1.5 -left-1.5 w-4 h-4 border-t border-l border-foreground/60" aria-hidden="true" />
          </figure>

          <div className="space-y-3 pt-1">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted">
              {reference.categoria}
            </p>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight leading-snug">
              {title}
            </h2>
            {reference.motivo && (
              <p className="text-sm text-muted leading-relaxed border-l border-border pl-3">
                {reference.motivo}
              </p>
            )}
          </div>
        </div>

        {/* ── Estados ── */}
        {loading && (
          <div className="py-10 flex flex-col items-center gap-5">
            <div className="w-2 h-2 rounded-full bg-foreground/40 animate-pulse-dot" />
            <p className="text-xs uppercase tracking-[0.3em] text-muted">
              gerando análise detalhada...
            </p>
          </div>
        )}

        {!loading && error && (
          <div className="border border-border p-5 text-center">
            <p className="text-sm text-muted">{error}</p>
          </div>
        )}

        {/* ── Seções numeradas ── */}
        {!loading && !error && sections.length > 0 && (
          <div className="space-y-7">
            {sections.map((section, index) => (
              <article
                key={`${section.titulo}-${index}`}
                className="relative border border-border p-5 pt-6"
              >
                <div className="absolute -top-2.5 left-4 px-2 bg-background flex items-baseline gap-2">
                  <span className="text-[10px] tabular-nums text-muted/60">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className="text-[11px] uppercase tracking-[0.24em] text-foreground font-semibold">
                    {section.titulo}
                  </h3>
                </div>
                <p className="text-[13px] text-foreground/80 leading-relaxed">
                  {section.conteudo}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
