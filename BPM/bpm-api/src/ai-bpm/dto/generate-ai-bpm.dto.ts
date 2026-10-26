import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { AI_TEMPLATE_IDS } from '../ai-prompt-templates';

export class GenerateAiBpmDto {
  @IsUUID()
  departmentId: string;

  /** When omitted, all accessible processes under the process function are included. */
  @IsOptional()
  @IsUUID()
  processId?: string;

  /** Optional free-text instructions — primary driver when provided. */
  @IsOptional()
  @IsString()
  @MaxLength(12000)
  userPrompt?: string;

  /** Optional deliverable presets — not required when userPrompt is provided. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(AI_TEMPLATE_IDS, { each: true })
  templateIds?: string[];
}
