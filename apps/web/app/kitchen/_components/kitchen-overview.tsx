'use client';

import { getAppBase } from '../../../lib/auth';
import LogoutButton from '../../_components/logout-button';

const KITCHEN_ITEMS = [
  { label: 'Yesterday', iconSrc: '/schoolcatering/assets/icons/yesterday.png', href: '/kitchen/yesterday' },
  { label: 'Today', iconSrc: '/schoolcatering/assets/icons/today.png', href: '/kitchen/today', active: true },
  { label: 'Tomorrow', iconSrc: '/schoolcatering/assets/icons/tomorrow.png', href: '/kitchen/tomorrow' },
  { label: 'Select Date', iconSrc: '/schoolcatering/assets/icons/date.png', href: '/kitchen/select-date' },
];

export default function KitchenOverview() {
  return (
    <main className="page-auth page-auth-mobile">
      <section className="auth-panel">
        <h1>Kitchen Overview</h1>
        <div className="module-hub-grid module-hub-grid-kitchen">
          {KITCHEN_ITEMS.map((item) => (
            <button
              key={item.label}
              type="button"
              className={item.active ? 'module-hub-card module-hub-card-active' : 'module-hub-card'}
              onClick={() => {
                window.location.href = `${getAppBase()}${item.href}`;
              }}
              aria-label={item.label}
            >
              <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.iconSrc} alt="" style={{ width: '100%', height: 'auto', objectFit: 'contain', display: 'block' }} />
              </span>
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
          gap: 0.75rem;
        }
        .module-hub-grid-kitchen {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .module-hub-card {
          aspect-ratio: 1;
          border: none;
          border-radius: 1.1rem;
          background: transparent;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          padding: 0.6rem 0.4rem 0.65rem;
          cursor: pointer;
          transition: transform 0.14s ease, box-shadow 0.14s ease;
          box-shadow: 0 4px 14px rgba(122, 106, 88, 0.12);
        }
        .module-hub-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 24px rgba(122, 106, 88, 0.18);
        }
        .module-hub-card-active {
          box-shadow: 0 4px 14px rgba(184, 134, 11, 0.25);
        }
      `}</style>
    </main>
  );
}
