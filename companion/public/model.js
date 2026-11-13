export const stages = ['PLANNED', 'TO_DROPOFF', 'TO_PARKING', 'WALKING_TO_MEETING', 'REUNITED', 'CANCELLED'];
export const copy = {
  PLANNED: ['도착 계획을 준비했어요', '동승자는 입구로, 운전자는 주차장으로 이동할 계획이에요.'],
  TO_DROPOFF: ['먼저 편하게 내리세요', '내린 뒤에는 건물 입구 안내를 확인하세요.'],
  TO_PARKING: ['운전자는 주차 중이에요', '주차를 마치면 이 화면에 표시돼요.'],
  WALKING_TO_MEETING: ['주차를 마쳤어요', '운전자가 건물로 이동할 차례예요. 실시간 보행 위치는 표시하지 않아요.'],
  REUNITED: ['함께 도착했어요', '운전자가 합류 완료를 확인했어요. 함께 방문을 이어가세요.'],
  CANCELLED: ['이번 방문 안내가 끝났어요', '이 계획은 더 이상 진행되지 않아요. 필요한 경우 운전자에게 연락해 주세요.'],
};
export function tokenFromHash(hash) {
  const value = new URLSearchParams(hash.replace(/^#/, '')).get('token');
  return /^[A-Za-z0-9_-]{43,256}$/.test(value ?? '') ? value : null;
}
export function validateSession(s) {
  if (!s || !/^[0-9a-f-]{36}$/i.test(s.id) || !stages.includes(s.stage) || !Number.isInteger(s.revision) || s.revision < 1 ||
      !['DEMO', 'VERIFIED'].includes(s.dataMode) || typeof s.venueId !== 'string' || typeof s.catalogVersion !== 'string' ||
      typeof s.meetingPointId !== 'string' || !(s.parkingId === null || typeof s.parkingId === 'string') ||
      !Array.isArray(s.excludedParkingIds) || !s.excludedParkingIds.every(x => typeof x === 'string') ||
      !Number.isFinite(Date.parse(s.updatedAt)) || !Number.isFinite(Date.parse(s.expiresAt))) throw new Error('Invalid session');
  return s;
}
export function validateVenue(v, s) {
  if (!v || v.venueId !== s.venueId || v.catalogVersion !== s.catalogVersion ||
      !['VERIFIED', 'DEMO_UNVERIFIED'].includes(v.verification) || v.meetingPoint?.id !== s.meetingPointId ||
      !Array.isArray(v.parkingCandidates)) throw new Error('Catalog mismatch');
  for (const p of [v.dropoff, v.meetingPoint, ...v.parkingCandidates]) {
    if (!p || typeof p.name !== 'string' || typeof p.instructions !== 'string') throw new Error('Invalid place');
    if (p.coordinate !== null && (!Number.isFinite(p.coordinate?.latitude) || Math.abs(p.coordinate.latitude) > 90 ||
        !Number.isFinite(p.coordinate?.longitude) || Math.abs(p.coordinate.longitude) > 180)) throw new Error('Invalid coordinate');
  }
  if (s.parkingId !== null && !v.parkingCandidates.some(p => p.id === s.parkingId)) throw new Error('Unknown parking');
  return v;
}
export function canReplace(previous, next) {
  return !previous || (previous.id === next.id && next.revision >= previous.revision && previous.meetingPointId === next.meetingPointId);
}
