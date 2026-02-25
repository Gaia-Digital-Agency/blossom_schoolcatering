export type Role = 'PARENT' | 'YOUNGSTER' | 'ADMIN' | 'KITCHEN' | 'DELIVERY';

export type AuthUser = {
  username: string;
  displayName: string;
  role: Role;
};

export const ROLES: Role[] = ['PARENT', 'YOUNGSTER', 'ADMIN', 'KITCHEN', 'DELIVERY'];
