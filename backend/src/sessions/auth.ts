import type { Request } from 'express';

export interface OwnerAuth {
  sessionId: string;
  ownerHash: string;
}

export interface ShareAuth {
  sessionId: string;
}

export type OwnerRequest = Request & { ownerAuth: OwnerAuth };
export type ShareRequest = Request & { shareAuth: ShareAuth };

export function readBearer(request: Request): string | undefined {
  const header = request.header('authorization');
  if (!header) return undefined;
  const match = /^Bearer ([^\s]+)$/.exec(header);
  return match?.[1];
}
