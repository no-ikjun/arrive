import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { OwnerRequest } from './auth';
import { requireIdempotencyKey, unwrap } from './http-result';
import { OwnerGuard } from './owner.guard';
import { ApplyEventDto, CreateSessionDto, IssueHandoffDto } from './session.dto';
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

  @Post(':sessionId/handoffs')
  @UseGuards(OwnerGuard)
  @HttpCode(201)
  @ApiBearerAuth('ownerBearer')
  @ApiOperation({ operationId: 'issueHandoff' })
  async issueHandoff(
    @Param('sessionId') sessionId: string,
    @Req() request: OwnerRequest,
    @Body() _body: IssueHandoffDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const result = await this.sessions.issueHandoff(
      sessionId,
      request.ownerAuth.ownerHash,
      requireIdempotencyKey(idempotencyKey),
    );
    return unwrap(result, 201);
  }
}
