'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/auth';
import AdminNav from '../_components/admin-nav';
import AdminReturnButton from '../_components/admin-return-button';

type MenuRatingSummary = {
  menu_item_id: string;
  name: string;
  session: 'LUNCH' | 'SNACK' | 'BREAKFAST';
  service_date: string;
  star_1_votes: number;
  star_2_votes: number;
  star_3_votes: number;
  star_4_votes: number;
  star_5_votes: number;
  total_votes: number;
};

export default function AdminRatingPage() {
  const [ratings, setRatings] = useState<MenuRatingSummary[]>([]);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const out = await apiFetch('/admin/menu-ratings') as { items: MenuRatingSummary[] };
      setRatings(out.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed loading ratings');
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  return (
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <div className="auth-form">
          <h1>Admin Rating</h1>
          <AdminNav />
        </div>
        {error ? <p className="auth-error">{error}</p> : null}
        <div className="auth-form rating-actions">
          <button className="btn btn-outline" type="button" onClick={load}>Refresh</button>
        </div>
        <div className="auth-form rating-list-card">
          {ratings.map((rating) => (
            <article key={rating.menu_item_id} className="rating-item-card">
              <strong>{rating.name}</strong>
              <small>Date / Session: {rating.service_date || '-'} / {rating.session || '-'}</small>
              <small>1 Star &gt; {rating.star_1_votes} Votes</small>
              <small>2 Stars &gt; {rating.star_2_votes} Votes</small>
              <small>3 Stars &gt; {rating.star_3_votes} Votes</small>
              <small>4 Stars &gt; {rating.star_4_votes} Votes</small>
              <small>5 Stars &gt; {rating.star_5_votes} Votes</small>
              <small>Total Votes: {rating.total_votes}</small>
            </article>
          ))}
          {ratings.length === 0 ? <p className="auth-help">No menu ratings found.</p> : null}
        </div>
        <AdminReturnButton />
      </section>
      <style jsx>{`
        .rating-actions {
          margin-bottom: 0.7rem;
        }
        .rating-list-card {
          display: grid;
          gap: 0.7rem;
        }
        .rating-item-card {
          display: grid;
          gap: 0.25rem;
          padding: 0.8rem;
          border: 1px solid #d9ccb4;
          border-radius: 0.8rem;
          background: #fffaf2;
        }
        .rating-item-card small,
        .rating-item-card strong {
          overflow-wrap: anywhere;
          word-break: break-word;
        }
      `}</style>
    </main>
  );
}
