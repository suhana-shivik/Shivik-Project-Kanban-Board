import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { hashPassword } from '../auth/password';
import type { Status } from '../common/types';
import type { Role } from '../auth/roles';
import { sql } from 'kysely';
import { DbService } from './db.service';
import type { DbOrTrx } from './schema.types';

/** Copied next to the compiled JS by the nest-cli `assets` rule. */
const SCHEMA_PATH = join(__dirname, 'schema.sql');

/** Arbitrary constant, shared by every instance so only one bootstraps. */
const BOOTSTRAP_LOCK = 4711_2026;

interface LegacyDatabase {
  categories?: {
    id: number;
    code: string | null;
    name: string;
    description: string | null;
    status: string;
  }[];
  subcategories?: {
    id: number;
    categoryId: number;
    parentId: number | null;
    code: string | null;
    name: string;
    description: string | null;
    status: string;
  }[];
  materials?: {
    id: number;
    code: string;
    name: string;
    categoryId: number;
    subcategoryId: number | null;
    uom: string;
    hsn: string;
    gst: string;
    description: string | null;
    status: string;
  }[];
}

/**
 * Brings an empty PostgreSQL server up to a working state on boot: applies the
 * schema, seeds the demo roles and lookups, then imports the old
 * data/db.json once so nothing is lost in the move off JSON storage.
 */
@Injectable()
export class SchemaService implements OnModuleInit {
  private readonly logger = new Logger('Database');

  constructor(private readonly db: DbService) {}

  async onModuleInit(): Promise<void> {
    const startedAt = Date.now();

    // Two instances booting together would both run the schema and both try to
    // seed. A session-level advisory lock makes the second one wait and then
    // find everything already done — the statements are all idempotent, so it
    // simply no-ops. The number is an arbitrary constant shared by every
    // instance of this app.
    await this.db.tx(async (trx) => {
      await sql`select pg_advisory_xact_lock(${BOOTSTRAP_LOCK})`.execute(trx);

      // the DDL is one multi-statement script, so it goes through raw sql
      // rather than the query builder
      await sql.raw(await readFile(SCHEMA_PATH, 'utf8')).execute(trx);

      await this.seedLookups(trx);
      await this.seedUsers(trx);
      await this.importLegacyJson(trx);
    });

    this.logger.log(`schema ready in ${Date.now() - startedAt}ms`);
  }

  private async seedLookups(trx: DbOrTrx): Promise<void> {
    const departments = [
      'Procurement',
      'Engineering',
      'Stores',
      'Quality',
      'Accounts',
    ];
    const projects: [string, string][] = [
      ['PRJ-001', 'Metro Depot Phase 1'],
      ['PRJ-002', 'Riverside Bridge'],
      ['PRJ-003', 'Warehouse Expansion'],
    ];

    // The unique indexes are on lower(name), and ON CONFLICT cannot target an
    // expression index by column name — so check first rather than upsert.
    for (const name of departments) {
      if (await this.lookupExists(trx, 'departments', name)) continue;
      await trx.insertInto('departments').values({ name }).execute();
    }
    for (const [code, name] of projects) {
      if (await this.lookupExists(trx, 'projects', name)) continue;
      await trx.insertInto('projects').values({ code, name }).execute();
    }
  }

  private async lookupExists(
    trx: DbOrTrx,
    table: 'departments' | 'projects',
    name: string,
  ): Promise<boolean> {
    const row = await trx
      .selectFrom(table)
      .select('id')
      .where(sql`lower(name)`, '=', name.toLowerCase())
      .executeTakeFirst();

    return row !== undefined;
  }

  /** One account per role, so every branch of the permission map is reachable. */
  private async seedUsers(trx: DbOrTrx): Promise<void> {
    const accounts: [string, string, string, Role][] = [
      ['Suhana', 'Admin', 'suhana@gmail.com', 'admin'],
      ['Priya', 'Sharma', 'category@gmail.com', 'category_manager'],
      ['Rahul', 'Verma', 'material@gmail.com', 'material_manager'],
      ['Anita', 'Desai', 'viewer@gmail.com', 'viewer'],
    ];

    for (const [firstName, lastName, email, role] of accounts) {
      // the hash is only computed when the row is actually missing
      const exists = await trx
        .selectFrom('users')
        .select('id')
        .where(sql`lower(email)`, '=', email.toLowerCase())
        .executeTakeFirst();
      if (exists) continue;

      await trx
        .insertInto('users')
        .values({
          firstName,
          lastName,
          email,
          passwordHash: hashPassword('123456'),
          role,
        })
        .execute();
      this.logger.log(`seeded ${role} account ${email}`);
    }
  }

  /**
   * Runs once: if the material tables are still empty and a data/db.json is
   * lying around from the JSON-file version, its rows are copied across with
   * their original ids so existing links keep working.
   */
  private async importLegacyJson(trx: DbOrTrx): Promise<void> {
    const occupied = await trx
      .selectFrom('categories')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (occupied) return;

    const file = resolve(process.env.DATA_FILE ?? 'data/db.json');
    let legacy: LegacyDatabase;

    try {
      legacy = JSON.parse(await readFile(file, 'utf8')) as LegacyDatabase;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      return; // nothing to import — a genuinely fresh install
    }

    const categories = legacy.categories ?? [];
    const subcategories = legacy.subcategories ?? [];
    const materials = legacy.materials ?? [];
    if (!categories.length) return;

    for (const row of categories) {
      await trx
        .insertInto('categories')
        .values({
          id: row.id,
          code: row.code,
          name: row.name,
          description: row.description,
          status: row.status as Status,
        })
        .execute();
    }

    // parents must land before their children, so insert shallowest first
    for (const row of sortByDepth(subcategories)) {
      await trx
        .insertInto('subcategories')
        .values({
          id: row.id,
          categoryId: row.categoryId,
          parentId: row.parentId,
          code: row.code,
          name: row.name,
          description: row.description,
          status: row.status as Status,
        })
        .execute();
    }

    for (const row of materials) {
      await trx
        .insertInto('materials')
        .values({
          id: row.id,
          code: row.code,
          name: row.name,
          categoryId: row.categoryId,
          subcategoryId: row.subcategoryId,
          uom: row.uom,
          hsn: row.hsn,
          gst: row.gst,
          description: row.description,
          status: row.status as Status,
        })
        .execute();
    }

    // the explicit ids above bypassed the sequences, so the next INSERT
    // without an id would collide — fast-forward them past the imported rows
    for (const table of ['categories', 'subcategories', 'materials'] as const) {
      await sql`
        select setval(
          pg_get_serial_sequence(${table}, 'id'),
          greatest((select coalesce(max(id), 0) from ${sql.table(table)}), 1)
        )`.execute(trx);
    }

    this.logger.log(
      `imported ${categories.length} categories, ${subcategories.length} sub-categories ` +
        `and ${materials.length} materials from ${file}`,
    );
  }
}

/** Roots first, then their children, then theirs — so no FK points forward. */
function sortByDepth<T extends { id: number; parentId: number | null }>(
  rows: T[],
): T[] {
  const byParent = new Map<number | null, T[]>();
  for (const row of rows) {
    const siblings = byParent.get(row.parentId) ?? [];
    siblings.push(row);
    byParent.set(row.parentId, siblings);
  }

  const ordered: T[] = [];
  const walk = (parentId: number | null) => {
    for (const row of byParent.get(parentId) ?? []) {
      ordered.push(row);
      walk(row.id);
    }
  };
  walk(null);

  // anything unreachable had a broken parentId; append it so the insert fails
  // loudly rather than silently dropping the row
  if (ordered.length !== rows.length) {
    const seen = new Set(ordered.map((row) => row.id));
    ordered.push(...rows.filter((row) => !seen.has(row.id)));
  }

  return ordered;
}
