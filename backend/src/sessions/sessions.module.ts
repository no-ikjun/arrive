import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { VenuesModule } from '../venues/venues.module';
import { HandoffSessionController } from './handoff-session.controller';
import { HandoffGuard } from './handoff.guard';
import { OwnerGuard } from './owner.guard';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [PersistenceModule, VenuesModule],
  controllers: [SessionsController, HandoffSessionController],
  providers: [SessionsService, OwnerGuard, HandoffGuard],
  exports: [SessionsService],
})
export class SessionsModule {}
