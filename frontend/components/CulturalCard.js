'use client';

export default function CulturalCard({
  reference,
  index = 0,
  animate = true,
  onMoreDetails = null,
  detailsLoading = false,
}) {
  const { categoria, nome, motivo, image_url } = reference;
  const cardAnimationStyle = animate
    ? {
      animationDelay: `${400 + index * 200}ms`,
      animationFillMode: 'both',
    }
    : undefined;

  return (
    <div
      className={`border border-border overflow-hidden transition-all duration-700 ease-out ${animate ? 'animate-fade-in-up' : ''}`}
      style={cardAnimationStyle}
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
        {onMoreDetails && (
          <button
            onClick={onMoreDetails}
            disabled={detailsLoading}
            className="text-[10px] uppercase tracking-[0.22em] text-foreground/70 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {detailsLoading ? 'gerando detalhes...' : 'mais detalhes'}
          </button>
        )}
      </div>
    </div>
  );
}
