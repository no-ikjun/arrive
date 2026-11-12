import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ApiError } from '../common/api-error';
import { isExpired } from '../common/time';
import { readBearer, type ShareRequest } from '../sessions/auth';
import { DatabaseService } from '../persistence/database.service';
import { sessions } from '../persistence/schema';
import { TokenService } from '../persistence/token.service';

@Injectable()
export class ShareGuard implements CanActivate {
  constructor(
    private readonly database: DatabaseService,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ShareRequest>();
    const token = readBearer(request);
    if (!token) {
      throw new ApiError(401, 'UNAUTHORIZED', '인증 정보가 필요합니다.');
    }
    const hash = this.tokens.hash(token);
    const [shared] = await this.database.db
      .select()
      .from(sessions)
      .where(eq(sessions.shareTokenHash, hash))
      .limit(1);
    if (!shared) {
      const [owned] = await this.database.db
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.ownerTokenHash, hash))
        .limit(1);
      if (owned) {
        throw new ApiError(401, 'UNAUTHORIZED', '소유자 토큰으로는 공유 조회를 할 수 없습니다.');
      }
      throw new ApiError(404, 'NOT_FOUND', '세션을 찾을 수 없습니다.');
    }
    if (isExpired(shared.expiresAt)) {
      throw new ApiError(404, 'NOT_FOUND', '세션을 찾을 수 없습니다.');
    }
    request.shareAuth = { sessionId: shared.id };
    return true;
  }
}
