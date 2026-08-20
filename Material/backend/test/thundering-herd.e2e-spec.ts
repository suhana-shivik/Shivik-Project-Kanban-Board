import { api, loginAsAdmin } from './api';
import { reportBurst, reportHeader } from './report';

/**
 * The 100-concurrent-request scenario, end to end: real HTTP, real PostgreSQL,
 * real Redis.
 *
 * The unit tests under src/redis prove the coalescing logic on its own and need
 * no infrastructure. This suite proves the wiring — that a burst arriving over
 * the network really does collapse to a single query.
 *
 *   docker start material-redis
 *   npm run start
 *   npm run test:e2e
 */
jest.setTimeout(120_000);

interface CacheRow {
  key: string;
  reads: number;
  hits: number;
  misses: number;
  coalesced: number;
  loads: number;
  invalidations: number;
}

describe('Thundering herd (e2e)', () => {
  let token = '';

  // decided by globalSetup, because `it.skip` is chosen while this describe
  // body runs — long before any beforeAll hook could set a flag
  const available = process.env.E2E_AVAILABLE === 'true';
  const runIf = () => (available ? it : it.skip);

  beforeAll(async () => {
    if (!available) return;
    token = await loginAsAdmin();
    if (!token) throw new Error('e2e: could not sign in as the admin account');
  });
  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function materialListRow(): Promise<CacheRow | undefined> {
    const response = await api().get('/api/diagnostics/cache').set(auth());
    return (response.body as { byKey: CacheRow[] }).byKey.find((row) =>
      row.key.startsWith('list:materials'),
    );
  }

  /** Cold start, then `count` reads dispatched before any of them return. */
  async function burst(count: number) {
    await api().post('/api/diagnostics/cache/reset').set(auth());
    await api().post('/api/diagnostics/cache/invalidate').set(auth());

    const startedAt = Date.now();
    const responses = await Promise.all(
      Array.from({ length: count }, () =>
        api().get('/api/materials').set(auth()),
      ),
    );
    const durationMs = Date.now() - startedAt;

    const statuses: Record<string, number> = {};
    for (const response of responses) {
      statuses[response.status] = (statuses[response.status] ?? 0) + 1;
    }

    return { responses, durationMs, statuses, row: await materialListRow() };
  }

  runIf()('serves 100 concurrent reads from a single query', async () => {
    const { responses, row, durationMs, statuses } = await burst(100);

    reportBurst('100 concurrent GET /materials', {
      requests: 100,
      durationMs,
      statuses,
      loads: row?.loads ?? 0,
      hits: row?.hits ?? 0,
      coalesced: row?.coalesced ?? 0,
    });

    // The whole point, asserted first so a regression names itself: 100
    // readers, one trip to PostgreSQL.
    expect(row).toBeDefined();
    expect(row!.loads).toBe(1);

    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(row!.reads).toBe(100);

    // The other 99 were served without their own query — but the split
    // between "waited on the in-flight load" and "found it already cached"
    // is a race. If the first load finishes before the hundredth request is
    // even dispatched, the tail becomes hits rather than coalesced. Asserting
    // coalesced === 99 made this test flaky; what actually matters is that
    // nobody else went to the database.
    expect(row!.hits + row!.coalesced).toBe(99);
    expect(row!.coalesced).toBeGreaterThan(50);
  });

  runIf()('gives every reader the same body, not just the first', async () => {
    const { responses } = await burst(50);

    const bodies = new Set(responses.map((r) => JSON.stringify(r.body)));
    expect(bodies.size).toBe(1);
  });

  runIf()('keeps collapsing as the burst grows', async () => {
    const { responses, row, durationMs, statuses } = await burst(250);

    reportBurst('250 concurrent GET /materials', {
      requests: 250,
      durationMs,
      statuses,
      loads: row?.loads ?? 0,
      hits: row?.hits ?? 0,
      coalesced: row?.coalesced ?? 0,
    });

    expect(row!.loads).toBeLessThanOrEqual(2);
    expect(responses.every((r) => r.status === 200)).toBe(true);
  });

  runIf()('survives reads and writes arriving together', async () => {
    await api().post('/api/diagnostics/cache/reset').set(auth());
    await api().post('/api/diagnostics/cache/invalidate').set(auth());

    const stamp = Date.now();

    const reads = Array.from({ length: 96 }, () =>
      api().get('/api/materials').set(auth()),
    );
    const writes = Array.from({ length: 3 }, (_, i) =>
      api()
        .post('/api/materials')
        .set(auth())
        .send({
          name: `E2E Herd ${stamp}-${i}`,
          code: `E2E-HERD-${stamp}-${i}`,
          categoryId: 1,
          uom: 'nos',
          hsn: '0000',
          gst: '18%',
        }),
    );

    const startedAt = Date.now();
    const settled = await Promise.all([...reads, ...writes]);
    const durationMs = Date.now() - startedAt;
    const readResults = settled.slice(0, 96);
    const writeResults = settled.slice(96);

    try {
      const row = await materialListRow();

      const statuses: Record<string, number> = {};
      for (const response of settled) {
        statuses[response.status] = (statuses[response.status] ?? 0) + 1;
      }

      reportBurst('96 reads + 3 writes, interleaved', {
        requests: 96,
        writes: 3,
        durationMs,
        statuses,
        loads: row?.loads ?? 0,
        hits: row?.hits ?? 0,
        coalesced: row?.coalesced ?? 0,
        invalidations: row?.invalidations ?? 0,
      });
      // three invalidations land mid-burst, so a couple of reloads are
      // expected — nowhere near one per reader
      expect(row!.loads).toBeLessThan(10);

      expect(readResults.every((r) => r.status === 200)).toBe(true);
      expect(writeResults.every((r) => r.status === 201)).toBe(true);
    } finally {
      // in a finally, so a failed assertion above cannot leave probe rows in
      // the database for the next run to trip over
      for (const response of writeResults) {
        const id = (response.body as { id?: number }).id;
        if (id) await api().delete(`/api/materials/${id}`).set(auth());
      }
    }
  });

  runIf()(
    'reports the same story through the diagnostics endpoint',
    async () => {
      const response = await api()
        .post('/api/diagnostics/thundering-herd')
        .set(auth())
        .send({ reads: 96, writes: 3, singleFlight: true });

      expect(response.status).toBe(200);

      reportHeader(
        'diagnostics endpoint, singleFlight ON',
        JSON.stringify(response.body.database),
        response.body.verdict as string,
      );

      expect(response.body.database.listQueries).toBeLessThan(5);
      expect(response.body.database.queriesAvoided).toBeGreaterThan(50);
    },
  );

  runIf()('and shows the problem when coalescing is off', async () => {
    const response = await api()
      .post('/api/diagnostics/thundering-herd')
      .set(auth())
      .send({ reads: 96, writes: 3, singleFlight: false });

    expect(response.status).toBe(200);

    reportHeader(
      'same burst, singleFlight OFF',
      JSON.stringify(response.body.database),
      response.body.verdict as string,
      `${response.body.failed} request(s) failed outright: ${
        (response.body.failureReasons as string[]).join('; ') || 'none'
      }`,
    );

    // one query per reader — the behaviour the fix removes
    expect(response.body.database.listQueries).toBeGreaterThan(50);
  });

  runIf()('leaves no probe rows behind', async () => {
    const response = await api()
      .get('/api/materials')
      .set(auth())
      .query({ query: 'HERD' });

    expect(response.body).toEqual([]);
  });
});
