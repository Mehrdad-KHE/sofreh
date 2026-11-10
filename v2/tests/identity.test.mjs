import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { openSofrehDatabase, initializeSchema } from '../packages/backend/src/db.mjs';
import {remoteDatabaseOptions,validateRemoteConnection} from '../packages/backend/src/remote.mjs';
import { createIdentityProvider } from '../packages/backend/src/identity.mjs';
import { createSofrehHttpServer } from '../packages/backend/src/server.mjs';

async function start(dbFilePath = ':memory:', secret = randomBytes(48).toString('base64url'), {libsql=false}={}) {
  let db;
  if(libsql){const {default:Database}=await import('libsql');db=new Database(dbFilePath);db.exec('PRAGMA foreign_keys=ON');initializeSchema(db);}
  else db=openSofrehDatabase(dbFilePath);
  const identityProvider = {};
  const { server } = createSofrehHttpServer({ database: db, seedFixtures: false, identityProvider });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { Object.assign(identityProvider, await createIdentityProvider({db,baseURL:base,secret,...(libsql?{databaseOptions:remoteDatabaseOptions(db)}:{})})); }
  catch(error) { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); db.close(); throw error; }
  function client() {
    let cookie = '';
    return async (route, body, { method = body ? 'POST' : 'GET', origin = base, headers = {} } = {}) => {
      const response = await fetch(base + route, {method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined,redirect:'manual'});
      const received=response.headers.getSetCookie();
      if(received.length) cookie=received.map(value=>value.split(';')[0]).join('; ');
      const contentType=response.headers.get('content-type')||'';
      return { status:response.status, headers:response.headers, data:contentType.includes('json')?await response.json():await response.text() };
    };
  }
  return {db,base,client, async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();}};
}
const password='Twelve characters plus 42!';
async function register(client, email, role) {
  assert.equal((await client('/api/auth/sign-up/email',{name:'Test Owner',email,password,role:'ADMIN'})).status,200);
  const setup=await client('/api/account/setup',{role,locale:'fa-IR'});
  assert.equal(setup.status,200);return setup.data;
}
const kitchenInput={nameEn:'Test kitchen',nameFa:'آشپزخانه تست',bioEn:'Cooked by the owner.',bioFa:'پخت توسط صاحب آشپزخانه.',area:'willowdale',
  pickupAddress:'123 Private Test Street',pickupWindowEn:'17:00–19:00',pickupWindowFa:'۱۷ تا ۱۹',fulfillmentMode:'both',deliveryFeeCents:450,deliveryRadiusKm:5};
const dishInput={titleEn:'Test soup',titleFa:'آش تست',descriptionEn:'Soup with wheat.',descriptionFa:'آش با گندم.',priceCents:1299,remainingPortions:2,
  serviceWindowStartIso:new Date().toISOString(),serviceWindowEndIso:new Date(Date.now()+86400000).toISOString(),allergens:['wheat'],availabilityMode:'TODAY_AVAILABLE'};

test('real sessions isolate roles, reject fixture tokens and enforce request origin',async()=>{
  const app=await start();try{
    const customer=app.client(),cook=app.client(),stranger=app.client();
    const redirect=await stranger('/app/cook?locale=fa-IR');assert.equal(redirect.status,303);assert.equal(redirect.headers.get('location'),'/account?role=COOK&locale=fa-IR');
    assert.equal((await stranger('/app/workspace.js')).status,200);assert.equal((await stranger('/app/workspace.css')).status,200);assert.equal((await stranger('/sw.js')).status,200);
    for (const role of ['customer','cook']) {
      const manifest=await stranger(`/app/${role}.webmanifest`);
      assert.equal(manifest.status,200);assert.match(manifest.headers.get('content-type'),/application\/manifest\+json/);
      assert.equal(manifest.data.start_url,`/app/${role}`);assert.equal(manifest.data.display,'standalone');
      const {default:sharp}=await import('sharp');
      for(const icon of manifest.data.icons){
        const response=await fetch(app.base+icon.src);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
        const metadata=await sharp(Buffer.from(await response.arrayBuffer())).metadata();
        assert.equal(`${metadata.width}x${metadata.height}`,icon.sizes);assert.equal(metadata.hasAlpha,false);
      }
    }
    assert.equal((await customer('/api/customer/orders')).status,401);
    assert.equal((await customer('/api/customer/orders',null,{headers:{Authorization:'Bearer test-token-customer-nima'}})).status,401);
    assert.equal((await customer('/api/auth/sign-up/email',{name:'Short',email:'short@example.test',password:'short'})).status,400);
    const customerProfile=await register(customer,'customer@example.test','CUSTOMER');
    assert.equal(customerProfile.account.role,'CUSTOMER');
    assert.equal((await customer('/api/account/setup',{role:'ADMIN'})).status,400);
    assert.equal((await customer('/api/account/setup',{role:'COOK'})).status,409);
    assert.equal((await customer('/api/customer/cart',{}, {method:'PUT',origin:'https://other.example'})).status,403);
    assert.equal((await customer('/api/cook/kitchen')).status,403);
    assert.equal((await customer('/app/cook')).status,403);
    assert.equal((await stranger('/api/auth/sign-in/email',{email:'customer@example.test',password:'incorrect password'})).status,401);
    const stored=app.db.prepare('SELECT password FROM account').get().password;
    assert.notEqual(stored,password);assert.ok(stored.length>60);
    await register(cook,'cook@example.test','COOK');
    const kitchen=await cook('/api/cook/kitchen',kitchenInput,{method:'PUT'});assert.equal(kitchen.status,200);
    const dish=await cook('/api/cook/dishes',dishInput,{method:'PUT'});assert.equal(dish.status,200);
    assert.equal((await cook(`/api/cook/dishes/${dish.data.dish.id}/photo`,{imageBase64:Buffer.from('<svg></svg>').toString('base64')},{method:'PUT'})).status,400);
    const {default:sharp}=await import('sharp');const png=await sharp({create:{width:80,height:60,channels:3,background:'#b82d45'}}).png().toBuffer();
    assert.equal((await customer(`/api/cook/dishes/${dish.data.dish.id}/photo`,{imageBase64:png.toString('base64')},{method:'PUT'})).status,403);
    const photo=await cook(`/api/cook/dishes/${dish.data.dish.id}/photo`,{imageBase64:png.toString('base64')},{method:'PUT'});assert.equal(photo.status,200);
    const publicPhoto=await fetch(app.base+photo.data.photoUrl);assert.equal(publicPhoto.headers.get('content-type'),'image/jpeg');
    const metadata=await sharp(Buffer.from(await publicPhoto.arrayBuffer())).metadata();assert.equal(metadata.width,80);assert.equal(metadata.exif,undefined);
    const discovery=await stranger('/api/discovery/cooks');
    assert.equal(discovery.data.cooks.length,1);
    assert.equal(discovery.data.cooks[0].isSyntheticTestFixture,false);
    assert.ok(!JSON.stringify(discovery.data).includes('123 Private'));
    assert.equal((await stranger('/api/cook/kitchen')).status,401);
    const cart=await customer('/api/customer/cart/items',{cookId:kitchen.data.kitchen.id,dishId:dish.data.dish.id,quantity:1,fulfillmentType:'pickup'});
    assert.equal(cart.status,200);
    const order=await customer('/api/customer/orders',{simulatedPaymentMethod:'SIMULATED_CARD',idempotencyKey:'identity-order-1'});
    assert.equal(order.status,201);assert.equal(order.data.order.totalCents,1299);assert.equal(order.data.order.isSyntheticTestOrder,false);
    assert.equal(order.data.order.pickupAddressReleased,null);
    const queue=await cook(`/api/cook/kitchen/${kitchen.data.kitchen.id}/orders`);
    assert.equal(queue.data.orders[0].id,order.data.order.id);
    assert.equal((await cook(`/api/cook/orders/${order.data.order.id}/status`,{nextStatus:'ACCEPTED'})).status,200);
    const accepted=await customer(`/api/customer/orders/${order.data.order.id}`);
    assert.equal(accepted.data.order.pickupAddressReleased,kitchenInput.pickupAddress);
    await register(stranger,'stranger@example.test','CUSTOMER');
    assert.equal((await stranger(`/api/customer/orders/${order.data.order.id}`)).status,403);
    assert.equal((await customer('/api/auth/sign-out',{})).status,200);
    assert.equal((await customer('/api/customer/orders')).status,401);
    app.db.prepare('UPDATE dish_slots SET service_window_end_iso=? WHERE id=?').run('2020-01-01T00:00:00.000Z',dish.data.dish.id);
    const discoveryAfter=await stranger('/api/discovery/cooks');assert.equal(discoveryAfter.data.cooks[0].dishes[0].isAvailableToday,false);
  }finally{await app.close();}
});

test('identity, role and saved address survive a database reopen',async()=>{
  const root=path.join(process.env.LOCALAPPDATA,'ElegantRuntime','Sofreh','tests');fs.mkdirSync(root,{recursive:true});
  const file=path.join(fs.mkdtempSync(path.join(root,'identity-')),'accounts.sqlite');const secret=randomBytes(48).toString('base64url');
  let app=await start(file,secret);
  try{const owner=app.client();await register(owner,'persist@example.test','CUSTOMER');assert.equal((await owner('/api/customer/addresses',{label:'Home',address:'45 Test Road'})).status,201);}finally{await app.close();}
  app=await start(file,secret);try{const owner=app.client();assert.equal((await owner('/api/auth/sign-in/email',{email:'persist@example.test',password})).status,200);
    assert.equal((await owner('/api/account')).data.account.role,'CUSTOMER');assert.equal((await owner('/api/customer/addresses')).data.addresses[0].address,'45 Test Road');
  }finally{await app.close();}
});

test('libSQL driver supports the same account, order and privacy contracts',async()=>{
  const app=await start(':memory:',randomBytes(48).toString('hex'),{libsql:true});
  try{
    const cook=app.client(),customer=app.client();
    await register(cook,'libsql-cook@example.test','COOK');await register(customer,'libsql-customer@example.test','CUSTOMER');
    const kitchen=await cook('/api/cook/kitchen',kitchenInput,{method:'PUT'});
    const dish=await cook('/api/cook/dishes',dishInput,{method:'PUT'});
    assert.equal(kitchen.status,200);assert.equal(dish.status,200);
    assert.equal((await customer('/api/customer/cart/items',{cookId:kitchen.data.kitchen.id,dishId:dish.data.dish.id,quantity:1,fulfillmentType:'pickup'})).status,200);
    const order=await customer('/api/customer/orders',{simulatedPaymentMethod:'SIMULATED_CARD',idempotencyKey:'libsql-driver-order'});
    assert.equal(order.status,201);assert.equal(order.data.order.pickupAddressReleased,null);
    const queue=await cook(`/api/cook/kitchen/${kitchen.data.kitchen.id}/orders`);assert.equal(queue.data.orders[0].id,order.data.order.id);
    assert.equal((await cook(`/api/cook/orders/${order.data.order.id}/status`,{nextStatus:'REJECTED'})).status,200);
    const rejected=(await customer(`/api/customer/orders/${order.data.order.id}`)).data.order;
    assert.equal(rejected.simulatedPaymentStatus,'SIMULATED_REFUNDED');
    assert.equal(app.db.prepare('SELECT remaining_portions FROM dish_slots WHERE id=?').get(dish.data.dish.id).remaining_portions,2);
  }finally{await app.close();}
});

test('remote connection configuration rejects plaintext and embedded credentials',()=>{
  const authToken='synthetic-configuration-token';
  for(const url of ['http://database.example','file:local.sqlite','https://user:secret@database.example','https://database.example/path','https://database.example/?token=x'])
    assert.throws(()=>validateRemoteConnection({url,authToken}));
  assert.throws(()=>validateRemoteConnection({url:'libsql://database.example',authToken:''}));
  assert.equal(validateRemoteConnection({url:'libsql://database.example',authToken}).authToken,authToken);
});

test('parallel account setup requests do not overlap SQLite transactions',async()=>{
  const app=await start();try{
    const profiles=await Promise.all(Array.from({length:4},(_,index)=>register(app.client(),`parallel-${index}@example.test`,index%2?'COOK':'CUSTOMER')));
    assert.deepEqual(profiles.map(profile=>profile.account.role),['CUSTOMER','COOK','CUSTOMER','COOK']);
  }finally{await app.close();}
});

test('authentication initialization waits for schema validation before reporting readiness',async()=>{
  const {default:Database}=await import('libsql');const db=new Database(':memory:');initializeSchema(db);
  const config={db,baseURL:'https://schema.example',secret:randomBytes(48).toString('hex'),databaseOptions:remoteDatabaseOptions(db)};
  try{
    await createIdentityProvider(config);
    db.exec('DROP TABLE verification');
    await assert.rejects(createIdentityProvider({...config,runMigrations:false}),/schema|verification|table/i);
  }finally{db.close();}
});
