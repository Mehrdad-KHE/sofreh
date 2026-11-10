import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import Database from 'libsql';
import {initializeSchema} from '../packages/backend/src/db.mjs';
import {createIdentityProvider} from '../packages/backend/src/identity.mjs';
import {remoteDatabaseOptions} from '../packages/backend/src/remote.mjs';
import {createSofrehHttpServer} from '../packages/backend/src/server.mjs';

const transport=process.env.SOFREH_LIBSQL_TEST_URL;
if(process.env.GITHUB_ACTIONS!=='true'||!/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(transport||''))throw new Error('Use the isolated CI database transport.');
const secret=randomBytes(48).toString('hex');
async function start({migrate=false}={}){
  const db=new Database(transport);db.exec('PRAGMA foreign_keys=ON');
  if(migrate)initializeSchema(db);
  const identityProvider={};const {server}=createSofrehHttpServer({database:db,seedFixtures:false,identityProvider});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try{Object.assign(identityProvider,await createIdentityProvider({db,baseURL:base,secret,databaseOptions:remoteDatabaseOptions(db),runMigrations:migrate}));}
  catch(error){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();throw error;}
  function client(){let cookie='';return async(route,body,method=body?'POST':'GET')=>{
    const response=await fetch(base+route,{method,headers:{Origin:base,Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    if(response.headers.getSetCookie().length)cookie=response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
    return {status:response.status,data:await response.json()};
  };}
  let closed=false;
  return {db,base,client,async close(){if(closed)return;closed=true;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();}};
}
async function register(client,email,role){
  assert.equal((await client('/api/auth/sign-up/email',{name:'Transport test',email,password:'Transport test account 42!'})).status,200);
  const profile=await client('/api/account/setup',{role,locale:'en-CA'});assert.equal(profile.status,200);return profile.data.account;
}

test('independent account servers share remote orders, photos, stock and a last-portion race',{timeout:60000},async()=>{
  const a=await start({migrate:true});let b;
  try{
    b=await start();const cook=a.client(),customer=b.client();
    await register(cook,'transport-cook@example.test','COOK');await register(customer,'transport-customer@example.test','CUSTOMER');
    const kitchen=(await cook('/api/cook/kitchen',{nameEn:'Transport kitchen',nameFa:'آشپزخانه آزمون',bioEn:'Shared server test',bioFa:'آزمون سرور مشترک',
      area:'willowdale',pickupAddress:'123 Synthetic Pickup Street',pickupWindowEn:'17–19',pickupWindowFa:'۱۷ تا ۱۹',fulfillmentMode:'both',deliveryFeeCents:450,deliveryRadiusKm:5},'PUT'));
    assert.equal(kitchen.status,200);
    const cookId=kitchen.data.kitchen.id;
    const dish=(await cook('/api/cook/dishes',{titleEn:'Transport soup',titleFa:'آش آزمون',descriptionEn:'Test meal',descriptionFa:'غذای آزمون',
      priceCents:1299,remainingPortions:2,serviceWindowStartIso:new Date().toISOString(),serviceWindowEndIso:new Date(Date.now()+86400000).toISOString(),allergens:['wheat'],availabilityMode:'TODAY_AVAILABLE'},'PUT'));
    assert.equal(dish.status,200);const dishId=dish.data.dish.id;
    const {default:sharp}=await import('sharp');const png=await sharp({create:{width:12,height:12,channels:3,background:'#23392f'}}).png().toBuffer();
    const photo=await cook(`/api/cook/dishes/${dishId}/photo`,{imageBase64:png.toString('base64')},'PUT');assert.equal(photo.status,200);
    const image=await fetch(b.base+photo.data.photoUrl);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/jpeg');
    assert.equal((await customer('/api/customer/cart/items',{cookId,dishId,quantity:1,fulfillmentType:'pickup'})).status,200);
    const first=await customer('/api/customer/orders',{simulatedPaymentMethod:'SIMULATED_CARD',idempotencyKey:'remote-transport-first'});assert.equal(first.status,201);
    assert.equal(first.data.order.pickupAddressReleased,null);
    assert.equal((await cook(`/api/cook/kitchen/${cookId}/orders`)).data.orders[0].id,first.data.order.id);
    assert.equal((await cook(`/api/cook/orders/${first.data.order.id}/status`,{nextStatus:'ACCEPTED'})).status,200);
    assert.equal((await customer(`/api/customer/orders/${first.data.order.id}`)).data.order.pickupAddressReleased,'123 Synthetic Pickup Street');
    const raceA=await register(a.client(),'race-a@example.test','CUSTOMER'),raceB=await register(b.client(),'race-b@example.test','CUSTOMER');
    const attempt=userId=>new Promise((resolve,reject)=>{
      const worker=new Worker(new URL('./remoteOrderWorker.mjs',import.meta.url),{workerData:{url:transport,userId,cookId,dishId,key:'race-'+userId},execArgv:[]});
      worker.once('message',resolve);worker.once('error',reject);worker.once('exit',code=>{if(code!==0)reject(new Error('Race worker failed'));});
    });
    const results=await Promise.all([attempt(raceA.id),attempt(raceB.id)]);
    assert.equal(results.filter(value=>value.ok).length,1,JSON.stringify(results));
    assert.equal(results.find(value=>!value.ok).code,'INSUFFICIENT_PORTIONS');
    assert.equal(a.db.prepare('SELECT remaining_portions FROM dish_slots WHERE id=?').get(dishId).remaining_portions,0);
    assert.equal(a.db.prepare('PRAGMA foreign_key_check').all().length,0);
    const orderId=first.data.order.id;
    await b.close();b=null;await a.close();
    const reopened=new Database(transport);try{assert.equal(reopened.prepare('SELECT status FROM orders WHERE id=?').get(orderId).status,'ACCEPTED');}
    finally{reopened.close();}
  }finally{if(b)await b.close();await a.close();}
});
