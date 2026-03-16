'use client';

import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { getSessionBadgeLabel, getSessionTheme } from '../../lib/session-theme';

type Props = {
  highlightedDates: string[];
  emptyLabel: string;
  dateSessions?: Record<string, string[]>;
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function todayMakassarIsoDate() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const yyyy = Number(parts.find((part) => part.type === 'year')?.value || '1970');
  const mm = Number(parts.find((part) => part.type === 'month')?.value || '01');
  return `${yyyy}-${String(mm).padStart(2, '0')}-01`;
}

function shiftMonth(monthIso: string, delta: number) {
  const date = new Date(`${monthIso}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + delta, 1);
  return date.toISOString().slice(0, 10);
}

export default function ModuleOverviewCalendar({
  highlightedDates,
  emptyLabel,
  dateSessions = {},
}: Props) {
  const initialMonth = useMemo(() => {
    const sorted = [...highlightedDates].sort();
    const first = sorted[0] || todayMakassarIsoDate();
    return `${first.slice(0, 7)}-01`;
  }, [highlightedDates]);
  const [visibleMonth, setVisibleMonth] = useState(initialMonth);

  const highlighted = useMemo(() => new Set(highlightedDates), [highlightedDates]);
  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${visibleMonth}T00:00:00Z`)),
    [visibleMonth],
  );

  const cells = useMemo(() => {
    const first = new Date(`${visibleMonth}T00:00:00Z`);
    const start = new Date(first);
    start.setUTCDate(1 - first.getUTCDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + index);
      const iso = date.toISOString().slice(0, 10);
      return {
        iso,
        day: date.getUTCDate(),
        inMonth: date.getUTCMonth() === first.getUTCMonth(),
        highlighted: highlighted.has(iso),
        sessions: [...new Set(dateSessions[iso] || [])],
      };
    });
  }, [dateSessions, highlighted, visibleMonth]);

  return (
    <div className="overview-calendar">
      <div className="overview-calendar-header">
        <button className="btn btn-outline" type="button" onClick={() => setVisibleMonth((prev) => shiftMonth(prev, -1))}>
          Prev
        </button>
        <strong>{monthLabel}</strong>
        <button className="btn btn-outline" type="button" onClick={() => setVisibleMonth((prev) => shiftMonth(prev, 1))}>
          Next
        </button>
      </div>
      <div className="overview-calendar-grid overview-calendar-grid-head">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="overview-calendar-grid">
        {cells.map((cell) => (
          <div
            key={cell.iso}
            className={[
              'overview-calendar-cell',
              cell.inMonth ? '' : 'overview-calendar-cell-muted',
              cell.highlighted ? 'overview-calendar-cell-active' : '',
            ].filter(Boolean).join(' ')}
            title={cell.highlighted ? `${cell.iso}: ${cell.sessions.map((session) => getSessionBadgeLabel(session)).join(', ')}` : cell.iso}
            style={cell.highlighted ? getCalendarStyle(cell.sessions) : undefined}
          >
            <span className="overview-calendar-day">{cell.day}</span>
            {cell.highlighted ? (
              <small className="overview-calendar-sessions">
                {cell.sessions.map((session) => getSessionBadgeLabel(session)).join(', ')}
              </small>
            ) : null}
          </div>
        ))}
      </div>
      {highlightedDates.length === 0 ? <p className="auth-help">{emptyLabel}</p> : null}
      <style jsx>{`
        .overview-calendar {
          display: grid;
          gap: 0.75rem;
        }
        .overview-calendar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.6rem;
        }
        .overview-calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 0.35rem;
        }
        .overview-calendar-grid-head {
          font-size: 0.75rem;
          font-weight: 700;
          color: #6b5a43;
          text-align: center;
        }
        .overview-calendar-cell {
          min-height: 4.1rem;
          border-radius: 0.65rem;
          border: 1px solid #e1d6c4;
          background: #fff;
          color: #5d4e3a;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: space-between;
          padding: 0.4rem;
          gap: 0.25rem;
        }
        .overview-calendar-day {
          width: 100%;
          text-align: right;
          font-size: 0.85rem;
        }
        .overview-calendar-sessions {
          display: block;
          font-size: 0.6rem;
          font-weight: 700;
          line-height: 1.2;
          text-wrap: balance;
        }
        .overview-calendar-cell-muted {
          opacity: 0.45;
        }
        .overview-calendar-cell-active {
          background: var(--calendar-bg, linear-gradient(135deg, #fff1cf, #ffe4ad));
          border-color: var(--calendar-strong, #c6912d);
          color: var(--calendar-text, #6b4200);
          box-shadow: inset 0 0 0 1px rgba(198, 145, 45, 0.18);
        }
      `}</style>
    </div>
  );
}

function getCalendarStyle(sessions: string[]) {
  const uniqueSessions = [...new Set(sessions)].filter(Boolean);
  if (uniqueSessions.length <= 1) {
    const theme = getSessionTheme(uniqueSessions[0] || 'LUNCH');
    return {
      ['--calendar-bg' as string]: `linear-gradient(135deg, ${theme.soft}, ${theme.soft})`,
      ['--calendar-strong' as string]: theme.strong,
      ['--calendar-text' as string]: theme.strong,
    } as CSSProperties;
  }

  const stops = uniqueSessions
    .slice(0, 3)
    .map((session, index, array) => {
      const theme = getSessionTheme(session);
      const start = Math.round((index / array.length) * 100);
      const end = Math.round(((index + 1) / array.length) * 100);
      return `${theme.soft} ${start}% ${end}%`;
    })
    .join(', ');

  return {
    ['--calendar-bg' as string]: `linear-gradient(135deg, ${stops})`,
    ['--calendar-strong' as string]: getSessionTheme(uniqueSessions[0]).strong,
    ['--calendar-text' as string]: '#4a3b26',
  } as CSSProperties;
}
