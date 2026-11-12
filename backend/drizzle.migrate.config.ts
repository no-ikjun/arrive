import { defineConfig } from 'drizzle-kit';

/** 마이그레이션 적용 전용. 배포 스크립트는 npm run db:migrate 를 사용합니다. */
export default defineConfig({
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://arrive:arrive@localhost:5432/arrive',
  },
});
