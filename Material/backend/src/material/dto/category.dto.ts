import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import type { Status } from '../entities';
import { ToBoolean, ToInt, Trim } from '../../common/transforms';
import { PaginationDto } from '../../common/pagination';

const NAME_REQUIRED = 'Category name is required';

export class CreateCategoryDto {
  @Trim()
  @IsString({ message: NAME_REQUIRED })
  @IsNotEmpty({ message: NAME_REQUIRED })
  @MaxLength(150, { message: 'Category name is too long' })
  name: string;

  @IsOptional()
  @Trim()
  @IsString({ message: 'Code must be text' })
  @MaxLength(50, { message: 'Code is too long' })
  code?: string;

  @IsOptional()
  @Trim()
  @IsString({ message: 'Description must be text' })
  description?: string;

  @IsOptional()
  @IsIn(['Active', 'Inactive'], {
    message: 'Status must be Active or Inactive',
  })
  status?: Status;
}

/** PUT is a full replace, so the body is the same shape as create. */
export class UpdateCategoryDto extends CreateCategoryDto {}

export class CategoryQueryDto extends PaginationDto {
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
}

export class SubcategoryQueryDto extends CategoryQueryDto {
  @IsOptional()
  @ToInt()
  @IsInt({ message: 'Category is invalid' })
  @Min(1, { message: 'Category is invalid' })
  categoryId?: number;

  /** Direct children of one sub-category. */
  @IsOptional()
  @ToInt()
  @IsInt({ message: 'Parent sub-category is invalid' })
  @Min(1, { message: 'Parent sub-category is invalid' })
  parentId?: number;

  /** Only the ones sitting directly under a category (parentId === null). */
  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'rootOnly must be true or false' })
  rootOnly?: boolean;
}
