import { CacheMetrics } from './cache.metrics';
import { FakeRedis } from './fake-redis';
import { RedisService } from './redis.service';

/**
 * The thundering-herd tests.
 *
 * These do the 100 concurrent requests for you, with no Redis, no database and
 * no Postman — the behaviour is a property of `remember()`, so it can be proved
 * in-process. `loads` is the number that matters: how many times the expensive
 * loader actually ran.
 */
/**
 * Prints what a test measured, so a green run is evidence and not a tick.
 * Built as one string and logged once: Jest brackets every console call with
 * its own header, so a loop of logs is unreadable.
 */
function report(title: string, rows: Record<string, string | number>): void {
  const body = Object.entries(rows).map(
    ([label, value]) => `  ${label.padEnd(24)} ${value}`,
  );

  console.log([title, '─'.repeat(title.length), ...body, ''].join('\n'));
}

describe('RedisService — thundering herd', () => {
  let redis: FakeRedis;
  let service: RedisService;
  let metrics: CacheMetrics;

  /** Counts loader runs and takes long enough for a herd to pile up behind it. */
  function slowLoader(ms = 25) {
    const state = { calls: 0 };
    const load = async () => {
      state.calls += 1;
      await new Promise((resolve) => setTimeout(resolve, ms));
      return { rows: ['a', 'b', 'c'], servedBy: state.calls };
    };
    return { state, load };
  }

  beforeEach(() => {
    redis = new FakeRedis();
    metrics = new CacheMetrics();
    service = new RedisService(redis.asRedis(), redis.asRedis(), metrics);
    process.env.REDIS_ENABLED = 'true';
    delete process.env.CACHE_SINGLEFLIGHT;
  });

  afterEach(() => {
    delete process.env.CACHE_SINGLEFLIGHT;
  });

  it('collapses 100 simultaneous misses into a single load', async () => {
    const { state, load } = slowLoader();

    // all 100 leave before any of them come back — this is the shape that
    // a Postman Runner loop can never produce, because it is sequential
    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        service.remember('list:materials:all', 60, load),
      ),
    );

    expect(state.calls).toBe(1);
    expect(results).toHaveLength(100);
    // every caller got the same answer, not just the first one
    for (const result of results) expect(result.rows).toEqual(['a', 'b', 'c']);

    const stats = metrics.snapshot().totals;

    report('100 simultaneous misses, single-flight ON', {
      'loader ran': `${state.calls} time`,
      'DB queries': stats.loads,
      'coalesced (saved)': stats.coalesced,
      'herd collapse': `${stats.herdCollapse}%`,
      'callers served': results.length,
    });

    expect(stats.loads).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.coalesced).toBe(99);
    expect(stats.herdCollapse).toBe(99);
  });

  it('without single-flight, every one of the 100 hits the database', async () => {
    process.env.CACHE_SINGLEFLIGHT = 'false';
    const { state, load } = slowLoader();

    await Promise.all(
      Array.from({ length: 100 }, () =>
        service.remember('list:materials:all', 60, load),
      ),
    );

    const stats = metrics.snapshot().totals;

    report('the same 100, single-flight OFF', {
      'loader ran': `${state.calls} times`,
      'DB queries': stats.loads,
      'coalesced (saved)': stats.coalesced,
      'herd collapse': `${stats.herdCollapse}%`,
      verdict: 'every reader ran its own query — this is the herd',
    });

    // this is the bug the fix exists for
    expect(state.calls).toBe(100);
    expect(stats.loads).toBe(100);
    expect(stats.coalesced).toBe(0);
  });

  it('serves the 96 reads and 3 writes scenario with one query', async () => {
    const { state, load } = slowLoader();
    const reads = () => service.remember('list:materials:all', 60, load);
    // a write invalidates the list, which is what makes the readers pile up
    const write = () => service.invalidate('list:materials:all');

    const tasks: Promise<unknown>[] = [];
    for (let i = 0; i < 96; i += 1) {
      tasks.push(reads());
      if (i === 24 || i === 49 || i === 74) tasks.push(write());
    }
    await Promise.all(tasks);

    const stats = metrics.snapshot().totals;

    report('96 reads + 3 writes, interleaved', {
      'loader ran': `${state.calls} time(s)`,
      'DB queries': stats.loads,
      'coalesced (saved)': stats.coalesced,
      invalidations: stats.invalidations,
    });

    // the readers that arrived together share one load; a write landing
    // mid-flight can start at most one more
    expect(state.calls).toBeLessThanOrEqual(2);
    expect(stats.coalesced).toBeGreaterThanOrEqual(90);
  });

  it('lets a later request re-load after the in-flight one settles', async () => {
    const { state, load } = slowLoader(5);

    await Promise.all([
      service.remember('k', 60, load),
      service.remember('k', 60, load),
    ]);
    expect(state.calls).toBe(1);

    // the entry is cached now, so this is a hit rather than a second load
    await service.remember('k', 60, load);
    expect(state.calls).toBe(1);
    expect(metrics.snapshot().totals.hits).toBe(1);

    // once invalidated, the next reader loads again
    await service.invalidate('k');
    await service.remember('k', 60, load);
    expect(state.calls).toBe(2);
  });

  it('does not leave a failed load stuck in the in-flight map', async () => {
    let attempt = 0;
    const load = async () => {
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (attempt === 1) throw new Error('database blew up');
      return 'second time lucky';
    };

    await expect(service.remember('k', 60, load)).rejects.toThrow(
      'database blew up',
    );

    // if the rejected promise were still parked in the map, this would return
    // the same rejection forever
    await expect(service.remember('k', 60, load)).resolves.toBe(
      'second time lucky',
    );
  });

  it('coalesces per key, not globally', async () => {
    const first = slowLoader();
    const second = slowLoader();

    await Promise.all([
      ...Array.from({ length: 10 }, () =>
        service.remember('a', 60, first.load),
      ),
      ...Array.from({ length: 10 }, () =>
        service.remember('b', 60, second.load),
      ),
    ]);

    expect(first.state.calls).toBe(1);
    expect(second.state.calls).toBe(1);
  });
});

describe('RedisService — resilience', () => {
  let redis: FakeRedis;
  let service: RedisService;
  let metrics: CacheMetrics;

  beforeEach(() => {
    redis = new FakeRedis();
    metrics = new CacheMetrics();
    service = new RedisService(redis.asRedis(), redis.asRedis(), metrics);
    process.env.REDIS_ENABLED = 'true';
  });

  it('falls through to the loader when Redis is down, without throwing', async () => {
    redis.goDown();
    let calls = 0;

    const value = await service.remember('k', 60, () => {
      calls += 1;
      return Promise.resolve('from postgres');
    });

    expect(value).toBe('from postgres');
    expect(calls).toBe(1);
    // nothing was written, because there was nowhere to write it
    expect(redis.store.size).toBe(0);
  });

  it('returns null from get and false from set while down', async () => {
    redis.goDown();

    await expect(service.get('k')).resolves.toBeNull();
    await expect(service.set('k', 1, 60)).resolves.toBe(false);
    expect(service.isAvailable).toBe(false);
  });

  it('turns a command error into a miss rather than an exception', async () => {
    await service.set('k', 'cached', 60);
    redis.failNextCommand = true;

    // the GET blows up; the caller still gets a value, from the loader
    await expect(
      service.remember('k', 60, () => Promise.resolve('fallback')),
    ).resolves.toBe('fallback');
    expect(metrics.snapshot().totals.errors).toBeGreaterThan(0);
  });

  it('recovers as soon as Redis comes back', async () => {
    redis.goDown();
    await service.remember('k', 60, () => Promise.resolve('one'));
    expect(redis.store.size).toBe(0);

    redis.comeBack();
    await service.remember('k', 60, () => Promise.resolve('two'));
    expect(redis.store.size).toBe(1);
    await expect(service.get('k')).resolves.toBe('two');
  });
});

describe('RedisService — invalidation', () => {
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
    process.env.REDIS_PREFIX = 'material:';
  });

  it('deletes and publishes in one MULTI, so no instance sees a half state', async () => {
    await service.set('perm:roles', { admin: [] }, 300);
    await service.invalidate('perm:roles');

    expect(redis.store.has('material:perm:roles')).toBe(false);
    expect(redis.published).toHaveLength(1);
    expect(redis.published[0].payload).toContain('perm:roles');
    // one MULTI, not a DEL followed by a separate PUBLISH
    expect(redis.calls.multi).toBe(1);
  });

  it('clears a whole key family by pattern', async () => {
    await service.set('list:materials:all', [1], 60);
    await service.set('list:materials:status=Active', [2], 60);
    await service.set('list:materials:categoryId=1', [3], 60);
    await service.set('perm:roles', {}, 300);

    const cleared = await service.invalidatePattern('list:materials:*');

    expect(cleared).toBe(3);
    expect(redis.store.has('material:perm:roles')).toBe(true);
    expect([...redis.store.keys()]).toEqual(['material:perm:roles']);
  });

  it('tells subscribers which keys went, so other instances can drop theirs', async () => {
    const seen: string[][] = [];
    service.onInvalidate((keys) => seen.push(keys));
    await service.onModuleInit();

    await service.invalidate('perm:roles', 'lookup:form');

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual(['perm:roles', 'lookup:form']);
  });
});
