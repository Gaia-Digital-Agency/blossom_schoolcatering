export type Role = 'PARENT' | 'YOUNGSTER' | 'ADMIN' | 'KITCHEN' | 'DELIVERY';

export type AuthUser = {
  username: string;
  displayName: string;
  role: Role;
  phoneNumber?: string | null;
  email?: string | null;
};

export const ROLES: Role[] = ['PARENT', 'YOUNGSTER', 'ADMIN', 'KITCHEN', 'DELIVERY'];
