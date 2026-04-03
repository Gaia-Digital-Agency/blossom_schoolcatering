import { IsArray, IsIn, IsOptional, IsString, Matches, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class QuickOrderDto {
  @IsString()
  childUsername!: string;

  @IsOptional()
  @IsString()
  senderPhone?: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @IsIn(['BREAKFAST', 'LUNCH', 'SNACK', 'breakfast', 'lunch', 'snack'])
  session!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  dishes!: string[];
}
