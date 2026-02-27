import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class UpdateYoungsterDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  schoolGrade?: string;

  @IsOptional()
  @IsUUID('4')
  schoolId?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'])
  gender?: string;

  @IsOptional()
  @IsUUID('4')
  parentId?: string;

  @IsOptional()
  @IsString()
  allergies?: string;
}
