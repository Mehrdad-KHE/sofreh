import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

if(!path.isAbsolute(process.env.LOCALAPPDATA||''))throw new Error('Absolute local runtime root required.');
const root=path.join(process.env.LOCALAPPDATA,'ElegantRuntime','Sofreh');
const sharp=createRequire(path.join(root,'identity-deps','package.json'))('sharp');
sharp.cache(false);sharp.concurrency(1);
const outputRoot=path.join(root,'catalogue-images');fs.mkdirSync(outputRoot,{recursive:true});
const output=fs.mkdtempSync(path.join(outputRoot,'run-'));
const assets=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../assets/demo-food');
const results=[];
for(const name of ['ghormeh-sabzi-majidi','zereshk-polo','ash-reshteh']){
  const source=path.join(assets,name+'.jpg');
  const original=await sharp(source,{limitInputPixels:40000000}).metadata();
  const widths=[480,800,1280].filter(width=>width<=original.width);
  if(!widths.length)widths.push(original.width);
  for(const width of widths){
    const target=path.join(output,name+'-'+width+'.webp');
    const info=await sharp(source,{limitInputPixels:40000000}).rotate().resize({width,withoutEnlargement:true}).webp({quality:82,effort:5}).toFile(target);
    if(info.format!=='webp'||!info.width||!info.height||info.width>width)throw new Error('Invalid optimized image.');
    results.push({file:path.basename(target),width:info.width,height:info.height,bytes:info.size});
  }
}
fs.writeFileSync(path.join(output,'image-verification.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify({internalOutput:output,images:results},null,2));
// Deliberately do not publish/copy generated files: inspect their visual quality
// and attribution before promoting approved assets into the source tree.
