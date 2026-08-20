import { Logger } from '@nestjs/common';
import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import { Client, Pool, PoolConfig } from 'pg';
import type { Database } from './schema.types';

export const DATABASE_POOL = 'DATABASE_POOL';
export const KYSELY = 'KYSELY';

/** Connection settings, read from src/.env via ConfigModule. */
export function databaseConfig(): Required<
  Pick<PoolConfig, 'host' | 'port' | 'user' | 'password' | 'database' | 'max'>
> {
  return {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'material_master',
    max: Number(process.env.DB_POOL_MAX ?? 10),
  };
}

/**
 * `CREATE DATABASE` cannot run from inside the database it creates, so this
 * opens a throwaway connection to the always-present `postgres` database
 * first. Means a fresh laptop only needs the server running, not a hand-made
 * database.
 */
async function ensureDatabaseExists(): Promise<void> {
  const { database, ...connection } = databaseConfig();
  const client = new Client({ ...connection, database: 'postgres' });

  await client.connect();
  try {
    const existing = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [database],
    );
    if (existing.rowCount === 0) {
      // the name comes from env, not from a request, and CREATE DATABASE
      // cannot be parameterised — quote it rather than interpolate raw
      await client.query(`CREATE DATABASE "${database.replace(/"/g, '""')}"`);
      new Logger('Database').log(`created database ${database}`);
    }
  } finally {
    await client.end();
  }
}

/** The pool. Kysely drives it, and the bootstrap borrows it for raw DDL. */
export const databaseProvider = {
  provide: DATABASE_POOL,
  inject: [],
  useFactory: async (): Promise<Pool> => {
    await ensureDatabaseExists();

    const pool = new Pool(databaseConfig());

    // an idle-client error (server restart, dropped socket) is emitted on the
    // pool, and an unhandled 'error' event would take the process down
    const logger = new Logger('Database');
    pool.on('error', (err) => logger.error('idle client error', err.stack));

    return pool;
  },
};

export const kyselyProvider = {
  provide: KYSELY,
  inject: [DATABASE_POOL],
  useFactory: (pool: Pool): Kysely<Database> => {
    const logger = new Logger('Query');

    return new Kysely<Database>({
      dialect: new PostgresDialect({ pool }),
      // schema.types.ts is written in camelCase; this translates both ways, so
      // `firstName` goes to PostgreSQL as `first_name` and comes back as
      // `firstName`. Note it does NOT rewrite identifiers inside sql`` -
      // those have to be spelled the way the database has them.
      plugins: [new CamelCasePlugin()],
      log: (event) => {
        if (event.level === 'error') {
          logger.error(
            `${event.error instanceof Error ? event.error.message : 'query failed'} — ${event.query.sql}`,
          );
        } else if (process.env.DB_LOG_QUERIES === 'true') {
          logger.debug(
            `${event.query.sql} [${Math.round(event.queryDurationMillis)}ms]`,
          );
        }
      },
    });
  },
};
