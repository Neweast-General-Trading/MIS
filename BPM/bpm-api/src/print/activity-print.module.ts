import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ActivityTemplateEntity } from 'src/activity-templates/entities/activity-template.entity';
import { AuthModule } from 'src/auth/auth.module';
import { DepartmentsModule } from 'src/departments/departments.module';
import { Department } from 'src/departments/entities/department.entity';

import { ActivityPrintController } from './activity-print.controller';
import { ActivityPrintService } from './activity-print.service';
import { ProcessPrintController } from './process-print.controller';
import { ProcessPrintService } from './process-print.service';

@Module({
  imports: [
    AuthModule,
    DepartmentsModule,
    TypeOrmModule.forFeature([ActivityTemplateEntity, Department]),
  ],
  controllers: [ActivityPrintController, ProcessPrintController],
  providers: [ActivityPrintService, ProcessPrintService],
})
export class ActivityPrintModule {}
