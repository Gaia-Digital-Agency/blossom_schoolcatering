import { IsIn, IsOptional } from 'class-validator';

export class VerifyBillingDto {
  @IsOptional()
  @IsIn(['VERIFIED', 'REJECTED'])
  decision?: 'VERIFIED' | 'REJECTED';
}
