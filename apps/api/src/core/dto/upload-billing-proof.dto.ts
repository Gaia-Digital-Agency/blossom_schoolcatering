import { IsString } from 'class-validator';

export class UploadBillingProofDto {
  @IsString()
  proofImageData!: string;
}
