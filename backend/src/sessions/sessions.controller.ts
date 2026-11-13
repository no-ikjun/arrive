import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiError, type ErrorCode } from '../common/api-error';
import { normalizeUuid } from '../common/uuid';
import type { OwnerRequest } from './auth';
import type { HttpResult } from './http-result';
import { OwnerGuard } from './owner.guard';
import { ApplyEventDto, CreateSessionDto } from './session.dto';
import { SessionsService } from './sessions.service';

@ApiTags('sessions')
@Controller('v1/sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ operationId: 'createSession' })
  async create(@Body() body: CreateSessionDto, @Headers('idempotency-key') idempotencyKey?: string) {
    const result = await this.sessions.create(body, requireIdempotencyKey(idempotencyKey));
    return unwrap(result, 201);
  }

  @Get(':sessionId')
  @UseGuards(OwnerGuard)
  @ApiBearerAuth('ownerBearer')
  @ApiOperation({ operationId: 'getOwnedSession' })
  getOwned(@Param('sessionId') sessionId: string, @Req() request: OwnerRequest) {
    return this.sessions.getOwned(sessionId, request.ownerAuth.ownerHash);
  }

  @Delete(':sessionId')
  @UseGuards(OwnerGuard)
  @HttpCode(204)
  @ApiBearerAuth('ownerBearer')
  @ApiOperation({ operationId: 'deleteSession' })
  async delete(@Param('sessionId') sessionId: string, @Req() request: OwnerRequest): Promise<void> {
    const result = await this.sessions.delete(sessionId, request.ownerAuth.ownerHash);
    unwrap(result, 204);
  }

  @Post(':sessionId/events')
  @UseGuards(OwnerGuard)
  @HttpCode(200)
  @ApiBearerAuth('ownerBearer')
  @ApiOperation({ operationId: 'applySessionEvent' })
  @ApiResponse({
    status: 500,
    description:
      '세션에 고정된 카탈로그가 없으면 이벤트를 적용하지 않고 revision을 유지합니다. 이 응답은 멱등 기록에 남기지 않습니다. 버전 파일을 인덱스에 다시 넣고 재시작하세요. 최신 버전으로 대체하지 않습니다.',
  })
  async applyEvent(
    @Param('sessionId') sessionId: string,
    @Req() request: OwnerRequest,
    @Body() body: ApplyEventDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const result = await this.sessions.applyEvent(
      sessionId,
      request.ownerAuth.ownerHash,
      body,
      requireIdempotencyKey(idempotencyKey),
    );
    return unwrap(result, 200);
  }
}

function requireIdempotencyKey(value: string | undefined): string {
  const key = normalizeUuid(value);
  if (!key) {
    throw new ApiError(400, 'INVALID_REQUEST', 'Idempotency-Key 헤더에 UUID가 필요합니다.');
  }
  return key;
}

function unwrap(result: HttpResult, success: number): Record<string, unknown> | undefined {
  if (result.httpStatus === success) return result.body ?? undefined;
  const code = result.body?.code;
  const message = result.body?.message;
  const currentRevision = result.body?.currentRevision;
  throw new ApiError(
    result.httpStatus,
    (typeof code === 'string' ? code : 'INVALID_REQUEST') as ErrorCode,
    typeof message === 'string' ? message : '요청을 처리하지 못했습니다.',
    typeof currentRevision === 'number' ? currentRevision : undefined,
  );
}
