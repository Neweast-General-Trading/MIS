import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
export class ImportBpmGridSheetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  sheetName: string;

  @IsOptional()
  @IsUUID()
  parentProcessId?: string;

  /** Optional explicit process code (e.g. 001-021-000). */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  processCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  processName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  processDescription?: string;

  /** Each object maps template field `key` → cell text (same as Excel columns). */
  @IsArray()
  rows: Record<string, unknown>[];
}

export class ImportBpmGridDto {
  @IsString()
  @MinLength(2)
  @MaxLength(16)
  companyCode: string;

  @IsUUID()
  activityTemplateId: string;

  @IsArray()
  @IsString({ each: true })
  processOwners: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportBpmGridSheetDto)
  sheets: ImportBpmGridSheetDto[];
}
