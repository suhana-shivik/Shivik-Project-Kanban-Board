import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { Status } from '../common/types';
import { DbService } from '../database/db.service';
import type { Db } from '../database/schema.types';
import { DepartmentQueryDto } from './dto/department.dto';

/** A department as the Departments table renders it. */
export interface DepartmentView {
  id: number;
  name: string;
  code: string | null;
  status: Status;
  parentId: number | null;
  /** `-` in the table when it is null. */
  parentName: string | null;
  /** 1 for a top-level department. */
  depth: number;
  /** Every ancestor down to this one, for a breadcrumb. */
  path: string[];
  userCount: number;
  childCount: number;
}

export interface DepartmentWrite {
  name: string;
  code: string | null;
  parentId: number | null;
  status: Status;
}

/**
 * Same shape as the sub-category tree: roots first, then their children,
 * carrying depth and path down as it goes.
 */
function withTree(db: Db) {
  return db.withRecursive('tree', (cte) =>
    cte
      .selectFrom('departments as d')
      .select([
        'd.id',
        'd.name',
        'd.code',
        'd.status',
        'd.parentId',
        sql<number>`1`.as('depth'),
        sql<string[]>`array[d.name]`.as('path'),
      ])
      .where('d.parentId', 'is', null)
      .unionAll(
        cte
          .selectFrom('departments as d')
          .innerJoin('tree as t', 't.id', 'd.parentId')
          .select([
            'd.id',
            'd.name',
            'd.code',
            'd.status',
            'd.parentId',
            sql<number>`t.depth + 1`.as('depth'),
            sql<string[]>`t.path || d.name`.as('path'),
          ]),
      ),
  );
}

@Injectable()
export class DepartmentsRepository {
  constructor(private readonly database: DbService) {}

  private get db() {
    return this.database.db;
  }

  private get selectTree() {
    return withTree(this.db)
      .selectFrom('tree as t')
      .leftJoin('departments as p', 'p.id', 't.parentId')
      .select((eb) => [
        't.id',
        't.name',
        't.code',
        't.status',
        't.parentId',
        't.depth',
        't.path',
        'p.name as parentName',
        eb
          .selectFrom('userDepartments')
          .select(({ fn }) => fn.countAll<string>().as('n'))
          .whereRef('userDepartments.departmentId', '=', 't.id')
          .as('userCount'),
        eb
          .selectFrom('departments as c')
          .select(({ fn }) => fn.countAll<string>().as('n'))
          .whereRef('c.parentId', '=', 't.id')
          .as('childCount'),
      ]);
  }

  async findAll(query: DepartmentQueryDto): Promise<DepartmentView[]> {
    const rows = await this.selectTree
      .$if(query.status !== undefined, (qb) =>
        qb.where('t.status', '=', query.status!),
      )
      .$if(query.parentId !== undefined, (qb) =>
        qb.where('t.parentId', '=', query.parentId!),
      )
      .$if(query.query !== undefined, (qb) =>
        qb.where((eb) =>
          eb.or([
            eb('t.name', 'ilike', `%${query.query!}%`),
            eb('t.code', 'ilike', `%${query.query!}%`),
          ]),
        ),
      )
      .orderBy(sql`array_to_string(t.path, '/')`)
      .execute();

    return rows.map(toView);
  }

  async findById(id: number): Promise<DepartmentView | null> {
    const row = await this.selectTree.where('t.id', '=', id).executeTakeFirst();
    return row ? toView(row) : null;
  }

  async insert(data: DepartmentWrite): Promise<number> {
    const row = await this.db
      .insertInto('departments')
      .values(data)
      .returning('id')
      .executeTakeFirstOrThrow();

    return row.id;
  }

  async update(id: number, data: DepartmentWrite): Promise<void> {
    await this.db
      .updateTable('departments')
      .set(data)
      .where('id', '=', id)
      .execute();
  }

  async remove(id: number): Promise<void> {
    await this.db.deleteFrom('departments').where('id', '=', id).execute();
  }

  async exists(id: number): Promise<boolean> {
    const row = await this.db
      .selectFrom('departments')
      .select('id')
      .where('id', '=', id)
      .executeTakeFirst();

    return row !== undefined;
  }

  async nameTaken(name: string, excludeId?: number): Promise<boolean> {
    const row = await this.db
      .selectFrom('departments')
      .select('id')
      .where(sql`lower(name)`, '=', name.toLowerCase())
      .$if(excludeId !== undefined, (qb) => qb.where('id', '!=', excludeId!))
      .executeTakeFirst();

    return row !== undefined;
  }

  /** Walks up from `candidateId` looking for `ancestorId`. */
  async isDescendantOf(
    candidateId: number,
    ancestorId: number,
  ): Promise<boolean> {
    const row = await this.db
      .withRecursive('ancestors', (cte) =>
        cte
          .selectFrom('departments')
          .select(['id', 'parentId'])
          .where('id', '=', candidateId)
          .union(
            cte
              .selectFrom('departments as d')
              .innerJoin('ancestors as a', 'a.parentId', 'd.id')
              .select(['d.id', 'd.parentId']),
          ),
      )
      .selectFrom('ancestors')
      .select('id')
      .where('id', '=', ancestorId)
      .executeTakeFirst();

    return row !== undefined;
  }
}

/** The two counts arrive as strings from pg's bigint mapping. */
function toView(row: {
  id: number;
  name: string;
  code: string | null;
  status: Status;
  parentId: number | null;
  parentName: string | null;
  depth: number;
  path: string[];
  userCount: string | null;
  childCount: string | null;
}): DepartmentView {
  return {
    ...row,
    userCount: Number(row.userCount ?? 0),
    childCount: Number(row.childCount ?? 0),
  };
}
