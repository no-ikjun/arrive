import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller()
export class HealthController {
  @Get('health')
  @ApiOperation({ operationId: 'getHealth' })
  @ApiOkResponse({ schema: { properties: { status: { type: 'string', enum: ['ok'] } } } })
  getHealth() {
    return { status: 'ok' as const };
  }
}
