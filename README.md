# arrive

하차부터 주차, 다시 만나는 순간까지 도착 계획을 공유하는 차량 앱과 동승자 웹.

서비스 이름은 **arrive**입니다. 장소는 방문별 정보로 표시하며, 현재 시연 가능한 장소는 GIST 오룡관 한 곳입니다. `assets/`의 원본 로고·아이콘에서 앱과 웹용 리소스를 만들어 사용합니다.

## 운전자 화면

흰색·회색·검정 중심으로 현재 목적지와 큰 확인 버튼을 표시하고 차량 오른쪽에는 하차 지점·주차 후보·건물 입구 지도를 보여줍니다. 내비 사용 중에도 활성 방문의 위치/변속 관측을 유지하며 알림함에서 방문으로 복귀할 수 있습니다. 주차 완료 후 QR로 운전자 휴대폰에 입구 안내와 합류 확인을 넘깁니다. 동승자는 별도 조회 전용 링크로 건물 입구와 운전자 진행 상태를 봅니다. 주행 제한 중에는 조작을 제한합니다.

## 현재 범위

- Kotlin/Jetpack Compose Android 앱, minSdk 28 / compileSdk 35 / targetSdk 34.
- 오룡관 방문 흐름과 주차 후보 변경, 만남 장소 유지, 후보 소진, 방문 취소.
- 로컬 저장으로 프로세스 재시작 후 방문 복원.
- 일반 Android는 정차/주행 제한 시연 스위치, Automotive는 CarUxRestrictions 신호로 조작 제한(미확인 시 제한).
- 공식 NaviHelper 3.0.5 연결과 에뮬레이터 경로 요청, 완료 콜백·목적지 대조·오류·타임아웃 처리. Pleos Connect 2.1.0에서 서비스 연결·하차 경로 탐색·목적지 좌표 일치를 확인했습니다.
- NestJS 방문 API 연결, 암호화된 방문·토큰 저장, 오프라인 재전송 큐, QR 공유 및 동승자 모바일 웹.
- 모바일 카드는 전경에서 5초마다 상태를 갱신하며 새 방문 시 기존 공유 링크를 폐기합니다.
- JVM 상태 전이 테스트.

2026-11-13: arrive 브랜드·차량 UI·동승자 웹 개편. 최종 빌드 및 Lint 오류 0 / 기존 경고 6, 도메인 19개·웹 4개 테스트 통과. QR 공유와 주차→재회 흐름을 새 화면에서 확인했습니다.

2026-11-12: 추정 좌표 6곳 반영, debug APK 빌드, 도메인 19개·동승자 웹 4개 테스트(기존 백엔드 검증 25개), 일반 Android 에뮬레이터 UI smoke 및 좁은 화면 검증 통과.
Lint 오류 0 / 경고 7. 자세한 환경·제한은 [검증 기록](docs/VALIDATION.md)을 참고하세요.

**현재 앱은 추정 장소 데이터를 사용하는 시연용입니다. 실제 Pleos 서비스 연결·하차 경로 완료·목적지 좌표 대조와 CarUxRestrictions 조작 가능 신호를 확인했습니다. 주행 상태 전환 검증은 남아 있습니다. 실차 길안내, 실시간 주차 가능 여부와 검증된 보행 경로는 제공하지 않습니다. 모바일 지도와 공유는 공개 HTTPS 환경에서 확인했으며, 새 휴대폰 합류 기능은 백엔드 마이그레이션과 최신 배포가 필요합니다.**
여섯 장소의 이미지 기반 추정 좌표와 위치 배치도를 반영했습니다. 실제 차량 진입구와 이용 조건은 미확인이며 앱에 그 사실을 표시합니다. 실차 운전 중 사용하지 않습니다.

## 구성과 역할

- `app/`: Android UI, Pleos 연동, 암호화된 로컬 저장과 방문 API 동기화.
- `companion/`: QR로 여는 동승자/운전자 모바일 웹과 범위를 제한한 API 프록시(Node.js 22+).
- `domain/`: 서버와 공유할 상태 전이 의미 및 Kotlin 테스트.
- `contracts/`: 백엔드 API 계약과 시연 장소 JSON.
- `docs/CLAUDE_BACKEND_HANDOFF.md`: Claude에게 전달할 백엔드 작업 지시.
- `backend/`: Claude 담당 NestJS API. 기존 API 계약으로 차량 앱과 모바일 웹을 연결했습니다.

## 다음 개발 작업

백엔드의 장소 목록, 버전 지정 상세, 방문 버전 고정은 구현되어 있습니다. 공개 목록은 오룡관 현재 버전 한 곳입니다. Android 장소 선택과 동승자 웹이 세션 버전을 조회하는 작업은 [다중 장소 지원 백엔드 인계](docs/BACKEND_MULTI_VENUE_HANDOFF.md)의 Codex 범위로 남아 있습니다.

## 로컬 환경 설정

루트 `.env.local`에 Pleos 프로젝트 ID를 입력할 수 있습니다.
클라이언트 ID/시크릿은 선택이며 APK에 포함되지 않습니다.
공개 API·동승자 웹 주소만 Gradle에서 읽어 앱 설정으로 연결합니다.
자세한 입력 위치와 확인 명령은 [환경 설정 안내](docs/ENVIRONMENT.md)를 참고하세요.

## 빌드

Android SDK 35, JDK 17 이상, Gradle 8.10을 사용합니다. Android Studio의 JDK 21도 사용 가능합니다.
`local.properties`에 본인 SDK 경로를 설정하거나 `ANDROID_HOME`을 지정합니다.

```sh
./gradlew :domain:test :app:assembleDebug :app:lintDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`

설치 후 ‘방문 시작’ → ‘하차 완료’ → ‘다른 주차장’ →
‘주차 완료’ → ‘만남 완료’. 네 후보를 모두 제외한 경우 안내를 멈추며 만남 장소는 유지합니다.
기본 앱은 일반 Android 에뮬레이터에서도 실행되며 넓은 창에서는 두 열로 표시됩니다.

## 동승자 공유 실행

[공유 기능 실행 안내](docs/SHARING_SETUP.md)에 로컬 실행, 휴대폰 확인 순서, 백엔드 담당자에게 필요한 배포 설정을 정리했습니다.
`python3 scripts/run_shared_demo.py --public-host <Mac의 LAN IP>`로 두 서비스를 함께 실행할 수 있습니다.

## 장소 데이터

`contracts/oryong-demo.json`이 앱·서버 공통 원본입니다. 서버의 공개 장소 인덱스는 `contracts/venues/index.json`이며 현재는 오룡관 `oryong-demo-v2`만 가리킵니다. `:domain:generateOryongCatalog`가 Kotlin 데이터를 생성하므로 좌표를 두 군데에서 편집할 필요가 없습니다. 현재 버전은 `oryong-demo-v2`, 추정 상태는 `DEMO_UNVERIFIED`입니다.

앱의 ‘장소 위치 보기’에서 하차·만남·주차장 4곳을 확인합니다. 주차 후보 변경 시 만남 위치는 고정됩니다. 위치 배치도는 길안내가 아니며, 후보 순서도 실제 주행 경로가 아닙니다. 계산 근거는 [현장 기록](docs/ORYONG_SITE_NOTES.md)에 있습니다.

## 다음 구현 단계

1. [Pleos 실행 안내](docs/PLEOS_SETUP.md)를 참고해 GIST 인근 출발 위치에서 주차 후보별 경로 검증. 서비스 연결·하차 목적지 완료 콜백 검증은 완료.
2. NaviHelper 경로 요청을 실행하고 실제 승하차 허용 지점·주차 진입구·일방통행 경로 대조.
3. Virtual Console로 CarUxRestrictions 반응 검증. 필요할 때 Vehicle SDK의 기어·도어 등 capability를 추가 연결.
4. 실제 휴대폰 QR 스캔과 새 휴대폰 합류 API의 운영 배포 검증. 구현/실행 방법은 [공유 기능 안내](docs/SHARING_SETUP.md).
5. UI 및 실사용 시나리오 검증 후 제출용 release 서명·APK·영상 준비.

## SDK 근거 (2026-11-11 확인)

- [NaviHelper](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/NaviHelper/intro)
- [NaviHelper dependency](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/NaviHelper/importing-sdk): `ai.pleos.playground:NaviHelper:3.0.5`
- [Vehicle](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/Vehicle/intro)
- [주행 제한](https://document.pleos.ai/docs/pleos-only/vehicle-app-planning-guide/driver-distraction-guideline)
- [에뮬레이터](https://document.pleos.ai/docs/connect/guide/getting-started/application-development/setup-connect-sdk-emulator)

`requestRoute()` 호출 반환만으로 경로 안내 성공을 표시하지 않습니다. SDK 어댑터 구현 시
콜백 실패/미응답/연결 해제를 구분하고, 실제 경로가 확인되지 않으면 다음 단계로 자동 진행하지 않습니다.

## 내비 복귀와 휴대폰 합류

[적용 순서·검증 기록](docs/CONTINUITY_SETUP.md), [API 계약](docs/CLAUDE_CONTINUITY_BACKEND.md)을 참고하세요. NestJS handoff API와 추가 테이블 마이그레이션까지 구현되어 있으며 백엔드 50개, 도메인 29개, 웹 23개 테스트가 통과했습니다. 배포 성공 여부는 해당 커밋의 CI/Pages 상태와 실제 운영 API로 별도 확인해야 합니다.
