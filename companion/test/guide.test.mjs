import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateGuide, loadGuide, externalMapUrl, passengerInstruction } from '../public/map/guide.js';
const venue = JSON.parse(await readFile(new URL('../../contracts/oryong-demo.json', import.meta.url)));
const guide = JSON.parse(await readFile(new URL('../public/guides/gist-oryong-demo.oryong-demo-v2.json', import.meta.url)));
test('entrance belongs to an exact venue/catalog and is not the legacy meeting point', async () => {
  assert.equal(validateGuide(guide, venue), guide);
  assert.notDeepEqual(guide.entrance.coordinate, venue.meetingPoint.coordinate);
  assert.equal(validateGuide(guide, {...venue, catalogVersion:'next'}), null);
  assert.equal(validateGuide(guide, {...venue, venueId:'other'}), null);
  assert.equal(await loadGuide({...venue, venueId:'other'}), null);
  assert.equal(validateGuide({...guide, entrance:{...guide.entrance, coordinate:{latitude:91,longitude:0}}}, venue), null);
});
test('passenger enters the building; cancellation and missing entrance never give active entrance instructions', () => {
  assert.match(passengerInstruction('TO_PARKING',guide)[0], /먼저 들어/);
  assert.doesNotMatch(passengerInstruction('CANCELLED',guide).join(' '), /먼저 들어/);
  assert.match(passengerInstruction('TO_PARKING',null)[0], /준비 중/);
  assert.equal(guide.walkingRoute, null);
  assert.equal(guide.entrance.verification, 'ESTIMATED');
});
test('map handoff encodes labels and accepts only valid coordinates', () => {
  const url = externalMapUrl({...guide.entrance,name:'입구/광장?token=secret'});
  assert.equal(new URL(url).origin, 'https://map.kakao.com');
  assert.equal(new URL(url).search, '');
  assert.ok(url.endsWith(',35.22585,126.83921'));
  assert.equal(externalMapUrl({coordinate:null}), null);
});

test('another venue supplies its own guide; mismatched fallback cannot leak pilot information', async t => {
  const other = {...venue, venueId:'sample-hall', catalogVersion:'hall-v1', name:'테스트 전시장'};
  const otherGuide = {...guide, venueId:other.venueId, catalogVersion:other.catalogVersion,
    entrance:{...guide.entrance,id:'east-entry',name:'동문',coordinate:{latitude:37.5,longitude:127.0}}};
  assert.equal(await loadGuide({...other,arrivalGuide:otherGuide}), otherGuide);
  let requested;
  t.mock.method(globalThis, 'fetch', async path => { requested=path; return {ok:true,json:async()=>otherGuide}; });
  assert.deepEqual(await loadGuide(other), otherGuide);
  assert.equal(requested,'/guides/sample-hall.hall-v1.json');
  assert.equal(validateGuide(guide,other),null);
});
test('guide paths reject traversal and malformed version identifiers before fetching', async t => {
  let calls=0; t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('unexpected fetch');});
  assert.equal(await loadGuide({...venue,venueId:'../other'}),null);
  assert.equal(await loadGuide({...venue,catalogVersion:'v1?token=x'}),null);
  assert.equal(calls,0);
});
