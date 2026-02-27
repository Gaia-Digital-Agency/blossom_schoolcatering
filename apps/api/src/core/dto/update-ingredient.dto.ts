import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateIngredientDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  allergenFlag?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
