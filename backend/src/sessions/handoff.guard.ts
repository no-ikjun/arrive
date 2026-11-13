import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ApiError } from '../common/api-error';
import { isExpired } from '../common/time';
import { DatabaseService } from '../persistence/database.service';
import { handoffTokens, sessions } from '../persistence/schema';
import { TokenService } from '../persistence/token.service';
import { readBearer, type HandoffRequest } from './auth';

@Injectable()
export class HandoffGuard implements CanActivate {
  constructor(
    private readonly database: DatabaseService,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<HandoffRequest>();
    const token = readBearer(request);
    if (!token) {
      throw new ApiError(401, 'UNAUTHORIZED', '인증 정보가 필요합니다.');
    }
    const hash = this.tokens.hash(token);
    const [handoff] = await this.database.db
      .select()
      .from(handoffTokens)
      .where(eq(handoffTokens.tokenHash, hash))
      .limit(1);
    if (!handoff) {
      const [owned] = await this.database.db
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.ownerTokenHash, hash))
        .limit(1);
      if (owned) {
        throw new ApiError(401, 'UNAUTHORIZED', '소유자 토큰으로는 휴대폰 이어가기를 할 수 없습니다.');
      }
      const [shared] = await this.database.db
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.shareTokenHash, hash))
        .limit(1);
      if (shared) {
        throw new ApiError(401, 'UNAUTHORIZED', '공유 토큰으로는 휴대폰 이어가기를 할 수 없습니다.');
      }
      throw new ApiError(404, 'NOT_FOUND', '세션을 찾을 수 없습니다.');
    }
    const [session] = await this.database.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, handoff.sessionId))
      .limit(1);
    if (!session) {
      throw new ApiError(404, 'NOT_FOUND', '세션을 찾을 수 없습니다.');
    }
    if (isExpired(session.expiresAt) || isExpired(handoff.expiresAt)) {
      throw new ApiError(401, 'UNAUTHORIZED', '인증 정보가 만료되었습니다.');
    }
    request.handoffAuth = { sessionId: session.id, tokenHash: hash };
    return true;
  }
}
