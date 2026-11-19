import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {copyRuntimeSource,runtimeRoot,node24} from './runtime-source.mjs';

if(process.env.GITHUB_ACTIONS!=='true'||process.platform!=='linux'||!/^\d+$/.test(process.env.GITHUB_RUN_ID||''))throw new Error('Use the isolated Linux CI runner.');
fs.mkdirSync(runtimeRoot,{recursive:true});
const root=fs.mkdtempSync(path.join(runtimeRoot,'remote-ci-'));
const socket=path.join(root,'docker.sock'),pidFile=path.join(root,'dockerd.pid');
const env={...process.env,DOCKER_HOST:'unix://'+socket,SOFREH_LIBSQL_TEST_URL:'http://127.0.0.1:18080',
  TEMP:root,TMP:root,TMPDIR:root};
const log=fs.openSync(path.join(root,'dockerd.log'),'a');
const daemon=spawn('sudo',['dockerd','--host='+env.DOCKER_HOST,'--data-root='+path.join(root,'docker-data'),
  '--exec-root='+path.join(root,'docker-exec'),'--pidfile='+pidFile,'--storage-driver=vfs',
  '--iptables=false','--bridge=none','--ip-forward=false','--ip-masq=false'],{env,stdio:['ignore',log,log]});
let daemonError;daemon.on('error',error=>{daemonError=error;});
function run(command,args,{capture=false}={}){const result=spawnSync(command,args,{env,cwd:root,encoding:'utf8',stdio:capture?'pipe':'inherit'});
  if(result.error)throw result.error;if(result.status!==0)throw new Error(`${command} exited ${result.status}`);return result.stdout?.trim();}
const container='sofreh-libsql-'+process.env.GITHUB_RUN_ID;let started=false;
try{
  for(let attempt=0;attempt<60&&!fs.existsSync(socket);attempt++)await new Promise(resolve=>setTimeout(resolve,500));
  if(daemonError)throw daemonError;if(!fs.existsSync(socket))throw new Error('Isolated Docker daemon did not start.');
  const image='ghcr.io/tursodatabase/libsql-server@sha256:6dd3eb276d9d3604e4a48ac4a999a2e267814732d57d7e94c04ba71482333a67';
  run('docker',['pull',image]);
  const data=path.join(root,'database');fs.mkdirSync(data,{recursive:true});
  run('docker',['run','--detach','--name',container,'--network','host','--mount',`type=bind,source=${data},target=/var/lib/sqld`,
    '-e','SQLD_HTTP_LISTEN_ADDR=127.0.0.1:18080',image]);started=true;
  let ready=false;
  for(let attempt=0;attempt<40;attempt++){try{const response=await fetch(env.SOFREH_LIBSQL_TEST_URL+'/health');if(response.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
  if(!ready)throw new Error('Isolated libSQL transport did not start.');
  const source=copyRuntimeSource(path.join(root,'source'),{dependencies:true});
  run(node24(),['--test',path.join(source,'tests/remoteTransport.integration.mjs')]);
}finally{
  if(started){try{run('docker',['logs',container]);}catch{}try{run('docker',['rm','--force',container]);}catch{}}
  if(fs.existsSync(pidFile)){const pid=fs.readFileSync(pidFile,'utf8').trim();if(/^\d+$/.test(pid))spawnSync('sudo',['kill',pid],{env,stdio:'ignore'});}
  fs.closeSync(log);
}
