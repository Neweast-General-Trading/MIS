import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccessControlModule } from 'src/access-control/access-control.module';
import { DepartmentsModule } from 'src/departments/departments.module';

import { BpmAssistantController } from './bpm-assistant.controller';
import { BpmAssistantService } from './bpm-assistant.service';
import { BpmInquiryEntity } from './entities/bpm-inquiry.entity';

@Module({
  imports: [
    AccessControlModule,
    DepartmentsModule,
    TypeOrmModule.forFeature([BpmInquiryEntity]),
  ],
  controllers: [BpmAssistantController],
  providers: [BpmAssistantService],
})
export class BpmAssistantModule {}
