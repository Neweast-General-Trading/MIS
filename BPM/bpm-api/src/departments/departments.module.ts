import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlModule } from 'src/access-control/access-control.module';
import { CompaniesModule } from 'src/companies/companies.module';
import { HanaModule } from 'src/hana/hana.module';
import { ActivityTemplatesModule } from 'src/activity-templates/activity-templates.module';
import { AccessUserEntity } from 'src/access-control/entities/user.entity';
import { ActivityTemplateEntity } from 'src/activity-templates/entities/activity-template.entity';
import { ActivityCommentAttachmentEntity } from 'src/activities/entities/activity-comment-attachment.entity';
import { ActivityCommentEntity } from 'src/activities/entities/activity-comment.entity';
import { ActivityEntity } from 'src/activities/entities/activity.entity';
import { ActivityRelationEntity } from 'src/activities/entities/activity-relation.entity';
import { ActivityPolicyLinkEntity } from 'src/activities/entities/activity-policy-link.entity';
import { Department } from './entities/department.entity';
import { OrgDepartmentEntity } from './entities/org-department.entity';
import { ApplicationEntity } from 'src/applications/entities/application.entity';
import { ProcessEntity } from 'src/processes/entities/process.entity';
import { DepartmentsService } from './departments.service';
import { OrgDepartmentsService } from './org-departments.service';
import { DepartmentsController } from './departments.controller';
import { MaintenanceController } from './maintenance.controller';
import { UserLogReaderService } from 'src/maintenance/user-log-reader.service';

@Module({
  imports: [
    AccessControlModule,
    CompaniesModule,
    HanaModule,
    ActivityTemplatesModule,
    TypeOrmModule.forFeature([
      Department,
      OrgDepartmentEntity,
      ProcessEntity,
      ActivityEntity,
      ActivityRelationEntity,
      ActivityPolicyLinkEntity,
      ActivityCommentEntity,
      ActivityCommentAttachmentEntity,
      ActivityTemplateEntity,
      AccessUserEntity,
      ApplicationEntity,
    ]),
  ],
  controllers: [DepartmentsController, MaintenanceController],
  providers: [DepartmentsService, OrgDepartmentsService, UserLogReaderService],
  exports: [DepartmentsService, OrgDepartmentsService],
})
export class DepartmentsModule {}
