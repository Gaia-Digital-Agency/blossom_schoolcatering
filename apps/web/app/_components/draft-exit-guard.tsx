'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  active: boolean;
  onDiscard: () => Promise<void> | void;
  subjectLabel: string;
};

export default function DraftExitGuard({
  active,
  onDiscard,
  subjectLabel,
}: Props) {
  const [pendingAction, setPendingAction] = useState<'back' | 'refresh' | null>(null);
  const bypassRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !active) return;
    window.history.pushState({ blossomDraftGuard: true }, '', window.location.href);

    const onPopState = () => {
      if (bypassRef.current) return;
      window.history.pushState({ blossomDraftGuard: true }, '', window.location.href);
      setPendingAction('back');
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (bypassRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const wantsRefresh = event.key === 'F5' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r');
      if (!wantsRefresh || bypassRef.current) return;
      event.preventDefault();
      setPendingAction('refresh');
    };

    window.addEventListener('popstate', onPopState);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [active]);

  const onCancelDraftAndContinue = async () => {
    bypassRef.current = true;
    await onDiscard();
    const action = pendingAction;
    setPendingAction(null);
    if (action === 'refresh') {
      window.location.reload();
      return;
    }
    window.history.back();
  };

  if (!active || !pendingAction) return null;

  return (
    <div className="popup-overlay" onClick={() => setPendingAction(null)}>
      <div className="popup-card" onClick={(event) => event.stopPropagation()}>
        <div className="popup-icon">📝</div>
        <h3 className="popup-title">Save Order First</h3>
        <p className="popup-body">
          Your {subjectLabel} draft still has unsaved items. Save the order first, or cancel the draft and continue.
        </p>
        <button className="btn btn-outline popup-close" type="button" onClick={() => setPendingAction(null)}>
          Save Order First
        </button>
        <button className="btn btn-primary popup-close" type="button" onClick={() => void onCancelDraftAndContinue()}>
          Cancel Draft and Continue
        </button>
      </div>
    </div>
  );
}
