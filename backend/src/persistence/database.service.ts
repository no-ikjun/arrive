import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import path from 'path';
import { mkdirSync } from 'fs';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { APP_ENV, type AppEnv } from '../config/app-env';
import * as schema from './schema';

export type AppDatabase = NodePgDatabase<typeof schema>;

type PgliteClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  close: () => Promise<void>;
};

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  db!: AppDatabase;
  private pool?: Pool;
  private embedded?: PgliteClient;
  private tail: Promise<void> = Promise.resolve();

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  async onModuleInit(): Promise<void> {
    const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
    if (this.env.databaseUrl) {
      this.pool = new Pool({ connectionString: this.env.databaseUrl });
      this.db = drizzle(this.pool, { schema });
      await migratePg(this.db, { migrationsFolder });
      return;
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_URL is required in production');
    }
    const { PGlite } = await import('@electric-sql/pglite');
    mkdirSync(this.env.databasePath, { recursive: true });
    const client = new PGlite(this.env.databasePath);
    this.embedded = client;
    const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    const embeddedDb = drizzlePglite(client, { schema });
    await migrate(embeddedDb, { migrationsFolder });
    this.db = embeddedDb as unknown as AppDatabase;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
    await this.embedded?.close();
  }

  async execute(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    if (this.pool) {
      const result = await this.pool.query(sql, params);
      return result.rows as Record<string, unknown>[];
    }
    if (!this.embedded) throw new Error('database is not open');
    const result = await this.embedded.query(sql, params);
    return result.rows;
  }

  transaction<T>(fn: (tx: AppDatabase) => Promise<T>): Promise<T> {
    const run = this.tail.then(() => this.db.transaction((tx) => fn(tx as AppDatabase)));
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
