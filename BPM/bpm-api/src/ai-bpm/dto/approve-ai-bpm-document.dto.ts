import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ApproveAiBpmDocumentDto {
  @IsUUID()
  departmentId: string;

  @IsOptional()
  @IsUUID()
  processId?: string;

  @IsString()
  docxBase64: string;

  @IsString()
  @MaxLength(255)
  docxFilename: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comments?: string;
}
