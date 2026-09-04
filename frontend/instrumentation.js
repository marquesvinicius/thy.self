/**
 * Next.js instrumentation — runs once when the Node server boots (dev + start).
 * Probes backend /health?deep=1 so a paused Supabase (or dead API) is visible
 * in the frontend terminal instead of only surfacing later as opaque UI errors.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

function resolveBackendHealthUrl() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
  try {
    const url = new URL(apiUrl);
    // NEXT_PUBLIC_API_URL points at /api/v1 — health lives at the host root.
    return `${url.origin}/health?deep=1`;
  } catch {
    return 'http://localhost:3000/health?deep=1';
  }
}

async function probeBackend() {
  const healthUrl = resolveBackendHealthUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(healthUrl, { signal: controller.signal });
    const body = await res.json().catch(() => ({}));

    if (res.ok && body.status === 'ok') {
      const supabase = body.dependencies?.supabase;
      console.info(
        `[preflight] Backend OK (${healthUrl})` +
          (supabase?.latency_ms != null ? ` · supabase ${supabase.latency_ms}ms` : '')
      );
      return;
    }

    const supabase = body.dependencies?.supabase;
    const banner = '─'.repeat(72);
    console.error(`\n${banner}`);
    console.error('[preflight] Backend degradado ou dependências indisponíveis');
    console.error(`url: ${healthUrl}`);
    console.error(`http: ${res.status} · status: ${body.status || 'unknown'}`);
    if (supabase?.code) console.error(`supabase.code: ${supabase.code}`);
    if (supabase?.hint) console.error(`hint: ${supabase.hint}`);
    else if (supabase?.detail) console.error(`detail: ${supabase.detail}`);
    console.error(banner);
    console.error(
      'Se o projeto Supabase estiver pausado (free tier), reative-o no dashboard e reinicie o backend.\n'
    );
  } catch (err) {
    const banner = '─'.repeat(72);
    console.error(`\n${banner}`);
    console.error('[preflight] Não foi possível alcançar o backend');
    console.error(`url: ${healthUrl}`);
    console.error(`error: ${err?.message || err}`);
    console.error(
      'hint: Suba o backend (`cd backend; npm run dev`) antes do frontend. Se o backend já estiver up, confira NEXT_PUBLIC_API_URL.'
    );
    console.error(`${banner}\n`);
  } finally {
    clearTimeout(timer);
  }
}

export async function register() {
  // Only meaningful in the Node runtime (not Edge).
  if (process.env.NEXT_RUNTIME === 'edge') return;
  await probeBackend();
}
