import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../common/pagination';
import { ToInt, Trim } from '../../common/transforms';
import type { Status } from '../../common/types';

const NAME_REQUIRED = 'Department name is required';

export class CreateDepartmentDto {
  @Trim()
  @IsString({ message: NAME_REQUIRED })
  @IsNotEmpty({ message: NAME_REQUIRED })
  @MaxLength(100, { message: 'Department name is too long' })
  name: string;

  /** "PARENT DEPARTMENT" — omit or send null for a top-level department. */
  @IsOptional()
  @ToInt()
  @IsInt({ message: 'Parent department is invalid' })
  @Min(1, { message: 'Parent department is invalid' })
  parentId?: number | null;

  @IsOptional()
  @Trim()
  @IsString({ message: 'Code must be text' })
  @MaxLength(50, { message: 'Code is too long' })
  code?: string;

  @IsOptional()
  @IsIn(['Active', 'Inactive'], {
    message: 'Status must be Active or Inactive',
  })
  status?: Status;
}

export class UpdateDepartmentDto extends CreateDepartmentDto {}

export class DepartmentQueryDto extends PaginationDto {
  /** Matched against name and code, case-insensitively. */
  @IsOptional()
  @Trim()
  @IsString()
  query?: string;

  @IsOptional()
  @IsIn(['Active', 'Inactive'], {
    message: 'Status must be Active or Inactive',
  })
  status?: Status;

  @IsOptional()
  @ToInt()
  @IsInt({ message: 'Parent department is invalid' })
  @Min(1, { message: 'Parent department is invalid' })
  parentId?: number;
}
