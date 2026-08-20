import { Injectable } from '@nestjs/common';

interface KeyStat {
  hits: number;
  misses: number;
  /** Waited on someone else's in-flight load instead of starting its own. */
  coalesced: number;
  /** Times the loader actually ran — i.e. how often PostgreSQL was touched. */
  loads: number;
  loadMs: number;
  invalidations: number;
  /** Loads whose result was thrown away because a write landed mid-flight. */
  discarded: number;
  errors: number;
}

/**
 * Counts what the cache actually did. The number that matters for a thundering
 * herd is `loads`: it is the count of times the expensive loader ran, so 96
 * simultaneous misses collapsing into 1 load is the whole point made visible.
 */
@Injectable()
export class CacheMetrics {
  private startedAt = Date.now();
  private readonly byKey = new Map<string, KeyStat>();

  hit(key: string): void {
    this.stat(key).hits += 1;
  }

  miss(key: string): void {
    this.stat(key).misses += 1;
  }

  coalesced(key: string): void {
    this.stat(key).coalesced += 1;
  }

  load(key: string, durationMs: number): void {
    const stat = this.stat(key);
    stat.loads += 1;
    stat.loadMs += durationMs;
  }

  invalidated(key: string): void {
    this.stat(key).invalidations += 1;
  }

  /** A load finished, but a write had already made it stale. */
  discarded(key: string): void {
    this.stat(key).discarded += 1;
  }

  error(key: string): void {
    this.stat(key).errors += 1;
  }

  reset(): void {
    this.startedAt = Date.now();
    this.byKey.clear();
  }

  snapshot() {
    const rows = [...this.byKey.entries()].map(([key, stat]) => {
      const reads = stat.hits + stat.misses + stat.coalesced;
      return {
        key,
        reads,
        hits: stat.hits,
        misses: stat.misses,
        coalesced: stat.coalesced,
        loads: stat.loads,
        invalidations: stat.invalidations,
        discarded: stat.discarded,
        errors: stat.errors,
        hitRate: percent(stat.hits + stat.coalesced, reads),
        avgLoadMs: stat.loads ? round(stat.loadMs / stat.loads) : 0,
        /**
         * How many loader runs the coalescing avoided. Without single-flight
         * every miss would have started its own.
         */
        savedLoads: stat.coalesced,
      };
    });

    const totals = rows.reduce(
      (sum, row) => ({
        reads: sum.reads + row.reads,
        hits: sum.hits + row.hits,
        misses: sum.misses + row.misses,
        coalesced: sum.coalesced + row.coalesced,
        loads: sum.loads + row.loads,
        invalidations: sum.invalidations + row.invalidations,
        discarded: sum.discarded + row.discarded,
        errors: sum.errors + row.errors,
      }),
      {
        reads: 0,
        hits: 0,
        misses: 0,
        coalesced: 0,
        loads: 0,
        invalidations: 0,
        discarded: 0,
        errors: 0,
      },
    );

    return {
      since: new Date(this.startedAt).toISOString(),
      totals: {
        ...totals,
        hitRate: percent(totals.hits + totals.coalesced, totals.reads),
        /**
         * Loader runs avoided, as a share of the reads that missed. 0% means
         * every miss hit PostgreSQL — a herd. 96% means they collapsed.
         */
        herdCollapse: percent(
          totals.coalesced,
          totals.misses + totals.coalesced,
        ),
      },
      byKey: rows.sort((a, b) => b.reads - a.reads),
    };
  }

  /**
   * `auth:user:5` and `auth:user:9` are the same cache, so they share a row.
   * Without this the table would grow one line per user.
   */
  private stat(key: string): KeyStat {
    const grouped = key.replace(/:\d+$/, ':*').replace(/:[0-9a-f]{8,}$/, ':*');

    let stat = this.byKey.get(grouped);
    if (!stat) {
      stat = {
        hits: 0,
        misses: 0,
        coalesced: 0,
        loads: 0,
        loadMs: 0,
        invalidations: 0,
        discarded: 0,
        errors: 0,
      };
      this.byKey.set(grouped, stat);
    }
    return stat;
  }
}

function percent(part: number, whole: number): number {
  return whole ? round((part / whole) * 100) : 0;
}

function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}
