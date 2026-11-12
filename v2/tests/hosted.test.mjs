import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import Database from 'libsql';
import {initializeSchema} from '../packages/backend/src/db.mjs';
import {createIdentityProvider} from '../packages/backend/src/identity.mjs';
import {remoteDatabaseOptions} from '../packages/backend/src/remote.mjs';
import {hostedConfiguration,createHostedRuntime,createHostedHandler,restoreRewrittenPath} from '../packages/backend/src/hosted.mjs';

const env={SOFREH_RUNTIME_MODE:'accounts',TURSO_DATABASE_URL:'libsql://synthetic.example',TURSO_AUTH_TOKEN:'configuration-test-token',
  SOFREH_PUBLIC_ORIGIN:'https://sofreh.example',SOFREH_AUTH_SECRET:randomBytes(48).toString('hex'),VERCEL:'1'};
async function listen(handler){const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {url:'http://127.0.0.1:'+server.address().port,async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};}

test('hosted account mode requires explicit valid configuration and never falls back after a database failure',async()=>{
  assert.deepEqual(hostedConfiguration({}),{mode:'fixtures'});
  assert.throws(()=>hostedConfiguration({VERCEL:'1'}),/SOFREH_RUNTIME_MODE/);
  for(const extra of [{SOFREH_RUNTIME_MODE:'account'},{TURSO_DATABASE_URL:'http://unsafe.example'},{SOFREH_PUBLIC_ORIGIN:'https://sofreh.example/path'},
    {SOFREH_PUBLIC_ORIGIN:'http://sofreh.example'},{SOFREH_AUTH_SECRET:'short'},{TURSO_AUTH_TOKEN:''}])assert.throws(()=>hostedConfiguration({...env,...extra}));
  await assert.rejects(createHostedRuntime(env,{connect(){throw new Error('database unavailable');}}),/database unavailable/);
  const empty=new Database(':memory:');
  await assert.rejects(createHostedRuntime(env,{connect:()=>empty}),/Database schema mismatch[\s\S]*Missing tables/);
  assert.throws(()=>empty.prepare('SELECT 1').get(),/closed|not open/i);
});

test('rewritten routes retain locale and reject foreign or ambiguous destinations',()=>{
  const req={url:'/api/index.mjs?path=%2Faccount&locale=fa-IR'};restoreRewrittenPath(req);assert.equal(req.url,'/account?locale=fa-IR');
  const classic={url:'/api/index?path=%2Fapi%2Fhealth&locale=fa-IR'};restoreRewrittenPath(classic);assert.equal(classic.url,'/api/health?locale=fa-IR');
  for(const path of ['https://foreign.example','//foreign.example','/api/health?x=1','/account#x','/a\\b','/a\nb'])
    assert.throws(()=>restoreRewrittenPath({url:'/api/index.mjs?path='+encodeURIComponent(path)}));
  const direct={url:'/account?locale=fa-IR'};restoreRewrittenPath(direct);assert.equal(direct.url,'/account?locale=fa-IR');
});

test('hosted handler retries a failed initialization, shares the next one, and does not disclose credentials',async()=>{
  let calls=0,reports=0;
  const upstream=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({url:req.url}));});
  const handler=createHostedHandler({initialize:async()=>{calls++;if(calls===1)throw new Error(env.TURSO_AUTH_TOKEN);return {server:upstream};},report:()=>{reports++;}});
  const app=await listen(handler);try{
    const failed=await fetch(app.url);assert.equal(failed.status,503);assert.equal(failed.headers.get('cache-control'),'no-store');
    const body=await failed.text();assert.match(body,/SERVICE_UNAVAILABLE/);assert.ok(!body.includes(env.TURSO_AUTH_TOKEN));
    const responses=await Promise.all(Array.from({length:4},()=>fetch(app.url+'/api/index.mjs?path=%2Faccount&locale=fa-IR')));
    for(const response of responses){assert.equal(response.status,200);assert.equal((await response.json()).url,'/account?locale=fa-IR');}
    assert.equal(calls,2);assert.equal(reports,1);
  }finally{await app.close();}
});

test('Vercel adapter serves real account cookies and assets without fixture identity or runtime migrations',async()=>{
  const db=new Database(':memory:');db.exec('PRAGMA foreign_keys=ON');initializeSchema(db);
  await createIdentityProvider({db,baseURL:env.SOFREH_PUBLIC_ORIGIN,secret:env.SOFREH_AUTH_SECRET,databaseOptions:remoteDatabaseOptions(db)});
  let connections=0;const runtime=await createHostedRuntime(env,{connect:()=>{connections++;return db;}});
  const app=await listen(createHostedHandler({initialize:async()=>runtime}));let cookie='';
  async function request(route,body){const response=await fetch(app.url+'/api/index.mjs?path='+encodeURIComponent(route),{
    method:body?'POST':'GET',headers:{Origin:env.SOFREH_PUBLIC_ORIGIN,Cookie:cookie,'x-real-ip':'192.0.2.35','x-sofreh-client-ip':'192.0.2.99',
      ...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    if(response.headers.getSetCookie().length)cookie=response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
    return {response,data:await response.json()};}
  try{
    const health=await request('/api/health');assert.equal(health.data.accountAuthenticationEnabled,true);assert.equal(health.data.syntheticFixtureMode,null);
    assert.equal((await request('/api/discovery/cooks')).data.cooks.length,0);
    assert.equal((await request('/api/auth/sign-up/email',{name:'Adapter owner',email:'adapter@example.test',password:'Adapter integration account 42!'})).response.status,200);
    assert.match(cookie,/__Secure-sofreh/);
    assert.equal((await request('/api/account/setup',{role:'CUSTOMER',locale:'fa-IR'})).response.status,200);
    assert.equal((await request('/api/account')).data.account.role,'CUSTOMER');
    const rateKeys=JSON.stringify(db.prepare('SELECT key FROM "rateLimit"').all());assert.ok(rateKeys.includes('192.0.2.35'));assert.ok(!rateKeys.includes('192.0.2.99'));
    for(const asset of ['/account','/app/workspace.js','/app/workspace.css','/assets/brand/app-icon-192.png']){
      const response=await fetch(app.url+asset);assert.equal(response.status,200);assert.ok((await response.arrayBuffer()).byteLength>100);
    }
    assert.equal(connections,1);
  }finally{await app.close();db.close();}
});
