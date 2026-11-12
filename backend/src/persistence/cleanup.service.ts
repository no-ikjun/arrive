import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { lte } from 'drizzle-orm';
import { APP_ENV, type AppEnv } from '../config/app-env';
import { nowIso } from '../common/time';
import { DatabaseService } from './database.service';
import { idempotencyRecords, sessions } from './schema';

@Injectable()
export class CleanupService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly database: DatabaseService,
  ) {}

  onModuleInit(): void {
    if (this.env.cleanupIntervalMs <= 0) return;
    void this.cleanup();
    this.timer = setInterval(() => void this.cleanup(), this.env.cleanupIntervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  cleanup(now = Date.now()): Promise<void> {
    const cutoff = nowIso(now);
    return this.database.transaction(async (tx) => {
      await tx.delete(sessions).where(lte(sessions.expiresAt, cutoff));
      await tx.delete(idempotencyRecords).where(lte(idempotencyRecords.expiresAt, cutoff));
    });
  }
}
