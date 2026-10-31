import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import * as patch from '../../src/chart/apply-vela-compat-patch.mjs';
import plan from '../../src/chart/vela-compat-patch-plan.json';

// LV-VELA-SCALE-GROUPS-1 (LV-VELA-COMPAT-10) on the installed renderer. The installed chunk is loaded from a
// temporary copy under .tmp (deleted right after import); the hash-proven COMPAT-9 renderer (the installed chunk with the ten
// COMPAT-10 steps reversed) is the native baseline. SYNTHETIC bars and series; recording canvas contexts; a minimal element
// stand-in. No GUI, pixel or packaged-build claim.
const compat10StepIds=(patch as unknown as {compat10StepIds?:readonly string[]}).compat10StepIds??[];
// LV-VELA-COMPAT-11 appends the twelve render-leftover steps after the scale-group steps; the COMPAT-9 baseline
// reverses them first. The renderer under test stays the installed one.
const compat11StepIds=(patch as unknown as {compat11StepIds?:readonly string[]}).compat11StepIds??[];
interface Chunk {NativeRenderer:new()=>any}
async function loadChunk(reverse:boolean):Promise<Chunk>{
 const row=plan.files.find(item=>item.path==='dist/chunk-UNUVPQFW.js')! as any;
 const file=resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js');let source=readFileSync(file,'utf8');
 expect(createHash('sha256').update(source).digest('hex')).toBe(row.afterSha256);
 if(reverse){
  for(const step of (row.transformations as Array<{id:string;before:string;after:string}>).filter(item=>compat10StepIds.includes(item.id)||compat11StepIds.includes(item.id)).reverse()){expect(source.split(step.after)).toHaveLength(2);source=source.replace(step.after,()=>step.before);}
  expect(createHash('sha256').update(source).digest('hex')).toBe(row.compat9Sha256);
 }
 const temporary=resolve('.tmp',`vela-scale-groups-${reverse?'compat9':'compat10'}-${randomUUID()}.mjs`);mkdirSync(dirname(temporary),{recursive:true});
 try{
  writeFileSync(temporary,source.replace(/(from\s+['"])(\.\/[^'"]+)(['"])/g,(_all,before,relative,after)=>before+pathToFileURL(resolve(dirname(file),relative)).href+after)+'\nexport { NativeRenderer as LVNativeRenderer };\n');
  const module=await import(/* @vite-ignore */pathToFileURL(temporary).href);
  return{NativeRenderer:module.LVNativeRenderer};
 }finally{try{unlinkSync(temporary);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
}
let now:Chunk,compat9:Chunk;
beforeAll(async()=>{now=await loadChunk(false);compat9=await loadChunk(true);});
afterEach(()=>{vi.unstubAllGlobals();});

type Command=[string,...unknown[]];
function recorder(){
 const commands:Command[]=[],state:Record<string|symbol,unknown>={};
 const ctx=new Proxy(state,{get(target,key){if(key==='measureText')return(text:string)=>({width:String(text).length*6});if(key in target)return target[key];if(key==='getLineDash')return()=>[];if(key==='createLinearGradient')return()=>({addColorStop(){}});if(key==='getImageData')return()=>({data:[0,0,0,255]});return(...values:unknown[])=>{commands.push([String(key),...values]);};},set(target,key,value){target[key]=value;commands.push(['set:'+String(key),value]);return true;}});
 return{ctx,commands,canvas:{width:864,height:600,getContext:()=>ctx}};
}
function element(){
 const r=recorder();
 return Object.assign(r.canvas,{className:'',style:{setProperty(){}} as Record<string,any>,attributes:{} as Record<string,string>,children:[] as any[],
  setAttribute(name:string,value:string){this.attributes[name]=value;},addEventListener(){},appendChild(child:unknown){this.children.push(child);return child;},
  getBoundingClientRect:()=>({left:0,top:0,width:800,height:560,right:800,bottom:560})});
}
const T0=Date.UTC(2023,10,14,22,0),BAR=60_000;
const bars=Array.from({length:50},(_,i)=>({time:T0+i*BAR,open:100+i,high:101+i,low:99+i,close:100+i,volume:10}));
/** A SYNTHETIC line indicator whose values run from base+k to base+50k. */
const model=(id:string,base:number,k:number)=>({id,title:id,paneId:'price',ownScale:true,overlay:true,paneHint:'price',
 series:[{id:id+'-s',title:'SYNTHETIC',paneId:'price',kind:'line',points:bars.map((b,i)=>({time:b.time,value:base+k*(i+1)})),style:{color:'#ffffff',lineWidth:1,lineStyle:'solid'}}],
 fills:[],backgrounds:[],priceLines:[],inputs:[],inputValues:{},from:T0,to:T0+49*BAR});

/** One price pane on an 800 x 560 plot with three own-scale indicators: a (100..150), b (1000..1500) and c (5..10). */
function rig(chunk:Chunk){
 vi.stubGlobal('document',{createElement:()=>element()});
 const r=new chunk.NativeRenderer() as any;
 r.scheduler={invalidate(){},cancel(){}};r.animator={active:false,stop(){},start(){}};
 r.inputsUI={upsert(){},remove(){},setValues(){},setVisible(){},setPane(){},setCollapsedPanes(){},reposition(){}};
 r.wrapper={clientWidth:0,clientHeight:0,appendChild(child:unknown){return child;}};r.plot=element();
 const price=r.scene.ensurePane('price','price',0,3);price.bounds={top:0,height:560};
 r.coords.setSize(800,560,1);r.coords.setBars(bars.map(b=>b.time));r.bars=bars;r.scene.bars=bars;r.scene.timezone='UTC';
 r.scene.showPriceLabel=false;r.scene.showPriceLine=false;r.scene.showCountdown=false;
 for(const m of [model('a',100,1),model('b',1000,10),model('c',5,0.1)])r.mountIndicator(m);
 for(const id of ['a','b','c'])r.setIndicatorPane({id},'price',{ownScale:true});
 r.layoutPanes();
 const main=recorder();r.chrome.mount(main.canvas);
 const frame=()=>{main.commands.length=0;r.computeScales();r.chrome.render(r.scene,r.coords,r.theme,{background:'#000000',textColor:'#cccccc'});return main.commands.slice();};
 return{r,price,frame};
}
// Column order follows the native z order; the checks compare the column holders as sorted sets.
const columns=(r:any)=>r.scene.ownScaleIndicatorsForPane('price').map((m:any)=>m.id).sort();
const leftColumns=(r:any)=>r.scene.lvLeftScaleIndicatorsForPane('price').map((m:any)=>m.id).sort();

describe('LV-VELA-COMPAT-10 plan',()=>{
 it('appends the ten scale-group steps before the COMPAT-11 steps in every runtime row, with the notice on scale-groups-scene',()=>{
  expect(plan.id).toBe('LV-VELA-COMPAT-11');expect((plan as any).schemaVersion).toBe(11);expect(plan.components.at(-2)).toBe('LV-VELA-SCALE-GROUPS-1');
  expect([...compat10StepIds]).toEqual(['scale-groups-scene','scale-groups-left-columns','scale-groups-slot','scale-groups-scale-for','scale-groups-autoscale','scale-groups-invert','scale-groups-set-pane','scale-groups-set-pane-record','scale-groups-api','scale-groups-remove']);
  for(const row of plan.files as any[]){
   if(!row.path.endsWith('.js')&&!row.path.endsWith('.cjs')){expect(row.afterSha256).toBe(row.compat9Sha256);continue;}
   expect(row.transformations.slice(-22,-12).map((s:any)=>s.id)).toEqual([...compat10StepIds]);
   expect(row.transformations.find((s:any)=>s.id==='scale-groups-scene').after).toContain('/*! LarryVision LV-VELA-SCALE-GROUPS-1 modification, 2026-10-22.');
  }
 });
});

describe('LV-VELA-SCALE-GROUPS-1 on the installed renderer',()=>{
 it('without a group every own scale keeps its own column and the frame is byte-identical to COMPAT-9',()=>{
  const a=rig(now),b=rig(compat9);
  expect(columns(a.r)).toEqual(['a','b','c']);expect(a.r.rightAxisW).toBe(b.r.rightAxisW);
  expect(JSON.stringify(a.frame())).toBe(JSON.stringify(b.frame()));
  for(const id of ['a','b','c'])expect(a.r.lvIndicatorScaleGroup(id)).toBeNull();
 });
 it('two members of one group share one right column, one scale slot and a scale that fits both; COMPAT-9 cannot',()=>{
  const {r,price,frame}=rig(now);const before=r.rightAxisW;
  r.setIndicatorPane({id:'a'},'price',{ownScale:true,lvScaleGroup:'g1'});r.setIndicatorPane({id:'b'},'price',{ownScale:true,lvScaleGroup:'g1'});
  expect(columns(r)).toEqual(['a','c']);expect(r.maxOwnScaleColumns()).toBe(2);expect(r.rightAxisW).toBe(before-56);
  expect(r.lvIndicatorScaleGroup('b')).toBe('g1');expect(r.lvIndicatorScaleHolder('b')).toBe('a');expect(r.lvIndicatorScaleHolder('a')).toBe('a');expect(r.lvIndicatorScaleHolder('c')).toBe('c');
  frame();
  const sa=r.scene.scaleFor(r.scene.indicators.get('a'),price),sb=r.scene.scaleFor(r.scene.indicators.get('b'),price),sc=r.scene.scaleFor(r.scene.indicators.get('c'),price);
  expect(sb).toBe(sa);expect(sc).not.toBe(sa);expect(r.scene.indicatorScales.has('b')).toBe(false);
  // The shared window covers a (101..150) and b (1010..1500), so its range spans both; c keeps its own 5.1..10 window.
  expect(sa.min).toBeLessThanOrEqual(101);expect(sa.max).toBeGreaterThanOrEqual(1500);expect(sc.max).toBeLessThan(20);
  // The pane hit test on the shared column (wherever z order puts it) resolves the shared slot.
  const k=r.scene.ownScaleIndicatorsForPane('price').findIndex((m:any)=>m.id==='a');expect(k).toBeGreaterThanOrEqual(0);
  expect(r.resolveScaleHolder(r.coords.width+64+k*56+5,100).holder).toBe(r.scene.indicatorScales.get('a'));
  const old=rig(compat9).r;old.setIndicatorPane({id:'a'},'price',{ownScale:true,lvScaleGroup:'g1'});old.setIndicatorPane({id:'b'},'price',{ownScale:true,lvScaleGroup:'g1'});
  expect(columns(old)).toEqual(['a','b','c']);expect(old.lvIndicatorScaleGroup).toBeUndefined();
 });
 it('a left group is one left column; groups on different sides or names stay apart',()=>{
  const {r}=rig(now);
  r.setIndicatorPane({id:'a'},'price',{ownScale:true,lvScalePlacement:'left',lvScaleGroup:'g1'});r.setIndicatorPane({id:'b'},'price',{ownScale:true,lvScalePlacement:'left',lvScaleGroup:'g1'});
  expect(leftColumns(r)).toEqual(['a']);expect(r.lvLeftScaleWidth()).toBe(64);expect(columns(r)).toEqual(['c']);
  r.setIndicatorPane({id:'c'},'price',{ownScale:true,lvScaleGroup:'g1'});
  expect(r.lvIndicatorScaleHolder('c')).toBe('c');expect(columns(r)).toEqual(['c']);
  r.setIndicatorPane({id:'b'},'price',{ownScale:true,lvScalePlacement:'left',lvScaleGroup:'g2'});
  expect(leftColumns(r)).toEqual(['a','b']);
 });
 it('leaving the group, a native move without a group and removing the holder give each member its own column back',()=>{
  const {r,frame}=rig(now);
  for(const id of ['a','b','c'])r.setIndicatorPane({id},'price',{ownScale:true,lvScaleGroup:'g'});
  expect(columns(r)).toEqual(['a']);frame();
  r.setIndicatorPane({id:'c'},'price',{ownScale:true});expect(r.lvIndicatorScaleGroup('c')).toBeNull();expect(columns(r)).toEqual(['a','c']);
  r.removeIndicator({id:'a'});expect(r.lvIndicatorScaleHolder('b')).toBe('b');expect(columns(r)).toEqual(['b','c']);frame();expect(r.scene.indicatorScales.has('b')).toBe(true);
  r.setIndicatorPane({id:'b'},'price',{ownScale:false});expect(r.lvIndicatorScaleGroup('b')).toBeNull();expect(r.scene.lvScaleGroups.has('b')).toBe(false);
 });
 it('refuses a group without an own right or left scale, or with a bad id, before any change',()=>{
  const {r}=rig(now);const snapshot=()=>JSON.stringify({cols:columns(r),left:leftColumns(r),groups:[...(r.scene.lvScaleGroups??new Map())],placements:[...(r.scene.lvScalePlacements??new Map())]});
  const before=snapshot();
  expect(()=>r.setIndicatorPane({id:'a'},'price',{ownScale:false,lvScaleGroup:'g'})).toThrow(TypeError);
  expect(()=>r.setIndicatorPane({id:'a'},'price',{ownScale:true,lvScalePlacement:'none',lvScaleGroup:'g'})).toThrow(TypeError);
  for(const bad of ['',7,'x'.repeat(201),'a\u0000b'])expect(()=>r.setIndicatorPane({id:'a'},'price',{ownScale:true,lvScaleGroup:bad}),String(bad)).toThrow(TypeError);
  expect(snapshot()).toBe(before);
 });
});
