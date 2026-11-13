import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenFromHash, canReplace, validateSession, validateVenue } from '../public/model.js';
import { readFile } from 'node:fs/promises';
const venue = JSON.parse(await readFile(new URL('../../contracts/oryong-demo.json', import.meta.url)));
const session = { id: '00000000-0000-4000-8000-000000000001', venueId: venue.venueId, catalogVersion: venue.catalogVersion, stage: 'TO_PARKING',
  revision: 3, parkingId: venue.parkingCandidates[0].id, excludedParkingIds: [], meetingPointId: venue.meetingPoint.id, dataMode: 'DEMO', updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now()+10000).toISOString() };
test('only capability-shaped fragments are accepted', () => {
  assert.equal(tokenFromHash('#token=' + 'a'.repeat(43)), 'a'.repeat(43));
  assert.equal(tokenFromHash('#token=short'), null);
  assert.equal(tokenFromHash('#token=<script>'), null);
});
test('older revisions and changed meeting point cannot replace current card', () => {
  assert.equal(canReplace(session, {...session, revision: 2}), false);
  assert.equal(canReplace(session, {...session, meetingPointId:'other'}), false);
  assert.equal(canReplace(session, {...session, revision:4, parkingId:venue.parkingCandidates[1].id}), true);
});
test('catalog mismatch and unknown parking fail closed', () => {
  assert.equal(validateSession(session), session);
  assert.equal(validateVenue(venue, session), venue);
  assert.throws(() => validateVenue(venue, {...session, catalogVersion:'other'}));
  assert.throws(() => validateVenue(venue, {...session, parkingId:'invented'}));
  assert.throws(() => validateSession({...session, expiresAt:'invalid'}));
});
