import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MinLength, ValidateNested } from 'class-validator';
import { CartItemInput } from '../core.types';

export class CreateFavouriteDto {
  @IsOptional()
  @IsUUID('4')
  childId?: string;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsIn(['BREAKFAST', 'LUNCH', 'SNACK'])
  session!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => CartItemInput)
  items!: CartItemInput[];
}
