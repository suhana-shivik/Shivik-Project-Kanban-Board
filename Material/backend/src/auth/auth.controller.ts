import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFiles as Files,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  UPLOAD_FIELDS,
  uploadOptions,
  type UploadedFiles,
} from '../uploads/upload.config';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from './auth.decorators';
import type { AuthUser } from './auth.decorators';
import { ChangePasswordDto, LoginDto, RegisterUserDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Public sign-up. `multipart/form-data`, so the profile image and digital
   * signature upload with the rest of the form. Role defaults to `viewer` and
   * `admin` is refused — only an existing admin can hand that out, via
   * POST /api/users.
   */
  @Public()
  @Post('register')
  @UseInterceptors(FileFieldsInterceptor(UPLOAD_FIELDS, uploadOptions()))
  register(@Body() dto: RegisterUserDto, @Files() files: UploadedFiles = {}) {
    return this.authService.register(dto, files);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /** Lets a login screen show what each role can do before anyone signs in. */
  @Public()
  @Get('roles')
  roles() {
    return this.authService.roles();
  }

  /** Any signed-in role — no @RequirePermissions, it is about yourself. */
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.profile(user);
  }

  @Get('permissions')
  permissions(@CurrentUser() user: AuthUser) {
    return { role: user.role, permissions: user.permissions };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user, dto);
  }
}
