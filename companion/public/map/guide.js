// Entrance guides are independent of the legacy meeting-point field.
export function coordinate(value) {
  return value && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 &&
    Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;
}
export function validateGuide(g, venue) {
  if (!g || g.schemaVersion !== 1 || g.venueId !== venue.venueId || g.catalogVersion !== venue.catalogVersion ||
      g.arrivalMode !== 'ENTER_BUILDING' || !g.entrance || typeof g.entrance.id !== 'string' ||
      typeof g.entrance.name !== 'string' || typeof g.entrance.instructions !== 'string' ||
      !['ESTIMATED', 'VERIFIED'].includes(g.entrance.verification) || !coordinate(g.entrance.coordinate) ||
      !Array.isArray(g.steps) || !g.steps.every(s => typeof s === 'string') || typeof g.accessNote !== 'string') return null;
  return g;
}
export async function loadGuide(venue, signal) {
  if (venue.arrivalGuide) return validateGuide(venue.arrivalGuide, venue);
  // Only this exact pilot version has a bundled supplement. Never reuse it for a different venue/version.
  if (venue.venueId !== 'gist-oryong-demo' || venue.catalogVersion !== 'oryong-demo-v2') return null;
  try {
    const res = await fetch('/guides/gist-oryong-demo.oryong-demo-v2.json', { signal });
    return res.ok ? validateGuide(await res.json(), venue) : null;
  } catch { return null; }
}
export function externalMapUrl(place) {
  if (!coordinate(place?.coordinate)) return null;
  const { latitude, longitude } = place.coordinate;
  return `https://map.kakao.com/link/map/${encodeURIComponent(place.name)},${latitude},${longitude}`;
}
export function passengerInstruction(stage, guide) {
  if (stage === 'CANCELLED') return ['이번 방문 안내가 끝났어요', '이 방문은 종료되었어요. 필요한 경우 운전자에게 연락해 주세요.'];
  if (stage === 'REUNITED') return ['함께 도착했어요', '방문을 이어가세요. 입구 정보는 아래에서 다시 확인할 수 있어요.'];
  if (!guide) return ['건물 입구 안내를 준비 중이에요', '이 장소의 출입구는 아직 등록되지 않았어요. 현장 안내를 확인하세요.'];
  if (['PLANNED', 'TO_DROPOFF'].includes(stage)) return ['내린 뒤, 건물로 먼저 들어가세요', guide.entrance.name + '를 이용해요. 운전자는 주차 후 합류해요.'];
  return ['건물로 먼저 들어가세요', guide.entrance.name + '를 이용해요. 밖에서 기다리지 않아도 돼요.'];
}
