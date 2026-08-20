import { Injectable } from '@nestjs/common';
import { UserView } from './user.entity';
import { UnauthenticatedError, ValidationError } from '../common/errors';
import { UploadedFiles } from '../uploads/upload.config';
import { authSecret, tokenTtlSeconds } from './auth.config';
import { AuthUser } from './auth.decorators';
import { ChangePasswordDto, LoginDto, RegisterUserDto } from './dto/auth.dto';
import { hashPassword, verifyPassword } from './password';
import { LoginThrottle } from './login-throttle';
import { RolesService } from './roles.service';
import { signToken } from './token';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    private readonly throttle: LoginThrottle,
  ) {}

  /**
   * Public sign-up. Shares all its logic with the admin-facing POST /users —
   * the difference is `allowPrivilegedRole`, which stops anyone from handing
   * themselves the admin role on the way in.
   */
  async register(
    dto: RegisterUserDto,
    files: UploadedFiles,
  ): Promise<{ message: string; user: UserView }> {
    const user = await this.usersService.create(dto, files, {
      allowPrivilegedRole: false,
    });

    return { message: 'Registration successful', user };
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    // checked before the password so a locked-out attacker cannot keep
    // burning scrypt hashes on this process
    await this.throttle.assertAllowed(email);

    const credentials = await this.users.findCredentials(email);

    // one message for both branches so the response cannot be used to probe
    // which addresses are registered
    if (
      !credentials ||
      !verifyPassword(dto.password, credentials.passwordHash)
    ) {
      await this.throttle.recordFailure(email);
      throw new UnauthenticatedError('Invalid email or password');
    }

    if (credentials.status === 'Inactive') {
      throw new UnauthenticatedError(
        'This account is inactive. Ask an admin to re-activate it.',
      );
    }

    await this.throttle.recordSuccess(email);
    const user = (await this.users.findById(credentials.id))!;

    const { token, expiresAt, expiresIn } = signToken(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      authSecret(),
      tokenTtlSeconds(),
    );

    return {
      message: 'Login successful',
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn,
      expiresAt,
      user,
    };
  }

  /** Whoever the bearer token says you are, freshly read from the database. */
  async profile(current: AuthUser): Promise<UserView> {
    const user = await this.users.findById(current.id);

    // the token verified, but the account was deleted since it was issued
    if (!user) throw new UnauthenticatedError('This account no longer exists');
    return user;
  }

  /**
   * Public so a sign-up screen can list the roles before anyone has a token.
   * Only the labels — the permission grid behind each one needs `role:read`.
   */
  async roles() {
    const roles = await this.rolesService.findAll();

    return roles.map((role) => ({
      role: role.slug,
      name: role.name,
      description: role.description,
      color: role.color,
      isSystem: role.isSystem,
    }));
  }

  async changePassword(current: AuthUser, dto: ChangePasswordDto) {
    const credentials = await this.users.findCredentials(current.email);
    if (!credentials) {
      throw new UnauthenticatedError('This account no longer exists');
    }

    if (!verifyPassword(dto.currentPassword, credentials.passwordHash)) {
      throw ValidationError.field(
        'currentPassword',
        'Current password is incorrect',
      );
    }
    if (dto.currentPassword === dto.newPassword) {
      throw ValidationError.field(
        'newPassword',
        'New password must be different from the current one',
      );
    }

    await this.users.setPassword(credentials.id, hashPassword(dto.newPassword));
    return { message: 'Password changed' };
  }
}
