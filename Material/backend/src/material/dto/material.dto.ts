import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import type { Status } from '../entities';
import { PaginationDto } from '../../common/pagination';
import { ToInt, Trim } from '../../common/transforms';

const CODE_REQUIRED = 'Item code is required';
const NAME_REQUIRED = 'Material name is required';
const UOM_REQUIRED = 'Unit of measure is required';
const CATEGORY_REQUIRED = 'Category is required';
const SUBCATEGORY_INVALID = 'Sub-category is invalid';

export class CreateMaterialDto {
  @Trim()
  @IsString({ message: CODE_REQUIRED })
  @IsNotEmpty({ message: CODE_REQUIRED })
  @MaxLength(50, { message: 'Item code is too long' })
  code: string;

  @Trim()
  @IsString({ message: NAME_REQUIRED })
  @IsNotEmpty({ message: NAME_REQUIRED })
  @MaxLength(200, { message: 'Material name is too long' })
  name: string;

  @Trim()
  @IsString({ message: UOM_REQUIRED })
  @IsNotEmpty({ message: UOM_REQUIRED })
  uom: string;

  /**
   * Optional: derived from the sub-category when omitted. When both are sent
   * they must agree, so the frontend can post either shape.
   */
  @IsOptional()
  @ToInt()
  @IsInt({ message: CATEGORY_REQUIRED })
  @Min(1, { message: CATEGORY_REQUIRED })
  categoryId?: number;

  /** Optional: a material may sit directly under a category. */
  @IsOptional()
  @ToInt()
  @IsInt({ message: SUBCATEGORY_INVALID })
  @Min(1, { message: SUBCATEGORY_INVALID })
  subcategoryId?: number;

  @IsOptional()
  @Trim()
  @IsString({ message: 'HSN must be text' })
  @MaxLength(20, { message: 'HSN is too long' })
  hsn?: string;

  @IsOptional()
  @Trim()
  @IsString({ message: 'GST must be text' })
  @MaxLength(10, { message: 'GST is too long' })
  gst?: string;

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
export class UpdateMaterialDto extends CreateMaterialDto {}

export class MaterialQueryDto extends PaginationDto {
  /** Matched against name and code, case-insensitively. */
  @IsOptional()
  @Trim()
  @IsString()
  query?: string;

  @IsOptional()
  @ToInt()
  @IsInt({ message: 'Category is invalid' })
  @Min(1, { message: 'Category is invalid' })
  categoryId?: number;

  @IsOptional()
  @ToInt()
  @IsInt({ message: 'Sub-category is invalid' })
  @Min(1, { message: 'Sub-category is invalid' })
  subcategoryId?: number;

  @IsOptional()
  @Trim()
  @IsString()
  uom?: string;

  @IsOptional()
  @IsIn(['Active', 'Inactive'], {
    message: 'Status must be Active or Inactive',
  })
  status?: Status;
}

export class BulkImportDto {
  /** Raw rows, each validated independently by the service. */
  @IsArray({ message: 'rows must be an array' })
  @ArrayNotEmpty({ message: 'rows must not be empty' })
  @ArrayMaxSize(5000, { message: 'rows exceeds the 5000 row limit' })
  rows: Record<string, unknown>[];
}
