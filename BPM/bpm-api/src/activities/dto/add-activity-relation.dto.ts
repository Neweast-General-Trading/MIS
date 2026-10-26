import { IsUUID } from 'class-validator';

export class AddActivityRelationDto {
  @IsUUID()
  targetDepartmentId: string;

  @IsUUID()
  targetProcessId: string;

  @IsUUID()
  targetActivityId: string;
}
