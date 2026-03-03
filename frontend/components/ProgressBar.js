'use client';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function ProgressBar(props) {
  const {
    current = 0,
    total = 1,
    label = 'aprofundando...',
    className = '',
  } = props;

  const percentage = total > 0 ? clamp((current / total) * 100, 0, 100) : 0;

  return (
    <section className={`w-full max-w-[560px] mx-auto ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-[0.3em] text-muted">{label}</span>
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted">
          {Math.round(percentage)}%
        </span>
      </div>

      <div className="h-[2px] w-full bg-border/70">
        <div
          className="h-full bg-foreground transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </section>
  );
}
