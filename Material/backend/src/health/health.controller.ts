import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/auth.decorators';
import { sql } from 'kysely';
import { DbService } from '../database/db.service';
import { RedisService } from '../redis/redis.service';

/**
 * Two probes, because they answer different questions:
 *
 * - `/api/health/live` — is the process up? Never touches the database, so a
 *   database blip does not make an orchestrator kill and restart a perfectly
 *   healthy app.
 * - `/api/health` — can it actually serve traffic? Pings PostgreSQL, and
 *   answers 503 when it cannot, so a load balancer stops sending requests.
 */
@Public()
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly db: DbService,
    private readonly redis: RedisService,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok', uptimeSeconds: this.uptime() };
  }

  @Get()
  async ready(@Res({ passthrough: true }) response: Response) {
    const startedAt = Date.now();

    // Redis is checked but does not decide readiness: the app serves every
    // request without it, just slower. Only PostgreSQL can make it unready.
    const cache = await this.redisStatus();

    try {
      await sql`select 1`.execute(this.db.db);
      return {
        status: cache.status === 'up' ? 'ok' : 'degraded',
        uptimeSeconds: this.uptime(),
        database: { status: 'up', latencyMs: Date.now() - startedAt },
        cache,
      };
    } catch (err) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        status: 'unavailable',
        uptimeSeconds: this.uptime(),
        database: {
          status: 'down',
          // the message, not the stack — enough to diagnose, nothing more
          error: err instanceof Error ? err.message : 'unknown error',
        },
        cache,
      };
    }
  }

  /** Kept from the old root route so existing checks do not break. */
  @Get('ping')
  @HttpCode(HttpStatus.OK)
  ping() {
    return { status: 'ok' };
  }

  private async redisStatus(): Promise<{
    status: 'up' | 'down' | 'disabled';
    latencyMs?: number;
  }> {
    try {
      const latencyMs = await this.redis.ping();
      return latencyMs === null
        ? { status: 'disabled' }
        : { status: 'up', latencyMs };
    } catch {
      return { status: 'down' };
    }
  }

  private uptime(): number {
    return Math.round((Date.now() - this.startedAt) / 1000);
  }
}
