'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearAuthState, fetchWithTimeout, getApiBase } from '../../lib/auth';

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

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
      <button
        type="button"
        className="logout-btn"
        onClick={onLogout}
        disabled={loading}
        aria-label="Logout"
      >
        {loading ? '...' : 'Logout'}
      </button>
      <style jsx>{`
        .logout-btn {
          position: fixed;
          bottom: 1.1rem;
          left: 1.1rem;
          z-index: 100;
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
      `}</style>
    </>
  );
}
