import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveMultiOrderRequestDto {
  @IsIn(['APPROVE_CHANGE', 'APPROVE_DELETE', 'REJECT'])
  decision!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
