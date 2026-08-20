import { Client } from 'pg';
import { databaseConfig } from '../database/database.provider';

/**
 * Samples how many backends PostgreSQL has open while a burst runs.
 *
 * It uses its **own** connection rather than the application pool, for two
 * reasons: taking a pool slot would change the very number being measured, and
 * once the pool is saturated a sampler inside it would queue and record
 * nothing at exactly the moment the reading matters.
 *
 * That one extra connection is excluded from the reported figures.
 */
export class ConnectionWatcher {
  private client?: Client;
  private timer?: NodeJS.Timeout;
  private samples: number[] = [];
  private baseline = 0;

  /**
   * 4ms because a warm burst can finish in under 50ms — at 15ms that is three
   * samples, and the peak is easily missed entirely. The returned `samples`
   * count is there so a suspiciously low peak can be recognised as
   * under-sampling rather than believed.
   */
  async start(everyMs = 4): Promise<void> {
    const { database, ...connection } = databaseConfig();
    this.client = new Client({ ...connection, database });
    await this.client.connect();

    this.baseline = await this.count();
    this.samples = [];

    this.timer = setInterval(() => {
      void this.count()
        .then((n) => this.samples.push(n))
        .catch(() => undefined);
    }, everyMs);
  }

  async stop(): Promise<{
    peak: number;
    baseline: number;
    openedByBurst: number;
    samples: number;
  }> {
    if (this.timer) clearInterval(this.timer);

    const peak = this.samples.length
      ? Math.max(...this.samples)
      : this.baseline;
    await this.client?.end().catch(() => undefined);

    return {
      peak,
      baseline: this.baseline,
      // what the burst itself added, over and above what was already connected
      openedByBurst: Math.max(0, peak - this.baseline),
      samples: this.samples.length,
    };
  }

  private async count(): Promise<number> {
    const result = await this.client!.query<{ n: string }>(
      // this watcher's own connection is excluded
      `SELECT count(*) AS n
         FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()`,
    );
    return Number(result.rows[0].n);
  }
}
