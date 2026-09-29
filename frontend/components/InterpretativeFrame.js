'use client';

import { categoryLabel } from '@/lib/categoryLabel';

/**
 * InterpretativeFrame
 *
 * Narrative wrapper applied to any question whose `kind === 'interpretative'`.
 * Its visual weight is intentionally louder than the fast-paced Likert grid
 * used for BFI-2-S items: bigger serif typography, quieter muted context,
 * generous padding — the UI equivalent of "slow down, read this one".
 */
export default function InterpretativeFrame({ question, children }) {
  return (
    <div className="w-full flex flex-col items-center">
      <div className="w-full max-w-3xl space-y-6">
        <span className="block text-[10px] uppercase tracking-[0.35em] text-muted text-center">
          {categoryLabel(question?.category)}
        </span>
      </div>

      <div className="w-full flex justify-center pt-6">
        {children}
      </div>
    </div>
  );
}
