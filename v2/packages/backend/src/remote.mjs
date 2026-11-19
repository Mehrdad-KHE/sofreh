import Database from 'libsql';
import {SqliteDialect} from 'kysely';
import {initializeSchema} from './db.mjs';
import {createIdentityProvider} from './identity.mjs';

export function remoteDatabaseOptions(db) {
  // libsql exposes an internal `db` member. Explicit dialect configuration
  // prevents Better Auth from mistaking it for an existing Kysely instance.
  return {dialect:new SqliteDialect({database:db}),type:'sqlite',transaction:true};
}

export function validateRemoteConnection({url,authToken}={}) {
  let parsed;try{parsed=new URL(url);}catch{throw new Error('A remote database URL is required.');}
  if(!['libsql:','https:'].includes(parsed.protocol)||!parsed.hostname||parsed.username||parsed.password||parsed.search||parsed.hash||!['','/'].includes(parsed.pathname)||(parsed.port&&parsed.port!=='443'))
    throw new Error('Use a secure libSQL database origin without embedded credentials.');
  if(typeof authToken!=='string'||authToken.trim().length<10)throw new Error('A database authentication token is required.');
  return {url:parsed.href,authToken};
}

export function openRemoteDatabase(input,{initialize=false}={}) {
  const config=validateRemoteConnection(input);
  const db=new Database(config.url,{authToken:config.authToken,timeout:5000});
  try {
    db.exec('PRAGMA foreign_keys=ON');
    if(Number(db.prepare('PRAGMA foreign_keys').get().foreign_keys)!==1)throw new Error('Foreign-key enforcement is required.');
    if(initialize)initializeSchema(db);
    else if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get())throw new Error('Initialize the remote schema before activating accounts.');
    return db;
  }catch(error){db.close();throw error;}
}

export async function initializeRemoteAccounts({url,authToken,baseURL,secret}) {
  const origin=new URL(baseURL);
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')throw new Error('Configure the HTTPS public application origin.');
  if(typeof secret!=='string'||secret.length<32)throw new Error('Configure a persistent authentication secret first.');
  const db=openRemoteDatabase({url,authToken},{initialize:true});
  try{await createIdentityProvider({db,baseURL,secret,databaseOptions:remoteDatabaseOptions(db)});}
  finally{db.close();}
}
