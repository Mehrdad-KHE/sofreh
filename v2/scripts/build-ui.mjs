import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {copyRuntimeSource,runtimeRoot,node24,npmCli} from './runtime-source.mjs';

fs.mkdirSync(runtimeRoot,{recursive:true});
const target=copyRuntimeSource(fs.mkdtempSync(path.join(runtimeRoot,'ui-build-')));
const temp=path.join(runtimeRoot,'ui-temp');fs.mkdirSync(temp,{recursive:true});
const result=spawnSync(node24(),[npmCli(),'ci','--ignore-scripts','--no-audit','--no-fund'],{
  cwd:target,stdio:'inherit',windowsHide:true,
  env:{...process.env,npm_config_cache:path.join(runtimeRoot,'npm-cache'),TEMP:temp,TMP:temp}
});
if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);
const require=createRequire(path.join(target,'package.json'));
const output=path.join(target,'build','mui-responsive.js');
require('esbuild').buildSync({entryPoints:[path.join(target,'apps/shared/mui-responsive.jsx')],
  bundle:true,minify:true,format:'iife',target:'es2020',define:{'process.env.NODE_ENV':'"production"'},outfile:output});
console.log(`Internal UI bundle: ${output}`);
console.log('Verify it in the review runtime before copying it into source assets.');
