import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DbService } from '../database/db.service';
import type { Db } from '../database/schema.types';
import { SubcategoryQueryDto } from './dto/category.dto';
import { Subcategory, SubcategoryView } from './entities';

export interface SubcategoryWrite {
  categoryId: number;
  parentId: number | null;
  code: string | null;
  name: string;
  description: string | null;
  status: Subcategory['status'];
}

/**
 * Walks the tree top-down, carrying `depth` and `path` as it goes, so a client
 * can render the hierarchy without following parentId itself. Roots start at
 * depth 1 with the category name already in the path.
 *
 * The array expressions have no query-builder equivalent, so they are `sql`
 * fragments — and inside those the column names must be spelled the way
 * PostgreSQL has them, since CamelCasePlugin does not reach into raw SQL.
 */
function withTree(db: Db) {
  return db.withRecursive('tree', (cte) =>
    cte
      .selectFrom('subcategories as s')
      .innerJoin('categories as c', 'c.id', 's.categoryId')
      .select([
        's.id',
        's.categoryId',
        's.parentId',
        's.code',
        's.name',
        's.description',
        's.status',
        sql<number>`1`.as('depth'),
        sql<string[]>`array[c.name, s.name]`.as('path'),
      ])
      .where('s.parentId', 'is', null)
      .unionAll(
        cte
          .selectFrom('subcategories as s')
          .innerJoin('tree as t', 't.id', 's.parentId')
          .select([
            's.id',
            's.categoryId',
            's.parentId',
            's.code',
            's.name',
            's.description',
            's.status',
            sql<number>`t.depth + 1`.as('depth'),
            sql<string[]>`t.path || s.name`.as('path'),
          ]),
      ),
  );
}

/** Every statement that touches `subcategories` lives here. */
@Injectable()
export class SubcategoryRepository {
  constructor(private readonly database: DbService) {}

  private get db() {
    return this.database.db;
  }

  private get selectTree() {
    return withTree(this.db)
      .selectFrom('tree as t')
      .innerJoin('categories as c', 'c.id', 't.categoryId')
      .leftJoin('subcategories as p', 'p.id', 't.parentId')
      .select([
        't.id',
        't.categoryId',
        't.parentId',
        't.code',
        't.name',
        't.description',
        't.status',
        't.depth',
        't.path',
        'c.name as categoryName',
        'p.name as parentName',
      ]);
  }

  findAll(query: SubcategoryQueryDto): Promise<SubcategoryView[]> {
    return this.selectTree
      .$if(query.categoryId !== undefined, (qb) =>
        qb.where('t.categoryId', '=', query.categoryId!),
      )
      .$if(query.parentId !== undefined, (qb) =>
        qb.where('t.parentId', '=', query.parentId!),
      )
      .$if(query.rootOnly === true, (qb) => qb.where('t.parentId', 'is', null))
      .$if(query.status !== undefined, (qb) =>
        qb.where('t.status', '=', query.status!),
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
  }

  async findById(id: number): Promise<SubcategoryView | null> {
    const row = await this.selectTree.where('t.id', '=', id).executeTakeFirst();
    return row ?? null;
  }

  async insert(data: SubcategoryWrite): Promise<number> {
    const row = await this.db
      .insertInto('subcategories')
      .values(data)
      .returning('id')
      .executeTakeFirstOrThrow();

    return row.id;
  }

  async update(id: number, data: SubcategoryWrite): Promise<void> {
    await this.db
      .updateTable('subcategories')
      .set(data)
      .where('id', '=', id)
      .execute();
  }

  async remove(id: number): Promise<void> {
    await this.db.deleteFrom('subcategories').where('id', '=', id).execute();
  }

  /** The category a sub-category belongs to, or null when it does not exist. */
  async categoryOf(id: number): Promise<number | null> {
    const row = await this.db
      .selectFrom('subcategories')
      .select('categoryId')
      .where('id', '=', id)
      .executeTakeFirst();

    return row?.categoryId ?? null;
  }

  async countDependents(
    id: number,
  ): Promise<{ children: number; materials: number }> {
    const row = await this.db
      .selectNoFrom((eb) => [
        eb
          .selectFrom('subcategories')
          .select(({ fn }) => fn.countAll<string>().as('n'))
          .where('parentId', '=', id)
          .as('children'),
        eb
          .selectFrom('materials')
          .select(({ fn }) => fn.countAll<string>().as('n'))
          .where('subcategoryId', '=', id)
          .as('materials'),
      ])
      .executeTakeFirstOrThrow();

    return {
      children: Number(row.children ?? 0),
      materials: Number(row.materials ?? 0),
    };
  }

  /** Walks up from `candidateId` looking for `ancestorId`. */
  async isDescendantOf(
    candidateId: number,
    ancestorId: number,
  ): Promise<boolean> {
    const row = await this.db
      .withRecursive('ancestors', (cte) =>
        cte
          .selectFrom('subcategories')
          .select(['id', 'parentId'])
          .where('id', '=', candidateId)
          .union(
            cte
              .selectFrom('subcategories as s')
              .innerJoin('ancestors as a', 'a.parentId', 's.id')
              .select(['s.id', 's.parentId']),
          ),
      )
      .selectFrom('ancestors')
      .select('id')
      .where('id', '=', ancestorId)
      .executeTakeFirst();

    return row !== undefined;
  }

  /**
   * Mirrors the partial unique indexes on the table. Checking here is what
   * turns a raw constraint violation into a named field error.
   */
  async findClashes(
    name: string,
    code: string | null,
    categoryId: number,
    parentId: number | null,
    excludeId?: number,
  ): Promise<{ sibling: boolean; code: boolean }> {
    // a name only has to be unique among its own siblings
    const sibling = this.db
      .selectFrom('subcategories')
      .select('id')
      .where(sql`lower(name)`, '=', name.toLowerCase())
      .where('categoryId', '=', categoryId)
      // IS NOT DISTINCT FROM: a null parent has to match another null parent,
      // which a plain `=` never would
      .where('parentId', parentId === null ? 'is' : '=', parentId)
      .$if(excludeId !== undefined, (qb) => qb.where('id', '!=', excludeId!))
      .executeTakeFirst();

    const codeClash = code
      ? this.db
          .selectFrom('subcategories')
          .select('id')
          .where(sql`lower(code)`, '=', code.toLowerCase())
          .$if(excludeId !== undefined, (qb) =>
            qb.where('id', '!=', excludeId!),
          )
          .executeTakeFirst()
      : Promise.resolve(undefined);

    const [siblingRow, codeRow] = await Promise.all([sibling, codeClash]);

    return { sibling: siblingRow !== undefined, code: codeRow !== undefined };
  }
}
