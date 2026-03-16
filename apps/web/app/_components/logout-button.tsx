'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearAuthState, fetchWithTimeout, getApiBase, ROLE_KEY, type Role } from '../../lib/auth';

/**
 * A component that provides a logout button and, for certain user roles,
 * a button to view their record.
 */
export default function LogoutButton({
  returnHref,
  showRecord = true,
  logoutRedirect = '/',
}: {
  returnHref?: string;
  showRecord?: boolean;
  logoutRedirect?: string;
}) {
  const router = useRouter();
  // State to manage the loading status of the logout process.
  const [loading, setLoading] = useState(false);
  // State to store the current user's role.
  const [role, setRole] = useState<Role | ''>('');

  // Determines if the "Record" button should be visible based on the user's role.
  const canOpenRecord = showRecord && (role === 'PARENT' || role === 'YOUNGSTER');

  /**
   * On component mount, this effect retrieves the user's role from local storage
   * and sets it in the component's state.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(ROLE_KEY) as Role | null;
    if (!stored) return;
    setRole(stored);
  }, []);

  /**
   * Handles the logout process.
   * It sets the loading state, sends a request to the logout endpoint,
   * clears the authentication state from local storage, and redirects the user to the rating page.
   */
  const onLogout = async () => {
    setLoading(true);
    await fetchWithTimeout(`${getApiBase()}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    }).catch(() => undefined);
    clearAuthState();
    router.push(logoutRedirect);
  };

  return (
    <>
      <div className="session-actions">
        {/* The main logout button */}
        <button
          type="button"
          className="logout-btn"
          onClick={onLogout}
          disabled={loading}
          aria-label="Logout"
        >
          {loading ? '...' : 'Logout'}
        </button>
        {returnHref ? (
          <button
            type="button"
            className="record-btn"
            onClick={() => router.push(returnHref)}
            aria-label="Return to module"
          >
            Return
          </button>
        ) : null}
        {/* Conditionally rendered button to view the user's record */}
        {canOpenRecord ? (
          <button
            type="button"
            className="record-btn"
            onClick={() => router.push('/register?mode=record')}
            aria-label="View family or student record"
          >
            Record
          </button>
        ) : null}
      </div>
      {/* Scoped CSS for the component */}
      <style jsx>{`
        .session-actions {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 20;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          align-items: center;
          gap: 0.45rem;
          padding: 0.65rem 0.85rem calc(0.8rem + env(safe-area-inset-bottom));
          background: linear-gradient(180deg, rgba(244, 239, 229, 0), rgba(244, 239, 229, 0.96) 35%, rgba(244, 239, 229, 0.99) 100%);
          backdrop-filter: blur(6px);
        }
        .logout-btn {
          width: 100%;
          min-height: 2.35rem;
          padding: 0.35rem 0.6rem;
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
          width: 100%;
          min-height: 2.35rem;
          padding: 0.35rem 0.6rem;
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
        @media (max-width: 520px) {
          .session-actions {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </>
  );
}
