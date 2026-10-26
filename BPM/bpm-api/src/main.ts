import './load-env';

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { UserLogInterceptor } from './common/interceptors/user-log.interceptor';
import { ReadCacheInterceptor } from './common/interceptors/read-cache.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  /**
   * One-shot migration: the legacy `uq_departments_code` constraint enforced
   * a global unique code across all companies. We now scope uniqueness per
   * company via `uq_departments_company_code`. Drop the old constraint if it
   * still exists so TypeORM's `synchronize` can install the new composite one.
   */
  try {
    const dataSource = app.get(DataSource);
    await dataSource.query(
      'ALTER TABLE "departments" DROP CONSTRAINT IF EXISTS "uq_departments_code"',
    );
    await dataSource.query(
      'ALTER TABLE "processes" DROP CONSTRAINT IF EXISTS "uq_processes_code"',
    );
    await dataSource.query(
      'ALTER TABLE "processes" DROP CONSTRAINT IF EXISTS "UQ_beaffc4aa5e9dfe234b337d11f1"',
    );
    await dataSource.query(
      'ALTER TABLE "activities" DROP CONSTRAINT IF EXISTS "uq_activity_code"',
    );
    await dataSource
      .query(
        `UPDATE "process_documentation_files" SET "source" = 'automation' WHERE "source" = 'claude'`,
      )
      .catch(() => undefined);
  } catch (err) {
    console.warn('Failed to drop legacy uq_departments_code constraint:', err);
  }

  const httpServer = app.getHttpAdapter().getInstance() as express.Express;
  const bpmFilesDir = join(process.cwd(), 'docx', 'BPM-Files');
  if (existsSync(bpmFilesDir)) {
    httpServer.use(
      '/docx/BPM-Files',
      express.static(bpmFilesDir, { index: false }),
    );
  }
  const configuredOrigins = (process.env.FRONTEND_ORIGIN ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.REQUIRE_JWT_AUTH === 'true';
  const defaultOrigins = isProduction
    ? []
    : [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3039',
        'http://127.0.0.1:3039',
      ];
  const allowedOrigins = new Set([...defaultOrigins, ...configuredOrigins]);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      if (!isProduction) {
        try {
          const url = new URL(origin);
          const port = url.port || (url.protocol === 'https:' ? '443' : '80');
          if (['5173', '3039', '4173'].includes(port)) {
            callback(null, true);
            return;
          }
          if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
            callback(null, true);
            return;
          }
        } catch {
          callback(null, false);
          return;
        }
      }
      try {
        const url = new URL(origin);
        if (
          url.hostname.endsWith('.neweast.cloud') &&
          url.protocol === 'https:'
        ) {
          callback(null, true);
          return;
        }
      } catch {
        callback(null, false);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });

  app.useGlobalInterceptors(
    app.get(UserLogInterceptor),
    app.get(ReadCacheInterceptor),
    new ClassSerializerInterceptor(app.get(Reflector)),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  await app.listen(process.env.PORT ?? 3000, process.env.HOST ?? '127.0.0.1');
}
void bootstrap();
