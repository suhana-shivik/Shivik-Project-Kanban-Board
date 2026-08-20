import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/auth.decorators';
import { BulkImportDto, MaterialQueryDto } from './dto/material.dto';
import { MaterialService } from './material.service';
import { paginate } from '../common/pagination';

/** Writes belong to admin and material_manager; every role can read. */
@Controller('materials')
export class MaterialController {
  constructor(private readonly materialService: MaterialService) {}

  @Get()
  @RequirePermissions('material:read')
  async findAll(@Query() query: MaterialQueryDto) {
    return paginate(await this.materialService.findAll(query), query);
  }

  // declared before ':id' so "bulk-import" is not parsed as an id
  @Post('bulk-import')
  @RequirePermissions('material:create')
  @HttpCode(HttpStatus.OK)
  bulkImport(@Body() dto: BulkImportDto) {
    return this.materialService.bulkImport(dto.rows);
  }

  @Get(':id')
  @RequirePermissions('material:read')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.materialService.findOne(id);
  }

  // the body is deliberately untyped: the service validates it so shape errors
  // and business errors can be reported together in one { errors } object
  @Post()
  @RequirePermissions('material:create')
  create(@Body() body: Record<string, unknown>) {
    return this.materialService.create(body);
  }

  @Put(':id')
  @RequirePermissions('material:update')
  replace(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    return this.materialService.replace(id, body);
  }

  @Patch(':id/status')
  @RequirePermissions('material:update')
  toggleStatus(@Param('id', ParseIntPipe) id: number) {
    return this.materialService.toggleStatus(id);
  }

  @Delete(':id')
  @RequirePermissions('material:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.materialService.remove(id);
  }
}
