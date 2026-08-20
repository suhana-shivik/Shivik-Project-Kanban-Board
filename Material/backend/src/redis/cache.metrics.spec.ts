import { CacheMetrics } from './cache.metrics';

describe('CacheMetrics', () => {
  let metrics: CacheMetrics;

  beforeEach(() => {
    metrics = new CacheMetrics();
  });

  it('reports a herd as loads climbing with misses', () => {
    // 100 readers, none of them coalesced
    for (let i = 0; i < 100; i += 1) {
      metrics.miss('list:materials:all');
      metrics.load('list:materials:all', 40);
    }

    const totals = metrics.snapshot().totals;
    expect(totals.loads).toBe(100);
    expect(totals.coalesced).toBe(0);
    // 0% collapse is the signature of the problem
    expect(totals.herdCollapse).toBe(0);
  });

  it('reports the fix as one load and the rest coalesced', () => {
    metrics.miss('list:materials:all');
    metrics.load('list:materials:all', 40);
    for (let i = 0; i < 99; i += 1) metrics.coalesced('list:materials:all');

    const totals = metrics.snapshot().totals;
    expect(totals.loads).toBe(1);
    expect(totals.coalesced).toBe(99);
    expect(totals.herdCollapse).toBe(99);
  });

  it('counts a coalesced read as served, not as a miss, in the hit rate', () => {
    metrics.hit('k');
    metrics.miss('k');
    metrics.coalesced('k');
    metrics.coalesced('k');

    const row = metrics.snapshot().byKey[0];
    expect(row.reads).toBe(4);
    // 3 of 4 readers were served without their own query
    expect(row.hitRate).toBe(75);
  });

  it('averages load time only over real loads', () => {
    metrics.load('k', 100);
    metrics.load('k', 200);

    expect(metrics.snapshot().byKey[0].avgLoadMs).toBe(150);
  });

  it('groups per-id keys so one row covers every user', () => {
    metrics.hit('auth:user:1');
    metrics.hit('auth:user:2');
    metrics.miss('auth:user:37');

    const rows = metrics.snapshot().byKey;
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('auth:user:*');
    expect(rows[0].reads).toBe(3);
  });

  it('keeps different caches on separate rows', () => {
    metrics.hit('perm:roles');
    metrics.hit('lookup:form');

    expect(
      metrics
        .snapshot()
        .byKey.map((r) => r.key)
        .sort(),
    ).toEqual(['lookup:form', 'perm:roles']);
  });

  it('sorts the busiest cache first', () => {
    metrics.hit('quiet');
    for (let i = 0; i < 5; i += 1) metrics.hit('busy');

    expect(metrics.snapshot().byKey[0].key).toBe('busy');
  });

  it('starts clean after a reset', () => {
    metrics.hit('k');
    metrics.load('k', 10);
    metrics.reset();

    const snapshot = metrics.snapshot();
    expect(snapshot.byKey).toHaveLength(0);
    expect(snapshot.totals.reads).toBe(0);
  });

  it('reports zero rather than NaN before anything happens', () => {
    const totals = metrics.snapshot().totals;
    expect(totals.hitRate).toBe(0);
    expect(totals.herdCollapse).toBe(0);
  });
});
