import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(16)
  @Matches(/^[A-Za-z][A-Za-z0-9_-]*$/, {
    message: 'Code must start with a letter and use letters, numbers, underscore, or hyphen only.',
  })
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  oracleLegalEntityId?: string;
}
