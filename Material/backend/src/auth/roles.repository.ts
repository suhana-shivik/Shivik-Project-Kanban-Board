import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DbService } from '../database/db.service';
import { COLUMN_ACTIONS, Permission, permissionOf } from './roles';

export interface RoleRow {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  isSystem: boolean;
  /** pg returns count() as a string. */
  userCount: string | null;
  moduleCount: string | null;
}

export interface ModuleRow {
  id: number;
  key: string;
  name: string;
  moduleGroup: string;
  sortOrder: number;
}

/** One line of the "Configured Permissions" grid. */
export interface PermissionRow {
  moduleId: number;
  key: string;
  name: string;
  moduleGroup: string;
  canRead: boolean;
  canWrite: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export interface PermissionInput {
  moduleId: number;
  read?: boolean;
  write?: boolean;
  update?: boolean;
  delete?: boolean;
}

@Injectable()
export class RolesRepository {
  constructor(private readonly database: DbService) {}

  private get db() {
    return this.database.db;
  }

  private get selectRole() {
    return this.db.selectFrom('roles as r').select((eb) => [
      'r.id',
      'r.name',
      'r.slug',
      'r.description',
      'r.color',
      'r.isSystem',
      eb
        .selectFrom('users as u')
        .select(({ fn }) => fn.countAll<string>().as('n'))
        .whereRef('u.role', '=', 'r.slug')
        .as('userCount'),
      eb
        .selectFrom('rolePermissions as rp')
        .select(({ fn }) => fn.countAll<string>().as('n'))
        .whereRef('rp.roleId', '=', 'r.id')
        .as('moduleCount'),
    ]);
  }

  findAll(search?: string): Promise<RoleRow[]> {
    return this.selectRole
      .$if(search !== undefined, (qb) =>
        qb.where('r.name', 'ilike', `%${search!}%`),
      )
      .orderBy('r.isSystem', 'desc')
      .orderBy('r.name')
      .execute();
  }

  async findById(id: number): Promise<RoleRow | null> {
    const row = await this.selectRole.where('r.id', '=', id).executeTakeFirst();
    return row ?? null;
  }

  async findBySlug(slug: string): Promise<RoleRow | null> {
    const row = await this.selectRole
      .where('r.slug', '=', slug)
      .executeTakeFirst();
    return row ?? null;
  }

  async nameTaken(name: string, excludeId?: number): Promise<boolean> {
    const row = await this.db
      .selectFrom('roles')
      .select('id')
      .where(sql`lower(name)`, '=', name.toLowerCase())
      .$if(excludeId !== undefined, (qb) => qb.where('id', '!=', excludeId!))
      .executeTakeFirst();

    return row !== undefined;
  }

  async slugTaken(slug: string, excludeId?: number): Promise<boolean> {
    const row = await this.db
      .selectFrom('roles')
      .select('id')
      .where('slug', '=', slug)
      .$if(excludeId !== undefined, (qb) => qb.where('id', '!=', excludeId!))
      .executeTakeFirst();

    return row !== undefined;
  }

  async insert(data: {
    name: string;
    slug: string;
    description: string | null;
    color: string;
  }): Promise<number> {
    const row = await this.db
      .insertInto('roles')
      .values(data)
      .returning('id')
      .executeTakeFirstOrThrow();

    return row.id;
  }

  async update(
    id: number,
    data: {
      name: string;
      slug: string;
      description: string | null;
      color: string;
    },
  ): Promise<void> {
    // the slug change cascades to users.role through the foreign key
    await this.db
      .updateTable('roles')
      .set({ ...data, updatedAt: sql`now()` })
      .where('id', '=', id)
      .execute();
  }

  async remove(id: number): Promise<void> {
    await this.db.deleteFrom('roles').where('id', '=', id).execute();
  }

  listModules(): Promise<ModuleRow[]> {
    return this.db
      .selectFrom('modules')
      .select(['id', 'key', 'name', 'moduleGroup', 'sortOrder'])
      .orderBy('sortOrder')
      .orderBy('name')
      .execute();
  }

  async moduleById(id: number): Promise<ModuleRow | null> {
    const row = await this.db
      .selectFrom('modules')
      .select(['id', 'key', 'name', 'moduleGroup', 'sortOrder'])
      .where('id', '=', id)
      .executeTakeFirst();

    return row ?? null;
  }

  /** The grid for one role, in the order the UI renders it. */
  permissionsOf(roleId: number): Promise<PermissionRow[]> {
    return this.db
      .selectFrom('rolePermissions as rp')
      .innerJoin('modules as m', 'm.id', 'rp.moduleId')
      .select([
        'm.id as moduleId',
        'm.key',
        'm.name',
        'm.moduleGroup',
        'rp.canRead',
        'rp.canWrite',
        'rp.canUpdate',
        'rp.canDelete',
      ])
      .where('rp.roleId', '=', roleId)
      .orderBy('m.sortOrder')
      .orderBy('m.name')
      .execute();
  }

  /** SUBMIT PERMISSIONS: the posted grid becomes the whole grid. */
  async replacePermissions(
    roleId: number,
    rows: PermissionInput[],
  ): Promise<void> {
    await this.database.tx(async (trx) => {
      await trx
        .deleteFrom('rolePermissions')
        .where('roleId', '=', roleId)
        .execute();

      if (!rows.length) return;

      await trx
        .insertInto('rolePermissions')
        .values(rows.map((row) => toColumns(roleId, row)))
        .execute();
    });
  }

  /** ADD PERMISSION: one module row, upserted so re-adding just updates it. */
  async upsertPermission(roleId: number, row: PermissionInput): Promise<void> {
    await this.db
      .insertInto('rolePermissions')
      .values(toColumns(roleId, row))
      .onConflict((oc) =>
        oc.columns(['roleId', 'moduleId']).doUpdateSet({
          canRead: (eb) => eb.ref('excluded.canRead'),
          canWrite: (eb) => eb.ref('excluded.canWrite'),
          canUpdate: (eb) => eb.ref('excluded.canUpdate'),
          canDelete: (eb) => eb.ref('excluded.canDelete'),
        }),
      )
      .execute();
  }

  /** The trash icon on a grid row. */
  async removePermission(roleId: number, moduleId: number): Promise<number> {
    const result = await this.db
      .deleteFrom('rolePermissions')
      .where('roleId', '=', roleId)
      .where('moduleId', '=', moduleId)
      .executeTakeFirst();

    return Number(result.numDeletedRows);
  }

  /**
   * Every role's permission strings in one query — what the guard cache is
   * built from. A toggle that is off simply does not produce a string.
   */
  async permissionMap(): Promise<Map<string, Permission[]>> {
    const rows = await this.db
      .selectFrom('roles as r')
      .leftJoin('rolePermissions as rp', 'rp.roleId', 'r.id')
      .leftJoin('modules as m', 'm.id', 'rp.moduleId')
      .select([
        'r.slug',
        'm.key',
        'rp.canRead',
        'rp.canWrite',
        'rp.canUpdate',
        'rp.canDelete',
      ])
      .execute();

    const map = new Map<string, Permission[]>();

    for (const row of rows) {
      const held = map.get(row.slug) ?? [];

      // LEFT JOIN: a role with no configured modules still gets an entry, so
      // the guard can tell "no permissions" from "unknown role"
      if (row.key) {
        for (const [column, action] of entries(COLUMN_ACTIONS)) {
          if (row[column]) held.push(permissionOf(row.key, action));
        }
      }
      map.set(row.slug, held);
    }

    return map;
  }

  /** Does this role hold update rights on a given module? */
  async grantsUpdate(slug: string, moduleKey: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('roles as r')
      .innerJoin('rolePermissions as rp', 'rp.roleId', 'r.id')
      .innerJoin('modules as m', 'm.id', 'rp.moduleId')
      .select('r.id')
      .where('r.slug', '=', slug)
      .where('m.key', '=', moduleKey)
      .where('rp.canUpdate', '=', true)
      .executeTakeFirst();

    return row !== undefined;
  }

  /** Guards against deleting the last role that can still manage roles. */
  async countOtherRoleAdmins(excludeRoleId: number): Promise<number> {
    const row = await this.db
      .selectFrom('users as u')
      .innerJoin('roles as r', 'r.slug', 'u.role')
      .innerJoin('rolePermissions as rp', 'rp.roleId', 'r.id')
      .innerJoin('modules as m', 'm.id', 'rp.moduleId')
      .select(({ fn }) => fn.count<string>('u.id').distinct().as('total'))
      .where('u.status', '=', 'Active')
      .where('m.key', '=', 'role')
      .where('rp.canUpdate', '=', true)
      .where('r.id', '!=', excludeRoleId)
      .executeTakeFirst();

    return Number(row?.total ?? 0);
  }
}

/** Object.entries, but keeping the literal key type instead of widening it. */
function entries<T extends object>(object: T): [keyof T, T[keyof T]][] {
  return Object.entries(object) as [keyof T, T[keyof T]][];
}

function toColumns(roleId: number, row: PermissionInput) {
  return {
    roleId,
    moduleId: row.moduleId,
    canRead: row.read ?? false,
    canWrite: row.write ?? false,
    canUpdate: row.update ?? false,
    canDelete: row.delete ?? false,
  };
}
