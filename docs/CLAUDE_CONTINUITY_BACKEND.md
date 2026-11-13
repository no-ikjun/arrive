# Claude 전달용 · 주차 후 휴대폰 이어가기 API

## 작업 요청

운전자가 차량에서 주차 완료를 확인한 다음 QR로 휴대폰에 입구 안내를 이어받고, **실제 합류한 뒤 휴대폰에서 합류 완료를 확인**하도록 NestJS API를 추가해 주세요. Android/동승자 웹/Pages 프록시는 아래 계약에 맞춰 구현했습니다. 기존 공유 토큰은 조회 전용으로 유지해 주세요. 기존 엔드포인트의 동작을 바꾸지 않는 추가 기능입니다.

차량의 내비 사용 중 도착 감지와 복귀 알림은 Android가 처리합니다. 차량 좌표 업로드나 위치 저장 API는 필요하지 않습니다.

## 1. 휴대폰 토큰 발급

`POST /v1/sessions/:id/handoffs`

- 인증: 해당 방문의 **ownerToken**만 허용.
- 헤더: `Idempotency-Key: <UUID>`, `Content-Type: application/json`.
- 요청 본문: `{}`. 알 수 없는 필드 거부.
- 발급 가능한 단계: `WALKING_TO_MEETING`. 주차 완료의 서버 반영 이후에 Android가 호출합니다.
- 성공: 201 (같은 키의 재시도는 200 또는 201).

```json
{
  "sessionId": "<기존 방문 UUID>",
  "handoffToken": "<새로운 opaque token>",
  "expiresAt": "<기존 방문 expiresAt과 동일한 ISO 8601>"
}
```

handoffToken은 `[A-Za-z0-9_-]{43,256}`이며 ownerToken/shareToken과 반드시 달라야 합니다. 동작 범위는 해당 방문 조회 + 합류 확인뿐입니다. 기존 토큰 도메인과 구분하고 저장 시 기존 토큰 서비스의 해시/암호화 방식을 재사용해 주세요. 같은 owner/session/Idempotency-Key 요청은 **같은 토큰과 만료 시각**을 반환해야 합니다. 본문/방문이 다른 키 재사용은 409입니다. Android가 응답 유실 후 같은 키로 재시도합니다.

Android는 발급 키·토큰·만료를 기존 암호화 저장소에 저장합니다. 연결 URL은 `https://arrive.ikjun.com/#handoff=<token>`입니다. ownerToken을 URL이나 웹으로 넘기지 않습니다.

## 2. 휴대폰 방문 조회

`GET /v1/handoff-session`

- 인증: handoffToken만 허용. owner/share 역할과 혼용하지 않음.
- 성공: 기존 `PublicSession`의 모든 필드와 다음 두 필드를 **같은 최상위 JSON 객체**에 추가합니다. `{session: ...}`로 감싸지 않습니다.

```json
{
  "id": "<UUID>",
  "venueId": "gist-oryong-demo",
  "catalogVersion": "oryong-demo-v2",
  "stage": "WALKING_TO_MEETING",
  "parkingId": "<기존 parkingId>",
  "excludedParkingIds": [],
  "meetingPointId": "<기존 meetingPointId>",
  "revision": 4,
  "createdAt": "<ISO 8601>",
  "updatedAt": "<ISO 8601>",
  "expiresAt": "<ISO 8601>",
  "dataMode": "DEMO",
  "handoffExpiresAt": "<토큰 만료: 방문 expiresAt과 동일>",
  "capabilities": ["CONFIRM_REUNION"]
}
```

- `WALKING_TO_MEETING`에서만 capabilities에 `CONFIRM_REUNION` 포함.
- `REUNITED`/`CANCELLED`라면 조회는 가능하지만 capabilities는 `[]`.
- 기존 장소/카탈로그 버전, dataMode, meetingPointId를 유지합니다. 휴대폰 연결을 이유로 새 방문을 생성하지 않습니다.

## 3. 휴대폰 합류 완료

`POST /v1/handoff-session/reunion`

- 인증: handoffToken만 허용.
- 헤더: `Idempotency-Key: <UUID>`, `Content-Type: application/json`.
- 요청: `{ "expectedRevision": <양의 정수> }`. 다른 필드 거부.
- `WALKING_TO_MEETING → REUNITED` 전이만 허용. 기존 `CONFIRM_REUNION` 도메인 규칙/트랜잭션을 재사용합니다.
- revision 1 증가, updatedAt 갱신. 기존 운전자 GET과 동승자 GET에도 즉시 반영.
- 성공 200: **2번과 동일한 응답 형태**, stage=REUNITED, capabilities=[].
- 멱등성: 동일 token/session/key + 동일 본문 재전송 시 같은 성공 결과. 이미 성공한 요청의 재시도는 오래된 expectedRevision이어도 성공 재생. 인증·만료 검사는 재생 전 적용합니다.
- 아직 처리되지 않은 키의 revision 불일치: `409 {"code":"REVISION_CONFLICT"}`.
- 단계 위반: `409 {"code":"INVALID_STAGE"}`.
- 같은 키/다른 본문: `409 {"code":"IDEMPOTENCY_CONFLICT"}`.

웹은 응답 유실 시 완료를 추정하지 않습니다. 키와 expectedRevision을 같은 탭에 보관하고 사용자 재확인 시 재사용합니다. 이후 GET에서 REUNITED가 확인되면 보류 요청을 정리합니다. 409이면 최신 방문을 다시 읽고 새 사용자 확인을 받습니다.

## 공통 요구사항

- 인증 실패/만료 401 또는 403, 없는/삭제된 방문 404. 기존 방문 DELETE 시 handoffToken도 무효화.
- 토큰으로 주차장 변경·취소·새 방문·다른 방문 조회·owner 이벤트 전송은 불가능해야 합니다.
- shareToken으로 reunion POST를 호출해도 반드시 거부. 프록시는 토큰 문자열 형식만 검사하므로 **역할 검사는 서버가 책임집니다**.
- `Cache-Control: no-store`, 기존 오류 JSON 형식, 요청 본문 검증, 토큰 없는 로그, rate limit 및 429 Retry-After 유지.
- 원자적 revision 검사/전이/멱등성 저장. 동시 두 확인 요청으로 중복 증가하지 않아야 합니다.
- 추가 마이그레이션은 기존 방문과 토큰 데이터를 보존해야 합니다.
- OpenAPI와 실제 배포 반영까지 완료 후 아래 검사 결과를 알려 주세요.

## 반드시 확인할 시나리오

1. owner로 주차 완료 후 발급 → 휴대폰 GET → 합류 POST → 운전자/기존 동승자 GET 모두 REUNITED.
2. 발급 응답 유실 후 같은 키 재시도: 같은 handoffToken.
3. 합류 응답 유실 후 같은 키 재시도: revision 추가 증가 없이 성공.
4. 서로 다른 두 클라이언트가 동시에 합류: 한 전이만 발생, 다른 요청은 최신 상태 확인 가능.
5. shareToken/다른 owner/다른 session의 토큰을 사용한 쓰기·조회 거부.
6. 방문 삭제/만료 뒤 세 엔드포인트 접근 거부.
7. 주차 전 발급/합류, 잘못된 expectedRevision/알 수 없는 필드 거부.

## 프런트 구현 위치 / 현재 배포 한계

- Android: `SessionApi.handoff`, `VisitViewModel.prepareHandoff`, `PhoneHandoffDialog`.
- Web: `companion/public/handoff.js`, `app.js`의 handoff 모드. 기존 `#token=` 조회 링크와 별개.
- Proxy: `proxy-policy.mjs`, `pages-proxy.mjs`, `server.mjs`. handoff GET과 reunion POST만 추가 허용. owner 발급 경로는 웹 프록시에 노출하지 않음.
- API 미배포 시 Android는 ‘휴대폰 이어가기를 아직 사용할 수 없어요’를 표시하며 합류 완료를 가짜로 성공 처리하지 않습니다.
- 백엔드 완료 후 Pages 프런트 배포와 실제 토큰을 사용한 전체 흐름 재검증이 필요합니다. 로컬 모의 서버 검증은 실제 배포 성공으로 계산하지 않습니다.
