import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

if(process.env.GITHUB_ACTIONS!=='true'||process.platform!=='linux'||!path.isAbsolute(process.env.RUNNER_TEMP||''))throw new Error('Use the isolated Linux CI runtime.');
const root=path.join(process.env.RUNNER_TEMP,'ElegantRuntime','Sofreh','catalogue'),output=path.join(root,'artifacts');
for(const dir of [root,output,path.join(root,'temp')])fs.mkdirSync(dir,{recursive:true});
const env={...process.env,TEMP:path.join(root,'temp'),TMP:path.join(root,'temp'),TMPDIR:path.join(root,'temp'),
  npm_config_cache:path.join(root,'npm'),XDG_CACHE_HOME:path.join(root,'cache'),XDG_CONFIG_HOME:path.join(root,'config')};
function run(command,args){const result=spawnSync(command,args,{cwd:root,env,encoding:'utf8',timeout:240000,maxBuffer:4*1024*1024});
  if(result.error)throw result.error;if(result.status!==0){console.error(result.stderr);throw new Error(`${command} exited ${result.status}`);}return result.stdout.trim();}
fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({private:true}));
run('npm',['install','--ignore-scripts','--no-audit','--no-fund','--save-exact','lighthouse@13.6.0']);
const chrome=run('which',['google-chrome']);
const results=[];
for(const locale of ['fa','en']){
  console.log('Auditing public catalogue: '+locale);
  run(process.execPath,[path.join(root,'node_modules','lighthouse','cli','index.js'),'https://sofreh-v2.vercel.app/'+locale,
    '--chrome-path='+chrome,'--chrome-flags=--headless --disable-dev-shm-usage --user-data-dir='+path.join(root,'chrome-'+locale),
    '--output=json','--output=html','--output-path='+path.join(output,locale),'--quiet']);
  const report=JSON.parse(fs.readFileSync(path.join(output,locale+'.report.json'),'utf8'));
  if(report.runtimeError)throw new Error('Catalogue audit failed: '+report.runtimeError.code);
  results.push({locale,url:report.finalDisplayedUrl||report.finalUrl,version:report.lighthouseVersion,
    scores:Object.fromEntries(Object.entries(report.categories).map(([key,value])=>[key,value.score])),
    metrics:Object.fromEntries(['first-contentful-paint','largest-contentful-paint','total-blocking-time','cumulative-layout-shift','speed-index'].map(key=>[key,report.audits[key]?.numericValue])),
    failedAudits:Object.entries(report.audits).filter(([,audit])=>audit.score!==null&&audit.score<1).map(([id,audit])=>({id,title:audit.title,score:audit.score,displayValue:audit.displayValue}))});
}
fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify({checkedAt:new Date().toISOString(),sourceRevision:process.env.GITHUB_SHA,
  browser:run(chrome,['--version']),simulatedMobile:true,fieldMeasurements:false,results},null,2));
console.log(JSON.stringify(results));
