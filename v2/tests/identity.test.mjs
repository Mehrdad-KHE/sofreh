import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {runtimeRoot} from '../scripts/runtime-source.mjs';
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
  pickupAddress:'123 Private Test Street',pickupAddressConsent:true,pickupWindowEn:'17:00–19:00',pickupWindowFa:'۱۷ تا ۱۹',fulfillmentMode:'both',deliveryFeeCents:450,deliveryRadiusKm:5};
const dishInput={titleEn:'Test soup',titleFa:'آش تست',descriptionEn:'Soup with wheat.',descriptionFa:'آش با گندم.',priceCents:1299,remainingPortions:2,
  serviceWindowStartIso:new Date().toISOString(),serviceWindowEndIso:new Date(Date.now()+86400000).toISOString(),allergens:['wheat'],availabilityMode:'TODAY_AVAILABLE'};

test('centred mobile views use the real workspace and preserve account role gates',async()=>{
  const app=await start();try{
    const guest=app.client(),customer=app.client(),cook=app.client();
    assert.equal((await guest('/app/customer?view=mobile')).status,303);
    await register(customer,'frame-customer@example.test','CUSTOMER');await register(cook,'frame-cook@example.test','COOK');
    for(const [client,role,tab] of [[customer,'customer','discover'],[cook,'cook','orders']]){
      const page=await client('/app/'+role+'?view=mobile&locale=fa-IR&tab='+tab);
      assert.equal(page.status,200);assert.equal(page.headers.get('cache-control'),'no-store');
      assert.match(page.headers.get('content-security-policy'),/frame-src 'self'/);
      assert.match(page.data,new RegExp('<iframe[^>]+src="/app/'+role+'\\?locale=fa-IR&amp;tab='+tab+'&amp;embedded=mobile"'));
      assert.ok(!page.data.includes('src="/app/'+role+'?view=mobile'));
      const direct=await client('/app/'+role+'?locale=fa-IR');assert.equal(direct.status,200);assert.match(direct.data,/id="content"/);
      const other=await client('/app/'+(role==='cook'?'customer':'cook')+'?view=mobile');assert.equal(other.status,303);
    }
    const hostile=await customer('/app/customer?view=mobile&tab='+encodeURIComponent('\" onload=alert(1)'));
    assert.ok(!hostile.data.includes('onload='));
  }finally{await app.close();}
});

test('retired preview paths never redirect to a signed-in workspace in account mode',async()=>{
  const app=await start();try{
    for(const role of ['customer','cook'])for(const suffix of ['', '/', '/index.html','/older']){
      const response=await app.client()('/preview/'+role+suffix+'?locale=fa-IR');
      assert.equal(response.status,410);assert.equal(response.headers.get('location'),null);assert.equal(response.headers.get('cache-control'),'no-store');
    }
  }finally{await app.close();}
});

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
    const ownWorkspace=await customer('/app/cook?locale=fa-IR');
    assert.equal(ownWorkspace.status,303);assert.equal(ownWorkspace.headers.get('location'),'/app/customer?locale=fa-IR');
    assert.equal((await stranger('/api/auth/sign-in/email',{email:'customer@example.test',password:'incorrect password'})).status,401);
    const stored=app.db.prepare('SELECT password FROM account').get().password;
    assert.notEqual(stored,password);assert.ok(stored.length>60);
    await register(cook,'cook@example.test','COOK');
    const cookWorkspace=await cook('/app/customer');
    assert.equal(cookWorkspace.status,303);assert.equal(cookWorkspace.headers.get('location'),'/app/cook');
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
    app.db.prepare('UPDATE dish_slots SET price_cents=? WHERE id=?').run(1400,dish.data.dish.id);
    const changedQuote=await customer('/api/customer/orders',{cookId:kitchen.data.kitchen.id,items:[{dishId:dish.data.dish.id,quantity:1}],
      fulfillmentType:'pickup',simulatedPaymentMethod:'SIMULATED_CARD',idempotencyKey:'identity-stale-quote',
      expectedSubtotalCents:1299,expectedDeliveryFeeCents:0,expectedTotalCents:1299});
    assert.equal(changedQuote.status,409);assert.equal(changedQuote.data.error.code,'ORDER_QUOTE_CHANGED');
    assert.equal(app.db.prepare('SELECT remaining_portions FROM dish_slots WHERE id=?').get(dish.data.dish.id).remaining_portions,2);
    app.db.prepare('UPDATE dish_slots SET price_cents=? WHERE id=?').run(1299,dish.data.dish.id);
    const order=await customer('/api/customer/orders',{simulatedPaymentMethod:'SIMULATED_CARD',idempotencyKey:'identity-order-1'});
    assert.equal(order.status,201);assert.equal(order.data.order.totalCents,1299);assert.equal(order.data.order.isSyntheticTestOrder,false);
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM order_events WHERE order_id=?').get(order.data.order.id).n,1);
    assert.equal(order.data.order.pickupAddressReleased,null);
    const queue=await cook(`/api/cook/kitchen/${kitchen.data.kitchen.id}/orders`);
    assert.equal(queue.data.orders[0].id,order.data.order.id);
    assert.equal((await cook(`/api/cook/orders/${order.data.order.id}/status`,{nextStatus:'ACCEPTED'})).status,200);
    assert.equal((await cook(`/api/cook/orders/${order.data.order.id}/status`,{nextStatus:'ACCEPTED'})).status,400);
    const events=app.db.prepare('SELECT previous_status,next_status FROM order_events WHERE order_id=? ORDER BY created_at_iso').all(order.data.order.id);
    assert.deepEqual(events.map(event=>[event.previous_status,event.next_status]),[[null,'PENDING'],['PENDING','ACCEPTED']]);
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

test('an account without a workspace role can finish setup from either application entry',async()=>{
  const app=await start();try{
    const owner=app.client();
    assert.equal((await owner('/api/auth/sign-up/email',{name:'Unfinished owner',email:'unfinished@example.test',password})).status,200);
    for(const role of ['cook','customer']){
      const response=await owner(`/app/${role}?locale=fa-IR`);
      assert.equal(response.status,303);
      assert.equal(response.headers.get('location'),`/account?role=${role.toUpperCase()}&locale=fa-IR`);
    }
    assert.equal((await owner('/api/customer/orders')).status,401);
  }finally{await app.close();}
});

test('updating a demo cook profile preserves its TEST ONLY marker in public discovery',async()=>{
  const app=await start();const cook=app.client();
  try{
    await register(cook,'demo-marker@example.test','COOK');
    const created=await cook('/api/cook/kitchen',kitchenInput,{method:'PUT'});assert.equal(created.status,200);
    app.db.prepare("UPDATE cook_profiles SET is_synthetic_test_fixture=1,synthetic_badge_label='TEST ONLY' WHERE id=?").run(created.data.kitchen.id);
    const updated=await cook('/api/cook/kitchen',{...kitchenInput,nameEn:'TEST ONLY demo kitchen',isPublished:true},{method:'PUT'});assert.equal(updated.status,200);
    const discovery=await cook('/api/discovery/cooks');const demo=discovery.data.cooks.find(item=>item.id===created.data.kitchen.id);
    assert.equal(demo?.isSyntheticTestFixture,true);assert.equal(demo?.syntheticBadgeLabel,'TEST ONLY');
  }finally{await app.close();}
});

test('pickup address is withheld without explicit consent and legacy account consent requires reconfirmation',async()=>{
  const app=await start();const cook=app.client(),customer=app.client();
  try{
    await register(cook,'consent-cook@example.test','COOK');await register(customer,'consent-customer@example.test','CUSTOMER');
    const {pickupAddressConsent,...withoutConsent}=kitchenInput;
    const created=await cook('/api/cook/kitchen',withoutConsent,{method:'PUT'});assert.equal(created.data.kitchen.pickupAddressConsent,false);
    assert.equal(Number(app.db.prepare('PRAGMA table_info(cook_profiles)').all().find(column=>column.name==='pickup_address_consent').dflt_value),0);
    const dish=await cook('/api/cook/dishes',dishInput,{method:'PUT'});
    const orderInput={cookId:created.data.kitchen.id,items:[{dishId:dish.data.dish.id,quantity:1}],fulfillmentType:'pickup',simulatedPaymentMethod:'SIMULATED_CARD',idempotencyKey:'explicit-consent'};
    const blocked=await customer('/api/customer/orders',orderInput);assert.equal(blocked.status,409);assert.equal(blocked.data.error.code,'PICKUP_ADDRESS_UNAVAILABLE');
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM orders').get().n,0);
    assert.equal((await customer('/api/discovery/cooks')).data.cooks[0].supportsPickup,false);
    app.db.prepare("UPDATE cook_profiles SET public_address_visibility='PUBLIC_EXACT' WHERE id=?").run(created.data.kitchen.id);
    const allowed=await cook('/api/cook/kitchen',kitchenInput,{method:'PUT'});assert.ok(allowed.data.kitchen.pickupConsentRecordedAtIso);
    const publicCook=(await customer('/api/discovery/cooks')).data.cooks[0];assert.equal(publicCook.pickupAddressVisibility,'AREA_ONLY');assert.equal(publicCook.pickupAddress,undefined);
    assert.equal(publicCook.supportsPickup,true);
    const placed=await customer('/api/customer/orders',orderInput);assert.equal(placed.status,201);
    assert.equal(placed.data.order.pickupAddressReleased,null);
    assert.equal((await cook(`/api/cook/orders/${placed.data.order.id}/status`,{nextStatus:'ACCEPTED'})).status,200);
    assert.equal((await customer(`/api/customer/orders/${placed.data.order.id}`)).data.order.pickupAddressReleased,kitchenInput.pickupAddress);
    const revoke=await cook('/api/cook/kitchen',withoutConsent,{method:'PUT'});assert.equal(revoke.status,409);assert.equal(revoke.data.error.code,'ACTIVE_PICKUP_ORDERS');
    assert.equal((await cook('/api/cook/kitchen')).data.kitchen.pickupAddressConsent,true);
    app.db.exec('DROP TRIGGER account_pickup_consent_on_insert; ALTER TABLE cook_profiles DROP COLUMN pickup_consent_recorded_at_iso');initializeSchema(app.db);
    assert.equal((await cook('/api/cook/kitchen')).data.kitchen.pickupAddressConsent,false);
    assert.equal((await customer(`/api/customer/orders/${placed.data.order.id}`)).data.order.pickupAddressReleased,null);
    await cook('/api/cook/kitchen',kitchenInput,{method:'PUT'});initializeSchema(app.db);
    assert.equal((await cook('/api/cook/kitchen')).data.kitchen.pickupAddressConsent,true);
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM orders').get().n,1);
  }finally{await app.close();}
});

test('cook-authored menu categories persist and invalid category edits cannot change a dish',async()=>{
  const app=await start();const cook=app.client();
  try{
    await register(cook,'category-cook@example.test','COOK');await cook('/api/cook/kitchen',kitchenInput,{method:'PUT'});
    const created=await cook('/api/cook/dishes',{...dishInput,category:'bread'},{method:'PUT'});assert.equal(created.status,200);
    const id=created.data.dish.id;
    assert.equal((await cook('/api/discovery/cooks')).data.cooks[0].dishes[0].category,'bread');
    assert.equal((await cook(`/api/cook/dishes/${id}`,{...dishInput,category:'unsupported',priceCents:999},{method:'PUT'})).status,400);
    const unchanged=(await cook('/api/discovery/cooks')).data.cooks[0].dishes[0];assert.equal(unchanged.category,'bread');assert.equal(unchanged.priceCents,dishInput.priceCents);
    const {remainingPortions,...metadata}=dishInput;
    assert.equal((await cook(`/api/cook/dishes/${id}`,metadata,{method:'PUT'})).status,200);assert.equal((await cook('/api/discovery/cooks')).data.cooks[0].dishes[0].category,'bread');
  }finally{await app.close();}
});

for (const libsql of [false,true]) test(`dish edits cannot restore sold stock or overwrite a newer stock count (${libsql?'libSQL':'SQLite'})`,async()=>{
  const app=await start(':memory:',randomBytes(48).toString('hex'),{libsql});
  try {
    const cook=app.client(),customer=app.client();
    await register(cook,'stock-cook@example.test','COOK');await register(customer,'stock-customer@example.test','CUSTOMER');
    const kitchen=await cook('/api/cook/kitchen',kitchenInput,{method:'PUT'});
    const created=await cook('/api/cook/dishes',{...dishInput,remainingPortions:1},{method:'PUT'});const id=created.data.dish.id;
    const order=await customer('/api/customer/orders',{cookId:kitchen.data.kitchen.id,items:[{dishId:id,quantity:1}],fulfillmentType:'pickup',simulatedPaymentMethod:'SIMULATED_CARD',idempotencyKey:'stock-first'});assert.equal(order.status,201);
    const {remainingPortions,...metadata}=dishInput;
    const edited=await cook(`/api/cook/dishes/${id}`,{...metadata,descriptionFa:'توضیح جدید بدون افزایش موجودی'},{method:'PUT'});assert.equal(edited.status,200);
    const stock=()=>app.db.prepare('SELECT total_portions,remaining_portions,description_fa FROM dish_slots WHERE id=?').get(id);
    assert.equal(stock().remaining_portions,0);assert.equal(stock().total_portions,1);
    const second=await customer('/api/customer/orders',{cookId:kitchen.data.kitchen.id,items:[{dishId:id,quantity:1}],fulfillmentType:'pickup',simulatedPaymentMethod:'SIMULATED_CARD',idempotencyKey:'stock-second'});assert.equal(second.status,409);
    const stale=await cook(`/api/cook/dishes/${id}`,{...dishInput,remainingPortions:4,expectedRemainingPortions:1,descriptionFa:'must not save'},{method:'PUT'});
    assert.equal(stale.status,409);assert.equal(stale.data.error.code,'DISH_STOCK_CHANGED');assert.equal(stock().remaining_portions,0);assert.equal(stock().description_fa,'توضیح جدید بدون افزایش موجودی');
    assert.equal((await cook(`/api/cook/dishes/${id}`,{...dishInput,remainingPortions:4},{method:'PUT'})).status,400);
    const patchPath=`/api/cook/kitchen/${kitchen.data.kitchen.id}/dishes/${id}`;
    assert.equal((await cook(patchPath,{remainingPortions:1},{method:'PATCH'})).status,409);
    assert.equal((await cook(patchPath,{remainingPortions:0,expectedRemainingPortions:0},{method:'PATCH'})).status,200);
    const restock=await cook(`/api/cook/dishes/${id}`,{...dishInput,remainingPortions:2,expectedRemainingPortions:0},{method:'PUT'});assert.equal(restock.status,200);
    assert.equal(stock().remaining_portions,2);assert.equal(stock().total_portions,3);
    assert.equal((await cook(`/api/cook/orders/${order.data.order.id}/status`,{nextStatus:'REJECTED'})).status,200);
    assert.equal(stock().remaining_portions,3);assert.equal(stock().total_portions,3);
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM orders').get().n,1);
  } finally {await app.close();}
});

test('pickup consent gates discovery, new orders and existing pending acceptance while delivery remains usable',async()=>{
  const app=await start();
  try {
    const cook=app.client(),customer=app.client();await register(cook,'pickup-gate-cook@example.test','COOK');await register(customer,'pickup-gate-customer@example.test','CUSTOMER');
    const saved=await cook('/api/cook/kitchen',{...kitchenInput,pickupAddressConsent:false},{method:'PUT'});const cookId=saved.data.kitchen.id;
    const created=await cook('/api/cook/dishes',{...dishInput,remainingPortions:4},{method:'PUT'});const dishId=created.data.dish.id;
    const orderInput={cookId,items:[{dishId,quantity:1}],fulfillmentType:'pickup',simulatedPaymentMethod:'SIMULATED_CARD'};
    assert.equal((await customer('/api/customer/cart/items',{cookId,dishId,quantity:1,fulfillmentType:'pickup'})).status,409);
    const delivery=await customer('/api/customer/orders',{...orderInput,fulfillmentType:'delivery',deliveryAddress:'456 Synthetic Test Road',idempotencyKey:'delivery-no-consent'});assert.equal(delivery.status,201);
    assert.equal((await cook(`/api/cook/orders/${delivery.data.order.id}/status`,{nextStatus:'ACCEPTED'})).status,200);
    assert.equal((await customer(`/api/customer/orders/${delivery.data.order.id}`)).data.order.pickupAddressReleased,null);
    await cook('/api/cook/kitchen',{...kitchenInput,fulfillmentMode:'pickup',pickupAddressConsent:false},{method:'PUT'});
    assert.equal((await customer('/api/discovery/cooks')).data.cooks.length,0);
    assert.equal((await cook('/api/cook/kitchen')).data.kitchen.fulfillmentMode,'pickup');
    await cook('/api/cook/kitchen',kitchenInput,{method:'PUT'});
    assert.equal((await customer('/api/customer/cart/items',{cookId,dishId,quantity:1,fulfillmentType:'pickup'})).status,200);
    await cook('/api/cook/kitchen',{...kitchenInput,pickupAddressConsent:false},{method:'PUT'});
    const recoveredCart=(await customer('/api/customer/cart')).data.cart;
    assert.equal(recoveredCart.fulfillmentType,'delivery');assert.equal(recoveredCart.supportsPickup,false);assert.equal(recoveredCart.deliveryFeeCents,450);
    await cook('/api/cook/kitchen',kitchenInput,{method:'PUT'});
    const pending=await customer('/api/customer/orders',{...orderInput,idempotencyKey:'pending-consent'});assert.equal(pending.status,201);
    await cook('/api/cook/kitchen',{...kitchenInput,pickupAddressConsent:false},{method:'PUT'});
    const blocked=await cook(`/api/cook/orders/${pending.data.order.id}/status`,{nextStatus:'ACCEPTED'});assert.equal(blocked.status,409);assert.equal(blocked.data.error.code,'PICKUP_ADDRESS_UNAVAILABLE');
    assert.equal((await customer(`/api/customer/orders/${pending.data.order.id}`)).data.order.status,'PENDING');
    assert.equal((await cook(`/api/cook/orders/${pending.data.order.id}/status`,{nextStatus:'REJECTED'})).status,200);
    await cook('/api/cook/kitchen',kitchenInput,{method:'PUT'});
    const accepted=await customer('/api/customer/orders',{...orderInput,idempotencyKey:'accepted-consent'});assert.equal(accepted.status,201);
    assert.equal((await cook(`/api/cook/orders/${accepted.data.order.id}/status`,{nextStatus:'ACCEPTED'})).status,200);
    for (const status of ['ACCEPTED','PREPARING','READY']) {
      if(status!=='ACCEPTED')assert.equal((await cook(`/api/cook/orders/${accepted.data.order.id}/status`,{nextStatus:status})).status,200);
      assert.equal((await cook('/api/cook/kitchen',{...kitchenInput,pickupAddressConsent:false},{method:'PUT'})).status,409);
      assert.equal((await customer(`/api/customer/orders/${accepted.data.order.id}`)).data.order.pickupAddressReleased,kitchenInput.pickupAddress);
    }
    assert.equal((await cook(`/api/cook/orders/${accepted.data.order.id}/status`,{nextStatus:'COMPLETED'})).status,200);
    assert.equal((await cook('/api/cook/kitchen',{...kitchenInput,pickupAddressConsent:false},{method:'PUT'})).status,200);
  } finally {await app.close();}
});

test('identity, role and saved address survive a database reopen',async()=>{
  const root=path.join(runtimeRoot,'tests');fs.mkdirSync(root,{recursive:true});
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

test('a cook can pause public ordering while retaining the menu and fulfilling existing orders',async()=>{
  const app=await start();try{
    const cook=app.client(),customer=app.client();
    await register(cook,'pause-cook@example.test','COOK');await register(customer,'pause-customer@example.test','CUSTOMER');
    const kitchen=(await cook('/api/cook/kitchen',{...kitchenInput,isPublished:true},{method:'PUT'})).data.kitchen;
    const dish=(await cook('/api/cook/dishes',dishInput,{method:'PUT'})).data.dish;
    assert.equal((await customer('/api/customer/cart/items',{cookId:kitchen.id,dishId:dish.id,quantity:1,fulfillmentType:'pickup'})).status,200);
    const order=(await customer('/api/customer/orders',{simulatedPaymentMethod:'SIMULATED_CARD',idempotencyKey:'before-pause'})).data.order;
    assert.equal((await customer('/api/customer/cart/items',{cookId:kitchen.id,dishId:dish.id,quantity:1,fulfillmentType:'pickup'})).status,200);
    assert.equal((await cook('/api/cook/kitchen',{...kitchenInput,isPublished:false},{method:'PUT'})).status,200);
    assert.equal((await customer('/api/discovery/cooks')).data.cooks.length,0);
    assert.equal((await customer('/api/discovery/cooks?minLat=43&maxLat=44&minLng=-80&maxLng=-79')).data.cooks.length,0);
    const own=(await cook('/api/cook/kitchen?locale=fa-IR')).data.kitchen;
    assert.equal(own.isPublished,false);assert.equal(own.storefront.dishes[0].title,dishInput.titleFa);
    const blocked=await customer('/api/customer/orders',{simulatedPaymentMethod:'SIMULATED_CARD',idempotencyKey:'during-pause'});
    assert.equal(blocked.status,409);assert.equal(blocked.data.error.code,'KITCHEN_PAUSED');
    assert.equal((await customer('/api/customer/cart/items',{cookId:kitchen.id,dishId:dish.id,quantity:1,fulfillmentType:'pickup'})).status,409);
    assert.equal(app.db.prepare('SELECT remaining_portions FROM dish_slots WHERE id=?').get(dish.id).remaining_portions,1);
    for(const nextStatus of ['ACCEPTED','READY','COMPLETED'])assert.equal((await cook(`/api/cook/orders/${order.id}/status`,{nextStatus})).status,200);
    assert.equal((await customer(`/api/customer/orders/${order.id}`)).data.order.status,'COMPLETED');
    assert.equal((await cook('/api/cook/kitchen',{...kitchenInput,isPublished:'false'},{method:'PUT'})).status,400);
    assert.equal((await cook('/api/cook/kitchen',{...kitchenInput,isPublished:true},{method:'PUT'})).status,200);
    assert.equal((await customer('/api/discovery/cooks')).data.cooks.length,1);
  }finally{await app.close();}
});
