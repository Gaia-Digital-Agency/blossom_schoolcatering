export type SessionType = 'LUNCH' | 'SNACK' | 'BREAKFAST';

export type AccessUser = {
  uid: string;
  role: 'PARENT' | 'YOUNGSTER' | 'ADMIN' | 'KITCHEN' | 'DELIVERY';
  sub: string;
};

export type CartItemInput = {
  menuItemId: string;
  quantity: number;
};
