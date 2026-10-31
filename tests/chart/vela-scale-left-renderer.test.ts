import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {NativeRenderer} from '@luxalgo/vela';
import {compat8StepIds,compat9StepIds,compat10StepIds,compat11StepIds} from '../../src/chart/apply-vela-compat-patch.mjs';
import plan from '../../src/chart/vela-compat-patch-plan.json';

// LV-VELA-SCALE-LEFT-1 (LV-VELA-COMPAT-8, sections 4 and 6.4) on the
// installed renderer. The installed chunk is loaded from a temporary copy under .tmp (deleted right after import) so the
// non-exported InputController and AxisScaleButtons run too; the hash-proven COMPAT-7 renderer (the installed chunk with the
// nineteen COMPAT-8 steps reversed) is the native baseline. SYNTHETIC bars and panes; recording canvas contexts; a minimal
// element stand-in. No GUI, layout, pixel or packaged-build claim.
interface Chunk {NativeRenderer:typeof NativeRenderer;InputController:new(deps:unknown)=>any;AxisScaleButtons:new(plot:unknown,theme:unknown,deps:unknown)=>any}
async function loadChunk(reverse:boolean):Promise<Chunk>{
 const row=plan.files.find(item=>item.path==='dist/chunk-UNUVPQFW.js')! as any;
 const file=resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js');let source=readFileSync(file,'utf8');
 expect(createHash('sha256').update(source).digest('hex')).toBe(row.afterSha256);
 if(reverse){
  for(const step of (row.transformations as Array<{id:string;before:string;after:string}>).filter(item=>compat8StepIds.includes(item.id)||compat9StepIds.includes(item.id)||compat10StepIds.includes(item.id)||compat11StepIds.includes(item.id)).reverse()){expect(source.split(step.after)).toHaveLength(2);source=source.replace(step.after,()=>step.before);}
  expect(createHash('sha256').update(source).digest('hex')).toBe(row.compat7Sha256);
 }
 const temporary=resolve('.tmp',`vela-scale-left-${reverse?'compat7':'compat8'}-${randomUUID()}.mjs`);mkdirSync(dirname(temporary),{recursive:true});
 try{
  writeFileSync(temporary,source.replace(/(from\s+['"])(\.\/[^'"]+)(['"])/g,(_all,before,relative,after)=>before+pathToFileURL(resolve(dirname(file),relative)).href+after)+'\nexport { NativeRenderer as LVNativeRenderer, InputController as LVInputController, AxisScaleButtons as LVAxisScaleButtons };\n');
  const module=await import(/* @vite-ignore */pathToFileURL(temporary).href);
  return{NativeRenderer:module.LVNativeRenderer,InputController:module.LVInputController,AxisScaleButtons:module.LVAxisScaleButtons};
 }finally{try{unlinkSync(temporary);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
}
let now:Chunk,compat7:Chunk;
beforeAll(async()=>{now=await loadChunk(false);compat7=await loadChunk(true);});
afterEach(()=>{vi.unstubAllGlobals();});

type Command=[string,...unknown[]];
function recorder(){
 const commands:Command[]=[],state:Record<string|symbol,unknown>={};
 const ctx=new Proxy(state,{get(target,key){if(key==='measureText')return(text:string)=>({width:String(text).length*6});if(key in target)return target[key];if(key==='getLineDash')return()=>[];if(key==='createLinearGradient')return()=>({addColorStop(){}});if(key==='getImageData')return()=>({data:[0,0,0,255]});return(...values:unknown[])=>{commands.push([String(key),...values]);};},set(target,key,value){target[key]=value;commands.push(['='+String(key),value]);return true;}});
 return{ctx,commands,canvas:{width:864,height:600,getContext:()=>ctx}};
}
/** A recording canvas that is also a minimal element (style, attributes, children, listeners). */
function element(){
 const r=recorder(),listeners:Record<string,Array<(e:any)=>void>>={};
 return Object.assign(r.canvas,{commands:r.commands,ctx:r.ctx,className:'',style:{setProperty(){}} as Record<string,any>,attributes:{} as Record<string,string>,children:[] as any[],listeners,
  setAttribute(name:string,value:string){this.attributes[name]=value;},addEventListener(type:string,fn:(e:any)=>void){(listeners[type]??=[]).push(fn);},
  appendChild(child:unknown){this.children.push(child);return child;},getBoundingClientRect:()=>({left:0,top:0,width:800,height:560,right:800,bottom:560}),
  setPointerCapture(){},releasePointerCapture(){},hasPointerCapture:()=>false,
  fire(type:string,event:any){for(const fn of listeners[type]??[])fn(event);}});
}
const texts=(commands:Command[])=>commands.filter(row=>row[0]==='fillText').map(row=>[row[1],row[2]] as [string,number]);
const T0=Date.UTC(2023,10,14,22,0),BAR=60_000;
const bars=Array.from({length:50},(_,i)=>({time:T0+i*BAR,open:100+i,high:101+i,low:99+i,close:100+i,volume:10}));
const model=(id:string,paneId:string,ownScale:boolean,k:number)=>({id,title:id,paneId,ownScale,overlay:paneId==='price',paneHint:paneId==='price'?'price':'new',
 series:[{id:id+'-s',title:'SYNTHETIC',paneId,kind:'line',points:bars.map((b,i)=>({time:b.time,value:k*(i+1)})),style:{color:'#ffffff',lineWidth:1,lineStyle:'solid'}}],
 fills:[],backgrounds:[],priceLines:[],inputs:[],inputValues:{},from:T0,to:T0+49*BAR});
const pointer=(type:string,x:number,y:number,extra:Record<string,unknown>={})=>({type,clientX:x,clientY:y,button:0,buttons:1,pointerType:'mouse',pointerId:1,timeStamp:1,shiftKey:false,ctrlKey:false,metaKey:false,altKey:false,deltaX:0,deltaY:0,preventDefault(){},stopPropagation(){},...extra});

/** One price pane (no study pane) on a 800 x 560 plot, mounted chrome and crosshair, an input controller on dataCanvas. */
function rig(chunk:Chunk,{study=false}={}){
 vi.stubGlobal('document',{createElement:()=>element()});
 const r=new chunk.NativeRenderer() as any;
 r.scheduler={invalidate(){},cancel(){}};r.animator={active:false,stop(){},start(){}};
 r.inputsUI={upsert(){},remove(){},setValues(){},setVisible(){},setPane(){},setCollapsedPanes(){},reposition(){}};
 const appended:any[]=[];r.wrapper={clientWidth:0,clientHeight:0,appendChild(child:unknown){appended.push(child);return child;}};
 const plot=element();r.plot=plot;
 const price=r.scene.ensurePane('price','price',0,3);price.bounds={top:0,height:study?400:560};
 if(study){const s=r.scene.ensurePane('s1','study',1,1);s.bounds={top:403,height:157};}
 r.coords.setSize(800,560,1);r.coords.setBars(bars.map(b=>b.time));r.bars=bars;r.scene.bars=bars;r.scene.timezone='UTC';
 r.scene.showPriceLabel=false;r.scene.showPriceLine=false;r.scene.showCountdown=false;
 r.layoutPanes();
 const main=recorder();r.chrome.mount(main.canvas);
 const cross=recorder();r.crosshairLayer.mount(cross.canvas);
 const dataCanvas=element();
 r.input=new chunk.InputController({getCoords:()=>r.coords,apply:(vp:unknown)=>r.applyViewport(vp),zoomTo:()=>{},fling:()=>{},onPointerMove:()=>{},onClick:()=>{},
  beginPriceScale:(x:number,y:number)=>r.beginPriceScale(x,y),priceScaleBy:(dy:number)=>r.priceScaleBy(dy),beginPricePan:(y:number)=>r.beginPricePan(y),pricePanBy:(dy:number)=>r.pricePanBy(dy),
  resetPriceScale:(x:number,y:number)=>r.resetPriceScale(x,y),dataDblClick:()=>{},paneSeparatorAt:(y:number)=>r.paneSeparatorAt(y),beginPaneResize:()=>{},paneResizeBy:()=>{},resetPaneSize:()=>{},resetView:()=>{},
  lvMainLeftAt:(y:number)=>r.lvMainLeftAt?.(y)});
 r.input.axisDrag=true;r.input.attach(dataCanvas);
 const frame=()=>{main.commands.length=0;r.computeScales();r.chrome.render(r.scene,r.coords,r.theme,{background:'#000000',textColor:'#cccccc'});return main.commands.slice();};
 const crosshair=(external:unknown=null,at={x:400,y:200})=>{cross.commands.length=0;r.scene.crosshair=at;r.crosshairLayer.render(r.scene,r.coords,r.theme,null,external);return cross.commands.slice();};
 return{r,price,plot,appended,main,cross,frame,crosshair,dataCanvas};
}
const leftCanvas=(appended:any[])=>appended.find(c=>c.className==='lv-vela-left-scale');
const cursorCanvas=(appended:any[])=>appended.find(c=>c.className==='lv-vela-left-scale-cursor');
const strip=(plot:any)=>plot.children.find((c:any)=>c.className==='lv-vela-main-left-scale');

describe('LV-VELA-SCALE-LEFT-1 API and geometry',()=>{
 it('defaults to the native right side; an invalid side throws a TypeError before any change',()=>{
  const {r}=rig(now);
  const snapshot=()=>JSON.stringify({right:r.rightAxisW,left:r.lvLeftScaleWidth(),side:r.lvMainScaleSide(),key:Object.hasOwn(r.scene,'lvMainScaleLeft')});
  expect(JSON.parse(snapshot())).toEqual({right:64,left:0,side:'right',key:false});
  const before=snapshot();
  for(const bad of ['center','LEFT',null,undefined,1,true])expect(()=>r.lvSetMainScaleSide(bad),String(bad)).toThrow(TypeError);
  expect(snapshot()).toBe(before);
  expect(r.lvSetMainScaleSide('right')).toBe(false);expect(snapshot()).toBe(before);
 });
 it('left on a single pane: right gutter 0, left gutter 64, both wrapper canvases, the hit strip at -64px with forwarders',()=>{
  const {r,plot,appended,price}=rig(now);
  expect(r.lvSetMainScaleSide('left')).toBe(true);expect(r.lvSetMainScaleSide('left')).toBe(false);
  expect(r.scene.lvMainScaleLeft).toBe(true);expect(r.lvMainScaleSide()).toBe('left');
  expect(r.rightAxisW).toBe(0);expect(r.lvLeftScaleWidth()).toBe(64);
  const left=leftCanvas(appended),cursor=cursorCanvas(appended);
  expect(left).toBeDefined();expect(cursor).toBeDefined();
  expect(cursor.attributes['aria-hidden']).toBe('true');expect(cursor.style).toMatchObject({pointerEvents:'none',left:'0px',width:'64px',display:'block'});
  const hit=strip(plot);expect(hit).toBeDefined();
  expect(hit.style).toMatchObject({left:'-64px',width:'64px',display:'block',top:'0px',height:price.bounds.height+'px',cursor:'ns-resize'});
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel','dblclick','wheel','mousedown','auxclick','contextmenu'])expect(hit.listeners[type]?.length,type).toBe(1);
 });
 it('regionAt and resolveScaleHolder: x<0 on the price pane is the price scale; data stays data; below the panes is unchanged',()=>{
  const compat7Region=(x:number,y:number)=>rig(compat7).r.input.regionAt(x,y);
  const {r,price}=rig(now);
  expect(r.input.regionAt(-10,100)).toBe('data');
  r.lvSetMainScaleSide('left');
  expect(r.input.regionAt(-10,100)).toBe('price');expect(r.input.regionAt(10,100)).toBe('data');expect(r.input.regionAt(-10,600)).toBe(compat7Region(-10,600));
  expect(r.resolveScaleHolder(-10,100).holder).toBe(price);
  r.input.axisDrag=false;expect(r.input.regionAt(-10,100)).toBe('data');
 });
 it('a study pane brings the right gutter back to 64 with a blank price-pane slot; removing it gives 0 again',()=>{
  const {r,price}=rig(now);r.lvSetMainScaleSide('left');
  r.ensurePane({id:'s1',kind:'study',order:1});expect(r.rightAxisW).toBe(64);expect(r.lvLeftScaleWidth()).toBe(64);
  r.layoutPanes();
  expect(r.resolveScaleHolder(r.coords.width+10,10)).toBeNull();
  const study=r.scene.panes.get('s1');expect(r.resolveScaleHolder(r.coords.width+10,study.bounds.top+5).holder).toBe(study);
  expect(r.input.regionAt(-10,study.bounds.top+5)).toBe('data');
  expect(r.resolveScaleHolder(-10,price.bounds.top+5).holder).toBe(price);
  r.removePane('s1');expect(r.rightAxisW).toBe(0);
 });
 it('right restores the native numbers, removes the key and hides the strip and cursor canvas',()=>{
  const {r,plot,appended}=rig(now);r.lvSetMainScaleSide('left');
  expect(r.lvSetMainScaleSide('right')).toBe(true);
  expect({right:r.rightAxisW,left:r.lvLeftScaleWidth(),key:Object.hasOwn(r.scene,'lvMainScaleLeft')}).toEqual({right:64,left:0,key:false});
  expect(strip(plot).style.display).toBe('none');expect(cursorCanvas(appended).style.display).toBe('none');
  expect(r.crosshairLayer.lvLeftCursor).toBeNull();expect(r.input.regionAt(-10,100)).toBe('data');
 });
 it('a collapsed price pane hides the strip',()=>{
  const {r,plot,price}=rig(now);r.lvSetMainScaleSide('left');expect(strip(plot).style.display).toBe('block');
  price.collapsed=true;r.lvPlaceMainLeftHit();expect(strip(plot).style.display).toBe('none');expect(r.lvMainLeftAt(100)).toBe(false);
 });
});

describe('LV-VELA-SCALE-LEFT-1 painting',()=>{
 it('ticks go to the left canvas through the native painters; the main canvas masks the right master slot; chrome.ctx is restored',()=>{
  const {r,main,appended,frame}=rig(now);
  const native=frame();expect(texts(native).some(([,x])=>x===806)).toBe(true);
  r.lvSetMainScaleSide('left');
  const left=leftCanvas(appended);left.commands.length=0;
  const masked=frame();
  const leftTicks=texts(left.commands);
  expect(leftTicks.length).toBeGreaterThan(2);
  // dataW maps to column 0's left edge (x 0 of a 64 px gutter): native label x = dataW + 6 becomes 6 after the translate.
  const translate=left.commands.find((c:Command)=>c[0]==='translate')!;expect(translate.slice(1)).toEqual([0-800,0]);
  expect(leftTicks.every(([,x])=>x===806)).toBe(true);
  expect(leftTicks.map(([label])=>label)).toEqual(texts(native).filter(([,x])=>x===806).map(([label])=>label));
  expect(masked.some(c=>c[0]==='clip'&&c[1]==='evenodd')).toBe(true);
  expect(r.chrome.ctx).toBe(main.ctx);
 });
 it('a left-pinned price-pane indicator draws at column 1 (right = width - 64) while the main scale is left',()=>{
  const {r,appended,frame}=rig(now);
  r.mountIndicator(model('a','price',true,1000));
  r.setIndicatorPane({id:'a'},'price',{ownScale:true,lvScalePlacement:'left'});
  r.lvSetMainScaleSide('left');expect(r.lvLeftScaleWidth()).toBe(64+56);r.lvLayoutLeftScale();
  const left=leftCanvas(appended);left.commands.length=0;frame();
  const indicator=texts(left.commands).filter(([label])=>label==='10000.00');
  expect(indicator).toHaveLength(1);expect(indicator[0][1]).toBe(120-64-6);
 });
 it('the crosshair price chip goes to the left cursor canvas at x=1 with no right chip; the synced ghost too',()=>{
  const {r,appended,crosshair}=rig(now);
  const nativeChips=crosshair().filter(c=>c[0]==='fillRect'&&(c[1] as number)>=800);expect(nativeChips.length).toBe(1);
  r.lvSetMainScaleSide('left');
  const cursor=cursorCanvas(appended);cursor.commands.length=0;
  const right=crosshair().filter(c=>c[0]==='fillRect'&&(c[1] as number)>=800);
  const left=cursor.commands.filter((c:Command)=>c[0]==='fillRect');
  expect(right).toEqual([]);expect(left).toHaveLength(1);expect(left[0][1]).toBe(1);
  expect(cursor.commands.some((c:Command)=>c[0]==='clearRect')).toBe(true);
  cursor.commands.length=0;
  crosshair({x:300,y:150,time:T0+20*BAR,price:110},{x:NaN,y:NaN} as never);
  expect(cursor.commands.filter((c:Command)=>c[0]==='fillRect').length).toBeGreaterThanOrEqual(1);
 });
 it('axisDrag off: the strip has no resize cursor and the left column is not a price region',()=>{
  const {r,plot}=rig(now);r.axisDragEnabled=false;r.lvSetMainScaleSide('left');
  expect(strip(plot).style.cursor).toBe('');
  r.input.axisDrag=false;expect(r.input.regionAt(-10,100)).toBe('data');
 });
});

describe('LV-VELA-SCALE-LEFT-1 input on the left column',()=>{
 it('a drag on the strip (pointerdown, pointermove forwarded) makes the price scale manual and rescales it',()=>{
  const {r,plot,price,frame}=rig(now);frame();r.lvSetMainScaleSide('left');
  const hit=strip(plot),before={...price.scale};
  expect(price.manualScale).toBeFalsy();
  hit.fire('pointerdown',pointer('pointerdown',-20,200));
  expect(price.manualScale).toEqual(before);
  hit.fire('pointermove',pointer('pointermove',-20,260));
  expect(price.manualScale.max-price.manualScale.min).toBeGreaterThan(before.max-before.min);
  hit.fire('pointerup',pointer('pointerup',-20,260));
 });
 it('a wheel on the strip calls priceScaleBy; a double-click on the strip resets the price scale',()=>{
  const {r,plot,price,frame}=rig(now);frame();r.lvSetMainScaleSide('left');
  const hit=strip(plot),spy=vi.spyOn(r,'priceScaleBy');
  hit.fire('wheel',pointer('wheel',-20,200,{deltaY:100}));
  expect(spy).toHaveBeenCalledTimes(1);expect(price.manualScale).toBeTruthy();
  hit.fire('dblclick',pointer('dblclick',-20,200));
  expect(price.manualScale).toBeNull();
 });
 it('the A/L cluster sits at left -64px for the price pane while left and returns to the right afterwards',()=>{
  const cluster={style:{} as Record<string,string>};let left=true;
  const host={deps:{panes:()=>[{id:'price',top:0,height:500,collapsed:false,auto:true,log:false}],rightAxis:()=>0,lvMainLeft:()=>left},cluster,hoverPaneId:'price',sync(){}};
  now.AxisScaleButtons.prototype.reposition.call(host);
  expect(cluster.style.left).toBe('-64px');expect(cluster.style.right).toBe('');
  left=false;now.AxisScaleButtons.prototype.reposition.call(host);
  expect(cluster.style.left).toBe('');expect(cluster.style.right).toBe('-64px');
 });
});

describe('native rendering is unchanged without a side call',()=>{
 it('chrome and crosshair command streams, widths and regions equal the COMPAT-7 renderer',()=>{
  for(const study of [false,true]){
   const a=rig(now,{study}),b=rig(compat7,{study});
   expect(a.frame()).toEqual(b.frame());
   expect(a.crosshair()).toEqual(b.crosshair());
   const ext={x:300,y:150,time:T0+20*BAR,price:110};expect(a.crosshair(ext)).toEqual(b.crosshair(ext));
   expect(a.r.rightAxisW).toBe(b.r.rightAxisW);expect(a.r.lvLeftScaleWidth()).toBe(b.r.lvLeftScaleWidth());
   expect(a.appended).toEqual([]);expect(a.plot.children).toEqual([]);
   expect(a.r.input.regionAt(-10,100)).toBe(b.r.input.regionAt(-10,100));
   expect(Object.hasOwn(a.r.scene,'lvMainScaleLeft')).toBe(false);
  }
 });
});
