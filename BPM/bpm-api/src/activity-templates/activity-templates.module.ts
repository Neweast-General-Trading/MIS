import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessEntity } from 'src/processes/entities/process.entity';
import { ActivityTemplateEntity } from './entities/activity-template.entity';
import { ActivityTemplatesController } from './activity-templates.controller';
import { ActivityTemplatesService } from './activity-templates.service';

@Module({
  imports: [TypeOrmModule.forFeature([ActivityTemplateEntity, ProcessEntity])],
  controllers: [ActivityTemplatesController],
  providers: [ActivityTemplatesService],
  exports: [ActivityTemplatesService],
})
export class ActivityTemplatesModule {}
