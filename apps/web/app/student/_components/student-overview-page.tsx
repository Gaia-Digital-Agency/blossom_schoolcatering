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

type StudentInsights = {
  week: {
    start: string;
    end: string;
    totalCalories: number;
    totalOrders?: number;
    totalDishes?: number;
    days: Array<{ service_date: string; calories_display: string; tba_items: number }>;
  };
  badge: {
    level: 'NONE' | 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
    maxConsecutiveOrderDays: number;
    maxConsecutiveOrderWeeks?: number;
    currentMonthOrders: number;
  };
  birthdayHighlight: { date_of_birth: string; days_until: number };
};

export default function StudentOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [insights, setInsights] = useState<StudentInsights | null>(null);

  useEffect(() => {
    const load = async () => {
      const [profileData, orderData, insightsData] = await Promise.all([
        apiFetch('/children/me') as Promise<StudentProfile>,
        apiFetch('/youngster/me/orders/consolidated') as Promise<{ orders: Order[] }>,
        apiFetch('/youngster/me/insights') as Promise<StudentInsights>,
      ]);
      setProfile(profileData);
      setOrders(orderData.orders || []);
      setInsights(insightsData);
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
          <div className="module-section">
            <h2>Weekly Nutrition and Badge</h2>
            {insights ? (
              <div className="auth-form">
                <label>
                  <strong>Clean Plate Club Badge: {insights.badge.level}</strong>
                  <small>Max consecutive order days: {insights.badge.maxConsecutiveOrderDays}</small>
                  <small>Max consecutive order weeks: {insights.badge.maxConsecutiveOrderWeeks ?? '-'}</small>
                  <small>Current month orders: {insights.badge.currentMonthOrders}</small>
                  <small>Birthday in {insights.birthdayHighlight.days_until} day(s)</small>
                </label>
                <label>
                  <strong>Current Week ({insights.week.start} to {insights.week.end})</strong>
                  <small>Total Calories: {insights.week.totalCalories}</small>
                  <small>Total Orders: {insights.week.totalOrders ?? '-'}</small>
                  <small>Total Dishes: {insights.week.totalDishes ?? '-'}</small>
                </label>
              </div>
            ) : <p className="auth-help">Insights loading...</p>}
          </div>
        </section>
      </main>
      <LogoutButton returnHref="/student" showRecord={false} showLogout={false} sticky={false} />
    </>
  );
}
