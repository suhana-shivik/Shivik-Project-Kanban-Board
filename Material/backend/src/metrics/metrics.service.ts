import { Injectable } from '@nestjs/common';
import { CacheMetrics } from '../redis/cache.metrics';

interface RouteStat {
  method: string;
  route: string;
  hits: number;
  success: number;
  failed: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  lastStatus: number;
}

export interface FailureRecord {
  method: string;
  route: string;
  status: number;
  message: string | null;
  durationMs: number;
  at: string;
}

export interface SlowRecord {
  method: string;
  route: string;
  status: number;
  durationMs: number;
  at: string;
}

/** Latency samples kept for percentiles. Bounded so memory cannot creep. */
const LATENCY_SAMPLES = 1000;
const RECENT_FAILURES = 20;
const SLOWEST_KEPT = 10;
/** Per-second buckets, pruned to this window for the "requests per minute" rate. */
const RATE_WINDOW_SECONDS = 60;

@Injectable()
export class MetricsService {
  /** RedisModule is @Global, so the cache counters ride along in the snapshot. */
  constructor(private readonly cache: CacheMetrics) {}

  private startedAt = Date.now();

  private total = 0;
  private success = 0;
  private clientErrors = 0;
  private serverErrors = 0;

  private inFlight = 0;
  private peakInFlight = 0;

  private totalMs = 0;
  private latencies: number[] = [];
  private latencyCursor = 0;

  private readonly byRoute = new Map<string, RouteStat>();
  private readonly byStatus = new Map<number, number>();
  private readonly byMethod = new Map<string, number>();

  /** epoch-second -> request count, pruned to the last RATE_WINDOW_SECONDS. */
  private readonly buckets = new Map<number, number>();
  private peakPerMinute = 0;

  private failures: FailureRecord[] = [];
  private slowest: SlowRecord[] = [];

  private readonly listeners = new Set<() => void>();

  /** The gateway subscribes so a push happens the moment a request finishes. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  begin(): void {
    this.inFlight += 1;
    this.peakInFlight = Math.max(this.peakInFlight, this.inFlight);
  }

  record(
    method: string,
    route: string,
    status: number,
    durationMs: number,
    message: string | null,
  ): void {
    this.inFlight = Math.max(0, this.inFlight - 1);

    this.total += 1;
    this.totalMs += durationMs;

    if (status >= 500) this.serverErrors += 1;
    else if (status >= 400) this.clientErrors += 1;
    else this.success += 1;

    this.byStatus.set(status, (this.byStatus.get(status) ?? 0) + 1);
    this.byMethod.set(method, (this.byMethod.get(method) ?? 0) + 1);

    if (this.latencies.length < LATENCY_SAMPLES) {
      this.latencies.push(durationMs);
    } else {
      this.latencies[this.latencyCursor] = durationMs;
      this.latencyCursor = (this.latencyCursor + 1) % LATENCY_SAMPLES;
    }

    const key = `${method} ${route}`;
    const stat = this.byRoute.get(key) ?? {
      method,
      route,
      hits: 0,
      success: 0,
      failed: 0,
      totalMs: 0,
      minMs: Number.POSITIVE_INFINITY,
      maxMs: 0,
      lastStatus: status,
    };

    stat.hits += 1;
    stat.totalMs += durationMs;
    stat.minMs = Math.min(stat.minMs, durationMs);
    stat.maxMs = Math.max(stat.maxMs, durationMs);
    stat.lastStatus = status;
    if (status >= 400) stat.failed += 1;
    else stat.success += 1;
    this.byRoute.set(key, stat);

    const at = new Date().toISOString();

    if (status >= 400) {
      this.failures.unshift({ method, route, status, message, durationMs, at });
      this.failures = this.failures.slice(0, RECENT_FAILURES);
    }

    this.slowest.push({ method, route, status, durationMs, at });
    this.slowest.sort((a, b) => b.durationMs - a.durationMs);
    this.slowest = this.slowest.slice(0, SLOWEST_KEPT);

    this.tickRate();

    for (const listener of this.listeners) listener();
  }

  reset(): void {
    this.cache.reset();
    this.startedAt = Date.now();
    this.total = 0;
    this.success = 0;
    this.clientErrors = 0;
    this.serverErrors = 0;
    this.peakInFlight = this.inFlight;
    this.totalMs = 0;
    this.latencies = [];
    this.latencyCursor = 0;
    this.byRoute.clear();
    this.byStatus.clear();
    this.byMethod.clear();
    this.buckets.clear();
    this.peakPerMinute = 0;
    this.failures = [];
    this.slowest = [];
  }

  snapshot() {
    const uptimeMs = Date.now() - this.startedAt;
    const uptimeSeconds = Math.max(1, Math.round(uptimeMs / 1000));
    const failed = this.clientErrors + this.serverErrors;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const memory = process.memoryUsage();

    return {
      collectedAt: new Date().toISOString(),
      since: new Date(this.startedAt).toISOString(),
      uptime: {
        seconds: Math.round(uptimeMs / 1000),
        human: humanDuration(uptimeMs),
      },

      totals: {
        requests: this.total,
        success: this.success,
        failed,
        clientErrors: this.clientErrors,
        serverErrors: this.serverErrors,
        successRate: percent(this.success, this.total),
        failureRate: percent(failed, this.total),
      },

      load: {
        inFlight: this.inFlight,
        peakInFlight: this.peakInFlight,
        requestsPerMinute: this.currentRate(),
        peakRequestsPerMinute: this.peakPerMinute,
        averagePerMinute: round(this.total / (uptimeSeconds / 60)),
        averagePerSecond: round(this.total / uptimeSeconds),
        windowSeconds: RATE_WINDOW_SECONDS,
        /** One entry per second, oldest first, zero-filled. */
        perSecond: this.rateSeries(),
      },

      latencyMs: {
        average: this.total ? round(this.totalMs / this.total) : 0,
        min: sorted.length ? round(sorted[0]) : 0,
        max: sorted.length ? round(sorted[sorted.length - 1]) : 0,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
        sampled: sorted.length,
      },

      byStatus: Object.fromEntries(
        [...this.byStatus.entries()].sort((a, b) => a[0] - b[0]),
      ),
      byMethod: Object.fromEntries(
        [...this.byMethod.entries()].sort((a, b) => b[1] - a[1]),
      ),

      byEndpoint: [...this.byRoute.values()]
        .sort((a, b) => b.hits - a.hits)
        .map((stat) => ({
          endpoint: `${stat.method} ${stat.route}`,
          hits: stat.hits,
          success: stat.success,
          failed: stat.failed,
          successRate: percent(stat.success, stat.hits),
          avgMs: round(stat.totalMs / stat.hits),
          minMs: round(stat.minMs),
          maxMs: round(stat.maxMs),
          lastStatus: stat.lastStatus,
        })),

      recentFailures: this.failures,
      slowestRequests: this.slowest,

      /** Cache counters — `loads` is what a thundering herd inflates. */
      cache: this.cache.snapshot(),

      process: {
        pid: process.pid,
        node: process.version,
        heapUsedMb: round(memory.heapUsed / 1024 / 1024),
        rssMb: round(memory.rss / 1024 / 1024),
      },
    };
  }

  /** Counts this request into its one-second bucket and re-checks the peak. */
  private tickRate(): void {
    const second = Math.floor(Date.now() / 1000);
    this.buckets.set(second, (this.buckets.get(second) ?? 0) + 1);

    for (const bucket of this.buckets.keys()) {
      if (bucket <= second - RATE_WINDOW_SECONDS) this.buckets.delete(bucket);
    }

    this.peakPerMinute = Math.max(this.peakPerMinute, this.currentRate());
  }

  /** The rate buckets flattened into a fixed-length series the chart can draw. */
  private rateSeries(): number[] {
    const now = Math.floor(Date.now() / 1000);
    const series: number[] = [];

    for (let offset = RATE_WINDOW_SECONDS - 1; offset >= 0; offset -= 1) {
      series.push(this.buckets.get(now - offset) ?? 0);
    }
    return series;
  }

  private currentRate(): number {
    const cutoff = Math.floor(Date.now() / 1000) - RATE_WINDOW_SECONDS;
    let count = 0;

    for (const [second, hits] of this.buckets) {
      if (second > cutoff) count += hits;
    }
    return count;
  }
}

function percent(part: number, whole: number): number {
  return whole ? round((part / whole) * 100) : 0;
}

function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );
  return round(sorted[Math.max(0, index)]);
}

function humanDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const parts = [
    [Math.floor(seconds / 86400), 'd'],
    [Math.floor((seconds % 86400) / 3600), 'h'],
    [Math.floor((seconds % 3600) / 60), 'm'],
    [seconds % 60, 's'],
  ] as const;

  const shown = parts.filter(([value]) => value > 0);
  return shown.length
    ? shown.map(([value, unit]) => `${value}${unit}`).join(' ')
    : '0s';
}
