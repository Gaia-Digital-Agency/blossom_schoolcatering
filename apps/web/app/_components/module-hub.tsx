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

type SiteSettings = {
  assistance_message?: string;
  ai_future_enabled?: boolean;
};

type HubItem = {
  label: string;
  href?: string;
  iconSrc?: string;
  variant?: 'image' | 'text';
  textValue?: string;
  featureFlag?: 'ai_future_enabled';
  disabledMessage?: string;
};

const HUB_ITEMS: Record<ModuleType, HubItem[]> = {
  family: [
    { label: 'Overview', iconSrc: '/assets/icons/overview.png', href: '/family/overview' },
    { label: 'Order', iconSrc: '/assets/icons/order.png', href: '/family/order' },
    { label: 'Multi Order', iconSrc: '/assets/icons/multiorder.png', href: '/family/multiorder' },
    { label: 'Billing', iconSrc: '/assets/icons/billing.png', href: '/family/billing' },
    { label: 'Record', iconSrc: '/assets/icons/report.png', href: '/family/consolorder' },
    { label: 'Rating', iconSrc: '/assets/icons/rating.png', href: '/rating' },
    { label: 'Menu', iconSrc: '/assets/icons/menu.png', href: '/menu' },
    { label: 'gAIa', href: '/family/gaia', variant: 'text', textValue: 'gAIa', featureFlag: 'ai_future_enabled', disabledMessage: 'Furure Function' },
  ],
  student: [
    { label: 'Overview', iconSrc: '/assets/icons/overview.png', href: '/student/overview' },
    { label: 'Order', iconSrc: '/assets/icons/order.png', href: '/student/order' },
    { label: 'Multi Order', iconSrc: '/assets/icons/multiorder.png', href: '/student/multiorder' },
    { label: 'Billing', iconSrc: '/assets/icons/billing.png', href: '/student/billing' },
    { label: 'Record', iconSrc: '/assets/icons/report.png', href: '/student/consolorder' },
    { label: 'Rating', iconSrc: '/assets/icons/rating.png', href: '/rating' },
    { label: 'Menu', iconSrc: '/assets/icons/menu.png', href: '/menu' },
    { label: 'gAIa', href: '/student/gaia', variant: 'text', textValue: 'gAIa', featureFlag: 'ai_future_enabled', disabledMessage: 'Furure Function' },
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
  const [assistanceMessage, setAssistanceMessage] = useState('For Assistance Please Whatsapp +6285211710217');
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({});

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

  useEffect(() => {
    let active = true;
    fetch('/api/v1/public/site-settings', { credentials: 'include' })
      .then((res) => res.ok ? res.json() : null)
      .then((data: SiteSettings | null) => {
        if (!active) return;
        setSiteSettings(data || {});
        if (data?.assistance_message?.trim()) setAssistanceMessage(data.assistance_message.trim());
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="page-auth page-auth-mobile">
      <section className="auth-panel">
        <h1>{title}</h1>
        {subtitle ? <p className="module-login-label">{subtitle}</p> : null}
        <div className="module-hub-grid">
          {HUB_ITEMS[module].map((item) => {
            const isFeatureEnabled = item.featureFlag ? Boolean(siteSettings[item.featureFlag]) : true;
            return (
              <button
                key={item.label}
                type="button"
                className={`module-hub-card${!isFeatureEnabled ? ' module-hub-card-disabled' : ''}${item.variant === 'text' ? ' module-hub-card-text' : ''}`}
                onClick={() => {
                  if (!isFeatureEnabled) return;
                  if (item.href) window.location.href = `${getAppBase()}${item.href}`;
                }}
                aria-label={item.label}
                title={!isFeatureEnabled ? item.disabledMessage : item.label}
                disabled={!isFeatureEnabled}
              >
                {item.variant === 'text' ? (
                  <span className="module-hub-card-text-value" aria-hidden="true">{item.textValue || item.label}</span>
                ) : (
                  <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.iconSrc} alt="" style={{ width: '100%', height: 'auto', objectFit: 'contain', display: 'block' }} />
                  </span>
                )}
                {!isFeatureEnabled && item.disabledMessage ? <span className="module-hub-card-note">{item.disabledMessage}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="module-guide-card module-assistance-card">{assistanceMessage}</div>
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
        .module-assistance-card {
          margin-top: 0.25rem;
          text-align: center;
          font-weight: 700;
        }
        .module-hub-card {
          aspect-ratio: 1;
          border: none;
          border-radius: 1.1rem;
          background:
            transparent;
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
        .module-hub-card:disabled {
          cursor: not-allowed;
        }
        .module-hub-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 24px rgba(122, 106, 88, 0.18);
        }
        .module-hub-card-disabled {
          opacity: 0.65;
          box-shadow: 0 2px 8px rgba(122, 106, 88, 0.12);
        }
        .module-hub-card-disabled:hover {
          transform: none;
          box-shadow: 0 2px 8px rgba(122, 106, 88, 0.12);
        }
        .module-hub-card-text {
          background: linear-gradient(145deg, #efe4d1 0%, #dcc198 100%);
          color: #493826;
          justify-content: center;
        }
        .module-hub-card-text-value {
          font-size: clamp(1.7rem, 4vw, 2.35rem);
          font-weight: 900;
          letter-spacing: 0.04em;
          text-transform: none;
        }
        .module-hub-card-note {
          display: block;
          margin-top: 0.35rem;
          font-size: 0.72rem;
          line-height: 1.15;
          text-align: center;
        }
      `}</style>
    </main>
  );
}
