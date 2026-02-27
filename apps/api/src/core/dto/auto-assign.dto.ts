import { IsOptional, IsString, Matches } from 'class-validator';

export class AutoAssignDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}
