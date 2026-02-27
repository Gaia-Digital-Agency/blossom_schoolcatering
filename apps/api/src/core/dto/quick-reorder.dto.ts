import { IsString, IsUUID, Matches } from 'class-validator';

export class QuickReorderDto {
  @IsUUID('4')
  sourceOrderId!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  serviceDate!: string;
}
