import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';

const version='1.7.8',digest='44369a2df0b62e3a1764de61bd09280999c7e9b27ea8f20bff1ea3a9db0302a2';
export async function checkWorkspace({root,output,devices,device,id,role,env}){
  if(process.env.GITHUB_ACTIONS!=='true'||process.platform!=='darwin'||!root.startsWith(path.resolve(process.env.RUNNER_TEMP)+path.sep))throw new Error('Use the isolated macOS CI runtime.');
  const toolRoot=path.join(root,'idb'),venv=path.join(root,'idb-python'),socket=path.join(root,'idb.sock');
  fs.mkdirSync(toolRoot,{recursive:true});
  const password=randomBytes(24).toString('base64url');
  const email=`ios-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}-${role.toLowerCase()}@qa.sofreh.invalid`;
  console.log(`::add-mask::${password}`);console.log(`::add-mask::${email}`);
  const clean=text=>String(text||'').replaceAll(password,'[masked]').replaceAll(email,'[masked]');
  const driverEnv={...env,IDB_COMPANION_TMPDIR:root,IDB_COMPANION:socket,SOFREH_IDB_STATE:path.join(root,'idb-state'),
    PIP_CACHE_DIR:path.join(root,'pip'),PYTHONPYCACHEPREFIX:path.join(root,'pycache'),PYTHONUSERBASE:path.join(root,'python-user')};
  function run(command,args){const result=spawnSync(command,args,{cwd:root,env:driverEnv,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
    if(result.error)throw new Error(clean(result.error.message));if(result.status!==0){console.error(clean(result.stderr));throw new Error(`${path.basename(command)} exited ${result.status}`);}return result.stdout.trim();}
  function download(name,expected,target){
    console.log('Downloading pinned official tool: '+name);
    run('curl',['--fail','--location','--silent','--show-error','--retry','2','--retry-all-errors','--connect-timeout','10','--max-time','45',
      '--output',target,`https://github.com/meta/idb/releases/download/v${version}/${name}`]);
    if(createHash('sha256').update(fs.readFileSync(target)).digest('hex')!==expected)throw new Error('idb release checksum mismatch.');
  }
  const archive=path.join(root,'idb.tar.gz');download('idb-companion.macos-arm64.tar.gz',digest,archive);run('tar',['-xzf',archive,'-C',toolRoot]);
  const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(item=>{const file=path.join(dir,item.name);return item.isDirectory()?walk(file):[file];});
  const binary=walk(toolRoot).find(file=>path.basename(file)==='idb_companion');
  if(!binary)throw new Error('No companion executable in the pinned archive.');
  run('python3',['-m','venv',venv]);const python=path.join(venv,'bin','python3');
  // This release's official source artifact precedes its PyPI publication.
  // Install the matching, checksum-verified client rather than mixing versions.
  const clientArchive=path.join(root,`fb_idb-${version}.tar.gz`);
  download(`fb_idb-${version}.tar.gz`,'04bccff69ea7cbec5a8085b39d7db4ba8aaee452e8cf533d251e2ed67435c761',clientArchive);
  run(python,['-m','pip','install','--disable-pip-version-check',clientArchive]);
  // Redirect the client's legacy /tmp/idb constants before importing its CLI.
  // No third-party source patch or owner HOME modification is required.
  const wrapper=path.join(root,'idb-client.py');
  fs.writeFileSync(wrapper,`import os\nimport idb.common.constants as c\nc.BASE_IDB_FILE_PATH=os.environ['SOFREH_IDB_STATE']\nc.IDB_PID_PATH=c.BASE_IDB_FILE_PATH+'/pid'\nc.IDB_LOGS_PATH=c.BASE_IDB_FILE_PATH+'/logs'\nc.IDB_STATE_FILE_PATH=c.BASE_IDB_FILE_PATH+'/state'\nfrom idb.cli.main import main\nraise SystemExit(main())\n`);
  const logPath=path.join(root,'private-idb-companion.log'),log=fs.openSync(logPath,'a');
  const companion=spawn(binary,['--udid',device,'--device-set-path',devices,'--grpc-domain-sock',socket,'--log-level','info'],
    {cwd:root,env:driverEnv,stdio:['ignore',log,log],windowsHide:true});
  let spawnError;companion.on('error',error=>{spawnError=error;});
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const ui=(...args)=>run(python,[wrapper,'ui',...args]);
  const sim=(...args)=>run('xcrun',['simctl','--set',devices,...args]);
  let lastTree;
  function tree(){lastTree=JSON.parse(ui('describe-all'));return lastTree;}
  function nodes(value){if(!value||typeof value!=='object')return [];return [value,...Object.values(value).flatMap(nodes)];}
  function matches(value,label){return nodes(value).filter(node=>[node.AXLabel,node.label,node.text].includes(label)&&node.frame);}
  const bounds=value=>nodes(value).filter(node=>node.frame?.width>100&&node.frame?.height>100).map(node=>node.frame).sort((a,b)=>b.width*b.height-a.width*a.height)[0];
  async function visible(label){for(let attempt=0;attempt<30;attempt++){const value=tree();if(matches(value,label).length)return value;await sleep(500);}throw new Error('Missing native UI label: '+label);}
  async function tap(label){
    for(let attempt=0;attempt<6;attempt++){
      const value=tree(),screen=bounds(value),candidates=matches(value,label);
      const node=candidates.find(node=>node.frame.y>=0&&node.frame.y+node.frame.height/2<screen.height);
      if(node){const frame=node.frame;ui('tap',String(Math.round(frame.x+frame.width/2)),String(Math.round(frame.y+frame.height/2)));return;}
      if(!screen)throw new Error('Native UI has no screen bounds.');
      const up=candidates.some(node=>node.frame.y<0)||attempt>=3;
      ui('swipe',String(Math.round(screen.width/2)),String(Math.round(screen.height*(up ? .35 : .8))),String(Math.round(screen.width/2)),String(Math.round(screen.height*(up ? .8 : .35))),'--duration','0.3');
    }throw new Error('Cannot reach native UI label: '+label);
  }
  async function dismissKeyboard(){const value=tree();if(matches(value,'Done').length)await tap('Done');else ui('key','41');}
  const shot=name=>sim('io',device,'screenshot',path.join(output,role.toLowerCase()+'-'+name+'.png'));
  try{
    for(let attempt=0;attempt<60&&!fs.existsSync(socket);attempt++){if(spawnError||companion.exitCode!==null)throw new Error('idb companion failed to start.');await sleep(500);}
    if(!fs.existsSync(socket))throw new Error('No isolated idb socket.');
    console.log('Isolated iOS accessibility companion is ready.');
    const origin='https://sofreh-v2.vercel.app';
    const signup=await fetch(origin+'/api/auth/sign-up/email',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({name:'iOS workspace check',email,password})});
    if(!signup.ok)throw new Error(`Synthetic account creation failed (${signup.status}).`);
    const cookie=signup.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
    const setup=await fetch(origin+'/api/account/setup',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},body:JSON.stringify({role,locale:'en-CA'})});
    if(!setup.ok)throw new Error(`Synthetic role setup failed (${setup.status}).`);
    await visible('Welcome back');await tap('Email');ui('text',email);await dismissKeyboard();
    await tap('Password');ui('text',password);await dismissKeyboard();await tap('Sign in');
    await visible(role==='COOK'?'Time to put your food on the table.':'What are you craving?');shot('workspace-en');
    await tap('Orders');await visible('Your orders');
    if(role==='COOK'){await tap('Menu');await visible('Create your kitchen before adding dishes.');await tap('Kitchen');await visible('Your kitchen');}
    else{await tap('Cart');await visible('Your cart');}
    await tap('Account');await visible('Your account');shot('account-en');
    await tap('فارسی');await visible('حساب شما');shot('account-fa');
    sim('terminate',device,id);sim('launch',device,id);
    await visible(role==='COOK'?'وقت چیدن سفره توست.':'هوس چه غذایی کرده‌ای؟');shot('session-reopened');
    console.log('Real native WebView sign-in, role tabs, Persian and persisted session passed.');
  }catch(error){
    const diagnostic={error:clean(error.message),tree:lastTree?JSON.parse(clean(JSON.stringify(lastTree))):null,
      companionLog:fs.existsSync(logPath)?clean(fs.readFileSync(logPath,'utf8').slice(-20000)):null};
    fs.writeFileSync(path.join(output,'driver-diagnostic.json'),JSON.stringify(diagnostic,null,2));throw error;
  }finally{companion.kill('SIGTERM');fs.closeSync(log);}
}
