import { Injectable } from '@nestjs/common';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../common/errors';
import { CategoryRepository } from './category.repository';
import { SubcategoryQueryDto } from './dto/category.dto';
import {
  CreateSubcategoryDto,
  UpdateSubcategoryDto,
} from './dto/subcategory.dto';
import { SubcategoryView } from './entities';
import { SubcategoryRepository } from './subcategory.repository';

/** Where a sub-category ends up once its parent has been validated. */
interface Placement {
  categoryId: number;
  parentId: number | null;
}

@Injectable()
export class SubcategoryService {
  constructor(
    private readonly subcategories: SubcategoryRepository,
    private readonly categories: CategoryRepository,
  ) {}

  findAll(query: SubcategoryQueryDto): Promise<SubcategoryView[]> {
    return this.subcategories.findAll(query);
  }

  async findOne(id: number): Promise<SubcategoryView> {
    const subcategory = await this.subcategories.findById(id);
    if (!subcategory) throw NotFoundError.of('Sub-category', id);
    return subcategory;
  }

  /** Direct children of one sub-category. */
  async findChildren(id: number): Promise<SubcategoryView[]> {
    await this.findOne(id);
    return this.findAll({ parentId: id });
  }

  async create(dto: CreateSubcategoryDto): Promise<SubcategoryView> {
    const placement = await this.resolvePlacement(dto);
    await this.assertUnique(dto, placement);

    const id = await this.subcategories.insert({
      categoryId: placement.categoryId,
      parentId: placement.parentId,
      code: dto.code ?? null,
      name: dto.name,
      description: dto.description ?? null,
      status: dto.status ?? 'Active',
    });

    return this.findOne(id);
  }

  async replace(
    id: number,
    dto: UpdateSubcategoryDto,
  ): Promise<SubcategoryView> {
    const current = await this.findOne(id);
    const placement = await this.resolvePlacement(dto, id);
    await this.assertUnique(dto, placement, id);

    // descendants and materials both pin the old category on their own rows,
    // so moving this one across categories would strand them
    if (current.categoryId !== placement.categoryId) {
      await this.assertNothingAttached(
        id,
        'Move or delete those before changing its category.',
      );
    }

    await this.subcategories.update(id, {
      categoryId: placement.categoryId,
      parentId: placement.parentId,
      code: dto.code ?? null,
      name: dto.name,
      description: dto.description ?? null,
      status: dto.status ?? 'Active',
    });

    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.assertNothingAttached(id, 'Delete those first.');
    await this.subcategories.remove(id);
  }

  /** `childAction` differs between a delete and a cross-category move. */
  private async assertNothingAttached(
    id: number,
    childAction: string,
  ): Promise<void> {
    const attached = await this.subcategories.countDependents(id);

    if (attached.children > 0) {
      throw new ConflictError(
        `This sub-category has sub-categories. ${childAction}`,
      );
    }
    if (attached.materials > 0) {
      throw new ConflictError(
        'This sub-category has materials assigned. Move or delete those first.',
      );
    }
  }

  /**
   * Works out which category and parent a sub-category belongs to, rejecting
   * the combinations that would corrupt the tree: an unknown parent, a parent
   * in a different category, and any move that would form a cycle.
   */
  private async resolvePlacement(
    dto: CreateSubcategoryDto,
    excludeId?: number,
  ): Promise<Placement> {
    const parentId = dto.parentId ?? null;
    const categoryId = dto.categoryId ?? null;

    if (parentId === null) {
      if (categoryId === null) {
        throw ValidationError.field('categoryId', 'Category is required');
      }
      if (!(await this.categories.exists(categoryId))) {
        throw ValidationError.field(
          'categoryId',
          'Selected parent category does not exist',
        );
      }
      return { categoryId, parentId: null };
    }

    if (parentId === excludeId) {
      throw ValidationError.field(
        'parentId',
        'A sub-category cannot be its own parent',
      );
    }

    const parentCategoryId = await this.subcategories.categoryOf(parentId);
    if (parentCategoryId === null) {
      throw ValidationError.field(
        'parentId',
        'Selected parent sub-category does not exist',
      );
    }
    if (categoryId !== null && parentCategoryId !== categoryId) {
      throw ValidationError.field(
        'parentId',
        'Parent sub-category belongs to a different category',
      );
    }
    if (
      excludeId !== undefined &&
      (await this.subcategories.isDescendantOf(parentId, excludeId))
    ) {
      throw ValidationError.field(
        'parentId',
        'Cannot move a sub-category under one of its own children',
      );
    }

    return { categoryId: parentCategoryId, parentId };
  }

  private async assertUnique(
    dto: CreateSubcategoryDto,
    placement: Placement,
    excludeId?: number,
  ): Promise<void> {
    const clash = await this.subcategories.findClashes(
      dto.name,
      dto.code ?? null,
      placement.categoryId,
      placement.parentId,
      excludeId,
    );

    if (clash.sibling) {
      throw ValidationError.field(
        'name',
        placement.parentId === null
          ? 'A sub-category with this name already exists in this category'
          : 'A sub-category with this name already exists under this parent',
      );
    }
    if (clash.code) {
      throw ValidationError.field(
        'code',
        'This sub-category code already exists',
      );
    }
  }
}
