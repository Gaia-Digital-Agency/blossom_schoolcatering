import { Type } from 'class-transformer';
import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { CartItemInput } from '../core.types';

export class ReplaceCartItemsDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemInput)
  items?: CartItemInput[];
}
