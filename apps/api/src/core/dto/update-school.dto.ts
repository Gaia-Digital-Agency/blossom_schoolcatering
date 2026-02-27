import { IsBoolean } from 'class-validator';

export class UpdateSchoolDto {
  @IsBoolean()
  isActive!: boolean;
}
