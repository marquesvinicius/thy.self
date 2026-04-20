'use client';

import { useState } from 'react';
import { shareResult } from '@/services/api';
import { exportResultPdf } from '@/lib/pdf/buildResultPdf';

/**
 * Owner-only action bar for the result screen.
 *
 * Renders three actions — all of them are hidden on the public read-only
 * share page (where the caller simply does not mount this component).
 *
 *   ▸ Compartilhar  — publishes the result (if not public yet) and copies
 *                     the /r/[token] URL to the clipboard. A discreet
 *                     secondary action below lets the owner revoke.
 *   ▸ Exportar PDF  — builds and downloads a PDF via pdfmake, embedding
 *                     the share URL + QR code when one is available.
 *   ▸ Nova sessão   — clears sessionStorage and returns to /.
 *
 * Props:
 *   profile, llmInterpretation — fed to the PDF builder.
 *   sessionId                  — required to toggle share state.
 *   initialShare               — { is_public, public_token, published_at } | null
 *   onNewSession               — callback for the "nova sessão" button.
 */
export default function ResultActions({
  profile,
  llmInterpretation = null,
  sessionId,
  initialShare = null,
  onNewSession,
}) {
  const [share, setShare] = useState(() => ({
    isPublic: !!initialShare?.is_public,
    token: initialShare?.public_token || null,
  }));
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState(null);
  const [copiedFlash, setCopiedFlash] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const publicUrl = share.token && typeof window !== 'undefined'
    ? `${window.location.origin}/r/${share.token}`
    : null;

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  function formatShareError(err) {
    const raw = err?.message || '';
    if (/column .* does not exist/i.test(raw) || /public_token|is_public/i.test(raw)) {
      return 'Migração 005_public_share.sql ainda não foi aplicada no banco. Rode-a no Supabase (SQL Editor) e tente de novo.';
    }
    if (/fetch|Failed to fetch|NetworkError/i.test(raw)) {
      return 'Backend não respondeu. Verifique se o servidor está rodando em ' + (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1') + '.';
    }
    return raw || 'Falha ao publicar o resultado.';
  }

  async function handleShare() {
    if (!sessionId) {
      setShareError('Sessão não identificada. Volte para a home e recomece.');
      return;
    }
    if (shareLoading) return;

    setShareLoading(true);
    setShareError(null);

    try {
      let token = share.token;
      let isPublic = share.isPublic;

      if (!isPublic || !token) {
        const data = await shareResult(sessionId, { isPublic: true });
        token = data.share?.public_token || null;
        isPublic = !!data.share?.is_public;
        setShare({ token, isPublic });

        if (!token) {
          throw new Error('O backend não retornou um public_token — verifique se a migração 005 foi aplicada.');
        }
      }

      if (token && typeof window !== 'undefined') {
        const url = `${window.location.origin}/r/${token}`;
        const ok = await copyToClipboard(url);
        if (ok) {
          setCopiedFlash(true);
          setTimeout(() => setCopiedFlash(false), 2200);
        } else {
          setShareError('Não consegui copiar automaticamente — o link ficou visível abaixo.');
        }
      }
    } catch (err) {
      console.error('[share] falha ao publicar resultado:', err);
      setShareError(formatShareError(err));
    } finally {
      setShareLoading(false);
    }
  }

  async function handleRevoke() {
    if (!sessionId || shareLoading) return;
    setShareLoading(true);
    setShareError(null);
    try {
      const data = await shareResult(sessionId, { isPublic: false });
      setShare({
        token: data.share?.public_token || null,
        isPublic: !!data.share?.is_public,
      });
    } catch (err) {
      console.error('[share] falha ao revogar resultado:', err);
      setShareError(formatShareError(err));
    } finally {
      setShareLoading(false);
    }
  }

  async function handleExportPdf() {
    if (exportLoading || !profile) return;
    setExportLoading(true);
    try {
      await exportResultPdf({
        profile,
        llmInterpretation,
        shareUrl: publicUrl,
      });
    } catch (err) {
      console.error('Falha ao gerar PDF:', err);
    } finally {
      setExportLoading(false);
    }
  }

  async function handleCopyLink() {
    if (!publicUrl) return;
    const ok = await copyToClipboard(publicUrl);
    if (ok) {
      setCopiedFlash(true);
      setTimeout(() => setCopiedFlash(false), 2200);
    } else {
      setShareError('Não consegui copiar automaticamente — selecione o link abaixo manualmente.');
    }
  }

  const primaryShareLabel = shareLoading
    ? 'publicando...'
    : share.isPublic
      ? 'gerar link de novo'
      : 'publicar e gerar link';

  const primaryHelp = share.isPublic
    ? 'Seu resultado já está público. Use o link abaixo ou gere novamente.'
    : 'Publica seu resultado e gera um link /r/… para compartilhar (somente leitura).';

  return (
    <div className="w-full max-w-3xl space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          onClick={handleShare}
          disabled={shareLoading}
          className="min-w-[260px] border border-foreground px-8 py-3 text-xs uppercase tracking-[0.3em] hover:bg-foreground hover:text-background transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {primaryShareLabel}
        </button>

        <button
          onClick={handleExportPdf}
          disabled={exportLoading}
          className="min-w-[260px] border border-border px-8 py-3 text-xs uppercase tracking-[0.3em] text-muted hover:text-foreground hover:border-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {exportLoading ? 'gerando pdf...' : 'exportar em pdf'}
        </button>
      </div>

      <p className="text-center text-[11px] text-muted/80 max-w-md mx-auto leading-relaxed">
        {primaryHelp}
      </p>

      {share.isPublic && publicUrl && (
        <div className="border border-border/70 p-5 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted">
              seu link público
            </p>
            {copiedFlash && (
              <span className="text-[10px] uppercase tracking-[0.3em] text-foreground">
                copiado ✓
              </span>
            )}
          </div>

          <p className="text-[12px] md:text-sm text-foreground break-all select-all font-mono leading-relaxed">
            {publicUrl}
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-1">
            <button
              onClick={handleCopyLink}
              className="text-[11px] uppercase tracking-[0.25em] border border-foreground/50 px-4 py-2 hover:border-foreground hover:bg-foreground hover:text-background transition-all"
            >
              copiar link
            </button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] uppercase tracking-[0.25em] text-muted hover:text-foreground transition-colors underline underline-offset-4"
            >
              abrir em nova aba ↗
            </a>
            <button
              onClick={handleRevoke}
              disabled={shareLoading}
              className="text-[11px] uppercase tracking-[0.25em] text-muted hover:text-foreground transition-colors underline underline-offset-4 disabled:opacity-40 ml-auto"
            >
              tornar privado
            </button>
          </div>
        </div>
      )}

      {shareError && (
        <div className="border border-foreground/40 bg-surface/40 p-4 text-center space-y-1">
          <p className="text-[10px] uppercase tracking-[0.3em] text-foreground/70">
            não foi possível publicar
          </p>
          <p className="text-[12px] text-foreground/90 leading-relaxed">{shareError}</p>
        </div>
      )}

      <div className="text-center pt-2">
        <button
          onClick={onNewSession}
          className="text-[11px] uppercase tracking-[0.3em] text-muted hover:text-foreground transition-colors underline underline-offset-4"
        >
          começar nova sessão
        </button>
      </div>
    </div>
  );
}
