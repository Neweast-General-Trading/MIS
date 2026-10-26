import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  APPLICATION_CATEGORIES,
  APPLICATION_HOSTING,
  APPLICATION_STATUSES,
} from '../application-master.constants';

export class UpsertApplicationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  vendor?: string;

  @IsString()
  @IsIn([...APPLICATION_CATEGORIES])
  category: string;

  @IsString()
  @IsIn([...APPLICATION_HOSTING])
  hosting: string;

  @IsString()
  @IsIn([...APPLICATION_STATUSES])
  status: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  businessOwner?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  itOwner?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  url?: string;

  @IsArray()
  @IsString({ each: true })
  companyCodes: string[];
}
