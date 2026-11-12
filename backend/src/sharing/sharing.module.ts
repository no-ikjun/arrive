import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { SessionsModule } from '../sessions/sessions.module';
import { ShareGuard } from './share.guard';
import { SharingController } from './sharing.controller';

@Module({
  imports: [PersistenceModule, SessionsModule],
  controllers: [SharingController],
  providers: [ShareGuard],
})
export class SharingModule {}
