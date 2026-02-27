import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class UpsertDeliveryAssignmentDto {
  @IsUUID('4')
  deliveryUserId!: string;

  @IsUUID('4')
  schoolId!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
