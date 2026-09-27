'use client';

import { useEffect, useMemo, useState } from 'react';
import { getAnswerReview } from '@/services/api';
import ModalShell from '@/components/ModalShell';

/**
 * AnswerReviewModal — introduzido após o teste de usabilidade (abril/2026).
 *
 * Mostra ao usuário todas as respostas que ele deu durante o quiz, divididas
 * em duas abas:
 *   1. "Big Five (BFI-2-S)" — agrupada por traço (O/C/E/A/N). Cada seção tem
 *      uma barra de soma bruta (−12…+12) na mesma linguagem visual das
 *      DimensionBar do resultado, e cada item mostra a contribuição Likert
 *      assinada (reverse_key já aplicado).
 *   2. "Narrativas (interpretativas)" — dilemas, paradoxos e interesses,
 *      com a escolha e/ou reflexão livre do usuário.
 *
 * Somente leitura — para corrigir, o usuário usa o "voltar" durante o quiz.
 */

const TRAIT_META = {
  O: { name: 'Abertura', short: 'O' },
  C: { name: 'Conscienciosidade', short: 'C' },
  E: { name: 'Extroversão', short: 'E' },
  A: { name: 'Amabilidade', short: 'A' },
  N: { name: 'Neuroticismo', short: 'N' },
};

// Limites teóricos da soma bruta por traço: 6 itens × Likert [−2, +2].
const RAW_MIN = -12;
const RAW_MAX = 12;

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
    <ModalShell open={open} onClose={onClose} label="revisar respostas" maxWidth="max-w-3xl">
      <div className="space-y-6">
        <h2 className="text-lg md:text-xl font-bold tracking-tight">
          o que você respondeu
        </h2>

        {loading && (
          <div className="py-10 flex flex-col items-center gap-5">
            <div className="w-2 h-2 rounded-full bg-foreground/40 animate-pulse-dot" />
            <p className="text-xs uppercase tracking-[0.3em] text-muted">
              carregando suas respostas...
            </p>
          </div>
        )}

        {error && !loading && (
          <div className="border border-border p-5 text-center">
            <p className="text-sm text-muted">{error}</p>
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-6">
            {/* Abas */}
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
    </ModalShell>
  );
}

/* Barra de soma bruta: centro = 0; preenche para a direita (positivo) ou
   esquerda (negativo) a partir do meio — mesma linguagem das DimensionBar. */
function RawSumBar({ total }) {
  const clamped = Math.max(RAW_MIN, Math.min(RAW_MAX, total));
  const half = 50; // percentual do centro
  const extent = (Math.abs(clamped) / RAW_MAX) * half;
  const left = clamped >= 0 ? half : half - extent;

  return (
    <div className="relative w-full h-1 bg-border" aria-hidden="true">
      {/* Marca do centro (zero) */}
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-2.5 bg-muted/60" />
      <div
        className="absolute top-0 h-full bg-foreground transition-all duration-700 ease-out"
        style={{ left: `${left}%`, width: `${extent}%` }}
      />
    </div>
  );
}

function ObjectiveTab({ byTrait, traitTotals }) {
  const traitKeys = Object.keys(TRAIT_META);
  return (
    <div className="space-y-7">
      <p className="text-[11px] leading-relaxed text-faint">
        As 30 perguntas do BFI-2-S agrupadas por traço. A marca à esquerda de
        cada resposta mostra a contribuição Likert assinada — o sinal já
        considera <em>reverse_key</em> (itens escritos no sentido oposto são
        invertidos automaticamente). A barra resume a soma bruta do eixo
        (−12 … +12, centro = neutro).
      </p>

      {traitKeys.map(key => {
        const meta = TRAIT_META[key];
        const rows = byTrait[key] || [];
        const total = traitTotals[key] || 0;

        return (
          <section key={key} className="relative border border-border p-5 pt-6 space-y-4">
            <div className="absolute -top-2.5 left-4 px-2 bg-background flex items-baseline gap-2">
              <span className="text-sm font-bold tracking-tight leading-none">{meta.short}</span>
              <h3 className="text-[11px] uppercase tracking-[0.24em] text-foreground font-semibold">
                {meta.name}
              </h3>
            </div>

            {rows.length === 0 ? (
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted">sem respostas</p>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <RawSumBar total={total} />
                  <span className="text-xs font-semibold tabular-nums whitespace-nowrap">
                    {total >= 0 ? `+${total}` : total}
                  </span>
                </div>

                <ul className="space-y-2.5">
                  {rows.map(row => (
                    <li key={row.id} className="flex items-start gap-3 border-t border-border/50 pt-2.5">
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
              </>
            )}
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
    <div className="space-y-5">
      <p className="text-[11px] leading-relaxed text-faint">
        As respostas narrativas não alteram o escore do Big Five — servem
        apenas como contexto qualitativo para o texto de interpretação e para
        as referências culturais.
      </p>
      <ul className="space-y-5">
        {answers.map((row, index) => (
          <li key={row.id} className="relative border border-border p-5 pt-6 space-y-2">
            <div className="absolute -top-2.5 left-4 px-2 bg-background flex items-baseline gap-2">
              <span className="text-[10px] tabular-nums text-faint">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="text-[10px] uppercase tracking-[0.24em] text-foreground font-semibold">
                {CATEGORY_LABELS[row.category_slug] || row.category_slug || 'outro'}
              </span>
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
              <p className="text-[11px] text-muted italic">pulada</p>
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
  const strong = Math.abs(delta) === 2;

  return (
    <span
      className={`inline-flex flex-col items-center justify-center min-w-[42px] h-[42px] border px-2 shrink-0 ${
        delta === 0
          ? 'border-border text-muted'
          : strong
            ? 'border-foreground text-foreground'
            : 'border-foreground/50 text-foreground/90'
      }`}
      title={reverseKey ? 'item invertido (reverse_key)' : 'item direto'}
    >
      <span className="text-sm font-semibold tabular-nums leading-none">
        {sign}{delta || 0}
      </span>
      <span className="text-[8px] uppercase tracking-[0.18em] text-muted mt-1">
        {delta === 0 ? 'neutro' : reverseKey ? 'inv.' : 'dir.'}
      </span>
    </span>
  );
}
