import {
  ArrayMaxSize,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../common/pagination';
import { ToIntArray, Trim } from '../../common/transforms';
import type { Status } from '../../common/types';
import type { Role } from '../roles';

const EMAIL_REQUIRED = 'Email is required';
const PASSWORD_REQUIRED = 'Password is required';
/**
 * Roles live in the database now, so the list cannot be checked at decorator
 * time. The shape is validated here; UsersService confirms the slug exists and
 * reports an unknown one on the `role` field.
 */
const ROLE_MESSAGE = 'Role is required';

export class LoginDto {
  @Trim()
  @IsString({ message: EMAIL_REQUIRED })
  @IsNotEmpty({ message: EMAIL_REQUIRED })
  @IsEmail({}, { message: 'Enter a valid email address' })
  email: string;

  @IsString({ message: PASSWORD_REQUIRED })
  @IsNotEmpty({ message: PASSWORD_REQUIRED })
  password: string;
}

/**
 * Every field on the "Add New User" dialog. Sent as `multipart/form-data` so
 * the profile image and digital signature can ride along, which means each
 * value arrives as a string — hence the transforms.
 */
export class RegisterUserDto {
  @Trim()
  @IsString({ message: 'First name is required' })
  @IsNotEmpty({ message: 'First name is required' })
  @MaxLength(60, { message: 'First name is too long' })
  firstName: string;

  @Trim()
  @IsString({ message: 'Last name is required' })
  @IsNotEmpty({ message: 'Last name is required' })
  @MaxLength(60, { message: 'Last name is too long' })
  lastName: string;

  @Trim()
  @IsString({ message: EMAIL_REQUIRED })
  @IsNotEmpty({ message: EMAIL_REQUIRED })
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(150, { message: 'Email is too long' })
  email: string;

  /** Optional on the form, but has to be a real 10-digit number if given. */
  @IsOptional()
  @Trim()
  @Matches(/^\d{10}$/, { message: 'Phone number must be exactly 10 digits' })
  phone?: string;

  @IsString({ message: PASSWORD_REQUIRED })
  @IsNotEmpty({ message: PASSWORD_REQUIRED })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  @MaxLength(72, { message: 'Password is too long' })
  password: string;

  /**
   * Optional here because public self-registration defaults to `viewer`;
   * the admin-facing POST /users requires it.
   */
  @IsOptional()
  @Trim()
  @IsString({ message: ROLE_MESSAGE })
  @IsNotEmpty({ message: ROLE_MESSAGE })
  role?: Role;

  @IsOptional()
  @IsIn(['Active', 'Inactive'], {
    message: 'Status must be Active or Inactive',
  })
  status?: Status;

  @IsOptional()
  @ToIntArray()
  @IsInt({ each: true, message: 'Project assignment is invalid' })
  @Min(1, { each: true, message: 'Project assignment is invalid' })
  @ArrayMaxSize(100, { message: 'Too many projects selected' })
  projectIds?: number[];

  @IsOptional()
  @ToIntArray()
  @IsInt({ each: true, message: 'Departments selection is invalid' })
  @Min(1, { each: true, message: 'Departments selection is invalid' })
  @ArrayMaxSize(50, { message: 'Too many departments selected' })
  departmentIds?: number[];

  /** "Reporting to" — the ids of other users, not a free-text name. */
  @IsOptional()
  @ToIntArray()
  @IsInt({ each: true, message: 'Reporting to selection is invalid' })
  @Min(1, { each: true, message: 'Reporting to selection is invalid' })
  @ArrayMaxSize(20, { message: 'Too many managers selected' })
  managerIds?: number[];
}

/**
 * PUT is a full replace. Password is the one field left alone when omitted, so
 * editing a user does not force a password reset.
 */
export class UpdateUserDto extends RegisterUserDto {
  @IsOptional()
  @IsString({ message: PASSWORD_REQUIRED })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  @MaxLength(72, { message: 'Password is too long' })
  declare password: string;
}

export class ChangeRoleDto {
  @Trim()
  @IsString({ message: ROLE_MESSAGE })
  @IsNotEmpty({ message: ROLE_MESSAGE })
  role: Role;
}

export class ChangePasswordDto {
  @IsString({ message: 'Current password is required' })
  @IsNotEmpty({ message: 'Current password is required' })
  currentPassword: string;

  @IsString({ message: 'New password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  @MaxLength(72, { message: 'Password is too long' })
  newPassword: string;
}

export class UserQueryDto extends PaginationDto {
  /** Matched against first name, last name and email, case-insensitively. */
  @IsOptional()
  @Trim()
  @IsString()
  query?: string;

  /** A role slug, e.g. `site_engineer`. */
  @IsOptional()
  @Trim()
  @IsString({ message: ROLE_MESSAGE })
  role?: Role;

  @IsOptional()
  @IsIn(['Active', 'Inactive'], {
    message: 'Status must be Active or Inactive',
  })
  status?: Status;
}
