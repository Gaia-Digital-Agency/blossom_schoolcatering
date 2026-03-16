'use client';

import { useEffect, useState } from 'react';

/**
 * A global network activity indicator component.
 * It listens for a custom event (`blossom:network-busy`) and displays a "Processing..."
 * message when the application is busy with a network request.
 */
export default function NetworkActivityIndicator() {
  // State to track whether there is ongoing network activity.
  const [busy, setBusy] = useState(false);

  /**
   * This effect sets up a listener for a custom global event to sync the busy state.
   * The busy state is determined by the 'data-network-busy' attribute on the document body,
   * which is expected to be set by other parts of the application.
   */
  useEffect(() => {
    const syncFromBody = () => {
      if (typeof document === 'undefined') return;
      setBusy(document.body?.getAttribute('data-network-busy') === 'true');
    };
    syncFromBody(); // Initial check
    
    // Set up the event listener.
    const handler = () => syncFromBody();
    window.addEventListener('blossom:network-busy', handler as EventListener);
    
    // Cleanup function to remove the event listener.
    return () => window.removeEventListener('blossom:network-busy', handler as EventListener);
  }, []);

  // If there is no network activity, render nothing.
  if (!busy) return null;

  // Render the indicator when the network is busy.
  return (
    <div className="global-network-indicator" role="status" aria-live="polite">
      Processing...
    </div>
  );
}
