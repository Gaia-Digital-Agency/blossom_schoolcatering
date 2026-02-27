import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, IsUUID, Matches } from 'class-validator';

export class MealPlanWizardDto {
  @IsUUID('4')
  childId!: string;

  @IsUUID('4')
  sourceOrderId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true })
  dates!: string[];
}
