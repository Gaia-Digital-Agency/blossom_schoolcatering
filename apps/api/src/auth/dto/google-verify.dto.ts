import { IsIn, IsString } from 'class-validator';

export class GoogleVerifyDto {
  @IsString()
  idToken!: string;

  @IsIn(['PARENT', 'YOUNGSTER', 'ADMIN', 'KITCHEN', 'DELIVERY'])
  role!: string;
}
