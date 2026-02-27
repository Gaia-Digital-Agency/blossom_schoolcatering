import { IsIn, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  identifier?: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsIn(['PARENT', 'YOUNGSTER', 'ADMIN', 'KITCHEN', 'DELIVERY'])
  role?: string;
}
