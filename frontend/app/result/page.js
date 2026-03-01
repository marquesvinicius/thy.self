'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { analyzeSession } from '@/services/api';
import Header from '@/components/Header';
import DimensionBar from '@/components/DimensionBar';

export default function Result() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const sessionId = sessionStorage.getItem('session_id');
    if (!sessionId) {
      router.push('/');
      return;
    }

    analyzeSession(sessionId)
      .then((data) => {
        if (!cancelled) {
          setProfile(data.profile);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [router]);

  function handleNewSession() {
    sessionStorage.removeItem('session_id');
    router.push('/');
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 flex flex-col items-center pt-24 pb-16 px-6">
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs uppercase tracking-widest text-muted animate-pulse">
              calculando perfil...
            </p>
          </div>
        )}

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
          <div className="w-full max-w-2xl space-y-10">
            {/* Header — aparece primeiro */}
            <div className="text-center space-y-2 pt-4 animate-fade-in">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tighter">
                thy.self
              </h1>
              <p className="text-[10px] uppercase tracking-[0.4em] text-muted">
                perfil big five &mdash; {profile.answer_count} respostas
              </p>
            </div>

            {/* Dimensions — revelação sequencial */}
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

            {/* Footer — aparece por último */}
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
