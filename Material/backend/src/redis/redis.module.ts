import { Global, Module } from '@nestjs/common';
import { redisProvider, redisSubscriberProvider } from './redis.provider';
import { CacheMetrics } from './cache.metrics';
import { RedisService } from './redis.service';

/** Global, the same way DatabaseModule is — caching is cross-cutting. */
@Global()
@Module({
  providers: [
    redisProvider,
    redisSubscriberProvider,
    RedisService,
    CacheMetrics,
  ],
  exports: [RedisService, CacheMetrics],
})
export class RedisModule {}
