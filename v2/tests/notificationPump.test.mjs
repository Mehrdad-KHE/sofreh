import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createECDH} from 'node:crypto';
import {openSofrehDatabase,withImmediateTransaction} from '../packages/backend/src/db.mjs';
import {seedSyntheticStage1Data,authenticateByToken} from '../packages/backend/src/service.mjs';
import {savePushSubscription,enqueueOrderNotification,deliverNotifications} from '../packages/backend/src/notifications.mjs';
import {createNotificationPump,hostedPushConfiguration,NOTIFICATION_TOPIC} from '../packages/backend/src/notificationPump.mjs';

test('a durable private tick is scheduled before delivery, independent request relays are throttled, and publication failure can retry',async()=>{
  const db=openSofrehDatabase(':memory:');let now=180000,calls=0,deliveries=0,fail=false;
  const messages=[];const publish=async(topic,payload,options)=>{calls++;assert.equal(topic,NOTIFICATION_TOPIC);if(fail)throw new Error('queue unavailable');messages.push({payload,options});};
  const first=createNotificationPump({db,publish,clock:()=>now,deliver:async()=>{deliveries++;assert.equal(messages.at(-1).options.delaySeconds,60);}});
  const second=createNotificationPump({db,publish,clock:()=>now});
  try{
    await Promise.all([first.wake(),second.wake()]);assert.equal(calls,1);assert.deepEqual(messages[0].payload,{version:1});
    await first.consume({version:1});assert.equal(deliveries,1);assert.equal(messages[1].options.retentionSeconds,604800);
    assert.notEqual(messages[0].options.idempotencyKey,messages[1].options.idempotencyKey);
    await first.wake();assert.equal(calls,2);
    now+=60000;fail=true;await assert.rejects(first.wake(),/queue unavailable/);
    assert.equal(db.prepare('SELECT lease_until_ms FROM notification_pump').get().lease_until_ms,0);
    fail=false;await first.wake();assert.equal(calls,4);
    fail=true;await assert.rejects(first.consume({version:1}),/queue unavailable/);assert.equal(deliveries,1);
    await assert.rejects(first.consume({version:2}),/Unsupported/);
  }finally{db.close();}
});

test('hosting advertises browser push only with explicit serverless delivery and a complete persistent key pair',()=>{
  assert.equal(hostedPushConfiguration({},'https://sofreh.example'),null);
  const key=createECDH('prime256v1');key.generateKeys();
  const config={VERCEL:'1',SOFREH_NOTIFICATION_DELIVERY:'vercel-queue',SOFREH_VAPID_PUBLIC_KEY:key.getPublicKey().toString('base64url'),SOFREH_VAPID_PRIVATE_KEY:key.getPrivateKey().toString('base64url')};
  assert.throws(()=>hostedPushConfiguration({...config,VERCEL:''},'https://sofreh.example'));
  assert.throws(()=>hostedPushConfiguration({...config,SOFREH_VAPID_PRIVATE_KEY:''},'https://sofreh.example'));
  assert.throws(()=>hostedPushConfiguration({...config,SOFREH_VAPID_PRIVATE_KEY:'a'.repeat(43)},'https://sofreh.example'),/matching/);
  assert.equal(hostedPushConfiguration(config,'https://sofreh.example').subject,'https://sofreh.example');
});

test('a stale competing notification snapshot cannot bypass retry backoff',async()=>{
  const db=openSofrehDatabase(':memory:');try{
    seedSyntheticStage1Data(db);const cook=authenticateByToken(db,'test-token-cook-pari');
    savePushSubscription(db,cook,{subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/lease-test',keys:{p256dh:'B'.repeat(87),auth:'a'.repeat(22)}}});
    withImmediateTransaction(db,()=>{enqueueOrderNotification(db,cook.id,'order-lease-1','PENDING');enqueueOrderNotification(db,cook.id,'order-lease-2','PENDING');});
    let now=Date.now()+100;const initial=now;let sends=0;
    await deliverNotifications(db,{now:initial,clock:()=>now,send:async()=>{
      sends++;
      if(sends===1){
        now+=70000;
        // A competing consumer fails the other job while the first send is in flight.
        const other=db.prepare('SELECT id FROM notification_jobs WHERE lease_until_ms=0').get();
        db.prepare('UPDATE notification_jobs SET attempts=1,next_attempt_ms=? WHERE id=?').run(now+15000,other.id);
      }
    }});
    assert.equal(sends,1);
    now+=16000;await deliverNotifications(db,{now,clock:()=>now,send:async()=>{
      sends++;const lease=db.prepare('SELECT lease_until_ms FROM notification_jobs WHERE done=0').get().lease_until_ms;
      assert.equal(lease,now+60000);
    }});
    assert.equal(sends,2);assert.equal(db.prepare('SELECT count(*) AS n FROM notification_jobs WHERE done=1').get().n,2);
  }finally{db.close();}
});

test('a slow notification batch gives its later job a new full delivery lease',async()=>{
  const db=openSofrehDatabase(':memory:');try{
    seedSyntheticStage1Data(db);const cook=authenticateByToken(db,'test-token-cook-pari');
    savePushSubscription(db,cook,{subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/batch-lease-test',keys:{p256dh:'B'.repeat(87),auth:'a'.repeat(22)}}});
    enqueueOrderNotification(db,cook.id,'batch-order-1','PENDING');enqueueOrderNotification(db,cook.id,'batch-order-2','PENDING');
    let now=Date.now()+100;let sent=0;
    await deliverNotifications(db,{now,clock:()=>now,send:async()=>{
      sent++;if(sent===1)now+=70000;
      else assert.equal(db.prepare('SELECT lease_until_ms FROM notification_jobs WHERE done=0').get().lease_until_ms,now+60000);
    }});
    assert.equal(sent,2);
  }finally{db.close();}
});
