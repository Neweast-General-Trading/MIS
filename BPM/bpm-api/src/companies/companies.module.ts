import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccessControlModule } from 'src/access-control/access-control.module';
import { ActivityEntity } from 'src/activities/entities/activity.entity';
import { Department } from 'src/departments/entities/department.entity';
import { HanaModule } from 'src/hana/hana.module';
import { OracleHcmModule } from 'src/oracle/oracle-hcm.module';
import { SqlModule } from 'src/sql/sql.module';
import { ProcessEntity } from 'src/processes/entities/process.entity';
import { AuthModule } from 'src/auth/auth.module';

import { BpmCatalogService } from './bpm-catalog.service';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { MasterDataComparisonService } from './master-data-comparison.service';
import { PolicyCreatorCatalogService } from './policy-creator-catalog.service';
import { PolicyPdfService } from './policy-pdf.service';
import { CompanyEntity } from './entities/company.entity';

@Module({
  imports: [
    AccessControlModule,
    AuthModule,
    HanaModule,
    OracleHcmModule,
    SqlModule,
    TypeOrmModule.forFeature([
      CompanyEntity,
      Department,
      ProcessEntity,
      ActivityEntity,
    ]),
  ],
  controllers: [CompaniesController],
  providers: [
    CompaniesService,
    BpmCatalogService,
    MasterDataComparisonService,
    PolicyCreatorCatalogService,
    PolicyPdfService,
  ],
  exports: [
    CompaniesService,
    BpmCatalogService,
    MasterDataComparisonService,
    PolicyCreatorCatalogService,
  ],
})
export class CompaniesModule {}
