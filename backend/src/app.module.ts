import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_ENV, type AppEnv } from './config/app-env';
import { AppConfigModule } from './config/app-config.module';
import { HealthModule } from './health/health.module';
import { PersistenceModule } from './persistence/persistence.module';
import { SessionsModule } from './sessions/sessions.module';
import { SharingModule } from './sharing/sharing.module';
import { VenuesModule } from './venues/venues.module';

@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [APP_ENV],
      useFactory: (env: AppEnv) => ({
        throttlers: [{ ttl: env.throttleTtlMs, limit: env.throttleLimit }],
      }),
    }),
    PersistenceModule,
    HealthModule,
    VenuesModule,
    SessionsModule,
    SharingModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
