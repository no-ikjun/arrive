import { copy, validateSession, validateVenue, canReplace } from './model.js';
import { connectionFromHash, validateHandoff, canConfirm, reunionOperation } from './handoff.js';
import { loadGuide, externalMapUrl, passengerInstruction } from './map/guide.js';
import { createArrivalMap } from './map/arrival-map.js';
const $ = id => document.getElementById(id);
const storageKey = 'arrival-companion-token';
let mapView = null, guide = null;
let connection = connectionFromHash(location.hash), mode = connection?.mode ?? 'share', token = connection?.token ?? null, snapshot = null, catalog = null, timer, controller, busy = false, stopped = false;
// Clear the bearer capability from the address bar before making any request. Keep it only in this tab.
const hadHash = location.hash.length > 0;
if (hadHash) history.replaceState(null, '', location.pathname);
try {
  if (hadHash) {
    if (token) { sessionStorage.setItem(storageKey, token); sessionStorage.setItem(storageKey + '-mode', mode); }
    else { sessionStorage.removeItem(storageKey); sessionStorage.removeItem(storageKey + '-mode'); }
  } else { token = sessionStorage.getItem(storageKey); mode = sessionStorage.getItem(storageKey + '-mode') === 'handoff' ? 'handoff' : 'share'; }
} catch { /* In private browsing the in-memory token still works for this page. */ }
if (!/^[A-Za-z0-9_-]{43,256}$/.test(token ?? '')) token = null;
function text(id, value) { $(id).textContent = value; }
function status(message, online = false) { text('connection', message); $('connection-dot').classList.toggle('online', online); }
function empty(title, message) { $('visit').hidden = true; $('empty').hidden = false; text('empty-title', title); text('empty-text', message); }
function forget(title, message) {
  stopped = true; clearTimeout(timer); controller?.abort(); token = null; snapshot = null; catalog = null;
  try { sessionStorage.removeItem(storageKey); sessionStorage.removeItem(storageKey + '-mode'); sessionStorage.removeItem('arrival-reunion-pending'); } catch {}
  mapView?.destroy(); mapView = null; guide = null;
  status('공유 연결이 종료됐어요'); empty(title, message); $('retry').disabled = true;
}
let actionBusy = false;
let operation = null;
try { operation = JSON.parse(sessionStorage.getItem('arrival-reunion-pending') ?? 'null'); } catch {}
function render(s, v) {
  $('empty').hidden = true; $('visit').hidden = false;
  measureSheet();
  $('phone-actions').hidden = mode !== 'handoff' || ['REUNITED', 'CANCELLED'].includes(s.stage);
  $('confirm-reunion').disabled = actionBusy || !canConfirm(mode, s);
  text('phone-instruction', s.stage === 'WALKING_TO_MEETING' ? '입구 안내를 따라 이동하고, 동승자와 실제로 만난 뒤 확인해 주세요.' : '주차 완료가 확인되면 휴대폰에서 합류를 확인할 수 있어요.');
  if (mode === 'handoff' && s.stage === 'REUNITED') { operation = null; try { sessionStorage.removeItem('arrival-reunion-pending'); } catch {} }
  text('venue', v.name); text('headline', s.stage === 'REUNITED' ? '합류 확인 완료' : copy[s.stage][0]); text('description', copy[s.stage][1]);
  const demo = s.dataMode === 'DEMO' || v.verification !== 'VERIFIED';
  text('mode', demo ? '시연 장소' : '방문 안내');
  $('demo-note').hidden = !demo;
  const [title, description] = passengerInstruction(s.stage, guide);
  text('arrival-title', s.stage === 'REUNITED' ? '이번 방문을 마쳤어요' : mode === 'handoff' && s.stage === 'WALKING_TO_MEETING' ? '동승자가 있는 건물로 이동하세요' : title); text('arrival-description', description);
  text('entrance-name', s.stage === 'REUNITED' ? '함께 도착했어요' : guide?.entrance.name ?? '입구 정보 확인 중');
  text('entrance-instructions', s.stage === 'CANCELLED' ? '종료된 방문의 위치 정보예요.' : guide?.entrance.instructions ?? '만남 장소와 건물 입구는 다를 수 있어요. 현장 표지판을 확인하세요.');
  $('walking-guide').hidden = s.stage === 'CANCELLED';
  text('entrance-status', guide?.entrance.verification === 'VERIFIED' ? '현장 확인' : guide ? '추정 위치' : '미등록');
  text('entrance-estimate', guide?.entrance.verification === 'ESTIMATED' ? '지도 표시는 이 입구의 추정 위치예요. 정확한 문 위치는 현장에서 확인하세요.' : '');
  const link = guide && s.stage !== 'CANCELLED' ? externalMapUrl(guide.entrance) : null;
  $('entrance-map-link').hidden = !link || s.stage === 'REUNITED';
  $('entrance-status').hidden = s.stage === 'REUNITED';
  if (link) $('entrance-map-link').href = link; else $('entrance-map-link').removeAttribute('href');
  $('walking-steps').replaceChildren(...(guide?.steps ?? ['현장 안내판에서 사용할 출입구를 확인하세요.']).map(step => {
    const li = document.createElement('li'); li.textContent = step; return li;
  }));
  text('access-note', guide?.accessNote ?? '확인된 보행 경로가 없어 지도에 이동선을 표시하지 않아요.');
  const image = guide?.entrance.imageUrl;
  const hasImage = typeof image === 'string' && /^\/entrance-photos\/[a-zA-Z0-9_./-]+\.(png|jpe?g|webp)$/.test(image) && !image.includes('..');
  $('entrance-photo').hidden = !hasImage; $('photo-pending').hidden = hasImage;
  if (hasImage && $('entrance-image').getAttribute('src') !== image) $('entrance-image').src = image;
  else if (!hasImage) $('entrance-image').removeAttribute('src');
  try {
    mapView ??= createArrivalMap($('map'), { onStatus: message => text('map-status', message), getPadding: mapPadding });
    mapView.render(v, guide, s);
  } catch { text('map-status', '지도를 표시하지 못했어요. 아래 입구 설명을 확인하세요.'); }
  const parked = ['WALKING_TO_MEETING', 'REUNITED'].includes(s.stage);
  const parking = v.parkingCandidates.find(p => p.id === s.parkingId);
  text('parking-label', parked ? '주차한 곳' : '주차 후보');
  text('parking-name', parking?.name ?? '현장 안내를 확인하고 있어요');
  text('parking-instructions', parking ? parking.instructions : '이번 방문의 주차 후보를 모두 확인했어요. 운전자가 현장 안내를 확인해야 해요.');
  text('excluded', `${s.excludedParkingIds.length ? `이번 방문에서 제외한 후보 ${s.excludedParkingIds.length}곳 · ` : ''}실시간 빈자리 정보가 아니에요.`);
  text('dropoff-name', v.dropoff.name);
  text('notice-title', demo ? '현장 확인이 필요한 시연 안내예요' : '방문 안내를 확인해 주세요');
  text('notice', v.notice);
  text('updated', `운전자 상태 변경 · ${new Date(s.updatedAt).toLocaleString('ko-KR')}`);
  text('expiry', `공유 종료 예정 · ${new Date(s.expiresAt).toLocaleString('ko-KR')}`);
  requestAnimationFrame(() => { measureSheet(); });

}
async function get(path, signal, auth = false) {
  const res = await fetch('/api' + path, { signal, cache: 'no-store', headers: auth ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) { const e = new Error('HTTP'); e.status = res.status; e.delay = Math.min(300000, Math.max(5000, (Number(res.headers.get('retry-after')) || 5) * 1000)); throw e; }
  return res.json();
}
async function poll() {
  if (busy || actionBusy || stopped || !token || document.hidden) return;
  clearTimeout(timer); busy = true; $('retry').disabled = true; controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000); let wait = 5000;
  try {
    const next = (mode === 'handoff' ? validateHandoff : validateSession)(await get(mode === 'handoff' ? '/v1/handoff-session' : '/v1/shared-session', controller.signal, true));
    if (Date.parse(next.expiresAt) <= Date.now() || (mode === 'handoff' && Date.parse(next.handoffExpiresAt) <= Date.now())) { forget('공유 기간이 끝났어요', '운전자에게 새 방문 카드를 요청해 주세요.'); return; }
    if (!canReplace(snapshot, next)) throw new Error('Stale or changed session');
    let venue = catalog;
    if (!venue || venue.catalogVersion !== next.catalogVersion || venue.venueId !== next.venueId) venue = await get('/v1/venues/' + encodeURIComponent(next.venueId), controller.signal);
    validateVenue(venue, next);
    if (stopped) return;
    if (!guide || catalog?.catalogVersion !== venue.catalogVersion || catalog?.venueId !== venue.venueId) guide = await loadGuide(venue, controller.signal);
    if (stopped) return;
    snapshot = next; catalog = venue; render(next, venue);
    status(`최근 확인 · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`, true);
  } catch (e) {
    if (stopped) return;
    if (e.status === 401 || e.status === 403 || e.status === 404) { forget('이 공유 링크를 사용할 수 없어요', '방문이 만료되었거나 운전자가 공유를 종료했어요. 새 QR을 받아 주세요.'); return; }
    wait = e.delay || 5000;
    status(snapshot ? '연결 끊김 · 마지막으로 확인한 상태예요' : '서버에 연결하지 못했어요');
    if (!snapshot) empty('잠시 연결을 기다리고 있어요', '인터넷 연결을 확인해 주세요. 연결되면 자동으로 다시 불러와요.');
  } finally {
    clearTimeout(timeout); busy = false; $('retry').disabled = stopped;
    if (!stopped && !document.hidden) timer = setTimeout(poll, wait);
  }
}
// The map fills the viewport. Fit public places into the area not covered by the sheet.
function mapPadding() {
  const w = innerWidth, h = innerHeight;
  if (w >= 900) return { paddingTopLeft: [470, 80], paddingBottomRight: [80, 70] };
  if (h <= 550) return { paddingTopLeft: [340, 90], paddingBottomRight: [60, 50] };
  const height = $('arrival-sheet').getBoundingClientRect().height;
  return { paddingTopLeft: [56, 168], paddingBottomRight: [72, Math.min(height + 74, h - 270)] };
}
let sheetFrame = 0, measuredHeight = 0;
function measureSheet() {
  const height = Math.round($('arrival-sheet').getBoundingClientRect().height);
  document.documentElement.style.setProperty('--sheet-height', `${height}px`);
  if (height !== measuredHeight) {
    measuredHeight = height;
    if (!$('arrival-sheet').classList.contains('expanded')) {
      cancelAnimationFrame(sheetFrame); sheetFrame = requestAnimationFrame(() => mapView?.resize());
    }
  }
}
function toggleSheet() {
  const expanded = !$('arrival-sheet').classList.contains('expanded');
  $('arrival-sheet').classList.toggle('expanded', expanded);
  $('sheet-details').hidden = !expanded;
  $('sheet-toggle').setAttribute('aria-expanded', String(expanded));
  text('sheet-toggle-label', expanded ? '안내 접기' : '안내 펼치기');
  if (!expanded) $('arrival-sheet').scrollTop = 0;
  measureSheet();
}
$('sheet-toggle').addEventListener('click', toggleSheet);
$('arrival-sheet').addEventListener('keydown', e => { if (e.key === 'Escape' && $('arrival-sheet').classList.contains('expanded')) { toggleSheet(); $('sheet-toggle').focus(); } });
new ResizeObserver(measureSheet).observe($('arrival-sheet'));
window.addEventListener('resize', () => { measureSheet(); mapView?.resize(); });
$('entrance-image').addEventListener('error', () => { $('entrance-photo').hidden = true; $('photo-pending').hidden = false; text('photo-pending', '입구 사진을 불러오지 못했어요. 위의 위치 설명을 확인하세요.'); });
$('retry').addEventListener('click', poll);
$('forget').addEventListener('click', () => forget('이 기기에서 카드를 닫았어요', '다시 보려면 차량의 QR을 스캔해 주세요. 다른 동승자의 연결에는 영향을 주지 않아요.'));
document.addEventListener('visibilitychange', () => {
  clearTimeout(timer);
  if (document.hidden) { controller?.abort(); status('화면을 다시 열면 최신 상태를 확인해요'); }
  else poll();
});
setInterval(() => {
  if (snapshot && (Date.parse(snapshot.expiresAt) <= Date.now() || (mode === 'handoff' && Date.parse(snapshot.handoffExpiresAt) <= Date.now()))) forget('공유 기간이 끝났어요', '운전자에게 새 방문 카드를 요청해 주세요.');
}, 1000);
if (token) poll();
else { empty('차량의 QR을 스캔해 주세요', '운전자가 보낸 방문 링크를 열면 이번 목적지의 내릴 곳, 들어갈 곳과 주차 상황을 한 지도에서 확인할 수 있어요.'); status('아직 연결된 방문이 없어요'); $('retry').disabled = true; }

window.addEventListener('hashchange', () => { if (location.hash) location.reload(); });

$('confirm-reunion').addEventListener('click', () => {
  if (canConfirm(mode, snapshot) && !actionBusy) $('reunion-dialog').showModal();
});
$('cancel-reunion').addEventListener('click', () => $('reunion-dialog').close());
$('send-reunion').addEventListener('click', async () => {
  $('reunion-dialog').close();
  if (actionBusy || !canConfirm(mode, snapshot) || stopped) return;
  actionBusy = true; $('confirm-reunion').disabled = true; controller?.abort(); clearTimeout(timer);
  operation = reunionOperation(snapshot, operation, () => crypto.randomUUID());
  try { sessionStorage.setItem('arrival-reunion-pending', JSON.stringify(operation)); } catch {}
  text('action-message', '합류 확인을 보내고 있어요');
  try {
    const res = await fetch('/api/v1/handoff-session/reunion', { method: 'POST', cache: 'no-store',
      signal: AbortSignal.timeout(9000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': operation.key },
      body: JSON.stringify({ expectedRevision: operation.expectedRevision }) });
    if (!res.ok) {
      if ([401, 403, 404].includes(res.status)) { forget('휴대폰 연결을 사용할 수 없어요', '연결이 만료됐거나 종료됐어요. 차량에서 새 연결을 확인해 주세요.'); return; }
      if (res.status === 409) { operation = null; try { sessionStorage.removeItem('arrival-reunion-pending'); } catch {} }
      throw new Error(res.status === 409 ? 'conflict' : 'network');
    }
    const next = validateHandoff(await res.json());
    if (stopped || !canReplace(snapshot, next) || next.stage !== 'REUNITED') throw new Error('Invalid confirmation');
    validateVenue(catalog, next); snapshot = next; render(next, catalog);
    text('action-message', '합류를 확인했어요');
  } catch (e) {
    text('action-message', e.message === 'conflict' ? '방문 상태가 바뀌었어요. 최신 상태를 확인한 뒤 다시 눌러 주세요.' : '완료 여부를 확인하지 못했어요. 연결 후 다시 확인을 눌러 주세요.');
  } finally {
    actionBusy = false; $('confirm-reunion').disabled = !canConfirm(mode, snapshot);
    if (!stopped) { if (busy) timer = setTimeout(poll, 1000); else poll(); }
  }
});
