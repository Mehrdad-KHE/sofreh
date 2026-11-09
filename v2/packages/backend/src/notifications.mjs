import { createHash } from 'node:crypto';
import { SofrehGuardError } from './privacy.mjs';

function requireAccount(user){if(!user?.id)throw new SofrehGuardError('UNAUTHENTICATED','Please sign in.',401);}
export function savePushSubscription(db,user,input){
  requireAccount(user);const subscription=input.subscription;
  let url;try{url=new URL(subscription?.endpoint);}catch{throw new SofrehGuardError('INVALID_SUBSCRIPTION','Invalid push subscription.',400);}
  const hosts=['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'];
  if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash||!hosts.includes(url.hostname)||url.href.length>2500)throw new SofrehGuardError('INVALID_SUBSCRIPTION','Unsupported push service.',400);
  if(!/^[A-Za-z0-9_-]{80,100}$/.test(subscription.keys?.p256dh)||!/^[A-Za-z0-9_-]{20,30}$/.test(subscription.keys?.auth))throw new SofrehGuardError('INVALID_SUBSCRIPTION','Invalid push keys.',400);
  const count=db.prepare('SELECT count(*) AS n FROM push_subscriptions WHERE user_id=?').get(user.id).n;
  if(count>=10&&!db.prepare('SELECT endpoint FROM push_subscriptions WHERE endpoint=? AND user_id=?').get(url.href,user.id))throw new SofrehGuardError('SUBSCRIPTION_LIMIT','Too many devices.',409);
  db.prepare(`INSERT INTO push_subscriptions(endpoint,user_id,subscription_json,updated_at_iso) VALUES(?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,subscription_json=excluded.subscription_json,updated_at_iso=excluded.updated_at_iso`)
    .run(url.href,user.id,JSON.stringify({endpoint:url.href,keys:subscription.keys}),new Date().toISOString());
  return {subscribed:true};
}
export function removePushSubscription(db,user,endpoint){requireAccount(user);db.prepare('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?').run(String(endpoint),user.id);return {subscribed:false};}

// Called within the same transaction as the order. A failed/rolled-back order
// cannot leave a notification. Per-device event keys prevent repeat delivery.
export function enqueueOrderNotification(db,userId,orderId,status){
  const user=db.prepare('SELECT role,preferred_locale FROM users WHERE id=?').get(userId);if(!user)return;
  const fa=user.preferred_locale==='fa-IR';
  const payload={title:fa?'سفره':'Sofreh',body:fa?'وضعیت سفارش شما به‌روز شده است.':'There is an update to your orders.',
    url:'/app/'+(user.role==='COOK'?'cook':'customer')+'?locale='+user.preferred_locale,tag:'sofreh-'+orderId};
  for(const subscription of db.prepare('SELECT endpoint FROM push_subscriptions WHERE user_id=?').all(userId)){
    const id=createHash('sha256').update(`${orderId}:${status}:${subscription.endpoint}`).digest('hex');
    db.prepare('INSERT OR IGNORE INTO notification_jobs(id,user_id,endpoint,payload_json,next_attempt_ms) VALUES(?,?,?,?,?)')
      .run(id,userId,subscription.endpoint,JSON.stringify(payload),Date.now());
  }
}

export async function deliverNotifications(db,{vapid,send,now=Date.now()}={}){
  const sender=send||((await import('web-push')).sendNotification);
  const jobs=db.prepare(`SELECT j.*,s.subscription_json FROM notification_jobs j JOIN push_subscriptions s ON s.endpoint=j.endpoint AND s.user_id=j.user_id
    WHERE j.done=0 AND j.next_attempt_ms<=? AND j.lease_until_ms<=? AND j.attempts<5 ORDER BY j.next_attempt_ms LIMIT 20`).all(now,now);
  for(const job of jobs){
    const claimed=db.prepare('UPDATE notification_jobs SET lease_until_ms=? WHERE id=? AND done=0 AND lease_until_ms<=?').run(now+60000,job.id,now);
    if(claimed.changes!==1)continue;
    try{await sender(JSON.parse(job.subscription_json),job.payload_json,{vapidDetails:vapid,TTL:3600,urgency:'high',timeout:5000});
      db.prepare('UPDATE notification_jobs SET done=1,attempts=attempts+1,lease_until_ms=0 WHERE id=?').run(job.id);
    }catch(error){if([404,410].includes(error.statusCode)){db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(job.endpoint);}
      else db.prepare('UPDATE notification_jobs SET attempts=attempts+1,next_attempt_ms=?,lease_until_ms=0 WHERE id=?').run(now+Math.min(3600000,15000*2**job.attempts),job.id);
    }
  }
  db.prepare('DELETE FROM notification_jobs WHERE done=1 AND next_attempt_ms<?').run(now-7*86400000);
}

export function startNotificationWorker(db,vapid){let running=false;const tick=async()=>{if(running)return;running=true;try{await deliverNotifications(db,{vapid});}catch{console.error('Sofreh notification delivery failed; jobs remain queued.');}finally{running=false;}};
  const timer=setInterval(tick,5000);timer.unref();return async()=>{clearInterval(timer);while(running)await new Promise(resolve=>setTimeout(resolve,20));};
}
