export const stages = ['PLANNED', 'TO_DROPOFF', 'TO_PARKING', 'WALKING_TO_MEETING', 'REUNITED', 'CANCELLED'];
export const copy = {
  PLANNED: ['도착 계획을 준비했어요', '먼저 내릴 곳과 다시 만날 장소를 확인하세요.'],
  TO_DROPOFF: ['먼저 편하게 내리세요', '하차한 뒤에는 아래의 약속한 장소에서 다시 만나요.'],
  TO_PARKING: ['운전자는 주차 중이에요', '주차를 마치면 이 화면에 표시돼요.'],
  WALKING_TO_MEETING: ['주차를 마쳤어요', '약속한 만남 장소에서 운전자와 다시 만나요.'],
  REUNITED: ['함께 도착했어요', '다시 만났음을 확인했어요. 이제 함께 방문을 이어가세요.'],
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
