# arrive 방문 세션 API

차량 앱과 동승자 카드가 방문 상태를 공유하는 NestJS 서버입니다. 계약은 저장소의 [`contracts/openapi.yaml`](../contracts/openapi.yaml)입니다. 장소는 [`contracts/venues/index.json`](../contracts/venues/index.json)이 가리키는 버전 파일을 읽습니다. 인덱스를 설정하지 않으면 [`contracts/oryong-demo.json`](../contracts/oryong-demo.json) 하나를 장소 목록으로 사용합니다. 좌표, 사진, 주차 허용, 계단 유무는 만들지 않습니다. 장소 데이터는 DB로 옮기지 않으며, 이 변경에 스키마 마이그레이션은 없습니다.

로컬 주소는 `http://localhost:8080`입니다. 계정, 결제, 푸시, WebSocket은 포함하지 않습니다. 배포 설정은 아래에 있고, 시크릿 등록과 서버 실행은 이 저장소에서 하지 않습니다.

## 실행

Node.js 22 이상. 이 구현은 Node `v22.18.0`, npm `10.9.3`에서 확인했습니다.

```sh
cd backend
npm install
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

출력된 값을 `.env`의 `TOKEN_ENCRYPTION_KEY`에 넣습니다. `.env.example`을 복사한 뒤 그 값만 바꾸면 됩니다. 예시에 있는 문자열은 32바이트 키가 아니므로 서버가 시작을 거부합니다.

```sh
npm run build
npm start
```

개발 중 자동 재시작은 `npm run start:dev`입니다. 프로세스는 `backend/`에서 실행합니다. `VENUE_CATALOG_INDEX_PATH=../contracts/venues/index.json`이면 그 인덱스만 읽고, 비우면 기본 카탈로그 `../contracts/oryong-demo.json` 하나를 장소 목록으로 바꿉니다. 공개 인덱스의 현재 목록은 오룡관 `oryong-demo-v2` 한 곳입니다. 과거 버전을 빼지 않으면 서버를 다시 시작해도 진행 중인 방문이 그 파일을 계속 찾습니다.

- `GET /health`
- `GET /v1/venues`
- `GET /v1/venues/:venueId`
- `GET /v1/venues/:venueId/versions/:catalogVersion`
- `POST /v1/sessions`
- `GET|DELETE /v1/sessions/:sessionId`
- `POST /v1/sessions/:sessionId/events`
- `GET /v1/shared-session`

`/docs`의 Swagger 화면은 로컬 참고용입니다. `contracts/openapi.yaml`을 생성하거나 바꾸지 않습니다.

## 테스트

```sh
npm test
npm run test:unit
npm run test:e2e
```

2026-11-13 실행 결과:

| 명령 | 결과 |
|---|---|
| `npm test` | Test Suites 6 passed, Tests 43 passed, 0 failed |
| `npm run build` | 성공 |

단위 테스트는 Kotlin `TripReducer`의 전이(후보 변경, 후보 소진, 순서 건너뛰기, 종료 후 불변, 취소, revision 증가)와 장소 인덱스 검증을 확인합니다. HTTP 테스트는 생성부터 재합류, 동시 revision 충돌, 같은 키 재시도, 다른 본문 충돌, 공유 토큰 쓰기 거부, 다른 세션 접근 거부, 만료·삭제, 삭제 후 생성 키 부활 방지, DB를 닫았다가 다시 열었을 때의 보존, 429 `Retry-After`에 더해 장소 목록, 버전 고정, 서로 다른 장소의 주차 순서, 사라진 카탈로그의 `CATALOG_UNAVAILABLE`을 포함합니다.

## 저장

Postgres 16과 Drizzle입니다. `DATABASE_URL`이 있으면 그 주소로 접속하고, 없으면 로컬 개발·테스트만 임베디드 Postgres(PGlite, `DATABASE_PATH`, 기본 `./data/pglite`)를 씁니다. `NODE_ENV=production`에서 `DATABASE_URL`이 없으면 프로세스가 시작을 거부합니다.

스키마 SQL은 `backend/drizzle/`에 있고, 기동 시 Drizzle migrator가 적용합니다. 배포 이미지 안에서는 `npm run db:migrate`가 같은 폴더를 한 번 더 적용합니다. 이벤트 적용, `expectedRevision` 비교, 멱등 기록은 트랜잭션 한 번에서 처리합니다. 그 잠금은 프로세스 하나를 전제로 한 메모리 대기열입니다. 인스턴스를 여러 개 띄우면 대기열을 데이터베이스 잠금으로 바꿔야 하고, rate limit 저장소도 프로세스 밖으로 빼야 합니다.

## 환경변수

| 변수 | 의미 |
|---|---|
| `PORT` | 로컬 기본 `8080`. 컨테이너는 `3000`입니다. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Compose의 Postgres. 기본값은 `arrive` / `arrive` / `arrive`입니다. |
| `DATABASE_URL` | `postgresql://...`. 앱 컨테이너에서는 호스트가 `postgres`입니다. 비우면 로컬 PGlite입니다. |
| `DATABASE_PATH` | PGlite 디렉터리. `DATABASE_URL`이 있으면 사용하지 않습니다. |
| `TOKEN_ENCRYPTION_KEY` | 32바이트 키의 base64. 생성 응답 재생용 토큰 암호문만 이 키로 엽니다. |
| `CORS_ORIGINS` | 쉼표로 구분한 허용 origin. `*`는 쓰지 않습니다. |
| `CLEANUP_INTERVAL_MS` | 만료 세션·멱등 기록 삭제 주기. 기본 60초. `0`이면 주기 작업을 끄고, 요청 시점의 만료 검사는 유지됩니다. |
| `THROTTLE_TTL_MS` | rate limit 창. 기본 60초. |
| `THROTTLE_LIMIT` | IP·라우트당 허용 횟수. 기본 120. 메모리에만 기록됩니다. |
| `VENUE_CATALOG_INDEX_PATH` | 설정하면 이 인덱스만 읽습니다. 파일이 없거나 식별자가 어긋나면 시작이 실패하고, 단일 파일로 우회하지 않습니다. 경로는 인덱스 파일 기준으로 해석합니다. Docker는 `/contracts/venues/index.json`입니다. |
| `VENUE_CATALOG_PATH` | 인덱스가 비어 있을 때만 사용합니다. 비우면 `backend/` 기준 `../contracts/oryong-demo.json`입니다. |

세션 수명은 생성 시각부터 24시간으로 고정되어 있고, 이벤트로 늘어나지 않습니다. JSON 본문 한도는 16kb입니다.

## 동작 요약

- 생성 시 revision 1, `PLANNED`, 요청한 버전의 첫 주차 후보, 빈 제외 목록, 그 버전의 만남 장소. `DEMO_UNVERIFIED`는 `DEMO`로만 기록됩니다. 카탈로그 문자열이 정확히 `VERIFIED`일 때만 `VERIFIED`가 됩니다.
- 목록은 각 장소의 현재 버전만, 인덱스에 적힌 순서입니다. 없는 장소는 `404`, 알려진 장소의 없는 버전으로 만드는 요청은 `400`입니다. 등록된 과거 버전으로도 방문을 만들 수 있습니다.
- 주차 후보 변경은 세션에 저장된 `(venueId, catalogVersion)`의 순서만 사용합니다. 현재 버전이 바뀌어도 기존 세션의 장소, 버전, 만남 지점, `dataMode`는 바꾸지 않습니다.
- 세션이 가리키는 버전 파일이 없으면 이벤트는 `500 CATALOG_UNAVAILABLE`이고 revision은 그대로입니다. 이 응답은 멱등 기록에 남기지 않습니다. 그 버전 파일을 인덱스에 다시 넣고 재시작하면 같은 요청을 다시 처리할 수 있습니다. 최신 버전으로 대체하지 않습니다. 해당 조합의 상세 조회는 `404`입니다.
- owner/share 토큰은 각각 32바이트 난수의 base64url입니다. 조회는 SHA-256 해시, 생성 응답 재생은 AES-256-GCM 암호문으로 저장합니다. 로그에는 Authorization과 토큰을 남기지 않습니다.
- 판정 순서는 인증·만료·폐기, 멱등 재생, `expectedRevision`, 그다음 세션에 고정된 카탈로그 조회입니다.
- 세션과 오류 응답은 `Cache-Control: no-store`입니다.

## 계약과 다른 점

장소 목록, 버전 상세, 이벤트 `500 CATALOG_UNAVAILABLE`은 `contracts/openapi.yaml`과 `/docs` Swagger에 함께 적혀 있습니다.

- 정차 제한(`interactionAllowed`)은 Kotlin reducer의 차량 UI 조건입니다. HTTP 계약에 필드가 없어 서버 전이에는 넣지 않았습니다.
- 생성 요청에는 아직 owner가 없으므로 멱등 범위는 `POST /v1/sessions`와 `Idempotency-Key`입니다. 이벤트는 owner 해시, 경로, 키를 함께 사용합니다.
- 삭제한 생성 키는 세션 만료 시각까지 tombstone으로 남습니다. 같은 본문을 다시 보내면 원래 201을 재생하지 않고 404를 반환해 세션이 되살아나지 않습니다. 다른 본문은 409 `IDEMPOTENCY_CONFLICT`입니다.
- 예상하지 못한 서버 오류는 500 `{ code: "INTERNAL", message }`입니다. 스택은 응답에 넣지 않습니다. OpenAPI에 적힌 클라이언트 오류 코드와는 별개입니다.

## 배포 설정

[gistag-be](https://github.com/no-ikjun/gistag-be)와 같은 서버의 Postgres를 사용합니다. `main`에 `backend/` 또는 시연 카탈로그가 푸시되면 GitHub Actions가 테스트·빌드 후 Docker Hub로 이미지를 올리고, Lightsail에서 앱 컨테이너만 교체합니다. Postgres 컨테이너는 띄우지 않습니다. 워크플로는 [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)입니다. 패키지는 npm입니다.

이 저장소에서 하지 않은 것: Docker Hub 로그인, 이미지 푸시, Lightsail SSH, GitHub 시크릿 생성. 아래 시크릿을 이 저장소에 만든 뒤 `main`에 푸시하면 배포 잡이 실행됩니다.

| 시크릿 | 내용 |
|---|---|
| `DOCKER_USERNAME` / `DOCKER_PASSWORD` | Docker Hub. 이미지 이름은 `arrive-together-be`입니다. |
| `LIGHTSAIL_HOST` / `LIGHTSAIL_USERNAME` / `LIGHTSAIL_SSH_KEY` / `SSH_PORT` | 서버 SSH |
| `ENV_FILE` | 서버에 둘 env 파일 전체. 앞쪽 공백 없이 값만 넣습니다. |

`ENV_FILE`에 넣을 값:

- `POSTGRES_USER=arrive`, `POSTGRES_DB=arrive`. 배포 전 준비 확인에 사용합니다.
- `DATABASE_URL=postgresql://arrive:<password>@postgres:5432/arrive`. 호스트 `postgres`는 `gistag-net`의 gistag Postgres입니다.
- `TOKEN_ENCRYPTION_KEY`, `CORS_ORIGINS`
- `PORT`는 넣어도 컨테이너 실행 때 `3000`으로 덮어씁니다.

같은 서버의 gistag-be와 겹치지 않도록 이름과 포트를 나눴습니다.

| | gistag-be | 이 서버 |
|---|---|---|
| 이미지 | `gistag-be` | `arrive-together-be` |
| 원격 디렉터리 | `/home/ubuntu/gistag-be` | `/home/ubuntu/arrive-together-be` |
| Compose 프로젝트 / 네트워크 | `gistag` / `gistag-net` | Postgres 없음. 앱은 `gistag-net`에 연결 |
| 호스트 포트 | `127.0.0.1:3001` | `127.0.0.1:3002` |
| 컨테이너 포트 | `3000` | `3000` |
| env 파일 | `/home/ubuntu/.env` | `/home/ubuntu/arrive-together-be/.env` |
| 헬스체크 | `GET /` | `GET /health` |
| DB | Postgres 컨테이너, 데이터베이스 `gistag` | 같은 Postgres 컨테이너 안의 데이터베이스 `arrive` |

로컬 API 컨테이너만 띄울 때는 `backend/`에서 `docker compose up --build`입니다. 데이터베이스는 환경 변수의 `DATABASE_URL`을 사용합니다. 앱 컨테이너 포트는 `3000`이고, 이미지에는 `/contracts/venues/index.json`과 그것이 참조하는 카탈로그 파일이 함께 들어 있습니다.

## 남은 작업

- GitHub 시크릿, Docker Hub 저장소, Lightsail 배포 실행. 리버스 프록시와 HTTPS.
- 인스턴스가 둘 이상일 때의 트랜잭션 잠금과 rate limit 저장소.
- Android 앱의 HTTP 클라이언트와 동승자 카드. 카드 URL은 프런트엔드가 `https://<card-origin>/#token=<shareToken>`으로 조립합니다.
- 현재 v2 카탈로그에는 사용자 이미지 기반 추정 좌표 6곳이 있습니다. 좌표 존재가 현장 검증을 뜻하지 않으며 DEMO_UNVERIFIED와 세션 DEMO를 유지합니다. 주차 허용·실제 진입구는 미확인입니다.


2026-11-12 카탈로그 갱신: `oryong-demo-v2`, 주차장 1·2 분리(총 4후보), 하차·만남 포함 추정 좌표 6곳. 상세 근거는 [현장 기록](../docs/ORYONG_SITE_NOTES.md)에 있습니다. 2026-11-13 다중 장소 조회의 테스트 결과는 위 테스트 절입니다.
