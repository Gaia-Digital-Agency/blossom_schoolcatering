import { Transform } from 'class-transformer';
import { IsInt, IsUUID, Min } from 'class-validator';

export type SessionType = 'LUNCH' | 'SNACK' | 'BREAKFAST';

export type AccessUser = {
  uid: string;
  role: 'PARENT' | 'YOUNGSTER' | 'ADMIN' | 'KITCHEN' | 'DELIVERY';
  sub: string;
};

export class CartItemInput {
  @IsUUID('4')
  menuItemId!: string;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  quantity!: number;
}
