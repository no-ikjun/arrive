import { ApiError, type ErrorCode } from '../common/api-error';
import { normalizeUuid } from '../common/uuid';

export interface HttpResult {
  httpStatus: number;
  body: Record<string, unknown> | null;
}

export function errorResult(
  status: number,
  code: ErrorCode,
  message: string,
  currentRevision?: number,
): HttpResult {
  const body: Record<string, unknown> = { code, message };
  if (currentRevision !== undefined) body.currentRevision = currentRevision;
  return { httpStatus: status, body };
}

export function requireIdempotencyKey(value: string | undefined): string {
  const key = normalizeUuid(value);
  if (!key) {
    throw new ApiError(400, 'INVALID_REQUEST', 'Idempotency-Key 헤더에 UUID가 필요합니다.');
  }
  return key;
}

export function unwrap(result: HttpResult, success: number): Record<string, unknown> | undefined {
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
