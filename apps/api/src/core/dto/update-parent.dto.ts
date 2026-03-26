import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateParentDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  parent2FirstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  parent2Phone?: string;

  @IsOptional()
  @IsEmail()
  parent2Email?: string;
}
