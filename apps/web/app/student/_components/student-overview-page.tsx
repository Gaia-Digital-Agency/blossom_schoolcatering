'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../lib/auth';
import ModuleOverviewCalendar from '../../_components/module-overview-calendar';
import LogoutButton from '../../_components/logout-button';

type Order = {
  service_date: string;
  status: string;
  session?: string;
};

type StudentProfile = {
  first_name: string;
  last_name: string;
  school_name: string;
  school_grade: string;
};

export default function StudentOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    const load = async () => {
      const [profileData, orderData] = await Promise.all([
        apiFetch('/children/me') as Promise<StudentProfile>,
        apiFetch('/youngster/me/orders/consolidated') as Promise<{ orders: Order[] }>,
      ]);
      setProfile(profileData);
      setOrders(orderData.orders || []);
    };

    load().catch((err) => setError(err instanceof Error ? err.message : 'Failed loading student overview')).finally(() => setLoading(false));
  }, []);

  const highlightedDates = useMemo(
    () => [...new Set(orders.map((order) => order.service_date).filter(Boolean))],
    [orders],
  );
  const dateSessions = useMemo(
    () => orders.reduce<Record<string, string[]>>((acc, order) => {
      const sessions = acc[order.service_date] || [];
      acc[order.service_date] = [...sessions, order.session || 'LUNCH'];
      return acc;
    }, {}),
    [orders],
  );

  if (loading) {
    return <main className="page-auth page-auth-mobile"><section className="auth-panel"><h1>Student Overview</h1><p>Loading...</p></section></main>;
  }

  return (
    <>
      <main className="page-auth page-auth-mobile youngsters-page">
        <section className="auth-panel">
          <h1>Student Overview</h1>
          {error ? <p className="auth-error">{error}</p> : null}
          <div className="module-guide-card">
            Review your order calendar. Days with orders are highlighted.
          </div>
          <div className="module-section">
            {profile ? (
              <p className="auth-help">
                {profile.first_name} {profile.last_name} | {profile.school_name} | {profile.school_grade}
              </p>
            ) : null}
            <ModuleOverviewCalendar
              highlightedDates={highlightedDates}
              emptyLabel="No student orders found yet."
              dateSessions={dateSessions}
            />
          </div>
        </section>
      </main>
      <LogoutButton returnHref="/student" showRecord={false} showLogout={false} sticky={false} />
    </>
  );
}
