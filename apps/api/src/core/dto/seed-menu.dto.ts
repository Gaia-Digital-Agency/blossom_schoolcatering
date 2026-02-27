import { IsString, Matches } from 'class-validator';

export class SeedMenuDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  serviceDate!: string;
}
