import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ShareRequest } from '../sessions/auth';
import { SessionsService } from '../sessions/sessions.service';
import { ShareGuard } from './share.guard';

@ApiTags('sharing')
@Controller('v1/shared-session')
export class SharingController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  @UseGuards(ShareGuard)
  @ApiBearerAuth('shareBearer')
  @ApiOperation({ operationId: 'getSharedSession' })
  getShared(@Req() request: ShareRequest) {
    return this.sessions.getShared(request.shareAuth.sessionId);
  }
}
