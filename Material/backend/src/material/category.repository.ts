import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DbService } from '../database/db.service';
import { CategoryQueryDto } from './dto/category.dto';
import { Category } from './entities';

export interface CategoryWrite {
  code: string | null;
  name: string;
  description: string | null;
  status: Category['status'];
}

const COLUMNS = ['id', 'code', 'name', 'description', 'status'] as const;

/** Every statement that touches `categories` lives here and nowhere else. */
@Injectable()
export class CategoryRepository {
  constructor(private readonly database: DbService) {}

  private get db() {
    return this.database.db;
  }

  findAll(query: CategoryQueryDto): Promise<Category[]> {
    return this.db
      .selectFrom('categories')
      .select(COLUMNS)
      .$if(query.status !== undefined, (qb) =>
        qb.where('status', '=', query.status!),
      )
      .$if(query.query !== undefined, (qb) =>
        qb.where((eb) =>
          eb.or([
            eb('name', 'ilike', `%${query.query!}%`),
            eb('code', 'ilike', `%${query.query!}%`),
          ]),
        ),
      )
      .orderBy('name')
      .execute();
  }

  async findById(id: number): Promise<Category | null> {
    const row = await this.db
      .selectFrom('categories')
      .select(COLUMNS)
      .where('id', '=', id)
      .executeTakeFirst();

    return row ?? null;
  }

  insert(data: CategoryWrite): Promise<Category> {
    return this.db
      .insertInto('categories')
      .values(data)
      .returning(COLUMNS)
      .executeTakeFirstOrThrow();
  }

  update(id: number, data: CategoryWrite): Promise<Category> {
    return this.db
      .updateTable('categories')
      .set(data)
      .where('id', '=', id)
      .returning(COLUMNS)
      .executeTakeFirstOrThrow();
  }

  async remove(id: number): Promise<void> {
    await this.db.deleteFrom('categories').where('id', '=', id).execute();
  }

  /** What still points at this category, so a delete can explain itself. */
  async countDependents(
    id: number,
  ): Promise<{ subcategories: number; materials: number }> {
    const row = await this.db
      .selectNoFrom((eb) => [
        eb
          .selectFrom('subcategories')
          .select(({ fn }) => fn.countAll<string>().as('n'))
          .where('categoryId', '=', id)
          .as('subcategories'),
        eb
          .selectFrom('materials')
          .select(({ fn }) => fn.countAll<string>().as('n'))
          .where('categoryId', '=', id)
          .as('materials'),
      ])
      .executeTakeFirstOrThrow();

    return {
      subcategories: Number(row.subcategories ?? 0),
      materials: Number(row.materials ?? 0),
    };
  }

  /**
   * Two indexed existence checks rather than one query filtered in JavaScript —
   * both ride the unique indexes on lower(name) and lower(code).
   */
  async findClashes(
    name: string,
    code: string | null,
    excludeId?: number,
  ): Promise<{ name: boolean; code: boolean }> {
    const taken = (column: 'name' | 'code', value: string) =>
      this.db
        .selectFrom('categories')
        .select('id')
        // matches the unique index, which is also on lower(...)
        .where(sql`lower(${sql.ref(column)})`, '=', value.toLowerCase())
        .$if(excludeId !== undefined, (qb) => qb.where('id', '!=', excludeId!))
        .executeTakeFirst();

    const [nameRow, codeRow] = await Promise.all([
      taken('name', name),
      code ? taken('code', code) : Promise.resolve(undefined),
    ]);

    return { name: nameRow !== undefined, code: codeRow !== undefined };
  }

  async exists(id: number): Promise<boolean> {
    const row = await this.db
      .selectFrom('categories')
      .select('id')
      .where('id', '=', id)
      .executeTakeFirst();

    return row !== undefined;
  }
}
