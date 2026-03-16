import { IsIn, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

export class RegisterYoungsterWithParentDto {
  @IsString()
  @IsIn(['YOUNGSTER', 'PARENT', 'TEACHER'])
  registrantType!: 'YOUNGSTER' | 'PARENT' | 'TEACHER';

  @ValidateIf((o: RegisterYoungsterWithParentDto) => o.registrantType === 'TEACHER')
  @IsString()
  @MaxLength(50)
  teacherName?: string;

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

  @ValidateIf((o: RegisterYoungsterWithParentDto) => o.registrantType === 'YOUNGSTER' || o.registrantType === 'TEACHER')
  @IsString()
  youngsterPhone?: string;

  @IsOptional()
  @IsString()
  youngsterEmail?: string;

  @IsString()
  @MaxLength(50)
  youngsterAllergies!: string;

  @IsString()
  parentFirstName!: string;

  @IsString()
  parentLastName!: string;

  @IsString()
  parentMobileNumber!: string;

  @IsString()
  parentEmail!: string;

  @IsOptional()
  @IsString()
  parentAddress?: string;
}
