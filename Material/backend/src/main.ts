import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { assertAuthSecretIsSafe, isProduction } from './auth/auth.config';
import { DomainExceptionFilter } from './common/domain-exception.filter';
import { ValidationError } from './common/errors';
import { toFieldErrors } from './common/validation';
import { createMetricsMiddleware } from './metrics/metrics.middleware';
import { MetricsService } from './metrics/metrics.service';
import { uploadRoot } from './uploads/upload.config';

/** Comma-separated list in CORS_ORIGINS, or everything when unset. */
function corsOrigins(): string[] | boolean {
  const configured = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured.length) return configured;

  if (isProduction()) {
    new Logger('Bootstrap').warn(
      'CORS_ORIGINS is unset — every origin can call this API.',
    );
  }
  return true;
}

async function bootstrap() {
  // fails the boot in production rather than signing tokens with a known key
  assertAuthSecretIsSafe();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors({ origin: corsOrigins(), credentials: true });

  // a JSON body has no business being megabytes; the file limit is enforced
  // separately by multer in upload.config
  app.useBodyParser('json', { limit: process.env.BODY_LIMIT ?? '1mb' });
  app.useBodyParser('urlencoded', {
    limit: process.env.BODY_LIMIT ?? '1mb',
    extended: true,
  });

  // lets OnModuleDestroy run, so the pg pool drains instead of being killed
  // mid-query on a deploy
  app.enableShutdownHooks();

  // uploaded profile images and signatures, served straight from disk. Sits
  // outside the /api prefix, which is what fileUrl() in upload.config builds.
  mkdirSync(uploadRoot(), { recursive: true });
  app.useStaticAssets(uploadRoot(), {
    prefix: '/uploads',
    // they are content-addressed by a random name, so they never change
    maxAge: '7d',
  });

  // registered before listen() so it wraps every request, routed or not
  app.use(createMetricsMiddleware(app.get(MetricsService)));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      // multipart bodies arrive as strings; the DTO transforms handle the
      // conversions explicitly rather than letting class-transformer guess
      transformOptions: { enableImplicitConversion: false },
      // 400s come back as { errors: { field: message } }, the shape the
      // frontend's validateMaterial / validateCategory already produce
      exceptionFactory: (errors) => new ValidationError(toFieldErrors(errors)),
    }),
  );

  // the single place that turns a failure into a status code, and the only
  // thing standing between a pg error message and the response body
  app.useGlobalFilters(new DomainExceptionFilter());

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  new Logger('Bootstrap').log(
    `Listening on http://localhost:${port}/api (${isProduction() ? 'production' : 'development'})`,
  );
}

void bootstrap();
