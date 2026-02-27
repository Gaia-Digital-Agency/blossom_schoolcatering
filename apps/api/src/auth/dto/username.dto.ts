import { IsString, MinLength } from 'class-validator';

export class UsernameDto {
  @IsString()
  @MinLength(1)
  base!: string;
}
