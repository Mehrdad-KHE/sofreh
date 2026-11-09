import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {sourceRoot,runtimeRoot,node24,npmCli} from './runtime-source.mjs';

const role=process.argv[2];if(!['CUSTOMER','COOK'].includes(role))throw new Error('Pass CUSTOMER or COOK.');
const origin=new URL(process.env.SOFREH_APP_ORIGIN||'');if(origin.protocol!=='https:'||origin.pathname!=='/')throw new Error('An HTTPS SOFREH_APP_ORIGIN is required.');
const target=path.join(runtimeRoot,'native','shared');fs.mkdirSync(target,{recursive:true});
const temp=path.join(runtimeRoot,'native','temp');fs.mkdirSync(temp,{recursive:true});
fs.cpSync(path.join(sourceRoot,'apps/native'),target,{recursive:true,filter:file=>!['node_modules','.expo','android','ios','dist'].includes(path.basename(file))});
const node=node24();
const env={...process.env,SOFREH_APP_ROLE:role,SOFREH_APP_ORIGIN:origin.origin,EXPO_NO_TELEMETRY:'1',EXPO_OFFLINE:'1',__UNSAFE_EXPO_HOME_DIRECTORY:path.join(runtimeRoot,'expo-home'),CI:'1',npm_config_cache:path.join(runtimeRoot,'npm-cache'),TEMP:temp,TMP:temp,PATH:path.dirname(node)+path.delimiter+process.env.PATH};
// Build role variants sequentially in one runtime project. This avoids a
// second dependency tree and Windows prebuild issues with junctioned modules.
const install=spawnSync(node,[npmCli(),'install','--ignore-scripts','--no-audit','--no-fund'],{cwd:target,env,stdio:'inherit',windowsHide:true});
if(install.error)throw install.error;if(install.status!==0)process.exit(install.status??1);
const result=spawnSync(node,[path.join(target,'node_modules/expo/bin/cli'),'prebuild','--no-install','--platform','android'],{cwd:target,env,stdio:'inherit',windowsHide:true});
if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);
console.log(`Native source prepared internally at ${target}. This is not a compiled or accepted app.`);
