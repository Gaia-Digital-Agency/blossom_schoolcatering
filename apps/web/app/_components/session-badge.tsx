'use client';

import { getSessionBadgeLabel, getSessionCardStyle } from '../../lib/session-theme';

export default function SessionBadge({ session }: { session: string }) {
  return (
    <span className="session-badge" style={getSessionCardStyle(session)}>
      {getSessionBadgeLabel(session)}
      <style jsx>{`
        .session-badge {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          padding: 0.18rem 0.5rem;
          border-radius: 999px;
          border: 1px solid var(--session-strong);
          background: var(--session-soft);
          color: var(--session-strong);
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.01em;
        }
      `}</style>
    </span>
  );
}
