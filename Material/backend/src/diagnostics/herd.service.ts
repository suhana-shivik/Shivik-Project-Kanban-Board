import { Injectable, Logger } from '@nestjs/common';
import { ConflictError } from '../common/errors';
import { CategoryRepository } from '../material/category.repository';
import { MaterialService } from '../material/material.service';
import { CacheKey } from '../redis/cache.keys';
import { CacheMetrics } from '../redis/cache.metrics';
import { RedisService } from '../redis/redis.service';
import { ConnectionWatcher } from './connection-watcher';
import { HerdTestDto } from './herd.dto';

/**
 * Reproduces a thundering herd on the cached materials list, with the fix
 * switchable, so the difference can be measured rather than argued about.
 *
 * Why this lives on the server instead of in Postman: a Postman run is
 * sequential. Request 2 does not leave until request 1 comes back, so its
 * misses never overlap and no herd ever forms. The burst has to be fired from
 * one place, all at once — which is what `Promise.all` below does.
 */
@Injectable()
export class HerdService {
  private readonly logger = new Logger('HerdTest');

  constructor(
    private readonly materials: MaterialService,
    private readonly categories: CategoryRepository,
    private readonly redis: RedisService,
    private readonly metrics: CacheMetrics,
  ) {}

  async run(dto: HerdTestDto) {
    const reads = dto.reads ?? 96;
    const writes = dto.writes ?? 3;
    const singleFlight = dto.singleFlight ?? true;

    const category = (await this.categories.findAll({}))[0];
    if (!category) {
      throw new ConflictError(
        'Create at least one category before running the herd test.',
      );
    }

    const previous = process.env.CACHE_SINGLEFLIGHT;
    process.env.CACHE_SINGLEFLIGHT = singleFlight ? 'true' : 'false';

    const created: number[] = [];

    try {
      // start cold and from a known counter, so every number below belongs to
      // this run and nothing else
      await this.redis.invalidatePattern(CacheKey.materialListPattern);
      this.metrics.reset();

      const stamp = Date.now();
      const tasks: (() => Promise<unknown>)[] = [];

      for (let i = 0; i < reads; i += 1) {
        tasks.push(() => this.materials.findAll({}));
      }
      for (let i = 0; i < writes; i += 1) {
        tasks.push(async () => {
          const material = await this.materials.create({
            name: `Herd Probe ${stamp}-${i}`,
            code: `HERD-${stamp}-${i}`,
            categoryId: category.id,
            uom: 'nos',
            hsn: '0000',
            gst: '18%',
          });
          created.push(material.id);
        });
      }

      // spread the writes through the reads rather than leaving them bunched
      // at the end — an invalidation in the middle is what triggers the herd
      const ordered = interleave(tasks, reads, writes);

      // watch PostgreSQL from outside the pool while the burst runs
      const watcher = new ConnectionWatcher();
      await watcher.start();

      const startedAt = Date.now();
      const settled = await Promise.allSettled(ordered.map((task) => task()));
      const durationMs = Date.now() - startedAt;

      const connections = await watcher.stop();

      const rejected = settled.filter(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );

      // Counting failures is not enough: the whole point of the endpoint is to
      // explain the herd, and "2 failed" without a reason explains nothing.
      // These never reach the HTTP exception filter — they are in-process
      // calls caught by allSettled — so nothing else would log them.
      const failureReasons = [
        ...new Set(
          rejected.map((result) =>
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
          ),
        ),
      ];
      const cache = this.metrics.snapshot();
      const list = cache.byKey.find((row) =>
        row.key.startsWith('list:materials'),
      );

      const queries = list?.loads ?? 0;
      const misses = list?.misses ?? 0;
      const coalesced = list?.coalesced ?? 0;

      this.logger.log(
        `${reads}r/${writes}w singleFlight=${singleFlight} -> ${queries} db queries in ${durationMs}ms`,
      );

      return {
        scenario: {
          reads,
          writes,
          totalRequests: reads + writes,
          singleFlight,
          concurrency: 'all fired at once via Promise.all',
        },
        durationMs,
        failed: rejected.length,
        failureReasons,

        /**
         * What the burst cost PostgreSQL in backends. One query needs one
         * connection, so this tracks `listQueries` far more closely than it
         * tracks the number of requests.
         */
        connections: {
          poolMax: Number(process.env.DB_POOL_MAX ?? 10),
          alreadyOpen: connections.baseline,
          peak: connections.peak,
          openedByBurst: connections.openedByBurst,
          /** Low samples on a fast burst means `peak` may be an undercount. */
          samples: connections.samples,
        },

        database: {
          /** The number that matters: how often PostgreSQL was actually asked. */
          listQueries: queries,
          /**
           * queries that were started but threw, so `listQueries` alone does
           * not add up to `worstCase`
           */
          queriesFailed: rejected.length,
          /** Every miss would have been its own query without coalescing. */
          queriesAvoided: coalesced,
          worstCase: misses + coalesced,
          reductionPercent: percent(coalesced, misses + coalesced),
        },

        cache: {
          hits: list?.hits ?? 0,
          misses,
          coalesced,
          invalidations: list?.invalidations ?? 0,
          hitRate: list?.hitRate ?? 0,
          avgLoadMs: list?.avgLoadMs ?? 0,
        },

        verdict: singleFlight
          ? `${coalesced} of ${misses + coalesced} misses waited on an in-flight query instead of starting their own.`
          : `Every one of the ${misses} misses ran its own query — this is the herd.`,

        /** Full counters, the same shape the dashboard renders. */
        allKeys: cache.byKey,
      };
    } finally {
      if (previous === undefined) delete process.env.CACHE_SINGLEFLIGHT;
      else process.env.CACHE_SINGLEFLIGHT = previous;

      // the probes were only there to force invalidations
      for (const id of created) {
        await this.materials.remove(id).catch(() => undefined);
      }
      await this.redis.invalidatePattern(CacheKey.materialListPattern);
    }
  }
}

/** Places the writes at even intervals through the reads. */
function interleave<T>(tasks: T[], reads: number, writes: number): T[] {
  if (!writes) return tasks;

  const readTasks = tasks.slice(0, reads);
  const writeTasks = tasks.slice(reads);
  const gap = Math.max(1, Math.floor(reads / (writes + 1)));
  const ordered: T[] = [];

  let next = 0;
  readTasks.forEach((task, index) => {
    ordered.push(task);
    if (next < writeTasks.length && (index + 1) % gap === 0) {
      ordered.push(writeTasks[next]);
      next += 1;
    }
  });
  ordered.push(...writeTasks.slice(next));

  return ordered;
}

function percent(part: number, whole: number): number {
  return whole ? Math.round((part / whole) * 10000) / 100 : 0;
}
