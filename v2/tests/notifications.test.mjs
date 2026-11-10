import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openSofrehDatabase,withImmediateTransaction} from '../packages/backend/src/db.mjs';
import {seedSyntheticStage1Data,authenticateByToken,createOrderTransactional,transitionOrderStatusTransactional} from '../packages/backend/src/service.mjs';
import {savePushSubscription,removePushSubscription,deliverNotifications,enqueueOrderNotification} from '../packages/backend/src/notifications.mjs';

const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/testing-only',keys:{p256dh:'B'.repeat(87),auth:'a'.repeat(22)}};
test('Edge Windows push endpoints are accepted without allowing lookalike or private hosts',()=>{
  const db=openSofrehDatabase(':memory:');try{
    seedSyntheticStage1Data(db);const cook=authenticateByToken(db,'test-token-cook-pari');
    assert.equal(savePushSubscription(db,cook,{subscription:{...subscription,endpoint:'https://wns2-db5p.notify.windows.com/w/?token=synthetic'}}).subscribed,true);
    for(const endpoint of ['https://wns2-db5p.notify.windows.com.attacker.example/w/','https://attacker-notify.windows.com/w/','https://127.0.0.1/w/','http://wns2-db5p.notify.windows.com/w/'])
      assert.throws(()=>savePushSubscription(db,cook,{subscription:{...subscription,endpoint}}),/Unsupported/);
  }finally{db.close();}
});
test('notification jobs follow committed orders, retry after failure and remove expired subscriptions',async()=>{
  const db=openSofrehDatabase(':memory:');try{
    seedSyntheticStage1Data(db);
    const customer=authenticateByToken(db,'test-token-customer-nima'),cook=authenticateByToken(db,'test-token-cook-pari');
    assert.throws(()=>savePushSubscription(db,null,{subscription}),/sign in/);
    assert.throws(()=>savePushSubscription(db,cook,{subscription:{...subscription,endpoint:'https://127.0.0.1/internal'}}),/Unsupported/);
    savePushSubscription(db,cook,{subscription});
    const dish=db.prepare("SELECT id,cook_id FROM dish_slots WHERE cook_id='cook-test-pari' AND availability_mode='TODAY_AVAILABLE' AND remaining_portions>0 LIMIT 1").get();
    assert.throws(()=>withImmediateTransaction(db,()=>{db.prepare('UPDATE dish_slots SET remaining_portions=0 WHERE id=?').run(dish.id);throw new Error('rollback');}),/rollback/);
    assert.equal(db.prepare('SELECT count(*) AS n FROM notification_jobs').get().n,0);
    const order=createOrderTransactional(db,customer,{cookId:dish.cook_id,items:[{dishId:dish.id,quantity:1}],fulfillmentType:'pickup',idempotencyKey:'notify-once'});
    createOrderTransactional(db,customer,{cookId:dish.cook_id,items:[{dishId:dish.id,quantity:1}],fulfillmentType:'pickup',idempotencyKey:'notify-once'});
    assert.equal(db.prepare('SELECT count(*) AS n FROM notification_jobs').get().n,1);
    const now=Date.now()+100;
    await deliverNotifications(db,{now,send:async()=>{throw new Error('network unavailable');}});
    assert.equal(db.prepare('SELECT attempts FROM notification_jobs').get().attempts,1);
    let calls=0;await deliverNotifications(db,{now:now+1,send:async()=>{calls++;}});assert.equal(calls,0);
    await deliverNotifications(db,{now:now+16000,send:async(sub,payload)=>{calls++;assert.equal(sub.endpoint,subscription.endpoint);assert.ok(!payload.includes('Private'));}});
    assert.equal(calls,1);assert.equal(db.prepare('SELECT done FROM notification_jobs').get().done,1);
    withImmediateTransaction(db,()=>enqueueOrderNotification(db,cook.id,order.id,'ACCEPTED'));
    let release;const pause=new Promise(resolve=>release=resolve);let leasedCalls=0;
    const first=deliverNotifications(db,{now:now+20000,send:async()=>{leasedCalls++;await pause;}});
    await deliverNotifications(db,{now:now+20000,send:async()=>{leasedCalls++;}});release();await first;assert.equal(leasedCalls,1);
    savePushSubscription(db,customer,{subscription:{...subscription,endpoint:subscription.endpoint+'-customer'}});
    transitionOrderStatusTransactional(db,cook,{orderId:order.id,nextStatus:'ACCEPTED'});
    await deliverNotifications(db,{now:now+30000,send:async()=>{throw Object.assign(new Error('gone'),{statusCode:410});}});
    assert.equal(db.prepare('SELECT count(*) AS n FROM push_subscriptions WHERE user_id=?').get(customer.id).n,0);
    removePushSubscription(db,customer,subscription.endpoint);assert.equal(db.prepare('SELECT count(*) AS n FROM push_subscriptions').get().n,1);
  }finally{db.close();}
});
