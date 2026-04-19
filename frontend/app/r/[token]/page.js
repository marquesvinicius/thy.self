'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { getPublicResult } from '@/services/api';
import Header from '@/components/Header';
import MysticBackground from '@/components/MysticBackground';
import ImmersiveLoader from '@/components/ImmersiveLoader';
import ResultView from '@/components/ResultView';

/**
 * Public, read-only share page.
 *
 * Intentional omissions vs. /result:
 *   - No sessionStorage reads; the page renders purely from the token.
 *   - No "mais detalhes" (LLM reference deep-dive) — viewers don't own
 *     the session, so they can't spend the owner's LLM budget.
 *   - No "regerar interpretação", "nova sessão" or "exportar PDF".
 *   - A single neutral CTA invites the viewer to take their own test.
 *
 * Any invalid, private, or unknown token resolves to 404 on the backend
 * and this page shows a friendly not-found state.
 */
export default function PublicResultPage({ params }) {
  const { token } = use(params);
  const [profile, setProfile] = useState(null);
  const [sharedAt, setSharedAt] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await getPublicResult(token);
        if (!cancelled) {
          setProfile(data.profile);
          setSharedAt(data.shared_at || null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    if (token) {
      load();
    } else {
      setError('Token inválido');
      setLoading(false);
    }

    return () => { cancelled = true; };
  }, [token]);

  const formattedDate = sharedAt
    ? new Date(sharedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <MysticBackground />
      <Header />

      <main className="flex-1 flex flex-col items-center pt-24 pb-16 px-6 relative z-[1]">
        {loading && <ImmersiveLoader />}

        {error && !profile && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4 max-w-sm">
              <p className="text-[10px] uppercase tracking-[0.4em] text-muted">resultado não disponível</p>
              <p className="text-sm text-muted">
                Este link não existe, foi despublicado pelo dono ou ainda não foi compartilhado.
              </p>
              <Link
                href="/"
                className="inline-block border border-foreground px-8 py-2 text-xs uppercase tracking-[0.3em] hover:bg-foreground hover:text-background transition-all"
              >
                fazer meu teste
              </Link>
            </div>
          </div>
        )}

        {profile && (
          <div className="w-full flex flex-col items-center space-y-12">
            <div className="w-full max-w-3xl text-center space-y-2">
              <p className="text-[10px] uppercase tracking-[0.4em] text-muted">perfil compartilhado</p>
              {formattedDate && (
                <p className="text-[11px] text-muted/70">publicado em {formattedDate}</p>
              )}
            </div>

            <ResultView
              profile={profile}
              llmInterpretation={profile.llm_interpretation || null}
              onMoreDetails={null}
              regen={null}
            />

            <div className="w-full max-w-3xl pt-4 space-y-6 text-center">
              <p className="text-[10px] uppercase tracking-widest text-muted">
                visualização somente leitura
              </p>
              <Link
                href="/"
                className="inline-block border border-foreground px-10 py-3 text-xs uppercase tracking-[0.3em] hover:bg-foreground hover:text-background transition-all"
              >
                faça também o seu teste no thy.self
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
