import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProcessDto {
  @MinLength(2)
  @MaxLength(255)
  processName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(16)
  companyCode: string;

  /** When set, process definition (template, owners, descriptions) is applied immediately after create. */
  @IsOptional()
  @IsString()
  activityTemplateId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  processOwners?: string[];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  processDescription?: string;
}
