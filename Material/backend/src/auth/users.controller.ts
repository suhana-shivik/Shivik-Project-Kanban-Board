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
  UploadedFiles as Files,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  UPLOAD_FIELDS,
  uploadOptions,
  type UploadedFiles,
} from '../uploads/upload.config';
import { CurrentUser, Public, RequirePermissions } from './auth.decorators';
import type { AuthUser } from './auth.decorators';
import {
  ChangeRoleDto,
  RegisterUserDto,
  UpdateUserDto,
  UserQueryDto,
} from './dto/auth.dto';
import { UsersService } from './users.service';
import { paginate } from '../common/pagination';

/** Every route here needs a user:* permission, which only admin holds. */
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Departments and projects for the two pickers on the form. Public because
   * the sign-up page has to render them before anyone has a token.
   */
  @Public()
  @Get('lookups')
  lookups() {
    return this.usersService.lookups();
  }

  /** Candidates for the "Reporting to" picker. */
  @Get('managers')
  @RequirePermissions('user:read')
  managers() {
    return this.usersService.managers();
  }

  @Get()
  @RequirePermissions('user:read')
  async findAll(@Query() query: UserQueryDto) {
    return paginate(await this.usersService.findAll(query), query);
  }

  @Get(':id')
  @RequirePermissions('user:read')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  /** The "Add New User" dialog. Same body as register, but may set any role. */
  @Post()
  @RequirePermissions('user:create')
  @UseInterceptors(FileFieldsInterceptor(UPLOAD_FIELDS, uploadOptions()))
  create(@Body() dto: RegisterUserDto, @Files() files: UploadedFiles = {}) {
    return this.usersService.create(dto, files);
  }

  @Put(':id')
  @RequirePermissions('user:update')
  @UseInterceptors(FileFieldsInterceptor(UPLOAD_FIELDS, uploadOptions()))
  replace(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() current: AuthUser,
    @Files() files: UploadedFiles = {},
  ) {
    return this.usersService.replace(id, dto, files, current);
  }

  @Patch(':id/role')
  @RequirePermissions('user:update')
  changeRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeRoleDto,
    @CurrentUser() current: AuthUser,
  ) {
    return this.usersService.changeRole(id, dto, current);
  }

  @Patch(':id/status')
  @RequirePermissions('user:update')
  toggleStatus(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() current: AuthUser,
  ) {
    return this.usersService.toggleStatus(id, current);
  }

  @Delete(':id')
  @RequirePermissions('user:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() current: AuthUser,
  ) {
    return this.usersService.remove(id, current);
  }
}
