import { IsInt, IsOptional, Min } from 'class-validator';
import { CreateCategoryDto } from './category.dto';
import { ToInt } from '../../common/transforms';

export class CreateSubcategoryDto extends CreateCategoryDto {
  /**
   * Optional: derived from `parentId` when that is given. One of the two must
   * be present — a sub-category always ends up under exactly one category.
   */
  @IsOptional()
  @ToInt()
  @IsInt({ message: 'Category is invalid' })
  @Min(1, { message: 'Category is invalid' })
  categoryId?: number;

  /**
   * Optional: another sub-category to nest under. null/omitted puts this one
   * directly under its category. Nesting has no depth limit.
   */
  @IsOptional()
  @ToInt()
  @IsInt({ message: 'Parent sub-category is invalid' })
  @Min(1, { message: 'Parent sub-category is invalid' })
  parentId?: number;
}

/** PUT is a full replace, so the body is the same shape as create. */
export class UpdateSubcategoryDto extends CreateSubcategoryDto {}
