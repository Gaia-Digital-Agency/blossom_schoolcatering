'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  active: boolean;
  onDiscard: () => Promise<void> | void;
  onSave?: () => Promise<boolean | void> | boolean | void;
  subjectLabel: string;
};

export default function DraftExitGuard({
  active,
  onDiscard,
  onSave,
  subjectLabel,
}: Props) {
  const [pendingAction, setPendingAction] = useState<'back' | 'refresh' | 'navigate' | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
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

    const onExitIntent = (event: Event) => {
      if (bypassRef.current) return;
      event.preventDefault();
      const detail = (event as CustomEvent<{ href?: string }>).detail;
      setPendingHref(detail?.href || null);
      setPendingAction('navigate');
    };

    window.addEventListener('popstate', onPopState);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blossom:draft-exit-intent', onExitIntent as EventListener);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blossom:draft-exit-intent', onExitIntent as EventListener);
    };
  }, [active]);

  const continuePendingAction = () => {
    const action = pendingAction;
    const href = pendingHref;
    setPendingAction(null);
    setPendingHref(null);
    if (action === 'refresh') {
      window.location.reload();
      return;
    }
    if (action === 'navigate' && href) {
      window.location.href = href;
      return;
    }
    window.history.back();
  };

  const onProceedWithoutSaving = async () => {
    bypassRef.current = true;
    await onDiscard();
    continuePendingAction();
  };

  const onSaveAndContinue = async () => {
    if (!onSave) return;
    bypassRef.current = true;
    try {
      const result = await onSave();
      if (result === false) {
        bypassRef.current = false;
        return;
      }
      continuePendingAction();
    } catch {
      bypassRef.current = false;
    }
  };

  if (!active || !pendingAction) return null;

  return (
    <div className="popup-overlay" onClick={() => setPendingAction(null)}>
      <div className="popup-card" onClick={(event) => event.stopPropagation()}>
        <div className="popup-icon">📝</div>
        <h3 className="popup-title">Save Draft Before Leaving?</h3>
        <p className="popup-body">
          Your {subjectLabel} draft still has items. Save the order now, or proceed without saving.
        </p>
        {onSave ? (
          <button className="btn btn-outline popup-close" type="button" onClick={() => void onSaveAndContinue()}>
            Save Order
          </button>
        ) : null}
        <button className="btn btn-primary popup-close" type="button" onClick={() => void onProceedWithoutSaving()}>
          Proceed Without Saving
        </button>
      </div>
    </div>
  );
}
