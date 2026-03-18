import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';

export class UpsertDeliveryAssignmentDto {
  @IsUUID('4')
  deliveryUserId!: string;

  @IsUUID('4')
  schoolId!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Transform(({ value }) => String(value || '').trim().toUpperCase())
  @IsIn(['BREAKFAST', 'SNACK', 'LUNCH'])
  session!: 'BREAKFAST' | 'SNACK' | 'LUNCH';
}
