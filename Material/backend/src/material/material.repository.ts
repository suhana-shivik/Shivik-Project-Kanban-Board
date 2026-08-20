import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DbService } from '../database/db.service';
import { MaterialQueryDto } from './dto/material.dto';
import { Material, MaterialView, Status } from './entities';

export type MaterialWrite = Omit<Material, 'id'>;

/** Every statement that touches `materials` lives here. */
@Injectable()
export class MaterialRepository {
  constructor(private readonly database: DbService) {}

  private get db() {
    return this.database.db;
  }

  /** The parent names are resolved by the join rather than stored on the row. */
  private get selectMaterial() {
    return this.db
      .selectFrom('materials as m')
      .innerJoin('categories as c', 'c.id', 'm.categoryId')
      .leftJoin('subcategories as s', 's.id', 'm.subcategoryId')
      .select([
        'm.id',
        'm.code',
        'm.name',
        'm.categoryId',
        'm.subcategoryId',
        'm.uom',
        'm.hsn',
        'm.gst',
        'm.description',
        'm.status',
        'c.name as categoryName',
        's.name as subcategoryName',
      ]);
  }

  findAll(query: MaterialQueryDto): Promise<MaterialView[]> {
    return this.selectMaterial
      .$if(query.categoryId !== undefined, (qb) =>
        qb.where('m.categoryId', '=', query.categoryId!),
      )
      .$if(query.subcategoryId !== undefined, (qb) =>
        qb.where('m.subcategoryId', '=', query.subcategoryId!),
      )
      .$if(query.status !== undefined, (qb) =>
        qb.where('m.status', '=', query.status!),
      )
      .$if(query.uom !== undefined, (qb) =>
        qb.where(sql`lower(m.uom)`, '=', query.uom!.toLowerCase()),
      )
      .$if(query.query !== undefined, (qb) =>
        qb.where((eb) =>
          eb.or([
            eb('m.name', 'ilike', `%${query.query!}%`),
            eb('m.code', 'ilike', `%${query.query!}%`),
          ]),
        ),
      )
      .orderBy('m.code')
      .execute();
  }

  async findById(id: number): Promise<MaterialView | null> {
    const row = await this.selectMaterial
      .where('m.id', '=', id)
      .executeTakeFirst();

    return row ?? null;
  }

  async insert(data: MaterialWrite): Promise<number> {
    const row = await this.db
      .insertInto('materials')
      .values(data)
      .returning('id')
      .executeTakeFirstOrThrow();

    return row.id;
  }

  async update(id: number, data: MaterialWrite): Promise<void> {
    await this.db
      .updateTable('materials')
      .set(data)
      .where('id', '=', id)
      .execute();
  }

  async toggleStatus(id: number): Promise<Status> {
    const row = await this.db
      .updateTable('materials')
      .set({
        status: sql<Status>`case when status = 'Active' then 'Inactive' else 'Active' end`,
      })
      .where('id', '=', id)
      .returning('status')
      .executeTakeFirstOrThrow();

    return row.status;
  }

  async remove(id: number): Promise<void> {
    await this.db.deleteFrom('materials').where('id', '=', id).execute();
  }

  async codeTaken(code: string, excludeId?: number): Promise<boolean> {
    const row = await this.db
      .selectFrom('materials')
      .select('id')
      .where(sql`lower(code)`, '=', code.toLowerCase())
      .$if(excludeId !== undefined, (qb) => qb.where('id', '!=', excludeId!))
      .executeTakeFirst();

    return row !== undefined;
  }
}
