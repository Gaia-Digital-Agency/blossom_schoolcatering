'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * A global "Back to Top" button component.
 * This button appears when the user scrolls down the page and is hidden on specific routes.
 * Clicking it scrolls the page smoothly to the top.
 */
export default function BackToTopGlobal() {
  const pathname = usePathname();
  // State to control the visibility of the button.
  const [showTop, setShowTop] = useState(false);

  // Memoized value to determine if the button should be hidden on the current path.
  const hidden = useMemo(() => {
    const p = String(pathname || '');
    return p === '/' || p === '/guide' || p === '/guides';
  }, [pathname]);

  /**
   * This effect adds a scroll event listener to show or hide the button
   * based on the scroll position. It only runs if the button is not hidden
   * on the current route.
   */
  useEffect(() => {
    if (hidden) return;
    const onScroll = () => setShowTop(window.scrollY > 140);
    onScroll(); // Check on initial render
    window.addEventListener('scroll', onScroll, { passive: true });
    // Cleanup function to remove the event listener.
    return () => window.removeEventListener('scroll', onScroll);
  }, [hidden]);

  // If the button is meant to be hidden on this page, render nothing.
  if (hidden) return null;

  // Renders the button, adding the 'show' class when it should be visible.
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
