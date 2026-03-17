import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  newPassword?: string;
}
