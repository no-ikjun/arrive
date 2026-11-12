import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.module';
import { CleanupService } from './cleanup.service';
import { DatabaseService } from './database.service';
import { TokenService } from './token.service';

@Module({
  imports: [AppConfigModule],
  providers: [DatabaseService, TokenService, CleanupService],
  exports: [DatabaseService, TokenService, CleanupService],
})
export class PersistenceModule {}
