'use client';

import { getAppBase } from '../../lib/auth';
import LogoutButton from './logout-button';

type ModuleType = 'family' | 'student';

const HUB_ITEMS: Record<ModuleType, Array<{ label: string; icon: string; href?: string }>> = {
  family: [
    { label: 'Overview', icon: '📅', href: '/family/overview' },
    { label: 'Order', icon: '🛒', href: '/family/order' },
    { label: 'Billing', icon: '💳', href: '/family/billing' },
    { label: 'Rating', icon: '⭐', href: '/rating' },
    { label: 'Menu', icon: '🍽️', href: '/menu' },
  ],
  student: [
    { label: 'Overview', icon: '📅', href: '/student/overview' },
    { label: 'Order', icon: '🛒', href: '/student/order' },
    { label: 'Billing', icon: '💳', href: '/student/billing' },
    { label: 'Rating', icon: '⭐', href: '/rating' },
    { label: 'Menu', icon: '🍽️', href: '/menu' },
  ],
};

export default function ModuleHub({
  module,
  title,
}: {
  module: ModuleType;
  title: string;
}) {
  return (
    <main className="page-auth page-auth-mobile">
      <section className="auth-panel">
        <h1>{title}</h1>
        <div className="module-hub-grid">
          {HUB_ITEMS[module].map((item) => (
            <button
              key={item.label}
              type="button"
              className="module-hub-card"
              onClick={() => {
                if (item.href) window.location.href = `${getAppBase()}${item.href}`;
              }}
              aria-label={item.label}
            >
              <span className="module-hub-icon" aria-hidden="true">{item.icon}</span>
              <span className="module-hub-label">{item.label}</span>
            </button>
          ))}
        </div>
        <LogoutButton showRecord={false} sticky={false} />
      </section>
      <style jsx>{`
        .page-auth {
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.25rem 1rem;
        }
        .auth-panel {
          width: min(480px, 100%);
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .auth-panel h1 {
          margin: 0;
          line-height: 1;
        }
        .module-hub-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.75rem;
        }
        .module-hub-card {
          aspect-ratio: 1;
          border: 1.5px solid #d8cab1;
          border-radius: 1.1rem;
          background:
            radial-gradient(circle at 30% 20%, rgba(255, 251, 240, 0.98), rgba(255, 240, 210, 0.94));
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          padding: 0.6rem 0.4rem 0.65rem;
          cursor: pointer;
          transition: transform 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
          box-shadow: 0 4px 14px rgba(122, 106, 88, 0.12);
        }
        .module-hub-card:hover {
          transform: translateY(-3px);
          border-color: #b8860b;
          box-shadow: 0 10px 24px rgba(122, 106, 88, 0.18);
        }
        .module-hub-icon {
          font-size: clamp(2rem, 9vw, 2.6rem);
          line-height: 1;
        }
        .module-hub-label {
          width: 100%;
          font-size: clamp(0.78rem, 3vw, 0.95rem);
          font-weight: 700;
          color: #5d4e3a;
          text-align: center;
          line-height: 1.15;
          text-wrap: balance;
        }
      `}</style>
    </main>
  );
}
