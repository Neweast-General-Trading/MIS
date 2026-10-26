import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateActivityDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  activityName?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, string | string[]>;

  @IsOptional()
  @IsObject()
  fieldDiscussion?: Record<string, boolean>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  activityDescription?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  owners?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @IsBoolean()
  discussionEnabled?: boolean;
}
