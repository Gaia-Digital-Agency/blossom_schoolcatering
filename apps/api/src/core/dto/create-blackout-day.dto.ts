import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreateBlackoutDayDto {
  @Transform(({ obj, value }) => value ?? obj.blackout_date)
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  blackoutDate!: string;

  @IsIn(['ORDER_BLOCK', 'SERVICE_BLOCK', 'BOTH'])
  type!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    const trimmed = String(value).trim().toUpperCase();
    return trimmed || undefined;
  })
  @IsIn(['BREAKFAST', 'SNACK', 'LUNCH'])
  session?: 'BREAKFAST' | 'SNACK' | 'LUNCH';
}
