import {deliverNotifications} from './notifications.mjs';
import {createECDH} from 'node:crypto';

export const NOTIFICATION_TOPIC='sofreh-notification-pump';
const intervalMs=60000;

export function createNotificationPump({db,vapid,publish,deliver=deliverNotifications,clock=Date.now}) {
  async function schedule(now,{delaySeconds=0}={}) {
    const bucket=Math.floor(now/intervalMs)+(delaySeconds?1:0);
    // Queue messages contain no account, order, address or push endpoint data.
    await publish(NOTIFICATION_TOPIC,{version:1},{idempotencyKey:`sofreh-notifications-${bucket}`,
      retentionSeconds:7*86400,delaySeconds});
  }
  return {
    async wake() {
      const now=clock();
      const claim=db.prepare('UPDATE notification_pump SET lease_until_ms=? WHERE id=1 AND wake_after_ms<=? AND lease_until_ms<=?').run(now+20000,now,now);
      if(claim.changes!==1)return;
      try{await schedule(now);db.prepare('UPDATE notification_pump SET wake_after_ms=?,lease_until_ms=0 WHERE id=1').run(now+intervalMs);}
      catch(error){db.prepare('UPDATE notification_pump SET lease_until_ms=0 WHERE id=1').run();throw error;}
    },
    async consume(message) {
      if(message?.version!==1)throw new Error('Unsupported notification message.');
      const now=clock();
      // Persist the next tick before processing. A process crash or a push
      // provider failure cannot silently end the durable outbox relay.
      await schedule(now,{delaySeconds:60});
      db.prepare('UPDATE notification_pump SET wake_after_ms=?,lease_until_ms=0 WHERE id=1').run(now+intervalMs);
      await deliver(db,{vapid});
    }
  };
}

export function hostedPushConfiguration(env,baseURL) {
  const mode=env.SOFREH_NOTIFICATION_DELIVERY||'disabled';
  if(mode==='disabled')return null;
  if(mode!=='vercel-queue'||env.VERCEL!=='1')throw new Error('Use the configured Vercel notification consumer.');
  if(!/^[A-Za-z0-9_-]{87}$/.test(env.SOFREH_VAPID_PUBLIC_KEY||'')||!/^[A-Za-z0-9_-]{43}$/.test(env.SOFREH_VAPID_PRIVATE_KEY||''))
    throw new Error('Configure persistent Web Push keys first.');
  try{
    const key=createECDH('prime256v1');key.setPrivateKey(Buffer.from(env.SOFREH_VAPID_PRIVATE_KEY,'base64url'));
    if(!key.getPublicKey().equals(Buffer.from(env.SOFREH_VAPID_PUBLIC_KEY,'base64url')))throw new Error();
  }catch{throw new Error('Configure a matching Web Push key pair.');}
  return {subject:baseURL,publicKey:env.SOFREH_VAPID_PUBLIC_KEY,privateKey:env.SOFREH_VAPID_PRIVATE_KEY};
}
