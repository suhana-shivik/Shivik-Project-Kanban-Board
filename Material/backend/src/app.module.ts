import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { DiagnosticsModule } from './diagnostics/diagnostics.module';
import { HealthController } from './health/health.controller';
import { MaterialModule } from './material/material.module';
import { MetricsModule } from './metrics/metrics.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    // loaded first so DB_* and AUTH_* are on process.env before the pool and
    // the schema bootstrap read them
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'src/.env',
    }),
    DatabaseModule,
    RedisModule,
    MetricsModule,
    AuthModule,
    MaterialModule,
    DiagnosticsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
