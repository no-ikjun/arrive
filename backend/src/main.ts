import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { APP_ENV, type AppEnv } from './config/app-env';
import { loadDotEnv } from './config/load-dot-env';
import { configureApp } from './configure-app';

async function bootstrap(): Promise<void> {
  loadDotEnv();
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: ['error', 'warn', 'log'],
  });
  const env = app.get<AppEnv>(APP_ENV);
  configureApp(app, env);
  await app.listen(env.port);
}

void bootstrap();
