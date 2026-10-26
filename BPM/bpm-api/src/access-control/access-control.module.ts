import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Department } from 'src/departments/entities/department.entity';
import { AccessPermissionGuard } from './access-permission.guard';
import { AccessControlController } from './access-control.controller';
import { AccessControlService } from './access-control.service';
import { PermissionEntity } from './entities/permission.entity';
import { RoleEntity } from './entities/role.entity';
import { AccessUserEntity } from './entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PermissionEntity, RoleEntity, AccessUserEntity, Department])],
  controllers: [AccessControlController],
  providers: [
    AccessControlService,
    {
      provide: APP_GUARD,
      useClass: AccessPermissionGuard,
    },
  ],
  exports: [AccessControlService],
})
export class AccessControlModule {}
