'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from '@/components/Logo';

const NAV_ITEMS = [
  { href: '/', label: 'início' },
  { href: '/about', label: 'sobre' },
  { href: '/method', label: 'método' },
];

export default function Header() {
  const pathname = usePathname();
  const isHome = pathname === '/';

  return (
    <div
      className="fixed top-6 left-6 right-6 md:top-8 md:left-10 md:right-10 z-50 flex items-start justify-between gap-6"
    >
      <div className="min-w-0 shrink-0">
        {!isHome && <Logo size="sm" />}
      </div>
      <nav
        className="flex shrink-0 gap-5 text-[10px] uppercase tracking-[0.3em]"
        aria-label="navegação principal"
      >
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`relative pb-1 transition-colors ${
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
