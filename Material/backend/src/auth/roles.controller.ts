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
import { Public, RequirePermissions } from './auth.decorators';
import {
  CreateRoleDto,
  PermissionRowDto,
  RoleQueryDto,
  SubmitPermissionsDto,
  UpdateRoleDto,
} from './dto/role.dto';
import { RolesService } from './roles.service';

/** Backs the "Roles & Permissions" screen. */
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  /** The swatch palette. Public so a login or sign-up page can render it. */
  @Public()
  @Get('colors')
  colors() {
    return this.rolesService.colors();
  }

  /** Everything the ADD PERMISSION dropdown can offer. */
  @Get('modules')
  @RequirePermissions('role:read')
  modules() {
    return this.rolesService.modules();
  }

  /** The left-hand roles list. */
  @Get()
  @RequirePermissions('role:read')
  findAll(@Query() query: RoleQueryDto) {
    return this.rolesService.findAll(query.query);
  }

  /** One role plus its Configured Permissions grid. */
  @Get(':id')
  @RequirePermissions('role:read')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.findOne(id);
  }

  /** "Create New Role" — name plus the colour swatch. */
  @Post()
  @RequirePermissions('role:create')
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('role:update')
  replace(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    return this.rolesService.replace(id, dto);
  }

  /** SUBMIT PERMISSIONS — the posted grid replaces the stored one. */
  @Put(':id/permissions')
  @RequirePermissions('role:update')
  submitPermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitPermissionsDto,
  ) {
    return this.rolesService.submitPermissions(id, dto);
  }

  /** ADD PERMISSION — a single module row. */
  @Post(':id/permissions')
  @RequirePermissions('role:update')
  @HttpCode(HttpStatus.OK)
  addPermission(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PermissionRowDto,
  ) {
    return this.rolesService.addPermission(id, dto);
  }

  /** The trash icon at the end of a grid row. */
  @Delete(':id/permissions/:moduleId')
  @RequirePermissions('role:update')
  @HttpCode(HttpStatus.NO_CONTENT)
  removePermission(
    @Param('id', ParseIntPipe) id: number,
    @Param('moduleId', ParseIntPipe) moduleId: number,
  ) {
    return this.rolesService.removePermission(id, moduleId);
  }

  /** DELETE ROLE. */
  @Delete(':id')
  @RequirePermissions('role:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.remove(id);
  }
}
