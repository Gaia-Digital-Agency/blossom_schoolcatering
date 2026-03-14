'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { clearAuthState, fetchWithTimeout, getApiBase } from '../../../lib/auth';

const leftLinks = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/parent', label: 'Parent' },
  { href: '/admin/youngster', label: 'Youngster' },
  { href: '/admin/schools', label: 'Schools' },
  { href: '/admin/delivery', label: 'Delivery' },
];

const rightLinks = [
  { href: '/admin/menu', label: 'Menu' },
  { href: '/admin/kitchen', label: 'Kitchen' },
  { href: '/admin/blackout-dates', label: 'Blackout' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/billing', label: 'Billing' },
];

export default function AdminNav() {
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

  const onLogout = async () => {
    setLoggingOut(true);
    await fetchWithTimeout(`${getApiBase()}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    }).catch(() => undefined);
    clearAuthState();
    window.location.href = '/schoolcatering/admin/login';
  };

  return (
    <>
    <div className="admin-nav-shell">
      <div className="admin-nav-top">
        <strong>Admin Module</strong>
        <button
          type="button"
          className="admin-logout-btn"
          onClick={onLogout}
          disabled={loggingOut}
          aria-label="Logout admin"
        >
          {loggingOut ? 'Logging out...' : 'Logout Admin'}
        </button>
      </div>
      <div className="admin-nav-columns">
        <div className="dev-links admin-nav-links">
          {leftLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? 'page' : undefined}
              className={pathname === link.href ? 'admin-nav-item admin-nav-item-active' : 'admin-nav-item'}
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div className="dev-links admin-nav-links">
          {rightLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? 'page' : undefined}
              className={pathname === link.href ? 'admin-nav-item admin-nav-item-active' : 'admin-nav-item'}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
      <style jsx>{`
        .admin-nav-shell {
          margin: 0.45rem 0 1rem;
          padding: 0.65rem;
          border: 1px solid #d7c8ae;
          border-radius: 0.75rem;
          background: #fffdf8;
          box-shadow: 0 2px 8px rgba(47, 39, 29, 0.06);
        }
        .admin-nav-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 0.65rem;
        }
        .admin-nav-top strong {
          color: #2f271d;
          font-size: 0.95rem;
        }
        .admin-logout-btn {
          border: 1px solid #7c2d12;
          background: #9a3412;
          color: #fff;
          border-radius: 0.5rem;
          padding: 0.42rem 0.8rem;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
        }
        .admin-logout-btn:hover:not(:disabled) {
          background: #7c2d12;
        }
        .admin-logout-btn:disabled {
          opacity: 0.7;
          cursor: default;
        }
        .admin-nav-columns {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.6rem;
        }
        @media (min-width: 860px) {
          .admin-nav-columns {
            grid-template-columns: 1fr 1fr;
            gap: 0.9rem;
          }
        }
        .admin-nav-links {
          grid-template-columns: minmax(0, 1fr);
          margin-bottom: 0;
        }
        .admin-nav-links :global(.admin-nav-item) {
          border: 1px solid #ccbda2;
          background: #fff;
          border-radius: 0.55rem;
          padding: 0.5rem 0.7rem;
          color: #302a22;
          text-decoration: none;
          transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.15s ease;
        }
        .admin-nav-links :global(.admin-nav-item:hover) {
          background: #f4e8d2;
          border-color: #9e6b20;
          color: #35220c;
          transform: translateY(-1px);
        }
        .admin-nav-links :global(.admin-nav-item-active) {
          background: #2f271d;
          border-color: #2f271d;
          color: #fff2d2;
          font-weight: 700;
        }
        .admin-nav-links :global(.admin-nav-item-active:hover) {
          background: #3a3125;
          border-color: #3a3125;
          color: #fff2d2;
        }
      `}</style>
    </div>
    </>
  );
}
