import { IsOptional, IsString, Matches } from 'class-validator';

export class RegisterYoungsterWithParentDto {
  @IsString()
  youngsterFirstName!: string;

  @IsString()
  youngsterLastName!: string;

  @IsString()
  youngsterGender!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  youngsterDateOfBirth!: string;

  @IsString()
  youngsterSchoolId!: string;

  @IsString()
  youngsterGrade!: string;

  @IsOptional()
  @IsString()
  youngsterPhone?: string;

  @IsOptional()
  @IsString()
  youngsterEmail?: string;

  @IsString()
  youngsterAllergies!: string;

  @IsString()
  parentFirstName!: string;

  @IsString()
  parentLastName!: string;

  @IsString()
  parentMobileNumber!: string;

  @IsString()
  parentEmail!: string;

  @IsString()
  parentAllergies!: string;

  @IsOptional()
  @IsString()
  parentAddress?: string;
}
