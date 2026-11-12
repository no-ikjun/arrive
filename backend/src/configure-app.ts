import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, type NextFunction, type Request, type Response } from 'express';
import type { AppEnv } from './config/app-env';
import { ApiError } from './common/api-error';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { NoStoreInterceptor } from './common/no-store.interceptor';

export function configureApp(app: INestApplication, env: AppEnv): void {
  app.use(json({ limit: env.bodyLimit }));
  app.use((error: { type?: string }, _req: Request, res: Response, next: NextFunction) => {
    if (error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large') {
      res.status(400).setHeader('Cache-Control', 'no-store').json({
        code: 'INVALID_REQUEST',
        message: error.type === 'entity.too.large' ? '요청 본문이 너무 큽니다.' : 'JSON 본문을 해석할 수 없습니다.',
      });
      return;
    }
    next(error);
  });
  app.enableCors({
    origin: env.corsOrigins,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
    maxAge: 600,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: () => new ApiError(400, 'INVALID_REQUEST', '요청 형식이 올바르지 않습니다.'),
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new NoStoreInterceptor());

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Arrive Together session API')
      .setDescription('로컬 개발용 문서입니다. 계약의 기준은 contracts/openapi.yaml 입니다.')
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'ownerBearer')
      .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'shareBearer')
      .build(),
  );
  SwaggerModule.setup('docs', app, document);
}
