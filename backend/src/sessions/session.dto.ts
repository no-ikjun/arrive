import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Equals, IsIn, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { TRIP_EVENTS, type TripEvent } from './trip';

export class CreateSessionDto {
  @ApiProperty({ example: 'gist-oryong-demo' })
  @IsString()
  @IsNotEmpty()
  venueId!: string;

  @ApiProperty({ example: 'oryong-demo-v2' })
  @IsString()
  @IsNotEmpty()
  catalogVersion!: string;
}

export class IssueHandoffDto {
  @ApiHideProperty()
  @Equals(undefined)
  extra?: undefined;
}

export class ConfirmHandoffReunionDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

export class ApplyEventDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @ApiProperty({ enum: TRIP_EVENTS })
  @IsIn(TRIP_EVENTS)
  event!: TripEvent;
}
