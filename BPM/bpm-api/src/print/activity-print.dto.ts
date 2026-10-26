import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class PrintMetaDto {
  @IsString()
  @MaxLength(80)
  label: string;

  @IsString()
  @MaxLength(400)
  value: string;
}

export class ActivityPrintDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  subtitle?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrintMetaDto)
  meta?: PrintMetaDto[];

  /** Cloned DOM of the details dialog (sanitised again on the server). */
  @IsString()
  @MaxLength(4_000_000)
  bodyHtml: string;

  /** The app's compiled CSS (emotion + global). */
  @IsString()
  @MaxLength(8_000_000)
  css: string;

  @IsOptional()
  @IsObject()
  htmlAttrs?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  fontFamily?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  watermark?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  filename?: string;
}
