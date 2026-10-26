import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccessControlModule } from 'src/access-control/access-control.module';
import { AccessUserEntity } from 'src/access-control/entities/user.entity';
import { Department } from 'src/departments/entities/department.entity';
import { ProcessEntity } from 'src/processes/entities/process.entity';

import { ProcessDocumentationFileEntity } from './entities/process-documentation-file.entity';
import { ProcessDocumentationController } from './process-documentation.controller';
import { ProcessDocumentationService } from './process-documentation.service';

@Module({
  imports: [
    AccessControlModule,
    TypeOrmModule.forFeature([
      ProcessDocumentationFileEntity,
      Department,
      ProcessEntity,
      AccessUserEntity,
    ]),
  ],
  controllers: [ProcessDocumentationController],
  providers: [ProcessDocumentationService],
  exports: [ProcessDocumentationService],
})
export class ProcessDocumentationModule {}
