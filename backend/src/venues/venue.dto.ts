import { ApiProperty } from '@nestjs/swagger';

export class VenueSummaryDto {
  @ApiProperty({ example: 'gist-oryong-demo' })
  venueId!: string;

  @ApiProperty({ example: 'oryong-demo-v2' })
  catalogVersion!: string;

  @ApiProperty({ example: 'GIST 오룡관' })
  name!: string;

  @ApiProperty({ enum: ['DEMO_UNVERIFIED', 'VERIFIED'], example: 'DEMO_UNVERIFIED' })
  verification!: 'DEMO_UNVERIFIED' | 'VERIFIED';
}

export class VenueListDto {
  @ApiProperty({ type: [VenueSummaryDto] })
  items!: VenueSummaryDto[];
}
