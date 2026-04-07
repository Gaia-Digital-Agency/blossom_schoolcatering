'use client';

import { getAppBase } from '../../../lib/auth';
import LogoutButton from '../../_components/logout-button';

const HUB_ITEMS = [
  { label: 'Dashboard', iconSrc: '/schoolcatering/assets/icons/dashboard.png', href: '/admin/dashboard' },
  { label: 'Family', iconSrc: '/schoolcatering/assets/icons/family.png', href: '/admin/family' },
  { label: 'Student', iconSrc: '/schoolcatering/assets/icons/student.png', href: '/admin/student' },
  { label: 'Schools', iconSrc: '/schoolcatering/assets/icons/schools.png', href: '/admin/schools' },
  { label: 'Delivery', iconSrc: '/schoolcatering/assets/icons/delivery.png', href: '/admin/delivery' },
  { label: 'Menu', iconSrc: '/schoolcatering/assets/icons/menu.png', href: '/admin/menu' },
  { label: 'Orders', iconSrc: '/schoolcatering/assets/icons/order.png', href: '/admin/orders' },
  { label: 'Multi Orders', iconSrc: '/schoolcatering/assets/icons/multiorder.png', href: '/admin/multiorders' },
  { label: 'Billing', iconSrc: '/schoolcatering/assets/icons/billing.png', href: '/admin/billing' },
  { label: 'Blackout', iconSrc: '/schoolcatering/assets/icons/blackout.png', href: '/admin/blackout-dates' },
  { label: 'Kitchen', iconSrc: '/schoolcatering/assets/icons/kitchen.png', href: '/admin/kitchen' },
  { label: 'Rating', iconSrc: '/schoolcatering/assets/icons/rating.png', href: '/admin/rating' },
  { label: 'Reports', iconSrc: '/schoolcatering/assets/icons/report.png', href: '/admin/reports' },
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
          <button
            type="button"
            className="admin-create-order-button"
            onClick={() => {
              window.location.href = `${getAppBase()}/admin/create-order`;
            }}
          >
            Create Order
          </button>
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
        .admin-create-order-button {
          border: 1px solid #c8a96e;
          border-radius: 999px;
          background: linear-gradient(180deg, #fff5db 0%, #f2dfad 100%);
          color: #4f3a16;
          font-weight: 700;
          padding: 0.75rem 1rem;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(122, 106, 88, 0.12);
          transition: transform 0.14s ease, box-shadow 0.14s ease;
        }
        .admin-create-order-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 24px rgba(122, 106, 88, 0.18);
        }
        .admin-hub-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.75rem;
        }
        .admin-hub-card {
          aspect-ratio: 1;
          border: none;
          border-radius: 1.1rem;
          background: transparent;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          padding: 0.8rem 0.55rem;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(122, 106, 88, 0.12);
          transition: transform 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
        }
        .admin-hub-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 24px rgba(122, 106, 88, 0.18);
        }
        @media (max-width: 640px) {
          .admin-hub-top {
            flex-direction: column;
            align-items: stretch;
          }
        }
      `}</style>
    </main>
  );
}
