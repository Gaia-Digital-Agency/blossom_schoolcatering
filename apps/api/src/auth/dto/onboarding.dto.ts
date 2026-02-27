import { IsBoolean } from 'class-validator';

export class OnboardingDto {
  @IsBoolean()
  completed!: boolean;
}
