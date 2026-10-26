import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Inline edit on a single Sub-process for the caller's vendor overlay.
 * The server uses the caller's email as the vendor key; only the matching slot is mutated.
 */
export class UpsertActivityVendorVersionDto {
  /** Friendly label shown next to the green-highlight row in the UI. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  vendorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  activityName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  activityDescription?: string;

  /** Partial: only listed keys are merged into the vendor overlay. Use null to clear a single key. */
  @IsOptional()
  @IsObject()
  details?: Record<string, string | string[] | null>;
}

export class VendorVersionRowDto {
  @IsString()
  activityCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  activityName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  activityDescription?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, string | string[] | null>;
}

/** Bulk upload — replaces the caller's vendor overlay across rows that match by `activityCode`. */
export class BulkVendorVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  vendorName?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VendorVersionRowDto)
  rows: VendorVersionRowDto[];
}
