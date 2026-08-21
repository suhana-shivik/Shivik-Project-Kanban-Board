import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/auth.decorators';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Health check — has to answer before anyone can log in. */
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Dummy endpoint */
  @Get('dummy')
  getDummy(): string {
    return 'This is a dummy endpoint';
  }
}