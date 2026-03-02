import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordWithTokenDto {
  @IsString()
  @MinLength(40)
  @MaxLength(200)
  token!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(100)
  newPassword!: string;
}
