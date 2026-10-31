import {it,expect} from 'vitest';
import {readFileSync,realpathSync,lstatSync} from 'node:fs';
import path from 'node:path';
import {inspectPatch,runPatch,validatePatchPlan} from '../../src/chart/apply-vela-magnet-patch.mjs';
import {createHash} from 'node:crypto';
import plan from '../../src/chart/vela-magnet-patch-plan.json';
import cumulative from '../../src/chart/vela-compat-patch-plan.json';
import {restoreMagnetCandidate} from '../../src/chart/apply-vela-compat-patch.mjs';
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
// Preserve this patch's independent truth table and failure cases after the
// separately pinned cumulative extension. Arbitrary bytes still reject.
const magnetInput=(bytes:Buffer,filePath:string)=>{const row=cumulative.files.find(row=>row.path===filePath)!;return sha(bytes)===row.afterSha256?restoreMagnetCandidate(bytes,row):bytes;};
it('proposed pinned modification executes the six independent literal magnet cases from each distributed helper body',()=>{
 for(const file of plan.files){const source=magnetInput(readFileSync('node_modules/@luxalgo/vela/'+file.path),file.path),actual=sha(source);expect([file.beforeSha256,file.afterSha256]).toContain(actual);const candidate=actual===file.beforeSha256?Buffer.from(source.toString('utf8').replace(plan.before,plan.after)):source;expect(sha(candidate)).toBe(file.afterSha256);
  const body=/function effectiveSnapMode\(momentaryOverride, sticky\) \{([\s\S]*?)\n\s*\}/.exec(candidate.toString('utf8'))![1],run=new Function('momentaryOverride','sticky',body);
  expect(run(false,'off')).toBe('off');expect(run(false,'weak')).toBe('weak');expect(run(false,'strong')).toBe('strong');expect(run(true,'off')).toBe('strong');expect(run(true,'weak')).toBe('off');expect(run(true,'strong')).toBe('off');
 }
});
function virtualIO(){
 const installed=new Map<string,Buffer>(plan.files.map(row=>[path.resolve('node_modules/@luxalgo/vela',row.path),readFileSync(path.resolve('node_modules/@luxalgo/vela',row.path))]));
 const originals=new Map<string,Buffer>(plan.files.map(row=>{const file=path.resolve('node_modules/@luxalgo/vela',row.path),actual=magnetInput(installed.get(file)!,row.path);const before=sha(actual)===row.beforeSha256?actual:Buffer.from(actual.toString('utf8').replace(plan.after,plan.before));expect(sha(before)).toBe(row.beforeSha256);return[file,before];}));
 const bytes=new Map([...originals].map(([file,data])=>[file,Buffer.from(data)]));
 const io={realpathSync,lstatSync,readFileSync:(file:string,encoding?:string)=>{const data=bytes.get(file)??readFileSync(file);return encoding?data.toString(encoding as BufferEncoding):Buffer.from(data);},writeFileSync:(file:string,data:Buffer)=>{if(!bytes.has(file))throw Error('Synthetic write outside approved input');bytes.set(file,Buffer.from(data));}};
 return{io,bytes,originals,installed,assertRestored:()=>{for(const[file,before]of originals)expect(bytes.get(file)!.equals(before)).toBe(true);}};
}
it('rejects changed target inventories, path aliases, invalid hashes and missing retained notices before writes',()=>{
 for(const changed of [ {...plan,files:plan.files.slice(1)}, {...plan,files:plan.files.map((row,index)=>index?row:{...row,path:'../../private'})}, {...plan,files:plan.files.map((row,index)=>index?row:{...row,path:'LICENSE'})}, {...plan,licenseSha256:'invalid'}, {...plan,after:'return sticky;'} ])expect(()=>validatePatchPlan(changed)).toThrow();
 const h=virtualIO(),file=path.resolve('node_modules/@luxalgo/vela',plan.files[0].path);
 expect(()=>inspectPatch({...h.io,realpathSync:(target:string)=>target===file?path.resolve('.tmp/outside'):realpathSync(target)})).toThrow('outside');
 expect(()=>inspectPatch({...h.io,lstatSync:(target:string)=>target===file?{...lstatSync(target),isSymbolicLink:()=>true,isDirectory:()=>false,isFile:()=>true}:lstatSync(target)})).toThrow('regular');h.assertRestored();
});
it('rolls back the partially written failing target as well as prior writes',()=>{
 const h=virtualIO();let writes=0;
 expect(()=>runPatch('--apply',{...h.io,writeFileSync:(file:string,data:Buffer)=>{writes++;if(writes===2){h.bytes.set(file,Buffer.from('Synthetic partial write'));throw Error('Synthetic partial write failure');}h.io.writeFileSync(file,data);}})).toThrow('Synthetic partial write failure');
 expect(writes).toBe(4);h.assertRestored();
});
it('final metadata verification failure rolls all five attempted outputs back',()=>{
 const h=virtualIO();let writes=0,failed=false;
 expect(()=>runPatch('--apply',{...h.io,writeFileSync:(file:string,data:Buffer)=>{writes++;h.io.writeFileSync(file,data);},readFileSync:(file:string,encoding?:string)=>{if(writes===5&&!failed&&file.endsWith(path.sep+'LICENSE')){failed=true;return Buffer.from('Synthetic metadata mismatch');}return h.io.readFileSync(file,encoding);}})).toThrow('Pinned Vela input mismatch');
 expect(writes).toBe(10);h.assertRestored();
});
it('rollback attempts every target even if one restore fails and reports incomplete restoration explicitly',()=>{
 const h=virtualIO();let writes=0;
 expect(()=>runPatch('--apply',{...h.io,writeFileSync:(file:string,data:Buffer)=>{writes++;if(writes===2){h.bytes.set(file,Buffer.from('Synthetic partial write'));throw Error('Synthetic write failure');}if(writes===3)throw Error('Synthetic rollback failure');h.io.writeFileSync(file,data);}})).toThrow('rollback was incomplete');
 expect(writes).toBe(4);expect(h.bytes.get([...h.originals.keys()][0])!.equals([...h.originals.values()][0])).toBe(true);
});
it('applies and verifies all five simulated inputs idempotently while real installed files remain unchanged',()=>{
 const h=virtualIO();expect(runPatch('--apply',h.io).files.every((row:any)=>row.state==='patched')).toBe(true);expect(runPatch('--verify',h.io).files.every((row:any)=>row.state==='patched')).toBe(true);expect(runPatch('--apply',h.io).files.every((row:any)=>row.state==='patched')).toBe(true);
 for(const[file,before]of h.installed)expect(readFileSync(file).equals(before)).toBe(true);
});
