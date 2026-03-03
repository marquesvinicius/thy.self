'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { analyzeSession, getResult, reinterpret, quickAnalyze } from '@/services/api';
import Header from '@/components/Header';
import MysticBackground from '@/components/MysticBackground';
import ImmersiveLoader from '@/components/ImmersiveLoader';
import VibeHero from '@/components/VibeHero';
import CulturalCard from '@/components/CulturalCard';
import NarrativeBlock from '@/components/NarrativeBlock';
import DimensionBar from '@/components/DimensionBar';
import WorksBlock from '@/components/WorksBlock';

const MAX_REGENS = 3;

export default function Result() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col">
        <MysticBackground />
        <Header />
        <main className="flex-1 flex flex-col items-center pt-24 pb-16 px-6 relative z-[1]">
          <ImmersiveLoader />
        </main>
      </div>
    }>
      <ResultContent />
    </Suspense>
  );
}

function ResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [techOpen, setTechOpen] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenCount, setRegenCount] = useState(0);
  const [llmInterpretation, setLlmInterpretation] = useState(null);

  const isTestMode = searchParams.get('test') === '1';
  const regenExhausted = regenCount >= MAX_REGENS;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        let data;

        if (isTestMode) {
          // DEV: skip quiz, generate random session + answers + analyze
          data = await quickAnalyze(25);
          sessionStorage.setItem('session_id', data.session_id);
        } else {
          const sessionId = sessionStorage.getItem('session_id');
          if (!sessionId) {
            router.push('/');
            return;
          }

          // Try to fetch existing saved result first (no LLM call)
          try {
            data = await getResult(sessionId);
          } catch {
            // No saved result — first visit, run full analysis (with LLM)
            data = await analyzeSession(sessionId);
          }
        }

        if (!cancelled) {
          setProfile(data.profile);
          setLlmInterpretation(data.profile.llm_interpretation || null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [router, isTestMode]);

  function handleNewSession() {
    sessionStorage.removeItem('session_id');
    router.push('/');
  }

  async function handleRegenerate() {
    const sessionId = sessionStorage.getItem('session_id');
    if (!sessionId || regenLoading || regenExhausted) return;

    setRegenLoading(true);
    try {
      const data = await reinterpret(sessionId);
      setLlmInterpretation(data.llm_interpretation);
      setRegenCount(prev => prev + 1);
    } catch (err) {
      // If limit reached on backend, mark as exhausted
      if (err.message?.includes('Limite')) {
        setRegenCount(MAX_REGENS);
      }
      console.error('Reinterpret failed:', err);
    } finally {
      setRegenLoading(false);
    }
  }

  const hasNarrative = !!llmInterpretation;

  return (
    <div className="min-h-screen flex flex-col">
      <MysticBackground />
      <Header />

      <main className="flex-1 flex flex-col items-center pt-24 pb-16 px-6 relative z-[1]">
        {/* ── Loading State ── */}
        {loading && <ImmersiveLoader />}

        {/* ── Error State ── */}
        {error && !profile && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <p className="text-sm text-muted">{error}</p>
              <button
                onClick={handleNewSession}
                className="border border-foreground px-8 py-2 text-xs uppercase tracking-[0.3em] hover:bg-foreground hover:text-background transition-all"
              >
                nova sessão
              </button>
            </div>
          </div>
        )}

        {/* ── Result with LLM Narrative ── */}
        {profile && hasNarrative && (
          <div className="w-full max-w-3xl space-y-12">
            {/* 1. Vibe Hero — frase de impacto */}
            <VibeHero text={llmInterpretation.vibe_resumo} />

            {/* 2. Cultural Reference Cards — grid responsivo */}
            {llmInterpretation.referencias && llmInterpretation.referencias.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {llmInterpretation.referencias.map((ref, index) => (
                  <CulturalCard
                    key={`${ref.nome}-${index}`}
                    reference={ref}
                    index={index}
                    animate={!regenLoading}
                  />
                ))}
              </div>
            )}

            {/* 2b. Obras culturais recomendadas */}
            {llmInterpretation.obras_culturais && llmInterpretation.obras_culturais.length > 0 && (
              <WorksBlock works={llmInterpretation.obras_culturais} />
            )}

            {/* 3. Botão de re-geração com contador */}
            <div className="text-center space-y-2">
              <button
                onClick={handleRegenerate}
                disabled={regenLoading || regenExhausted}
                className="border border-border px-8 py-3 text-[11px] uppercase tracking-[0.25em] text-muted hover:text-foreground hover:border-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center gap-3"
              >
                {regenLoading ? (
                  <>
                    <span className="w-3 h-3 border border-muted border-t-transparent rounded-full animate-spin-slow" />
                    gerando...
                  </>
                ) : regenExhausted ? (
                  <>limite atingido</>
                ) : (
                  <>✦ gerar novas referências ({MAX_REGENS - regenCount} restantes)</>
                )}
              </button>
            </div>

            {/* 4. Narrativa interpretativa */}
            <NarrativeBlock text={llmInterpretation.interpretacao} />

            {/* 5. Separador — detalhes técnicos */}
            <div className="flex items-center gap-4 pt-4">
              <div className="flex-1 h-px bg-border" />
              <button
                onClick={() => setTechOpen(!techOpen)}
                className="text-[10px] uppercase tracking-[0.3em] text-muted hover:text-foreground transition-colors"
              >
                {techOpen ? '▾' : '▸'} perfil técnico
              </button>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* 6. DimensionBars — colapsável */}
            {techOpen && (
              <div className="space-y-3 animate-fade-in">
                <p className="text-[10px] uppercase tracking-[0.4em] text-muted text-center mb-4">
                  big five &mdash; {profile.answer_count} respostas
                </p>
                {profile.dimensions.map((dim, index) => (
                  <DimensionBar
                    key={dim.key}
                    dimension={dim}
                    animate={true}
                    delay={index * 200}
                  />
                ))}
              </div>
            )}

            {/* 7. Footer */}
            <div className="text-center pt-4 space-y-6">
              <p className="text-[10px] uppercase tracking-widest text-muted">
                este resultado reflete tendências com base nas suas respostas
              </p>
              <button
                onClick={handleNewSession}
                className="border border-foreground px-10 py-3 text-xs uppercase tracking-[0.3em] hover:bg-foreground hover:text-background transition-all"
              >
                nova sessão
              </button>
            </div>
          </div>
        )}

        {/* ── Fallback: Result without LLM ── */}
        {profile && !hasNarrative && (
          <div className="w-full max-w-2xl space-y-10">
            {/* Header */}
            <div className="text-center space-y-2 pt-4 animate-fade-in">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tighter">
                thy.self
              </h1>
              <p className="text-[10px] uppercase tracking-[0.4em] text-muted">
                perfil big five &mdash; {profile.answer_count} respostas
              </p>
            </div>

            {/* Dimensions — sequential reveal */}
            <div className="space-y-3">
              {profile.dimensions.map((dim, index) => (
                <DimensionBar
                  key={dim.key}
                  dimension={dim}
                  animate={true}
                  delay={600 + index * 400}
                />
              ))}
            </div>

            {/* Note about missing narrative */}
            <p className="text-[10px] uppercase tracking-widest text-muted/50 text-center">
              interpretação narrativa indisponível
            </p>

            {/* Footer */}
            <div
              className="text-center pt-6 space-y-6 animate-stagger"
              style={{ animationDelay: `${600 + 5 * 400 + 300}ms` }}
            >
              <p className="text-[10px] uppercase tracking-widest text-muted">
                este resultado reflete tendências com base nas suas respostas
              </p>
              <button
                onClick={handleNewSession}
                className="border border-foreground px-10 py-3 text-xs uppercase tracking-[0.3em] hover:bg-foreground hover:text-background transition-all"
              >
                nova sessão
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
