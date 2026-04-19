'use client';

import VibeHero from '@/components/VibeHero';
import NarrativeBlock from '@/components/NarrativeBlock';
import DimensionBar from '@/components/DimensionBar';
import CulturalCard from '@/components/CulturalCard';
import WorksBlock from '@/components/WorksBlock';

/**
 * ResultView — presentational shell for the Dual-Core result screen.
 *
 * Render order is intentionally narrative-first:
 *   1. Interpretação (VibeHero + NarrativeBlock) — hook the reader with the AI synthesis.
 *   2. Tua essência (referências + obras culturais) — cultural mirror of the profile.
 *   3. Perfil Big Five (BFI-2-S)                  — quantitative foundation at the end.
 *
 * The component is pure: it receives data + optional callbacks. When running
 * in read-only mode (public share link), the caller simply omits the
 * callbacks and no owner-only controls are rendered.
 *
 * Props:
 *   profile            — { scores, dimensions, answer_count, ... } (required)
 *   llmInterpretation  — { vibe_resumo, referencias[], obras_culturais[], interpretacao }
 *                        Pass null to hide blocks 1 and 2.
 *   onMoreDetails      — (reference) => void. Omit for read-only cards.
 *   detailLoading      — boolean (for card spinner).
 *   selectedReference  — currently-loading reference (used to pick which card spins).
 *   regen              — { onRegenerate, loading, count, max, exhausted }. Omit to hide regen CTA.
 */
export default function ResultView({
  profile,
  llmInterpretation = null,
  onMoreDetails = null,
  detailLoading = false,
  selectedReference = null,
  regen = null,
}) {
  if (!profile) return null;

  const hasNarrative = !!llmInterpretation;

  return (
    <div className="w-full max-w-3xl space-y-16">
      {/* ── 1. Interpretação (topo narrativo) ── */}
      {hasNarrative && (
        <section className="space-y-6">
          {llmInterpretation.vibe_resumo && (
            <VibeHero text={llmInterpretation.vibe_resumo} kicker="a sua síntese" />
          )}
          <SectionHeader
            label="interpretação"
            sub="leitura cruzada dos seus escores com suas respostas narrativas"
          />
          {llmInterpretation.interpretacao && (
            <NarrativeBlock text={llmInterpretation.interpretacao} />
          )}
        </section>
      )}

      {/* ── 2. Tua essência ── */}
      {hasNarrative && (
        <section className="space-y-6">
          <SectionHeader
            label="tua essência"
            sub="referências culturais e obras em ressonância com o seu perfil"
          />

          {Array.isArray(llmInterpretation.referencias) && llmInterpretation.referencias.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {llmInterpretation.referencias.map((ref, index) => (
                <CulturalCard
                  key={`${ref.nome}-${index}`}
                  reference={ref}
                  index={index}
                  animate={!regen?.loading}
                  onMoreDetails={onMoreDetails ? () => onMoreDetails(ref) : null}
                  detailsLoading={detailLoading && selectedReference?.nome === ref.nome}
                />
              ))}
            </div>
          )}

          {Array.isArray(llmInterpretation.obras_culturais) && llmInterpretation.obras_culturais.length > 0 && (
            <WorksBlock works={llmInterpretation.obras_culturais} />
          )}

          {regen && typeof regen.onRegenerate === 'function' && (
            <div className="text-center pt-2">
              <button
                onClick={regen.onRegenerate}
                disabled={regen.loading || regen.exhausted}
                className="border border-border px-8 py-3 text-[11px] uppercase tracking-[0.25em] text-muted hover:text-foreground hover:border-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center gap-3"
              >
                {regen.loading ? (
                  <>
                    <span className="w-3 h-3 border border-muted border-t-transparent rounded-full animate-spin-slow" />
                    gerando...
                  </>
                ) : regen.exhausted ? (
                  <>limite atingido</>
                ) : (
                  <>✦ gerar novas referências ({Math.max(0, (regen.max ?? 3) - (regen.count ?? 0))} restantes)</>
                )}
              </button>
            </div>
          )}
        </section>
      )}

      {/* ── 3. Perfil Big Five (base técnica, fundamentação) ── */}
      <section className="space-y-6">
        <SectionHeader
          label="perfil técnico big five"
          sub={`fundamentação quantitativa · ${profile.answer_count} respostas · BFI-2-S (Soto & John, 2017)`}
        />
        <div className="space-y-3">
          {profile.dimensions.map((dim, index) => (
            <DimensionBar
              key={dim.key}
              dimension={dim}
              animate={true}
              delay={200 + index * 160}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function SectionHeader({ label, sub }) {
  return (
    <div className="space-y-2 text-center">
      <p className="text-[10px] uppercase tracking-[0.4em] text-muted">{label}</p>
      {sub && (
        <p className="text-[11px] text-muted/70 max-w-md mx-auto leading-relaxed">
          {sub}
        </p>
      )}
      <div className="flex items-center justify-center pt-2">
        <span className="h-px w-16 bg-border" />
      </div>
    </div>
  );
}
