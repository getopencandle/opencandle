import {createRequire} from 'node:module';
import {describe,expect,it} from 'vitest';
const require=createRequire(import.meta.url);
import {NativeRenderer} from '@luxalgo/vela';
// Pan and zoom bounds of the pinned renderer (LV-VELA-NAV-1 in
// LV-VELA-COMPAT-7). Every drag, wheel, keyboard pan, fling and time-axis drag writes the viewport through applyViewport or the
// zoom glide, and both clamp through clampViewport, so these drive the real renderer methods. SYNTHETIC daily bars on a
// 951 px plot (the width the exe probe measured); no DOM, GUI or packaged-build claim.
const W=951,DAY=86400000;
function chart(n:number){
 const r=new NativeRenderer() as any;
 r.scheduler={invalidate(){}};r.animator={stop(){},start(){}};r.animZoom.set(0);r.animScroll.set(0);
 r.coords.setSize(W,700,1);r.coords.setBars(Array.from({length:n},(_,i)=>Date.UTC(2024,0,1)+i*DAY));
 return r;
}
/** Bars of empty plot left of the oldest bar and right of the newest bar, and the bars on screen. */
function view(r:any){
 const n=r.coords.barCount,{barSpacing,rightOffset}=r.coords.getViewport(),vis=W/(barSpacing*r.coords.spacingScale);
 const left=n-1+rightOffset-vis;
 return{vis,emptyLeft:Math.max(0,-left),emptyRight:Math.max(0,rightOffset),newestShown:rightOffset>=0,shownBars:Math.min(n-1,n-1+rightOffset)-Math.max(0,left)};
}
const at=(r:any,bars:number,rightOffset:number)=>r.applyViewport({barSpacing:W/bars,rightOffset});

describe('CHART-NAV-1021 pan bounds (bugs N1, N2)',()=>{
 it('N1: a drag far past the oldest bar stops with the bars still filling the plot (was 2 bars at the right edge)',()=>{
  const r=chart(500);at(r,200,6);at(r,200,-100000);
  const v=view(r);
  expect(v.emptyLeft).toBeLessThanOrEqual(Math.min(6,v.vis*0.1)+1e-9);
  expect(v.shownBars).toBeGreaterThan(v.vis*0.85);
 });
 it('N2: a drag far past the newest bar stops with the newest bar at mid-plot (was 2 bars at the left edge)',()=>{
  const r=chart(500);at(r,200,6);at(r,200,100000);
  const v=view(r);
  expect(v.emptyRight).toBeLessThanOrEqual(v.vis*0.5+1e-9);
  expect(v.shownBars).toBeGreaterThanOrEqual(v.vis*0.5-1);
 });
 it('a configured right margin wider than half the plot is still honoured',()=>{
  const r=chart(500);r.scene.style.margins.right=150;at(r,200,150);
  expect(r.coords.getViewport().rightOffset).toBe(150);
 });
});
describe('CHART-NAV-1021 zoom out past the loaded data (bug N3)',()=>{
 it('N3: wheel zoom-out while panned back ends with every bar on screen, not a blank left half with the newest bars hidden',()=>{
  const r=chart(500);at(r,200,-200);
  r.zoomTo(0.5,r.coords.rightEdgeLogical,W);
  const v=view(r);
  expect(v.emptyLeft).toBeLessThanOrEqual(6+1e-9);
  expect(v.newestShown).toBe(true);
  expect(v.shownBars).toBe(499);
 });
 it('cursor-anchored zoom-out at the left edge while panned back also fills the plot',()=>{
  const r=chart(300);at(r,100,-150);
  r.zoomTo(0.5,r.coords.xToLogical(20),20);
  const v=view(r);expect(v.emptyLeft).toBeLessThanOrEqual(6+1e-9);expect(v.newestShown).toBe(true);
 });
});
describe('CHART-NAV-1021 unchanged behaviour',()=>{
 it('the default view, zoom-out from the live edge and the zoom-in limit are unchanged',()=>{
  const r=chart(500);at(r,200,6);
  expect(r.coords.getViewport()).toEqual({barSpacing:W/200,rightOffset:6});
  r.zoomTo(0.5,r.coords.rightEdgeLogical,W);
  const v=view(r);expect(v.vis).toBeCloseTo(506,6);expect(r.coords.getViewport().rightOffset).toBe(6);
  r.zoomTo(10000,r.coords.rightEdgeLogical,W);expect(view(r).vis).toBeCloseTo(2,6);
 });
 it('a short history (3 bars) keeps a finite, ordered viewport',()=>{
  const r=chart(3);at(r,3,-1000);let vp=r.coords.getViewport();expect(Number.isFinite(vp.rightOffset)).toBe(true);
  at(r,3,1000);vp=r.coords.getViewport();expect(Number.isFinite(vp.rightOffset)).toBe(true);expect(view(r).shownBars).toBeGreaterThanOrEqual(1);
 });
});
describe('CHART-NAV-1021 time-axis reset (LANE-BD2 D2, bug N4)',()=>{
 it('N4: a time-axis double-click (resetView) resets the time scale and keeps a manual price scale',()=>{
  const r=chart(500);r.scene.ensurePane('price','price',0,3);
  const pane=r.scene.panes.get('price');pane.manualScale={min:10,max:20};
  at(r,50,-300);r.resetView();
  expect(pane.manualScale).toEqual({min:10,max:20});
  expect(r.coords.getViewport().rightOffset).toBe(r.scene.style.margins.right);
  expect(view(r).vis).toBeCloseTo(200+r.scene.style.margins.right,6);
 });
});
describe('CHART-NAV-1021 handle hover cursor (DRAW-QUALITY item 2, N5)',()=>{
 const {readFileSync}=require('node:fs') as typeof import('node:fs');
 const source=readFileSync('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js','utf8');
 const body=/\n  cursorAt\(x, y\) \{\n    if \(this\.deps\.activeTool\(\) != null\) return null;\n([\s\S]*?)\n  \}\n/.exec(source)![1];
 const cursorAt=new Function('HIT_TOLERANCE','return function(x,y){if (this.deps.activeTool() != null) return null;\n'+body+'}')(6);
 const host=(handle:boolean,locked=false)=>{const d={locked,hitHandle:()=>handle?0:-1};return{deps:{activeTool:()=>null,projector:()=>({})},handleDrawings:()=>[d],hitAt:()=>d};};
 it('N5: a shown, unlocked handle shows the move cursor; a body keeps pointer; a locked handle keeps pointer',()=>{
  expect(cursorAt.call(host(true),1,1)).toBe('move');
  expect(cursorAt.call(host(false),1,1)).toBe('pointer');
  expect(cursorAt.call(host(true,true),1,1)).toBe('pointer');
  expect(cursorAt.call({...host(false),hitAt:()=>null},1,1)).toBeNull();
 });
});
describe('LV-VELA-COMPAT-7 plan (LV-VELA-NAV-1)',async()=>{
 const {readFileSync}=await import('node:fs');const {resolve}=await import('node:path');const {createHash}=await import('node:crypto');
 const {patchPlan,validatePatchPlan,prepareCandidate,restoreMagnetCandidate,compat7StepIds,compat8StepIds,compat9StepIds,compat10StepIds,compat11StepIds}=await import('../../src/chart/apply-vela-compat-patch.mjs');
 const plan=patchPlan as any,sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
 it('appends exactly the three LV-VELA-NAV-1 steps to each runtime input, with notices, and every prior state reaches the pinned output',()=>{
  // LV-VELA-COMPAT-8 appends the nineteen scale-left steps after the nav steps; they are reversed first.
  // LV-VELA-COMPAT-9 appends the nine forward steps after those; they are reversed with them.
  // LV-VELA-COMPAT-10 appends the ten scale-group steps after those; they are reversed with them too.
  // LV-VELA-COMPAT-11 appends the twelve render-leftover steps after those; they are reversed with them too.
  expect(plan.id).toBe('LV-VELA-COMPAT-11');expect(plan.components.at(-5)).toBe('LV-VELA-NAV-1');expect(plan.components.at(-4)).toBe('LV-VELA-SCALE-LEFT-1');expect(plan.components.at(-3)).toBe('LV-VELA-FORWARD-1');expect(plan.components.at(-2)).toBe('LV-VELA-SCALE-GROUPS-1');expect(plan.components.at(-1)).toBe('LV-VELA-RENDER-LEFTOVERS-1');expect([...compat7StepIds]).toEqual(['nav-clamp','nav-reset-time','nav-handle-cursor']);
  for(const row of plan.files){
   const installed=readFileSync(resolve('node_modules/@luxalgo/vela',row.path));expect(sha(installed),row.path).toBe(row.afterSha256);
   if(!row.magnetSha256){expect(row.compat6Sha256).toBe(row.afterSha256);continue;}
   const steps=row.transformations.slice(-53,-50);expect(steps.map((step:any)=>step.id)).toEqual([...compat7StepIds]);
   let text=installed.toString('utf8');
   const later=row.transformations.slice(-50);expect(later.map((step:any)=>step.id)).toEqual([...compat8StepIds,...compat9StepIds,...compat10StepIds,...compat11StepIds]);
   for(const step of [...later].reverse()){expect(text.split(step.after)).toHaveLength(2);text=text.replace(step.after,step.before);}
   expect(sha(Buffer.from(text))).toBe(row.compat7Sha256);
   for(const step of [...steps].reverse()){expect(step.after).toContain('/*! LarryVision LV-VELA-NAV-1');expect(text.split(step.after)).toHaveLength(2);text=text.replace(step.after,step.before);}
   const compat6=Buffer.from(text);expect(sha(compat6)).toBe(row.compat6Sha256);
   expect(sha(prepareCandidate(compat6,row))).toBe(row.afterSha256);
   expect(sha(prepareCandidate(restoreMagnetCandidate(installed,row),row))).toBe(row.afterSha256);
  }
 },30_000); // Ten more trailing steps per runtime input took this over the 5 s default (6.7 s under parallel load).
 it('refuses a plan whose nav-clamp step lost its notice or that drops a nav step',()=>{
  const broken=structuredClone(plan);const step=broken.files[0].transformations.find((item:any)=>item.id==='nav-clamp');step.after=step.after.replace('/*! LarryVision','/* none');
  expect(()=>validatePatchPlan(broken)).toThrow();
  const short=structuredClone(plan);short.files[0].transformations.pop();expect(()=>validatePatchPlan(short)).toThrow();
 });
});
