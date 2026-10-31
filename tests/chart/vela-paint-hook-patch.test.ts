import {expect,it} from 'vitest';
import {readFileSync,realpathSync,lstatSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inspectPatch,prepareCandidate,runPatch,validatePatchPlan,compat5StepIds,compat6StepIds as compat6CursorStepIds,compat7StepIds,compat8StepIds,compat9StepIds,compat10StepIds,compat11StepIds} from '../../src/chart/apply-vela-compat-patch.mjs';
// LV-VELA-COMPAT-7 appends the nav-clamp step after the COMPAT-6 steps; for this file's reversals the trailing
// group after COMPAT-5 is the COMPAT-6 cursor-kind steps plus that step.
// LV-VELA-COMPAT-8 appends the nineteen scale-left steps after those; they join the same trailing group.
// LV-VELA-COMPAT-9 appends the nine forward steps after those; they join the same trailing group.
// LV-VELA-COMPAT-10 appends the ten scale-group steps after those; they join the same trailing group.
// LV-VELA-COMPAT-11 appends the twelve render-leftover steps after those; they join the same trailing group.
const compat6StepIds=Object.freeze([...compat6CursorStepIds,...compat7StepIds,...compat8StepIds,...compat9StepIds,...compat10StepIds,...compat11StepIds]);
import plan from '../../src/chart/vela-compat-patch-plan.json';

// LV-VELA-DRAWING-PAINT-HOOK-1 (cumulative LV-VELA-COMPAT-4). Synthetic IO only: installed dependency bytes are
// read, never written. The prior COMPAT-3 hashes are pinned independently of the plan (they were the plan's
// afterSha256 values before this component, recorded in
const compat3Hashes:Record<string,string>={
 'dist/chunk-UNUVPQFW.js':'8b885d94eb3c82f0976e5ed9cf26b937dd8ea3999ceac61145a10374be92c6ee',
 'dist/index.cjs':'ba56a926c162cac2be4eee22e43390aba7281bdb3927c1cf84b71d1f6331fcd9',
 'dist/vela.global.js':'45e8da41dad1d7c72cffc30d5af4f082550b8acb64bec84bde56dc98215b5919',
 'dist/widget.cjs':'7a1b641565dcc0737735a7ca1e3ebc2a1b5d938fbc7baec176e8616e1f63ecd9',
 'dist/workspace.cjs':'328fb0216092e32ee71c83453357053c44050e841fdbdb03fe8f4903ac7dc51b',
 'dist/index.d.ts':'155d4d8169446f57b300bad12a334987bb9ab8238b299890ab3771aae28aedbb',
 'dist/index.d.cts':'88b07643e9b34ca729ecfae4fb6cd96bfa6b137c86d70e20d40d86e3cd92dc19',
 'dist/contributions-BY3zSYiZ.d.ts':'153d0d311749b9ed079fbd9a6eedfc06051bf027f9e64efeef1c96a32a751f91',
 'dist/contributions-DOm40g5-.d.cts':'99665eb60512b107b7ca4b96cfbd3f8fc6e68075daabbc07907b6b4cefc029be',
};
const HOOK_LINE='if (typeof d.lvPaint === "function") { d.lvPaint(ctx, proj, theme); return; }';
const MARKER='/*! LarryVision LV-VELA-DRAWING-PAINT-HOOK-1 modification. */';
type Row=typeof plan.files[number]&{compat2Sha256:string;compat3Sha256:string;magnetSha256?:string};
const rows=plan.files as Row[],sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const target=(row:Row)=>path.resolve('node_modules/@luxalgo/vela',row.path);
const runtimes=rows.filter(row=>row.magnetSha256);
const hookStep=(row:Row)=>row.transformations.find(step=>step.id==='drawing-paint-hook')!;
function compat3(row:Row){
 const after=prepareCandidate(readFileSync(target(row)),row);if(!row.magnetSha256)return after;
 // COMPAT-5 and COMPAT-6 steps come after the hook; reverse them first, COMPAT-6 first (
 let text=after.toString('utf8');for(const later of row.transformations.filter(item=>[...compat5StepIds,...compat6StepIds].includes(item.id)).reverse()){expect(text.split(later.after)).toHaveLength(2);text=text.replace(later.after,later.before);}
 const step=hookStep(row);expect(text.split(step.after)).toHaveLength(2);
 const bytes=Buffer.from(text.replace(step.after,step.before));expect(sha(bytes)).toBe(compat3Hashes[row.path]);return bytes;
}
function virtualIO(){
 const installed=new Map(rows.map(row=>[target(row),readFileSync(target(row))]));
 const initial=new Map(rows.map(row=>[target(row),compat3(row)]));
 const bytes=new Map([...initial].map(([file,data])=>[file,Buffer.from(data)]));
 const writes:string[]=[];
 const io={realpathSync,lstatSync,
  readFileSync:(file:string,encoding?:string)=>{const data=bytes.get(file)??readFileSync(file);return encoding?data.toString(encoding as BufferEncoding):Buffer.from(data);},
  writeFileSync:(file:string,data:Buffer)=>{if(!bytes.has(file))throw Error('Synthetic write outside approved inventory');writes.push(file);bytes.set(file,Buffer.from(data));},
 };
 return{io,bytes,writes,initial,installed};
}

it('names the paint hook as the fourth cumulative component with exactly one guarded line per runtime paintOne',()=>{
 expect(plan.id).toBe('LV-VELA-COMPAT-11');expect(plan.schemaVersion).toBe(11);
 expect(plan.components.slice(0,4)).toEqual(['LV-VELA-MAGNET-1','LV-VELA-DRAWING-IDS-1','LV-VELA-PAINT-CLIP-1','LV-VELA-DRAWING-PAINT-HOOK-1']);
 expect(runtimes).toHaveLength(5);
 for(const row of rows){
  expect(row.compat3Sha256).toBe(compat3Hashes[row.path]);
  if(!row.magnetSha256){expect(row.afterSha256).toBe(row.compat3Sha256);expect(row.transformations.some(step=>step.id==='drawing-paint-hook')).toBe(false);continue;}
  const step=hookStep(row);expect(row.transformations.at(-1-compat5StepIds.length-compat6StepIds.length)).toBe(step);
  // The hook is inserted at the top of paintOne and nothing else changes.
  expect(step.after.replace('\n'+/^( *)/.exec(step.before.split('\n')[1])![1]+MARKER,'').replace('\n'+/^( *)/.exec(step.before.split('\n')[1])![1]+HOOK_LINE,'')).toBe(step.before);
  expect(step.before).toMatch(/^ *paintOne\(ctx, d, proj, theme\) \{\n/);
  const installed=readFileSync(target(row),'utf8');
  expect(installed.split(HOOK_LINE)).toHaveLength(2);expect(installed.split(MARKER)).toHaveLength(2);
  expect(sha(Buffer.from(installed))).toBe(row.afterSha256);
 }
});
it('upgrades the five COMPAT-3 runtimes only, keeps declaration bytes, and is idempotent',()=>{
 const h=virtualIO();
 expect(inspectPatch(h.io).map(row=>row.state)).toEqual(rows.map(row=>row.magnetSha256?'compat3':'patched'));
 expect(()=>runPatch('--verify',h.io)).toThrow('has not been applied');
 expect(runPatch('--apply',h.io).files.every(row=>row.state==='patched')).toBe(true);
 expect(h.writes).toEqual(runtimes.map(target));
 for(const row of rows)expect(sha(h.bytes.get(target(row))!)).toBe(row.afterSha256);
 expect(runPatch('--apply',h.io).files.every(row=>row.state==='patched')).toBe(true);expect(h.writes).toHaveLength(5);
 for(const[file,data]of h.installed)expect(readFileSync(file).equals(data)).toBe(true);
},30_000); // Ten more trailing steps per runtime input took this over the 5 s default (7.9 s under parallel load).
it('restores exact COMPAT-3 bytes when a write fails part way',()=>{
 const h=virtualIO();let writes=0;
 expect(()=>runPatch('--apply',{...h.io,writeFileSync:(file:string,data:Buffer)=>{writes++;if(writes===3){h.bytes.set(file,Buffer.from('SYNTHETIC partial'));throw Error('SYNTHETIC hook write');}h.io.writeFileSync(file,data);}})).toThrow('SYNTHETIC hook write');
 for(const[file,data]of h.initial)expect(h.bytes.get(file)!.equals(data)).toBe(true);
});
it('rejects a plan that drops the hook step, its notice, or the prior COMPAT-3 identity',()=>{
 const strip=(mutate:(row:any)=>any)=>({...plan,files:plan.files.map((row:any,i:number)=>i?row:mutate(structuredClone(row)))});
 expect(()=>validatePatchPlan(strip(row=>({...row,transformations:row.transformations.slice(0,-1)})))).toThrow();
 expect(()=>validatePatchPlan(strip(row=>{const step=hookStep(row);step.after=step.after.replace(MARKER,'/* no notice */');return row;}))).toThrow();
 expect(()=>validatePatchPlan(strip(row=>({...row,compat3Sha256:undefined})))).toThrow();
 expect(()=>validatePatchPlan({...plan,components:plan.components.slice(0,3)})).toThrow();
 expect(()=>validatePatchPlan({...plan,id:'LV-VELA-COMPAT-3'})).toThrow();
});
