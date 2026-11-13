# arrive 지도·입구 안내 개편 — 2026-11-13

## 이번 구현

- 차량: 합류 개념 그림을 실제 OpenStreetMap 지도로 교체. 하차 지점, 주차 후보 4곳, 남측 입구 표시. 선택한 후보 강조, 제외한 후보는 점선 표시. 확대/축소/전체 보기. 조작 제한 시 지도도 기존 제한 화면으로 전환.
- 동승자: 건물 입구 지도와 먼저 입장하는 행동을 첫 화면에 배치. 주차 상태는 보조 정보. 카카오맵에서 입구 추정 위치 열기. 현장 사진이 등록되면 사진 표시.
- 주차 후 차량 내비가 과거 만남 지점으로 향하지 않도록 버튼 제거. 서버 enum/공유 링크/기존 상태 저장 형식은 유지. WALKING_TO_MEETING은 주차 후 이동, REUNITED는 사용자의 합류 완료 확인으로 표시.
- 위치 추적, 자동 하차·주차 판정, 빈자리 조회, 도보 경로 계산, 휴대전화로 운전자 권한 전달은 이번 범위에 포함하지 않음.

## 데이터와 정확도

현장 사용자가 남측 넓은 광장 쪽 출입구를 이용한다고 확인했다. 문 위치는 미측량이며 위성사진에서 광장을 마주한 건물 외벽 부근을 추정했다.

- 기준: `docs/site-reference/05-scale-reference.png`의 픽셀 (748, 660).
- 변환: `docs/site-reference/meeting-point.calculation.json`의 georeference 행렬/EPSG:3857.
- 입구 추정 좌표: 35.22585, 126.83921. 계산값은 정확도를 보장하지 않음.
- `verification: ESTIMATED`, `walkingRoute: null`, `imageUrl: null` 유지.
- 방향 안내만 제공하며 임의로 직선을 보행 경로로 그리지 않음.
- 기존 `meetingPoint`를 입구로 재해석하거나 기존 v2 카탈로그를 덮어쓰지 않음.

## 현재 백엔드로 시연 가능

추가 API나 DB 마이그레이션 없이 동작한다. 기존 session/venue 응답에 UI용 보충 파일을 결합한다.

보충 데이터 원본: `companion/public/guides/gist-oryong-demo.oryong-demo-v2.json`.

동승자 웹은 `/guides/{venueId}.{catalogVersion}.json`으로 장소별 보충 파일을 읽고 venueId/catalogVersion이 정확히 일치할 때만 사용한다. 다른 장소/버전이면 입구 미등록 상태를 표시한다. 서버가 `arrivalGuide`를 제공하면 이를 우선하며 잘못된 데이터를 다른 장소의 정보로 대체하지 않는다.

Android는 Gradle `prepareArrivalMapAssets`로 같은 map/guide 디렉터리와 기존 카탈로그를 패키징한다. Android의 원격 장소 선택은 아직 미구현이므로 현재 한 장소만 지원한다.

## Claude에 전달할 백엔드 작업 (다음 단계)

1. **버전별 입구 안내 제공**: 기존 venue 상세에 선택 필드 `arrivalGuide` 추가. 위 JSON 파일이 응답 예제이며 schemaVersion, venueId, catalogVersion, guideVersion, arrivalMode, entrance, steps, accessNote를 포함. 기존 클라이언트를 위해 기존 필드는 보존.
2. **확인 수준 분리**: entrance.coordinate의 ESTIMATED/VERIFIED와 입구 방향 확인을 분리. 현장 확인 없이 VERIFIED로 승격 금지. 사진은 공개 가능한 정적 경로로 제공. 현재 웹은 `/entrance-photos/` 아래 동일 출처 파일만 표시하므로 외부 사진 저장소를 쓰려면 허용 출처와 검증을 프런트에도 반영해야 함.
3. **세션에 안내 버전 고정**: 방문 생성 시 catalogVersion 및 안내 버전을 고정. 새 입구 정보가 배포돼도 진행 중인 방문의 장소가 조용히 바뀌지 않도록 함. 기존 버전 조회 API 활용 가능 여부 협의. 현재 웹 프록시는 current venue 상세만 허용하므로 버전 경로 사용 시 allowlist와 클라이언트를 함께 변경.
4. **경로 데이터 확장**: 이후 차량 진입구, 주차장 실제 입구, 검증된 도보 경로를 별도 지점/선 데이터로 추가. 보행 route는 fromPlaceId/toPlaceId, geometry, verification, 계단·보행 제한 등을 구분. 현재 클라이언트는 route를 그리지 않으므로 서버 필드 추가만으로 기능이 완성되지 않음.
5. **방문 단계 명칭 정리**: 이후 ENTER_BUILDING / MEET_OUTSIDE 같은 방문 유형과 주차 후 이동 단계를 명시. 기존 WALKING_TO_MEETING/REUNITED를 즉시 삭제하지 말고 앱·웹·서버 동시 전환 및 이전 세션 호환 방안 준비.

우선순위는 1~3. 실시간 GPS 저장, 동승자 쓰기 API, WebSocket은 이번 지도·입구 안내에 필요하지 않다.

## 사용자가 확인할 순서

1. 에뮬레이터에서 지도 크기/주차 후보 식별/입구 위치가 이해되는지 확인.
2. 현장에서 남측 입구의 실제 문 위치를 지도 핀과 비교. 열린 문이 행사마다 달라지는지 확인.
3. 하차 지점에서 입구까지 실제 보행 동선, 횡단 위치, 계단 유무를 확인. 운전자 주차 후 이동 경로도 별도 확인.
4. 입구와 광장이 함께 보이는 현장 사진 1~2장 준비. 사용 가능한 사진만 등록.
5. 검증한 좌표/경로를 반영한 뒤 첫 방문자 3명에게 설명 없이 입구 찾기를 요청. 다시 검색하거나 연락하는 횟수와 막힌 지점을 기록.

## 지도 운영 및 배포

- Leaflet 1.9.4를 로컬 번들로 제공. 라이선스는 `companion/public/map/vendor/LICENSE`.
- 배경: https://tile.openstreetmap.org/{z}/{x}/{y}.png. 요청한 화면만 로드하며 오프라인 지도 다운로드/미리 가져오기 없음. 브라우저/WebView HTTP 캐시 사용. 출처 표시 유지.
- 웹 Referrer-Policy는 strict-origin-when-cross-origin. 공유 토큰은 주소 fragment에서 제거하고 세션 API Authorization에만 사용하며 타일/외부 지도에 전달하지 않음.
- Android WebView에는 공개 장소 데이터만 주입하며 JS/native 브리지·파일 접근·사용자 위치 접근 없음. 네트워크는 OSM 타일만 허용하고 앱 스크립트는 패키지에서 로드.
- 지도 로딩 실패 시 입구 텍스트와 주차 상태 유지. 배경 오류 표시.
- 대규모 운영 시 지도 공급자/사용량 조건 재선정 필요. 현 단계에서 사용자 지도 API 키 발급은 불필요.
- Cloudflare Pages: 기존 설정 그대로, public 정적 파일 변경 배포. 빌드 명령 변경 불필요. Android는 APK 재빌드/설치 필요.

참고: https://operations.osmfoundation.org/policies/tiles/ · https://apis.map.kakao.com/web/guide/#routeurl


## 2026-11-14 전체 지도 화면

- 동승자 웹은 전체 화면 지도를 기본으로, 상단에 ‘이번 목적지’, 하단에 입구·운전자 상태·지도 앱 열기를 표시한다. 자세한 설명은 하단 패널 펼치기로 제공한다.
- 화면 자체에 오룡관 명칭/광장 방향을 고정하지 않는다. 장소와 입구 명칭, 안내 문구, 좌표는 현재 방문의 카탈로그/arrivalGuide에서 가져온다.
- 장소 선택은 공유 방문에 종속된다. 동승자가 임의로 다른 목적지로 바꾸는 검색/선택 기능은 제공하지 않는다.
- 장소별 보충 파일의 경로를 일반화했으며, 원격 arrivalGuide가 있는 임의의 장소도 같은 화면을 사용한다. 확인용 가상 컨벤션센터 데이터로 별도 UI 테스트를 수행하고 공개 카탈로그에는 등록하지 않는다.
- 실제 공개된 장소 데이터는 여전히 오룡관 한 곳이다. 신규 장소 추가에는 검증된 카탈로그/입구 데이터 등록이 필요하다.
