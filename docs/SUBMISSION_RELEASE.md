# 제출용 release 실행 안내

## 환경과 APK

- 앱: arrive / `com.arrivetogether.app` / 0.1.0-demo (1).
- 검증 환경: Pleos Connect 2.1.0 ARM64, Android 14(API 34), 전체 화면 2560×1440, Android 사용자 10.
- 지도·방문 동기화에는 인터넷이 필요합니다.
- 제출 준비 APK: `output/submission/arrive_arrive_release.apk` (로컬, Git 제외).
- APK와 시연 영상은 개인 드라이브에 업로드해 다운로드 링크로 별도 제출합니다. `output/`은 계속 Git에서 제외하며 공개 링크는 업로드 후 확정합니다.

```sh
adb -s emulator-XXXX install -r 참가자명_arrive_release.apk
adb -s emulator-XXXX shell am start -n com.arrivetogether.app/.MainActivity
```

기존 debug 앱과 인증서가 달라 덮어 설치되지 않습니다. 별도 AVD에서 설치하는 것을 권장합니다. 삭제·재설치는 기존 방문 기록도 지웁니다. 위치·알림 권한을 허용한 뒤 사용합니다.

## 재빌드

JDK 17 이상(검증 JDK 21), Android SDK 35, Gradle 8.10. 공개 주소만 APK에 포함합니다.

```sh
export ARRIVAL_API_BASE_URL=https://arrive-api.ikjun.com
export ARRIVAL_COMPANION_BASE_URL=https://arrive.ikjun.com
export ARRIVAL_KEYSTORE_FILE=/비공개/경로/서명키.jks
export ARRIVAL_KEY_ALIAS=arrive-contest
# 아래 두 값은 본인의 비밀 저장소에서 환경변수로 주입합니다.
# ARRIVAL_KEYSTORE_PASSWORD
# ARRIVAL_KEY_PASSWORD
./gradlew :app:assembleRelease :app:lintRelease :domain:test -ParrivalEmulatorNavigation=true
```

`arrivalEmulatorNavigation=true`는 서명한 release에서도 시연 경로 요청을 허용하기 위한 명시적 옵션입니다. 실제 기기에서는 에뮬레이터 하드웨어 검사에 막힙니다. 옵션 기본값은 false입니다. release의 DEBUG는 false이고 웹 디버깅·debug 콘솔이 켜지지 않습니다. 서버·Pleos 비밀키는 APK에 넣지 않습니다.

생성한 제출용 서명키는 `output/submission/private/`에만 보관했습니다. 키와 비밀번호 JSON을 안전한 비공개 저장소에 함께 백업하고 GitHub·메일·공개 압축본에 넣지 않습니다.

## 실행 순서

시작·길안내 → arrive 복귀 → 하차 확인·주차 안내 → arrive 복귀 → 자리 없어요 → 다음 후보 확인 → 이곳으로 길안내 → arrive 복귀 → 주차 완료 → 휴대폰 QR → 입구 안내 → 합류 확인.

자세한 설명은 [시연 대본](DEMO_SCRIPT.md), 확인 범위는 [최종 점검](FINAL_REVIEW.md)을 참고합니다.
