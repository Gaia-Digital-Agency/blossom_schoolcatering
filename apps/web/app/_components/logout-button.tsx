'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearAuthState, fetchWithTimeout, getApiBase, ROLE_KEY, type Role } from '../../lib/auth';

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<Role | ''>('');

  const canOpenRecord = role === 'PARENT' || role === 'YOUNGSTER';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(ROLE_KEY) as Role | null;
    if (!stored) return;
    setRole(stored);
  }, []);

  const onLogout = async () => {
    setLoading(true);
    await fetchWithTimeout(`${getApiBase()}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    }).catch(() => undefined);
    clearAuthState();
    router.push('/rating');
  };

  return (
    <>
      <div className="session-actions">
        <button
          type="button"
          className="logout-btn"
          onClick={onLogout}
          disabled={loading}
          aria-label="Logout"
        >
          {loading ? '...' : 'Logout'}
        </button>
        {canOpenRecord ? (
          <button
            type="button"
            className="record-btn"
            onClick={() => router.push('/register/youngsters?mode=record')}
            aria-label="View youngster record"
          >
            Record
          </button>
        ) : null}
      </div>
      <style jsx>{`
        .session-actions {
          position: fixed;
          bottom: 1.1rem;
          left: 1.1rem;
          z-index: 100;
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
        }
        .logout-btn {
          padding: 0.35rem 0.75rem;
          border: 1px solid #ccbda2;
          border-radius: 0.5rem;
          background: rgba(255, 253, 248, 0.88);
          color: #7a6a58;
          font-size: 0.78rem;
          font-family: inherit;
          cursor: pointer;
          backdrop-filter: blur(4px);
          transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .logout-btn:hover:not(:disabled) {
          background: #fff0e0;
          border-color: #9e6b20;
          color: #5a3a10;
        }
        .logout-btn:disabled {
          opacity: 0.55;
          cursor: default;
        }
        .record-btn {
          padding: 0.35rem 0.75rem;
          border: 1px solid #ccbda2;
          border-radius: 0.5rem;
          background: rgba(255, 253, 248, 0.88);
          color: #7a6a58;
          font-size: 0.78rem;
          font-family: inherit;
          cursor: pointer;
          backdrop-filter: blur(4px);
          transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .record-btn:hover {
          background: #fff0e0;
          border-color: #9e6b20;
          color: #5a3a10;
        }
      `}</style>
    </>
  );
}
