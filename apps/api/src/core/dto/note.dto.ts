import { IsOptional, IsString } from 'class-validator';

export class NoteDto {
  @IsOptional()
  @IsString()
  note?: string;
}
