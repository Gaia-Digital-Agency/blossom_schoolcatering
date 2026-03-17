import type { CSSProperties } from 'react';

export type MealSession = 'LUNCH' | 'SNACK' | 'BREAKFAST';

export const SESSION_THEME: Record<MealSession, { label: string; strong: string; soft: string }> = {
  LUNCH: {
    label: 'Lunch',
    strong: '#D97706',
    soft: '#FEF3C7',
  },
  SNACK: {
    label: 'Snack',
    strong: '#0F766E',
    soft: '#CCFBF1',
  },
  BREAKFAST: {
    label: 'Breakfast',
    strong: '#2563EB',
    soft: '#DBEAFE',
  },
};

export function isMealSession(value: string): value is MealSession {
  return value === 'LUNCH' || value === 'SNACK' || value === 'BREAKFAST';
}

export function getSessionTheme(session: string) {
  return SESSION_THEME[isMealSession(session) ? session : 'LUNCH'];
}

export function getSessionLabel(session: string) {
  return getSessionTheme(session).label;
}

export function getSessionCardStyle(session: string) {
  const theme = getSessionTheme(session);
  return {
    ['--session-strong' as string]: theme.strong,
    ['--session-soft' as string]: theme.soft,
    border: `1px solid ${theme.strong}`,
    borderColor: theme.strong,
    background: `linear-gradient(180deg, #fff 0%, ${theme.soft} 100%)`,
  } as CSSProperties;
}

export function getSessionBadgeLabel(session: string) {
  return getSessionLabel(session);
}
