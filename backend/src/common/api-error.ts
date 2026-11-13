import { HttpException } from '@nestjs/common';

export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'INVALID_TRANSITION'
  | 'INVALID_STAGE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RATE_LIMITED'
  | 'CATALOG_UNAVAILABLE';

export class ApiError extends HttpException {
  constructor(
    status: number,
    readonly code: ErrorCode,
    message: string,
    readonly currentRevision?: number,
  ) {
    super(message, status);
  }
}

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  currentRevision?: number;
}

export function errorBody(error: ApiError): ErrorBody {
  const body: ErrorBody = { code: error.code, message: error.message };
  if (error.currentRevision !== undefined) body.currentRevision = error.currentRevision;
  return body;
}
