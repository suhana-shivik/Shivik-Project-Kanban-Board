import { Injectable } from '@nestjs/common';
import { Lookup, Status } from '../common/types';
import { UserView } from './user.entity';
import {
  ConflictError,
  FieldErrors,
  NotFoundError,
  ValidationError,
} from '../common/errors';
import { storedPath, UploadedFiles } from '../uploads/upload.config';
import { AuthUser } from './auth.decorators';
import {
  ChangeRoleDto,
  RegisterUserDto,
  UpdateUserDto,
  UserQueryDto,
} from './dto/auth.dto';
import { AuthContextCache } from './auth-context.cache';
import { hashPassword } from './password';
import { Role } from './roles';
import { RolesRepository } from './roles.repository';
import { CacheKey, CacheTtl } from '../redis/cache.keys';
import { RedisService } from '../redis/redis.service';
import { UsersRepository, UserWrite } from './users.repository';

/** Public sign-up may not mint a built-in role; POST /users may. */
interface CreateOptions {
  allowPrivilegedRole: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly roles: RolesRepository,
    private readonly redis: RedisService,
    private readonly accounts: AuthContextCache,
  ) {}

  findAll(query: UserQueryDto): Promise<UserView[]> {
    return this.users.findAll(query);
  }

  async findOne(id: number): Promise<UserView> {
    return this.require(id);
  }

  /**
   * Feeds the "Departments" and "Project assignment" pickers on the form.
   * Public and hit on every page load, and the two tables barely change, so
   * it is served from Redis.
   */
  lookups(): Promise<{ departments: Lookup[]; projects: Lookup[] }> {
    return this.redis.remember(CacheKey.lookups, CacheTtl.lookups, async () => {
      const [departments, projects] = await Promise.all([
        this.users.listDepartments(),
        this.users.listProjects(),
      ]);
      return { departments, projects };
    });
  }

  /** Candidates for the "Reporting to" picker — everyone but the new user. */
  managers(): Promise<UserView[]> {
    return this.users.findAll({ status: 'Active' });
  }

  async create(
    dto: RegisterUserDto,
    files: UploadedFiles,
    options: CreateOptions = { allowPrivilegedRole: true },
  ): Promise<UserView> {
    const role = await this.resolveRole(dto.role, options);
    await this.assertEmailFree(dto.email);
    await this.assertLinkedIdsExist(dto);

    const id = await this.users.insert({
      ...this.toWrite(dto, role),
      passwordHash: hashPassword(dto.password),
      profileImage: storedPath(files.profileImage?.[0]),
      signature: storedPath(files.signature?.[0]),
      projectIds: dto.projectIds ?? [],
      departmentIds: dto.departmentIds ?? [],
      managerIds: dto.managerIds ?? [],
    });

    return this.require(id);
  }

  async replace(
    id: number,
    dto: UpdateUserDto,
    files: UploadedFiles,
    current: AuthUser,
  ): Promise<UserView> {
    const existing = await this.require(id);
    const role = await this.resolveRole(dto.role, {
      allowPrivilegedRole: true,
    });
    await this.assertEmailFree(dto.email, id);
    await this.assertLinkedIdsExist(dto);

    const status = dto.status ?? 'Active';

    if (existing.id === current.id) {
      // an admin who demotes or disables themselves locks the last door on
      // the way out — including their own
      if (role !== existing.role) {
        throw new ConflictError('You cannot change your own role');
      }
      if (status === 'Inactive') {
        throw new ConflictError('You cannot deactivate your own account');
      }
    }

    await this.assertAdminRemains(existing, role, status);

    await this.users.update(id, {
      ...this.toWrite(dto, role),
      // omitted password / files leave the stored values alone — re-uploading
      // an image on every edit would be a poor form
      passwordHash: dto.password ? hashPassword(dto.password) : undefined,
      profileImage: storedPath(files.profileImage?.[0]) ?? undefined,
      signature: storedPath(files.signature?.[0]) ?? undefined,
      // the multi-selects are different: PUT is a full replace, and an empty
      // form field is how a UI says "nothing selected", so an absent list
      // clears the assignments rather than keeping the old ones
      projectIds: dto.projectIds ?? [],
      departmentIds: dto.departmentIds ?? [],
      managerIds: dto.managerIds ?? [],
    });

    // the row is committed by now; only then is it safe to drop the cache
    await this.accounts.invalidate(id);
    return this.require(id);
  }

  async changeRole(
    id: number,
    dto: ChangeRoleDto,
    current: AuthUser,
  ): Promise<UserView> {
    const existing = await this.require(id);
    const role = await this.resolveRole(dto.role, {
      allowPrivilegedRole: true,
    });

    if (existing.id === current.id) {
      throw new ConflictError('You cannot change your own role');
    }
    await this.assertAdminRemains(existing, role, existing.status);

    await this.users.setRole(id, role);
    await this.accounts.invalidate(id);
    return this.require(id);
  }

  /** Flips Active <-> Inactive; an inactive user can no longer log in. */
  async toggleStatus(id: number, current: AuthUser): Promise<UserView> {
    const existing = await this.require(id);

    if (existing.id === current.id) {
      throw new ConflictError('You cannot deactivate your own account');
    }

    const next: Status = existing.status === 'Active' ? 'Inactive' : 'Active';
    await this.assertAdminRemains(existing, existing.role, next);

    await this.users.toggleStatus(id);
    // a deactivated user's live token has to stop working now, not in 30s
    await this.accounts.invalidate(id);
    return this.require(id);
  }

  async remove(id: number, current: AuthUser): Promise<void> {
    const existing = await this.require(id);

    if (existing.id === current.id) {
      throw new ConflictError('You cannot delete your own account');
    }
    await this.assertAdminRemains(existing, 'viewer', 'Inactive');

    await this.users.remove(id);
    await this.accounts.invalidate(id);
  }

  private toWrite(dto: RegisterUserDto, role: Role): UserWrite {
    return {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone ?? null,
      role,
      status: dto.status ?? 'Active',
    };
  }

  /**
   * Roles are database rows now, so an unknown slug has to be reported here
   * rather than by a decorator. `role` is optional on the DTO because public
   * sign-up defaults to the harmless one, and self-registration is refused any
   * built-in role outright — otherwise anyone could POST their way to full
   * access.
   */
  private async resolveRole(
    role: Role | undefined,
    options: CreateOptions,
  ): Promise<Role> {
    if (!role) return 'viewer';

    const existing = await this.roles.findBySlug(role);
    if (!existing) {
      const known = await this.roles.findAll();
      throw ValidationError.field(
        'role',
        `Unknown role '${role}'. Known roles: ${known
          .map((candidate) => candidate.slug)
          .join(', ')}`,
      );
    }

    if (existing.isSystem && !options.allowPrivilegedRole) {
      throw ValidationError.field(
        'role',
        `Sign-up cannot request the '${existing.name}' role. An admin has to grant it.`,
      );
    }

    return existing.slug;
  }

  private async require(id: number): Promise<UserView> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError(`User ${id} not found`);
    return user;
  }

  private async assertEmailFree(
    email: string,
    excludeId?: number,
  ): Promise<void> {
    if (await this.users.emailTaken(email, excludeId)) {
      throw ValidationError.field(
        'email',
        'A user with this email already exists',
      );
    }
  }

  /** Reports every bad selection at once rather than one dropdown at a time. */
  private async assertLinkedIdsExist(dto: RegisterUserDto): Promise<void> {
    const fields = [
      ['projectIds', dto.projectIds, 'Unknown project'],
      ['departmentIds', dto.departmentIds, 'Unknown department'],
      ['managerIds', dto.managerIds, 'Unknown manager'],
    ] as const;

    const errors: FieldErrors = {};

    for (const [field, ids, label] of fields) {
      if (!ids?.length) continue;

      const missing = await this.users.missingIds(field, ids);
      if (missing.length) {
        errors[field] = `${label}: ${missing.join(', ')}`;
      }
    }

    if (Object.keys(errors).length) throw new ValidationError(errors);
  }

  /**
   * Guards against the one change nobody can undo: removing the last account
   * that could still manage users. Measured by permission rather than by the
   * `admin` name, so a custom role granted user:update counts as cover.
   */
  private async assertAdminRemains(
    user: UserView,
    nextRole: Role,
    nextStatus: Status,
  ): Promise<void> {
    const wasManager =
      user.status === 'Active' &&
      (await this.roles.grantsUpdate(user.role, 'user'));
    if (!wasManager) return;

    const stillManager =
      nextStatus === 'Active' &&
      (await this.roles.grantsUpdate(nextRole, 'user'));
    if (stillManager) return;

    if ((await this.users.countOtherUserAdmins(user.id)) === 0) {
      throw new ConflictError(
        'This is the last active user who can manage users. Give another account a role with update rights on Users first.',
      );
    }
  }
}
