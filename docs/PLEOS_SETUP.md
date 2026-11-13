# Pleos SDK 연동과 에뮬레이터 준비

## 앱에 연결한 것

- 공식 Maven `ai.pleos.playground:NaviHelper:3.0.5` 사용. 간접 의존성 navi-data 3.0.4 / navi-aidl 3.0.1.
- `NAVI_ROUTE`, `NAVI_ROUTE_SEARCH` 권한 선언. 사용하지 않는 지도 표시·음성 권한은 추가하지 않는다.
- initialize 연결/실패, 30초 연결 타임아웃, 요청 결과 콜백, 25초 경로 응답 타임아웃, 오류 처리 및 리스너 해제.
- `onRoutingCompleted` 또는 Connect 2.1.0에서 실제 수신한 구형 `onRouteEnded` 이후 `getDestinationInfo`로 요청 좌표와 대조한다. 3m 이내 일치 시에만 ‘탐색 완료 콜백 수신 · 요청한 목적지 좌표 일치’를 표시한다. 이 3m는 SDK 응답 대조 기준이며 현장 좌표의 정확도나 도착 판정 반경이 아니다.
- `getRouteStateInfo` 응답으로 연결 응답 여부를 주기적으로 확인한다. 8초간 응답이 없으면 확인 불가로 처리하며 연결이 유지된 것으로 가정하지 않는다.
- 일반 화면 이탈/다시 연결 시 리스너와 SDK를 해제한다. 단, 경로 요청으로 네이티브 내비게이션이 전면에 나오는 동안에는 기존 25초 제한 안에서 리스너를 유지하고, 결과 수신/타임아웃 후 정리한다. ViewModel로 화면 재생성 시 요청과 결과를 유지한다. 이전 연결의 지연 콜백을 무시한다. SDK에는 요청 ID가 없으므로 다른 앱의 전역 내비 이벤트와 완벽한 상관관계는 보장할 수 없다. 현재 목적지와 완료 콜백을 함께 확인한다.
- SDK 콜백은 방문 단계를 자동 변경하지 않는다. 하차·주차·합류는 사용자가 확인한다. 보행 단계에서는 차량 경로 요청이 없다.
- Automotive 기기는 `CarUxRestrictionsManager` 신호로 상세 조작을 제한한다. 상태 미확인/연결 해제 시도 제한한다. 일반 Android 기기만 기존 시연 스위치를 제공한다.
- 현재 추정 카탈로그의 경로 요청은 **debug Android 에뮬레이터**에서만 허용한다. release/실차 요청 기능이 아니다.
- 미확인 POI ID/주소는 빈 문자열로 전달한다. 임의 POI를 만들지 않는다. 좌표만 사용한 하차 지점 요청은 Pleos Connect 2.1.0에서 실제 수락·탐색 완료·목적지 좌표 일치를 확인했다. 다른 후보와 현장 진입 경로는 별도 검증한다.
- 앱에서 SDK 해제/방문 종료를 해도 전역 내비 경로를 자동 취소하지 않는다. 다른 앱이 설정한 경로를 취소할 수 있으므로 테스트 후 Navigation 앱에서 종료한다.

## 현재 설치와 실행 결과 — 2026-11-12

사용자가 Pleos Connect 2.1.0 ARM64 / API 34 이미지를 설치하고 실행했다.
`emulator-5554`에 수정 APK 설치, Navi 서비스 3.0.4 연결, 두 권한 부여, 상태 응답,
CarUxRestrictions의 조작 가능 신호, 하차 지점 경로 탐색 및 목적지 좌표 일치를 확인했다.
앱 복귀 후에도 완료 결과가 유지된다. 상세 증거는 [검증 기록](VALIDATION.md)을 참고한다.

### 재설치가 필요한 경우

1. Android Studio → **Tools → SDK Manager → SDK Update Sites → +**.
2. Name: `Pleos Connect System Image`. URL (Mac):

   ```text
   https://nexus-playground.pleos.ai/repository/raw-releases/connect-avd/2.x/crp-arm64-sys-img.xml
   ```

3. **SDK Platforms → Show Package Details → Android API 34 → Pleos Connect v2.1.0 APIs arm64 System Image**를 선택하고 Apply.
4. 표시되는 SDK 이용약관을 직접 확인하여 동의한 뒤 설치. 설치가 끝나면 Android Studio 재시작.
5. **Device Manager → Create device → Automotive → Pleos Connect v2.1.0**.
6. 이미지: **API 34 / Pleos Connect v2.1.0 APIs**, RAM **4 GB**, Boot **Cold**로 설정 후 실행. Quick boot는 VHAL 검증에 사용하지 않는다.

이미지를 설치·실행한 뒤에는 다음 검증을 이어갈 수 있다. 메뉴에 Pleos가 보이지 않으면 먼저 SDK Update Sites가 활성화돼 있는지 확인한다.

## 재현 및 남은 검증

1. `python3 scripts/check_pleos.py`로 설치/ADB 연결을 확인하고, 이어서 `--serial emulator-XXXX`로 서비스 존재와 권한을 점검한다.
2. 새 debug APK를 해당 에뮬레이터에 설치한다.
3. Pleos Navigation 앱이 초기 설정·이용약관·로그인을 요구하면 사용자가 진행한다. 앱이 이런 단계를 대신 수락하지 않는다.
4. 앱 실행 → 차량 조작 가능 상태와 ‘Pleos SDK 연결됨’ 확인.
5. ‘방문 흐름 시연하기’ → 하차 단계 → ‘Pleos 경로 요청 테스트’. 요청 전송, 완료 콜백, 목적지 좌표 일치를 각각 확인한다.
6. 주차장 1·2·축구장·기숙사 후보에서 반복한다. 지도에서 실제 진입구·일방통행·우회 경로를 대조한다. 경로가 안 나오거나 좌표가 도로로 보정되면 입력 지점/허용 조건을 확인한다.
7. 테스트할 에뮬레이터의 출발 위치는 Extended Controls → Location에서 GIST 인근의 접근 도로로 설정한다. 하차 지점과 같은 좌표는 너무 가까워 경로 요청이 거절될 수 있다.
8. `adb -s emulator-XXXX forward tcp:8088 tcp:8088` 후 PC에서 `http://127.0.0.1:8088/` 접속. Virtual Console의 기어/주행 상태 변화에 따라 제한이 적용되는지 확인한다.
9. 서비스 중단/재시작, 권한 실패, 응답 없음, 화면 재진입과 후보 변경을 검증한다.

**일반 Android 에뮬레이터의 ‘서비스 없음’은 정상 fallback이다. 이를 Pleos 연결 성공으로 기록하지 않는다.**

## 공식 근거 (2026-11-12 확인)

- [NaviHelper 의존성](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/NaviHelper/importing-sdk)
- [권한](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/NaviHelper/declaring-permissions)
- [초기화와 해제](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/NaviHelper/initialization-and-release)
- [목적지 요청과 콜백](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/NaviHelper/destinations)
- [에뮬레이터 설치](https://document.pleos.ai/docs/connect/guide/getting-started/application-development/setup-connect-sdk-emulator)
- [Virtual Console](https://document.pleos.ai/docs/connect/guide/getting-started/application-development/use-vehicle-emulator)
- [CarUxRestrictionsManager](https://developer.android.com/reference/android/car/drivingstate/CarUxRestrictionsManager)

## 네트워크·초기화 문제 재현 시

- 이번 실행에서는 Wi-Fi가 켜져 있어도 연결이 없었다. 에뮬레이터 설정 → 연결 → Wi-Fi → `AndroidWifi`를 선택했다.
- IP 통신 복구 후 DNS 조회가 실패하여 같은 AVD를 `-dns-server 8.8.8.8,8.8.4.4 -no-snapshot-load` 옵션으로 재실행했다. 호스트 Mac의 DNS는 변경하지 않았다. 이 옵션은 이번 실행에만 적용되며 Android Studio 재실행 시 자동 유지되지 않는다.
- 재부팅 후 기본 Navigation의 지도가 비어 있고 `navi not ready`가 발생했다. Navigation 앱만 데이터 삭제 없이 재시작한 뒤 `MapComplete`가 되고 요청에 응답했다.
- 핫스팟 변경, DNS 지정, Navigation 재시작이 모두 개입했으므로 원인을 핫스팟 하나로 단정하지 않는다.
- 이번 성공은 에뮬레이터 기본 출발점(성남) → 오룡관의 테스트 경로다. GIST 내부 일방통행·승하차 허용 검증이 아니다.
- 실제 수신한 완료 이벤트는 `onRouteEnded`였다. NaviHelper 3.0.5 소스에서 `onRoutingCompleted`와 동일한 탐색 완료 의미로 선언된 구형 API임을 확인하고 양쪽을 지원했다. 중복 콜백은 목적지 대조를 다시 시작하지 않는다.
