import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { VenuesModule } from '../venues/venues.module';
import { OwnerGuard } from './owner.guard';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [PersistenceModule, VenuesModule],
  controllers: [SessionsController],
  providers: [SessionsService, OwnerGuard],
  exports: [SessionsService],
})
export class SessionsModule {}
