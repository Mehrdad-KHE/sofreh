import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync,backup} from 'node:sqlite';
import {copyRuntimeSource,runtimeRoot} from './runtime-source.mjs';

fs.mkdirSync(runtimeRoot,{recursive:true});
const root=fs.mkdtempSync(path.join(runtimeRoot,'database-backup-'));
const source=copyRuntimeSource(path.join(root,'source'),{dependencies:true});
const {default:Database}=await import(pathToFileURL(path.join(source,'node_modules/libsql/index.js')));
const {validateRemoteConnection}=await import(pathToFileURL(path.join(source,'packages/backend/src/remote.mjs')));
let replica,local,restored;
try{
  const connection=validateRemoteConnection({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
  const snapshotFile=path.join(root,'snapshot.sqlite'),restoreFile=path.join(root,'restored.sqlite');
  // The official embedded-replica sync API downloads a consistent local copy.
  // libsql's backup()/serialize() methods are not implemented in this version.
  replica=new Database(snapshotFile,{syncUrl:connection.url,authToken:connection.authToken});replica.sync();replica.close();replica=null;
  local=new DatabaseSync(snapshotFile,{readOnly:true});await backup(local,restoreFile);local.close();local=null;
  restored=new DatabaseSync(restoreFile,{readOnly:true});
  if(restored.prepare('PRAGMA quick_check').all().some(row=>Object.values(row)[0]!=='ok')||restored.prepare('PRAGMA foreign_key_check').all().length)
    throw new Error('Restore integrity check failed.');
  const counts=Object.fromEntries(['users','orders','order_items','dish_slots','dish_photos'].map(table=>[table,restored.prepare(`SELECT count(*) AS n FROM "${table}"`).get().n]));
  fs.writeFileSync(path.join(root,'verification.json'),JSON.stringify({restoreVerified:true,snapshotFile,restoreFile,counts},null,2),{mode:0o600});
  console.log(`Internal backup and verified local restore: ${root}`);
}catch{console.error('Backup verification failed. Keep this attempt internal; no credentials were printed.');process.exitCode=1;}
finally{replica?.close();local?.close();restored?.close();}
