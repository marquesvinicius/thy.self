'use client';

import Logo from './Logo';
import Link from 'next/link';

export default function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-10 py-4 bg-black/80 backdrop-blur-sm border-b border-border">
      <Logo size="sm" />
      <nav className="flex gap-6 text-xs uppercase tracking-widest text-muted">
        <Link href="/" className="hover:text-foreground transition-colors">
          home
        </Link>
        <Link href="/about" className="hover:text-foreground transition-colors">
          about
        </Link>
        <Link href="/method" className="hover:text-foreground transition-colors">
          method
        </Link>
      </nav>
    </header>
  );
}
