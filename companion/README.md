# 동승자 도착 카드

별도 설치 없이 QR로 여는 읽기 전용 모바일 웹. 프레임워크/런타임 npm 의존성 없이 Node.js 22+에서 실행합니다.

```sh
cd companion
API_BASE_URL=http://127.0.0.1:8080 HOST=0.0.0.0 PORT=8081 npm start
npm test
```

`server.mjs`는 정적 파일과 GET 전용 `/api/v1/shared-session`, `/api/v1/venues/:id` 프록시를 제공합니다.
브라우저는 같은 origin의 `/api`만 호출하며, owner API·POST·DELETE는 이 프록시에서 사용할 수 없습니다.
`API_BASE_URL`은 서버 프로세스 환경변수입니다. `.env.example` 파일을 자동으로 읽지 않습니다.

공유 주소 형식은 `https://<web-origin>/#token=<shareToken>`입니다. 토큰은 URL fragment에서 읽고 주소 표시줄에서 제거한 뒤 현재 탭 sessionStorage에 저장합니다. 새로고침 시 연결을 복원하며, 카드 닫기/만료/폐기 시 제거합니다. 인증은 API 요청의 Authorization 헤더로만 전달합니다. 토큰을 쿼리·로그·분석 도구에 보내지 않습니다. 외부 폰트·분석·QR 생성 서버를 사용하지 않습니다.

전경에서 5초 간격으로 읽으며 요청을 겹치지 않습니다. 백그라운드에서는 중단하고 복귀 시 갱신합니다.
통신 실패 시 마지막 스냅샷과 연결 끊김 표시를 유지하고, 401/404/만료 시 기존 카드를 숨깁니다.
주차 완료는 운전자 확인이며 실제 위치/도착을 추적하지 않습니다. 이미지 추정 장소의 시연 표시를 유지합니다.

## Cloudflare Pages 배포

동일한 `no-ikjun/arrive` 저장소의 `companion/`만 배포합니다.

| 설정 | 값 |
|---|---|
| Production branch | `main` |
| Framework preset | `None` |
| Root directory | `companion` |
| Build command | `exit 0` |
| Build output directory | `public` |
| Production 환경변수 `API_BASE_URL` | `https://arrive-api.ikjun.com` |

`npm run build`는 없으며 HTML/CSS/JS는 그대로 제공합니다. Pages가 `functions/api/[[path]].js`를 자동 번들링합니다. 이 함수는 `pages-proxy.mjs`를 통해 허용된 GET API만 중계합니다. 운영 API 주소는 HTTPS origin만 허용하며, 설정 누락은 503, 연결 실패는 502를 반환합니다. `_headers`는 정적 파일에, 함수 내부 헤더는 API 응답에 적용됩니다. API 응답은 캐시하지 않습니다.

프로젝트 생성 후 Custom domains에 `arrive.ikjun.com`을 등록하고 안내되는 CNAME으로 연결합니다. 웹 도메인을 Lightsail IP로 연결하지 않습니다. API 도메인은 기존 Lightsail을 유지합니다. Preview 배포도 방문 조회가 필요하면 해당 환경의 `API_BASE_URL`을 별도로 지정하세요.

Build watch paths는 `companion/*`를 포함하면 됩니다. `main`에 새 코드가 push되면 최신 커밋으로 배포합니다. 이전 실패 건의 Retry는 옛 커밋을 다시 사용할 수 있으므로 배포의 commit SHA를 확인합니다.

검증: `npm test`로 웹 모델, 로컬 서버, Pages 요청 중계 테스트를 실행합니다. 토큰·쿠키 전파 범위, 쓰기/임의 경로 차단, 오류·만료·429·응답 크기 제한을 확인합니다.

공식 자료: [정적 HTML 배포](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/), [Functions](https://developers.cloudflare.com/pages/functions/get-started/), [도메인 연결](https://developers.cloudflare.com/pages/configuration/custom-domains/).

## 로컬 실행 또는 Docker 배포

- 이 폴더의 Dockerfile 또는 Node 프로세스로 실행합니다. 별도 `npm install`/프런트 빌드는 필요 없습니다.
- `API_BASE_URL`에 이 프로세스에서 접근 가능한 NestJS 주소를 설정합니다. Docker에서 `127.0.0.1`은 별도 백엔드 컨테이너가 아닙니다. 같은 네트워크의 서비스 이름을 사용하세요.
- 웹 origin의 `/`와 `/api/*`를 모두 이 프로세스로 프록시하고 HTTPS를 적용합니다. 서브디렉터리 호스팅은 현재 지원하지 않습니다.
- 읽기 전용 프록시를 통하므로 브라우저→NestJS CORS 추가는 필요하지 않습니다. 기존 NestJS CORS 설정은 유지합니다.
- Dockerfile은 제공했지만 이미지 빌드·푸시·외부 배포는 이번 작업에서 실행하지 않았습니다.
- 차량 APK의 `ARRIVAL_COMPANION_BASE_URL`에 HTTPS 웹 origin을 설정하고 다시 빌드합니다.

로컬에서는 `npm start`로 기존 Node 서버를 실행합니다. Cloudflare에서는 Node 서버 프로세스나 Docker 이미지를 실행하지 않습니다.

실행 환경은 `wrangler.toml`에 고정합니다. `compatibility_date = "2026-11-13"`은 API 요청의 `cache: no-store` 지원을 포함합니다. 과거 호환성 날짜에서는 이 옵션이 실행 시 오류를 낼 수 있으므로 번들 빌드 성공만으로 API 연결을 판단하지 않습니다. 공개 API 주소도 이 파일의 `[vars]`에서 관리하며, 이 설정이 배포되면 동일 항목의 대시보드 값 대신 파일을 수정합니다. 비밀값은 이 파일에 넣지 않습니다.

Cloudflare Fetch는 `redirect: error`를 지원하지 않으므로 `manual`로 요청하고 3xx 응답을 명시적으로 거부합니다. 리다이렉트 대상에는 인증 헤더를 전달하지 않습니다.

## 지도와 건물 입구 안내

첫 화면에 하차 지점·주차장·건물 입구 지도를 표시하고 동승자가 먼저 입장하도록 안내합니다. Leaflet 1.9.4는 `public/map/vendor`에 포함하며 별도 npm 빌드는 없습니다. 배경 지도는 OpenStreetMap 타일을 직접 요청합니다. 지도 출처 표시와 브라우저 캐시를 유지하고, 공유 인증 정보는 지도 요청에 전달하지 않습니다.

`public/guides`의 보충 입구 데이터는 해당 venueId/catalogVersion에만 적용합니다. 다른 장소는 입구 미등록 상태를 표시합니다. 추정 좌표를 실제 보행 경로로 연결하지 않습니다. 백엔드 확장 계약과 현장 확인 작업은 [지도·입구 안내 인계 문서](../docs/ARRIVAL_MAP_HANDOFF.md)를 참고하세요.
