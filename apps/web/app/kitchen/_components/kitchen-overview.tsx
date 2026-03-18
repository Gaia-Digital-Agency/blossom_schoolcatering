'use client';

import Image from 'next/image';
import { getAppBase } from '../../../lib/auth';
import LogoutButton from '../../_components/logout-button';

const KITCHEN_ITEMS = [
  { label: 'Yesterday', iconSrc: '/schoolcatering/assets/icons/yesterday.jpeg', href: '/kitchen/yesterday' },
  { label: 'Today', iconSrc: '/schoolcatering/assets/icons/today.jpeg', href: '/kitchen/today', active: true },
  { label: 'Tomorrow', iconSrc: '/schoolcatering/assets/icons/tomorrow.jpeg', href: '/kitchen/tomorrow' },
  { label: 'Select Date', iconSrc: '/schoolcatering/assets/icons/date.jpeg', href: '/kitchen/select-date' },
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
              <span className="module-hub-icon" aria-hidden="true">
                <Image src={item.iconSrc} alt="" width={160} height={160} className="module-hub-icon-image" />
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
          border: 1.5px solid #d8cab1;
          border-radius: 1.1rem;
          background: radial-gradient(circle at 30% 20%, rgba(255, 251, 240, 0.98), rgba(255, 240, 210, 0.94));
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
        .module-hub-card-active {
          border-color: #b8860b;
          background: radial-gradient(circle at 30% 20%, rgba(255, 248, 225, 0.98), rgba(255, 230, 180, 0.96));
        }
        .module-hub-icon {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .module-hub-icon-image {
          width: min(100%, 7.5rem);
          height: auto;
          object-fit: contain;
        }
      `}</style>
    </main>
  );
}
