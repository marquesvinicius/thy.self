'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSession } from '@/services/api';
import Logo from '@/components/Logo';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleStart() {
    setLoading(true);
    try {
      const session = await createSession();
      sessionStorage.setItem('session_id', session.session_id);
      router.push('/quiz');
    } catch (err) {
      console.error('Failed to create session:', err);
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="text-center space-y-8 animate-fade-in">
        <Logo size="xl" />

        <p className="text-xs md:text-sm uppercase tracking-[0.3em] text-muted">
          Conhece-te a ti mesmo
        </p>

        <div className="pt-8">
          <button
            onClick={handleStart}
            disabled={loading}
            className="border border-foreground px-10 py-3 text-xs uppercase tracking-[0.3em] hover:bg-foreground hover:text-background transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {loading ? '...' : 'começar'}
          </button>
        </div>
      </div>

      <footer className="absolute bottom-6 text-[10px] uppercase tracking-widest text-muted">
        thy.self &mdash; big five ocean
      </footer>
    </main>
  );
}
