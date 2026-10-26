import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  /** Oracle Fusion legal entity id — pass empty string to unlink. */
  @IsOptional()
  @ValidateIf((_obj, value) => value !== null)
  @IsString()
  @MaxLength(32)
  oracleLegalEntityId?: string | null;

  /** SAP HANA company branch (e.g. BI_NEGT) — pass empty string to unlink. */
  @IsOptional()
  @ValidateIf((_obj, value) => value !== null)
  @IsString()
  @MaxLength(32)
  hanaBranchCode?: string | null;
}
