import { IsArray, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateCategoryDto } from './category.dto';

export class CreateCategoriesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCategoryDto)
  @IsNotEmpty()
  categories: CreateCategoryDto[];
}