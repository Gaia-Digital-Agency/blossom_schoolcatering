import { Transform } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class CreateMenuRatingDto {
  @IsUUID('4')
  menuItemId!: string;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(5)
  stars!: number;
}
