import { Controller, Get, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { VenueListDto } from './venue.dto';
import { VenuesService } from './venues.service';

@ApiTags('venues')
@Controller('v1/venues')
export class VenuesController {
  constructor(private readonly venues: VenuesService) {}

  @Get()
  @ApiOperation({ operationId: 'listVenues' })
  @ApiOkResponse({
    type: VenueListDto,
    description: '각 장소의 현재 버전만 인덱스 순서로 반환합니다. 장소가 없으면 items는 빈 배열입니다.',
  })
  list() {
    return { items: this.venues.list() };
  }

  @Get(':venueId/versions/:catalogVersion')
  @ApiOperation({ operationId: 'getVenueVersion' })
  @ApiOkResponse({
    description: '요청한 장소와 버전의 Venue 카탈로그입니다. 응답 식별자는 요청한 조합과 같습니다.',
  })
  @ApiNotFoundResponse({
    description: '장소 또는 버전이 없습니다. 다른 버전으로 대체하지 않습니다.',
  })
  getVersion(@Param('venueId') venueId: string, @Param('catalogVersion') catalogVersion: string) {
    return this.venues.getVersion(venueId, catalogVersion);
  }

  @Get(':venueId')
  @ApiOperation({ operationId: 'getVenue' })
  @ApiOkResponse({ description: '해당 장소의 현재 버전 Venue 카탈로그입니다.' })
  @ApiNotFoundResponse({ description: '장소를 찾을 수 없습니다.' })
  getVenue(@Param('venueId') venueId: string) {
    return this.venues.getById(venueId);
  }
}
