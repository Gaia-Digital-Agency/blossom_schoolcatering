'use client';

import { useEffect, useState } from 'react';

export default function NetworkActivityIndicator() {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const syncFromBody = () => {
      if (typeof document === 'undefined') return;
      setBusy(document.body?.getAttribute('data-network-busy') === 'true');
    };
    syncFromBody();
    const handler = () => syncFromBody();
    window.addEventListener('blossom:network-busy', handler as EventListener);
    return () => window.removeEventListener('blossom:network-busy', handler as EventListener);
  }, []);

  if (!busy) return null;
  return (
    <div className="global-network-indicator" role="status" aria-live="polite">
      Processing...
    </div>
  );
}
