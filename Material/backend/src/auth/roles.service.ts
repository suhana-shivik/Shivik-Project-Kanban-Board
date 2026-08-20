import { Injectable } from '@nestjs/common';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../common/errors';
import {
  CreateRoleDto,
  PermissionRowDto,
  SubmitPermissionsDto,
  UpdateRoleDto,
} from './dto/role.dto';
import { CacheKey, CacheTtl } from '../redis/cache.keys';
import { RedisService } from '../redis/redis.service';
import { RolePermissionsCache } from './role-permissions.cache';
import {
  COLUMN_ACTIONS,
  permissionOf,
  ROLE_COLORS,
  SYSTEM_ROLE_SLUG,
  toSlug,
} from './roles';
import {
  ModuleRow,
  PermissionRow,
  RolesRepository,
  RoleRow,
} from './roles.repository';

/** A role as the "Roles" list renders it. */
export interface RoleView {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  isSystem: boolean;
  /** How many people currently hold it — shown before a delete. */
  userCount: number;
  /** How many modules are configured, i.e. rows in the grid. */
  moduleCount: number;
}

export interface RoleDetailView extends RoleView {
  permissions: {
    moduleId: number;
    key: string;
    name: string;
    group: string;
    read: boolean;
    write: boolean;
    update: boolean;
    delete: boolean;
  }[];
  /** The flattened `module:action` strings the guards actually compare. */
  grants: string[];
}

@Injectable()
export class RolesService {
  constructor(
    private readonly roles: RolesRepository,
    private readonly cache: RolePermissionsCache,
    private readonly cacheStore: RedisService,
  ) {}

  async findAll(search?: string): Promise<RoleView[]> {
    const rows = await this.roles.findAll(search);
    return rows.map(toRoleView);
  }

  async findOne(id: number): Promise<RoleDetailView> {
    const role = await this.require(id);
    return this.detail(role);
  }

  /** Feeds the ADD PERMISSION dropdown. Seeded data, so it is cached. */
  modules(): Promise<
    { id: number; key: string; name: string; group: string }[]
  > {
    return this.cacheStore.remember(
      CacheKey.modules,
      CacheTtl.modules,
      async () => (await this.roles.listModules()).map(toModuleView),
    );
  }

  /** The swatches on "IDENTIFY WITH COLOR". */
  colors(): readonly string[] {
    return ROLE_COLORS;
  }

  async create(dto: CreateRoleDto): Promise<RoleDetailView> {
    const slug = await this.resolveSlug(dto.name);
    await this.assertNameFree(dto.name);

    const id = await this.roles.insert({
      name: dto.name,
      slug,
      description: dto.description ?? null,
      color: dto.color ?? ROLE_COLORS[0],
    });

    // a brand new role holds nothing until its grid is submitted
    await this.cache.invalidate();
    return this.detail(await this.require(id));
  }

  async replace(id: number, dto: UpdateRoleDto): Promise<RoleDetailView> {
    const existing = await this.require(id);
    await this.assertNameFree(dto.name, id);

    // renaming the built-in admin would change its slug and orphan the guard
    // checks that name it, so its identity is fixed even though its label and
    // colour are not
    const slug = existing.isSystem
      ? existing.slug
      : await this.resolveSlug(dto.name, id);

    await this.roles.update(id, {
      name: dto.name,
      slug,
      description: dto.description ?? null,
      color: dto.color ?? existing.color,
    });

    await this.cache.invalidate();
    return this.detail(await this.require(id));
  }

  async remove(id: number): Promise<void> {
    const role = await this.require(id);

    if (role.isSystem) {
      throw new ConflictError(
        `The '${role.name}' role is built in and cannot be deleted.`,
      );
    }
    if (Number(role.userCount) > 0) {
      throw new ConflictError(
        `${role.userCount} user(s) still have this role. Move them to another role first.`,
      );
    }
    await this.assertRoleAdminsRemain(id);

    await this.roles.remove(id);
    await this.cache.invalidate();
  }

  /** SUBMIT PERMISSIONS — the posted grid becomes the stored grid. */
  async submitPermissions(
    id: number,
    dto: SubmitPermissionsDto,
  ): Promise<RoleDetailView> {
    const role = await this.require(id);
    await this.assertModulesExist(dto.permissions);

    if (role.isSystem) {
      this.assertKeepsRoleControl(
        dto.permissions,
        await this.roles.listModules(),
      );
    }

    await this.roles.replacePermissions(
      id,
      dto.permissions.map((row) => ({
        moduleId: row.moduleId,
        read: row.read,
        write: row.write,
        update: row.update,
        delete: row.delete,
      })),
    );

    await this.cache.invalidate();
    return this.detail(await this.require(id));
  }

  /** ADD PERMISSION — one module row, upserted. */
  async addPermission(
    id: number,
    row: PermissionRowDto,
  ): Promise<RoleDetailView> {
    await this.require(id);
    await this.assertModulesExist([row]);

    await this.roles.upsertPermission(id, {
      moduleId: row.moduleId,
      read: row.read ?? true,
      write: row.write,
      update: row.update,
      delete: row.delete,
    });

    await this.cache.invalidate();
    return this.detail(await this.require(id));
  }

  /** The trash icon on a grid row. */
  async removePermission(id: number, moduleId: number): Promise<void> {
    const role = await this.require(id);

    if (role.isSystem) {
      const module = await this.roles.moduleById(moduleId);
      if (module?.key === 'role' || module?.key === 'user') {
        throw new ConflictError(
          `'${module.name}' cannot be removed from the built-in ${role.name} role — it is the only way back in.`,
        );
      }
    }

    const removed = await this.roles.removePermission(id, moduleId);
    if (!removed) {
      throw new NotFoundError(
        `Module ${moduleId} is not configured for this role`,
      );
    }

    await this.cache.invalidate();
  }

  private async require(id: number): Promise<RoleRow> {
    const role = await this.roles.findById(id);
    if (!role) throw new NotFoundError(`Role ${id} not found`);
    return role;
  }

  private async detail(role: RoleRow): Promise<RoleDetailView> {
    const rows = await this.roles.permissionsOf(role.id);

    return {
      ...toRoleView(role),
      permissions: rows.map(toPermissionView),
      grants: rows.flatMap(grantsOf),
    };
  }

  private async assertNameFree(
    name: string,
    excludeId?: number,
  ): Promise<void> {
    if (await this.roles.nameTaken(name, excludeId)) {
      throw ValidationError.field(
        'name',
        'A role with this name already exists',
      );
    }
  }

  /**
   * "Site Engineer" and "site engineer" both want `site_engineer`, and the
   * name check above only catches the exact-name case.
   */
  private async resolveSlug(name: string, excludeId?: number): Promise<string> {
    const slug = toSlug(name);

    if (!slug) {
      throw ValidationError.field(
        'name',
        'Role name must contain at least one letter or number',
      );
    }
    if (await this.roles.slugTaken(slug, excludeId)) {
      throw ValidationError.field(
        'name',
        `A role already resolves to '${slug}'. Pick a more distinct name.`,
      );
    }
    return slug;
  }

  private async assertModulesExist(rows: PermissionRowDto[]): Promise<void> {
    const modules = await this.roles.listModules();
    const known = new Set(modules.map((module) => module.id));

    const missing = [
      ...new Set(
        rows.map((row) => row.moduleId).filter((id) => !known.has(id)),
      ),
    ];

    if (missing.length) {
      throw ValidationError.field(
        'permissions',
        `Unknown module: ${missing.join(', ')}`,
      );
    }
  }

  /**
   * Submitting a grid that leaves the built-in admin unable to edit roles or
   * users would lock the whole permission system, with no way back through
   * the API.
   */
  private assertKeepsRoleControl(
    rows: PermissionRowDto[],
    modules: ModuleRow[],
  ): void {
    const idOf = (key: string) => modules.find((m) => m.key === key)?.id;

    for (const key of ['role', 'user']) {
      const moduleId = idOf(key);
      const row = rows.find((candidate) => candidate.moduleId === moduleId);

      if (!row?.read || !row.update) {
        throw new ConflictError(
          `The built-in ${SYSTEM_ROLE_SLUG} role must keep read and update on '${key}', or nobody could manage permissions again.`,
        );
      }
    }
  }

  /** Nobody left who can edit roles is the one unrecoverable delete. */
  private async assertRoleAdminsRemain(roleId: number): Promise<void> {
    if ((await this.roles.countOtherRoleAdmins(roleId)) === 0) {
      throw new ConflictError(
        'Deleting this role would leave nobody able to manage roles. Grant another role update rights on Roles & Permissions first.',
      );
    }
  }
}

function toRoleView(row: RoleRow): RoleView {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    color: row.color,
    isSystem: row.isSystem,
    userCount: Number(row.userCount),
    moduleCount: Number(row.moduleCount),
  };
}

function toModuleView(row: ModuleRow) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    group: row.moduleGroup,
  };
}

function toPermissionView(row: PermissionRow) {
  return {
    moduleId: row.moduleId,
    key: row.key,
    name: row.name,
    group: row.moduleGroup,
    read: row.canRead,
    write: row.canWrite,
    update: row.canUpdate,
    delete: row.canDelete,
  };
}

/** `material` + the four toggles becomes the permission strings it grants. */
function grantsOf(row: PermissionRow): string[] {
  return Object.entries(COLUMN_ACTIONS)
    .filter(([column]) => row[column as keyof PermissionRow])
    .map(([, action]) => permissionOf(row.key, action));
}
