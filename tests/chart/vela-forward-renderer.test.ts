import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import * as patch from '../../src/chart/apply-vela-compat-patch.mjs';
import plan from '../../src/chart/vela-compat-patch-plan.json';

// LV-VELA-FORWARD-1 (LV-VELA-COMPAT-9) on the installed renderer. The installed chunk is loaded from a
// temporary copy under .tmp (deleted right after import) so the non-exported Canvas2dBackend and WebGL2Backend run too; the
// hash-proven COMPAT-8 renderer (the installed chunk with the nine COMPAT-9 steps reversed) is the native baseline.
// SYNTHETIC bars and series; recording canvas contexts and a recording GL batch. No GUI, pixel or packaged-build claim.
const compat9StepIds=(patch as unknown as {compat9StepIds?:readonly string[]}).compat9StepIds??[];
// LV-VELA-COMPAT-10 appends the ten scale-group steps after the forward steps; they are reversed with them.
const compat10StepIds=(patch as unknown as {compat10StepIds?:readonly string[]}).compat10StepIds??[];
// LV-VELA-COMPAT-11 appends the twelve render-leftover steps after those; they are reversed with them.
const compat11StepIds=(patch as unknown as {compat11StepIds?:readonly string[]}).compat11StepIds??[];
interface Chunk {NativeRenderer:new()=>any;Canvas2dBackend:new()=>any;WebGL2Backend:new()=>any}
async function loadChunk(reverse:boolean):Promise<Chunk>{
 const row=plan.files.find(item=>item.path==='dist/chunk-UNUVPQFW.js')! as any;
 const file=resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js');let source=readFileSync(file,'utf8');
 expect(createHash('sha256').update(source).digest('hex')).toBe(row.afterSha256);
 if(reverse){
  for(const step of (row.transformations as Array<{id:string;before:string;after:string}>).filter(item=>compat9StepIds.includes(item.id)||compat10StepIds.includes(item.id)||compat11StepIds.includes(item.id)).reverse()){expect(source.split(step.after)).toHaveLength(2);source=source.replace(step.after,()=>step.before);}
  expect(createHash('sha256').update(source).digest('hex')).toBe(row.compat8Sha256);
 }
 const temporary=resolve('.tmp',`vela-forward-${reverse?'compat8':'compat9'}-${randomUUID()}.mjs`);mkdirSync(dirname(temporary),{recursive:true});
 try{
  writeFileSync(temporary,source.replace(/(from\s+['"])(\.\/[^'"]+)(['"])/g,(_all,before,relative,after)=>before+pathToFileURL(resolve(dirname(file),relative)).href+after)+'\nexport { NativeRenderer as LVNativeRenderer, Canvas2dBackend as LVCanvas2dBackend, WebGL2Backend as LVWebGL2Backend };\n');
  const module=await import(/* @vite-ignore */pathToFileURL(temporary).href);
  return{NativeRenderer:module.LVNativeRenderer,Canvas2dBackend:module.LVCanvas2dBackend,WebGL2Backend:module.LVWebGL2Backend};
 }finally{try{unlinkSync(temporary);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
}
let now:Chunk,compat8:Chunk;
beforeAll(async()=>{now=await loadChunk(false);compat8=await loadChunk(true);});
afterEach(()=>{vi.unstubAllGlobals();});

type Command=[string,...unknown[]];
function recorder(){
 const commands:Command[]=[],state:Record<string|symbol,unknown>={};
 const ctx=new Proxy(state,{get(target,key){if(key==='measureText')return(text:string)=>({width:String(text).length*6});if(key in target)return target[key];if(key==='getLineDash')return()=>[];if(key==='createLinearGradient')return()=>({addColorStop(){}});if(key==='getImageData')return()=>({data:[0,0,0,255]});return(...values:unknown[])=>{commands.push([String(key),...values]);};},set(target,key,value){target[key]=value;commands.push(['='+String(key),value]);return true;}});
 return{ctx,commands,canvas:{width:800,height:560,getContext:()=>ctx}};
}
function element(){const r=recorder();return Object.assign(r.canvas,{className:'',style:{setProperty(){}} as Record<string,any>,children:[] as any[],setAttribute(){},addEventListener(){},appendChild(child:unknown){this.children.push(child);return child;},getBoundingClientRect:()=>({left:0,top:0,width:800,height:560,right:800,bottom:560})});}
const T0=Date.UTC(2023,10,14,22,0),BAR=60_000,N=50,FORWARD=10;
const bars=Array.from({length:N},(_,i)=>({time:T0+i*BAR,open:100+i,high:101+i,low:99+i,close:100+i,volume:10}));
/** `extra` future points continue the time grid past the last bar; `future` is their value. */
const line=(id:string,base:number,extra:number,future?:number)=>({id,title:'SYNTHETIC',paneId:'price',kind:'line',display:{pane:true,priceScale:true,legend:true,dataWindow:true},
 points:Array.from({length:N+extra},(_,i)=>({time:T0+i*BAR,value:i<N?base+i:future??base+i})),style:{color:'#ffffff',width:1,lineStyle:'solid'}});
const model=(id:string,extra:number,future?:number,fill=false)=>({id,title:id,paneId:'price',ownScale:false,overlay:true,paneHint:'price',
 series:[line(id+'-a',100,extra,future),line(id+'-b',90,extra,future===undefined?undefined:future-5)],
 fills:fill?[{id:id+'-f',paneId:'price',fromSeriesId:id+'-a',toSeriesId:id+'-b',color:'rgba(0,255,0,0.5)'}]:[],backgrounds:[],priceLines:[],inputs:[],inputValues:{},from:T0,to:T0+(N-1)*BAR});
function rig(chunk:Chunk,m:unknown,rightOffset:number){
 vi.stubGlobal('document',{createElement:()=>element()});
 const r=new chunk.NativeRenderer() as any;
 r.scheduler={invalidate(){},cancel(){}};r.animator={active:false,stop(){},start(){}};
 r.inputsUI={upsert(){},remove(){},setValues(){},setVisible(){},setPane(){},setCollapsedPanes(){},reposition(){}};
 r.wrapper={clientWidth:0,clientHeight:0,appendChild(child:unknown){return child;}};r.plot=element();
 const price=r.scene.ensurePane('price','price',0,3);price.bounds={top:0,height:560};
 r.coords.setSize(800,560,1);r.coords.setBars(bars.map(b=>b.time));r.bars=bars;r.scene.bars=bars;r.scene.timezone='UTC';
 r.coords.setViewport({barSpacing:8,rightOffset});
 r.layoutPanes();r.mountIndicator(m);r.computeScales();
 const canvas=recorder(),backend=new chunk.Canvas2dBackend();backend.mount(canvas.canvas);
 const paint=()=>{canvas.commands.length=0;r.computeScales();backend.render(r.scene,r.coords,r.theme);return canvas.commands.slice();};
 return{r,price,paint};
}
const xs=(commands:Command[],ops=['moveTo','lineTo'])=>commands.filter(c=>ops.includes(c[0])).map(c=>c[1] as number);
const maxX=(commands:Command[])=>Math.max(...xs(commands));
/** A GL batch stand-in that records the x of every emitted vertex. */
function batch(){const x:number[]=[];const add=(...v:number[])=>{for(let k=0;k<v.length;k+=2)if(typeof v[k]==='number')x.push(v[k]);};
 return{x,alpha:1,dashedSeg:(x1:number,_y1:number,x2:number)=>{x.push(x1,x2);},seg:(x1:number,_y1:number,x2:number)=>{x.push(x1,x2);},circle:(cx:number)=>{x.push(cx);},
  quad:(...v:number[])=>add(v[0],0,v[2],0,v[4],0,v[6]),quad4:(...v:any[])=>{x.push(v[0],v[3],v[6],v[9]);},rect:(rx:number,_ry:number,w:number)=>{x.push(rx,rx+w);}};}

describe('LV-VELA-FORWARD-1 plan',()=>{
 it('exports the nine COMPAT-9 step ids, appended before the COMPAT-10 and COMPAT-11 steps in every runtime row, with the notice on forward-helper',()=>{
  expect(plan.id).toBe('LV-VELA-COMPAT-11');expect((plan as any).schemaVersion).toBe(11);expect(plan.components.at(-3)).toBe('LV-VELA-FORWARD-1');
  expect([...compat9StepIds]).toEqual(['forward-helper','forward-autoscale-series','forward-autoscale-range','forward-gl-range','forward-gl-fill','forward-gl-series','forward-canvas-range','forward-canvas-fill','forward-canvas-series']);
  for(const row of plan.files as any[]){
   if(!row.path.endsWith('.js')&&!row.path.endsWith('.cjs')){expect(row.afterSha256).toBe(row.compat8Sha256);continue;}
   expect(row.transformations.slice(-33,-24).map((s:any)=>s.id)).toEqual([...compat9StepIds]);
   expect(row.transformations.find((s:any)=>s.id==='forward-helper').after).toContain('/*! LarryVision LV-VELA-FORWARD-1 modification, 2026-10-22.');
  }
 });
});

describe('LV-VELA-FORWARD-1 Canvas2D painting',()=>{
 it('paints series and fill points past the last loaded bar up to the last future point',()=>{
  const a=rig(now,model('m',FORWARD,undefined,true),20),cmds=a.paint();
  expect(maxX(cmds)).toBeCloseTo(a.r.coords.logicalToX(N-1+FORWARD),6);
  const b=rig(compat8,model('m',FORWARD,undefined,true),20);
  expect(maxX(b.paint())).toBeCloseTo(b.r.coords.logicalToX(N-1),6);
 });
 it('stops at the visible right edge when the future points run past it',()=>{
  const a=rig(now,model('m',FORWARD),4),edge=Math.ceil(a.r.coords.visibleLogicalRange().to);
  expect(edge).toBeLessThan(N-1+FORWARD);
  expect(maxX(a.paint())).toBeCloseTo(a.r.coords.logicalToX(edge),6);
 });
 it('leaves series with one point per bar byte-identical to COMPAT-8 (no forward points, with and without a fill)',()=>{
  for(const fill of [false,true]){
   const a=rig(now,model('m',0,undefined,fill),20).paint(),b=rig(compat8,model('m',0,undefined,fill),20).paint();
   expect(a).toEqual(b);
  }
 });
 it('does not extend the price bars',()=>{
  const withModel=rig(now,model('m',FORWARD),20),bars=withModel.paint().filter(c=>c[0]==='fillRect').map(c=>c[1] as number);
  expect(Math.max(...bars)).toBeLessThanOrEqual(withModel.r.coords.logicalToX(N-1)+8);
 });
});

describe('LV-VELA-FORWARD-1 autoscale',()=>{
 it('folds visible future points into the pane autoscale; COMPAT-8 ignores them',()=>{
  const a=rig(now,model('m',FORWARD,5000),20),b=rig(compat8,model('m',FORWARD,5000),20);
  expect(a.price.scale.max).toBeGreaterThanOrEqual(5000);
  expect(b.price.scale.max).toBeLessThan(5000);
 });
 it('ignores future points past the visible right edge',()=>{
  const a=rig(now,model('m',FORWARD,5000),0);
  expect(a.price.scale.max).toBeLessThan(5000);
 });
});

describe('LV-VELA-FORWARD-1 WebGL2 emission',()=>{
 it('emits series and fill geometry past the last loaded bar after the frame range is recorded',()=>{
  const a=rig(now,model('m',FORWARD,undefined,true),20),gl=new now.WebGL2Backend(),m=a.r.scene.indicators.get('m');
  const s=batch();gl.emitSeries(s,m.series[0],a.price,a.r.coords,0,N-1,a.r.theme,0);
  expect(Math.max(...s.x)).toBeCloseTo(a.r.coords.logicalToX(N-1+FORWARD),6);
  const f=batch();gl.emitFill(f,m,m.fills[0],a.price,a.r.coords,0,N-1,0);
  expect(Math.max(...f.x)).toBeCloseTo(a.r.coords.logicalToX(N-1+FORWARD),6);
  const b=rig(compat8,model('m',FORWARD,undefined,true),20),gl8=new compat8.WebGL2Backend(),m8=b.r.scene.indicators.get('m');
  const s8=batch();gl8.emitSeries(s8,m8.series[0],b.price,b.r.coords,0,N-1,b.r.theme,0);
  expect(Math.max(...s8.x)).toBeCloseTo(b.r.coords.logicalToX(N-1),6);
 });
});
