import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AskBpmAssistantDto {
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  question: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  pagePath?: string;
}
