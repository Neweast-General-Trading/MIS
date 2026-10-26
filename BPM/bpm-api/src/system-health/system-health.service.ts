import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { AccessUserEntity } from 'src/access-control/entities/user.entity';
import { RoleEntity } from 'src/access-control/entities/role.entity';
import { ActivityEntity } from 'src/activities/entities/activity.entity';
import { ProcessEntity } from 'src/processes/entities/process.entity';

import { Department } from 'src/departments/entities/department.entity';

/** Shared snapshot for GET /maintenance/system-health (registered on root controller). */
@Injectable()
export class SystemHealthService {
  constructor(private readonly dataSource: DataSource) {}

  async getSnapshot() {
    const mem = process.memoryUsage();
    const heapTotal = mem.heapTotal;
    const heapUsed = mem.heapUsed;
    const heapFree = Math.max(0, heapTotal - heapUsed);

    let dbOk = false;
    let dbLatencyMs: number | null = null;
    let dbError: string | undefined;
    const t0 = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      dbOk = true;
      dbLatencyMs = Date.now() - t0;
    } catch (err) {
      dbError = err instanceof Error ? err.message : String(err);
      dbLatencyMs = Date.now() - t0;
    }

    let departments = 0;
    let processes = 0;
    let activities = 0;
    let accessUsers = 0;
    let roles = 0;

    if (dbOk) {
      try {
        [departments, processes, activities, accessUsers, roles] = await Promise.all([
          this.dataSource.manager.count(Department),
          this.dataSource.manager.count(ProcessEntity),
          this.dataSource.manager.count(ActivityEntity),
          this.dataSource.manager.count(AccessUserEntity),
          this.dataSource.manager.count(RoleEntity),
        ]);
      } catch (err) {
        dbError = dbError ?? (err instanceof Error ? err.message : String(err));
      }
    }

    const memoryPressureRatio = heapTotal > 0 ? heapUsed / heapTotal : 0;
    const databaseScore = dbOk
      ? Math.max(25, Math.min(100, 100 - Math.min(75, (dbLatencyMs ?? 0) / 3)))
      : 0;
    const memoryScore =
      memoryPressureRatio < 0.82
        ? 100
        : Math.max(35, Math.min(100, 100 - (memoryPressureRatio - 0.82) * 350));
    const availabilityScore = dbOk ? 100 : 0;
    const overallScore = Math.round(
      databaseScore * 0.45 + memoryScore * 0.35 + availabilityScore * 0.2,
    );

    return {
      timestamp: new Date().toISOString(),
      api: {
        uptimeSeconds: Math.floor(process.uptime()),
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid,
        memory: {
          heapUsed,
          heapTotal,
          heapFree,
          rss: mem.rss,
          external: mem.external,
        },
      },
      database: {
        ok: dbOk,
        latencyMs: dbLatencyMs,
        ...(dbError ? { error: dbError } : {}),
      },
      scores: {
        overall: overallScore,
        database: Math.round(databaseScore),
        memory: Math.round(memoryScore),
        availability: availabilityScore,
      },
      checks: {
        processUp: true,
        databaseReachable: dbOk,
        memoryPressureOk: memoryPressureRatio < 0.92,
      },
      dataCounts: {
        departments,
        processes,
        activities,
        accessUsers,
        roles,
      },
    };
  }
}
