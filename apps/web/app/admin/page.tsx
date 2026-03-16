'use client';

import { useEffect, useState } from 'react';
import { ACCESS_KEY, apiFetch, fetchWithTimeout, getApiBase } from '../../lib/auth';
import AdminNav from './_components/admin-nav';

/**
 * Type definitions for the dashboard data structures.
 */
type OrdersDishes = {
  totalOrders: number;
  totalDishes: number;
};

type Dashboard = {
  date: string;
  parentsCount: number;
  youngstersCount: number;
  schoolsCount: number;
  deliveryPersonnelCount: number;
  delivery: {
    today: OrdersDishes;
    yesterday: OrdersDishes;
    tomorrow: OrdersDishes;
    pastWeek: OrdersDishes;
    pastMonth: OrdersDishes;
  };
  failedDeliveryByPerson: Array<{ delivery_person_name: string; orders_count: number }>;
  menu: {
    dishesTotalCreated: number;
    dishesTotalActive: number;
  };
  kitchen: {
    nextBlackoutDay: string | null;
    nextBlackoutType: 'ORDER_BLOCK' | 'SERVICE_BLOCK' | 'BOTH' | null;
    nextBlackoutReason: string | null;
    upcomingBlackouts: Array<{
      blackoutDate: string;
      type: 'ORDER_BLOCK' | 'SERVICE_BLOCK' | 'BOTH';
      reason: string | null;
      affectedOrders: number;
    }>;
    serviceBlockedDatesWithOrders: Array<{
      blackoutDate: string;
      type: 'SERVICE_BLOCK' | 'BOTH';
      reason: string | null;
      affectedOrders: number;
    }>;
    yesterday: { ordersNotFulfilled: number; dishesNotFulfilled: number };
    pastWeek: { ordersNotFulfilled: number; dishesNotFulfilled: number };
  };
  billing: {
    yesterday: BillingPeriod;
    pastWeek: BillingPeriod;
    pastMonth: BillingPeriod;
  };
  pendingBillingCount: number;
  birthdayHighlights: Array<{ child_name: string; date_of_birth: string; days_until: number }>;
};

type BillingPeriod = {
  totalNumberBilling: number;
  totalValueBilling: number;
  totalNumberUnpaidNoProof: number;
  totalValueUnpaidNoProof: number;
};

/**
 * Returns the current date in 'YYYY-MM-DD' format for the local timezone.
 * @returns {string} The formatted date string.
 */
function todayIsoLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Formats a number as an Indonesian Rupiah (IDR) currency string.
 * @param {number} value The number to format.
 * @returns {string} The formatted currency string (e.g., "Rp 1.000").
 */
function asCurrency(value: number) {
  return `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
}

/**
 * The main component for the Admin Dashboard page.
 * It fetches and displays a wide range of operational metrics and provides
 * controls for certain administrative tasks like updating the chef's message.
 */
export default function AdminPage() {
  // State for the main dashboard data.
  const [data, setData] = useState<Dashboard | null>(null);
  // State for loading and error handling of the dashboard data.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // State for the chef's personal message editor.
  const [chefMessage, setChefMessage] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState('/schoolcatering/assets/hero-meal.jpg');
  const [heroImageCaption, setHeroImageCaption] = useState('Enchanting Nourished Zesty Original Meals');
  const [heroImageFileName, setHeroImageFileName] = useState('');
  const [heroImagePreviewUrl, setHeroImagePreviewUrl] = useState('');
  const [heroImageFile, setHeroImageFile] = useState<File | null>(null);
  const [chefMessageSaving, setChefMessageSaving] = useState(false);
  const [chefMessageStatus, setChefMessageStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  /**
   * Fetches the main dashboard data from the API.
   */
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiFetch(`/admin/dashboard?date=${todayIsoLocal()}`) as Dashboard;
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed loading dashboard');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Loads the current chef message from the site settings.
   */
  const loadChefMessage = async () => {
    try {
      const result = await apiFetch('/admin/site-settings') as {
        chef_message: string;
        hero_image_url?: string;
        hero_image_caption?: string;
      };
      setChefMessage(result.chef_message ?? '');
      setHeroImageUrl(result.hero_image_url ?? '/schoolcatering/assets/hero-meal.jpg');
      setHeroImageCaption(result.hero_image_caption ?? 'Enchanting Nourished Zesty Original Meals');
      setHeroImageFileName('');
      setHeroImageFile(null);
      setHeroImagePreviewUrl('');
    } catch {
      // non-critical, ignore
    }
  };

  /**
   * Saves the updated hero image, hero text, and chef message to the site settings.
   */
  const saveChefMessage = async () => {
    setChefMessageSaving(true);
    setChefMessageStatus('idle');
    try {
      let nextHeroImageUrl = heroImageUrl;
      if (heroImageFile) {
        const formData = new FormData();
        formData.append('image', heroImageFile, heroImageFile.name || `hero-${Date.now()}.webp`);
        const token = localStorage.getItem(ACCESS_KEY);
        const uploadRes = await fetchWithTimeout(`${getApiBase()}/admin/site-settings/hero-image-upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token ?? ''}` },
          credentials: 'include',
          body: formData,
        });
        if (!uploadRes.ok) {
          const errBody = await uploadRes.json().catch(() => ({})) as { message?: string };
          throw new Error(errBody.message ?? 'Hero image upload failed');
        }
        const uploaded = await uploadRes.json() as { url: string };
        nextHeroImageUrl = uploaded.url;
      }
      await apiFetch('/admin/site-settings', {
        method: 'PATCH',
        body: JSON.stringify({
          chef_message: chefMessage,
          hero_image_url: nextHeroImageUrl,
          hero_image_caption: heroImageCaption,
        }),
      });
      setHeroImageUrl(nextHeroImageUrl);
      setHeroImageFile(null);
      setHeroImageFileName('');
      setHeroImagePreviewUrl('');
      setChefMessageStatus('saved');
      setTimeout(() => setChefMessageStatus('idle'), 3000);
    } catch {
      setChefMessageStatus('error');
    } finally {
      setChefMessageSaving(false);
    }
  };

  /**
   * On component mount, load the initial dashboard data and chef message.
   */
  useEffect(() => {
    load();
    loadChefMessage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (heroImagePreviewUrl) URL.revokeObjectURL(heroImagePreviewUrl);
  }, [heroImagePreviewUrl]);

  return (
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <h1>Admin Dashboard</h1>
        <p className="auth-help">Overview and key operational metrics.</p>
        <AdminNav />

        {/* Card for administrative controls like the chef message and data refresh */}
        <div className="auth-form admin-controls-card">
          <div className="chef-message-controls">
            <label>
              Hero Image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (heroImagePreviewUrl) URL.revokeObjectURL(heroImagePreviewUrl);
                  setHeroImageFile(file);
                  setHeroImageFileName(file?.name || '');
                  setHeroImagePreviewUrl(file ? URL.createObjectURL(file) : '');
                  setChefMessageStatus('idle');
                }}
              />
            </label>
            <div className="admin-hero-preview">
              <img src={heroImagePreviewUrl || heroImageUrl} alt={heroImageCaption || 'Hero image preview'} />
              <div className="admin-hero-meta">
                <strong>Current Hero Image</strong>
                <span>{heroImageFileName || heroImageUrl.split('/').pop() || 'hero-meal.jpg'}</span>
              </div>
            </div>
            <label>
              Hero Image Text
              <input
                maxLength={200}
                value={heroImageCaption}
                onChange={(e) => { setHeroImageCaption(e.target.value); setChefMessageStatus('idle'); }}
                placeholder="Write the text shown on the hero image…"
              />
            </label>
            <label>
              Chef Personal Message
              <textarea
                rows={3}
                maxLength={500}
                value={chefMessage}
                onChange={(e) => { setChefMessage(e.target.value); setChefMessageStatus('idle'); }}
                placeholder="Write the chef's personal message shown on the homepage…"
              />
            </label>
            <div className="chef-message-footer">
              <span className="chef-message-count">{chefMessage.length}/500</span>
              {chefMessageStatus === 'saved' && <span className="chef-message-ok">✓ Saved</span>}
              {chefMessageStatus === 'error' && <span className="chef-message-err">✗ Failed to save</span>}
              <button className="btn btn-primary btn-sm" type="button" onClick={saveChefMessage} disabled={chefMessageSaving}>
                {chefMessageSaving ? 'Saving…' : 'Save Image & Text'}
              </button>
            </div>
          </div>
          <div className="admin-dashboard-controls">
            <button className="btn btn-outline" type="button" onClick={load} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh Dashboard'}
            </button>
          </div>
        </div>

        {error ? <p className="auth-error">{error}</p> : null}

        {/* The main dashboard data display */}
        {data ? (
          <div className="auth-form admin-dashboard-block">
            <div className="kitchen-table-wrap admin-overview-wrap">
              <table className="kitchen-table admin-overview-table">
                <tbody>
                  <tr>
                    <th>Date</th>
                    <td>{data.date}</td>
                  </tr>
                  {/* Parents & Youngsters Section */}
                  <tr className="section-row"><th colSpan={2}>PARENTS</th></tr>
                  <tr><th>Number of Youngsters</th><td>{data.youngstersCount}</td></tr>
                  <tr><th>Number of Parents</th><td>{data.parentsCount}</td></tr>
                  <tr><th>Number Of Schools</th><td>{data.schoolsCount}</td></tr>
                  <tr><th>Birthday Highlight (Today)</th><td>{(data.birthdayHighlights || []).map((b) => b.child_name).join(', ') || '-'}</td></tr>
                  
                  {/* Delivery Section */}
                  <tr className="section-row"><th colSpan={2}>DELIVERY</th></tr>
                  <tr><th>Number of Delivery Person</th><td>{data.deliveryPersonnelCount}</td></tr>
                  <tr>
                    <th>Today</th>
                    <td>
                      <div className="metric-chip-row">
                        <span className="metric-chip">Total Orders: {data.delivery.today.totalOrders}</span>
                        <span className="metric-chip">Total Dishes: {data.delivery.today.totalDishes}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>Yesterday</th>
                    <td>
                      <div className="metric-chip-row">
                        <span className="metric-chip">Total Orders: {data.delivery.yesterday.totalOrders}</span>
                        <span className="metric-chip">Total Dishes: {data.delivery.yesterday.totalDishes}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>Tomorrow</th>
                    <td>
                      <div className="metric-chip-row">
                        <span className="metric-chip">Total Orders: {data.delivery.tomorrow.totalOrders}</span>
                        <span className="metric-chip">Total Dishes: {data.delivery.tomorrow.totalDishes}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>Past Week</th>
                    <td>
                      <div className="metric-chip-row">
                        <span className="metric-chip">Total Orders: {data.delivery.pastWeek.totalOrders}</span>
                        <span className="metric-chip">Total Dishes: {data.delivery.pastWeek.totalDishes}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>Past Month</th>
                    <td>
                      <div className="metric-chip-row">
                        <span className="metric-chip">Total Orders: {data.delivery.pastMonth.totalOrders}</span>
                        <span className="metric-chip">Total Dishes: {data.delivery.pastMonth.totalDishes}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>Yesterday Failed/Unchecked Delivery</th>
                    <td>
                      {(data.failedDeliveryByPerson || []).length === 0
                        ? '-'
                        : data.failedDeliveryByPerson.map((x) => `${x.delivery_person_name} (${x.orders_count})`).join(', ')}
                    </td>
                  </tr>

                  {/* Menu Section */}
                  <tr className="section-row"><th colSpan={2}>MENU</th></tr>
                  <tr><th>Dishes Total Created</th><td>{data.menu.dishesTotalCreated}</td></tr>
                  <tr><th>Dishes Total Active</th><td>{data.menu.dishesTotalActive}</td></tr>
                  
                  {/* Kitchen Section */}
                  <tr className="section-row"><th colSpan={2}>KITCHEN</th></tr>
                  <tr>
                    <th>Next Blackout Day</th>
                    <td>
                      {data.kitchen.nextBlackoutDay
                        ? `${data.kitchen.nextBlackoutDay} (${data.kitchen.nextBlackoutType || '-'})`
                        : '-'}
                    </td>
                  </tr>
                  <tr>
                    <th>Next Blackout Reason</th>
                    <td>{data.kitchen.nextBlackoutReason || '-'}</td>
                  </tr>
                  <tr>
                    <th>Upcoming Blocked Dates (10)</th>
                    <td>
                      {(data.kitchen.upcomingBlackouts || []).length === 0
                        ? '-'
                        : data.kitchen.upcomingBlackouts
                          .map((row) => `${row.blackoutDate} ${row.type} affected=${row.affectedOrders}`)
                          .join(', ')}
                    </td>
                  </tr>
                  <tr>
                    <th>Service-Blocked Dates With Existing Orders</th>
                    <td>
                      {(data.kitchen.serviceBlockedDatesWithOrders || []).length === 0
                        ? 'No conflict'
                        : data.kitchen.serviceBlockedDatesWithOrders
                          .map((row) => `${row.blackoutDate} (${row.type}) orders=${row.affectedOrders}`)
                          .join(', ')}
                    </td>
                  </tr>
                  <tr>
                    <th>Orders Not Fulfilled From Kitchen</th>
                    <td>
                      <div className="metric-chip-row">
                        <span className="metric-chip">Yesterday: {data.kitchen.yesterday.ordersNotFulfilled}</span>
                        <span className="metric-chip">Past Week: {data.kitchen.pastWeek.ordersNotFulfilled}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>Dishes Not Fulfilled From Kitchen</th>
                    <td>
                      <div className="metric-chip-row">
                        <span className="metric-chip">Yesterday: {data.kitchen.yesterday.dishesNotFulfilled}</span>
                        <span className="metric-chip">Past Week: {data.kitchen.pastWeek.dishesNotFulfilled}</span>
                      </div>
                    </td>
                  </tr>

                  {/* Billing Section */}
                  <tr className="section-row"><th colSpan={2}>BILLING</th></tr>
                  <tr>
                    <th>Total Number Billing</th>
                    <td>
                      <div className="metric-chip-row">
                        <span className="metric-chip">Yesterday: {data.billing.yesterday.totalNumberBilling}</span>
                        <span className="metric-chip">Past Week: {data.billing.pastWeek.totalNumberBilling}</span>
                        <span className="metric-chip">Past Month: {data.billing.pastMonth.totalNumberBilling}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>Total Value Billing</th>
                    <td>
                      <div className="metric-chip-row">
                        <span className="metric-chip">Yesterday: {asCurrency(data.billing.yesterday.totalValueBilling)}</span>
                        <span className="metric-chip">Past Week: {asCurrency(data.billing.pastWeek.totalValueBilling)}</span>
                        <span className="metric-chip">Past Month: {asCurrency(data.billing.pastMonth.totalValueBilling)}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>Total Number Unpaid (Proof Not Provided)</th>
                    <td>
                      <div className="metric-chip-row">
                        <span className="metric-chip">Yesterday: {data.billing.yesterday.totalNumberUnpaidNoProof}</span>
                        <span className="metric-chip">Past Week: {data.billing.pastWeek.totalNumberUnpaidNoProof}</span>
                        <span className="metric-chip">Past Month: {data.billing.pastMonth.totalNumberUnpaidNoProof}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>Total Value Unpaid (Proof Not Provided)</th>
                    <td>
                      <div className="metric-chip-row">
                        <span className="metric-chip">Yesterday: {asCurrency(data.billing.yesterday.totalValueUnpaidNoProof)}</span>
                        <span className="metric-chip">Past Week: {asCurrency(data.billing.pastWeek.totalValueUnpaidNoProof)}</span>
                        <span className="metric-chip">Past Month: {asCurrency(data.billing.pastMonth.totalValueUnpaidNoProof)}</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : loading ? (
          <p className="auth-help">Loading dashboard...</p>
        ) : null}
      </section>
      {/* Scoped CSS for styling the admin dashboard */}
      <style jsx>{`
        .chef-message-controls {
          display: grid;
          gap: 0.4rem;
          padding-bottom: 0.8rem;
          border-bottom: 1px solid rgba(15,23,42,0.1);
          margin-bottom: 0.6rem;
        }
        .chef-message-controls label {
          display: grid;
          gap: 0.25rem;
          font-size: 0.85rem;
          font-weight: 600;
        }
        .chef-message-controls input[type='text'],
        .chef-message-controls input[type='file'] {
          min-height: 2.5rem;
          padding: 0.5rem 0.65rem;
          font-size: 0.88rem;
          border: 1px solid rgba(15,23,42,0.18);
          border-radius: 6px;
          background: #fff;
        }
        .chef-message-controls textarea {
          resize: vertical;
          min-height: 5rem;
          padding: 0.5rem 0.65rem;
          font-size: 0.88rem;
          border: 1px solid rgba(15,23,42,0.18);
          border-radius: 6px;
          font-family: inherit;
          line-height: 1.5;
        }
        .admin-hero-preview {
          display: grid;
          gap: 0.55rem;
          padding: 0.75rem;
          border: 1px solid rgba(15,23,42,0.12);
          border-radius: 0.75rem;
          background: rgba(248,250,252,0.9);
        }
        .admin-hero-preview img {
          width: 100%;
          max-height: 220px;
          object-fit: cover;
          border-radius: 0.55rem;
        }
        .admin-hero-meta {
          display: grid;
          gap: 0.15rem;
          font-size: 0.82rem;
          color: #64748b;
        }
        .chef-message-footer {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          flex-wrap: wrap;
        }
        .chef-message-count {
          font-size: 0.75rem;
          color: #64748b;
        }
        .chef-message-ok {
          font-size: 0.78rem;
          color: #16a34a;
          font-weight: 600;
        }
        .chef-message-err {
          font-size: 0.78rem;
          color: #dc2626;
          font-weight: 600;
        }
        .btn-sm {
          padding: 0.3rem 0.8rem;
          font-size: 0.82rem;
          min-height: unset;
        }
        .admin-dashboard-controls {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 0.6rem;
        }
        .admin-controls-card {
          margin-bottom: 0.9rem;
          grid-template-columns: minmax(0, 1fr);
        }
        .admin-dashboard-controls label {
          display: grid;
          gap: 0.25rem;
        }
        .admin-dashboard-controls input {
          min-height: 2.3rem;
        }
        .admin-dashboard-block h2 {
          margin: 0.25rem 0;
        }
        .admin-dashboard-block {
          grid-template-columns: minmax(0, 1fr);
        }
        .admin-overview-wrap {
          margin-top: 0.1rem;
          width: 100%;
        }
        .admin-overview-table th,
        .admin-overview-table td {
          text-align: center;
          font-size: 0.92rem;
        }
        .admin-overview-table .section-row th {
          text-align: center;
          font-size: 0.82rem;
          letter-spacing: 0.06em;
          background: rgba(15, 23, 42, 0.08);
        }
        .metric-chip-row {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.35rem;
        }
        .metric-chip {
          display: inline-block;
          padding: 0.18rem 0.5rem;
          border: 1px solid rgba(15, 23, 42, 0.16);
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.1);
          white-space: nowrap;
        }
        @media (min-width: 860px) {
          .admin-dashboard-controls {
            grid-template-columns: 1fr auto;
            align-items: end;
          }
        }
      `}</style>
    </main>
  );
}
