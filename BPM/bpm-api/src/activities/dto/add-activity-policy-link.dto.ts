import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AddActivityPolicyLinkDto {
  @IsUUID()
  policyCreatorPolicyId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  policyName: string;

  @IsOptional()
  @IsInt()
  policyVersion?: number;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  companyCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  departmentName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(63)
  processCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  processName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(127)
  activityCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  policyCreatorUrl?: string;
}
