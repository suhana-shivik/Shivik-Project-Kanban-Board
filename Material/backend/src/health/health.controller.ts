import { Controller, Get } from '@nestjs/common';
import { version, name } from '../../package.json';

@Controller('health')
export class HealthController {
  @Get('version')
  getVersion() {
    return { name, version };
  }
}