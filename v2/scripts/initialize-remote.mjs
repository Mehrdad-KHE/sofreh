import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {copyRuntimeSource,runtimeRoot} from './runtime-source.mjs';

const required=['TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','SOFREH_PUBLIC_ORIGIN','SOFREH_AUTH_SECRET'];
if(required.some(name=>!process.env[name]))throw new Error('Configure the remote database, public origin and authentication secret first.');
const target=copyRuntimeSource(fs.mkdtempSync(path.join(runtimeRoot,'remote-init-')),{dependencies:true});
const {initializeRemoteAccounts}=await import(pathToFileURL(path.join(target,'packages/backend/src/remote.mjs')));
try{
  await initializeRemoteAccounts({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN,
    baseURL:process.env.SOFREH_PUBLIC_ORIGIN,secret:process.env.SOFREH_AUTH_SECRET});
  console.log('Remote schema initialized. No fixture accounts or orders were imported.');
}catch{
  console.error('Remote initialization failed. Verify the private connection configuration and schema compatibility.');
  process.exitCode=1;
}
