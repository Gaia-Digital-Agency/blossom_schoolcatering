import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSchoolDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}
