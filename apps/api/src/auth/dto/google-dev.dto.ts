import { IsIn, IsString } from 'class-validator';

export class GoogleDevDto {
  @IsString()
  googleEmail!: string;

  @IsIn(['PARENT', 'YOUNGSTER', 'ADMIN', 'KITCHEN', 'DELIVERY'])
  role!: string;
}
