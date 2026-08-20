import { Module } from '@nestjs/common';
import { MaterialModule } from '../material/material.module';
import { DiagnosticsController } from './diagnostics.controller';
import { HerdService } from './herd.service';

/**
 * Kept in its own module so nothing in the product depends on it — deleting
 * this folder would leave the API working exactly as before.
 */
@Module({
  imports: [MaterialModule],
  controllers: [DiagnosticsController],
  providers: [HerdService],
})
export class DiagnosticsModule {}
