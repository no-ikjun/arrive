# 함께 도착 방문 세션 API

차량 앱과 동승자 카드가 방문 상태를 공유하는 NestJS 서버입니다. 계약은 저장소의 [`contracts/openapi.yaml`](../contracts/openapi.yaml)이고, 시연 장소는 [`contracts/oryong-demo.json`](../contracts/oryong-demo.json)을 그대로 읽습니다. 좌표, 사진, 주차 허용, 계단 유무는 만들지 않습니다.

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

개발 중 자동 재시작은 `npm run start:dev`입니다. 프로세스는 `backend/`에서 실행해야 기본 카탈로그 경로 `../contracts/oryong-demo.json`을 찾습니다.

- `GET /health`
- `GET /v1/venues/:venueId`
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

2026-11-12 실행 결과:

| 명령 | 결과 |
|---|---|
| `npm test` | Test Suites 3 passed, Tests 25 passed, 0 failed |
| `npm run build` 후 `node dist/main.js` | `/health` 200, 오룡관 카탈로그 `verification=DEMO_UNVERIFIED`·좌표 `null`, 세션 생성 201 `PLANNED` revision 1 `dataMode=DEMO` |

단위 테스트는 Kotlin `TripReducer`의 전이(후보 변경, 후보 소진, 순서 건너뛰기, 종료 후 불변, 취소, revision 증가)를 검증합니다. HTTP 테스트는 생성부터 재합류, 동시 revision 충돌, 같은 키 재시도, 다른 본문 충돌, 공유 토큰 쓰기 거부, 다른 세션 접근 거부, 만료·삭제, 삭제 후 생성 키 부활 방지, DB를 닫았다가 다시 열었을 때의 보존, 429 `Retry-After`를 포함합니다.

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
| `VENUE_CATALOG_PATH` | 비우면 `backend/` 기준 `../contracts/oryong-demo.json`. 이미지는 `/contracts/oryong-demo.json`입니다. |

세션 수명은 생성 시각부터 24시간으로 고정되어 있고, 이벤트로 늘어나지 않습니다. JSON 본문 한도는 16kb입니다.

## 동작 요약

- 생성 시 revision 1, `PLANNED`, 카탈로그의 첫 주차 후보, 빈 제외 목록, 고정된 만남 장소, `dataMode=DEMO`.
- `DEMO_UNVERIFIED`는 `DEMO`로만 기록됩니다. 카탈로그 문자열이 정확히 `VERIFIED`일 때만 `VERIFIED`가 됩니다.
- owner/share 토큰은 각각 32바이트 난수의 base64url입니다. 조회는 SHA-256 해시, 생성 응답 재생은 AES-256-GCM 암호문으로 저장합니다. 로그에는 Authorization과 토큰을 남기지 않습니다.
- 판정 순서는 인증·만료·폐기, 멱등 재생, 그다음 `expectedRevision`입니다.
- 세션과 오류 응답은 `Cache-Control: no-store`입니다.

## 계약과 다른 점

승인 없이 `contracts/openapi.yaml`은 바꾸지 않았습니다.

- 정차 제한(`interactionAllowed`)은 Kotlin reducer의 차량 UI 조건입니다. HTTP 계약에 필드가 없어 서버 전이에는 넣지 않았습니다.
- 생성 요청에는 아직 owner가 없으므로 멱등 범위는 `POST /v1/sessions`와 `Idempotency-Key`입니다. 이벤트는 owner 해시, 경로, 키를 함께 사용합니다.
- 삭제한 생성 키는 세션 만료 시각까지 tombstone으로 남습니다. 같은 본문을 다시 보내면 원래 201을 재생하지 않고 404를 반환해 세션이 되살아나지 않습니다. 다른 본문은 409 `IDEMPOTENCY_CONFLICT`입니다.
- 예상하지 못한 서버 오류는 500 `{ code: "INTERNAL", message }`입니다. 스택은 응답에 넣지 않습니다. OpenAPI에 적힌 클라이언트 오류 코드와는 별개입니다.

## 배포 설정

[gistag-be](https://github.com/no-ikjun/gistag-be)와 같은 흐름입니다. `main`에 `backend/` 또는 시연 카탈로그가 푸시되면 GitHub Actions가 테스트·빌드 후 Docker Hub로 이미지를 올리고, Lightsail에 SSH로 Postgres를 띄운 다음 마이그레이션과 앱 컨테이너를 교체합니다. 워크플로는 [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)입니다. 패키지는 npm입니다.

이 저장소에서 하지 않은 것: Docker Hub 로그인, 이미지 푸시, Lightsail SSH, GitHub 시크릿 생성. 아래 시크릿을 이 저장소에 만든 뒤 `main`에 푸시하면 배포 잡이 실행됩니다.

| 시크릿 | 내용 |
|---|---|
| `DOCKER_USERNAME` / `DOCKER_PASSWORD` | Docker Hub. 이미지 이름은 `arrive-together-be`입니다. |
| `LIGHTSAIL_HOST` / `LIGHTSAIL_USERNAME` / `LIGHTSAIL_SSH_KEY` / `SSH_PORT` | 서버 SSH |
| `ENV_FILE` | 서버에 둘 env 파일 전체. 앞쪽 공백 없이 값만 넣습니다. |

`ENV_FILE`에 넣을 값:

- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `DATABASE_URL=postgresql://<user>:<password>@postgres:5432/<db>` (호스트 이름은 `postgres`)
- `TOKEN_ENCRYPTION_KEY`, `CORS_ORIGINS`
- `PORT`는 넣어도 컨테이너 실행 때 `3000`으로 덮어씁니다.

같은 서버의 gistag-be와 겹치지 않도록 이름과 포트를 나눴습니다.

| | gistag-be | 이 서버 |
|---|---|---|
| 이미지 | `gistag-be` | `arrive-together-be` |
| 원격 디렉터리 | `/home/ubuntu/gistag-be` | `/home/ubuntu/arrive-together-be` |
| Compose 프로젝트 / 네트워크 | `gistag` / `gistag-net` | `arrive-together` / `arrive-together-net` |
| 호스트 포트 | `127.0.0.1:3001` | `127.0.0.1:3002` |
| 컨테이너 포트 | `3000` | `3000` |
| env 파일 | `/home/ubuntu/.env` | `/home/ubuntu/arrive-together-be/.env` |
| 헬스체크 | `GET /` | `GET /health` |
| DB 기본 계정 | `gistag` | `arrive` |

로컬에서 Postgres까지 같이 띄울 때는 `backend/`에서 `docker compose up --build`입니다. 앱 컨테이너 포트는 `3000`이고, 카탈로그는 이미지 안의 `/contracts/oryong-demo.json`입니다.

## 남은 작업

- GitHub 시크릿, Docker Hub 저장소, Lightsail 배포 실행. 리버스 프록시와 HTTPS.
- 인스턴스가 둘 이상일 때의 트랜잭션 잠금과 rate limit 저장소.
- Android 앱의 HTTP 클라이언트와 동승자 카드. 카드 URL은 프런트엔드가 `https://<card-origin>/#token=<shareToken>`으로 조립합니다.
- 검증된 장소 카탈로그가 생기기 전까지 좌표와 주차 허용은 비어 있는 시연 데이터입니다.
