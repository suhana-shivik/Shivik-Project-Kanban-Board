import { CacheMetrics } from './cache.metrics';
import { FakeRedis } from './fake-redis';
import { RedisService } from './redis.service';

/**
 * What happens when a write lands *while* a read is still fetching.
 *
 * The dangerous interleaving is not "write then read" or "read then write" —
 * those are fine. It is this one:
 *
 *   1. reader misses, starts SELECT          (sees the old rows)
 *   2. writer commits, invalidates the key   (cache is now empty — correct)
 *   3. reader's SELECT resolves              (still the old rows)
 *   4. reader writes that result into Redis  (cache is now WRONG)
 *
 * Step 4 undoes step 2. The cache ends up holding data the database no longer
 * has, and it stays that way until the TTL expires or another write happens.
 *
 * These tests drive the sequence deliberately instead of hoping to hit it.
 */
describe('a write arriving mid-read', () => {
  let redis: FakeRedis;
  let service: RedisService;

  beforeEach(() => {
    redis = new FakeRedis();
    service = new RedisService(
      redis.asRedis(),
      redis.asRedis(),
      new CacheMetrics(),
    );
    process.env.REDIS_ENABLED = 'true';
    delete process.env.CACHE_SINGLEFLIGHT;
  });

  /** Resolves only when the test says so, so the race can be sequenced. */
  function controllableLoad<T>(value: T) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));

    return {
      release,
      started: { value: false },
      load: async () => {
        await gate;
        return value;
      },
    };
  }

  it('does not leave the cache holding pre-write data', async () => {
    const first = controllableLoad(['old rows']);

    // 1. a reader misses and starts loading
    const reading = service.remember('list:materials:all', 60, first.load);

    // 2. a write commits and invalidates while that load is in flight
    await service.invalidate('list:materials:all');

    // 3. the in-flight SELECT finishes, still holding the pre-write rows
    first.release();
    await reading;

    // 4. so: is the stale result now sitting in the cache?
    const cached = await service.get<string[]>('list:materials:all');

    // it must not be. The invalidation happened after the read started, so
    // that read's result is known to be out of date the moment it lands.
    expect(cached).toBeNull();
  });

  it('still caches normally when no write interrupts', async () => {
    const quiet = controllableLoad(['fresh rows']);

    const reading = service.remember('k', 60, quiet.load);
    quiet.release();
    await reading;

    // nothing invalidated, so the value is cached as usual
    await expect(service.get<string[]>('k')).resolves.toEqual(['fresh rows']);
  });

  it('the readers already waiting still get an answer, stale or not', async () => {
    const first = controllableLoad(['old rows']);

    // 20 readers coalesce onto one in-flight load
    const readers = Array.from({ length: 20 }, () =>
      service.remember('k', 60, first.load),
    );

    await service.invalidate('k');
    first.release();

    // they cannot be failed retroactively — they get the row set that was
    // current when their request started, which is what any single SELECT
    // would have given them anyway
    const results = await Promise.all(readers);
    for (const result of results) expect(result).toEqual(['old rows']);
  });

  it('the next reader after the write gets fresh data', async () => {
    const first = controllableLoad(['old rows']);

    const reading = service.remember('k', 60, first.load);
    await service.invalidate('k');
    first.release();
    await reading;

    // a request arriving after all that must not be served the stale copy
    const fresh = await service.remember('k', 60, async () =>
      Promise.resolve(['new rows']),
    );

    expect(fresh).toEqual(['new rows']);
    await expect(service.get<string[]>('k')).resolves.toEqual(['new rows']);
  });
});
