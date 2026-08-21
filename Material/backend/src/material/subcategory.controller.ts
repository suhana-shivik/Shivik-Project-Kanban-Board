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
import { SubcategoryQueryDto } from './dto/category.dto';
import {
  CreateSubcategoryDto,
  UpdateSubcategoryDto,
} from './dto/subcategory.dto';
import { CreateSubcategoriesDto } from './dto/bulk-subcategory.dto';
import { SubcategoryService } from './subcategory.service';
import { paginate } from '../common/pagination';

/** Same owner as categories: admin and category_manager write, all read. */
@Controller('subcategories')
export class SubcategoryController {
  constructor(private readonly subcategoryService: SubcategoryService) {}

  @Get()
  @RequirePermissions('subcategory:read')
  async findAll(@Query() query: SubcategoryQueryDto) {
    return paginate(await this.subcategoryService.findAll(query), query);
  }

  @Get(':id')
  @RequirePermissions('subcategory:read')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.subcategoryService.findOne(id);
  }

  @Get(':id/children')
  @RequirePermissions('subcategory:read')
  findChildren(@Param('id', ParseIntPipe) id: number) {
    return this.subcategoryService.findChildren(id);
  }

  @Post()
  @RequirePermissions('subcategory:create')
  create(@Body() dto: CreateSubcategoryDto) {
    return this.subcategoryService.create(dto);
  }

  @Post('bulk-import')
  @RequirePermissions('subcategory:create')
  async bulkImport(@Body() dto: CreateSubcategoriesDto) {
    return this.subcategoryService.bulkCreateSubcategories(dto.subcategories);
  }

  @Put(':id')
  @RequirePermissions('subcategory:update')
  replace(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSubcategoryDto,
  ) {
    return this.subcategoryService.replace(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('subcategory:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.subcategoryService.remove(id);
  }
}