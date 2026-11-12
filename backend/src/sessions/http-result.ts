import type { ErrorCode } from '../common/api-error';

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
