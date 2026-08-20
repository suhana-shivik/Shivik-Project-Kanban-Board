import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Kysely, Transaction } from 'kysely';
import { KYSELY } from './database.provider';
import type { Database } from './schema.types';

/**
 * Thin wrapper around the Kysely instance. Repositories reach for `.db` and
 * build their own queries; this exists to own the connection lifecycle and to
 * give transactions one obvious entry point.
 */
@Injectable()
export class DbService implements OnModuleDestroy {
  constructor(@Inject(KYSELY) readonly db: Kysely<Database>) {}

  /**
   * Runs `work` in a transaction, rolling back if it throws. Used wherever a
   * write spans more than one table — a user plus its department, project and
   * manager rows, for instance.
   */
  tx<T>(work: (trx: Transaction<Database>) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(work);
  }

  /** Closes the pool on shutdown so a deploy does not cut a query in half. */
  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }
}
