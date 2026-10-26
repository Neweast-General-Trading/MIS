import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class PurgeBpmOperationalDataDto {
  /** When true, recreates default New East process-function folders (010–014) after purge. Does not create users. */
  @IsOptional()
  @IsBoolean()
  reseedNewEast?: boolean;

  /** When true, `activity_templates` rows are not truncated (all sub-process / activity templates are kept). */
  @IsOptional()
  @IsBoolean()
  keepActivityTemplates?: boolean;

  @IsIn(['DELETE_ALL'])
  confirm!: 'DELETE_ALL';
}
