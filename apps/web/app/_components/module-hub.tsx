'use client';

import { useEffect, useState } from 'react';
import { apiFetch, getAppBase } from '../../lib/auth';
import LogoutButton from './logout-button';

type ModuleType = 'family' | 'student';

type StudentProfile = {
  first_name?: string;
  school_name?: string;
  school_short_name?: string;
};

const HUB_ITEMS: Record<ModuleType, Array<{ label: string; iconSrc: string; href?: string }>> = {
  family: [
    { label: 'Overview', iconSrc: '/schoolcatering/assets/icons/overview.jpeg', href: '/family/overview' },
    { label: 'Order', iconSrc: '/schoolcatering/assets/icons/order.jpeg', href: '/family/order' },
    { label: 'Record', iconSrc: '/schoolcatering/assets/icons/report.jpeg', href: '/family/consolorder' },
    { label: 'Billing', iconSrc: '/schoolcatering/assets/icons/billing.jpeg', href: '/family/billing' },
    { label: 'Rating', iconSrc: '/schoolcatering/assets/icons/rating.jpeg', href: '/rating' },
    { label: 'Menu', iconSrc: '/schoolcatering/assets/icons/menu.jpeg', href: '/menu' },
  ],
  student: [
    { label: 'Overview', iconSrc: '/schoolcatering/assets/icons/overview.jpeg', href: '/student/overview' },
    { label: 'Order', iconSrc: '/schoolcatering/assets/icons/order.jpeg', href: '/student/order' },
    { label: 'Record', iconSrc: '/schoolcatering/assets/icons/report.jpeg', href: '/student/consolorder' },
    { label: 'Billing', iconSrc: '/schoolcatering/assets/icons/billing.jpeg', href: '/student/billing' },
    { label: 'Rating', iconSrc: '/schoolcatering/assets/icons/rating.jpeg', href: '/rating' },
    { label: 'Menu', iconSrc: '/schoolcatering/assets/icons/menu.jpeg', href: '/menu' },
  ],
};

export default function ModuleHub({
  module,
  title,
}: {
  module: ModuleType;
  title: string;
}) {
  const [subtitle, setSubtitle] = useState('');

  useEffect(() => {
    let active = true;

    const loadSubtitle = async () => {
      try {
        if (module === 'family') {
          const me = await apiFetch('/auth/me') as { displayName?: string };
          const fullName = (me.displayName || '').trim();
          const firstName = fullName.split(/\s+/).filter(Boolean)[0] || '';
          if (active && firstName) setSubtitle(`Logged In as ${firstName}`);
          return;
        }

        const profile = await apiFetch('/children/me') as StudentProfile;
        const firstName = (profile.first_name || '').trim();
        const schoolName = (profile.school_short_name || '').trim();
        if (!active || !firstName) return;
        setSubtitle(schoolName ? `Logged In as ${firstName} in ${schoolName}` : `Logged In as ${firstName}`);
      } catch {
        if (active) setSubtitle('');
      }
    };

    void loadSubtitle();

    return () => {
      active = false;
    };
  }, [module]);

  return (
    <main className="page-auth page-auth-mobile">
      <section className="auth-panel">
        <h1>{title}</h1>
        {subtitle ? <p className="module-login-label">{subtitle}</p> : null}
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
              <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.iconSrc} alt="" style={{ width: '78%', height: 'auto', objectFit: 'contain', display: 'block' }} />
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
        .module-login-label {
          margin: -0.55rem 0 0;
          font-size: 1rem;
          font-style: italic;
          font-weight: 800;
          color: #5d4e3a;
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
          padding: 0.8rem 0.55rem;
          cursor: pointer;
          transition: transform 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
          box-shadow: 0 4px 14px rgba(122, 106, 88, 0.12);
        }
        .module-hub-card:hover {
          transform: translateY(-3px);
          border-color: #b8860b;
          box-shadow: 0 10px 24px rgba(122, 106, 88, 0.18);
        }
      `}</style>
    </main>
  );
}
