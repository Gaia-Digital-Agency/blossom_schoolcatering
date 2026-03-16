'use client';

import { useEffect, useMemo, useState } from 'react';
import ModuleOverviewCalendar from '../../_components/module-overview-calendar';
import LogoutButton from '../../_components/logout-button';
import { apiFetch } from '../../../lib/auth';

type Child = {
  id: string;
  first_name: string;
  last_name: string;
  school_grade: string;
};

type Order = {
  child_id: string;
  child_name: string;
  service_date: string;
  status: string;
  session?: string;
};

export default function FamilyOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    const load = async () => {
      const [childrenData, orderData] = await Promise.all([
        apiFetch('/parent/me/children/pages') as Promise<{ children: Child[] }>,
        apiFetch('/parent/me/orders/consolidated') as Promise<{ orders: Order[] }>,
      ]);
      setChildren(childrenData.children || []);
      setSelectedChildId(childrenData.children?.[0]?.id || '');
      setOrders(orderData.orders || []);
    };

    load().catch((err) => setError(err instanceof Error ? err.message : 'Failed loading family overview')).finally(() => setLoading(false));
  }, []);

  const visibleOrders = useMemo(
    () => (selectedChildId ? orders.filter((order) => order.child_id === selectedChildId) : orders),
    [orders, selectedChildId],
  );
  const highlightedDates = useMemo(
    () => [...new Set(visibleOrders.map((order) => order.service_date).filter(Boolean))],
    [visibleOrders],
  );
  const dateSessions = useMemo(
    () => visibleOrders.reduce<Record<string, string[]>>((acc, order) => {
      const current = acc[order.service_date] || [];
      acc[order.service_date] = [...current, order.session || 'LUNCH'];
      return acc;
    }, {}),
    [visibleOrders],
  );
  const selectedChildName = useMemo(() => {
    const child = children.find((entry) => entry.id === selectedChildId);
    return child ? `${child.first_name} ${child.last_name}`.trim() : '';
  }, [children, selectedChildId]);

  if (loading) {
    return <main className="page-auth page-auth-mobile"><section className="auth-panel"><h1>Family Module</h1><p>Loading...</p></section></main>;
  }

  return (
    <>
      <main className="page-auth page-auth-mobile parents-page">
        <section className="auth-panel">
          <h1>Family Overview</h1>
          <div className="module-guide-card">
            Review your Family Group order calendar. Days with orders are highlighted.
          </div>
          {error ? <p className="auth-error">{error}</p> : null}
          {children.length > 1 ? (
            <div className="module-section">
              <label>Student
                <select value={selectedChildId} onChange={(event) => setSelectedChildId(event.target.value)}>
                  {children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.first_name} {child.last_name} ({child.school_grade})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          <div className="module-section">
            <h2>Overview</h2>
            {selectedChildName ? <p className="auth-help">Showing calendar for {selectedChildName}.</p> : null}
            <ModuleOverviewCalendar
              highlightedDates={highlightedDates}
              emptyLabel="No orders found for the selected Family Group view."
              dateSessions={dateSessions}
            />
          </div>
        </section>
      </main>
      <LogoutButton returnHref="/family" showRecord={false} showLogout={false} sticky={false} />
    </>
  );
}
