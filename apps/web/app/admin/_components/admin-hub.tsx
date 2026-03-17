'use client';

import { getAppBase } from '../../../lib/auth';
import LogoutButton from '../../_components/logout-button';

const HUB_ITEMS = [
  { label: 'Dashboard', icon: '📊', href: '/admin/dashboard' },
  { label: 'Family', icon: '👨‍👩‍👧', href: '/admin/family' },
  { label: 'Student', icon: '🎓', href: '/admin/student' },
  { label: 'Schools', icon: '🏫', href: '/admin/schools' },
  { label: 'Delivery', icon: '🚚', href: '/admin/delivery' },
  { label: 'Orders', icon: '📦', href: '/admin/orders' },
  { label: 'Menu', icon: '🍽️', href: '/admin/menu' },
  { label: 'Kitchen', icon: '👩‍🍳', href: '/admin/kitchen' },
  { label: 'Blackout', icon: '📅', href: '/admin/blackout-dates' },
  { label: 'Reports', icon: '📈', href: '/admin/reports' },
];

export default function AdminHub() {
  return (
    <main className="page-auth page-auth-mobile">
      <section className="auth-panel admin-hub-panel">
        <div className="admin-hub-top">
          <div>
            <h1>Admin Module</h1>
            <p>Choose a module.</p>
          </div>
        </div>
        <div className="admin-hub-grid">
          {HUB_ITEMS.map((item) => (
            <button
              key={item.href}
              type="button"
              className="admin-hub-card"
              onClick={() => {
                window.location.href = `${getAppBase()}${item.href}`;
              }}
              aria-label={item.label}
            >
              <span className="admin-hub-icon" aria-hidden="true">{item.icon}</span>
              <span className="admin-hub-label">{item.label}</span>
            </button>
          ))}
        </div>
        <LogoutButton showRecord={false} sticky={false} />
      </section>
      <style jsx>{`
        .admin-hub-panel {
          width: min(520px, 100%);
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .admin-hub-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.85rem;
        }
        .admin-hub-top h1 {
          margin: 0;
        }
        .admin-hub-top p {
          margin: 0.2rem 0 0;
          color: #7a6a58;
          font-size: 0.9rem;
        }
        .admin-hub-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
        }
        .admin-hub-card {
          aspect-ratio: 1;
          border: 1.5px solid #d8cab1;
          border-radius: 1.1rem;
          background: radial-gradient(circle at 30% 20%, rgba(255, 251, 240, 0.98), rgba(255, 240, 210, 0.94));
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          padding: 0.65rem 0.45rem;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(122, 106, 88, 0.12);
          transition: transform 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
        }
        .admin-hub-card:hover {
          transform: translateY(-3px);
          border-color: #b8860b;
          box-shadow: 0 10px 24px rgba(122, 106, 88, 0.18);
        }
        .admin-hub-icon {
          font-size: clamp(2rem, 11vw, 2.8rem);
          line-height: 1;
        }
        .admin-hub-label {
          width: 100%;
          text-align: center;
          font-size: clamp(0.86rem, 3vw, 1rem);
          font-weight: 700;
          color: #5d4e3a;
          line-height: 1.15;
          text-wrap: balance;
        }
      `}</style>
    </main>
  );
}
