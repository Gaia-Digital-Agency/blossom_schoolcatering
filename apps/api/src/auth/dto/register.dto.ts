import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsIn(['PARENT', 'YOUNGSTER', 'ADMIN', 'KITCHEN', 'DELIVERY'])
  @IsNotEmpty()
  role!: string;

  @IsString()
  @MinLength(3)
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsString()
  phoneNumber!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  address?: string;
}
