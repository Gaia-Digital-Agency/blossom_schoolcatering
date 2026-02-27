import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class RegisterYoungsterDto {
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateOfBirth!: string;

  @IsIn(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'])
  gender!: string;

  @IsUUID('4')
  schoolId!: string;

  @IsString()
  @IsNotEmpty()
  schoolGrade!: string;

  @IsOptional()
  @IsUUID('4')
  parentId?: string;

  @IsOptional()
  @IsString()
  allergies?: string;
}
