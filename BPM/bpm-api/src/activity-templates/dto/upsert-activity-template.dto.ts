import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { ACTIVITY_TEMPLATE_FIELD_TYPES } from 'src/common/activity-template-field-types';
import type { ActivityTemplateFieldType } from 'src/common/activity-template-field-types';

class ActivityTemplateFieldDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  key: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label: string;

  @IsString()
  @IsIn([...ACTIVITY_TEMPLATE_FIELD_TYPES])
  type: ActivityTemplateFieldType;

  @IsOptional()
  openToDiscussion?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];
}

export class UpsertActivityTemplateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActivityTemplateFieldDto)
  fields: ActivityTemplateFieldDto[];
}
