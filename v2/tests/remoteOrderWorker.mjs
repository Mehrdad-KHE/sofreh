import {parentPort,workerData} from 'node:worker_threads';
import Database from 'libsql';
import {createOrderTransactional} from '../packages/backend/src/service.mjs';

if(!/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(workerData.url))throw new Error('Use the isolated test transport.');
const db=new Database(workerData.url);
try{
  db.exec('PRAGMA foreign_keys=ON');
  const order=createOrderTransactional(db,{id:workerData.userId,role:'CUSTOMER'},{cookId:workerData.cookId,
    items:[{dishId:workerData.dishId,quantity:1}],fulfillmentType:'pickup',idempotencyKey:workerData.key});
  parentPort.postMessage({ok:true,id:order.id});
}catch(error){parentPort.postMessage({ok:false,code:error.code,message:error.message});}
finally{db.close();}
