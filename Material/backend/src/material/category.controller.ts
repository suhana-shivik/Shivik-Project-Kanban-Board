import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/auth.decorators';
import { CategoryService } from './category.service';
import {
  CategoryQueryDto,
  CreateCategoryDto,
  SubcategoryQueryDto,
  UpdateCategoryDto,
  CreateCategoriesDto,
} from './dto/category.dto';
import { SubcategoryService } from './subcategory.service';
import { paginate } from '../common/pagination';

/** Writes belong to admin and category_manager; every role can read. */
@Controller('categories')
export class CategoryController {
  constructor(
    private readonly categoryService: CategoryService,
    private readonly subcategoryService: SubcategoryService,
  ) {}

  @Get()
  @RequirePermissions('category:read')
  async findAll(@Query() query: CategoryQueryDto) {
    return paginate(await this.categoryService.findAll(query), query);
  }

  @Get(':id')
  @RequirePermissions('category:read')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.categoryService.findOne(id);
  }

  // reads two resources, so it asks for both permissions
  @Get(':id/subcategories')
  @RequirePermissions('category:read', 'subcategory:read')
  findSubcategories(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: SubcategoryQueryDto,
  ) {
    return this.subcategoryService.findAll({ ...query, categoryId: id });
  }

  @Post()
  @RequirePermissions('category:create')
  create(@Body() dto: CreateCategoryDto) {
    return this.categoryService.create(dto);
  }

  @Post('bulk-import')
  @RequirePermissions('category:create')
  async bulkImport(@Body() dto: CreateCategoriesDto) {
    return this.categoryService.bulkCreateCategories(dto.categories);
  }

  @Put(':id')
  @RequirePermissions('category:update')
  replace(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoryService.replace(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('category:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.categoryService.remove(id);
  }
}