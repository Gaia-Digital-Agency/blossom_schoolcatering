import { IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { UpdateMultiOrderDto } from './update-multi-order.dto';

export class CreateMultiOrderRequestDto {
  @IsIn(['CHANGE', 'DELETE'])
  requestType!: string;

  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateMultiOrderDto)
  replacementPlan?: UpdateMultiOrderDto;
}
