import { IsBoolean } from 'class-validator';

export class UpdateSessionSettingDto {
  @IsBoolean()
  isActive!: boolean;
}
