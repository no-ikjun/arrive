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
