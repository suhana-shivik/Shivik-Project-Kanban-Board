import { Injectable } from '@nestjs/common';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../common/errors';
import { CacheKey } from '../redis/cache.keys';
import { RedisService } from '../redis/redis.service';
import {
  DepartmentsRepository,
  DepartmentView,
} from './departments.repository';
import {
  CreateDepartmentDto,
  DepartmentQueryDto,
  UpdateDepartmentDto,
} from './dto/department.dto';

export type { DepartmentView };

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly departments: DepartmentsRepository,
    private readonly redis: RedisService,
  ) {}

  findAll(query: DepartmentQueryDto): Promise<DepartmentView[]> {
    return this.departments.findAll(query);
  }

  async findOne(id: number): Promise<DepartmentView> {
    const department = await this.departments.findById(id);
    if (!department) throw NotFoundError.of('Department', id);
    return department;
  }

  async findChildren(id: number): Promise<DepartmentView[]> {
    await this.findOne(id);
    return this.findAll({ parentId: id });
  }

  async create(dto: CreateDepartmentDto): Promise<DepartmentView> {
    await this.assertNameFree(dto.name);
    await this.assertParentExists(dto.parentId ?? null);

    const id = await this.departments.insert({
      name: dto.name,
      code: dto.code ?? null,
      parentId: dto.parentId ?? null,
      status: dto.status ?? 'Active',
    });

    // the form's dropdown is cached; it just went stale
    await this.redis.invalidate(CacheKey.lookups);
    return this.findOne(id);
  }

  async replace(id: number, dto: UpdateDepartmentDto): Promise<DepartmentView> {
    await this.findOne(id);
    await this.assertNameFree(dto.name, id);

    const parentId = dto.parentId ?? null;
    await this.assertParentExists(parentId);

    if (parentId !== null) {
      if (parentId === id) {
        throw ValidationError.field(
          'parentId',
          'A department cannot be its own parent',
        );
      }
      if (await this.departments.isDescendantOf(parentId, id)) {
        throw ValidationError.field(
          'parentId',
          'Cannot move a department under one of its own children',
        );
      }
    }

    await this.departments.update(id, {
      name: dto.name,
      code: dto.code ?? null,
      parentId,
      status: dto.status ?? 'Active',
    });

    await this.redis.invalidate(CacheKey.lookups);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const department = await this.findOne(id);

    if (department.childCount > 0) {
      throw new ConflictError(
        'This department has sub-departments. Delete those first.',
      );
    }
    if (department.userCount > 0) {
      throw new ConflictError(
        `${department.userCount} user(s) are assigned to this department. Move them first.`,
      );
    }

    await this.departments.remove(id);
    await this.redis.invalidate(CacheKey.lookups);
  }

  private async assertNameFree(
    name: string,
    excludeId?: number,
  ): Promise<void> {
    if (await this.departments.nameTaken(name, excludeId)) {
      throw ValidationError.field(
        'name',
        'A department with this name already exists',
      );
    }
  }

  private async assertParentExists(parentId: number | null): Promise<void> {
    if (parentId === null) return;

    if (!(await this.departments.exists(parentId))) {
      throw ValidationError.field(
        'parentId',
        'Selected parent department does not exist',
      );
    }
  }
}
