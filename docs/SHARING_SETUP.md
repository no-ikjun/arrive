# 차량 앱 ↔ 동승자 카드 실행 안내

## 구현한 범위

- 차량 앱에서 현재 방문을 공유 세션으로 생성하고 단계·주차 후보 변경을 NestJS API에 전송한다.
- 기존 로컬 방문도 하차/주차 단계에서 연결할 수 있다. 공통 카탈로그와 reducer로 진행 이력을 재현한다.
- QR은 앱에서 ZXing으로 생성하며 읽기 전용 shareToken만 포함한다. 동승자는 별도 앱 설치 없이 모바일 웹을 연다.
- 동승자 웹은 전경에서 5초마다 읽고 주차 후보, 운전자 확인 단계, 고정된 만남 장소를 표시한다.
- 변경은 네트워크 요청 전에 Android Keystore AES-GCM으로 암호화된 단일 스냅샷에 저장한다. 토큰·방문 상태·재전송 키가 함께 보존된다.
- 응답을 받지 못한 이벤트는 같은 Idempotency-Key/expectedRevision으로 재전송한다. 앱 재시작 시 큐를 복원한다. 앱 프로세스가 종료된 동안에는 전송하지 않으며 다음 실행에서 이어간다.
- 서버 충돌 시 서버 상태를 다시 읽고 대기 변경을 폐기했다는 안내를 표시한다. 충돌을 무시해 동승자에게 잘못된 상태를 보내지 않는다.
- 새 방문은 기존 세션 DELETE 확인 후 시작한다. 오프라인이면 기존 링크 폐기를 기다린다. 서버의 24시간 만료/404 시 공유 종료를 표시한다.
- 서버 반영 완료와 동승자가 실제로 읽었다는 사실은 다르다. 읽음 확인, 푸시, 실시간 위치, 보행 길찾기는 제공하지 않는다.

## 지금 휴대폰으로 확인할 순서

1. Mac과 휴대폰을 같은 Wi-Fi에 연결한다. Pleos 에뮬레이터는 설정 → 연결 → Wi-Fi에서 `AndroidWifi`에 연결한다.
2. 현재 설치한 debug APK의 공개 주소는 다음과 같다. Mac의 LAN 주소가 바뀌면 수정 후 재빌드한다.

   ```dotenv
   ARRIVAL_API_BASE_URL=http://10.0.2.2:8080
   ARRIVAL_COMPANION_BASE_URL=http://192.168.0.5:8081
   ```

   루트 `.env.local`의 기존 빈 동승자 웹 주소를 위 로컬 주소로 채웠다. 비밀값은 변경하지 않았다.
   `10.0.2.2`는 Android 에뮬레이터→Mac 주소다. 휴대폰 QR에는 이 주소를 사용하지 않는다.
3. 앱에서 **동승자 공유 → QR 만들기**. 이미 공유 중이면 ‘동승자 공유’에서 QR을 다시 확인한다. 좁은 화면에서는 ‘더 보기 → 동승자 공유’로 연다.
4. 휴대폰 카메라로 QR을 스캔한다. 링크를 수동 입력하거나 별도 회원가입을 할 필요가 없다.
5. 차량에서 방문 시작 → 하차 완료 → 다른 주차장 → 주차 완료를 누른다. 휴대폰에서 상태가 갱신되고 만남 장소는 고정되는지 확인한다.
6. 휴대폰에서 페이지가 열리지 않으면 먼저 `http://192.168.0.5:8081`이 열리는지 확인한다. macOS 방화벽에서 Node 수신을 차단했거나 게스트 Wi-Fi가 기기 간 접속을 차단할 수 있다.

현재 작업에서는 실제 휴대폰 카메라를 직접 조작하지 않았다. Pleos QR 이미지를 ZXing으로 디코딩해 실제 LAN URL로 브라우저에 연결했고, 390px 모바일 화면에서 확인했다. 물리적인 휴대폰 스캔·네트워크 접속만 사용자가 확인하면 된다.

## 로컬 서버를 다시 실행할 때

Node.js 22+, Python 3, Android 개발 환경이 필요하다.

```sh
cd /Users/ikjunchoi/Documents/Coding/hyundai_motor_app/backend
npm ci
npm run build
cd ..
python3 scripts/run_shared_demo.py --public-host 192.168.0.5
```

- 기존 서비스가 실행 중이면 포트 충돌로 종료한다. 같은 서버를 중복 실행하지 않는다.
- 두 서비스를 실행한 터미널에서 Ctrl+C로 종료한다.
- 이 스크립트는 기존 `backend/.env`와 분리된 `.tools/shared-demo/db` 및 별도 개발 키를 사용한다. `DATABASE_URL`을 명시적으로 빈 문자열로 지정해 기존 외부 DB 설정을 상속하지 않는다.
- `.tools/shared-demo`는 Git 제외 대상이다. 폴더를 지우면 로컬 공유 세션과 키가 사라진다.
- 로그는 `.tools/shared-demo/backend.log`, `web.log`. 토큰을 출력하지 않는다.
- 주소 설정을 바꿨다면 `./gradlew :app:assembleDebug` 후 새 APK를 설치한다. 이번 설치는 debug APK이며 로컬 HTTP를 허용한다. release API 통신에는 HTTPS가 필요하다.

## 백엔드 담당자에게 전달할 것

**현재 오룡관 공유 시연에는 추가 API나 계약 변경이 필요하지 않다.** 기존 아래 API로 동작을 확인했다. 여러 장소 선택을 지원하기 위한 다음 개발은 [다중 장소 지원 백엔드 인계](BACKEND_MULTI_VENUE_HANDOFF.md)를 따른다.

| 차량 앱 | 동승자 웹 |
|---|---|
| POST /v1/sessions | GET /v1/shared-session |
| GET /v1/sessions/:id | GET /v1/venues/:venueId |
| POST /v1/sessions/:id/events | 읽기 전용 |
| DELETE /v1/sessions/:id | 새 방문 시 이전 링크 사용 불가 |

외부 환경에서 쓰려면 다음 배포 정보만 필요하다.

1. 영속 DB를 사용하는 NestJS의 **HTTPS API 주소**.
2. `companion/` Node 서버(또는 제공한 Dockerfile)의 배포. `API_BASE_URL`에는 이 서버에서 접근 가능한 NestJS 주소를 지정한다.
3. 동승자 웹의 **HTTPS origin**. `/`와 `/api/*`를 모두 companion 프로세스로 연결한다. 현재는 서브디렉터리 호스팅을 지원하지 않는다.
4. 두 공개 주소를 루트 `.env.local`에 반영하고 Android APK를 재빌드한다.

웹은 같은 origin의 읽기 전용 프록시를 사용하므로 추가 NestJS CORS 허용은 필요하지 않다. 기존 backend CORS 값과 DB/토큰 키는 유지한다. Android ownerToken을 companion 서버에 보내지 않는다.
이번 작업에서는 외부 서버 배포, DNS 변경, Docker 이미지 푸시, GitHub 시크릿 변경을 하지 않았다.

## 확인 결과

- Kotlin 도메인 테스트 19개 통과. 큐의 나중 변경 보존, 잘못된 ACK 방지, 기존 로컬 방문 공유, 후보 소진, 조작 제한 포함.
- 모바일 모델/읽기 전용 프록시 테스트 4개 통과. owner 경로·쓰기·토큰 쿼리 차단, 리다이렉트 차단 포함.
- Android debug APK 빌드 및 Lint 통과: 오류 0, 경고 7(의존성 최신 버전 안내 1건 추가).
- Pleos API 34에서 실제 세션 생성 → QR 디코딩 → 모바일 웹 접속 → 주차 후보 변경 → 주차 완료 → 합류 완료 확인.
- 서버 응답 중단 중 후보 변경, 앱 강제 종료/재실행, 동일 서버 복구 후 revision 4→5가 한 번만 적용됨을 확인. 차량과 웹의 만남 장소는 동일하게 유지됨.
- 네트워크 실패 시 웹은 이전 상태와 연결 끊김 표시를 유지한다. 새 방문 시작 후 이전 shareToken은 실제 404, 웹은 카드를 숨기고 탭 토큰을 제거한다.
- 최종 APK 재설치 후 암호화된 방문이 복원되고 합류 완료까지 전송됨을 확인.
- 320px/390px 모바일 및 1200px 데스크톱 화면 확인. 320px에서 가로 넘침 없음.
- 화면 기록: `output/playwright/01-companion-parking.png`, `02-companion-parked.png`, `03-companion-desktop.png`.

실차·물리적 휴대폰 스캔, 외부 HTTPS 배포, 24시간 실제 경과, 앱이 종료된 동안의 백그라운드 전송은 이번 검증에 포함되지 않는다.
