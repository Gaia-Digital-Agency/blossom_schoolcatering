export const AUTH_COOKIE = 'blossom_access_token';
export const ROLE_COOKIE = 'blossom_role';
export const ACCESS_KEY = 'blossom_access_token';
export const ROLE_KEY = 'blossom_role';

export type Role = 'PARENT' | 'YOUNGSTER' | 'ADMIN' | 'KITCHEN' | 'DELIVERY';

export const ROLE_OPTIONS: Role[] = ['PARENT', 'YOUNGSTER', 'ADMIN', 'KITCHEN', 'DELIVERY'];

export function getApiBase() {
  return process.env.NEXT_PUBLIC_API_BASE ?? '/schoolcatering/api/v1';
}

export function setAuthState(accessToken: string, role: Role) {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(ROLE_KEY, role);
  document.cookie = `${AUTH_COOKIE}=${accessToken}; path=/; max-age=86400; SameSite=Lax`;
  document.cookie = `${ROLE_COOKIE}=${role}; path=/; max-age=86400; SameSite=Lax`;
}

export function clearAuthState() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(ROLE_KEY);
  document.cookie = `${AUTH_COOKIE}=; path=/; max-age=0`;
  document.cookie = `${ROLE_COOKIE}=; path=/; max-age=0`;
}

export async function refreshAccessToken() {
  const res = await fetch(`${getApiBase()}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({}),
  });
  if (!res.ok) return null;
  const data = await res.json();
  localStorage.setItem(ACCESS_KEY, data.accessToken);
  document.cookie = `${AUTH_COOKIE}=${data.accessToken}; path=/; max-age=86400; SameSite=Lax`;
  return data.accessToken as string;
}

/** Thrown by apiFetch after a redirect has been triggered due to an expired/missing session. */
export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired. Please log in again.');
    this.name = 'SessionExpiredError';
  }
}

function redirectToLogin(): void {
  const role = localStorage.getItem(ROLE_KEY);
  clearAuthState();
  const base = getApiBase().replace('/api/v1', '');
  const paths: Record<string, string> = {
    ADMIN:     `${base}/admin/login`,
    KITCHEN:   `${base}/kitchen/login`,
    DELIVERY:  `${base}/delivery/login`,
    PARENT:    `${base}/parent/login`,
    YOUNGSTER: `${base}/youngster/login`,
  };
  window.location.href = paths[role ?? ''] ?? `${base}/login`;
}

/**
 * Shared authenticated fetch wrapper used by all protected pages.
 *
 * - Attaches Bearer token from localStorage.
 * - On 401: silently attempts one token refresh via the HttpOnly refresh cookie.
 * - On failed refresh: clears auth state and hard-redirects to the role login page.
 * - On non-OK response: throws Error with the API's message field.
 *
 * Catch SessionExpiredError to suppress error UI when a redirect has fired.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<unknown> {
  let token = localStorage.getItem(ACCESS_KEY);
  if (!token) {
    redirectToLogin();
    throw new SessionExpiredError();
  }

  const buildHeaders = (t: string): HeadersInit => ({
    Authorization: `Bearer ${t}`,
    'Content-Type': 'application/json',
    ...(init?.headers ?? {}),
  });

  let res = await fetch(`${getApiBase()}${path}`, { ...init, headers: buildHeaders(token) });

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      redirectToLogin();
      throw new SessionExpiredError();
    }
    token = refreshed;
    res = await fetch(`${getApiBase()}${path}`, { ...init, headers: buildHeaders(token) });
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string | string[] };
    const msg = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? 'Request failed');
    throw new Error(msg);
  }

  const method = String(init?.method || 'GET').toUpperCase();
  const shouldAutoRefresh =
    typeof window !== 'undefined' &&
    ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);

  if (res.status === 204) {
    if (shouldAutoRefresh) {
      window.setTimeout(() => window.location.reload(), 120);
    }
    return null;
  }
  const data = await res.json();
  if (shouldAutoRefresh) {
    window.setTimeout(() => window.location.reload(), 120);
  }
  return data;
}
