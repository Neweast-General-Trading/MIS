import { Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateProcessDto {
  @Matches(/^\d{3}$/, { message: 'Code-2 must be exactly 3 digits.' })
  code2: string;

  @MinLength(2)
  @MaxLength(255)
  processName: string;
}
