'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from '@/components/Logo';

const NAV_ITEMS = [
  { href: '/', label: 'início' },
  { href: '/about', label: 'sobre' },
  // Sem pré-carga: a página Método importa o CSS do KaTeX (fórmulas), e o
  // prefetch baixava esse CSS em todas as telas sem usá-lo — o navegador
  // avisava "preloaded but not used" no console.
  { href: '/method', label: 'método', prefetch: false },
];

export default function Header() {
  const pathname = usePathname();
  const isHome = pathname === '/';

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-5 py-5 bg-black md:top-8 md:left-10 md:right-10 md:items-start md:gap-6 md:px-0 md:py-0 md:bg-transparent"
    >
      <div className="min-w-0 shrink-0 flex items-center min-h-11 md:min-h-0">
        {!isHome && <Logo size="sm" />}
      </div>
      <nav
        className="flex shrink-0 items-center gap-1 md:gap-5 text-[11px] md:text-[10px] uppercase tracking-[0.25em] md:tracking-[0.3em]"
        aria-label="navegação principal"
      >
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={item.prefetch}
              aria-current={active ? 'page' : undefined}
              className={`relative inline-flex items-center min-h-11 px-2.5 md:min-h-0 md:px-0 md:pb-1 transition-colors ${
                active ? 'text-foreground' : 'text-muted hover:text-foreground'
              }`}
            >
              {item.label}
              <span
                className={`absolute left-0 right-0 -bottom-0.5 h-px bg-foreground transition-opacity ${
                  active ? 'opacity-100' : 'opacity-0'
                }`}
                aria-hidden="true"
              />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
