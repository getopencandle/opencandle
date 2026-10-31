import {readFileSync,realpathSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {notice,runtimeSteps} from './vela-future-calendar-steps.mjs';
const hash=data=>createHash('sha256').update(data).digest('hex');
const here=dirname(fileURLToPath(import.meta.url));
const planBytes=readFileSync(resolve(here,'vela-future-calendar-plan.json'));
export const futureCalendarPlan=JSON.parse(planBytes);
export const futureCalendarNotice=notice;
const runtimes=['dist/chunk-UNUVPQFW.js','dist/index.cjs','dist/vela.global.js','dist/widget.cjs','dist/workspace.cjs'];
const declarations=['dist/index.d.ts','dist/index.d.cts','dist/contributions-BY3zSYiZ.d.ts','dist/contributions-DOm40g5-.d.cts'];
const canonical=file=>process.platform==='win32'?file.toLowerCase():file;
function target(root,name){
 const dependency=resolve(root,'node_modules/@luxalgo/vela'),file=resolve(dependency,name);
 if(!file.startsWith(dependency+sep))throw Error('Future calendar target escape');
 for(let current=file;;current=dirname(current)){const info=lstatSync(current);if(info.isSymbolicLink()||canonical(realpathSync(current))!==canonical(current))throw Error('Future calendar input crosses a link');if(current===root)break;if(dirname(current)===current)throw Error('Future calendar root escape');}
 const stat=lstatSync(file);if(!stat.isFile()||stat.size>16*1024*1024)throw Error('Future calendar input is not a bounded regular file');return file;
}
/** Read-only verification. Does not mutate or claim to replace the COMPAT-11 base. */
export function verifyFutureCalendarExtension(root){
 root=realpathSync(resolve(root));const plan=futureCalendarPlan,expected=[...runtimes,...declarations];
 if(plan.schemaVersion!==1||plan.id!=='LV-VELA-FUTURE-CALENDAR-1'||plan.base.id!=='LV-VELA-COMPAT-11'||plan.base.version!=='0.8.4'||plan.base.license!=='Apache-2.0'||plan.files.length!==9||new Set(plan.files.map(row=>row.path)).size!==9||expected.some(path=>!plan.files.some(row=>row.path===path)))throw Error('Unapproved future calendar extension inventory');
 const baseBytes=readFileSync(resolve(root,'src/chart/vela-compat-patch-plan.json')),base=JSON.parse(baseBytes);
 if(hash(baseBytes)!==plan.base.planSHA256||base.id!==plan.base.id)throw Error('Future calendar base recipe changed');
 for(const [name,wanted]of [['LICENSE',plan.base.licenseSHA256],['NOTICE',plan.base.noticeSHA256],['package.json',plan.base.packageSHA256]])if(hash(readFileSync(target(root,name)))!==wanted)throw Error('Future calendar license/package mismatch');
 if(hash(readFileSync(resolve(here,'vela-future-calendar-steps.mjs')))!==plan.payload.sha256||hash(readFileSync(resolve(here,'vela-future-calendar.d.ts')))!==plan.types.sha256)throw Error('Future calendar payload/types changed');
 const files=[];
 for(const row of plan.files){
  const shift=value=>row.path==='dist/vela.global.js'?value.replace(/^(?=.)/gm,'  '):value;
  const expectedSteps=runtimes.includes(row.path)?runtimeSteps.map(([id,before,after])=>({id,before:shift(before),after:shift(after)})):[];
  if(JSON.stringify(row.transformations)!==JSON.stringify(expectedSteps))throw Error('Future calendar transformation inventory changed');
  const actual=readFileSync(target(root,row.path));if(hash(actual)!==row.baseSHA256||base.files.find(value=>value.path===row.path)?.afterSha256!==row.baseSHA256)throw Error('Future calendar installed base mismatch: '+row.path);const output=composeFutureCalendar(actual.toString('utf8'),row);files.push({path:row.path,baseSHA256:row.baseSHA256,composedSHA256:hash(output)});
 }
 return{extensionId:plan.id,baseId:base.id,extensionPlanSHA256:hash(planBytes),installed:'Unmodified pinned COMPAT-11; extension applies only in declared build/test pipeline',files};
}
export function composeFutureCalendar(code,row){
 if(hash(code)!==row.baseSHA256)throw Error('Future calendar transform is not exact base code: '+row.path);
 for(const step of row.transformations){if(code.split(step.before).length!==2)throw Error('Future calendar source anchor mismatch: '+row.path+' '+step.id);code=code.replace(step.before,()=>step.after);}
 if(hash(code)!==row.composedSHA256)throw Error('Future calendar composed hash mismatch: '+row.path);return code;
}
/** Same original transform for actual Vite build, development and inlined Vitest SDK. */
export function velaFutureCalendarPlugin(){
 let project=null,verified=null;const transformed=new Set();
 return{name:'larryvision-vela-future-calendar',enforce:'pre',
  configResolved(config){project=realpathSync(resolve(config.root));verified=verifyFutureCalendarExtension(project);},
  transform(code,id){
   if(!project||!verified)throw Error('Future calendar transform was not verified');
   const clean=id.split('?')[0],row=futureCalendarPlan.files.find(item=>runtimes.includes(item.path)&&canonical(resolve(project,'node_modules/@luxalgo/vela',item.path))===canonical(resolve(clean)));
   if(!row)return null;
   if(canonical(realpathSync(clean))!==canonical(target(project,row.path)))throw Error('Future calendar module is not canonical');
   const output=composeFutureCalendar(code,row);transformed.add(row.path);return{code:output,map:null};
  },
  generateBundle(){
   if(!transformed.has('dist/chunk-UNUVPQFW.js'))throw Error('Delivered renderer did not consume the actual future calendar transform');
   this.emitFile({type:'asset',fileName:'vela-future-calendar.json',source:JSON.stringify({...verified,transformed:[...transformed]})});
  }
 };
}
