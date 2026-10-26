import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { PERMISSIONS } from 'src/access-control/access-control.constants';
import { RequirePermission } from 'src/access-control/permissions.decorator';
import { ActivityTemplatesService } from './activity-templates.service';
import { UpsertActivityTemplateDto } from './dto/upsert-activity-template.dto';

@Controller('activity-templates')
export class ActivityTemplatesController {
  constructor(private readonly activityTemplatesService: ActivityTemplatesService) {}

  @Get()
  @RequirePermission(PERMISSIONS.activitiesTemplateMaster)
  findAll() {
    return this.activityTemplatesService.findAll();
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.activitiesTemplateMaster)
  findOne(@Param('id') id: string) {
    return this.activityTemplatesService.findOne(id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.activitiesTemplateMaster)
  create(@Body() dto: UpsertActivityTemplateDto) {
    return this.activityTemplatesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.activitiesTemplateMaster)
  update(@Param('id') id: string, @Body() dto: UpsertActivityTemplateDto) {
    return this.activityTemplatesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.activitiesTemplateMaster)
  remove(@Param('id') id: string) {
    return this.activityTemplatesService.remove(id);
  }
}
