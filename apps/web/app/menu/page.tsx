'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getApiBase } from '../../lib/auth';

type PublicMenuItem = {
  id: string;
  name: string;
  image_url: string;
  updated_at?: string;
  session: 'LUNCH' | 'SNACK' | 'BREAKFAST';
  service_date: string;
};

export default function MenuPage() {
  const [items, setItems] = useState<PublicMenuItem[]>([]);
  const [serviceDate, setServiceDate] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${getApiBase()}/public/menu`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('Failed loading menu');
        const data = await res.json() as { serviceDate: string; items: PublicMenuItem[] };
        setServiceDate(data.serviceDate || '');
        setItems(data.items || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed loading menu');
      }
    };
    load().catch(() => undefined);
  }, []);

  return (
    <main className="page-auth page-auth-mobile">
      <section className="auth-panel">
        <h1>Menu</h1>
        <p className="auth-help">Viewing only. Active dishes from Admin configuration.</p>
        {serviceDate ? <p className="auth-help">Service Date: {serviceDate}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        {items.length === 0 ? (
          <p className="auth-help">No active dishes available.</p>
        ) : (
          <div className="menu-public-grid">
            {items.map((item) => (
              <article className="menu-public-card" key={item.id}>
                <img
                  src={`${item.image_url}${item.updated_at ? `?v=${encodeURIComponent(item.updated_at)}` : ''}`}
                  alt={item.name}
                  loading="lazy"
                />
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.session}</small>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="dev-links">
          <Link href="/">Back to Home</Link>
          <Link href="/guide">Menu &amp; Guide</Link>
        </div>
      </section>
      <style jsx>{`
        .menu-public-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
        }
        .menu-public-card {
          border: 1px solid #d8cab1;
          border-radius: 0.75rem;
          background: #fff;
          overflow: hidden;
          display: grid;
          gap: 0.4rem;
          padding-bottom: 0.5rem;
        }
        .menu-public-card img {
          width: 100%;
          height: 120px;
          object-fit: cover;
          display: block;
        }
        .menu-public-card div {
          padding-inline: 0.55rem;
          display: grid;
          gap: 0.2rem;
        }
        .menu-public-card small {
          color: #5d554b;
        }
        @media (min-width: 900px) {
          .menu-public-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }
      `}</style>
    </main>
  );
}
