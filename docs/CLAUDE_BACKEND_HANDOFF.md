# 함께 도착 — Claude 백엔드 작업 요청

> 이 문서는 완료된 초기 백엔드 구현의 기록입니다. 다음 추가 개발은 [arrive 다중 장소 지원 백엔드 인계](BACKEND_MULTI_VENUE_HANDOFF.md)를 기준으로 진행하세요. 아래의 미구현 상태와 작업 경계는 최초 요청 당시 기준입니다.

## 목적과 작업 경계

이 저장소의 Android 차량 앱은 Codex가 개발합니다. Claude는 **방문 세션 공유 백엔드만** 구현해 주세요.
작업 경로는 `backend/`입니다. `app/`, `domain/`, Gradle 설정, `contracts/`는 임의 수정하지 마세요.
계약 변경이 필요하면 변경 제안을 별도로 남겨 동기화합니다. 모바일 카드 UI도 Codex 담당입니다.
현재 백엔드 구현은 없으며 배포, 유료 서비스 가입, 실제 메시지 전송은 이번 요청에 포함되지 않습니다.

## 제품과 데모

‘함께 도착’은 동승자를 먼저 내려주고 운전자가 주차한 뒤 약속한 장소에서 다시 만나는 과정의 안내 앱입니다.
오룡관 → 하차 지점 → 주차 후보 변경 → 주차 확인 → 만남 완료 흐름을 시연합니다.
차량에서 바뀐 방문 상태를 동승자 모바일 카드가 읽습니다. 실시간 GPS 추적, 자동 메시지 발송, 만차 예측은 없습니다.

## 계약

- API 정의: `contracts/openapi.yaml` (OpenAPI 3.0.3)
- 데모 장소 원본: `contracts/oryong-demo.json`
- 상태 전이 참고: `domain/src/main/kotlin/com/arrivetogether/domain/Trip.kt`
- Kotlin 테스트의 전이 조건을 서버 테스트에서도 검증해 주세요.
- v2 장소에는 사용자 표시 이미지에서 추출한 추정 좌표가 있습니다. 공통 JSON 값을 그대로 사용하고 DEMO_UNVERIFIED를 유지하세요. 추가 좌표/사진/주차 허용/계단 유무를 임의 생성하지 마세요.
- 시연 데이터는 항상 `dataMode=DEMO`이며 안내 문구에도 드러나야 합니다.

## 구현 범위

1. 명세의 health / venue / session 생성·조회·이벤트·삭제 / 공유 조회 API.
2. 세션, 토큰 권한, 갱신 버전, 이벤트 재시도 기록을 영속 저장. 재시작 시 보존.
3. 운영자가 실시간 업데이트하는 대시보드, 계정 가입, 결제, 푸시 알림은 만들지 않습니다.
4. 읽기 전용 카드는 GET을 전경에서 5초마다 호출하면 충분합니다. WebSocket은 필요 없습니다.
5. 사용자 선택에 따라 **NestJS + TypeScript**로 구현합니다. `backend/`에 독립적인 package.json과 lockfile을 두고 로컬 실행·테스트 명령을 제공합니다.

## NestJS 구현 기준

- 단일 NestJS 애플리케이션으로 시작합니다. 세션(`SessionsModule`), 장소(`VenuesModule`), 공유 조회(`SharingModule`)를 책임별로 구분하되 공유 로직은 중복하지 않습니다.
- DTO와 ValidationPipe로 입력을 검증하고, Guard로 owner/share 토큰 권한을 분리합니다. 토큰 형식은 기존 계약의 난수 capability를 유지합니다.
- 기본 NestJS 예외 응답을 그대로 내보내지 말고, Exception Filter 등을 통해 계약의 `{code, message, currentRevision?}` 오류 형식과 상태 코드를 맞춥니다.
- `contracts/openapi.yaml`이 API 계약의 기준입니다. `@nestjs/swagger`로 문서를 제공할 경우 계약과 일치하는지 확인하며, 생성 결과로 기존 명세를 임의 교체하지 않습니다.
- DB/ORM은 아직 확정하지 않았습니다. 초기 로컬 시연에는 SQLite를 사용할 수 있으며 선택 근거와 배포 시 영속 저장 방식을 README에 명시합니다. revision 비교·변경·멱등 기록은 같은 DB 트랜잭션에서 처리합니다.
- 런타임 및 패키지 버전은 구현 시 호환성을 확인해 고정하고, 단위 테스트와 HTTP 통합 테스트를 제공합니다.
- 참고: [NestJS 공식 문서](https://docs.nestjs.com/), [OpenAPI 연동](https://docs.nestjs.com/openapi/introduction).


## 상태 전이 — 서버가 검증

| 이벤트 | 허용 단계 | 결과 |
|---|---|---|
| START | PLANNED | TO_DROPOFF |
| CONFIRM_DROPOFF | TO_DROPOFF | TO_PARKING |
| REJECT_PARKING | TO_PARKING, parkingId != null | 현재 후보를 제외하고 catalog 순서의 다음 미제외 후보 선택 |
| CONFIRM_PARKED | TO_PARKING, parkingId != null | WALKING_TO_MEETING |
| CONFIRM_REUNION | WALKING_TO_MEETING | REUNITED |
| CANCEL | 종료되지 않은 모든 단계 | CANCELLED |

- 처음 생성: revision=1, 첫 주차 후보 선택, 제외 목록 비움, catalog의 meetingPointId 고정.
- 모든 후보 제외 시 parkingId=null. 종료 전까지 만남 장소 유지. 이전 후보를 다시 추천하지 않음.
- 후보가 없어도 ‘만차 확정’이 아닙니다. 해당 세션 사용자만 이용 불가로 표시한 것입니다.
- REUNITED/CANCELLED는 terminal이며 이벤트 수신 시 409. 삭제는 가능.
- 성공한 이벤트마다 revision을 정확히 1 증가. 잘못된 전이/리비전 충돌은 원본 불변.
- expectedRevision 비교와 이벤트 적용, 멱등 기록 저장은 단일 트랜잭션으로 처리.
- 동일 owner/endpoint/Idempotency-Key + 동일 본문 재전송은 기존 응답 반환(증가 없음).
- 인증·만료·폐기 검사 후 멱등 재생을 판정하고, 그 후 expectedRevision을 검사.
- 같은 키 다른 본문은 409 IDEMPOTENCY_CONFLICT. 같은 키의 동시 요청도 한 번만 적용.

## 공유와 수명

- ownerToken과 shareToken은 독립적인 암호학적 난수 각각 32바이트 이상.
- shareToken은 조회만 가능하며 owner 엔드포인트에서 거부. ownerToken을 다른 세션에 쓸 수 없음.
- 생성 API도 키를 검증하여 타임아웃 재시도 시 세션이 중복 생성되지 않게 합니다.
- 생성 응답 재생에는 토큰 보관이 필요하므로 보호된 저장 또는 서버 키 기반 암호화 방식으로 보관하고 로그에는 남기지 않습니다. 나머지 토큰 검증에는 해시 저장을 권장합니다.
- 생성 후 24시간 고정 만료. 갱신으로 만료를 연장하지 않습니다.
- REUNITED/CANCELLED 상태는 만료 전까지 읽기 가능. DELETE는 즉시 삭제·공유 폐기.
- 삭제된 생성 요청의 멱등 키는 유효 기간 동안 tombstone으로 유지해 재생으로 부활하지 않게 합니다.
- 만료 여부를 요청마다 검사하고, 주기적 정리 작업으로 만료 데이터/토큰/멱등 기록을 제거.
- 세션 응답 `Cache-Control: no-store`. 인증 헤더 및 응답 토큰 로그 금지.
- 카드 URL은 프런트엔드에서 `https://<card-origin>/#token=<shareToken>`으로 조립할 예정입니다.
  토큰을 query/path에 넣지 않고, 카드가 fragment를 읽어 Authorization 헤더로 전달합니다.
- 이름, 전화번호, 동승자 건강정보, 실시간 차량 위치는 수집하지 않습니다.
- CORS는 환경변수의 허용 origin만 사용. 개발 origin은 명시적으로 허용.
- 생성·조회·변경 요청의 합리적인 rate limit, body 크기 제한, 입력 검증을 구현.

## 오류 코드

`INVALID_REQUEST`(400), `UNAUTHORIZED`(401), `NOT_FOUND`(404),
`REVISION_CONFLICT`(409, currentRevision 포함), `INVALID_TRANSITION`(409),
`IDEMPOTENCY_CONFLICT`(409), `RATE_LIMITED`(429).
UNKNOWN venue는 404, 알려진 venue의 잘못된 catalogVersion은 400.

## 완료 기준

- README, `.env.example`(실제 비밀 없음), 마이그레이션, 실행·테스트 명령 제공.
- 생성 → 하차 → 주차 후보 변경 → 주차 → 재합류 통합 테스트.
- 동시 수정 충돌, 같은 이벤트 재시도, 잘못된 순서, 후보 소진, terminal 이벤트 거부 테스트.
- 공유 토큰의 쓰기 차단, 다른 세션 접근 차단, 만료/삭제 후 접근 차단 테스트.
- DB 재시작 후 세션 보존 테스트.
- 불확실한 데이터가 VERIFIED로 승격되지 않는지 검증.
- 실제 실행 결과와 남은 작업을 `backend/README.md`에 기록.

## Codex에게 돌려줄 것

1. 실행 명령과 로컬 API 주소.
2. 테스트 결과.
3. 계약과 다른 부분이 있다면 명시(승인 없이 계약 변경 금지).
4. 배포에 필요한 환경변수 목록. 배포 자체는 별도 요청을 기다립니다.


## 장소 카탈로그 갱신 — 2026-11-12

- 공통 `contracts/oryong-demo.json`을 `oryong-demo-v2`로 갱신했다. 하차·만남·주차 4곳의 이미지 기반 추정 좌표가 포함된다.
- `parking-oryong-demo`는 주차장 1, 새 `parking-oryong-2-demo`는 주차장 2다. 이후 축구장·기숙사 ID는 유지한다.
- 새 방문 생성에는 v2를 사용한다. 기존 프로세스는 카탈로그를 시작 시 읽으므로 로컬 서버를 재시작하고 새 시연 세션으로 연결한다.
- `DEMO_UNVERIFIED`/세션 `DEMO` 상태는 유지한다. 좌표가 있다는 이유로 VERIFIED로 바꾸거나 실제 경로를 보장하면 안 된다.
- 앱은 이 JSON에서 Gradle로 Kotlin 장소 데이터를 생성한다. 백엔드 서비스 구현 변경 없이 catalog 관련 e2e 테스트의 v2/4후보/좌표 기대값을 갱신했다.
- 주차 후보 좌표는 구역 대표점이다. 실제 진입구와 일방통행·보행 경로 검증은 별도다. 세부 근거는 `ORYONG_SITE_NOTES.md` 참조.
