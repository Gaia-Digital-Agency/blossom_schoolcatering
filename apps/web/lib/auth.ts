export const AUTH_COOKIE = 'blossom_access_token';
export const ROLE_COOKIE = 'blossom_role';
export const REFRESH_KEY = 'blossom_refresh_token';
export const ACCESS_KEY = 'blossom_access_token';
export const ROLE_KEY = 'blossom_role';

export type Role = 'PARENT' | 'YOUNGSTER' | 'ADMIN' | 'KITCHEN' | 'DELIVERY';

export const ROLE_OPTIONS: Role[] = ['PARENT', 'YOUNGSTER', 'ADMIN', 'KITCHEN', 'DELIVERY'];

export function getApiBase() {
  return process.env.NEXT_PUBLIC_API_BASE ?? '/schoolcatering/api/v1';
}

export function setAuthState(accessToken: string, refreshToken: string, role: Role) {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
  localStorage.setItem(ROLE_KEY, role);
  document.cookie = `${AUTH_COOKIE}=${accessToken}; path=/; max-age=86400; SameSite=Lax`;
  document.cookie = `${ROLE_COOKIE}=${role}; path=/; max-age=86400; SameSite=Lax`;
}

export function clearAuthState() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(ROLE_KEY);
  document.cookie = `${AUTH_COOKIE}=; path=/; max-age=0`;
  document.cookie = `${ROLE_COOKIE}=; path=/; max-age=0`;
}

export async function refreshAccessToken() {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return null;
  const res = await fetch(`${getApiBase()}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  localStorage.setItem(ACCESS_KEY, data.accessToken);
  localStorage.setItem(REFRESH_KEY, data.refreshToken);
  document.cookie = `${AUTH_COOKIE}=${data.accessToken}; path=/; max-age=86400; SameSite=Lax`;
  return data.accessToken as string;
}
