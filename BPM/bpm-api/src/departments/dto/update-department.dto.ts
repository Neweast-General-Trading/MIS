import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateDepartmentDto {
  @Matches(/^\d{3}-\d{3}-\d{3}$/, { message: 'Code must follow 000-000-000 format.' })
  code: string;

  @MinLength(2)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(16)
  companyCode?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  processFunctionOwners?: string[];

  @IsOptional()
  @IsInt()
  @IsIn([3, 4])
  processCodeLevels?: number;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  hanaBranch?: string;

  @IsOptional()
  @IsInt()
  hanaDeptCode?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  hanaDepartmentName?: string;

  @IsOptional()
  @IsUUID()
  orgDepartmentId?: string;
}
