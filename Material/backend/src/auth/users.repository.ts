import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import { Lookup, Status } from '../common/types';
import { DbService } from '../database/db.service';
import type { DbOrTrx } from '../database/schema.types';
import { fileUrl } from '../uploads/upload.config';
import { Permission, Role } from './roles';
import { UserView } from './user.entity';

/** Fields shared by insert and update, already resolved from the DTO. */
export interface UserWrite {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: Role;
  status: Status;
  /** undefined leaves the stored value alone; null clears it. */
  passwordHash?: string;
  profileImage?: string | null;
  signature?: string | null;
  projectIds?: number[];
  departmentIds?: number[];
  managerIds?: number[];
}

export interface UserFilter {
  query?: string;
  role?: Role;
  status?: Status;
}

/** Which join table each multi-select writes to. */
const LINKS = {
  projectIds: {
    table: 'userProjects',
    column: 'projectId',
    source: 'projects',
  },
  departmentIds: {
    table: 'userDepartments',
    column: 'departmentId',
    source: 'departments',
  },
  managerIds: {
    table: 'userManagers',
    column: 'managerId',
    source: 'users',
  },
} as const;

type LinkField = keyof typeof LINKS;

@Injectable()
export class UsersRepository {
  constructor(private readonly database: DbService) {}

  private get db() {
    return this.database.db;
  }

  /**
   * The three multi-selects come back as JSON arrays from correlated
   * sub-queries, so one round trip returns a whole user — no N+1 per
   * department or project. `passwordHash` is deliberately absent; only
   * findCredentials selects it.
   *
   * Permissions are expanded from the role's grid in the same query: each
   * module row fans out into up to four `module:action` strings, and a toggle
   * that is off simply produces nothing.
   */
  private get selectUser() {
    return this.db
      .selectFrom('users as u')
      .leftJoin('roles as r', 'r.slug', 'u.role')
      .select((eb) => [
        'u.id',
        'u.firstName',
        'u.lastName',
        'u.email',
        'u.phone',
        'u.role',
        'u.status',
        'u.profileImage',
        'u.signature',
        'u.createdAt',
        'u.updatedAt',
        'r.name as roleName',
        'r.color as roleColor',
        jsonArrayFrom(
          eb
            .selectFrom('userDepartments as ud')
            .innerJoin('departments as d', 'd.id', 'ud.departmentId')
            .select(['d.id', 'd.name', 'd.code', 'd.status'])
            .whereRef('ud.userId', '=', 'u.id')
            .orderBy('d.name'),
        ).as('departments'),
        jsonArrayFrom(
          eb
            .selectFrom('userProjects as up')
            .innerJoin('projects as p', 'p.id', 'up.projectId')
            .select(['p.id', 'p.name', 'p.code', 'p.status'])
            .whereRef('up.userId', '=', 'u.id')
            .orderBy('p.name'),
        ).as('projects'),
        jsonArrayFrom(
          eb
            .selectFrom('userManagers as um')
            .innerJoin('users as mu', 'mu.id', 'um.managerId')
            .select([
              'mu.id',
              sql<string>`mu.first_name || ' ' || mu.last_name`.as('name'),
              'mu.email',
              'mu.role',
            ])
            .whereRef('um.userId', '=', 'u.id')
            .orderBy('mu.firstName')
            .orderBy('mu.lastName'),
        ).as('reportingTo'),
        jsonArrayFrom(
          eb
            .selectFrom('rolePermissions as rp')
            .innerJoin('modules as mo', 'mo.id', 'rp.moduleId')
            .select(
              sql<Permission>`unnest(array_remove(array[
                 case when rp.can_read   then mo.key || ':read'   end,
                 case when rp.can_write  then mo.key || ':create' end,
                 case when rp.can_update then mo.key || ':update' end,
                 case when rp.can_delete then mo.key || ':delete' end
               ], null))`.as('name'),
            )
            .whereRef('rp.roleId', '=', 'r.id'),
        ).as('permissionRows'),
      ]);
  }

  async findAll(filter: UserFilter): Promise<UserView[]> {
    const rows = await this.selectUser
      .$if(filter.role !== undefined, (qb) =>
        qb.where('u.role', '=', filter.role!),
      )
      .$if(filter.status !== undefined, (qb) =>
        qb.where('u.status', '=', filter.status!),
      )
      .$if(filter.query !== undefined, (qb) =>
        qb.where((eb) =>
          eb.or([
            eb('u.firstName', 'ilike', `%${filter.query!}%`),
            eb('u.lastName', 'ilike', `%${filter.query!}%`),
            eb('u.email', 'ilike', `%${filter.query!}%`),
          ]),
        ),
      )
      .orderBy('u.firstName')
      .orderBy('u.lastName')
      .execute();

    return rows.map(toUserView);
  }

  async findById(id: number): Promise<UserView | null> {
    const row = await this.selectUser.where('u.id', '=', id).executeTakeFirst();
    return row ? toUserView(row) : null;
  }

  /**
   * What the guard needs on every request: the role and status as they are
   * *now*, not as they were when the token was minted. Costs one indexed
   * lookup and buys immediate effect for a role change or a deactivation.
   */
  async findAuthContext(id: number): Promise<{
    role: Role;
    status: Status;
    email: string;
    name: string;
  } | null> {
    const row = await this.db
      .selectFrom('users')
      .select([
        'role',
        'status',
        'email',
        sql<string>`first_name || ' ' || last_name`.as('name'),
      ])
      .where('id', '=', id)
      .executeTakeFirst();

    return row ?? null;
  }

  /** The only read that touches passwordHash. */
  async findCredentials(email: string): Promise<{
    id: number;
    passwordHash: string;
    status: Status;
  } | null> {
    const row = await this.db
      .selectFrom('users')
      .select(['id', 'passwordHash', 'status'])
      .where(sql`lower(email)`, '=', email.toLowerCase())
      .executeTakeFirst();

    return row ?? null;
  }

  async emailTaken(email: string, excludeId?: number): Promise<boolean> {
    const row = await this.db
      .selectFrom('users')
      .select('id')
      .where(sql`lower(email)`, '=', email.toLowerCase())
      .$if(excludeId !== undefined, (qb) => qb.where('id', '!=', excludeId!))
      .executeTakeFirst();

    return row !== undefined;
  }

  /** The user plus its three link tables, in one transaction. */
  async insert(data: UserWrite): Promise<number> {
    return this.database.tx(async (trx) => {
      const row = await trx
        .insertInto('users')
        .values({
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          passwordHash: data.passwordHash!,
          role: data.role,
          status: data.status,
          profileImage: data.profileImage ?? null,
          signature: data.signature ?? null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      await this.writeLinks(trx, row.id, data);
      return row.id;
    });
  }

  async update(id: number, data: UserWrite): Promise<void> {
    await this.database.tx(async (trx) => {
      await trx
        .updateTable('users')
        .set({
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          role: data.role,
          status: data.status,
          updatedAt: sql`now()`,
          // an omitted password or image leaves the stored one alone
          ...(data.passwordHash ? { passwordHash: data.passwordHash } : {}),
          ...(data.profileImage ? { profileImage: data.profileImage } : {}),
          ...(data.signature ? { signature: data.signature } : {}),
        })
        .where('id', '=', id)
        .execute();

      await this.writeLinks(trx, id, data);
    });
  }

  async setRole(id: number, role: Role): Promise<void> {
    await this.db
      .updateTable('users')
      .set({ role, updatedAt: sql`now()` })
      .where('id', '=', id)
      .execute();
  }

  /** Returns the status it landed on. */
  async toggleStatus(id: number): Promise<Status> {
    const row = await this.db
      .updateTable('users')
      .set({
        status: sql<Status>`case when status = 'Active' then 'Inactive' else 'Active' end`,
        updatedAt: sql`now()`,
      })
      .where('id', '=', id)
      .returning('status')
      .executeTakeFirstOrThrow();

    return row.status;
  }

  async setPassword(id: number, passwordHash: string): Promise<void> {
    await this.db
      .updateTable('users')
      .set({ passwordHash, updatedAt: sql`now()` })
      .where('id', '=', id)
      .execute();
  }

  async remove(id: number): Promise<void> {
    // the join tables are ON DELETE CASCADE, including any row where this
    // user was someone else's manager
    await this.db.deleteFrom('users').where('id', '=', id).execute();
  }

  /**
   * How many other active people could still manage users. Asked by permission
   * rather than by role name, so a custom role granted user:update counts too.
   */
  async countOtherUserAdmins(excludeId: number): Promise<number> {
    const row = await this.db
      .selectFrom('users as u')
      .innerJoin('roles as r', 'r.slug', 'u.role')
      .innerJoin('rolePermissions as rp', 'rp.roleId', 'r.id')
      .innerJoin('modules as m', 'm.id', 'rp.moduleId')
      .select(({ fn }) => fn.count<string>('u.id').distinct().as('total'))
      .where('u.status', '=', 'Active')
      .where('u.id', '!=', excludeId)
      .where('m.key', '=', 'user')
      .where('rp.canUpdate', '=', true)
      .executeTakeFirst();

    return Number(row?.total ?? 0);
  }

  /** Ids that were asked for but do not exist, so the error can list them. */
  async missingIds(field: LinkField, ids: number[]): Promise<number[]> {
    if (!ids.length) return [];

    // the table name is picked from a fixed map, never from the request
    const rows = await this.db
      .selectFrom(LINKS[field].source)
      .select('id')
      .where('id', 'in', ids)
      .execute();

    const found = new Set(rows.map((row) => row.id));
    return ids.filter((id) => !found.has(id));
  }

  listDepartments(): Promise<Lookup[]> {
    return this.db
      .selectFrom('departments')
      .select(['id', 'name', 'code', 'status'])
      .orderBy('name')
      .execute();
  }

  listProjects(): Promise<Lookup[]> {
    return this.db
      .selectFrom('projects')
      .select(['id', 'name', 'code', 'status'])
      .orderBy('name')
      .execute();
  }

  /**
   * Replaces each supplied list wholesale; an omitted field is left untouched.
   * Callers decide which they mean — POST /users and PUT /users/:id both pass
   * explicit arrays, so for them an empty list really does clear the links.
   */
  private async writeLinks(
    trx: DbOrTrx,
    userId: number,
    data: UserWrite,
  ): Promise<void> {
    for (const field of Object.keys(LINKS) as LinkField[]) {
      const ids = data[field];
      if (ids === undefined) continue;

      const { table, column } = LINKS[field];
      await trx.deleteFrom(table).where('userId', '=', userId).execute();

      // a user reporting to themselves is blocked by a CHECK constraint, so
      // drop it here rather than let the insert blow up
      const clean = ids.filter((id) => field !== 'managerIds' || id !== userId);
      if (!clean.length) continue;

      await trx
        .insertInto(table)
        .values(clean.map((id) => ({ userId, [column]: id })))
        .onConflict((oc) => oc.doNothing())
        .execute();
    }
  }
}

function toUserView(row: {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: Role;
  roleName: string | null;
  roleColor: string | null;
  status: Status;
  profileImage: string | null;
  signature: string | null;
  createdAt: Date;
  updatedAt: Date;
  departments: Lookup[];
  projects: Lookup[];
  reportingTo: { id: number; name: string; email: string; role: string }[];
  permissionRows: { name: Permission }[];
}): UserView {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    name: `${row.firstName} ${row.lastName}`.trim(),
    email: row.email,
    phone: row.phone,
    role: row.role,
    roleName: row.roleName,
    roleColor: row.roleColor,
    status: row.status,
    profileImage: row.profileImage,
    signature: row.signature,
    profileImageUrl: fileUrl(row.profileImage),
    signatureUrl: fileUrl(row.signature),
    departments: row.departments,
    projects: row.projects,
    reportingTo: row.reportingTo,
    permissions: row.permissionRows
      .map((permission) => permission.name)
      .sort((a, b) => a.localeCompare(b)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
