import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Public } from '../auth/auth.decorators';
import { MetricsService } from './metrics.service';

/** Copied next to the compiled JS by the nest-cli `assets` rule. */
const DASHBOARD_PATH = join(__dirname, 'dashboard.html');

/**
 * The one controller left outside RBAC. dashboard.html is opened straight in a
 * browser tab and polls these routes with plain fetch, so there is nowhere to
 * attach a bearer token. It exposes request counts, not business data.
 */
@Public()
@Controller('metrics')
export class MetricsController {
  private dashboard?: string;

  constructor(private readonly metrics: MetricsService) {}

  @Get()
  snapshot() {
    return this.metrics.snapshot();
  }

  @Get('dashboard')
  @Header('Content-Type', 'text/html; charset=utf-8')
  dashboardPage(): string {
    this.dashboard ??= readFileSync(DASHBOARD_PATH, 'utf8');
    return this.dashboard;
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  reset() {
    this.metrics.reset();
    return { message: 'Metrics reset', since: new Date().toISOString() };
  }
}
