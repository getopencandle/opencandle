import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import * as patch from '../../src/chart/apply-vela-compat-patch.mjs';
import plan from '../../src/chart/vela-compat-patch-plan.json';

// LV-VELA-RENDER-LEFTOVERS-1 (LV-VELA-COMPAT-11) on the installed renderer. The installed chunk is loaded from a
// temporary copy under .tmp (deleted right after import); the hash-proven COMPAT-10 renderer (the installed chunk with the twelve
// COMPAT-11 steps reversed) is the native baseline. SYNTHETIC bars and series; recording canvas contexts; a minimal element
// stand-in. No GUI, pixel or packaged-build claim.
const compat11StepIds=(patch as unknown as {compat11StepIds?:readonly string[]}).compat11StepIds??[];
interface Chunk {NativeRenderer:new()=>any;Orchestrator:any;modelToValuePatch:(model:any)=>any;applyPatch:(model:any,patch:any)=>void}
async function loadChunk(reverse:boolean):Promise<Chunk>{
 const row=plan.files.find(item=>item.path==='dist/chunk-UNUVPQFW.js')! as any;
 const file=resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js');let source=readFileSync(file,'utf8');
 expect(createHash('sha256').update(source).digest('hex')).toBe(row.afterSha256);
 if(reverse){
  for(const step of (row.transformations as Array<{id:string;before:string;after:string}>).filter(item=>compat11StepIds.includes(item.id)).reverse()){expect(source.split(step.after)).toHaveLength(2);source=source.replace(step.after,()=>step.before);}
  expect(createHash('sha256').update(source).digest('hex')).toBe(row.compat10Sha256);
 }
 const temporary=resolve('.tmp',`vela-compat11-${reverse?'compat10':'compat11'}-${randomUUID()}.mjs`);mkdirSync(dirname(temporary),{recursive:true});
 try{
  writeFileSync(temporary,source.replace(/(from\s+['"])(\.\/[^'"]+)(['"])/g,(_all,before,relative,after)=>before+pathToFileURL(resolve(dirname(file),relative)).href+after)+'\nexport { NativeRenderer as LVNativeRenderer, EngineOrchestrator as LVOrchestrator, modelToValuePatch as LVModelToValuePatch, applyPatch as LVApplyPatch };\n');
  const module=await import(/* @vite-ignore */pathToFileURL(temporary).href);
  return{NativeRenderer:module.LVNativeRenderer,Orchestrator:module.LVOrchestrator,modelToValuePatch:module.LVModelToValuePatch,applyPatch:module.LVApplyPatch};
 }finally{try{unlinkSync(temporary);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
}
let now:Chunk,compat10:Chunk;
beforeAll(async()=>{now=await loadChunk(false);compat10=await loadChunk(true);},60000);
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
const model=(id:string,base:number,k:number)=>({id,title:id,paneId:'price',ownScale:true,overlay:true,paneHint:'price',
 series:[{id:id+'-s',title:'SYNTHETIC',paneId:'price',kind:'line',points:bars.map((b,i)=>({time:b.time,value:base+k*(i+1)})),style:{color:'#ffffff',lineWidth:1,lineStyle:'solid'}}],
 fills:[],backgrounds:[],priceLines:[],inputs:[],inputValues:{},from:T0,to:T0+49*BAR});

/** One price pane on an 800 x 560 plot with three own-scale indicators: a (100..150), b (1000..1500) and c (5..10). */
function rig(chunk:Chunk,options:{group?:boolean;left?:boolean}={}){
 vi.stubGlobal('document',{createElement:()=>element()});
 const r=new chunk.NativeRenderer() as any;
 r.scheduler={invalidate(){},cancel(){}};r.animator={active:false,stop(){},start(){}};
 r.inputsUI={upsert(){},remove(){},setValues(){},setVisible(){},setPane(){},setCollapsedPanes(){},reposition(){}};
 r.wrapper={clientWidth:0,clientHeight:0,appendChild(child:unknown){return child;}};r.plot=element();
 const price=r.scene.ensurePane('price','price',0,3);price.bounds={top:0,height:560};
 r.coords.setSize(800,560,1);r.coords.setBars(bars.map(b=>b.time));r.bars=bars;r.scene.bars=bars;r.scene.timezone='UTC';
 r.scene.showPriceLabel=true;r.scene.showPriceLine=true;r.scene.showCountdown=false;
 for(const m of [model('a',100,1),model('b',1000,10),model('c',5,0.1)])r.mountIndicator(m);
 r.setIndicatorPane({id:'a'},'price',{ownScale:true,...options.group?{lvScaleGroup:'g'}:{}});
 r.setIndicatorPane({id:'b'},'price',{ownScale:true,...options.group?{lvScaleGroup:'g'}:{}});
 r.setIndicatorPane({id:'c'},'price',{ownScale:true,...options.left?{lvScalePlacement:'left'}:{}});
 r.layoutPanes();
 const main=recorder();r.chrome.mount(main.canvas);
 const frame=()=>{main.commands.length=0;r.computeScales();r.chrome.render(r.scene,r.coords,r.theme,{background:'#000000',textColor:'#cccccc'});return main.commands.slice();};
 return{r,price,frame};
}

describe('LV-VELA-COMPAT-11 plan',()=>{
 it('appends the twelve leftover steps last in every runtime row, with the notice on leftovers-scene; declarations unchanged',()=>{
  expect(plan.id).toBe('LV-VELA-COMPAT-11');expect((plan as any).schemaVersion).toBe(11);expect(plan.components.at(-1)).toBe('LV-VELA-RENDER-LEFTOVERS-1');expect(plan.components).toHaveLength(13);
  expect([...compat11StepIds]).toEqual(['leftovers-scene','leftovers-handoff-set-pane','leftovers-handoff-set-pane-adopt','leftovers-handoff-remove','leftovers-handoff-remove-adopt','leftovers-real-bars-series','leftovers-real-bars-transform','leftovers-layer-args','leftovers-native-bar-colors','leftovers-value-patch-bar-colors','leftovers-apply-patch-bar-colors','leftovers-hover-api']);
  for(const row of plan.files as any[]){
   if(!row.path.endsWith('.js')&&!row.path.endsWith('.cjs')){expect(row.afterSha256).toBe(row.compat10Sha256);continue;}
   expect(row.transformations.slice(-12).map((s:any)=>s.id)).toEqual([...compat11StepIds]);
   expect(row.transformations.find((s:any)=>s.id==='leftovers-scene').after).toContain('/*! LarryVision LV-VELA-RENDER-LEFTOVERS-1');
   // Only one COMPAT-11 anchor lies inside an earlier step's after text (the COMPAT-5 setIndicatorPane opening), so a rebuild of an
   // earlier state reverses the COMPAT-11 steps first, as the COMPAT-10 rebuilds did.
   const inside=row.transformations.slice(-12).flatMap((step:any)=>row.transformations.slice(0,-12).filter((earlier:any)=>earlier.after.includes(step.before)).map((earlier:any)=>step.id+' in '+earlier.id));
   expect(inside).toEqual(['leftovers-handoff-set-pane in scale-placement-set-pane']);
  }
 });
});

describe('frames without the new features',()=>{
 it('chrome command streams equal the COMPAT-10 renderer: ungrouped scales, a steady group and a left scale',()=>{
  for(const options of [{},{group:true},{group:true,left:true}]){
   const a=rig(now,options),b=rig(compat10,options);
   expect(JSON.stringify(a.frame())).toBe(JSON.stringify(b.frame()));
   expect(JSON.stringify(a.frame())).toBe(JSON.stringify(b.frame()));
  }
 });
 it('a native model without barColors and a value patch without them are unchanged; layer args only add the two OpenCandle fields',()=>{
  const record={id:'n',title:'N',native:{type:'t',descriptor:{overlay:true,paneHint:'price',inputsSchema:()=>[]}},inputValues:{}},out={series:[],fills:[],backgrounds:[],priceLines:[]};
  const self={nativeChannel:()=> 't'};
  expect(now.Orchestrator.prototype.buildNativeModel.call(self,record,out)).toEqual(compat10.Orchestrator.prototype.buildNativeModel.call(self,record,out));
  const plain={id:'n',series:[],lines:[],boxes:[],labels:[]};
  expect(now.modelToValuePatch(plain)).toEqual(compat10.modelToValuePatch(plain));
  const x=rig(now),y=rig(compat10),layer={channel:'c',def:{id:'d'}};
  const before=y.r.extLayerArgs(layer,y.price.scale,y.price.bounds,0),after=x.r.extLayerArgs(layer,x.price.scale,x.price.bounds,0);
  expect(Object.keys(after)).toEqual([...Object.keys(before),'lvRealBars','lvBarColors']);
  expect(after.lvRealBars).toBeNull();expect(after.lvBarColors.size).toBe(0);
 });
});

describe('scale-group slot handover',()=>{
 it('the next member holds a copy of the slot at once when the holder leaves the group or is removed; COMPAT-10 leaves a gap',()=>{
  for(const leave of ['own','remove','none'] as const){
   for(const chunk of [now,compat10]){
    const {r,frame}=rig(chunk,{group:true});frame();
    expect(r.scene.lvScaleKey('b')).toBe('a');const held=r.scene.indicatorScales.get('a');expect(held).toBeTruthy();
    if(leave==='remove')r.removeIndicator({id:'a'});
    else r.setIndicatorPane({id:'a'},'price',{ownScale:leave==='own'});
    expect(r.scene.lvScaleKey('b')).toBe('b');
    const slot=r.scene.indicatorScales.get('b');
    if(chunk===compat10){expect(slot).toBeUndefined();continue;}
    expect(slot).toBeTruthy();expect(slot).not.toBe(held);expect(slot.scale).toEqual(held.scale);expect(slot.scale).not.toBe(held.scale);expect(slot.initialized).toBe(held.initialized);
    if(leave==='own')expect(r.scene.indicatorScales.get('a')).toBe(held);
    frame();expect(r.scene.indicatorScales.get('b')).toBe(slot);
   }
  }
 });
 it('a non-holder leaving, or the holder re-joining its own group, moves nothing',()=>{
  const {r,frame}=rig(now,{group:true});frame();const held=r.scene.indicatorScales.get('a');
  r.setIndicatorPane({id:'a'},'price',{ownScale:true,lvScaleGroup:'g'});expect(r.scene.indicatorScales.get('a')).toBe(held);expect(r.scene.indicatorScales.has('b')).toBe(false);
  r.setIndicatorPane({id:'b'},'price',{ownScale:true});expect(r.scene.indicatorScales.get('a')).toBe(held);
 });
});

describe('raw bars, bar colors and hover',()=>{
 const raw=[{time:1,open:10,high:12,low:9,close:11},{time:2,open:11,high:13,low:10,close:12}];
 const transform={full:(rows:any[])=>rows.map(row=>({...row,close:row.close+100})),next:(row:any)=>({...row,close:row.close+100})};
 it('a bar-transform chart keeps its raw bars on the renderer; none without a transform; COMPAT-10 keeps nothing',()=>{
  for(const chunk of [now,compat10]){
   const renderer:any={setBars(){}},self:any={barTransform:transform,renderer,endLoad(){}};
   chunk.Orchestrator.prototype.setBarSeries.call(self,raw);
   expect(renderer.lvRealBars).toBe(chunk===now?raw:undefined);
   self.barTransform=null;chunk.Orchestrator.prototype.setBarSeries.call(self,raw);expect(renderer.lvRealBars).toBe(chunk===now?null:undefined);
   const sync:any={barTransform:null,rawBars:raw,renderer,reexecuteIndicators(){}};
   chunk.Orchestrator.prototype.syncBarTransform.call(sync,'heikinashi');
   if(chunk===now)expect(renderer.lvRealBars).toBe(sync.barTransform?raw:null);
  }
  const {r,price}=rig(now);r.lvRealBars=raw;expect(r.extLayerArgs({channel:'c',def:{id:'d'}},price.scale,price.bounds,0).lvRealBars).toBe(raw);
 });
 it('native outputs keep barColors, value patches carry and apply them, and layers get the merged map',()=>{
  const record={id:'n',title:'N',native:{type:'t',descriptor:{overlay:true,paneHint:'price',inputsSchema:()=>[]}},inputValues:{}},barColors=[{time:bars[3].time,color:'#ff00ff'}];
  const built=now.Orchestrator.prototype.buildNativeModel.call({nativeChannel:()=> 't'},record,{series:[],barColors});
  expect(built.barColors).toBe(barColors);
  expect(compat10.Orchestrator.prototype.buildNativeModel.call({nativeChannel:()=> 't'},record,{series:[],barColors}).barColors).toBeUndefined();
  const value=now.modelToValuePatch({id:'n',series:[],barColors});expect(value.barColors).toBe(barColors);
  const mounted:any={series:[],barColors:[{time:1,color:'#000000'}]};now.applyPatch(mounted,now.modelToValuePatch({id:'n',series:[],barColors:[]}));expect(mounted.barColors).toEqual([]);
  const {r,price}=rig(now);r.scene.indicators.get('a').barColors=barColors;
  expect([...r.extLayerArgs({channel:'c',def:{id:'d'}},price.scale,price.bounds,0).lvBarColors]).toEqual([[bars[3].time,'#ff00ff']]);
 });
 it('the renderer reports the hovered drawing id; COMPAT-10 has no reader',()=>{
  const {r}=rig(now);expect(r.lvHoveredDrawingId()).toBeNull();r.userDrawings={hoveredId:'d1'};expect(r.lvHoveredDrawingId()).toBe('d1');
  r.userDrawings={hoveredId:7};expect(r.lvHoveredDrawingId()).toBeNull();
  expect(typeof rig(compat10).r.lvHoveredDrawingId).toBe('undefined');
 });
});
