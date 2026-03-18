'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../lib/auth';
import { getSessionLabel } from '../../../lib/session-theme';
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
    days: Array<{ service_date: string; session: string; calories_display: string; tba_items: number }>;
  };
  badge: {
    level: 'NONE' | 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
    maxConsecutiveOrderDays: number;
    maxConsecutiveOrderWeeks?: number;
    currentMonthOrders: number;
  };
  birthdayHighlight: { date_of_birth: string; days_until: number };
};

function getBadgeDisplay(level: StudentInsights['badge']['level']) {
  switch (level) {
    case 'BRONZE':
      return { icon: '🏆', tone: '#b7791f', label: 'Bronze Trophy' };
    case 'SILVER':
      return { icon: '🏆', tone: '#718096', label: 'Silver Trophy' };
    case 'GOLD':
      return { icon: '🏆', tone: '#d69e2e', label: 'Gold Trophy' };
    case 'PLATINUM':
      return { icon: '🏆', tone: '#4a5568', label: 'Platinum Trophy' };
    default:
      return { icon: '✨', tone: '#dd6b20', label: 'Multi Star' };
  }
}

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
  const badgeDisplay = useMemo(
    () => getBadgeDisplay(insights?.badge.level ?? 'NONE'),
    [insights?.badge.level],
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
            Review your order calendar, weekly nutrition rows, and Clean Plate Club badge progress. Dates with orders are highlighted by session.
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
              <div className="student-overview-insights">
                <div className="student-overview-badge-card">
                  <div
                    className="student-overview-badge-icon"
                    aria-label={badgeDisplay.label}
                    title={badgeDisplay.label}
                    style={{ color: badgeDisplay.tone }}
                  >
                    {badgeDisplay.icon}
                  </div>
                  <strong>Clean Plate Club Badge</strong>
                  <small>{insights.badge.level === 'NONE' ? 'NONE' : insights.badge.level}</small>
                </div>
                <div className="auth-form student-overview-insights-details">
                  <label>
                    <strong>Clean Plate Club Badge: {insights.badge.level}</strong>
                    <small>Max consecutive ordering days: {insights.badge.maxConsecutiveOrderDays}</small>
                    <small>Max consecutive order weeks: {insights.badge.maxConsecutiveOrderWeeks ?? '-'}</small>
                    <small>Current month session orders: {insights.badge.currentMonthOrders}</small>
                    <small>Birthday in {insights.birthdayHighlight.days_until} day(s)</small>
                  </label>
                  <label>
                    <strong>Current Week ({insights.week.start} to {insights.week.end})</strong>
                    <small>Total Calories: {insights.week.totalCalories}</small>
                    <small>Total Orders: {insights.week.totalOrders ?? '-'}</small>
                    <small>Total Dishes: {insights.week.totalDishes ?? '-'}</small>
                  </label>
                </div>
                <div className="auth-form student-overview-week-rows">
                  <strong>Week Session Nutrition Rows</strong>
                  {insights.week.days.length === 0 ? (
                    <small>No session nutrition rows yet this week.</small>
                  ) : insights.week.days.map((day) => (
                    <label key={`${day.service_date}-${day.session}`}>
                      <strong>{day.service_date}</strong>
                      <small>Session: {getSessionLabel(day.session)}</small>
                      <small>Calories: {day.calories_display}</small>
                      <small>TBA dishes: {day.tba_items}</small>
                    </label>
                  ))}
                </div>
              </div>
            ) : <p className="auth-help">Insights loading...</p>}
          </div>
        </section>
      </main>
      <style jsx>{`
        .student-overview-insights {
          display: grid;
          grid-template-columns: minmax(180px, 220px) minmax(0, 1fr);
          gap: 1rem;
          align-items: stretch;
        }

        .student-overview-badge-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          min-height: 100%;
          padding: 1.25rem 1rem;
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 1rem;
          background: linear-gradient(180deg, #fffaf0 0%, #f8fafc 100%);
          text-align: center;
        }

        .student-overview-badge-icon {
          font-size: 4rem;
          line-height: 1;
          filter: drop-shadow(0 6px 12px rgba(15, 23, 42, 0.12));
        }

        .student-overview-insights-details {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }

        .student-overview-week-rows {
          grid-column: 1 / -1;
        }

        @media (max-width: 720px) {
          .student-overview-insights {
            grid-template-columns: 1fr;
          }

          .student-overview-insights-details {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      <LogoutButton returnHref="/student" showRecord={false} showLogout={false} sticky={false} />
    </>
  );
}
