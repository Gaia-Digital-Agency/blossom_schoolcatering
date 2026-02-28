import { ArrayNotEmpty, IsArray, IsString, IsUUID } from 'class-validator';

export class UploadBillingProofBatchDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  billingIds!: string[];

  @IsString()
  proofImageData!: string;
}
