import { copy, tokenFromHash, validateSession, validateVenue, canReplace } from './model.js';
const $ = id => document.getElementById(id);
const storageKey = 'arrival-companion-token';
let token = tokenFromHash(location.hash), snapshot = null, catalog = null, timer, controller, busy = false, stopped = false;
// Clear the bearer capability from the address bar before making any request. Keep it only in this tab.
const hadHash = location.hash.length > 0;
if (hadHash) history.replaceState(null, '', location.pathname);
try {
  if (hadHash) { if (token) sessionStorage.setItem(storageKey, token); else sessionStorage.removeItem(storageKey); }
  else token = sessionStorage.getItem(storageKey);
} catch { /* In private browsing the in-memory token still works for this page. */ }
if (!/^[A-Za-z0-9_-]{43,256}$/.test(token ?? '')) token = null;
function text(id, value) { $(id).textContent = value; }
function status(message, online = false) { text('connection', message); $('connection-dot').classList.toggle('online', online); }
function empty(title, message) { $('visit').hidden = true; $('empty').hidden = false; text('empty-title', title); text('empty-text', message); }
function forget(title, message) {
  stopped = true; clearTimeout(timer); controller?.abort(); token = null; snapshot = null; catalog = null;
  try { sessionStorage.removeItem(storageKey); } catch {}
  status('공유 연결이 종료됐어요'); empty(title, message); $('retry').disabled = true;
}
function render(s, v) {
  $('empty').hidden = true; $('visit').hidden = false;
  text('venue', v.name); text('headline', copy[s.stage][0]); text('description', copy[s.stage][1]);
  const demo = s.dataMode === 'DEMO' || v.verification !== 'VERIFIED';
  text('mode', demo ? '시연 장소' : '방문 안내');
  $('demo-note').hidden = !demo;
  text('meeting-name', v.meetingPoint.name); text('meeting-instructions', v.meetingPoint.instructions);
  const c = v.meetingPoint.coordinate;
  text('coordinates', c ? `${demo ? '추정 위치' : '위치'} · ${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}` : '위치 좌표 확인 예정');
  const parked = ['WALKING_TO_MEETING', 'REUNITED'].includes(s.stage);
  const parking = v.parkingCandidates.find(p => p.id === s.parkingId);
  text('parking-label', parked ? '주차한 곳' : '주차 후보');
  text('parking-name', parking?.name ?? '현장 안내를 확인하고 있어요');
  text('parking-instructions', parking ? parking.instructions : '이번 방문의 후보를 모두 제외했어요. 만남 장소는 그대로 유지돼요.');
  text('excluded', `${s.excludedParkingIds.length ? `이번 방문에서 제외한 후보 ${s.excludedParkingIds.length}곳 · ` : ''}실시간 빈자리 정보가 아니에요.`);
  text('dropoff-name', v.dropoff.name);
  text('notice-title', demo ? '현장 확인이 필요한 시연 안내예요' : '방문 안내를 확인해 주세요');
  text('notice', v.notice);
  text('updated', `운전자 상태 변경 · ${new Date(s.updatedAt).toLocaleString('ko-KR')}`);
  text('expiry', `공유 종료 예정 · ${new Date(s.expiresAt).toLocaleString('ko-KR')}`);
  const step = ['PLANNED', 'TO_DROPOFF'].includes(s.stage) ? 'dropoff' : s.stage === 'TO_PARKING' ? 'parking' : 'meeting';
  for (const name of ['dropoff', 'parking', 'meeting']) $('step-' + name).classList.toggle('current', s.stage !== 'CANCELLED' && step === name);
}
async function get(path, signal, auth = false) {
  const res = await fetch('/api' + path, { signal, cache: 'no-store', headers: auth ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) { const e = new Error('HTTP'); e.status = res.status; e.delay = Math.min(300000, Math.max(5000, (Number(res.headers.get('retry-after')) || 5) * 1000)); throw e; }
  return res.json();
}
async function poll() {
  if (busy || stopped || !token || document.hidden) return;
  clearTimeout(timer); busy = true; $('retry').disabled = true; controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000); let wait = 5000;
  try {
    const next = validateSession(await get('/v1/shared-session', controller.signal, true));
    if (Date.parse(next.expiresAt) <= Date.now()) { forget('공유 기간이 끝났어요', '운전자에게 새 방문 카드를 요청해 주세요.'); return; }
    if (!canReplace(snapshot, next)) throw new Error('Stale or changed session');
    let venue = catalog;
    if (!venue || venue.catalogVersion !== next.catalogVersion || venue.venueId !== next.venueId) venue = await get('/v1/venues/' + encodeURIComponent(next.venueId), controller.signal);
    validateVenue(venue, next);
    if (stopped) return;
    snapshot = next; catalog = venue; render(next, venue);
    status(`최근 확인 · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`, true);
  } catch (e) {
    if (stopped) return;
    if (e.status === 401 || e.status === 404) { forget('이 공유 링크를 사용할 수 없어요', '방문이 만료되었거나 운전자가 공유를 종료했어요. 새 QR을 받아 주세요.'); return; }
    wait = e.delay || 5000;
    status(snapshot ? '연결 끊김 · 마지막으로 확인한 상태예요' : '서버에 연결하지 못했어요');
    if (!snapshot) empty('잠시 연결을 기다리고 있어요', '인터넷 연결을 확인해 주세요. 연결되면 자동으로 다시 불러와요.');
  } finally {
    clearTimeout(timeout); busy = false; $('retry').disabled = stopped;
    if (!stopped && !document.hidden) timer = setTimeout(poll, wait);
  }
}
$('retry').addEventListener('click', poll);
$('forget').addEventListener('click', () => forget('이 기기에서 카드를 닫았어요', '다시 보려면 차량의 QR을 스캔해 주세요. 다른 동승자의 연결에는 영향을 주지 않아요.'));
document.addEventListener('visibilitychange', () => {
  clearTimeout(timer);
  if (document.hidden) { controller?.abort(); status('화면을 다시 열면 최신 상태를 확인해요'); }
  else poll();
});
setInterval(() => {
  if (snapshot && Date.parse(snapshot.expiresAt) <= Date.now()) forget('공유 기간이 끝났어요', '운전자에게 새 방문 카드를 요청해 주세요.');
}, 1000);
if (token) poll();
else { empty('차량의 QR을 스캔해 주세요', '운전자가 공유한 링크를 열면, 만날 장소와 주차 진행 상황이 여기에 표시돼요.'); status('아직 연결된 방문이 없어요'); $('retry').disabled = true; }

window.addEventListener('hashchange', () => { if (location.hash) location.reload(); });
