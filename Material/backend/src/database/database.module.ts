import { Global, Module } from '@nestjs/common';
import { databaseProvider, kyselyProvider } from './database.provider';
import { DbService } from './db.service';
import { SchemaService } from './schema.service';

/**
 * Global so every feature module can inject DbService without importing this
 * one.
 */
@Global()
@Module({
  providers: [databaseProvider, kyselyProvider, DbService, SchemaService],
  exports: [databaseProvider, kyselyProvider, DbService],
})
export class DatabaseModule {}
