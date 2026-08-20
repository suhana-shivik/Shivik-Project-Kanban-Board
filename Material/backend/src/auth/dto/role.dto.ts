import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ToBoolean, ToInt, Trim } from '../../common/transforms';
import { HEX_COLOR } from '../roles';

const NAME_REQUIRED = 'Role name is required';

export class CreateRoleDto {
  @Trim()
  @IsString({ message: NAME_REQUIRED })
  @IsNotEmpty({ message: NAME_REQUIRED })
  @MaxLength(60, { message: 'Role name is too long' })
  name: string;

  /** "IDENTIFY WITH COLOR" — any hex, the palette is only a suggestion. */
  @IsOptional()
  @Trim()
  @Matches(HEX_COLOR, { message: 'Colour must be a hex value like #00C875' })
  color?: string;

  @IsOptional()
  @Trim()
  @IsString({ message: 'Description must be text' })
  @MaxLength(200, { message: 'Description is too long' })
  description?: string;
}

/** PUT is a full replace, so the body is the same shape as create. */
export class UpdateRoleDto extends CreateRoleDto {}

/** One line of the permission grid. */
export class PermissionRowDto {
  @ToInt()
  @IsInt({ message: 'Module is invalid' })
  @Min(1, { message: 'Module is invalid' })
  moduleId: number;

  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'read must be true or false' })
  read?: boolean;

  /** The WRITE column on the grid; it grants `:create`. */
  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'write must be true or false' })
  write?: boolean;

  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'update must be true or false' })
  update?: boolean;

  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'delete must be true or false' })
  delete?: boolean;
}

/** SUBMIT PERMISSIONS: the posted grid replaces the stored one. */
export class SubmitPermissionsDto {
  @IsArray({ message: 'permissions must be a list' })
  @ArrayMaxSize(200, { message: 'Too many permission rows' })
  @ValidateNested({ each: true })
  @Type(() => PermissionRowDto)
  permissions: PermissionRowDto[];
}

export class RoleQueryDto {
  @IsOptional()
  @Trim()
  @IsString()
  query?: string;
}
