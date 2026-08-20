import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FieldErrors, NotFoundError, ValidationError } from '../common/errors';
import { toFieldErrors } from '../common/validation';
import { CacheKey, CacheTtl, fingerprint } from '../redis/cache.keys';
import { RedisService } from '../redis/redis.service';
import { CategoryRepository } from './category.repository';
import { CreateMaterialDto, MaterialQueryDto } from './dto/material.dto';
import { MaterialView, Status } from './entities';
import { MaterialRepository, MaterialWrite } from './material.repository';
import { SubcategoryRepository } from './subcategory.repository';
import { normalizeUom } from './uom';

export interface BulkImportResult {
  added: MaterialView[];
  failed: { row: unknown; errors: FieldErrors }[];
}

@Injectable()
export class MaterialService {
  constructor(
    private readonly materials: MaterialRepository,
    private readonly categories: CategoryRepository,
    private readonly subcategories: SubcategoryRepository,
    private readonly redis: RedisService,
  ) {}

  /**
   * The hottest read in the app, so it is cached per filter combination.
   * `remember` collapses simultaneous misses into one query — without that,
   * a burst arriving just after an invalidation would all hit PostgreSQL.
   */
  findAll(query: MaterialQueryDto): Promise<MaterialView[]> {
    return this.redis.remember(
      CacheKey.materialList(fingerprint({ ...query })),
      CacheTtl.materialList,
      () => this.materials.findAll(query),
    );
  }

  /**
   * Every filter combination is its own key, so one write clears the family.
   * Called only after the write has committed.
   */
  private invalidateList(): Promise<number> {
    return this.redis.invalidatePattern(CacheKey.materialListPattern);
  }

  async findOne(id: number): Promise<MaterialView> {
    const material = await this.materials.findById(id);
    if (!material) throw NotFoundError.of('Material', id);
    return material;
  }

  async create(row: unknown): Promise<MaterialView> {
    const { resolved, errors } = await this.validate(row);
    if (!resolved) throw new ValidationError(errors);
    return this.insert(resolved);
  }

  async replace(id: number, row: unknown): Promise<MaterialView> {
    await this.findOne(id);

    // the code uniqueness check ignores the row being edited
    const { resolved, errors } = await this.validate(row, id);
    if (!resolved) throw new ValidationError(errors);

    await this.materials.update(id, resolved);
    await this.invalidateList();
    return this.findOne(id);
  }

  async toggleStatus(id: number): Promise<{ id: number; status: Status }> {
    await this.findOne(id);
    const status = await this.materials.toggleStatus(id);
    await this.invalidateList();
    return { id, status };
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.materials.remove(id);
    await this.invalidateList();
  }

  /**
   * Validates every row independently and reports per-row outcomes, so one bad
   * line in a CSV does not reject the whole file.
   */
  async bulkImport(rows: unknown[]): Promise<BulkImportResult> {
    const result: BulkImportResult = { added: [], failed: [] };

    for (const row of rows) {
      // validate() re-queries each time, so a code added by an earlier row in
      // this same batch is already visible as a duplicate
      const { resolved, errors } = await this.validate(row);

      if (!resolved) {
        result.failed.push({ row, errors });
        continue;
      }

      result.added.push(await this.insert(resolved));
    }

    return result;
  }

  /**
   * Runs both passes and merges them, so one response can report a missing
   * name, an unknown unit and a duplicate code together rather than one at a
   * time. Shape errors win per field — they are the more basic complaint.
   */
  private async validate(
    row: unknown,
    excludeId?: number,
  ): Promise<{ resolved?: MaterialWrite; errors: FieldErrors }> {
    const dto = plainToInstance(CreateMaterialDto, row);
    const schemaErrors = toFieldErrors(
      await validate(dto, { whitelist: true }),
    );

    const { resolved, errors } = await this.resolve(dto, excludeId);
    const merged = { ...errors, ...schemaErrors };

    if (Object.keys(merged).length) return { errors: merged };
    return { resolved, errors: merged };
  }

  private async insert(resolved: MaterialWrite): Promise<MaterialView> {
    const id = await this.materials.insert(resolved);
    await this.invalidateList();
    return this.findOne(id);
  }

  /**
   * Business rules the DTO decorators cannot express: the unit must be known,
   * the category must exist, and a sub-category must belong to that category.
   * Collects every problem at once rather than failing on the first.
   */
  private async resolve(
    dto: CreateMaterialDto,
    excludeId?: number,
  ): Promise<{ resolved?: MaterialWrite; errors: FieldErrors }> {
    const errors: FieldErrors = {};

    const uom = normalizeUom(dto.uom ?? '');
    if (!uom) errors.uom = 'Unrecognized unit of measure';

    let categoryId = dto.categoryId ?? null;
    const subcategoryId = dto.subcategoryId ?? null;

    if (subcategoryId !== null) {
      const parentCategoryId =
        await this.subcategories.categoryOf(subcategoryId);

      if (parentCategoryId === null) {
        errors.subcategoryId = 'Selected sub-category does not exist';
      } else if (categoryId !== null && parentCategoryId !== categoryId) {
        errors.subcategoryId =
          'Selected sub-category does not belong to the selected category';
      } else {
        categoryId = parentCategoryId;
      }
    } else if (categoryId === null) {
      errors.categoryId = 'Category is required';
    } else if (!(await this.categories.exists(categoryId))) {
      errors.categoryId = 'Selected category does not exist';
    }

    if (dto.code && (await this.materials.codeTaken(dto.code, excludeId))) {
      errors.code = 'This item code already exists';
    }

    if (Object.keys(errors).length) return { errors };

    return {
      errors,
      resolved: {
        code: dto.code,
        name: dto.name,
        categoryId: categoryId as number,
        subcategoryId,
        uom: uom as string,
        hsn: dto.hsn ?? '-',
        gst: dto.gst ?? '-',
        description: dto.description ?? null,
        status: dto.status ?? 'Active',
      },
    };
  }
}
