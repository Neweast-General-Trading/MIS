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

export class CreateDepartmentDto {
  @Matches(/^\d{3}-\d{3}-\d{3}$/, { message: 'Code must follow 000-000-000 format.' })
  code: string;

  @MinLength(2)
  @MaxLength(255)
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(16)
  companyCode: string;

  @IsString()
  @MinLength(2)
  @MaxLength(32)
  hanaBranch: string;

  @IsInt()
  hanaDeptCode: number;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  hanaDepartmentName: string;

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
  @IsUUID()
  orgDepartmentId?: string;
}
