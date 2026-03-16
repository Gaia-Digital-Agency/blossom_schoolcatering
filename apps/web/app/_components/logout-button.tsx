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
          position: static;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 0.45rem;
          justify-content: flex-start;
          margin: 0.85rem 1rem 1.2rem;
          flex-wrap: wrap;
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
