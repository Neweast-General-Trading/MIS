import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateActivityDto {
  /**
   * Optional: when the process template doesn't expose an embedded Activity Name field,
   * the server derives it from `details` or falls back to the auto-generated activity code.
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  activityName?: string;

  /** Create as child of this sub-process; code becomes {parentCode}-NNN. */
  @IsOptional()
  @IsUUID()
  parentActivityId?: string;

  @IsOptional()
  details?: Record<string, string | string[]>;

  @IsOptional()
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
