import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/auth.decorators';
import { ForbiddenError } from '../common/errors';
import { CacheKey } from '../redis/cache.keys';
import { CacheMetrics } from '../redis/cache.metrics';
import { RedisService } from '../redis/redis.service';
import { HerdTestDto } from './herd.dto';
import { HerdService } from './herd.service';

/**
 * Diagnostics, not part of the product API. The herd test creates and deletes
 * real rows, so it asks for the same permissions that implies and refuses to
 * run in production unless explicitly switched on.
 */
@Controller('diagnostics')
export class DiagnosticsController {
  constructor(
    private readonly herd: HerdService,
    private readonly metrics: CacheMetrics,
    private readonly redis: RedisService,
  ) {}

  /** Cache counters on their own, without running anything. */
  @Get('cache')
  @RequirePermissions('material:read')
  cache() {
    return this.metrics.snapshot();
  }

  @Post('cache/reset')
  @RequirePermissions('material:read')
  @HttpCode(HttpStatus.OK)
  resetCache() {
    this.metrics.reset();
    return { message: 'Cache counters reset' };
  }

  /**
   * Drops the cached materials list, so the next burst lands on a cold key.
   * Lets a client-side load test start from a known state without having to
   * create and delete a row just to force an invalidation.
   */
  @Post('cache/invalidate')
  @RequirePermissions('material:read')
  @HttpCode(HttpStatus.OK)
  async invalidate() {
    const cleared = await this.redis.invalidatePattern(
      CacheKey.materialListPattern,
    );
    return { message: 'Material list cache cleared', keysCleared: cleared };
  }

  /**
   * Fires `reads` + `writes` requests simultaneously at the cached materials
   * list and reports how many queries PostgreSQL actually saw.
   */
  @Post('thundering-herd')
  @RequirePermissions('material:create', 'material:delete')
  @HttpCode(HttpStatus.OK)
  thunderingHerd(@Body() dto: HerdTestDto) {
    this.assertEnabled();
    return this.herd.run(dto);
  }

  private assertEnabled(): void {
    const enabled =
      process.env.DIAGNOSTICS_ENABLED === 'true' ||
      (process.env.NODE_ENV ?? 'development') !== 'production';

    if (!enabled) {
      throw new ForbiddenError(
        'Diagnostics are disabled. Set DIAGNOSTICS_ENABLED=true to allow them.',
      );
    }
  }
}
