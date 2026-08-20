import { Injectable } from '@nestjs/common';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../common/errors';
import { CategoryRepository } from './category.repository';
import {
  CategoryQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto';
import { Category } from './entities';

@Injectable()
export class CategoryService {
  constructor(private readonly categories: CategoryRepository) {}

  findAll(query: CategoryQueryDto): Promise<Category[]> {
    return this.categories.findAll(query);
  }

  async findOne(id: number): Promise<Category> {
    const category = await this.categories.findById(id);
    if (!category) throw NotFoundError.of('Category', id);
    return category;
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    await this.assertUnique(dto);

    return this.categories.insert({
      code: dto.code ?? null,
      name: dto.name,
      description: dto.description ?? null,
      status: dto.status ?? 'Active',
    });
  }

  async replace(id: number, dto: UpdateCategoryDto): Promise<Category> {
    await this.findOne(id);
    await this.assertUnique(dto, id);

    return this.categories.update(id, {
      code: dto.code ?? null,
      name: dto.name,
      description: dto.description ?? null,
      status: dto.status ?? 'Active',
    });
  }

  /**
   * The FKs are ON DELETE RESTRICT, so the database would refuse this anyway —
   * checking first is what turns a raw constraint violation into the `reason`
   * message the frontend already knows how to show.
   */
  async remove(id: number): Promise<void> {
    await this.findOne(id);
    const blockers = await this.categories.countDependents(id);

    if (blockers.subcategories > 0) {
      throw new ConflictError(
        'This category has sub-categories. Delete those first.',
      );
    }
    if (blockers.materials > 0) {
      throw new ConflictError(
        'This category has materials assigned. Move or delete those first.',
      );
    }

    await this.categories.remove(id);
  }

  private async assertUnique(
    dto: CreateCategoryDto,
    excludeId?: number,
  ): Promise<void> {
    const clash = await this.categories.findClashes(
      dto.name,
      dto.code ?? null,
      excludeId,
    );

    if (clash.name) {
      throw ValidationError.field(
        'name',
        'A category with this name already exists',
      );
    }
    if (clash.code) {
      throw ValidationError.field('code', 'This category code already exists');
    }
  }
}
