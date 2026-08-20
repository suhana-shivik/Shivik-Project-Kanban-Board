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
import { RequirePermissions } from './auth.decorators';
import { DepartmentsService } from './departments.service';
import { paginate } from '../common/pagination';
import {
  CreateDepartmentDto,
  DepartmentQueryDto,
  UpdateDepartmentDto,
} from './dto/department.dto';

/** Backs the Departments tab. */
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @RequirePermissions('department:read')
  async findAll(@Query() query: DepartmentQueryDto) {
    return paginate(await this.departmentsService.findAll(query), query);
  }

  @Get(':id')
  @RequirePermissions('department:read')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.departmentsService.findOne(id);
  }

  @Get(':id/children')
  @RequirePermissions('department:read')
  findChildren(@Param('id', ParseIntPipe) id: number) {
    return this.departmentsService.findChildren(id);
  }

  /** "Add New Department" — name plus an optional parent. */
  @Post()
  @RequirePermissions('department:create')
  create(@Body() dto: CreateDepartmentDto) {
    return this.departmentsService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('department:update')
  replace(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.departmentsService.replace(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('department:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.departmentsService.remove(id);
  }
}
