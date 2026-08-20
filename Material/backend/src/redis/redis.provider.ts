import { Logger } from '@nestjs/common';
import Redis, { RedisOptions } from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';
/** A connection in subscriber mode cannot run normal commands, so it is separate. */
export const REDIS_SUBSCRIBER = 'REDIS_SUBSCRIBER';

export function redisConfig(): RedisOptions {
  return {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB ?? 0),
    // every key this app writes is prefixed, so it can share a Redis with
    // other apps without collisions
    keyPrefix: process.env.REDIS_PREFIX ?? 'material:',

    // The cache must never become a second thing that can take the API down.
    // A command issued while the socket is down fails fast instead of queueing
    // forever, and RedisService turns that failure into a cache miss.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 3000,
    lazyConnect: true,
    retryStrategy: (attempt) => Math.min(attempt * 200, 5000),
  };
}

export function isRedisEnabled(): boolean {
  return (process.env.REDIS_ENABLED ?? 'true') !== 'false';
}

function connect(name: string, options: RedisOptions): Redis {
  const logger = new Logger(`Redis:${name}`);
  const client = new Redis(options);

  client.on('ready', () => logger.log('connected'));
  client.on('end', () => logger.warn('connection closed'));
  // without a listener ioredis emits an unhandled 'error' and kills the process
  client.on('error', (err: Error) =>
    logger.warn(`unavailable — ${err.message}`),
  );

  // lazyConnect means nothing dials until this; the catch keeps a cold Redis
  // from failing the whole boot
  void client.connect().catch(() => undefined);

  return client;
}

export const redisProvider = {
  provide: REDIS_CLIENT,
  inject: [],
  useFactory: (): Redis => connect('client', redisConfig()),
};

export const redisSubscriberProvider = {
  provide: REDIS_SUBSCRIBER,
  inject: [],
  useFactory: (): Redis => connect('subscriber', redisConfig()),
};
