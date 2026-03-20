import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf, ValidateNested } from 'class-validator';

export class RegisterFamilyStudentDto {
  @IsString()
  youngsterFirstName!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  youngsterDateOfBirth!: string;

  @IsString()
  @IsUUID('4')
  youngsterSchoolId!: string;

  @IsString()
  youngsterGrade!: string;

  @IsString()
  youngsterPhone!: string;

  @IsOptional()
  @IsString()
  youngsterEmail?: string;

  @IsString()
  @MaxLength(50)
  youngsterAllergies!: string;
}

export class RegisterYoungsterWithParentDto {
  @IsString()
  @IsIn(['YOUNGSTER', 'PARENT', 'TEACHER'])
  registrantType!: 'YOUNGSTER' | 'PARENT' | 'TEACHER';

  @ValidateIf((o: RegisterYoungsterWithParentDto) => o.registrantType === 'TEACHER')
  @IsString()
  @MaxLength(50)
  teacherName?: string;

  @ValidateIf((o: RegisterYoungsterWithParentDto) => o.registrantType === 'TEACHER')
  @IsString()
  teacherPhone?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => RegisterFamilyStudentDto)
  students!: RegisterFamilyStudentDto[];

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

  @IsString()
  password!: string;
}
