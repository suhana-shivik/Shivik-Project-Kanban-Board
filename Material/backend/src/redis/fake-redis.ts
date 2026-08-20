import type Redis from 'ioredis';

/**
 * An in-memory stand-in for ioredis, good enough for the commands this app
 * actually issues. It exists so the cache tests can run with `npm test` on a
 * machine with no Redis and no database — the thundering-herd behaviour is a
 * property of the code, not of the server, so it should be provable without one.
 *
 * Only used by tests; nothing in src/ imports it at runtime.
 */
export class FakeRedis {
  /**
   * Keys are stored **with** the prefix, exactly as real ioredis does: the
   * client prepends `keyPrefix` on every command and SCAN hands back
   * fully-qualified keys. Getting this right is what makes the prefix-stripping
   * in `invalidatePattern` testable.
   */
  constructor(readonly keyPrefix = 'material:') {}

  readonly store = new Map<string, { value: string; expiresAt: number }>();
  readonly published: { channel: string; payload: string }[] = [];

  /** Flip to 'end' to simulate an outage mid-test. */
  status: 'ready' | 'end' | 'connecting' = 'ready';
  /** Set to make the next command throw, for the fail-open tests. */
  failNextCommand = false;

  /** Counts commands so a test can assert round trips, not just outcomes. */
  readonly calls = { get: 0, set: 0, del: 0, eval: 0, scan: 0, multi: 0 };

  private readonly handlers = new Map<
    string,
    ((...args: string[]) => void)[]
  >();

  get(key: string): Promise<string | null> {
    this.calls.get += 1;
    this.guard();

    const entry = this.store.get(this.full(key));
    if (!entry) return Promise.resolve(null);

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.store.delete(this.full(key));
      return Promise.resolve(null);
    }
    return Promise.resolve(entry.value);
  }

  set(
    key: string,
    value: string,
    _mode?: string,
    ttlSeconds?: number,
  ): Promise<'OK'> {
    this.calls.set += 1;
    this.guard();

    this.store.set(this.full(key), {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0,
    });
    return Promise.resolve('OK');
  }

  del(...keys: string[]): Promise<number> {
    this.calls.del += 1;
    this.guard();

    let removed = 0;
    for (const key of keys) if (this.store.delete(this.full(key))) removed += 1;
    return Promise.resolve(removed);
  }

  ttl(key: string): Promise<number> {
    const entry = this.store.get(this.full(key));
    if (!entry) return Promise.resolve(-2);
    if (!entry.expiresAt) return Promise.resolve(-1);
    return Promise.resolve(
      Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000)),
    );
  }

  /** Implements exactly the INCR/EXPIRE/TTL script LoginThrottle relies on. */
  eval(
    _script: string,
    _numKeys: number,
    key: string,
    ttlSeconds: number,
  ): Promise<[number, number]> {
    this.calls.eval += 1;
    this.guard();

    const full = this.full(key);
    const current = Number(this.store.get(full)?.value ?? 0) + 1;
    const existing = this.store.get(full);

    this.store.set(full, {
      value: String(current),
      // only the first INCR sets the expiry, exactly like the Lua script
      expiresAt:
        current === 1
          ? Date.now() + Number(ttlSeconds) * 1000
          : (existing?.expiresAt ?? 0),
    });

    const ttl = Math.max(
      0,
      Math.ceil(((this.store.get(full)?.expiresAt ?? 0) - Date.now()) / 1000),
    );
    return Promise.resolve([current, ttl]);
  }

  /** ioredis calls this as scan(cursor, 'MATCH', pattern, 'COUNT', n). */
  scan(...args: unknown[]): Promise<[string, string[]]> {
    const pattern = String(args[2]);
    this.calls.scan += 1;
    this.guard();

    const regex = new RegExp(
      `^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`,
    );
    const keys = [...this.store.keys()].filter((key) => regex.test(key));
    return Promise.resolve(['0', keys]);
  }

  /** MULTI/EXEC, applied atomically enough for a single-threaded test. */
  multi() {
    this.calls.multi += 1;
    const queued: (() => Promise<unknown>)[] = [];

    const chain = {
      del: (...keys: string[]) => {
        queued.push(() => this.del(...keys));
        return chain;
      },
      publish: (channel: string, payload: string) => {
        queued.push(() => this.publish(channel, payload));
        return chain;
      },
      exec: async () => {
        const results: [Error | null, unknown][] = [];
        for (const command of queued) results.push([null, await command()]);
        return results;
      },
    };
    return chain;
  }

  publish(channel: string, payload: string): Promise<number> {
    this.published.push({ channel, payload });
    // deliver to anything subscribed on this same instance
    for (const handler of this.handlers.get('message') ?? []) {
      handler(channel, payload);
    }
    return Promise.resolve(1);
  }

  subscribe(): Promise<number> {
    return Promise.resolve(1);
  }

  ping(): Promise<'PONG'> {
    this.guard();
    return Promise.resolve('PONG');
  }

  on(event: string, handler: (...args: string[]) => void): this {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return this;
  }

  connect(): Promise<void> {
    return Promise.resolve();
  }

  quit(): Promise<'OK'> {
    return Promise.resolve('OK');
  }

  /** ioredis prepends keyPrefix to every key-addressed command. */
  private full(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /** Test helper: pretend the server went away. */
  goDown(): void {
    this.status = 'end';
  }

  comeBack(): void {
    this.status = 'ready';
  }

  private guard(): void {
    if (this.failNextCommand) {
      this.failNextCommand = false;
      throw new Error('simulated Redis failure');
    }
  }

  /** The service only touches the subset above, so the cast is safe here. */
  asRedis(): Redis {
    return this as unknown as Redis;
  }
}
