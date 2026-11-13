import { Body, Controller, Get, Headers, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HandoffRequest } from './auth';
import { HandoffGuard } from './handoff.guard';
import { requireIdempotencyKey, unwrap } from './http-result';
import { ConfirmHandoffReunionDto } from './session.dto';
import { SessionsService } from './sessions.service';

@ApiTags('handoff')
@Controller('v1/handoff-session')
export class HandoffSessionController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  @UseGuards(HandoffGuard)
  @ApiBearerAuth('handoffBearer')
  @ApiOperation({ operationId: 'getHandoffSession' })
  get(@Req() request: HandoffRequest) {
    return this.sessions.getHandoff(request.handoffAuth.sessionId, request.handoffAuth.tokenHash);
  }

  @Post('reunion')
  @UseGuards(HandoffGuard)
  @HttpCode(200)
  @ApiBearerAuth('handoffBearer')
  @ApiOperation({ operationId: 'confirmHandoffReunion' })
  async reunion(
    @Req() request: HandoffRequest,
    @Body() body: ConfirmHandoffReunionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const result = await this.sessions.confirmHandoffReunion(
      request.handoffAuth.sessionId,
      request.handoffAuth.tokenHash,
      body.expectedRevision,
      requireIdempotencyKey(idempotencyKey),
    );
    return unwrap(result, 200);
  }
}
