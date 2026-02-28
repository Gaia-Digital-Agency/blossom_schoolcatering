'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, clearAuthState, fetchWithTimeout, getApiBase } from '../../lib/auth';
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

export default function RatingPage() {
  const router = useRouter();
  const [items, setItems] = useState<PublicMenuItem[]>([]);
  const [serviceDate, setServiceDate] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [savingItemId, setSavingItemId] = useState('');
  const [selectedStars, setSelectedStars] = useState<Record<string, number>>({});

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

  const starOptions = useMemo(() => [1, 2, 3, 4, 5], []);

  const onSelectStar = (menuItemId: string, stars: number) => {
    setSelectedStars((prev) => ({ ...prev, [menuItemId]: stars }));
  };

  const onSaveAndGoHome = async () => {
    setError('');
    setMessage('');
    const entries = Object.entries(selectedStars);
    if (entries.length > 0) {
      setSavingItemId('all');
      try {
        await Promise.all(
          entries.map(([menuItemId, stars]) =>
            apiFetch('/ratings', {
              method: 'POST',
              body: JSON.stringify({ menuItemId, stars }),
            }, { skipAutoReload: true })
          )
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed submitting ratings');
        setSavingItemId('');
        return;
      }
      setSavingItemId('');
    }
    await fetchWithTimeout(`${getApiBase()}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    }).catch(() => undefined);
    clearAuthState();
    router.push('/');
  };

  return (
    <main className="page-auth page-auth-mobile">
      <section className="auth-panel">
        <h1>Dish Rating</h1>
        <p className="auth-help">Rate active dishes from 1 to 5 stars.</p>
        {serviceDate ? <p className="auth-help">Service Date: {serviceDate}</p> : null}
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        {items.length === 0 ? (
          <p className="auth-help">No active dishes available.</p>
        ) : (
          <div className="menu-public-grid">
            {items.map((item) => {
              const selected = selectedStars[item.id] ?? 0;
              return (
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
                    <div className="rating-stars" role="group" aria-label={`Rate ${item.name}`}>
                      {starOptions.map((stars) => (
                        <button
                          key={`${item.id}-${stars}`}
                          type="button"
                          className={selected >= stars ? 'rating-star rating-star-active' : 'rating-star'}
                          onClick={() => onSelectStar(item.id, stars)}
                          disabled={savingItemId === 'all'}
                          aria-label={`${stars} star${stars > 1 ? 's' : ''}`}
                        >
                          {selected >= stars ? '★' : '☆'}
                        </button>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="dev-links">
          <button className="btn btn-outline" type="button" onClick={onSaveAndGoHome} disabled={savingItemId === 'all'}>
            {savingItemId === 'all' ? 'Saving...' : 'Back To Home'}
          </button>
          <button className="btn btn-primary" type="button" onClick={onSaveAndGoHome} disabled={savingItemId === 'all'}>
            {savingItemId === 'all' ? 'Saving...' : 'Submit Review'}
          </button>
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
          padding-inline: 0.55rem;
          display: grid;
          gap: 0.2rem;
        }
        .menu-public-card small {
          color: #5d554b;
        }
        .rating-stars {
          display: flex;
          align-items: center;
          gap: 0.2rem;
          flex-wrap: wrap;
        }
        .rating-star {
          min-width: 1.9rem;
          min-height: 1.9rem;
          border: 1px solid #ccbda2;
          border-radius: 0.45rem;
          background: #fff;
          font-size: 1.1rem;
          line-height: 1;
          cursor: pointer;
          transition: background 0.12s, border-color 0.12s, color 0.12s, transform 0.1s;
        }
        .rating-star:hover:not(:disabled) {
          color: #b8860b;
          border-color: #b8860b;
          background: #fff8ec;
          transform: scale(1.15);
        }
        .rating-star:active:not(:disabled) {
          transform: scale(0.92);
        }
        .rating-star-active {
          color: #9a6c1f;
          border-color: #9a6c1f;
          background: #fff5e3;
        }
        .rating-star-active:hover:not(:disabled) {
          color: #7a5010;
          border-color: #7a5010;
          background: #ffefd0;
        }
        .dev-links button {
          border: 1px solid #ccbda2;
          background: #fff;
          border-radius: 0.55rem;
          padding: 0.45rem 0.65rem;
          color: #302a22;
          text-decoration: none;
          font: inherit;
          cursor: pointer;
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
