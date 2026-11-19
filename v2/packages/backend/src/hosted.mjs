import {fromNodeHeaders} from 'better-auth/node';
import {ipAddress,waitUntil} from '@vercel/functions';
import {QueueClient} from '@vercel/queue';
import {createSofrehHttpServer} from './server.mjs';
import {createIdentityProvider} from './identity.mjs';
import {openRemoteDatabase,remoteDatabaseOptions,validateRemoteConnection} from './remote.mjs';
import {createNotificationPump,hostedPushConfiguration} from './notificationPump.mjs';

export function hostedConfiguration(env) {
  const mode=env.SOFREH_RUNTIME_MODE||'fixtures';
  if(mode==='fixtures')return {mode};
  if(mode!=='accounts')throw new Error('Unsupported hosted runtime mode.');
  const connection=validateRemoteConnection({url:env.TURSO_DATABASE_URL,authToken:env.TURSO_AUTH_TOKEN});
  let origin;try{origin=new URL(env.SOFREH_PUBLIC_ORIGIN);}catch{throw new Error('Configure the public application origin.');}
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)
    throw new Error('Configure an HTTPS application origin without a path.');
  if(typeof env.SOFREH_AUTH_SECRET!=='string'||env.SOFREH_AUTH_SECRET.length<32)throw new Error('Configure a persistent authentication secret.');
  return {mode,connection,baseURL:origin.origin,secret:env.SOFREH_AUTH_SECRET,vapid:hostedPushConfiguration(env,origin.origin)};
}

export async function createHostedRuntime(env=process.env,{connect=openRemoteDatabase}={}) {
  const config=hostedConfiguration(env);
  if(config.mode==='fixtures')return createSofrehHttpServer({dbFilePath:'/tmp/sofreh-stage1.sqlite'});
  const db=connect(config.connection);
  try {
    const identityProvider=await createIdentityProvider({db,baseURL:config.baseURL,secret:config.secret,
      databaseOptions:remoteDatabaseOptions(db),runMigrations:false,
      // Only this Vercel adapter trusts Vercel's proxy-computed x-real-ip.
      clientIPAddress:req=>env.VERCEL==='1'?ipAddress(fromNodeHeaders(req.headers)):null});
    // Fail before accepting traffic if explicit schema initialization was missed.
    for(const table of ['user','session','account','verification','rateLimit'])db.prepare(`SELECT 1 FROM "${table}" LIMIT 1`).get();
    let notificationPump;
    if(config.vapid){
      if(!db.prepare('SELECT id FROM notification_pump WHERE id=1').get())throw new Error('Initialize the notification relay before enabling delivery.');
      const queue=new QueueClient();
      notificationPump=createNotificationPump({db,vapid:config.vapid,publish:queue.send.bind(queue)});
    }
    return {...createSofrehHttpServer({database:db,seedFixtures:false,identityProvider,pushPublicKey:config.vapid?.publicKey}),notificationPump};
  }catch(error){db.close();throw error;}
}

export function restoreRewrittenPath(req) {
  const url=new URL(req.url||'/','http://127.0.0.1');
  if(!['/api/index','/api/index.mjs'].includes(url.pathname)||!url.searchParams.has('path'))return;
  const pathname=url.searchParams.get('path');
  if(!pathname.startsWith('/')||pathname.startsWith('//')||/[\\?#\u0000-\u0020]/.test(pathname))throw new Error('Invalid rewritten path.');
  url.searchParams.delete('path');
  const query=url.searchParams.toString();
  req.url=pathname+(query?'?'+query:'');
}

export function createHostedHandler({initialize=()=>createHostedRuntime(),background=waitUntil,report=()=>console.error('Sofreh runtime initialization failed.')}={}) {
  let runtimePromise;
  async function runtime(){
    if(!runtimePromise)runtimePromise=Promise.resolve().then(initialize).catch(error=>{runtimePromise=undefined;throw error;});
    return runtimePromise;
  }
  return async(req,res)=>{
    try {
      restoreRewrittenPath(req);
      const {server,notificationPump}=await runtime();
      await new Promise((resolve,reject)=>{
        if(notificationPump)res.once('finish',()=>background(notificationPump.wake().catch(()=>console.error('Sofreh notification relay will retry.'))));
        res.once('finish',resolve);res.once('close',resolve);res.once('error',reject);
        server.emit('request',req,res);
      });
    }catch{
      report();
      if(res.headersSent){if(!res.writableEnded)res.end();return;}
      res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Retry-After':'15'});
      res.end(JSON.stringify({error:{code:'SERVICE_UNAVAILABLE'}}));
    }
  };
}
