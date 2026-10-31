import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {compat5StepIds,compat6StepIds as compat6CursorStepIds,compat7StepIds,compat8StepIds,compat9StepIds,compat10StepIds,compat11StepIds,inspectPatch,validatePatchPlan} from '../../src/chart/apply-vela-compat-patch.mjs';
// LV-VELA-COMPAT-7 appends the nav-clamp step after the COMPAT-6 steps; for this file's reversals the trailing
// group after COMPAT-5 is the COMPAT-6 cursor-kind steps plus that step.
// LV-VELA-COMPAT-8 appends the nineteen scale-left steps after those; they join the same trailing group.
// LV-VELA-COMPAT-9 appends the nine forward steps after those; they join the same trailing group.
// LV-VELA-COMPAT-10 appends the ten scale-group steps after those; they join the same trailing group.
// LV-VELA-COMPAT-11 appends the twelve render-leftover steps after those; they join the same trailing group.
const compat6StepIds=Object.freeze([...compat6CursorStepIds,...compat7StepIds,...compat8StepIds,...compat9StepIds,...compat10StepIds,...compat11StepIds]);
import plan from '../../src/chart/vela-compat-patch-plan.json';

// LV-VELA-COMPAT-5 plan shape (LV-VELA-SCALE-BUTTONS-1, LV-VELA-SCALE-PLACEMENT-1, LV-VELA-TIME-FORMAT-1) inside the cumulative
// LV-VELA-COMPAT-6 plan (LV-VELA-CURSOR-KIND-1 follows the COMPAT-5 steps; each reversal below first reverses the COMPAT-6 steps).
// Reads installed dependency bytes only; never writes. The COMPAT-4 hashes are pinned here independently of the plan:
// they are the COMPAT-4 afterSha256 values recorded in The COMPAT-5 hashes are the COMPAT-5
// afterSha256 values recorded in
const compat4Hashes:Record<string,string>={
 'dist/chunk-UNUVPQFW.js':'520f82b98af5139b2d247cab950612738d6ca40cf2a99916a49bd3131c26c50f',
 'dist/index.cjs':'e31f8993ddd6f580910421f40816b6119c225da1216cfcd17be0b82b00e4011f',
 'dist/vela.global.js':'133fe5dce5fbf3c33abaa5890fc88d9dc37fe1051a798410dad1c466c57c5ac3',
 'dist/widget.cjs':'f06e2c481cdba19a6f3687cdf8ce5fde189a12e1e8e5f68e242b65ebc04a0399',
 'dist/workspace.cjs':'3658d1925cc77b2692d6cb32b8f83289db3768fee32ba05547d09904f390ca21',
 'dist/index.d.ts':'155d4d8169446f57b300bad12a334987bb9ab8238b299890ab3771aae28aedbb',
 'dist/index.d.cts':'88b07643e9b34ca729ecfae4fb6cd96bfa6b137c86d70e20d40d86e3cd92dc19',
 'dist/contributions-BY3zSYiZ.d.ts':'153d0d311749b9ed079fbd9a6eedfc06051bf027f9e64efeef1c96a32a751f91',
 'dist/contributions-DOm40g5-.d.cts':'99665eb60512b107b7ca4b96cfbd3f8fc6e68075daabbc07907b6b4cefc029be',
};
const compat5Hashes:Record<string,string>={
 'dist/chunk-UNUVPQFW.js':'78660487c57cf594f405d14c67ab3e18f4fe6b1dc6046fbb29a86e12bb74fb39',
 'dist/index.cjs':'a61b4b9d1a3567c69fb48430e993c4e948d34257866a28523d927e001228d25d',
 'dist/vela.global.js':'68098454960beed5141588abf9ca0314646b4c76203fb2e4c359c327618179b8',
 'dist/widget.cjs':'9917e94181e2b1c550cbc8394091ac6df55a2483b2d6c9543e08a60706effcd4',
 'dist/workspace.cjs':'5884ef9682bef18bb696e976d8c07ee10cee0e5167c60be3f92ce2ccd7ccecbd',
 'dist/index.d.ts':'155d4d8169446f57b300bad12a334987bb9ab8238b299890ab3771aae28aedbb',
 'dist/index.d.cts':'88b07643e9b34ca729ecfae4fb6cd96bfa6b137c86d70e20d40d86e3cd92dc19',
 'dist/contributions-BY3zSYiZ.d.ts':'153d0d311749b9ed079fbd9a6eedfc06051bf027f9e64efeef1c96a32a751f91',
 'dist/contributions-DOm40g5-.d.cts':'99665eb60512b107b7ca4b96cfbd3f8fc6e68075daabbc07907b6b4cefc029be',
};
type Step={id:string;before:string;after:string};
type Row=typeof plan.files[number]&{compat4Sha256:string;compat5Sha256:string;magnetSha256?:string;transformations:Step[]};
const rows=plan.files as Row[],sha=(text:string)=>createHash('sha256').update(Buffer.from(text)).digest('hex');
const installed=(row:Row)=>readFileSync(path.resolve('node_modules/@luxalgo/vela',row.path),'utf8');
const NOTICES:Record<string,string>={'scale-buttons-size':'/*! LarryVision LV-VELA-SCALE-BUTTONS-1','scale-placement-scene':'/*! LarryVision LV-VELA-SCALE-PLACEMENT-1','time-format-stamp':'/*! LarryVision LV-VELA-TIME-FORMAT-1'};
/** The COMPAT-5 steps sit between the COMPAT-4 steps and the trailing COMPAT-6 steps. */
const COMPAT5_THEN_6=compat5StepIds.length+compat6StepIds.length;

it('names the COMPAT-5 components and the COMPAT-6 cursor-kind component after the four COMPAT-4 components and pins the COMPAT-4 and COMPAT-5 identity of every input',()=>{
 expect(plan.id).toBe('LV-VELA-COMPAT-11');expect(plan.schemaVersion).toBe(11);
 expect(plan.components).toEqual(['LV-VELA-MAGNET-1','LV-VELA-DRAWING-IDS-1','LV-VELA-PAINT-CLIP-1','LV-VELA-DRAWING-PAINT-HOOK-1','LV-VELA-SCALE-BUTTONS-1','LV-VELA-SCALE-PLACEMENT-1','LV-VELA-TIME-FORMAT-1','LV-VELA-CURSOR-KIND-1','LV-VELA-NAV-1','LV-VELA-SCALE-LEFT-1','LV-VELA-FORWARD-1','LV-VELA-SCALE-GROUPS-1','LV-VELA-RENDER-LEFTOVERS-1']);
 for(const row of rows){expect(row.compat4Sha256,row.path).toBe(compat4Hashes[row.path]);expect(row.compat5Sha256,row.path).toBe(compat5Hashes[row.path]);}
 expect(inspectPatch().map(row=>row.state)).toEqual(rows.map(()=>'patched'));
});
it('keeps exactly the COMPAT-5 steps in each runtime input, each with one anchor, and reverses COMPAT-6 first to the COMPAT-5 bytes and then to the COMPAT-4 bytes',()=>{
 for(const row of rows){
  if(!row.magnetSha256){expect(row.afterSha256).toBe(row.compat4Sha256);expect(row.compat5Sha256).toBe(row.compat4Sha256);expect(row.transformations.some(step=>compat5StepIds.includes(step.id)||compat6StepIds.includes(step.id))).toBe(false);continue;}
  const six=row.transformations.slice(-compat6StepIds.length),added=row.transformations.slice(-COMPAT5_THEN_6,-compat6StepIds.length);
  expect(six.map(step=>step.id)).toEqual([...compat6StepIds]);
  expect(added.map(step=>step.id)).toEqual([...compat5StepIds]);
  for(const [id,notice] of Object.entries(NOTICES))expect(added.find(step=>step.id===id)!.after,row.path+' '+id).toContain(notice);
  let text=installed(row);expect(sha(text)).toBe(row.afterSha256);
  for(const step of [...six].reverse()){expect(text.split(step.after),row.path+' '+step.id).toHaveLength(2);text=text.replace(step.after,step.before);}
  expect(sha(text),row.path).toBe(compat5Hashes[row.path]);
  for(const step of [...added].reverse()){expect(text.split(step.after),row.path+' '+step.id).toHaveLength(2);text=text.replace(step.after,step.before);}
  expect(sha(text),row.path).toBe(compat4Hashes[row.path]);
  // No earlier component's bytes move: every COMPAT-4 and COMPAT-5 step's `after` is still present exactly once in the COMPAT-7
  // bytes (the installed bytes with the COMPAT-11, COMPAT-10, COMPAT-9 and COMPAT-8 steps reversed). COMPAT-8 anchors four steps inside COMPAT-5 text by design
  // so the installed bytes no longer hold those afters whole.
  let compat7=installed(row);for(const step of row.transformations.slice(-(compat8StepIds.length+compat9StepIds.length+compat10StepIds.length+compat11StepIds.length)).reverse()){expect(compat7.split(step.after),row.path+' '+step.id).toHaveLength(2);compat7=compat7.replace(step.after,step.before);}
  expect(sha(compat7),row.path).toBe(row.compat7Sha256);
  for(const step of row.transformations.slice(0,-compat6StepIds.length))expect(compat7.split(step.after),row.path+' '+step.id).toHaveLength(2);
 }
});
it('rejects a plan that drops a COMPAT-5 or COMPAT-6 step, a component notice, or the COMPAT-4 or COMPAT-5 identity',()=>{
 const first=(mutate:(row:any)=>any)=>({...plan,files:plan.files.map((row:any,i:number)=>i?row:mutate(structuredClone(row)))});
 expect(()=>validatePatchPlan(first(row=>({...row,transformations:row.transformations.slice(0,-1)})))).toThrow();
 expect(()=>validatePatchPlan(first(row=>({...row,transformations:[...row.transformations.slice(0,-COMPAT5_THEN_6),...row.transformations.slice(-compat6StepIds.length)]})))).toThrow();
 const noticed={...NOTICES,'cursor-kind-api':'/*! LarryVision LV-VELA-CURSOR-KIND-1'};
 for(const id of Object.keys(noticed))expect(()=>validatePatchPlan(first(row=>{const step=row.transformations.find((item:Step)=>item.id===id);step.after=step.after.replace('/*! LarryVision','/* no notice');return row;}))).toThrow();
 expect(()=>validatePatchPlan(first(row=>({...row,compat4Sha256:undefined})))).toThrow();
 expect(()=>validatePatchPlan(first(row=>({...row,compat5Sha256:undefined})))).toThrow();
 expect(()=>validatePatchPlan({...plan,components:plan.components.slice(0,7)})).toThrow();
 expect(()=>validatePatchPlan({...plan,id:'LV-VELA-COMPAT-5'})).toThrow();
 expect(()=>validatePatchPlan({...plan,schemaVersion:5})).toThrow();
});
