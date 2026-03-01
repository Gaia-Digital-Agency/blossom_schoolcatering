'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function BackToTopGlobal() {
  const pathname = usePathname();
  const [showTop, setShowTop] = useState(false);

  const hidden = useMemo(() => {
    const p = String(pathname || '');
    return p === '/' || p === '/guide' || p === '/guides';
  }, [pathname]);

  useEffect(() => {
    if (hidden) return;
    const onScroll = () => setShowTop(window.scrollY > 140);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [hidden]);

  if (hidden) return null;

  return (
    <button
      className={`back-to-top ${showTop ? 'show' : ''}`}
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      Top
    </button>
  );
}
