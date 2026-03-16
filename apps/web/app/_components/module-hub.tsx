'use client';

import { useRouter } from 'next/navigation';
import { clearBrowserSession } from '../../lib/auth';

type ModuleType = 'family' | 'student';

const HUB_ITEMS: Record<ModuleType, Array<{ label: string; icon: string; href?: string; logsOut?: boolean }>> = {
  family: [
    { label: 'Overview', icon: '📅', href: '/family/overview' },
    { label: 'Order', icon: '🛒', href: '/family/order' },
    { label: 'Billing', icon: '💳', href: '/family/billing' },
    { label: 'Rating', icon: '⭐', href: '/rating' },
    { label: 'Menu', icon: '🍽️', href: '/menu' },
    { label: 'Logout', icon: '🏠', logsOut: true },
  ],
  student: [
    { label: 'Overview', icon: '📅', href: '/student/overview' },
    { label: 'Order', icon: '🛒', href: '/student/order' },
    { label: 'Billing', icon: '💳', href: '/student/billing' },
    { label: 'Rating', icon: '⭐', href: '/rating' },
    { label: 'Menu', icon: '🍽️', href: '/menu' },
    { label: 'Logout', icon: '🏠', logsOut: true },
  ],
};

export default function ModuleHub({
  module,
  title,
}: {
  module: ModuleType;
  title: string;
}) {
  const router = useRouter();

  const onHome = async () => {
    await clearBrowserSession();
    router.push('/');
  };

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
                if (item.logsOut) {
                  void onHome();
                  return;
                }
                if (item.href) router.push(item.href);
              }}
              aria-label={item.label}
            >
              <span className="module-hub-icon" aria-hidden="true">{item.icon}</span>
              <span className="module-hub-label">{item.label}</span>
            </button>
          ))}
        </div>
      </section>
      <style jsx>{`
        .page-auth {
          min-height: 100dvh;
          padding: 0.65rem;
          overflow: hidden;
        }
        .auth-panel {
          width: min(680px, 100%);
          max-width: 100%;
          min-height: calc(100dvh - 1.3rem);
          max-height: calc(100dvh - 1.3rem);
          padding: 0.85rem;
          display: grid;
          grid-template-rows: auto 1fr;
          gap: 0.7rem;
          overflow: hidden;
        }
        .auth-panel h1 {
          margin: 0;
          line-height: 1;
        }
        .module-hub-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.65rem;
          min-height: 0;
        }
        .module-hub-card {
          min-height: 0;
          border: 1px solid #d8cab1;
          border-radius: 1.15rem;
          background:
            radial-gradient(circle at top, rgba(255, 248, 232, 0.95), rgba(255, 243, 225, 0.92)),
            linear-gradient(180deg, #fffdf8 0%, #fff1d7 100%);
          display: grid;
          grid-template-rows: minmax(0, 1fr) auto;
          align-items: center;
          justify-items: center;
          gap: 0.25rem;
          padding: 0.45rem 0.35rem 0.5rem;
          cursor: pointer;
          transition: transform 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
          box-shadow: 0 12px 26px rgba(122, 106, 88, 0.11);
          min-width: 0;
        }
        .module-hub-card:hover {
          transform: translateY(-2px);
          border-color: #b8860b;
          box-shadow: 0 16px 32px rgba(122, 106, 88, 0.16);
        }
        .module-hub-icon {
          width: min(100%, 3.4rem);
          aspect-ratio: 1;
          border-radius: 999px;
          background: #fff;
          border: 1px solid #ecd7ae;
          display: grid;
          place-items: center;
          font-size: clamp(1.45rem, 5vw, 1.8rem);
          line-height: 1;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.95);
        }
        .module-hub-label {
          width: 100%;
          font-size: 0.82rem;
          font-weight: 700;
          color: #5d4e3a;
          text-align: center;
          line-height: 1.05;
          text-wrap: balance;
        }
        @media (max-width: 460px) {
          .page-auth {
            padding: 0.5rem;
          }
          .auth-panel {
            min-height: calc(100dvh - 1rem);
            max-height: calc(100dvh - 1rem);
            padding: 0.75rem;
            gap: 0.6rem;
          }
          .module-hub-grid {
            gap: 0.5rem;
          }
          .module-hub-card {
            padding: 0.35rem 0.25rem 0.45rem;
            border-radius: 0.95rem;
          }
          .module-hub-label {
            font-size: 0.76rem;
          }
        }
      `}</style>
    </main>
  );
}
