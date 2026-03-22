import { IsString } from 'class-validator';

export class UploadMultiOrderBillingProofDto {
  @IsString()
  proofImageData!: string;
}
