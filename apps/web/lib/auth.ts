export const AUTH_COOKIE = 'blossom_access_token';
export const ROLE_COOKIE = 'blossom_role';
export const ACCESS_KEY = 'blossom_access_token';
export const ROLE_KEY = 'blossom_role';

export type Role = 'PARENT' | 'YOUNGSTER' | 'ADMIN' | 'KITCHEN' | 'DELIVERY';

export const ROLE_OPTIONS: Role[] = ['PARENT', 'YOUNGSTER', 'ADMIN', 'KITCHEN', 'DELIVERY'];
const API_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS || 20000);
let pendingRequests = 0;
let _refreshPromise: Promise<string | null> | null = null;

export function getApiBase() {
  return process.env.NEXT_PUBLIC_API_BASE ?? '/api/v1';
}

export function getAppBase() {
  return getApiBase().replace('/api/v1', '');
}

export function roleHomePath(role?: string | null) {
  switch (String(role || '').trim().toUpperCase()) {
    case 'PARENT':
      return '/family';
    case 'YOUNGSTER':
      return '/student';
    case 'DELIVERY':
      return '/delivery';
    case 'KITCHEN':
      return '/kitchen';
    case 'ADMIN':
      return '/admin';
    default:
      return '/login';
  }
}

function getCookiePath() {
  return getAppBase() || '/';
}

function expireCookie(name: string, path: string) {
  document.cookie = `${name}=; path=${path}; max-age=0; SameSite=Lax`;
  document.cookie = `${name}=; path=${path}; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

function clearLegacyAuthCookies() {
  const paths = new Set(['/', getCookiePath()]);
  for (const path of paths) {
    expireCookie(AUTH_COOKIE, path);
    expireCookie(ROLE_COOKIE, path);
  }
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=${getCookiePath()}; max-age=86400; SameSite=Lax`;
}

export function setAuthState(accessToken: string, role: Role) {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(ROLE_KEY, role);
  clearLegacyAuthCookies();
  setCookie(AUTH_COOKIE, accessToken);
  setCookie(ROLE_COOKIE, role);
}

export function clearAuthState() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(ROLE_KEY);
  clearLegacyAuthCookies();
}

function publishNetworkState() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const isBusy = pendingRequests > 0;
  document.body?.setAttribute('data-network-busy', isBusy ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent('blossom:network-busy', { detail: { pendingRequests, busy: isBusy } }));
}

function beginNetworkRequest() {
  pendingRequests += 1;
  publishNetworkState();
}

function endNetworkRequest() {
  pendingRequests = Math.max(0, pendingRequests - 1);
  publishNetworkState();
}

export async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  beginNetworkRequest();
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timeout. Please retry.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
    endNetworkRequest();
  }
}

export async function refreshAccessToken() {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    const res = await fetchWithTimeout(`${getApiBase()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;
    const data = await res.json();
    localStorage.setItem(ACCESS_KEY, data.accessToken);
    clearLegacyAuthCookies();
    setCookie(AUTH_COOKIE, data.accessToken);
    return data.accessToken as string;
  })().finally(() => {
    _refreshPromise = null;
  });
  return _refreshPromise;
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
  const base = getAppBase();
  const paths: Record<string, string> = {
    ADMIN:     `${base}/admin/login`,
    KITCHEN:   `${base}/kitchen/login`,
    DELIVERY:  `${base}/delivery/login`,
    PARENT:    `${base}/family/login`,
    YOUNGSTER: `${base}/student/login`,
  };
  window.location.href = paths[role ?? ''] ?? `${base}/login`;
}

export async function clearBrowserSession() {
  await fetchWithTimeout(`${getApiBase()}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({}),
  }).catch(() => undefined);
  clearAuthState();
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
export async function apiFetch(path: string, init?: RequestInit, options?: { skipAutoReload?: boolean }): Promise<unknown> {
  const res = await apiFetchResponse(path, init);
  const method = String(init?.method || 'GET').toUpperCase();
  const shouldAutoRefresh =
    !options?.skipAutoReload &&
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

export async function apiFetchResponse(path: string, init?: RequestInit): Promise<Response> {
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

  let res = await fetchWithTimeout(`${getApiBase()}${path}`, { ...init, headers: buildHeaders(token) });

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      redirectToLogin();
      throw new SessionExpiredError();
    }
    token = refreshed;
    res = await fetchWithTimeout(`${getApiBase()}${path}`, { ...init, headers: buildHeaders(token) });
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string | string[]; error?: { message?: string; details?: string[] } };
    const raw = body.message ?? body.error?.message ?? body.error?.details?.join(', ');
    const msg = Array.isArray(raw) ? raw.join(', ') : (raw ?? 'Request failed');
    throw new Error(msg);
  }
  return res;
}
