import { IsIn, IsString, IsUUID, Matches } from 'class-validator';

export class CreateCartDto {
  @IsUUID('4')
  childId!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  serviceDate!: string;

  @IsIn(['BREAKFAST', 'LUNCH', 'SNACK'])
  session!: string;
}
