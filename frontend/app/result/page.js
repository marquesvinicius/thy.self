'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  analyzeSession,
  getResult,
  reinterpret,
  quickAnalyze,
  interpretReferenceDetail,
} from '@/services/api';
import Header from '@/components/Header';
import MysticBackground from '@/components/MysticBackground';
import ImmersiveLoader from '@/components/ImmersiveLoader';
import ResultView from '@/components/ResultView';
import ResultActions from '@/components/ResultActions';
import ReferenceDetailModal from '@/components/ReferenceDetailModal';

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
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenCount, setRegenCount] = useState(0);
  const [llmInterpretation, setLlmInterpretation] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [shareMeta, setShareMeta] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [selectedReference, setSelectedReference] = useState(null);
  const [referenceDetail, setReferenceDetail] = useState(null);
  // Cache dos detalhes por referência (chave normalizada) para evitar gerar
  // duas vezes o mesmo detalhe — cada referência tem direito a UMA geração
  // por sessão de visualização. Persiste em sessionStorage para sobreviver
  // a reloads acidentais.
  const [referenceDetailsCache, setReferenceDetailsCache] = useState({});

  const isTestMode = searchParams.get('test') === '1';
  const regenExhausted = regenCount >= MAX_REGENS;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        let data;

        let activeSessionId;

        if (isTestMode) {
          data = await quickAnalyze(25);
          activeSessionId = data.session_id;
          sessionStorage.setItem('session_id', activeSessionId);
        } else {
          activeSessionId = sessionStorage.getItem('session_id');
          if (!activeSessionId) {
            router.push('/');
            return;
          }

          try {
            data = await getResult(activeSessionId);
          } catch {
            data = await analyzeSession(activeSessionId);
          }
        }

        if (!cancelled) {
          setSessionId(activeSessionId);
          setProfile(data.profile);
          setLlmInterpretation(data.profile.llm_interpretation || null);
          setShareMeta(data.profile.share || null);
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

  // Hidrata o cache de detalhes a partir do sessionStorage quando o
  // session_id fica conhecido. Mantém o contrato "1 chamada por referência"
  // mesmo após um reload acidental da página.
  useEffect(() => {
    if (!sessionId) return;
    try {
      const raw = sessionStorage.getItem(`reference_details_cache:${sessionId}`);
      if (raw) setReferenceDetailsCache(JSON.parse(raw) || {});
    } catch {}
  }, [sessionId]);

  function normalizeReferenceKey(name) {
    return (name || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  function persistDetailToCache(cacheKey, detail) {
    setReferenceDetailsCache(prev => {
      const next = { ...prev, [cacheKey]: detail };
      try {
        if (sessionId) {
          sessionStorage.setItem(
            `reference_details_cache:${sessionId}`,
            JSON.stringify(next),
          );
        }
      } catch {}
      return next;
    });
  }

  function handleNewSession() {
    sessionStorage.removeItem('session_id');
    router.push('/');
  }

  async function handleRegenerate() {
    if (!sessionId || regenLoading || regenExhausted) return;

    setRegenLoading(true);
    try {
      const excludeReferenceNames = (llmInterpretation?.referencias || [])
        .map(ref => ref?.nome)
        .filter(Boolean);
      const excludeWorkTitles = (llmInterpretation?.obras_culturais || [])
        .map(work => work?.titulo)
        .filter(Boolean);

      const data = await reinterpret(sessionId, {
        excludeReferenceNames,
        excludeWorkTitles,
      });

      setLlmInterpretation(data.llm_interpretation);
      setRegenCount(prev => prev + 1);
    } catch (err) {
      if (err.message?.includes('Limite')) {
        setRegenCount(MAX_REGENS);
      }
      console.error('Reinterpret failed:', err);
    } finally {
      setRegenLoading(false);
    }
  }

  async function handleMoreDetails(reference) {
    if (!sessionId || !reference || detailLoading) return;

    const cacheKey = normalizeReferenceKey(reference.nome);
    setSelectedReference(reference);
    setDetailError(null);
    setDetailOpen(true);

    // Se já geramos detalhes para essa referência nesta sessão, só reabrimos
    // o modal sem acionar a LLM de novo.
    if (cacheKey && referenceDetailsCache[cacheKey]) {
      setReferenceDetail(referenceDetailsCache[cacheKey]);
      setDetailLoading(false);
      return;
    }

    setReferenceDetail(null);
    setDetailLoading(true);

    try {
      const data = await interpretReferenceDetail(sessionId, {
        nome: reference.nome,
        categoria: reference.categoria,
        motivo: reference.motivo,
      });
      setReferenceDetail(data.reference_detail);
      if (cacheKey) {
        persistDetailToCache(cacheKey, data.reference_detail);
      }
    } catch (err) {
      setDetailError(err.message || 'Não foi possível gerar o detalhamento.');
    } finally {
      setDetailLoading(false);
    }
  }

  function handleCloseDetailModal() {
    setDetailOpen(false);
  }

  const hasNarrative = !!llmInterpretation;

  return (
    <div className="min-h-screen flex flex-col">
      <MysticBackground />
      <Header />

      <main className="flex-1 flex flex-col items-center pt-24 pb-16 px-6 relative z-[1]">
        {loading && <ImmersiveLoader />}

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

        {profile && (
          <div className="w-full flex flex-col items-center space-y-12">
            <ResultView
              profile={profile}
              llmInterpretation={llmInterpretation}
              onMoreDetails={hasNarrative ? handleMoreDetails : null}
              detailLoading={detailLoading}
              selectedReference={selectedReference}
              regen={hasNarrative ? {
                onRegenerate: handleRegenerate,
                loading: regenLoading,
                count: regenCount,
                max: MAX_REGENS,
                exhausted: regenExhausted,
              } : null}
            />

            {!hasNarrative && (
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted/60 text-center">
                interpretação narrativa indisponível no momento
              </p>
            )}

            <div className="w-full max-w-3xl pt-4 space-y-6 text-center">
              <p className="text-[10px] uppercase tracking-widest text-muted">
                este resultado reflete tendências com base nas suas respostas
              </p>
              <ResultActions
                profile={profile}
                llmInterpretation={llmInterpretation}
                sessionId={sessionId}
                initialShare={shareMeta}
                onNewSession={handleNewSession}
              />
            </div>
          </div>
        )}
      </main>

      <ReferenceDetailModal
        open={detailOpen}
        reference={selectedReference}
        detail={referenceDetail}
        loading={detailLoading}
        error={detailError}
        onClose={handleCloseDetailModal}
      />
    </div>
  );
}
