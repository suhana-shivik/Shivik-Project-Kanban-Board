import { Module } from '@nestjs/common';
import { CategoryController } from './category.controller';
import { CategoryRepository } from './category.repository';
import { CategoryService } from './category.service';
import { MaterialController } from './material.controller';
import { MaterialRepository } from './material.repository';
import { MaterialService } from './material.service';
import { SubcategoryController } from './subcategory.controller';
import { SubcategoryRepository } from './subcategory.repository';
import { SubcategoryService } from './subcategory.service';

@Module({
  controllers: [CategoryController, SubcategoryController, MaterialController],
  providers: [
    CategoryService,
    SubcategoryService,
    MaterialService,
    // all SQL for these tables lives in the repositories, nowhere else
    CategoryRepository,
    SubcategoryRepository,
    MaterialRepository,
  ],
  exports: [
    CategoryService,
    SubcategoryService,
    MaterialService,
    CategoryRepository,
  ],
})
export class MaterialModule {}
