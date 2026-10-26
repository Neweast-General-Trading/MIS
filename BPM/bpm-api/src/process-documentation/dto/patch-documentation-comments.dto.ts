import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PatchDocumentationCommentsDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comments?: string | null;
}
