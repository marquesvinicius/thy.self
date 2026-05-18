'use client';

import { useState } from 'react';
import { exportResultPdf } from '@/lib/pdf/buildResultPdf';

/**
 * Owner-only action bar for the result screen.
 *
 * Renders two actions:
 *   ▸ Exportar PDF  — builds and downloads a PDF via pdfmake.
 *   ▸ Nova sessão   — clears sessionStorage and returns to /.
 *
 * Props:
 *   profile, llmInterpretation — fed to the PDF builder.
 *   onNewSession               — callback for the "nova sessão" button.
 *   onReviewAnswers            — optional callback for the answer review modal.
 */
export default function ResultActions({
  profile,
  llmInterpretation = null,
  onNewSession,
  onReviewAnswers = null,
}) {
  const [exportLoading, setExportLoading] = useState(false);

  async function handleExportPdf() {
    if (exportLoading || !profile) return;
    setExportLoading(true);
    try {
      await exportResultPdf({ profile, llmInterpretation });
    } catch (err) {
      console.error('Falha ao gerar PDF:', err);
    } finally {
      setExportLoading(false);
    }
  }

  return (
    <div className="w-full max-w-3xl space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          onClick={handleExportPdf}
          disabled={exportLoading}
          className="min-w-[260px] border border-foreground px-8 py-3 text-xs uppercase tracking-[0.3em] hover:bg-foreground hover:text-background transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {exportLoading ? 'gerando pdf...' : 'exportar em pdf'}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-6 pt-2">
        {typeof onReviewAnswers === 'function' && (
          <button
            onClick={onReviewAnswers}
            className="text-[11px] uppercase tracking-[0.3em] text-muted hover:text-foreground transition-colors underline underline-offset-4"
            title="Veja o que você respondeu e quais traços cada resposta influenciou"
          >
            revisar respostas
          </button>
        )}
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
