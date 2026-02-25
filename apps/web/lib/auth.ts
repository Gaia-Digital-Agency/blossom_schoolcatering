export const AUTH_COOKIE = 'blossom_access_token';
export const ROLE_COOKIE = 'blossom_role';

export type Role = 'PARENT' | 'YOUNGSTER' | 'ADMIN' | 'KITCHEN' | 'DELIVERY';

export const ROLE_OPTIONS: Role[] = ['PARENT', 'YOUNGSTER', 'ADMIN', 'KITCHEN', 'DELIVERY'];

export function getApiBase() {
  return process.env.NEXT_PUBLIC_API_BASE ?? '/schoolcatering/api/v1';
}
