import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccessControlModule } from 'src/access-control/access-control.module';
import { ActivityEntity } from 'src/activities/entities/activity.entity';
import { ActivityPolicyLinkEntity } from 'src/activities/entities/activity-policy-link.entity';
import { ActivityRelationEntity } from 'src/activities/entities/activity-relation.entity';
import { ActivityTemplateEntity } from 'src/activity-templates/entities/activity-template.entity';
import { CompaniesModule } from 'src/companies/companies.module';
import { DepartmentsModule } from 'src/departments/departments.module';
import { Department } from 'src/departments/entities/department.entity';
import { ProcessEntity } from 'src/processes/entities/process.entity';

import { ProcessDocumentationModule } from 'src/process-documentation/process-documentation.module';

import { AiBpmController } from './ai-bpm.controller';
import { AiBpmExportController } from './ai-bpm-export.controller';
import { AiBpmPandocService } from './ai-bpm-pandoc.service';
import { AiBpmService } from './ai-bpm.service';

@Module({
  imports: [
    AccessControlModule,
    CompaniesModule,
    DepartmentsModule,
    ProcessDocumentationModule,
    TypeOrmModule.forFeature([
      Department,
      ProcessEntity,
      ActivityEntity,
      ActivityTemplateEntity,
      ActivityRelationEntity,
      ActivityPolicyLinkEntity,
    ]),
  ],
  controllers: [AiBpmController, AiBpmExportController],
  providers: [AiBpmService, AiBpmPandocService],
})
export class AiBpmModule {}
