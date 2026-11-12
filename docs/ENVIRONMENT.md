# 로컬 설정 입력

저장소 루트의 `.env.local`을 편집하세요. 이 파일은 `.gitignore`에서 제외되며 새로 생성할 때 파일 권한은 600입니다.
공유용 `.env.example`은 빈 값과 공개 개발 주소만 담습니다. 기존 `.env.local`은 자동 덮어쓰지 않습니다.

## 지금 입력할 값

- `PLEOS_PROJECT_ID`: Pleos Playground → Workspace → My Project → 프로젝트 정보 → 키 정보의 프로젝트 ID(Key).
  제출·관리용 로컬 기록이며 현재 NaviHelper/Vehicle State 초기화에 전달하거나 APK에 포함하지 않습니다.
- `PLEOS_CLIENT_ID`, `PLEOS_CLIENT_SECRET`: 선택. 공식 가이드에서는 서버 연결이 필요한 STT/TTS에 사용하는 값입니다.
  현재 기능에는 필요하지 않으므로 비워도 됩니다. 보관하더라도 Android 빌드에서는 사용하지 않습니다.
  향후 음성 SDK 인증은 해당 SDK의 보안·배포 방식을 별도 검증한 뒤 구현합니다.
- CRN은 Pleos emulator 2.1.0 이후 요구되지 않아 입력 항목을 만들지 않았습니다.

공식 근거: https://document.pleos.ai/docs/pleos-only/create-my-project (2026-11-12 확인).

## 앱에 들어가는 공개 주소

- `ARRIVAL_API_BASE_URL`: Android Emulator에서 개발 컴퓨터의 백엔드를 연결할 때 쓸 주소.
  기본값 `http://10.0.2.2:8080`. 실제 휴대전화/차량/배포 환경에서는 접근 가능한 서버 주소로 바꿉니다.
- `ARRIVAL_COMPANION_BASE_URL`: 동승자 웹 주소. 아직 배포하지 않았다면 빈 값 유지.
- 위 두 항목만 Android `BuildConfig`와 `AppConfiguration`에 전달됩니다.
  공유 토큰이나 사용자 인증 정보는 주소에 넣지 않습니다. 배포할 때 HTTPS 주소를 사용합니다.
- 우선순위: 프로세스 환경 변수 → 루트 `.env.local` → 기본값.
- Android Studio를 포함한 Gradle 빌드가 `.env.local`을 직접 읽습니다. `source .env.local`은 필요 없습니다.
- 형식은 한 줄에 `KEY=VALUE`. 선택적으로 값 전체를 같은 작은따옴표/큰따옴표로 감쌀 수 있습니다.
  주석은 별도 줄에 `#`로 작성하세요. 변수 치환·명령 실행·여러 줄 값은 지원하지 않습니다.
- 주소를 변경하면 앱을 다시 빌드/설치해야 합니다.

현재는 설정을 읽는 기반만 준비돼 있습니다. 값을 입력해도 실제 길안내·음성 인증·서버 동기화가 자동 구현되는 것은 아닙니다.
Pleos 프로젝트 값과 비밀값은 BuildConfig allowlist에 없고, 앱 assets/resources에도 복사하지 않습니다.

## 입력 확인

```sh
python3 scripts/check_env.py --require-project
```

값을 출력하지 않고 SET/EMPTY 및 URL 형식만 확인합니다. 실제 인증 또는 서버 연결 검증은 아닙니다.
`.env.local`에 적은 값을 채팅이나 공유 문서에 복사할 필요는 없습니다.

## 백엔드와 구분

이 파일은 Codex 담당 차량 앱·로컬 프로젝트 설정입니다.
Claude가 관리하는 `backend/.env`는 독립적이며 이 작업에서 수정하지 않습니다.
세션 owner/share 토큰은 실행 중 백엔드가 발급하는 값이므로 환경 변수로 고정하지 않습니다.
