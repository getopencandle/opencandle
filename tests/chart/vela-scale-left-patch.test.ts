import {readFileSync,realpathSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import * as patch from '../../src/chart/apply-vela-compat-patch.mjs';
// LV-VELA-COMPAT-8 appends the nineteen
// LV-VELA-SCALE-LEFT-1 steps after the COMPAT-7 steps in each runtime input. Hash-only checks of the installed bytes and of the
// in-memory reversals; nothing here writes node_modules.
const {patchPlan,validatePatchPlan,prepareCandidate,restoreMagnetCandidate}=patch;
const compat8StepIds=(patch as unknown as {compat8StepIds?:readonly string[]}).compat8StepIds;
// LV-VELA-COMPAT-9 appends the nine forward steps after the scale-left steps; they are reversed with them.
const compat9StepIds=(patch as unknown as {compat9StepIds:readonly string[]}).compat9StepIds;
// LV-VELA-COMPAT-10 appends the ten scale-group steps after the forward steps; they are reversed with them.
const compat10StepIds=(patch as unknown as {compat10StepIds:readonly string[]}).compat10StepIds;
// LV-VELA-COMPAT-11 appends the twelve render-leftover steps after the scale-group steps; they are reversed with them.
const compat11StepIds=(patch as unknown as {compat11StepIds:readonly string[]}).compat11StepIds;
const plan=patchPlan as any,sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const COMPONENTS=['LV-VELA-MAGNET-1','LV-VELA-DRAWING-IDS-1','LV-VELA-PAINT-CLIP-1','LV-VELA-DRAWING-PAINT-HOOK-1','LV-VELA-SCALE-BUTTONS-1','LV-VELA-SCALE-PLACEMENT-1','LV-VELA-TIME-FORMAT-1','LV-VELA-CURSOR-KIND-1','LV-VELA-NAV-1','LV-VELA-SCALE-LEFT-1','LV-VELA-FORWARD-1','LV-VELA-SCALE-GROUPS-1','LV-VELA-RENDER-LEFTOVERS-1'];
const STEP_IDS=['scale-left-buttons-hit','scale-left-buttons-place','scale-left-region','scale-left-chrome-paint','scale-left-left-columns','scale-left-chrome-methods','scale-left-crosshair-clear','scale-left-crosshair-chip','scale-left-external-chip','scale-left-crosshair-methods','scale-left-ensure-pane','scale-left-api','scale-left-left-width','scale-left-left-cursor','scale-left-holder','scale-left-right-width','scale-left-input-deps','scale-left-buttons-deps','scale-left-pane-bounds'];
// COMPAT-7 afterSha256 values and the COMPAT-8 targets.
const COMPAT7:Record<string,string>={
 'dist/chunk-UNUVPQFW.js':'7bcbb31236d164f6d9b9f8d7bc3097f6060f8268386d08ac1c10dd7f8885aebf',
 'dist/index.cjs':'441f5b7a60cf5a91f904b15d6d8dc4fd836d26986b39e27872c1e50c40f4e55f',
 'dist/vela.global.js':'602d3b23379e88528d4fa05c9e0da3e894328de47fb4c748b3b045e92de9dbd0',
 'dist/widget.cjs':'17a59872bfe1efdcff7dbe3950cc75f1839644dc4c954913ba82b3f003a46e05',
 'dist/workspace.cjs':'c027f96a87b6fa189135e19a7b2bfd2c9223f948972fc692377a35476c523b67'};
const COMPAT8:Record<string,string>={
 'dist/chunk-UNUVPQFW.js':'03d156197930eebc1d1789e5d7d016d91c478e9737354b41beab19c72736ef0d',
 'dist/index.cjs':'3a8235da34fb5892725b927656cde255985a8b06e5029439c4ce883ca7f75854',
 'dist/vela.global.js':'538945f80501a0c9a59fe3ad4009ccc10938b38b7d99f8591ad04fa02c7a95fd',
 'dist/widget.cjs':'71ac8af7bb9cab483a0425b2a9a8d4741b2c5d26dc27651a7b351e1e01df4c38',
 'dist/workspace.cjs':'bdce73f53acb0d64fb09e361d6ddee00d5903eafa93f78c50e31a2f81b028be0'};
const installed=(row:any)=>readFileSync(resolve('node_modules/@luxalgo/vela',row.path));
/** The installed bytes with the trailing `ids` steps reversed (latest first). */
function reverse(row:any,ids:readonly string[]){
 let text=installed(row).toString('utf8');
 for(const step of row.transformations.filter((s:any)=>ids.includes(s.id)).reverse()){expect(text.split(step.after),row.path+' '+step.id).toHaveLength(2);text=text.replace(step.after,()=>step.before);}
 return Buffer.from(text);
}

describe('LV-VELA-COMPAT-8 plan (LV-VELA-SCALE-LEFT-1)',()=>{
 it('is schema 8 with the ten-component list and exports the nineteen step ids in plan order',()=>{
  expect(plan.id).toBe('LV-VELA-COMPAT-11');expect(plan.schemaVersion).toBe(11);
  expect(plan.components).toEqual(COMPONENTS);
  expect(compat8StepIds).toBeDefined();expect([...compat8StepIds!]).toEqual(STEP_IDS);
  expect(Object.isFrozen(compat8StepIds)).toBe(true);
  expect(plan.redistribution.at(-4)).toContain('LV-VELA-SCALE-LEFT-1');
  expect(validatePatchPlan(plan)).toBe(plan);
 });
 it('every row pins compat7Sha256 to the COMPAT-7 output; runtime rows reach the COMPAT-8 hashes; declarations are unchanged',()=>{
  for(const row of plan.files){
   expect(sha(installed(row)),row.path).toBe(row.afterSha256);
   if(!row.magnetSha256){expect(row.compat7Sha256).toBe(row.afterSha256);expect(row.compat7Sha256).toBe(row.compat6Sha256);expect(row.transformations.some((s:any)=>s.id.startsWith('scale-left-'))).toBe(false);continue;}
   expect(row.compat7Sha256).toBe(COMPAT7[row.path]);expect(row.compat8Sha256).toBe(COMPAT8[row.path]);
   expect(row.transformations.slice(-54,-35).map((s:any)=>s.id)).toEqual(STEP_IDS);
   const notices=row.transformations.filter((s:any)=>s.after.includes('/*! LarryVision LV-VELA-SCALE-LEFT-1'));
   expect(notices.map((s:any)=>s.id)).toEqual(['scale-left-api']);
  }
 });
 it('prepareCandidate reaches afterSha256 from the COMPAT-7 bytes and from every earlier cumulative state',()=>{
  const p=patch as any;
  const groups:Array<[string,string[]]>=[
   ['compat7Sha256',[...compat8StepIds!,...compat9StepIds,...compat10StepIds,...compat11StepIds]],
   ['compat6Sha256',[...p.compat7StepIds,...compat8StepIds!,...compat9StepIds,...compat10StepIds,...compat11StepIds]],
   ['compat5Sha256',[...p.compat6StepIds,...p.compat7StepIds,...compat8StepIds!,...compat9StepIds,...compat10StepIds,...compat11StepIds]],
   ['compat4Sha256',[...p.compat5StepIds,...p.compat6StepIds,...p.compat7StepIds,...compat8StepIds!,...compat9StepIds,...compat10StepIds,...compat11StepIds]]];
  for(const row of plan.files.filter((r:any)=>r.magnetSha256)){
   for(const [key,ids] of groups){const prior=reverse(row,ids);expect(sha(prior),row.path+' '+key).toBe(row[key]);expect(sha(prepareCandidate(prior,row)),row.path+' '+key).toBe(row.afterSha256);}
   const magnet=restoreMagnetCandidate(installed(row),row);expect(sha(magnet)).toBe(row.magnetSha256);
   expect(sha(prepareCandidate(magnet,row))).toBe(row.afterSha256);
  }
 },30_000); // 28 trailing reversals per group on five runtime inputs (38 after); 6.3 s alone, so the 5 s default timed out.
 it('the vela.global.js steps carry two more spaces on every indented line',()=>{
  const esm=plan.files.find((r:any)=>r.path==='dist/chunk-UNUVPQFW.js'),iife=plan.files.find((r:any)=>r.path==='dist/vela.global.js');
  for(const id of STEP_IDS){
   const a=esm.transformations.find((s:any)=>s.id===id),b=iife.transformations.find((s:any)=>s.id===id);
   expect(b.before).toBe(a.before.replace(/^( +)/gm,'$1  '));expect(b.after).toBe(a.after.replace(/^( +)/gm,'$1  '));
  }
 });
 it('refuses a plan whose scale-left-api step lost its notice, that drops a step, or that lacks compat7Sha256',()=>{
  const broken=structuredClone(plan);const step=broken.files[0].transformations.find((s:any)=>s.id==='scale-left-api');step.after=step.after.replace('/*! LarryVision LV-VELA-SCALE-LEFT-1','/* none');
  expect(()=>validatePatchPlan(broken)).toThrow();
  const short=structuredClone(plan);short.files[0].transformations.pop();expect(()=>validatePatchPlan(short)).toThrow();
  const nohash=structuredClone(plan);delete nohash.files[6].compat7Sha256;expect(()=>validatePatchPlan(nohash)).toThrow();
  const old=structuredClone(plan);old.id='LV-VELA-COMPAT-7';expect(()=>validatePatchPlan(old)).toThrow();
 });
 it('inspectPatch reports the COMPAT-7 state for COMPAT-7 bytes (simulated IO; no write)',()=>{
  const files=new Map<string,Buffer>(),writes:string[]=[];
  for(const row of plan.files)files.set(resolve('node_modules/@luxalgo/vela',row.path),row.magnetSha256?reverse(row,[...compat8StepIds!,...compat9StepIds,...compat10StepIds,...compat11StepIds]):installed(row));
  const io={readFileSync:(file:string,encoding?:string)=>{const v=files.get(file)??readFileSync(file);return encoding?v.toString(encoding as BufferEncoding):Buffer.from(v);},writeFileSync:(file:string)=>{writes.push(file);},realpathSync,lstatSync};
  const rows=patch.inspectPatch(io as never);
  expect(rows.map(row=>row.state)).toEqual(plan.files.map((row:any)=>row.magnetSha256?'compat7':'patched'));
  expect(writes).toEqual([]);
 });
});
