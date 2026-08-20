import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis, { ChainableCommander } from 'ioredis';
import { CacheChannel } from './cache.keys';
import { CacheMetrics } from './cache.metrics';
import {
  isRedisEnabled,
  REDIS_CLIENT,
  REDIS_SUBSCRIBER,
} from './redis.provider';

/**
 * Everything the app does with Redis goes through here.
 *
 * The rule this file enforces: **a cache failure is never a request failure.**
 * Every read returns null and every write returns false when Redis is down, so
 * callers fall through to PostgreSQL. Losing the cache costs latency, not
 * availability.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Redis');
  private readonly listeners = new Map<
    string,
    Set<(payload: string) => void>
  >();

  /**
   * Loads already running, keyed by cache key. This is what turns a herd of
   * simultaneous misses into a single database query — see `remember`.
   */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  /**
   * Bumped every time a key is invalidated. A load captures the number before
   * it starts and re-checks it before writing the result back — see
   * `remember`. Without this, a read that began before a write would happily
   * cache its pre-write rows *after* the invalidation had already run, and
   * undo it.
   */
  private readonly generations = new Map<string, number>();

  /**
   * Same idea for pattern invalidation, which cannot name the keys it will
   * clear — a SCAN finds nothing when the cache is still cold, so there is no
   * per-key generation to bump. Deliberately coarse: an unrelated in-flight
   * load may skip its cache write, which costs one future miss and is always
   * safe.
   */
  private epoch = 0;

  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
    readonly metrics: CacheMetrics,
  ) {}

  /** Off only so the thundering-herd demo can show the before picture. */
  private get singleFlightEnabled(): boolean {
    return (process.env.CACHE_SINGLEFLIGHT ?? 'true') !== 'false';
  }

  async onModuleInit(): Promise<void> {
    if (!isRedisEnabled()) {
      this.logger.warn('REDIS_ENABLED=false — every read is a miss');
      return;
    }

    this.subscriber.on('message', (channel: string, payload: string) => {
      // another instance invalidated something: cancel any local load that is
      // about to write a now-stale result back
      try {
        for (const key of JSON.parse(payload) as string[]) {
          this.bumpGeneration(key);
        }
      } catch {
        // a malformed message still should not break delivery below
      }

      for (const listener of this.listeners.get(channel) ?? []) {
        listener(payload);
      }
    });

    // keyPrefix does not apply to pub/sub, so the channel is namespaced here
    await this.subscriber
      .subscribe(this.channel(CacheChannel.invalidate))
      .catch(() => undefined);
  }

  /** True only when a command can actually be sent right now. */
  get isAvailable(): boolean {
    return isRedisEnabled() && this.client.status === 'ready';
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isAvailable) return null;

    try {
      const raw = await this.client.get(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch (err) {
      this.miss('get', key, err);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    if (!this.isAvailable) return false;

    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      return true;
    } catch (err) {
      this.miss('set', key, err);
      return false;
    }
  }

  /**
   * Read-through with **single-flight**.
   *
   * The plain version of this — check, then load, then set — has a hole: when
   * a hot key expires or is invalidated, every request that arrives before the
   * first one finishes also sees a miss, and they *all* run the loader. 100
   * concurrent readers become 100 identical database queries. That is the
   * thundering herd, and it bites hardest exactly when traffic is highest.
   *
   * The fix is to let the first miss run the loader and make everyone else
   * wait on that same promise. One query, one cache write, N readers served.
   *
   * Note this coalesces **per process**. Across several instances each one
   * still runs its own load, so N instances means N queries rather than N×M —
   * a big win, not a total one. A distributed lock would close that gap at the
   * cost of a round trip on every miss.
   */
  async remember<T>(
    key: string,
    ttlSeconds: number,
    load: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      this.metrics.hit(key);
      return cached;
    }

    if (this.singleFlightEnabled) {
      const running = this.inFlight.get(key) as Promise<T> | undefined;
      if (running) {
        // somebody is already fetching this exact key — wait for them rather
        // than starting an identical query
        this.metrics.coalesced(key);
        return running;
      }
    }

    this.metrics.miss(key);

    // snapshot taken before the load starts, compared after it finishes
    const generation = this.generations.get(key) ?? 0;
    const epoch = this.epoch;

    const startedAt = Date.now();
    const promise = load()
      .then(async (fresh) => {
        this.metrics.load(key, Date.now() - startedAt);

        // a write landed while this query was running, so what it returned is
        // already out of date — hand it to the callers that are waiting, but
        // do not put it in the cache where the *next* caller would get it too
        const invalidatedMidFlight =
          (this.generations.get(key) ?? 0) !== generation ||
          this.epoch !== epoch;

        if (invalidatedMidFlight) this.metrics.discarded(key);
        else await this.set(key, fresh, ttlSeconds);

        return fresh;
      })
      .finally(() => this.inFlight.delete(key));

    if (this.singleFlightEnabled) this.inFlight.set(key, promise);
    return promise;
  }

  /**
   * Drops every key matching a glob. Used where one write invalidates a family
   * of keys — a material edit has to clear every cached list variant, and the
   * query string is part of those keys.
   *
   * SCAN, not KEYS: KEYS blocks the whole server while it walks the keyspace.
   */
  async invalidatePattern(pattern: string): Promise<number> {
    if (!this.isAvailable) return 0;

    const prefix = process.env.REDIS_PREFIX ?? 'material:';
    const found: string[] = [];

    try {
      let cursor = '0';
      do {
        const [next, batch] = await this.client.scan(
          cursor,
          'MATCH',
          `${prefix}${pattern}`,
          'COUNT',
          200,
        );
        cursor = next;
        // scan returns fully-qualified keys, but del goes through keyPrefix
        found.push(...batch.map((key) => key.slice(prefix.length)));
      } while (cursor !== '0');

      // bump first: when the cache is cold the SCAN returns nothing, and that
      // is exactly the case where an in-flight load is about to write stale
      // rows back
      this.epoch += 1;

      if (found.length) await this.invalidate(...found);
      return found.length;
    } catch (err) {
      this.miss('invalidatePattern', pattern, err);
      return 0;
    }
  }

  /**
   * Drops keys and tells every other instance to do the same.
   *
   * Call this **after** the PostgreSQL transaction commits, never inside it —
   * see the note on `RedisService` usage in the services. Invalidating early
   * would let a concurrent read repopulate the cache from a row that is about
   * to be rolled back.
   */
  async invalidate(...keys: string[]): Promise<void> {
    if (!keys.length || !this.isAvailable) return;

    try {
      // one round trip for the deletes plus the fan-out message
      const tx = this.client.multi();
      tx.del(...keys);
      tx.publish(this.channel(CacheChannel.invalidate), JSON.stringify(keys));
      await tx.exec();

      for (const key of keys) {
        this.bumpGeneration(key);
        this.metrics.invalidated(key);
      }
    } catch (err) {
      this.miss('invalidate', keys.join(','), err);
    }
  }

  /** Runs several commands as one atomic MULTI/EXEC. */
  async transaction(build: (tx: ChainableCommander) => void): Promise<boolean> {
    if (!this.isAvailable) return false;

    try {
      const tx = this.client.multi();
      build(tx);
      const results = await tx.exec();

      // exec() returns null when a WATCHed key changed under us
      return results !== null && results.every(([err]) => err === null);
    } catch (err) {
      this.miss('transaction', '-', err);
      return false;
    }
  }

  /**
   * Increments a counter and sets its expiry in one atomic step. Doing it as
   * two commands leaves a window where the process dies between INCR and
   * EXPIRE and the key never expires — a permanent lockout.
   */
  async incrementWithTtl(
    key: string,
    ttlSeconds: number,
  ): Promise<{ count: number; ttl: number } | null> {
    if (!this.isAvailable) return null;

    try {
      const [count, ttl] = (await this.client.eval(
        `local n = redis.call('INCR', KEYS[1])
         if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
         return { n, redis.call('TTL', KEYS[1]) }`,
        1,
        key,
        ttlSeconds,
      )) as [number, number];

      return { count, ttl };
    } catch (err) {
      this.miss('increment', key, err);
      return null;
    }
  }

  async delete(...keys: string[]): Promise<void> {
    if (!keys.length || !this.isAvailable) return;

    try {
      await this.client.del(...keys);
    } catch (err) {
      this.miss('del', keys.join(','), err);
    }
  }

  private bumpGeneration(key: string): void {
    this.generations.set(key, (this.generations.get(key) ?? 0) + 1);
  }

  /** Called by the caches so a write on one instance clears the others. */
  onInvalidate(listener: (keys: string[]) => void): void {
    const channel = this.channel(CacheChannel.invalidate);
    const set = this.listeners.get(channel) ?? new Set();

    set.add((payload) => {
      try {
        listener(JSON.parse(payload) as string[]);
      } catch {
        // a malformed message is not worth taking a request down for
      }
    });
    this.listeners.set(channel, set);
  }

  /** For the readiness probe. */
  async ping(): Promise<number | null> {
    if (!isRedisEnabled()) return null;

    const startedAt = Date.now();
    await this.client.ping();
    return Date.now() - startedAt;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.client.quit(), this.subscriber.quit()]);
  }

  /** keyPrefix covers keys but not channels, so channels are prefixed here. */
  private channel(name: string): string {
    return `${process.env.REDIS_PREFIX ?? 'material:'}${name}`;
  }

  private miss(operation: string, key: string, err: unknown): void {
    this.metrics.error(key);
    this.logger.warn(
      `${operation} ${key} failed, falling through to PostgreSQL — ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
