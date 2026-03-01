'use client';

import Link from 'next/link';

export default function Logo({ size = 'md' }) {
  const sizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-5xl md:text-7xl',
    xl: 'text-7xl md:text-9xl',
  };

  return (
    <Link href="/" className={`${sizes[size]} font-bold tracking-tighter hover:opacity-70 transition-opacity`}>
      thy<span className="inline-block animate-pulse-dot">.</span>self
    </Link>
  );
}
