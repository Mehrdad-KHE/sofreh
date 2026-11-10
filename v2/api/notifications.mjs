import {QueueClient} from '@vercel/queue';
import {createHostedRuntime} from '../packages/backend/src/hosted.mjs';

const queue=new QueueClient();
let runtimePromise;
export default queue.handleNodeCallback(async message=>{
  if(process.env.SOFREH_RUNTIME_MODE!=='accounts'||process.env.SOFREH_NOTIFICATION_DELIVERY!=='vercel-queue')return;
  if(!runtimePromise)runtimePromise=createHostedRuntime().catch(error=>{runtimePromise=undefined;throw error;});
  const runtime=await runtimePromise;
  // Disabling account mode or delivery stops the recurring pump at its next tick.
  if(runtime.notificationPump)await runtime.notificationPump.consume(message);
},{retry:()=>({afterSeconds:30})});
