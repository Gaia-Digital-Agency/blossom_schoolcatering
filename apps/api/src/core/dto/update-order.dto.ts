import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { CartItemInput } from '../core.types';

export class UpdateOrderDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  serviceDate?: string;

  @IsOptional()
  @IsIn(['BREAKFAST', 'LUNCH', 'SNACK'])
  session?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => CartItemInput)
  items!: CartItemInput[];
}
