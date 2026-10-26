import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class DefineProcessDto {
  @IsString()
  activityTemplateId: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  projectName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  processOwners: string[];

  @IsOptional()
  @IsString()
  processDescription?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  processName?: string;
}
