import { IsArray, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateSubcategoryDto } from './subcategory.dto';

export class CreateSubcategoriesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSubcategoryDto)
  @IsNotEmpty()
  subcategories: CreateSubcategoryDto[];
}