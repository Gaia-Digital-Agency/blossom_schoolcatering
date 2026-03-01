import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class VerifyBillingDto {
  @IsOptional()
  @IsIn(['VERIFIED', 'REJECTED'])
  decision?: 'VERIFIED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
