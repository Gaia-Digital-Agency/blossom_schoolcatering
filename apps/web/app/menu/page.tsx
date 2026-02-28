'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchWithTimeout, getApiBase } from '../../lib/auth';
import { formatDishCategoryLabel, formatDishDietaryTags } from '../../lib/dish-tags';

type PublicMenuItem = {
  id: string;
  name: string;
  price: number;
  image_url: string;
  is_available?: boolean;
  is_vegetarian?: boolean;
  is_gluten_free?: boolean;
  is_dairy_free?: boolean;
  contains_peanut?: boolean;
  dish_category?: string;
  updated_at?: string;
  session: 'LUNCH' | 'SNACK' | 'BREAKFAST';
  service_date: string;
};

const FALLBACK_DISH_IMAGE = '/schoolcatering/assets/hero-meal.jpg';

function withCacheBust(src: string, updatedAt?: string) {
  if (!updatedAt?.trim()) return src;
  try {
    const u = new URL(src, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    u.searchParams.set('v', updatedAt);
    if (/^https?:\/\//i.test(src)) return u.toString();
    return `${u.pathname}${u.search}`;
  } catch {
    const sep = src.includes('?') ? '&' : '?';
    return `${src}${sep}v=${encodeURIComponent(updatedAt)}`;
  }
}

function resolveDishImageSrc(item: PublicMenuItem) {
  const raw = String(item.image_url || '').trim();
  if (!raw) return withCacheBust(FALLBACK_DISH_IMAGE, item.updated_at);
  if (raw.startsWith('data:image/')) return raw;
  if (/^https?:\/\//i.test(raw)) return withCacheBust(raw, item.updated_at);
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  return withCacheBust(normalized, item.updated_at);
}

export default function MenuPage() {
  const [items, setItems] = useState<PublicMenuItem[]>([]);
  const [serviceDate, setServiceDate] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchWithTimeout(`${getApiBase()}/public/menu`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('Failed loading menu');
        const data = await res.json() as { serviceDate: string; items: PublicMenuItem[] };
        setServiceDate(data.serviceDate || '');
        setItems((data.items || []).filter((item) => item.is_available !== false));
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
                  src={resolveDishImageSrc(item)}
                  alt={item.name}
                  loading="lazy"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (target.src.includes(FALLBACK_DISH_IMAGE)) return;
                    target.src = FALLBACK_DISH_IMAGE;
                  }}
                />
                <div>
                  <strong>{item.name}</strong>
                  <small>Rp {Number(item.price || 0).toLocaleString('id-ID')}</small>
                  <small>Category: {formatDishCategoryLabel(item.dish_category)}</small>
                  <small>Dietary: {formatDishDietaryTags(item)}</small>
                  <small>{item.session}</small>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="dev-links">
          <Link href="/">Back to Home</Link>
          <Link href="/rating">Rating</Link>
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
