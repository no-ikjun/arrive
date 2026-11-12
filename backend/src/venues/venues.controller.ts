import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { VenuesService } from './venues.service';

@ApiTags('venues')
@Controller('v1/venues')
export class VenuesController {
  constructor(private readonly venues: VenuesService) {}

  @Get(':venueId')
  @ApiOperation({ operationId: 'getVenue' })
  @ApiOkResponse({ description: 'Versioned venue catalog' })
  getVenue(@Param('venueId') venueId: string) {
    return this.venues.getById(venueId);
  }
}
