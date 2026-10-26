import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlModule } from './access-control/access-control.module';
import { PermissionEntity } from './access-control/entities/permission.entity';
import { RoleEntity } from './access-control/entities/role.entity';
import { AccessUserEntity } from './access-control/entities/user.entity';
import { ApplicationsModule } from './applications/applications.module';
import { ActivityPrintModule } from './print/activity-print.module';
import { ApplicationEntity } from './applications/entities/application.entity';
import { ActivityTemplatesModule } from './activity-templates/activity-templates.module';
import { ActivityTemplateEntity } from './activity-templates/entities/activity-template.entity';
import { ActivityCommentAttachmentEntity } from './activities/entities/activity-comment-attachment.entity';
import { ActivityCommentEntity } from './activities/entities/activity-comment.entity';
import { ActivityEntity } from './activities/entities/activity.entity';
import { ActivityRelationEntity } from './activities/entities/activity-relation.entity';
import { ActivityPolicyLinkEntity } from './activities/entities/activity-policy-link.entity';
import { Department } from './departments/entities/department.entity';
import { OrgDepartmentEntity } from './departments/entities/org-department.entity';
import { DepartmentsModule } from './departments/departments.module';
import { ProcessDocumentationFileEntity } from './process-documentation/entities/process-documentation-file.entity';
import { ProcessDocumentationModule } from './process-documentation/process-documentation.module';
import { AiBpmModule } from './ai-bpm/ai-bpm.module';
import { BpmAssistantModule } from './bpm-assistant/bpm-assistant.module';
import { BpmInquiryEntity } from './bpm-assistant/entities/bpm-inquiry.entity';
import { CompaniesModule } from './companies/companies.module';
import { CompanyEntity } from './companies/entities/company.entity';
import { ProcessEntity } from './processes/entities/process.entity';
import { AuthModule } from './auth/auth.module';
import { UserLogInterceptor } from './common/interceptors/user-log.interceptor';
import { ReadCacheInterceptor } from './common/interceptors/read-cache.interceptor';
import { HealthController } from './health.controller';
import { SystemHealthService } from './system-health/system-health.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      database: process.env.DB_NAME ?? 'bpm',
      entities: [
        Department,
        OrgDepartmentEntity,
        ProcessEntity,
        ActivityEntity,
        ActivityRelationEntity,
        ActivityPolicyLinkEntity,
        ActivityCommentEntity,
        ActivityCommentAttachmentEntity,
        ActivityTemplateEntity,
        PermissionEntity,
        RoleEntity,
        AccessUserEntity,
        ProcessDocumentationFileEntity,
        CompanyEntity,
        BpmInquiryEntity,
        ApplicationEntity,
      ],
      synchronize: true,
    }),
    AuthModule,
    AccessControlModule,
    ActivityTemplatesModule,
    ApplicationsModule,
    ActivityPrintModule,
    CompaniesModule,
    DepartmentsModule,
    ProcessDocumentationModule,
    AiBpmModule,
    BpmAssistantModule,
  ],
  controllers: [HealthController],
  providers: [UserLogInterceptor, ReadCacheInterceptor, SystemHealthService],
})
export class AppModule {}
