// Source generator ONLY. Never writes installed SDK or executes generated code.
import {readFileSync,writeFileSync,realpathSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runtimeSteps} from './vela-future-calendar-steps.mjs';
const sourceDir=dirname(fileURLToPath(import.meta.url));
const hash=data=>createHash('sha256').update(data).digest('hex');
export function generateFutureCalendarPlan(root){
 root=realpathSync(resolve(root));const parentPath=resolve(root,'src/chart/vela-compat-patch-plan.json'),parentBytes=readFileSync(parentPath),parent=JSON.parse(parentBytes);
 if(parent.id!=='LV-VELA-COMPAT-11'||parent.schemaVersion!==11||parent.package!=='@luxalgo/vela'||parent.version!=='0.8.4'||parent.files.length!==9)throw Error('Expected the complete pinned COMPAT-11 base');
 const dependency=resolve(root,'node_modules/@luxalgo/vela');
 const safe=(name)=>{const target=resolve(dependency,name);if(!target.startsWith(dependency+sep))throw Error('Extension target escape');let at=target;while(at.startsWith(root)){const info=lstatSync(at);if(info.isSymbolicLink()||realpathSync(at).toLowerCase()!==at.toLowerCase())throw Error('Extension target is not a regular canonical path');if(at===root)break;at=dirname(at);}if(!lstatSync(target).isFile())throw Error('Extension input is not a regular file');return target;};
 for(const [name,wanted]of [['LICENSE',parent.licenseSha256],['NOTICE',parent.noticeSha256],['package.json',parent.packageJsonSha256]])if(hash(readFileSync(safe(name)))!==wanted)throw Error('Base license/package mismatch: '+name);
 const files=parent.files.map(row=>{
  const input=readFileSync(safe(row.path));if(hash(input)!==row.afterSha256)throw Error('Installed input is not pinned COMPAT-11: '+row.path);
  const runtime=row.path.endsWith('.js')||row.path.endsWith('.cjs'),global=row.path==='dist/vela.global.js';let output=input.toString('utf8');const steps=[];
  if(runtime)for(const [id,a,b]of runtimeSteps){const shift=value=>global?value.replace(/^(?=.)/gm,'  '):value,before=shift(a),after=shift(b);if(output.split(before).length!==2)throw Error('Expected one source anchor: '+row.path+' '+id);output=output.replace(before,()=>after);steps.push({id,before,after});}
  for(const step of steps)if(output.split(step.after).length!==2)throw Error('Composed after text is not unique: '+row.path+' '+step.id);
  let reverse=output;for(const step of [...steps].reverse())reverse=reverse.replace(step.after,()=>step.before);if(hash(Buffer.from(reverse))!==row.afterSha256)throw Error('Composed reversal differs: '+row.path);
  return{path:row.path,baseSHA256:row.afterSha256,composedSHA256:hash(Buffer.from(output)),transformations:steps};
 });
 const types=readFileSync(resolve(sourceDir,'vela-future-calendar.d.ts'));
 return{schemaVersion:1,id:'LV-VELA-FUTURE-CALENDAR-1',status:'SOURCE-ONLY static build composition; installed SDK remains COMPAT-11',base:{id:parent.id,planSHA256:hash(parentBytes),package:parent.package,version:parent.version,license:parent.license,licenseSHA256:parent.licenseSha256,noticeSHA256:parent.noticeSha256,packageSHA256:parent.packageJsonSha256},payload:{path:'src/chart/vela-future-calendar-steps.mjs',sha256:hash(readFileSync(resolve(sourceDir,'vela-future-calendar-steps.mjs')))},types:{path:'src/chart/vela-future-calendar.d.ts',sha256:hash(types)},files};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3)throw Error('Usage: node generate-vela-future-calendar-plan.mjs <actual pinned project root>');
 const plan=generateFutureCalendarPlan(process.argv[2]);writeFileSync(resolve(sourceDir,'vela-future-calendar-plan.json'),JSON.stringify(plan,null,2)+'\n');
 console.log(JSON.stringify({id:plan.id,files:plan.files.length,changed:plan.files.filter(row=>row.baseSHA256!==row.composedSHA256).length,scope:'Text-only source recipe generation; no installed writes or SDK execution'}));
}
