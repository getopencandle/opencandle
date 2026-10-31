import {readFileSync,writeFileSync,realpathSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,dirname,sep} from 'node:path';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),dependency=resolve(project,'node_modules/@luxalgo/vela');
const targets=['dist/chunk-UNUVPQFW.js','dist/index.cjs','dist/vela.global.js','dist/widget.cjs','dist/workspace.cjs'];
const nativeIO={readFileSync,writeFileSync,realpathSync,lstatSync};
export const patchPlan=JSON.parse(readFileSync(new URL('./vela-magnet-patch-plan.json',import.meta.url),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
export function validatePatchPlan(plan){
 if(plan?.schemaVersion!==1||plan.id!=='LV-VELA-MAGNET-1'||plan.package!=='@luxalgo/vela'||plan.version!=='0.8.4'||plan.license!=='Apache-2.0'||!Array.isArray(plan.files)||plan.files.length!==targets.length)throw new Error('Unapproved Vela patch plan');
 const paths=plan.files.map(row=>row.path);if(new Set(paths).size!==targets.length||targets.some(path=>!paths.includes(path)))throw new Error('Vela patch must name exactly the five approved runtime inputs');
 for(const value of [plan.licenseSha256,plan.noticeSha256,plan.packageJsonSha256,...plan.files.flatMap(row=>[row.beforeSha256,row.afterSha256])])if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw new Error('Invalid pinned Vela hash');
 if(typeof plan.before!=='string'||!plan.before.length||typeof plan.after!=='string'||!plan.after.includes('/*! LarryVision LV-VELA-MAGNET-1'))throw new Error('Missing retained Vela modification notice');
 return plan;
}
function boundedPath(file,io){
 for(const directory of [project,resolve(project,'node_modules'),resolve(project,'node_modules/@luxalgo'),dependency,resolve(dependency,'dist')]){
  const stat=io.lstatSync(directory);if(stat.isSymbolicLink()||!stat.isDirectory()||!samePath(io.realpathSync(directory),directory))throw new Error('Vela patch ancestor is not an approved regular directory');
 }
 const path=resolve(dependency,file);if(!path.startsWith(dependency+sep)||!samePath(io.realpathSync(path),path))throw new Error('Patch target outside pinned dependency');
 const stat=io.lstatSync(path);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>16*1024*1024)throw new Error('Vela patch target must be a bounded regular file');return path;
}
export function inspectPatch(io=nativeIO,plan=patchPlan){
 validatePatchPlan(plan);
 for(const [file,wanted]of [['LICENSE',plan.licenseSha256],['NOTICE',plan.noticeSha256],['package.json',plan.packageJsonSha256]])if(hash(io.readFileSync(boundedPath(file,io)))!==wanted)throw new Error('Pinned Vela input mismatch: '+file);
 const pkg=JSON.parse(io.readFileSync(boundedPath('package.json',io),'utf8'));if(pkg.name!==plan.package||pkg.version!==plan.version||pkg.license!==plan.license)throw new Error('Unapproved Vela version or license');
 return plan.files.map(row=>{const path=boundedPath(row.path,io),original=io.readFileSync(path),actual=hash(original);if(![row.beforeSha256,row.afterSha256].includes(actual))throw new Error('Unapproved patch target hash: '+row.path);return{...row,targetPath:path,original,state:actual===row.afterSha256?'patched':'original'};});
}
// Host-only IO injection allows transaction tests without modifying installed package files.
export function runPatch(mode='--check',io=nativeIO){
 if(!['--check','--verify','--apply'].includes(mode))throw new Error('Use --check, --verify or explicitly authorized --apply');let rows=inspectPatch(io);
 if(mode==='--verify'&&rows.some(row=>row.state!=='patched'))throw new Error('Vela magnet patch has not been applied');
 if(mode==='--apply'){
  const prepared=rows.filter(row=>row.state==='original').map(row=>{const text=row.original.toString('utf8');if(text.split(patchPlan.before).length!==2)throw new Error('Expected exactly one pinned helper body');const output=Buffer.from(text.replace(patchPlan.before,patchPlan.after));if(hash(output)!==row.afterSha256)throw new Error('Proposed output mismatch');return{...row,output};});
  const attempted=[];
  try{
   for(const row of prepared){const path=boundedPath(row.path,io);if(hash(io.readFileSync(path))!==hash(row.original))throw new Error('Vela target changed before write');attempted.push(row);io.writeFileSync(path,row.output);if(hash(io.readFileSync(path))!==row.afterSha256)throw new Error('Vela output verification failed');}
   rows=inspectPatch(io);if(rows.some(row=>row.state!=='patched'))throw new Error('Final Vela patch verification failed');
  }catch(error){
   const failures=[];for(const row of attempted.reverse()){try{const path=boundedPath(row.path,io);io.writeFileSync(path,row.original);if(hash(io.readFileSync(path))!==hash(row.original))throw new Error('Restored Vela bytes differ');}catch(rollback){failures.push(rollback);}}
   if(failures.length)throw new AggregateError([error,...failures],'Vela patch failed and rollback was incomplete; inspect every approved input before building');throw error;
  }
 }
 return {patchId:patchPlan.id,version:patchPlan.version,mode,files:rows.map(({targetPath,original,...row})=>row)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.length>3)throw new Error('Unexpected patch arguments');console.log(JSON.stringify(runPatch(process.argv[2]),null,2));}
