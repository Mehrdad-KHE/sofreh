import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

if(process.env.GITHUB_ACTIONS!=='true'||process.platform!=='darwin'||!path.isAbsolute(process.env.RUNNER_TEMP||''))throw new Error('Use a macOS GitHub runner.');
const role=process.env.SOFREH_APP_ROLE,buildRun=process.env.SOFREH_BUILD_RUN;
if(!['CUSTOMER','COOK'].includes(role)||!/^\d+$/.test(buildRun||''))throw new Error('Pass a role and build run number.');
const root=path.join(process.env.RUNNER_TEMP,'ElegantRuntime','Sofreh','simulator');
const downloads=path.join(root,'downloads'),apps=path.join(root,'apps'),devices=path.join(root,'devices'),output=path.join(root,'artifacts');
for(const dir of [root,downloads,apps,devices,output])fs.mkdirSync(dir,{recursive:true});
const env={...process.env,TEMP:root,TMP:root,TMPDIR:root};
function run(command,args){const result=spawnSync(command,args,{env,encoding:'utf8',windowsHide:true,timeout:600000});
  if(result.error)throw result.error;if(result.status!==0){console.error(result.stderr);throw new Error(`${command} exited ${result.status}`);}return result.stdout.trim();}
const sha=JSON.parse(run('gh',['run','view',buildRun,'--repo','Mehrdad-KHE/sofreh','--json','headSha'])).headSha;
if(!/^[a-f0-9]{40}$/.test(sha))throw new Error('Invalid build revision.');
run('gh',['run','download',buildRun,'--repo','Mehrdad-KHE/sofreh','--name',`internal-${role}-ios-${sha}`,'--dir',downloads]);
run('ditto',['-x','-k',path.join(downloads,`sofreh-${role.toLowerCase()}-ios-simulator.zip`),apps]);
const bundle=fs.readdirSync(apps).find(name=>name.endsWith('.app'));
if(!bundle)throw new Error('The build did not contain a simulator app.');
const app=path.join(apps,bundle),id=role==='COOK'?'ca.sofreh.cook':'ca.sofreh.customer';
if(run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIdentifier',path.join(app,'Info.plist')])!==id)throw new Error('Bundle identity mismatch.');
const sim=(...args)=>run('xcrun',['simctl','--set',devices,...args]);
const runtimes=JSON.parse(sim('list','runtimes','--json')).runtimes;
const runtime=runtimes.filter(value=>value.isAvailable&&value.identifier.includes('.iOS-')).sort((a,b)=>b.version.localeCompare(a.version,undefined,{numeric:true}))[0];
const types=JSON.parse(sim('list','devicetypes','--json')).devicetypes;
const versionParts=(runtime?.version||'0').split('.').map(Number);
const runtimeNumber=(versionParts[0]<<16)+((versionParts[1]||0)<<8)+(versionParts[2]||0);
const type=types.filter(value=>value.name.startsWith('iPhone')&&(!value.minRuntimeVersion||value.minRuntimeVersion<=runtimeNumber)&&(!value.maxRuntimeVersion||value.maxRuntimeVersion>=runtimeNumber))
  .sort((a,b)=>b.name.localeCompare(a.name,undefined,{numeric:true}))[0];
if(!runtime||!type)throw new Error('The runner has no installed iPhone simulator runtime.');
const device=sim('create','Sofreh QA',type.identifier,runtime.identifier);
if(!/^[A-Fa-f0-9-]{36}$/.test(device))throw new Error('Invalid simulator identifier.');
try{
  sim('boot',device);sim('bootstatus',device,'-b');sim('install',device,app);
  const launched=sim('launch',device,id);console.log(launched);
  await new Promise(resolve=>setTimeout(resolve,8000));
  const pid=launched.match(/:\s*(\d+)$/)?.[1];
  if(!pid)throw new Error('No application process returned.');
  run('ps',['-p',pid,'-o','comm=']);
  sim('io',device,'screenshot',path.join(output,`${role.toLowerCase()}-iphone.png`));
  let workspaceAccepted=false;
  if(process.env.SOFREH_CHECK_WORKSPACE==='true'){
    const {checkWorkspace}=await import('./check-ios-idb-ci.mjs');
    await checkWorkspace({root,output,devices,device,id,role,env});
    workspaceAccepted=true;
  }
  fs.writeFileSync(path.join(output,'launch-metadata.json'),JSON.stringify({role,applicationId:id,buildRevision:sha,buildRun,
    testRevision:process.env.GITHUB_SHA,simulator:runtime.name,deviceType:type.name,launched:true,workspaceAccepted,physicalDevice:false},null,2));
}finally{try{sim('io',device,'screenshot',path.join(output,`${role.toLowerCase()}-last-screen.png`));}catch{}try{sim('shutdown',device);}catch{}}
