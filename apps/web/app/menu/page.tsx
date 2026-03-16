'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { fetchWithTimeout, getApiBase, ROLE_KEY, type Role } from '../../lib/auth';
import SessionBadge from '../_components/session-badge';
import { getSessionCardStyle } from '../../lib/session-theme';

type PublicMenuItem = {
  id: string;
  name: string;
  description?: string;
  calories_kcal?: number | null;
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

const CATEGORY_GROUPS: Array<{ code: string; label: string }> = [
  { code: 'MAIN', label: 'Main' },
  { code: 'DRINK', label: 'Drinks' },
  { code: 'APPETISER', label: 'Appetiser' },
  { code: 'GARNISH', label: 'Garnish' },
  { code: 'COMPLEMENT', label: 'Complement' },
  { code: 'DESSERT', label: 'Dessert' },
  { code: 'SIDES', label: 'Sides' },
];

export default function MenuPage() {
  const [items, setItems] = useState<PublicMenuItem[]>([]);
  const [serviceDate, setServiceDate] = useState('');
  const [error, setError] = useState('');
  const [returnHref, setReturnHref] = useState('/login');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchWithTimeout(`${getApiBase()}/public/menu`, {
          credentials: 'include',
          cache: 'no-cache',
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

  useEffect(() => {
    const role = localStorage.getItem(ROLE_KEY) as Role | null;
    if (role === 'PARENT') {
      setReturnHref('/family');
      return;
    }
    if (role === 'YOUNGSTER') {
      setReturnHref('/student');
    }
  }, []);

  const groupedItems = useMemo(() => {
    const byCategory = new Map<string, PublicMenuItem[]>();
    for (const item of items) {
      const rawCode = String(item.dish_category || 'MAIN').toUpperCase();
      const code = rawCode === 'SNACKS' ? 'SIDES' : rawCode;
      const list = byCategory.get(code) || [];
      list.push(item);
      byCategory.set(code, list);
    }
    return CATEGORY_GROUPS
      .map((group) => ({
        ...group,
        items: (byCategory.get(group.code) || [])
          .slice()
          .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' })),
      }))
      .filter((group) => group.items.length > 0);
  }, [items]);

  return (
    <main className="page-auth page-auth-mobile">
      <section className="auth-panel">
        <h1>Menu</h1>
        <div className="module-guide-card">
          Log in to order for students from Blossom Steakhouse Kitchen.
        </div>
        {error ? <p className="auth-error">{error}</p> : null}

        {items.length === 0 ? (
          <p className="auth-help">No active dishes available.</p>
        ) : (
          <div className="menu-layout">
            {/* Left column: Main dishes only */}
            {groupedItems.filter((g) => g.code === 'MAIN').map((group) => (
              <section className="menu-category-card" key={group.code}>
                <h2>{group.label}</h2>
                <div className="menu-public-grid">
                  {group.items.map((item) => (
                    <article className="menu-public-card" key={item.id} style={getSessionCardStyle(item.session)}>
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
                        <SessionBadge session={item.session} />
                        <strong>{item.name || 'TBA'}</strong>
                        <small>Price: {Number(item.price || 0) > 0 ? `Rp ${Number(item.price || 0).toLocaleString('id-ID')}` : 'TBA'}</small>
                        <small>Description: {(item.description || '').trim() || 'TBA'}</small>
                        <small>Calories: {item.calories_kcal ?? 'TBA'}</small>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
            {/* Right column: Dessert, Sides, Drinks, etc. stacked independently */}
            {groupedItems.some((g) => g.code !== 'MAIN') ? (
              <div className="menu-col-secondary">
                {groupedItems.filter((g) => g.code !== 'MAIN').map((group) => (
                  <section className="menu-category-card" key={group.code}>
                    <h2>{group.label}</h2>
                    <div className="menu-public-grid">
                      {group.items.map((item) => (
                        <article className="menu-public-card" key={item.id} style={getSessionCardStyle(item.session)}>
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
                            <SessionBadge session={item.session} />
                            <strong>{item.name || 'TBA'}</strong>
                            <small>Price: {Number(item.price || 0) > 0 ? `Rp ${Number(item.price || 0).toLocaleString('id-ID')}` : 'TBA'}</small>
                            <small>Description: {(item.description || '').trim() || 'TBA'}</small>
                            <small>Calories: {item.calories_kcal ?? 'TBA'}</small>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : null}
          </div>
        )}

        <div className="dev-links">
          <Link href={returnHref}>Return</Link>
          <Link href="/rating">Rating</Link>
        </div>
      </section>
      <style jsx>{`
        /* Outer two-column layout: Main left, secondary categories right */
        .menu-layout {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.85rem;
          align-items: start;
        }
        /* Right column: stacks Dessert, Sides, etc. each at their own height */
        .menu-col-secondary {
          display: grid;
          gap: 0.85rem;
          align-content: start;
        }
        .menu-category-card {
          border: 1px solid #d8cab1;
          border-radius: 0.85rem;
          background: #fffdf9;
          padding: 0.65rem;
          display: grid;
          gap: 0.6rem;
        }
        .menu-category-card h2 {
          margin: 0;
          font-size: 1rem;
          color: #3b332a;
        }
        .menu-public-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
        }
        .menu-public-card {
          border: 1px solid var(--session-strong, #d8cab1);
          border-radius: 0.75rem;
          background: linear-gradient(180deg, #fff 0%, var(--session-soft, #fff) 100%);
          overflow: hidden;
          display: grid;
          grid-template-rows: 120px auto;
          box-shadow: 0 6px 18px rgba(122, 106, 88, 0.08);
        }
        .menu-public-grid > .menu-public-card:only-child,
        .menu-public-grid > .menu-public-card:last-child:nth-child(odd) {
          grid-column: 1 / -1;
        }
        .menu-public-card img {
          width: 100%;
          height: 120px;
          object-fit: cover;
          display: block;
        }
        .menu-public-card div {
          border-top: 1px solid var(--session-strong, #d8cab1);
          padding-inline: 0.55rem;
          padding-top: 0.55rem;
          padding-bottom: 0.55rem;
          display: grid;
          gap: 0.2rem;
          align-content: start;
        }
        .menu-public-card small {
          color: #5d554b;
        }
        .module-guide-card {
          background: #fffbf4;
          border: 1px solid #e8d9c0;
          border-left: 3px solid #c8a96e;
          border-radius: 0.6rem;
          padding: 0.6rem 0.85rem;
          font-size: 0.82rem;
          color: #6b5a43;
          margin-bottom: 0.85rem;
        }
        @media (min-width: 900px) {
          /* Side-by-side: Main (left) | secondary categories (right) */
          .menu-layout {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>
    </main>
  );
}
