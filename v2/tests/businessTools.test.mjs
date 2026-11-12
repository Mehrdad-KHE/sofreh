import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { openSofrehDatabase, initializeSchema } from '../packages/backend/src/db.mjs';
import { createIdentityProvider } from '../packages/backend/src/identity.mjs';
import { remoteDatabaseOptions } from '../packages/backend/src/remote.mjs';
import { createSofrehHttpServer } from '../packages/backend/src/server.mjs';
import { businessInsights } from '../packages/backend/src/businessInsights.mjs';
import { listPublicDiscoveryCooks } from '../packages/backend/src/service.mjs';

const kitchen={nameEn:'Synthetic kitchen',nameFa:'آشپزخانهٔ ساختگی',bioEn:'Local test data.',bioFa:'دادهٔ آزمون محلی.',area:'willowdale',pickupAddress:'123 Private Test Street',pickupAddressConsent:true,pickupWindowEn:'Today',pickupWindowFa:'امروز',fulfillmentMode:'both',deliveryFeeCents:450,deliveryRadiusKm:5,isPublished:true};
async function start(libsql=false) {
  let db;if(libsql){const {default:Database}=await import('libsql');db=new Database(':memory:');db.exec('PRAGMA foreign_keys=ON');initializeSchema(db);}else db=openSofrehDatabase(':memory:');
  const identityProvider={};const {server}=createSofrehHttpServer({database:db,seedFixtures:false,identityProvider});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  Object.assign(identityProvider,await createIdentityProvider({db,baseURL:base,secret:randomBytes(48).toString('hex'),...(libsql?{databaseOptions:remoteDatabaseOptions(db)}:{})}));
  function client(){let cookie='';return async(route,input,method=input?'POST':'GET')=>{
    const response=await fetch(base+route,{method,headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(input?{'Content-Type':'application/json'}:{})},...(input?{body:JSON.stringify(input)}:{}),redirect:'manual'});
    if(response.headers.getSetCookie().length)cookie=response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
    return {status:response.status,headers:response.headers,data:response.headers.get('content-type')?.includes('json')?await response.json():await response.arrayBuffer()};
  }; }
  async function register(role,email){const request=client();assert.equal((await request('/api/auth/sign-up/email',{name:'Synthetic '+role,email,password:'A secure test password 42!'})).status,200);assert.equal((await request('/api/account/setup',{role,locale:'en-CA'})).status,200);return request;}
  const cook=await register('COOK','cook@example.test'),customer=await register('CUSTOMER','customer@example.test'),other=await register('CUSTOMER','other@example.test');
  const saved=await cook('/api/cook/kitchen',kitchen,'PUT');assert.equal(saved.status,200);const cookId=saved.data.kitchen.id;
  const meal=await cook('/api/cook/dishes',{titleEn:'Synthetic meal',titleFa:'غذای ساختگی',descriptionEn:'Test only.',descriptionFa:'فقط آزمون.',priceCents:1000,remainingPortions:80,serviceWindowStartIso:new Date(Date.now()-60000).toISOString(),serviceWindowEndIso:new Date(Date.now()+10*86400000).toISOString(),allergens:['wheat'],availabilityMode:'TODAY_AVAILABLE',category:'food'},'PUT');assert.equal(meal.status,200);
  async function order(extra={}){const result=await customer('/api/customer/orders',{cookId,items:[{dishId:meal.data.dish.id,quantity:1}],fulfillmentType:'pickup',simulatedPaymentMethod:'SIMULATED_CARD',idempotencyKey:randomUUID(),...extra});assert.equal(result.status,201,JSON.stringify(result.data));return result.data.order;}
  return {db,base,cook,customer,other,cookId,register,anonymous:client(),order,async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();}};
}

test('rolling business comparison excludes future orders and uses non-overlapping periods',async()=>{
  const a=await start();try{
    const now=Date.now();const offsets=[-86400000,-7*86400000,-8*86400000,86400000];
    for(const offset of offsets){const order=await a.order();a.db.prepare("UPDATE orders SET created_at_iso=?,status='COMPLETED' WHERE id=?").run(new Date(now+offset).toISOString(),order.id);}
    const insight=businessInsights(a.db,a.cookId,7,now);
    assert.equal(insight.current.orderCount,2);assert.equal(insight.previous.orderCount,1);assert.equal(insight.current.completedValueCents,2000);assert.equal(insight.previous.completedValueCents,1000);
    assert.equal(insight.daily.reduce((n,d)=>n+d.orders,0),2);assert.equal(insight.daily.reduce((n,d)=>n+d.completedValueCents,0),2000);assert.equal(insight.timeZone,'America/Toronto');
    for(const days of [7,30,90]){const result=await a.cook('/api/cook/business?days='+days);assert.equal(result.status,200);assert.equal(result.data.business.insights.current.orderCount,result.data.business.orderCount);assert.equal(result.data.business.customers.reduce((n,c)=>n+c.orderCount,0),result.data.business.orderCount);}
    assert.equal((await a.customer('/api/cook/business')).status,403);
  }finally{await a.close();}
});

test('discovery presents available main meals before accompaniments and unavailable meals',async()=>{
  const a=await start();try{
    const original=a.db.prepare('SELECT id FROM dish_slots WHERE cook_id=?').get(a.cookId).id;
    a.db.prepare("UPDATE dish_slots SET availability_mode='REGULAR_UNAVAILABLE' WHERE id=?").run(original);
    const create=category=>a.cook('/api/cook/dishes',{titleEn:'Synthetic '+category,titleFa:'قلم ساختگی',descriptionEn:'Test only.',descriptionFa:'فقط آزمون.',priceCents:500,remainingPortions:5,serviceWindowStartIso:new Date(Date.now()-60000).toISOString(),serviceWindowEndIso:new Date(Date.now()+86400000).toISOString(),allergens:[],availabilityMode:'TODAY_AVAILABLE',category},'PUT');
    const bread=await create('bread'),main=await create('food');assert.equal(bread.status,200);assert.equal(main.status,200);
    assert.deepEqual(listPublicDiscoveryCooks(a.db).cooks[0].dishes.map(d=>d.id),[main.data.dish.id,bread.data.dish.id,original]);
  }finally{await a.close();}
});

test('unpublished and unknown storefronts show the same private-safe recovery page',async()=>{
  const a=await start();try{
    assert.equal((await a.cook('/api/cook/kitchen',{...kitchen,isPublished:false},'PUT')).status,200);
    for(const locale of ['fa-IR','en-CA']){
      const missing=await fetch(a.base+'/kitchens/not-a-kitchen?locale='+locale),paused=await fetch(a.base+'/kitchens/'+a.cookId+'?locale='+locale);
      assert.equal(missing.status,404);assert.equal(paused.status,404);assert.match(paused.headers.get('content-type'),/^text\/html/);assert.equal(paused.headers.get('cache-control'),'no-store');
      const html=await paused.text();assert.equal(html,await missing.text());assert.match(html,/href="\/explore\?locale=/);assert.ok(!html.includes(kitchen.pickupAddress));assert.ok(!html.includes(kitchen.nameEn));
      assert.ok(html.includes(locale==='fa-IR'?'این آشپزخانه در دسترس نیست':'This kitchen is unavailable'));
    }
    assert.equal((await a.cook('/api/cook/kitchen',kitchen,'PUT')).status,200);assert.equal((await fetch(a.base+'/kitchens/'+a.cookId)).status,200);
  }finally{await a.close();}
});

for(const libsql of [false,true])test(`booked schedule edits preserve existing orders and reject stale or smaller capacity (${libsql?'libSQL':'SQLite'})`,async()=>{
  const a=await start(libsql);try{
    const created=await a.cook('/api/cook/slots',{startIso:new Date(Date.now()+4*3600000).toISOString(),endIso:new Date(Date.now()+5*3600000).toISOString(),capacity:3,cutoffMinutes:30,mode:'pickup'});assert.equal(created.status,201);const slot=created.data.slot;
    const order=await a.order({scheduledSlotId:slot.id});await a.order({scheduledSlotId:slot.id});
    const input={...slot,expectedVersion:slot.version};
    assert.equal((await a.cook('/api/cook/slots/'+slot.id,{...input,capacity:1},'PUT')).status,409);
    assert.equal((await a.cook('/api/cook/slots/'+slot.id,{...input,startIso:new Date(Date.parse(slot.startIso)+60000).toISOString()},'PUT')).status,409);
    assert.equal((await a.customer('/api/cook/slots/'+slot.id,{...input,capacity:4},'PUT')).status,403);
    const saved=await a.cook('/api/cook/slots/'+slot.id,{...input,capacity:4,cutoffMinutes:45},'PUT');assert.equal(saved.status,200,JSON.stringify(saved.data));assert.equal(saved.data.slot.version,slot.version+1);assert.equal(saved.data.slot.bookedCount,2);
    assert.equal((await a.cook('/api/cook/slots/'+slot.id,{...input,capacity:5},'PUT')).status,409);
    assert.equal(a.db.prepare('SELECT scheduled_start_iso FROM orders WHERE id=?').get(order.id).scheduled_start_iso,slot.startIso);
    assert.equal(a.db.prepare('SELECT capacity FROM fulfillment_slots WHERE id=?').get(slot.id).capacity,4);
    initializeSchema(a.db);assert.equal(a.db.prepare('SELECT edit_version FROM fulfillment_slots WHERE id=?').get(slot.id).edit_version,2);
  }finally{await a.close();}
});

test('used promotion edits retain order discounts and terms while extending future limits',async()=>{
  const a=await start();try{
    const created=await a.cook('/api/cook/coupons',{code:'RETAIN10',kind:'percent',value:10,minimumCents:0,maxUses:10,perCustomer:5,startsIso:new Date(Date.now()-60000).toISOString(),endsIso:new Date(Date.now()+86400000).toISOString()});const coupon=created.data.coupon;
    const order=await a.order({couponCode:coupon.code});await a.order({couponCode:coupon.code});const input={...coupon,expectedVersion:coupon.version};
    assert.equal((await a.cook('/api/cook/coupons/'+coupon.id,{...input,value:20},'PUT')).status,409);
    assert.equal((await a.cook('/api/cook/coupons/'+coupon.id,{...input,maxUses:1},'PUT')).status,409);
    assert.equal((await a.cook('/api/cook/coupons/'+coupon.id,{...input,code:'DIFFERENT'},'PUT')).status,409);
    const saved=await a.cook('/api/cook/coupons/'+coupon.id,{...input,maxUses:12,endsIso:new Date(Date.now()+2*86400000).toISOString()},'PUT');assert.equal(saved.status,200,JSON.stringify(saved.data));assert.equal(saved.data.coupon.version,2);
    const snapshot=a.db.prepare('SELECT total_cents,discount_cents FROM orders WHERE id=?').get(order.id);assert.equal(snapshot.total_cents,900);assert.equal(snapshot.discount_cents,100);
    assert.equal((await a.cook('/api/cook/coupons/'+coupon.id,input,'PUT')).status,409);
  }finally{await a.close();}
});

test('an edited unbooked window rejects an old quote while a committed retry keeps its order',async()=>{
  const a=await start();try{
    const created=await a.cook('/api/cook/slots',{startIso:new Date(Date.now()+4*3600000).toISOString(),endIso:new Date(Date.now()+5*3600000).toISOString(),capacity:3,cutoffMinutes:30,mode:'pickup'});const slot=created.data.slot;
    const changed=await a.cook('/api/cook/slots/'+slot.id,{...slot,expectedVersion:slot.version,startIso:new Date(Date.parse(slot.startIso)+3600000).toISOString(),endIso:new Date(Date.parse(slot.endIso)+3600000).toISOString()},'PUT');assert.equal(changed.status,200);const next=changed.data.slot;
    const dishId=a.db.prepare('SELECT id FROM dish_slots WHERE cook_id=?').get(a.cookId).id;
    const stale=await a.customer('/api/customer/orders',{cookId:a.cookId,items:[{dishId,quantity:1}],fulfillmentType:'pickup',simulatedPaymentMethod:'SIMULATED_CARD',idempotencyKey:'schedule-race',scheduledSlotId:slot.id,expectedScheduledSlotVersion:slot.version});
    assert.equal(stale.status,409);assert.equal(a.db.prepare('SELECT count(*) AS n FROM orders').get().n,0);
    const input={idempotencyKey:'schedule-race',scheduledSlotId:slot.id,expectedScheduledSlotVersion:next.version};const order=await a.order(input);
    assert.equal(a.db.prepare('SELECT scheduled_start_iso FROM orders WHERE id=?').get(order.id).scheduled_start_iso,next.startIso);
    assert.equal((await a.cook('/api/cook/slots/'+slot.id,{...next,capacity:5,expectedVersion:next.version},'PUT')).status,200);
    assert.equal((await a.order(input)).id,order.id);
  }finally{await a.close();}
});

test('customer history is paginated, cook-scoped and excludes private contact and address data',async()=>{
  const a=await start();try{
    for(let i=0;i<21;i++)await a.order();
    const customerId=a.db.prepare("SELECT id FROM users WHERE email_private='customer@example.test'").get().id;
    const reference=(await a.cook('/api/cook/business')).data.business.customers[0].id;assert.notEqual(reference,customerId);
    const page1=await a.cook('/api/cook/customers/'+reference),page2=await a.cook('/api/cook/customers/'+reference+'?page=2');
    assert.equal(page1.status,200,JSON.stringify(page1.data));assert.equal(page1.data.history.orders.length,20);assert.equal(page2.data.history.orders.length,1);assert.equal(page1.data.history.pageCount,2);assert.equal(page1.data.history.customer.orderCount,21);
    assert.equal(new Set([...page1.data.history.orders,...page2.data.history.orders].map(o=>o.id)).size,21);
    assert.doesNotMatch(JSON.stringify(page1.data),/customer@example|Private Test Street|phone|deliveryAddress|customerNotes/);
    assert.equal((await a.customer('/api/cook/customers/'+reference)).status,403);assert.equal((await a.anonymous('/api/cook/customers/'+customerId)).status,401);
    const foreign=await a.register('COOK','foreign@example.test');await foreign('/api/cook/kitchen',kitchen,'PUT');assert.equal((await foreign('/api/cook/customers/'+customerId)).status,404);
  }finally{await a.close();}
});

for(const libsql of [false,true])test(`kitchen identity is opt-in and image privacy survives re-encoding (${libsql?'libSQL':'SQLite'})`,async()=>{
  const a=await start(libsql);try{
    const initial=await a.anonymous('/api/public/kitchens/'+a.cookId);assert.equal(initial.data.kitchen.identity.publicName,'');
    for(const link of ['javascript:alert(1)','https://instagram.com.evil.invalid/profile','https://name:password@instagram.com/profile'])assert.equal((await a.cook('/api/cook/identity',{publicName:'Synthetic cook',links:{instagram:link}},'PUT')).status,400);
    assert.equal((await a.customer('/api/cook/identity',{publicName:'No',links:{}},'PUT')).status,403);
    const name='<img src=x onerror=alert(1)>';assert.equal((await a.cook('/api/cook/identity',{publicName:name,links:{youtube:'https://www.youtube.com/'}},'PUT')).status,200);
    const png=await sharp({create:{width:20,height:16,channels:3,background:'#224433'}}).withMetadata({exif:{IFD0:{Artist:'SYNTHETIC TEST'}}}).png().toBuffer();assert.ok((await sharp(png).metadata()).exif);
    const image=await a.cook('/api/cook/identity/cover',{imageBase64:png.toString('base64'),isSample:true},'PUT');assert.equal(image.status,200,JSON.stringify(image.data));assert.equal(image.data.identity.coverIsSample,true);
    const url=image.data.identity.coverUrl;const bytes=await a.anonymous(url);assert.equal(bytes.status,200);assert.equal(bytes.headers.get('content-type'),'image/jpeg');const info=await sharp(Buffer.from(bytes.data)).metadata();assert.equal(info.width,20);assert.equal(info.exif,undefined);
    const storefront=Buffer.from((await a.anonymous('/kitchens/'+a.cookId)).data).toString();assert.ok(storefront.includes('&lt;img'));assert.ok(!storefront.includes('<img src=x onerror'));assert.ok(storefront.includes('kitchen-social'));
    await a.cook('/api/cook/kitchen',{...kitchen,isPublished:false},'PUT');assert.equal((await a.anonymous(url)).status,404);const owner=await a.cook(url);assert.equal(owner.status,200);assert.equal(owner.headers.get('cache-control'),'private, no-store');
    initializeSchema(a.db);assert.equal(a.db.prepare('SELECT count(*) AS n FROM kitchen_images').get().n,1);
  }finally{await a.close();}
});
