import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionFromHash, canConfirm, validateHandoff, reunionOperation } from '../public/handoff.js';
import { proxyRequest } from '../pages-proxy.mjs';
const token = 'h'.repeat(64), key = '11111111-2222-4333-8444-555555555555';
const session = { id:key, stage:'WALKING_TO_MEETING', revision:4, dataMode:'DEMO', venueId:'v', catalogVersion:'v1', meetingPointId:'m', parkingId:'p', excludedParkingIds:[], updatedAt:'2026-01-01T00:00:00Z', expiresAt:'2030-01-01T00:00:00Z', handoffExpiresAt:'2030-01-01T00:00:00Z', capabilities:['CONFIRM_REUNION'] };
const env = { API_BASE_URL:'https://api.example' };
const post = (path = '/api/v1/handoff-session/reunion', body = { expectedRevision:4 }, headers = {}) => new Request('https://web.example'+path,
 {method:'POST', headers:{Authorization:'Bearer '+token,'Idempotency-Key':key,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('handoff link is explicit and cannot upgrade an existing share link', () => {
 assert.deepEqual(connectionFromHash('#token='+token),{mode:'share',token});
 assert.deepEqual(connectionFromHash('#handoff='+token),{mode:'handoff',token});
 assert.equal(connectionFromHash('#handoff='+token+'&token='+token),null);
 assert.equal(connectionFromHash('#handoff=bad'),null);
 assert.equal(canConfirm('share',session),false);
});
test('confirmation requires parking, server capability and unexpired token and session', () => {
 assert.equal(canConfirm('handoff',validateHandoff(session)),true);
 for (const stage of ['PLANNED','TO_DROPOFF','TO_PARKING','REUNITED','CANCELLED']) assert.equal(canConfirm('handoff',{...session,stage}),false);
 assert.equal(canConfirm('handoff',{...session,capabilities:[]}),false);
 assert.equal(canConfirm('handoff',session,Date.parse(session.expiresAt)),false);
 assert.throws(()=>validateHandoff({...session,capabilities:['OWNER']}));
 assert.throws(()=>validateHandoff({...session,handoffExpiresAt:'2031-01-01T00:00:00Z'}));
});
test('uncertain confirmation reuses both key and original expected revision', () => {
 const pending=reunionOperation(session,null,()=>key);
 assert.equal(reunionOperation({...session,revision:5},pending,()=>{throw Error('new key')}),pending);
 const other=reunionOperation({...session,id:'22222222-2222-4333-8444-555555555555'},pending,()=>key);
 assert.notEqual(other.sessionId,pending.sessionId);
});
test('Pages forwards only the scoped reunion write, with no cookies and no redirect following', async () => {
 let sent;
 const r=await proxyRequest(post(),env,async(url,options)=>{sent={url,options};return new Response(JSON.stringify({...session,stage:'REUNITED',capabilities:[],revision:5}));});
 assert.equal(r.status,200);assert.equal(sent.url,'https://api.example/v1/handoff-session/reunion');
 assert.equal(sent.options.method,'POST');assert.equal(sent.options.body,'{"expectedRevision":4}');
 assert.equal(sent.options.headers['Idempotency-Key'],key);assert.equal(sent.options.headers.Cookie,undefined);assert.equal(sent.options.redirect,'manual');
 assert.equal(r.headers.get('cache-control'),'no-store');
});
test('Pages rejects owner writes, bad key, query token, cross-origin and arbitrary body before network', async () => {
 const never=()=>{throw Error('must not forward')};
 for(const [req,status] of [
  [post('/api/v1/sessions/'+key+'/events'),405],
  [post(undefined,undefined,{'Idempotency-Key':'bad'}),400],
  [post('/api/v1/handoff-session/reunion?token=x'),404],
  [post(undefined,undefined,{Origin:'https://other.example'}),403],
  [post(undefined,{expectedRevision:4,event:'CANCEL'}),400],
  [post(undefined,{expectedRevision:0}),400],
  [post(undefined,undefined,{Authorization:''}),401],
 ]) assert.equal((await proxyRequest(req,env,never)).status,status);
});
test('oversized writes and unexpected redirects cannot leak handoff credentials', async()=>{
 assert.equal((await proxyRequest(post(undefined,{expectedRevision:4,padding:'x'.repeat(2000)}),env,()=>{throw Error('too large')})).status,400);
 assert.equal((await proxyRequest(post(),env,async()=>new Response('{}',{status:302,headers:{Location:'https://other.example'}}))).status,502);
});
test('handoff read forwards bearer and never exposes issuance endpoint', async()=>{
 const r=await proxyRequest(new Request('https://web.example/api/v1/handoff-session',{headers:{Authorization:'Bearer '+token}}),env,async(_,options)=>{
  assert.equal(options.headers.Authorization,'Bearer '+token);return new Response(JSON.stringify(session));
 });assert.equal(r.status,200);
 const rejected=await proxyRequest(new Request('https://web.example/api/v1/sessions/'+key+'/handoffs'),env,()=>{throw Error('owner route')});assert.equal(rejected.status,404);
});
