# 초기 개발 검증 — 2026-11-11 KST

## 실행 결과

| 항목 | 결과 |
|---|---|
| `:domain:test` | 6 tests, 0 failures, 0 errors |
| `:app:assembleDebug` | 성공, debug APK 생성 |
| `:app:lintDebug` | 오류 0, 경고 6 |
| OpenAPI 3.0.3 | swagger-parser 10.1.0 검증 통과, 6 paths |
| Android UI smoke | 전체 시나리오 통과 |
| 화면 확인 | 2560×1600 및 1000×1600에서 확인 |

빌드 도구: Gradle 8.10, Android Gradle Plugin 8.7.3, Kotlin 2.0.21, Android Studio bundled JDK 21.0.5.
실행 환경: **일반 Android API 36 ARM64 에뮬레이터**. Pleos emulator 또는 실제 차량 검증이 아닙니다.

## 확인한 행동

- 주차 후보 변경 시 기존 만남 장소 유지.
- 프로세스를 종료·재시작해도 주차 후보와 제외 목록 복원.
- 주행 제한 시연 시 상세 조작을 표시하지 않음.
- 주차 확인 → 동승자 카드 미리보기 → 합류 완료.
- 모든 후보 제외 시 이전 후보로 되돌아가지 않고 주차 완료 버튼 제거.
- 방문 취소, 새 시연 초기화.
- 정차 상태가 아니면 reducer가 모든 변경 거부.
- 순서를 건너뛴 전이와 종료 후 변경 거부.

## Lint 경고

- `OldTargetApi`: target 34는 Pleos API 34 검증을 위한 초기 기준. 배포 전 대상 플랫폼 요건 재확인.
- `GradleDependency` 3건: 고정한 Compose BOM, Activity, Lifecycle 버전보다 최신 버전 존재.
- `DataExtractionRules`: Android 12+ 백업/기기 이전 규칙 명시 작업 필요. 현재 allowBackup=false.
- `MissingApplicationIcon`: 최종 런처 아이콘 미정.

## 재현

Android SDK와 JDK 설정 후:

```sh
./gradlew :domain:test :app:assembleDebug :app:lintDebug
adb -s emulator-5580 install -r app/build/outputs/apk/debug/app-debug.apk
python3 scripts/smoke_android.py --serial emulator-5580
```

UI smoke는 지정한 **전용 에뮬레이터의 시연 앱 데이터만 초기화**합니다.
`--adb` 인자로 adb의 절대 경로를 지정할 수 있습니다.
좁은 창 검증은 에뮬레이터 `wm size 1000x1600` 설정 후 화면을 확인하고 원래 크기로 복원했습니다.

## 아직 검증하지 않은 것

Pleos SDK/Vehicle State/CarUxRestrictions, 실제 차량 길안내, 실제 장소 좌표/허용 조건,
동승자 모바일 웹 및 백엔드 동기화, 오프라인 재전송, release 서명/배포.
현재 코드는 이 기능들이 이미 구현되었다고 표시하지 않습니다.

스크린샷은 `artifacts/screenshots/`에 저장되어 있습니다.


## 좌표 및 주차장 분리 반영 — 2026-11-12

- 공통 카탈로그 `oryong-demo-v2`: 하차·만남·주차 4곳의 추정 좌표를 반영. GeoJSON 추출 결과와 공통 JSON의 여섯 좌표 일치 확인.
- `:domain:test`: 8 tests, 0 failures/errors. 좌표 유효성, 지점 배치 관계, 네 후보 소진 및 만남 지점 유지 포함.
- `:app:assembleDebug`: 성공. 이전 프로젝트 경로가 남은 incremental dex 캐시 오류는 `:app:clean :domain:clean` 후 재빌드로 해결.
- `:app:lintDebug`: 오류 0, 경고 6(기존 경고 종류 유지).
- Backend Jest: 3 suites / 25 tests 통과. 카탈로그 좌표가 있어도 DEMO 유지, v2 생성, 주차장 2 전환, 네 후보 소진 검증. 백엔드 서비스 로직 변경 없음(API 문서 예시 버전만 v2로 갱신).
- 일반 Android API 36 에뮬레이터, 2560×1600: 업데이트된 `scripts/smoke_android.py` 전체 통과. 위치 화면, 주차장 1 → 2 → 축구장, 재실행 복원, 주행 제한, 동승자 카드의 동일 만남 좌표, 합류, 네 후보 소진 및 취소 확인.
- 1000×1600: 위치 목록을 스크롤하여 여섯 좌표 모두 접근 가능, 닫기 버튼 유지 확인. 배치도 라벨과 목록의 시각적 겹침 없음.
- 스크린샷: `06-site-locations.png`, `07-narrow-plan.png`, `08-narrow-locations.png`, `09-narrow-locations-bottom.png` (`artifacts/screenshots/`).
- UI 자동화의 시작 직후 화면 계층 미준비를 재시도하도록 보완. 이전 XML을 새 화면으로 오인하지 않는다.

이 결과는 **추정 위치를 사용하는 일반 Android 시연** 검증이다. Pleos SDK/실차 경로,
현장 진입구와 정차 허용 여부, 백엔드와 앱의 실시간 동기화는 아직 검증하지 않았다.


## NaviHelper 코드 연결 — 2026-11-12

- 공식 Maven NaviHelper 3.0.5 의존성 다운로드 및 실제 AAR API에 대한 컴파일 성공. navi-data 3.0.4 / navi-aidl 3.0.1은 SDK의 간접 의존성이다.
- `:domain:test`: 총 13 tests, 0 failures/errors. 요청 반환/완료 콜백/목적지 대조 구분, 다른 목적지·타임아웃·늦은 콜백, 보행/후보 소진 단계의 경로 요청 방지, Automotive 미확인 상태의 제한 검증.
- `:app:assembleDebug`, `:app:lintDebug`: 성공, Lint 오류 0 / 기존 경고 6.
- 병합 Manifest: NAVI_ROUTE / NAVI_ROUTE_SEARCH, SDK의 서비스 queries, 선택적 android.car 런타임 라이브러리 선언 확인.
- 일반 Android API 36 ARM64 에뮬레이터: SDK 포함 APK 설치·실행 성공, 기존 Android UI smoke 전체 통과(후보 변경/재실행 복원/조작 제한/동승자 카드/합류/소진/취소).
- 최종 Manifest 변경 후 APK 재설치·재실행 확인. Pleos 서비스 없음 표시 및 하차 단계의 경로 요청 버튼 비활성화 확인. 일반 기기에서 android.car 미설치로 인한 충돌 없음.
- `scripts/check_pleos.py --serial emulator-5580`: Pleos 이미지 없음, automotive=false, hardware=ranchu, Navi service 없음, 앱 설치됨. 이 출력은 연결 성공이 아니다.
- 스크린샷: `artifacts/pleos-sdk/screenshots/` (07-sdk-unavailable.png 포함).
- 프로젝트 ID/클라이언트 비밀값을 SDK 초기화에 사용하지 않았으며 기존 BuildConfig 공개 값 allowlist 유지.

### 최초 코드 연결 시점의 제한

위 코드 연결 검증 시점에는 Pleos 이미지가 미설치 상태였다. 이후 사용자가 설치·실행했고 아래 검증을 추가했다.

## 실제 Pleos 에뮬레이터 연결 — 2026-11-12

환경: Pleos Connect 2.1.0 ARM64, API 34, `emulator-5554`, automotive=true, hardware=ranchu.
NaviHelper 클라이언트 3.0.5 / 실제 Navi 서비스 3.0.4.

### 확인한 결과

- 수정 debug APK 설치·실행 성공. NAVI_ROUTE 및 NAVI_ROUTE_SEARCH granted=true.
- `onServiceConnected`, 콜백 등록, `getRouteStateInfo` → `onRouteStateInfo` 실제 왕복 응답.
- CarUxRestrictionsManager에서 조작 가능 상태 수신. P/0 km/h 화면 확인. D/주행 전환은 미검증.
- 빈 POI ID/주소와 하차 추정 좌표(35.22669, 126.83931)를 사용한 `requestRoute` 수락.
- 기본 Navigation 화면에서 오룡관 북측 하차 지점으로 실제 경로 탐색·안내 시작. 기본 출발점은 성남이며 약 270km 경로로 표시되었으므로 GIST 내부 경로 검증으로 간주하지 않는다.
- 구형 `onRouteEnded` 탐색 완료 콜백 → `getDestinationInfo` → `onDestinationInfo` 수신.
- 요청한 좌표와 3m 이내 일치하여 앱에 **탐색 완료 콜백 수신 · 요청한 목적지 좌표 일치** 표시. 이는 좌표 응답 대조이며 물리적 도착 또는 장소 정확도 검증이 아니다.
- 네이티브 앱으로 이동한 동안에도 응답 수신, 앱 복귀 시 완료 결과 유지.
- 네트워크 장애 시 실패/취소 응답 및 미응답 타임아웃 표시. 실패를 성공으로 표시하지 않음.

### 실행 중 수정한 문제

1. 내비게이션이 전면으로 이동할 때 기존 onStop이 SDK를 해제해 결과를 놓쳤다. ViewModel에서 컨트롤러를 유지하고, 요청 중에는 원래 25초 제한까지 연결을 유지한 후 정리하도록 수정했다.
2. 이 Navigation 구현은 최신 `onRoutingCompleted` 대신 구형 `onRouteEnded`를 보냈다. Maven 배포 SDK 소스에서 같은 탐색 완료 의미임을 확인하고 공통 처리로 연결했다. 두 이벤트가 중복되어도 목적지 대조/종료 결과가 유지되는 테스트를 추가했다.
3. 에뮬레이터 가상 Wi-Fi 연결과 명시적 DNS 설정으로 통신을 복구했다. 네이티브 지도 초기화 정체는 Navigation 앱만 재시작하여 복구했다. 핫스팟이 단독 원인인지는 입증하지 않았다.

### 최종 빌드와 증거

- `:domain:test`: 14 tests, 0 failures/errors.
- `:app:assembleDebug`, `:app:lintDebug`: 성공, 오류 0 / 기존 경고 6.
- 최종 APK 재설치 후 실제 완료 콜백·목적지 좌표 대조를 다시 확인했다.
- `artifacts/pleos-live/01-native-guidance.png`: 실제 내비게이션 길 안내.
- `artifacts/pleos-live/02-sdk-destination-confirmed.png`: 앱 복귀 후 목적지 대조 성공.
- `artifacts/pleos-live/sdk-callbacks.txt`, `confirmed-ui.txt`: 필요한 SDK 이벤트와 화면 문구만 추출. 전체 네이티브 로그나 인증 헤더는 저장하지 않음.

### 남은 검증

- GIST 근처 출발 위치, 주차 후보 4곳, 실제 진입구·일방통행·정차 허용 조건.
- Virtual Console의 주행/정차 전환에 따른 조작 제한, 서비스 재시작/권한 실패의 전체 시나리오.
- Vehicle SDK 기어·도어 센서, STT/TTS, 백엔드와 앱 동기화, 동승자 모바일 웹.

## 차량·동승자 공유 구현 — 2026-11-12

실제 Pleos 앱 → NestJS API → 모바일 브라우저의 공유 흐름을 연결했다. 도메인 19개 및 웹 4개 테스트 통과, debug 빌드 성공, Lint 오류 0 / 경고 7. QR 이미지 디코딩, 주차 후보 변경, 고정 만남 장소, 응답 중단·앱 재시작 후 정확히 한 번 재전송, 주차·합류 완료, 이전 링크 폐기(404)를 확인했다. 상세 실행과 남은 배포 작업은 [공유 검증 기록](SHARING_SETUP.md)을 참고한다. 이전 절의 ‘서버 동기화·동승자 웹 미구현’은 당시 시점의 기록이다.


## arrive 화면 개편 — 2026-11-13

- 브랜드 표기를 `arrive`로 통일. 사용자 제공 원본 `assets/`를 보존하고 Android 헤더·공유 영역·적응형 런처 아이콘 및 웹 헤더·심볼·favicon에 파생 리소스 적용.
- 앱은 ‘이번 방문’에 장소를 표시하고 현재 단계/행동과 고정 만남 장소를 분리. 장소 이름은 공유 카탈로그에서 생성해 표시하며 `VisitPlace`로 UI에 전달한다. 지원 장소는 여전히 GIST 오룡관 한 곳이며 다른 장소 선택/검색은 구현하지 않았다.
- 웹은 만남 장소를 우선 표시하고 진행 단계/주차 후보를 별도로 배치. 반복 타임라인을 제거하고 좌표·상세 안내를 펼침 영역으로 이동. 시연 표시와 추정 좌표 주의 문구는 기본 화면에도 유지.
- 공유 API·도메인 전이·SDK 경로 요청/조작 제한 로직은 유지. 기존 UI smoke 스크립트의 버튼 이름과 실행 안내를 수정했다.

검증 결과:
- 도메인 테스트 19개, 웹 테스트 4개 통과.
- 최종 clean Android build 및 lint 성공: 오류 0, 기존 경고 6(의존성/target API/백업 설정). 최종 APK를 Pleos 에뮬레이터에 재설치.
- 실제 차량 앱 QR → 웹 연결, 주차 후보 1→2 변경, 만남 장소 유지, 주차 완료, 재회 완료 반영 확인. 새 방문 후 이전 링크 사용 불가 표시 확인.
- 웹 390px/320px에서 가로 넘침 없음, 로고 로딩 확인. 1200px 데스크톱 및 위치 상세 펼침 확인.
- Android 기본 차량 화면과 좁은 폭 배치 확인. 일시 변경한 화면 밀도는 원래대로 복구. 첫 방문 준비 화면으로 복귀.
- 주행 상태 전환과 실제 현장 동선은 이번 UI 변경 범위에서 추가 검증하지 않았다. 외부 배포는 하지 않았다.

화면 기록:
- `output/playwright/arrive-android.png`
- `output/playwright/arrive-mobile-visit.png`
- `output/playwright/arrive-mobile-320.png`
- `output/playwright/arrive-mobile-empty.png`
- `output/playwright/arrive-desktop.png`


## 운전자 UI 무채색 개편 — 2026-11-13

사용자 피드백에 따라 녹색 중심 테마를 흰색·회색·검정으로 교체했다. 제공받은 로고 원본은 보존하고 화면에는 단색으로 표시한다. 동승자 웹도 같은 무채색 계열로 변경했다.

주요 변경:
- 현재 장소를 큰 글자로 표시하고 반복되는 장소 접두어를 줄였다. 원래 전체 명칭·좌표·안내는 상세 화면에 유지한다.
- 하차/주차/만남 완료를 짧은 동작 이름으로 표시한다. 검정 채움 버튼과 흰색 테두리 버튼, 서로 다른 아이콘으로 완료와 대안을 구분한다.
- 핵심 단계 버튼은 스크롤 영역 밖 하단에 고정한다. 최소 높이 72dp, 가로 간격 16dp. 좁은 화면에서는 세로 배치하고 간격 12dp를 유지한다. 이는 프로젝트의 UI 설계값이며 별도 자동차 인증 수치를 의미하지 않는다.
- 낮은 창에서는 큰 장식 아이콘을 생략하고 장소명과 내비 버튼을 나란히 표시한다.
- 긴 안내, SDK 진단, 새 방문과 종료는 ‘더 보기’로 이동한다. 방문 종료에는 확인창을 추가했다.
- 실제 차량 조작 제한은 유지한다. 제한 중에는 단계/내비/공유/상세 조작을 제공하지 않고, 열려 있던 대화상자도 닫는다.

검증:
- 도메인 테스트 19개, 웹 테스트 4개 통과. 최종 debug APK 빌드 및 lint 성공, 오류 0 / 기존 경고 6.
- 기존 기기를 보존하는 read-only 임시 Android 에뮬레이터에서 UI smoke 통과: 시작, 하차, 주차 후보 변경, 고정 만남 장소, 프로세스 재시작 복원, 주행 제한 미리보기, 공유 대화상자, 주차/만남 완료, 후보 소진, 종료 확인, 새 방문.
- 클릭 가능한 실제 버튼 영역의 72dp 높이 및 버튼 간 간격을 확인했다.
- 680×520, 390×844, 320×740 및 390×844 글자 1.3배 환경에서 완료/대안 버튼 전체 노출과 간격 확인. 680×520 화면의 장소명 가림을 발견해 간결한 가로 배치로 수정하고 다시 확인했다.
- Pleos 에뮬레이터에 최종 APK 설치. 실제 QR로 동승자 웹 연결 및 주차 단계 반영 확인.
- 모바일 웹 320px/390px 가로 넘침 없음, 로고 로딩 확인.
- 실제 Pleos의 주행/정차 신호 전환은 이번 작업에서 조작하지 않았다. 제한 UI는 일반 Android의 시연 스위치로 검증했으며 실차 주행 중 가독성 검증은 포함하지 않는다.
- 백엔드 코드·API 계약과 외부 배포는 이번 UI 작업에서 변경하지 않았다.

화면 기록:
- `output/playwright/neutral-pleos-parking.png`
- `output/playwright/neutral-mobile.png`
- `output/playwright/neutral-android-680x520-font1.png`
- `output/playwright/neutral-android-320x740-font1.png`
- `output/playwright/neutral-android-390x844-font1.3.png`
- `output/playwright/neutral-smoke/`


## 운전자 화면의 정보 위계·조작 영역 개편 — 2026-11-13

제품 원칙: 동승자가 먼저 내리고 운전자는 주차한 뒤 같은 장소에서 만난다. 주차 후보가 바뀌어도 만남 장소는 유지된다. 운전자는 현재 목적지와 다음 행동을 짧은 시선으로 구분할 수 있어야 한다.

참고한 공식 인터페이스:
- [Tesla Model 3 Touchscreen](https://www.tesla.com/ownersmanual/model3/en_us/GUID-518C51C1-E9AC-4A68-AE12-07F4FF8C881E.html): 차량 상태와 내비게이션 등 기능 영역을 구분하는 배치. 실제 표시 내용은 차량·소프트웨어 등에 따라 다르다.
- [Pleos Display Layout](https://document.pleos.ai/docs/connect/guide/docs-design/getting-started/layout): 시스템 주행 정보와 앱 창의 구분, 분할 창과 가로/세로 대응.
- [Google Automotive Sizing](https://developers.google.com/cars/design/automotive-os/design-system/sizing): 76×76dp 최소 터치 영역 권고를 참고해 일반 버튼 80dp, 넓은 화면의 단계 버튼 104dp를 적용했다.
- [Google Visual Principles](https://developers.google.com/cars/design/design-foundations/visual-principles): 짧고 식별 가능한 정보와 시각적 위계. 해당 문서 전체에 대한 적합성 인증을 의미하지 않는다.

arrive에 적용한 해석:
- 앱 창 폭 1000dp 이상·높이 760dp 이상에서 운전자 작업 영역과 합류 계획을 분리한다. 현재 목적지 64sp, 만남 장소 44sp, 주요 행동 30sp를 적용한다.
- 하차·주차·만남 단계는 현재 목적지와 같은 영역에 둔다. 검정 완료 버튼은 왼쪽, 흰색 주차 변경 버튼은 오른쪽에 고정한다.
- 동승자와 운전자 아이콘이 한 점으로 모이는 그림은 합류 계획이다. 위치 추적·실제 경로처럼 표현하지 않으며 접근성 설명에도 이를 명시한다.
- 좁은 창에서는 현재 목적지 32sp와 고정 만남 장소를 유지한다. 장식보다 장소와 완료 동작을 우선하고, 부가 내용은 스크롤 영역에 둔다.
- 장소 배치도와 긴 안내는 ‘더 보기’에서 접근한다. SDK 연결·동기화·주행 제한 로직은 유지한다.
- 기존 시연 위치와 단일 장소 데이터만 사용한다. 모바일 웹·백엔드 계약은 이번 변경 범위에 포함하지 않는다.

검증 결과:
- Android debug 빌드 성공, Lint 오류 0 / 기존 경고 6. 도메인 테스트 19개 결과 유지(Gradle up-to-date).
- 별도 read-only 에뮬레이터에서 전체 UI smoke 통과: 시작·하차·대안 주차·만남 장소 유지·앱 재시작 복원·주행 제한 미리보기·공유 창·주차/만남 완료·후보 소진·종료/초기화.
- 1440×1000에서 완료/다른 주차장 버튼의 실제 클릭 영역 높이 104dp, 간격 16dp 확인. 상세 메뉴의 내비/장소 접근 확인.
- 680×520, 390×844, 320×740, 390×844 글자 배율 설정 1.3에서 목적지와 두 단계 버튼의 전체 노출 확인. 일반 버튼 높이 80dp, 세로 배치 간격 12dp 유지.
- 작은 창 검토 중 부가 안내 잘림을 발견해 수정: 낮은 가로 창에서는 목적지/내비를 나란히 표시하고, 높이가 부족한 세로 창에서는 내비를 상세 메뉴로 제공한다. 수정 후 같은 크기로 재검증했다.
- 최종 APK를 사용 중인 Pleos 에뮬레이터에 설치했다. 기존 방문 데이터와 공유 상태는 유지했다. 별도 검증용 에뮬레이터만 종료했다.
- 실제 차량 주행 중 가독성·야간 모드·실제 Pleos 주행 신호 전환 검증은 이번 범위에 포함하지 않는다. 외부 배포 없음.

화면 기록:
- `output/playwright/driver-wide-parking.png`
- `output/playwright/driver-pleos.png`
- `output/playwright/driver-android-680x520-font1.png`
- `output/playwright/driver-android-320x740-font1.png`
- `output/playwright/driver-android-390x844-font1.3.png`
- `output/playwright/driver-smoke/`

## 공개 HTTPS 배포 및 연결 시연 — 2026-11-13

- 동승자 웹: https://arrive.ikjun.com (Cloudflare Pages), API: https://arrive-api.ikjun.com (Lightsail).
- Pages 배포 후 API 조회 502를 확인했다. 실제 Workers 로컬 런타임에서 `redirect: error` 미지원 오류를 재현했고, `manual` + 3xx 명시적 거부로 수정했다. `wrangler.toml`에 호환성 날짜와 공개 API 주소를 고정했다. 임시 오류 진단 출력은 제거했다.
- 수정 커밋 `68c54f7` push 및 Cloudflare Pages 배포 success 확인. 웹·API health·Pages 경유 장소 조회 모두 200 확인. 인증 없는 공유 조회 401 확인.
- 웹/프록시 테스트 10개 통과. Workers 로컬 런타임에서 실제 운영 API 조회 200 확인.
- `.env.local`의 공개 주소 두 개만 HTTPS로 변경하고 debug APK를 빌드해 Pleos에 설치했다. Pleos 인증 관련 비밀값은 수정하지 않았다.
- Pleos에서 새 방문 생성 → 실제 QR 해석 → 공개 웹 연결 → 하차 → 주차장 2로 변경 → 고정 만남 장소 유지 → 주차 완료 → 만남 완료가 공개 웹에 반영됨을 확인했다.
- 검증 방문을 종료하고 휴대폰 확인용 새 방문을 준비했다. 실제 휴대폰 카메라·LTE/5G 확인은 사용자 확인으로 남는다.
- 화면 기록: `output/playwright/public-mobile-parking.png`. 공유 토큰은 문서·도구 출력·커밋에 포함하지 않는다.
- 이 APK는 에뮬레이터 시연용 debug 빌드이며 제출용 release 서명이나 앱 마켓 공개는 포함하지 않는다.

## 2026-11-13 지도·입구 안내 개편 검증

- Android `:app:assembleDebug :domain:test` 성공. 기존 도메인 테스트 19개 통과 상태 유지.
- Pleos emulator-5554 업데이트 설치/실행. 지도 타일, 4개 주차 후보, 하차 지점, 남측 입구 실제 표시 확인. 초기 WebView 높이 0 문제는 viewport 재측정으로 수정. 기존 방문 상태 유지.
- 웹 `npm test`: 13개 통과. 입구 guide의 venue/catalog 일치 검증, 취소/미등록 처리와 링크 좌표 검증 포함.
- 브라우저 390×844/320×740: 가로 넘침 없음. 지도 타일 로드 및 입구 링크 좌표 확인. 테스트용 방문으로 P3 → P4 변경이 마커와 주차 안내에 반영됨.
- 취소 시 외부 지도 버튼/보행 단계 숨김. 다른 venueId에는 오룡관 입구를 재사용하지 않음.
- 지도 타일 요청 실패를 주입해 오류 문구와 텍스트 입구 안내 유지 확인. JavaScript pageerror 없음.
- 화면: `output/playwright/arrival-map-pleos.png`, `arrival-map-mobile.png`, `arrival-map-mobile-320.png`, `arrival-map-tile-error.png`.
- 실제 도로/보행 경로, 문 위치·운영 시간, 차량 주행 중 지도 제공은 미검증. 보행 경로선·실시간 위치·ETA 미제공.
- 공개 배포: 커밋 `67c6c8d`, Cloudflare Pages check success. `https://arrive.ikjun.com` HTTP 200 및 CSP/Referrer-Policy 확인.
- 실제 차량 QR을 새 브라우저 세션에서 열어 공개 API의 ‘주차를 마쳤어요’ 상태와 남측 입구 마커, 지도 타일 6개 로드/오류 없음 확인. 캡처: `output/playwright/arrival-map-public-mobile.png`. 공유 토큰은 로그·문서에 기록하지 않음.
- 지도 마커 이름표가 가장자리/출처 표시와 겹치지 않도록 여백 보완 (`4c496ec`, Cloudflare Pages success). 최종 APK 재설치 및 공개 모바일 화면 재확인.
- 최종 배포 직후 공유 조회에 일시적 502가 2회 관측됨. 직접 API와 Pages 공유 조회 모두 HTTP 200 복구, 새로고침으로 실제 입구/주차 상태 재표시 확인. 재발 시 Pages 함수 upstream timeout과 NestJS 응답 지연 로그 대조 필요.

## 2026-11-14 동승자 전체 지도 UI

- 지도는 전체 viewport를 채우고 목적지 바/접이식 안내 패널을 겹쳐 표시. 모바일 세로·가로, 데스크톱별 패널 위치와 지도 여백 조정.
- `npm --prefix companion test`: 15개 통과. 임의 장소 arrivalGuide/보충 파일 로딩과 경로 식별자 검증 포함.
- 브라우저 320×740, 390×844, 844×390, 1280×800에서 화면 넘침 없이 표시. 패널 펼치기/접기, 취소된 방문의 이동 버튼 숨김 확인.
- 테스트용 컨벤션센터 카탈로그/입구 안내로 바꿨을 때 해당 장소 이름과 입구를 표시하며 오룡관/남측 광장 문구가 남지 않음. 테스트 데이터는 공개 장소 목록에 추가하지 않음.
- 실제 지원 장소는 기존 오룡관 하나. 지도·입구·문구는 카탈로그 기반이며 UI에 오룡관을 기본 목적지로 고정하지 않음.
- UI 캡처: `output/playwright/companion-full-map.png`, `companion-sheet-expanded.png`, `companion-full-320.png`, `companion-full-844.png`, `companion-full-1280.png`, `companion-generic-fixture.png`.
- 공개 배포 `d9f26f3`: Cloudflare Pages success. 현재 차량 QR로 실제 방문을 열어 지도 영역 390×844 전체 화면, 타일 12개 로드, 지도 오류 없음 확인. 이전 저장 링크는 종료된 링크로 확인되어 현재 QR로 검증함.
- 공개 화면: `output/playwright/companion-full-map-public.png`.


## 2026-11-14 · 차량 상황 기반 운전자 조작 줄이기

- FusedLocation 1.1.3 + AAOS GEAR_SELECTION 연결. 실제 Pleos 에뮬레이터 callback, 가상 GPS 입력, P 상태 수신 검증.
- 하차/주차 근처 P 6초 유지 시 확인 제안. 위치 만료·관측 공백·변속 변화·대상 변경 시 초기화. 실제 하차/주차/합류는 사용자 확인 유지.
- 시작/하차 확인/다른 주차장 선택과 길안내 요청 통합. 명시적 사용자 전환에만 10초 이내 한 번 요청.
- 실제 SDK 탐색 완료 후 목적지 좌표 대조 성공. 경로 교체 중 이전 경로 취소 콜백 처리 보완.
- :app:assembleDebug, :app:lintDebug 성공. 도메인 29개 / 웹 15개 테스트 통과.
- 기존 공유 방문을 보존한 로컬 방문으로 확인 후 원래 저장값 복원. 백엔드 계약/위치 업로드 변경 없음.
- 자세한 동작 및 남은 현장 검증: [DRIVER_AUTOMATION.md](DRIVER_AUTOMATION.md).


## 2026-11-14 · 운전자/동승자 전체 흐름 재점검

- 실제 배포 API/웹과 설치된 Pleos 앱으로 새 QR 방문을 만들고 하차 → 주차장 2 변경 → 주차 → 합류까지 전달 확인.
- 웹 오프라인 표시/자동 복구/동일 탭 새로고침 확인. 의도한 오프라인 요청 오류 외 JS 오류 관찰 없음.
- 이전 단위 시연의 직접 앱 복귀가 가린 실제 UX 문제 확인: 내비 전면 전환 시 위치 감지 중단 및 복귀 진입점 부족, 주차 뒤 차량에만 있는 합류 확인.
- 실제 현장 보행/실차 주행 검증은 아님. 가상 GPS와 내비 출발지 불일치(시흥동→오룡관 약270km) 관찰.
- 우선순위·완료 기준·백엔드 영향·화면 증거: [FULL_FLOW_REVIEW.md](FULL_FLOW_REVIEW.md).
