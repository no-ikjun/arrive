import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from '../server.mjs';
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
const close = server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
test('share proxy is read only, preserves bearer header, and never follows redirects', async () => {
  let authorization;
  const upstream = http.createServer((req,res) => { authorization=req.headers.authorization; if(req.url.includes('redirect')) {res.writeHead(302,{Location:'/elsewhere'});res.end();return;} res.setHeader('Content-Type','application/json');res.end('{"ok":true}'); });
  const base=await listen(upstream), app=createServer(base), url=await listen(app);
  try {
    const token='a'.repeat(43);
    let r=await fetch(url+'/api/v1/shared-session',{headers:{Authorization:'Bearer '+token}});
    assert.equal(r.status,200);assert.equal(authorization,'Bearer '+token);assert.equal(r.headers.get('cache-control'),'no-store');
    assert.equal((await fetch(url+'/api/v1/sessions')).status,404);
    assert.equal((await fetch(url+'/api/v1/shared-session',{method:'POST'})).status,405);
    assert.equal((await fetch(url+'/api/v1/shared-session?token='+token)).status,404);
    assert.equal((await fetch(url+'/api/v1/shared-session')).status,401);
    assert.equal((await fetch(url+'/api/v1/venues/redirect')).status,502);
    r=await fetch(url+'/'); assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  } finally { await close(app);await close(upstream); }
});

test('local proxy forwards only the scoped reunion write', async () => {
  let received;
  const upstream=http.createServer(async (req,res)=>{
    let body='';for await (const part of req) body+=part;
    received={url:req.url,method:req.method,headers:req.headers,body};
    res.setHeader('Content-Type','application/json');res.end('{"ok":true}');
  });
  const base=await listen(upstream),app=createServer(base),url=await listen(app);
  try {
    const headers={Authorization:'Bearer '+'h'.repeat(64),'Idempotency-Key':'11111111-2222-4333-8444-555555555555',Cookie:'private=value','Content-Type':'application/json'};
    const result=await fetch(url+'/api/v1/handoff-session/reunion',{method:'POST',headers,body:JSON.stringify({expectedRevision:4})});
    assert.equal(result.status,200);assert.equal(received.method,'POST');assert.equal(received.url,'/v1/handoff-session/reunion');
    assert.equal(received.headers.authorization,headers.Authorization);assert.equal(received.headers.cookie,undefined);
    assert.equal(received.headers['idempotency-key'],headers['Idempotency-Key']);assert.equal(received.body,'{"expectedRevision":4}');
    received=null;
    assert.equal((await fetch(url+'/api/v1/handoff-session/reunion',{method:'POST',headers,body:JSON.stringify({expectedRevision:4,event:'CANCEL'})})).status,400);
    assert.equal(received,null);
    assert.equal((await fetch(url+'/handoff.js')).status,200);
  } finally { await close(app);await close(upstream); }
});
