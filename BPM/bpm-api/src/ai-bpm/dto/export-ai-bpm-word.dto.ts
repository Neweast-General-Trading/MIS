import { IsOptional, IsUUID } from 'class-validator';

export class ExportAiBpmWordDto {
  @IsUUID()
  departmentId: string;

  /** When omitted, export covers all accessible processes in the process function. */
  @IsOptional()
  @IsUUID()
  processId?: string;
}
