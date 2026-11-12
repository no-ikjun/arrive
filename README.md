# Arrive

동승자 하차 → 주차 대안 선택 → 약속한 장소에서 합류하는 차량 앱 프로토타입.

## 현재 범위

- Kotlin/Jetpack Compose Android 앱, minSdk 28 / compileSdk 35 / targetSdk 34.
- 오룡관 방문 흐름과 주차 후보 변경, 만남 장소 유지, 후보 소진, 방문 취소.
- 로컬 저장으로 프로세스 재시작 후 방문 복원.
- 정차/주행 제한 **시연 스위치**. 실제 차량 상태 연동이 아닙니다.
- 동승자 카드의 앱 내 미리보기. 실제 공유 URL/다른 기기와 동기화는 아직 없습니다.
- JVM 상태 전이 테스트.

2026-11-11: debug APK 빌드, 상태 전이 6개 테스트, 일반 Android 에뮬레이터 UI smoke 통과.
Lint 오류 0 / 경고 6. 자세한 환경·제한은 [검증 기록](docs/VALIDATION.md)을 참고하세요.

**현재 앱은 로컬 시연용입니다. 실제 길안내, Pleos SDK 연동, CarUxRestrictions 연동,
주차 가능 여부 확인, 보행 지도, 모바일 공유 웹은 아직 구현되지 않았습니다.**
장소 좌표/허용 조건은 미확인이며 앱에 그 사실을 표시합니다. 실차 운전 중 사용하지 않습니다.

## 구성과 역할

- `app/`: Codex 담당 Android UI, 로컬 저장.
- `domain/`: 서버와 공유할 상태 전이 의미 및 Kotlin 테스트.
- `contracts/`: 백엔드 API 계약과 시연 장소 JSON.
- `docs/CLAUDE_BACKEND_HANDOFF.md`: Claude에게 전달할 백엔드 작업 지시.
- `backend/`: Claude 담당 예정(아직 없음).

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

설치 후 ‘방문 흐름 시연하기’ → ‘동승자 하차 확인’ → ‘이곳은 이용할 수 없어요’ →
‘이곳에 주차했어요’ → ‘다시 만났어요’. 세 후보를 모두 제외한 경우 안내를 멈추며 만남 장소는 유지합니다.
기본 앱은 일반 Android 에뮬레이터에서도 실행되며 넓은 창에서는 두 열로 표시됩니다.

## 다음 구현 단계

1. Pleos emulator 2.1.0을 별도 설치하고 SDK 연결/권한/콜백을 실제 검증.
2. 실제 승하차 허용 지점과 주차 진입 좌표를 확인한 뒤 NaviHelper 연결.
3. AAOS CarUxRestrictions 연동, Vehicle State capability 확인 및 실패 처리.
4. 백엔드 HTTP 클라이언트와 동승자 모바일 카드 구현. 오프라인 상태와 공유 성공을 구분.
5. UI 및 실사용 시나리오 검증 후 제출용 release 서명·APK·영상 준비.

## SDK 근거 (2026-11-11 확인)

- [NaviHelper](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/NaviHelper/intro)
- [NaviHelper dependency](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/NaviHelper/importing-sdk): `ai.pleos.playground:NaviHelper:3.0.5`
- [Vehicle](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/Vehicle/intro)
- [주행 제한](https://document.pleos.ai/docs/pleos-only/vehicle-app-planning-guide/driver-distraction-guideline)
- [에뮬레이터](https://document.pleos.ai/docs/connect/guide/getting-started/application-development/setup-connect-sdk-emulator)

`requestRoute()` 호출 반환만으로 경로 안내 성공을 표시하지 않습니다. SDK 어댑터 구현 시
콜백 실패/미응답/연결 해제를 구분하고, 실제 경로가 확인되지 않으면 다음 단계로 자동 진행하지 않습니다.
