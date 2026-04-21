'use client';

import { useEffect, useMemo, useState } from 'react';
import { getAnswerReview } from '@/services/api';

/**
 * AnswerReviewModal — introduzido após o teste de usabilidade (abril/2026).
 *
 * Mostra ao usuário todas as respostas que ele deu durante o quiz, divididas
 * em duas abas:
 *   1. "Big Five (BFI-2-S)" — agrupada por traço (O/C/E/A/N). Para cada item,
 *      exibe a pergunta, a alternativa escolhida, e o sinal/tamanho da
 *      contribuição Likert (com `reverse_key` já aplicado). Isso responde a:
 *      "enxergar quais traços foram influenciados por quais respostas".
 *   2. "Narrativas (interpretativas)" — dilemas morais, paradoxos, interesses.
 *      Exibe a pergunta, a alternativa e/ou a reflexão livre do usuário.
 *
 * O modal é puramente de leitura — não permite editar respostas. Para
 * corrigir, o usuário deve recomeçar a sessão (botão "nova sessão" ou
 * voltar durante o quiz).
 */

const TRAIT_META = {
  O: { name: 'Abertura', short: 'O' },
  C: { name: 'Conscienciosidade', short: 'C' },
  E: { name: 'Extroversão', short: 'E' },
  A: { name: 'Amabilidade', short: 'A' },
  N: { name: 'Neuroticismo', short: 'N' },
};

const CATEGORY_LABELS = {
  moral_dilemma: 'Dilema moral',
  paradoxical: 'Paradoxo',
  interest: 'Interesse',
};

export default function AnswerReviewModal({ open, sessionId, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('objective');

  useEffect(() => {
    if (!open) return;

    const onKeyDown = event => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!open || !sessionId) return;
      setLoading(true);
      setError(null);
      try {
        const payload = await getAnswerReview(sessionId);
        if (!cancelled) {
          setData(payload);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Não consegui carregar suas respostas.');
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [open, sessionId]);

  const traitTotals = useMemo(() => {
    const totals = { O: 0, C: 0, E: 0, A: 0, N: 0 };
    const byTrait = data?.by_trait || {};
    for (const key of Object.keys(totals)) {
      for (const row of byTrait[key] || []) {
        totals[key] += row?.contribution?.delta || 0;
      }
    }
    return totals;
  }, [data]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm p-4 md:p-6">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-border bg-background shadow-[0_0_40px_rgba(255,255,255,0.05)]">
        <div className="p-5 border-b border-border flex items-center justify-between gap-4 sticky top-0 bg-background z-10">
          <div>
            <p className="text-[10px] uppercase tracking-[0.34em] text-muted">revisar respostas</p>
            <h2 className="text-lg font-semibold tracking-tight mt-1">
              o que você respondeu
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[10px] uppercase tracking-[0.22em] text-muted hover:text-foreground transition-colors"
          >
            fechar
          </button>
        </div>

        {loading && (
          <div className="p-8 text-center text-xs uppercase tracking-[0.24em] text-muted">
            carregando suas respostas...
          </div>
        )}

        {error && !loading && (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm text-muted">{error}</p>
          </div>
        )}

        {!loading && !error && data && (
          <div className="p-5 space-y-5">
            <div className="flex border border-border divide-x divide-border text-[11px] uppercase tracking-[0.22em]">
              <button
                onClick={() => setTab('objective')}
                className={`flex-1 py-3 transition-colors ${
                  tab === 'objective' ? 'bg-foreground text-background' : 'text-muted hover:text-foreground'
                }`}
              >
                BFI-2-S · {data.totals?.objective || 0}
              </button>
              <button
                onClick={() => setTab('interpretative')}
                className={`flex-1 py-3 transition-colors ${
                  tab === 'interpretative' ? 'bg-foreground text-background' : 'text-muted hover:text-foreground'
                }`}
              >
                narrativas · {data.totals?.interpretative || 0}
              </button>
            </div>

            {tab === 'objective' && (
              <ObjectiveTab byTrait={data.by_trait || {}} traitTotals={traitTotals} />
            )}

            {tab === 'interpretative' && (
              <InterpretativeTab answers={data.interpretative || []} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ObjectiveTab({ byTrait, traitTotals }) {
  const traitKeys = Object.keys(TRAIT_META);
  return (
    <div className="space-y-6">
      <p className="text-[11px] leading-relaxed text-muted/80">
        As 30 perguntas do BFI-2-S são agrupadas por traço. A marca à direita de cada resposta mostra quanto aquele item contribuiu para o traço — o sinal já considera <em>reverse_key</em> (itens escritos no sentido oposto são invertidos automaticamente).
      </p>

      {traitKeys.map(key => {
        const meta = TRAIT_META[key];
        const rows = byTrait[key] || [];
        const total = traitTotals[key] || 0;
        if (rows.length === 0) {
          return (
            <section key={key} className="border border-border/70 p-4">
              <header className="flex items-baseline justify-between gap-3 mb-2">
                <h3 className="text-sm font-semibold tracking-tight">{meta.name}</h3>
                <span className="text-[10px] uppercase tracking-[0.22em] text-muted">sem respostas</span>
              </header>
            </section>
          );
        }
        return (
          <section key={key} className="border border-border/70 p-4 space-y-3">
            <header className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold tracking-tight">{meta.name} <span className="text-muted font-normal">({meta.short})</span></h3>
              <span className="text-[10px] uppercase tracking-[0.22em] text-muted">
                soma bruta: {total >= 0 ? `+${total}` : total}
              </span>
            </header>
            <ul className="space-y-2">
              {rows.map(row => (
                <li key={row.id} className="flex items-start gap-3 border-t border-border/50 pt-2">
                  <ContributionBadge value={row?.contribution?.delta} reverseKey={row.reverse_key} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] leading-relaxed text-foreground/90">{row.question_text}</p>
                    <p className="text-[11px] text-muted mt-1">
                      resposta: <span className="text-foreground/80">{row.answer_text || '—'}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function InterpretativeTab({ answers }) {
  if (!answers || answers.length === 0) {
    return (
      <p className="text-sm text-muted text-center py-6">
        Nenhuma resposta interpretativa registrada.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-muted/80">
        As respostas narrativas não alteram o escore do Big Five — elas servem
        apenas como contexto qualitativo para o texto de interpretação e para
        as referências culturais.
      </p>
      <ul className="space-y-3">
        {answers.map(row => (
          <li key={row.id} className="border border-border/70 p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[9px] uppercase tracking-[0.22em] text-muted">
                {CATEGORY_LABELS[row.category_slug] || row.category_slug || 'outro'}
              </span>
              {row.answer_type && (
                <span className="text-[9px] uppercase tracking-[0.22em] text-muted/70">
                  {row.answer_type}
                </span>
              )}
            </div>
            <p className="text-[12px] leading-relaxed text-foreground/90">{row.question_text}</p>
            {row.answer_text && (
              <p className="text-[11px] text-muted">
                escolha: <span className="text-foreground/80">{row.answer_text}</span>
              </p>
            )}
            {row.user_observation && (
              <blockquote className="text-[11px] leading-relaxed text-foreground/80 border-l border-border pl-3 italic">
                “{row.user_observation}”
              </blockquote>
            )}
            {!row.answer_text && !row.user_observation && (
              <p className="text-[11px] text-muted italic">pulada pelo usuário</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContributionBadge({ value, reverseKey }) {
  const delta = Number(value || 0);
  const sign = delta > 0 ? '+' : delta < 0 ? '' : '±';
  const intensity = Math.min(Math.abs(delta), 2);
  const colorClass =
    delta > 0
      ? 'border-foreground/70 text-foreground'
      : delta < 0
        ? 'border-foreground/70 text-foreground'
        : 'border-border text-muted';
  return (
    <span
      className={`inline-flex flex-col items-center justify-center min-w-[44px] h-[44px] border px-2 ${colorClass}`}
      title={reverseKey ? 'item invertido (reverse_key)' : 'item direto'}
    >
      <span className="text-sm font-semibold tabular-nums leading-none">
        {sign}{delta || 0}
      </span>
      <span className="text-[8px] uppercase tracking-[0.18em] text-muted mt-1">
        {intensity === 0 ? 'neutro' : reverseKey ? 'inv.' : 'dir.'}
      </span>
    </span>
  );
}
