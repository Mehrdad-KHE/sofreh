import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';

// Local open-source Maestro only: no cloud service, provider account or upload.
// Credentials and raw driver reports stay in the disposable runner runtime.
const version='2.12.1';
const digest='54dbb0716425626604973cbb374c585ca30272375d9ce15177a1152765ddd9d7';
export async function checkWorkspace({root,output,devices,device,id,role,env}){
  if(process.env.GITHUB_ACTIONS!=='true'||process.platform!=='darwin'||!root.startsWith(path.resolve(process.env.RUNNER_TEMP)+path.sep))throw new Error('Use the isolated macOS CI runtime.');
  const home=path.join(root,'maestro-home'),tools=path.join(root,'tools'),debug=path.join(root,'private-driver-reports');
  for(const dir of [home,tools,debug])fs.mkdirSync(dir,{recursive:true});
  const password=randomBytes(24).toString('base64url');
  const email=`ios-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}-${role.toLowerCase()}@qa.sofreh.invalid`;
  console.log(`::add-mask::${password}`);console.log(`::add-mask::${email}`);
  const clean=text=>String(text||'').replaceAll(password,'[masked]').replaceAll(email,'[masked]');
  const driverEnv={...env,MAESTRO_CLI_NO_ANALYTICS:'true',MAESTRO_DISABLE_UPDATE_CHECK:'true',
    XDG_STATE_HOME:path.join(home,'state'),XDG_CACHE_HOME:path.join(home,'cache'),
    JAVA_TOOL_OPTIONS:`-Duser.home=${home} -Djava.io.tmpdir=${root}`,PATH:tools+path.delimiter+env.PATH};
  const run=(command,args)=>{
    const result=spawnSync(command,args,{cwd:root,env:driverEnv,encoding:'utf8',timeout:420000,maxBuffer:8*1024*1024});
    if(result.error)throw new Error(clean(result.error.message));
    if(result.status!==0){console.error(clean(result.stdout));console.error(clean(result.stderr));throw new Error(`${path.basename(command)} exited ${result.status}`);}
    return result.stdout.trim();
  };
  // Maestro's simctl calls must use the same isolated device set as the app.
  // Other xcrun subcommands (e.g. compiler discovery) retain their usual behavior.
  fs.writeFileSync(path.join(tools,'xcrun'),`#!/bin/sh\nif [ "$1" = simctl ]; then shift; exec /usr/bin/xcrun simctl --set '${devices.replaceAll("'","'\\''")}' "$@"; fi\nexec /usr/bin/xcrun "$@"\n`,{mode:0o755});
  const discovered=JSON.parse(run('xcrun',['simctl','list','devices','--json']));
  if(!Object.values(discovered.devices).flat().some(item=>item.udid===device&&item.state==='Booted'))throw new Error('The driver cannot see the isolated running device.');
  const response=await fetch(`https://github.com/mobile-dev-inc/Maestro/releases/download/cli-${version}/maestro.zip`);
  if(!response.ok)throw new Error('Maestro download failed.');
  const bytes=Buffer.from(await response.arrayBuffer());
  if(createHash('sha256').update(bytes).digest('hex')!==digest)throw new Error('Maestro checksum mismatch.');
  const archive=path.join(root,'maestro.zip');fs.writeFileSync(archive,bytes);
  run('/usr/bin/ditto',['-x','-k',archive,path.join(root,'maestro-cli')]);
  const maestro=path.join(root,'maestro-cli','maestro','bin','maestro');
  const installed=run(maestro,['--version']);
  if(!installed.includes(version))throw new Error('Unexpected Maestro version.');
  const origin='https://sofreh-v2.vercel.app';
  const signup=await fetch(origin+'/api/auth/sign-up/email',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},
    body:JSON.stringify({name:'iOS workspace check',email,password})});
  if(!signup.ok)throw new Error(`Synthetic account creation failed (${signup.status}).`);
  const cookie=signup.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  const setup=await fetch(origin+'/api/account/setup',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},
    body:JSON.stringify({role,locale:'en-CA'})});
  if(!setup.ok)throw new Error(`Synthetic role setup failed (${setup.status}).`);
  const quoted=value=>JSON.stringify(value);
  const selector=value=>quoted(value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  const wait=text=>`- extendedWaitUntil:\n    visible: ${selector(text)}\n    timeout: 60000\n`;
  const tap=text=>`- tapOn: ${selector(text)}\n`;
  const shot=name=>`- takeScreenshot: ${quoted(path.join(output,role.toLowerCase()+'-'+name))}\n`;
  let flow=`appId: ${id}\n---\n- launchApp\n`+wait('Welcome back')+tap('Email')+`- inputText: ${quoted(email)}\n`+tap('Password')+`- inputText: ${quoted(password)}\n- hideKeyboard\n- scrollUntilVisible:\n    element: "Sign in"\n    direction: DOWN\n`+tap('Sign in');
  flow+=wait(role==='COOK'?'Time to put your food on the table.':'What are you craving?')+shot('workspace-en');
  flow+=tap('Orders')+wait('Your orders');
  if(role==='COOK')flow+=tap('Menu')+wait('Create your kitchen before adding dishes.')+tap('Kitchen')+wait('Your kitchen');
  else flow+=tap('Cart')+wait('Your cart');
  flow+=tap('Account')+wait('Your account')+shot('account-en');
  flow+=tap('فارسی')+wait('حساب شما')+shot('account-fa');
  flow+='- stopApp\n- launchApp\n'+wait(role==='COOK'?'وقت چیدن سفره توست.':'هوس چه غذایی کرده‌ای؟')+shot('session-reopened');
  const flowPath=path.join(root,'private-workspace-flow.yaml');fs.writeFileSync(flowPath,flow);
  run(maestro,['--device',device,'test','--debug-output',debug,'--test-output-dir',debug,flowPath]);
  console.log('Real native WebView sign-in, role tabs, Persian and persisted session passed.');
}
