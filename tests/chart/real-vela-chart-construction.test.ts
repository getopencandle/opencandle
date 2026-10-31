import {readFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
import {Vela,NativeRenderer,DrawingsControl,type SerializedDrawing} from '@luxalgo/vela';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {installDrawingCommandRouter,type DrawingCommandRouterHost,type DrawingDuplicateReceipt} from '../../src/chart/drawing-command-router';
import {installNativeDrawingReset,type NativeDrawingResetHost} from '../../src/chart/native-drawing-reset';
import {installTrendlineAnnotation} from '../../src/chart/trendline-annotation';
import {nativeDrawingHarness} from './drawing-native-harness';
import {annotationNativeHarness,annotationRecord} from './trendline-annotation-native-harness';
import {realVelaChart,VELA_OWN_FIELDS,type RealVelaChart} from '../helpers/real-vela-chart';

// Regression for "Chart unavailable" in every build: createChartProbe hands the
// installers a real Vela, whose `drawings` is a Vela.prototype getter over the
// own `drawingsControl` field. Every chart below has that genuine shape
// (SYNTHETIC rows; native controller/store/popup bodies execute; no DOM, canvas
// or GUI claim).

const FACADE_METHODS=['clone','duplicate','undo','redo','canUndo','canRedo'];
const RESET_SLOTS=['openSettingsById','openSettingsForSelection','emit'];
type Popup={drawings:unknown[];anchor:unknown;actions:Record<string,unknown>};

async function fixture(options:{popupTraps?:(real:RealVelaChart)=>ProxyHandler<object>}={}){
 const native=await nativeDrawingHarness(),paint=await annotationNativeHarness(),real=await realVelaChart({renderer:paint.renderer,core:native.controller});
 const rows:SerializedDrawing[]=[annotationRecord()],document=new LosslessDrawingDocument(),diagnostics:string[]=[],releases:Array<()=>void>=[];
 let latest:Popup|null=null,source={},disposed=false;
 const popupTarget=Object.create({syncPanel(){},contains(){return false;},isOpen(){return latest!==null;},close(){latest=null;},open(drawings:unknown[],anchor:unknown,actions:Record<string,unknown>){latest={drawings,anchor,actions};}}),popup=options.popupTraps?new Proxy(popupTarget,options.popupTraps(real)):popupTarget;
 Object.assign(paint.controller,{popup,popupMulti:false,historyChords:true,measureMode:false,eraserMode:false});
 const selection=native.controller.port.setSelection;native.controller.port.setSelection=(ids:string[])=>{selection(ids);paint.controller.setSelection(ids);};
 native.controller.port.syncDrawings=(records:SerializedDrawing[])=>paint.sync(records);
 const intent=function(value:unknown){native.controller.onIntent(value);};paint.controller.intentCb=intent;
 const captureOwner=()=>{const expected=source;return()=>{if(disposed||source!==expected)throw Error('SYNTHETIC real-shape source retired');};};
 // createChartProbe order: annotation first (it owns the render observation and delete dispatch the later installers use).
 const annotation=installTrendlineAnnotation(paint.renderer,real.chart,{captureOwner,unavailable:message=>diagnostics.push(message)});releases.push(()=>annotation.dispose());
 document.load({version:1,drawings:rows});native.controller.fromJSON({version:1,drawings:rows});
 const receipt=(ids:readonly string[]):DrawingDuplicateReceipt=>Object.freeze({ids:Object.freeze([...ids]),nativeState:'complete',canonicalAccepted:true,workspaceAcknowledged:true,observersComplete:true});
 const routerHost=(extra:Partial<DrawingCommandRouterHost>={}):DrawingCommandRouterHost=>({captureOwner,assertMutable(){},duplicate(ids,assert){assert();return receipt(ids);},history(_direction,assert){assert();},historyStatus(){return{canUndo:true,canRedo:false};},...extra});
 const resetHost=(extra:Partial<NativeDrawingResetHost>={}):NativeDrawingResetHost=>({document,captureOwner,assertMutable(){},publish(){throw Error('SYNTHETIC Reset publication is not exercised here');},unavailable:message=>{diagnostics.push(message);},...extra});
 return{native,paint,real,rows,intent,popup,diagnostics,routerHost,resetHost,
  latest:()=>latest,
  open():Popup{paint.controller.openSettingsById(rows[0].id,0,0);if(!latest)throw Error('SYNTHETIC popup not opened');return latest;},
  track<T extends {dispose():void}>(installed:T):T{releases.push(()=>installed.dispose());return installed;},
  assertReleased(){for(const key of FACADE_METHODS)expect(Object.hasOwn(real.facade,key)).toBe(false);for(const key of RESET_SLOTS)expect(Object.hasOwn(paint.controller,key)).toBe(false);expect(Object.hasOwn(popup,'open')).toBe(false);expect(paint.controller.intentCb).toBe(intent);expect(Reflect.ownKeys(real.chart)).toEqual([...VELA_OWN_FIELDS]);},
  dispose(){disposed=true;const errors:unknown[]=[];for(const release of [...releases.reverse(),()=>native.dispose(),()=>paint.dispose()])try{release();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'SYNTHETIC real-shape cleanup failed');}};
}

describe('(a) the real Vela shape installs both drawing owners and disposes cleanly',()=>{
 it('drawing command router installs on a Vela.prototype chart, routes through the drawings getter, and disposes',async()=>{
  const f=await fixture();
  try{
   const router=f.track(installDrawingCommandRouter(f.paint.renderer,f.real.chart,f.routerHost()));
   for(const key of FACADE_METHODS)expect(Object.hasOwn(f.real.facade,key)).toBe(true);
   expect(f.real.chart.drawings).toBe(f.real.facade);
   expect(f.real.chart.drawings.canUndo()).toBe(true);expect(f.real.chart.drawings.canRedo()).toBe(false);
   expect(router.duplicate([f.rows[0].id]).ids).toEqual([f.rows[0].id]);
   router.dispose();f.assertReleased();
  }finally{f.dispose();}
 });
 it('native Reset installs on a Vela.prototype chart, owns the native popup opening, and disposes',async()=>{
  const f=await fixture();
  try{
   const reset=f.track(installNativeDrawingReset(f.paint.renderer,f.real.chart,f.resetHost()));
   for(const key of RESET_SLOTS)expect(Object.hasOwn(f.paint.controller,key)).toBe(true);
   expect(typeof f.open().actions.resetSettings).toBe('function');expect(reset.diagnostics()).toEqual([]);f.popup.close();
   reset.dispose();f.assertReleased();expect(f.diagnostics).toEqual([]);
  }finally{f.dispose();}
 });
 it('createChartProbe composition: router with error and eraser pairs, then Reset holding the router popup port, released in reverse',async()=>{
  const f=await fixture();
  try{
   const reported:string[]=[];
   const router=f.track(installDrawingCommandRouter(f.paint.renderer,f.real.chart,f.routerHost({captureErrorOwner:()=>()=>{},reportError:message=>{reported.push(message);},assertEraseMutable(){},erase(){throw Error('SYNTHETIC erase is not exercised here');}})));
   const reset=f.track(installNativeDrawingReset(f.paint.renderer,f.real.chart,f.resetHost({duplicatePopup:router.popupPort})));
   const opened=f.open();expect(typeof opened.actions.resetSettings).toBe('function');expect(typeof opened.actions.duplicate).toBe('function');f.popup.close();
   reset.dispose();router.dispose();f.assertReleased();expect(reported).toEqual([]);
  }finally{f.dispose();}
 });
});

describe('(b) accessor or facade mismatches are refused',()=>{
 it('the legacy plain shape with an own drawings member is not a Vela and is refused by both installers',async()=>{
  const f=await fixture();
  try{
   const legacy={orchestrator:f.real.orchestrator,drawings:f.real.facade} as unknown as Vela;
   expect(()=>installDrawingCommandRouter(f.paint.renderer,legacy,f.routerHost())).toThrow('Drawing command member unavailable: drawingsControl');
   expect(()=>installNativeDrawingReset(f.paint.renderer,legacy,f.resetHost())).toThrow('Native Reset data member missing: drawingsControl');
   f.assertReleased();
  }finally{f.dispose();}
 });
 it('an own drawings member shadowing the prototype getter is refused at installation',async()=>{
  const f=await fixture(),foreign=new DrawingsControl(f.native.controller as never);
  try{
   Object.defineProperty(f.real.chart,'drawings',{value:foreign,writable:true,configurable:true,enumerable:true});
   expect(()=>installDrawingCommandRouter(f.paint.renderer,f.real.chart,f.routerHost())).toThrow('Drawing command facade accessor mismatch');
   expect(()=>installNativeDrawingReset(f.paint.renderer,f.real.chart,f.resetHost())).toThrow('Native Reset facade accessor mismatch');
   for(const key of FACADE_METHODS)expect(Object.hasOwn(foreign,key)).toBe(false);
   expect(Reflect.deleteProperty(f.real.chart,'drawings')).toBe(true);f.assertReleased();
   // Without the shadow the same chart is accepted, so the refusal above was the mismatch alone.
   f.track(installNativeDrawingReset(f.paint.renderer,f.real.chart,f.resetHost())).dispose();f.track(installDrawingCommandRouter(f.paint.renderer,f.real.chart,f.routerHost())).dispose();f.assertReleased();
  }finally{Reflect.deleteProperty(f.real.chart,'drawings');f.dispose();}
 });
 it('an accessor-shaped drawingsControl is refused as a non-data member',async()=>{
  const f=await fixture(),facade=f.real.facade;
  try{
   Object.defineProperty(f.real.chart,'drawingsControl',{get:()=>facade,configurable:true,enumerable:true});
   expect(f.real.chart.drawings).toBe(facade);
   expect(()=>installDrawingCommandRouter(f.paint.renderer,f.real.chart,f.routerHost())).toThrow('Drawing command requires a data member: drawingsControl');
   expect(()=>installNativeDrawingReset(f.paint.renderer,f.real.chart,f.resetHost())).toThrow('Native Reset owner requires data members: drawingsControl');
  }finally{Object.defineProperty(f.real.chart,'drawingsControl',{value:facade,writable:true,configurable:true,enumerable:true});f.assertReleased();f.dispose();}
 });
 it('replacing drawingsControl after installation retires both owners; disposal still restores every owned slot',async()=>{
  const f=await fixture(),replacement=new DrawingsControl(f.native.controller as never);
  try{
   const router=f.track(installDrawingCommandRouter(f.paint.renderer,f.real.chart,f.routerHost())),reset=f.track(installNativeDrawingReset(f.paint.renderer,f.real.chart,f.resetHost()));
   f.real.setFacade(replacement);expect(f.real.chart.drawings).toBe(replacement);
   expect(()=>router.duplicate([f.rows[0].id])).toThrow('Drawing command descriptor retired: drawingsControl');
   expect(()=>f.open()).toThrow('Native Reset ownership retired or changed');
   f.real.setFacade(f.real.facade);
   expect(()=>f.real.facade.canUndo()).toThrow('Drawing command installation retired');
   for(const key of FACADE_METHODS)expect(Object.hasOwn(replacement,key)).toBe(false);
   reset.dispose();router.dispose();f.assertReleased();
  }finally{f.real.setFacade(f.real.facade);f.dispose();}
 });
 it('an own drawings shadow added after installation retires both owners',async()=>{
  const f=await fixture(),foreign=new DrawingsControl(f.native.controller as never);
  try{
   const router=f.track(installDrawingCommandRouter(f.paint.renderer,f.real.chart,f.routerHost())),reset=f.track(installNativeDrawingReset(f.paint.renderer,f.real.chart,f.resetHost()));
   Object.defineProperty(f.real.chart,'drawings',{value:foreign,writable:true,configurable:true,enumerable:true});
   expect(()=>router.duplicate([f.rows[0].id])).toThrow('Drawing command descriptor retired: drawings');
   expect(()=>f.open()).toThrow('Native Reset ownership retired or changed');
   expect(Reflect.deleteProperty(f.real.chart,'drawings')).toBe(true);
   reset.dispose();router.dispose();f.assertReleased();
  }finally{Reflect.deleteProperty(f.real.chart,'drawings');f.dispose();}
 });
});

describe('(d) the drawings accessor is pinned, not sampled by value',()=>{
 // A selective getter answers the installers with the owned facade and every
 // other caller (the adapter's chart.drawings uses) with a foreign control that
 // carries none of the router's owned wrappers (review probes H1/H2).
 const fromInstallers=()=>/drawing-command-router|native-drawing-reset/.test(new Error().stack??'');
 const selective=(owned:object,foreign:object)=>function(){return fromInstallers()?owned:foreign;};
 const honest=function(this:{drawingsControl:unknown}){return this.drawingsControl;};
 const original=Object.getOwnPropertyDescriptor(Vela.prototype,'drawings')!;
 const restore=()=>{Object.defineProperty(Vela.prototype,'drawings',original);};
 it('H1: an own selective accessor added after installation retires both owners; no owned path survives',async()=>{
  const f=await fixture(),foreign=new DrawingsControl(f.native.controller as never),histories:string[]=[];
  try{
   const router=f.track(installDrawingCommandRouter(f.paint.renderer,f.real.chart,f.routerHost({history(direction,assert){assert();histories.push(direction);}}))),reset=f.track(installNativeDrawingReset(f.paint.renderer,f.real.chart,f.resetHost()));
   Object.defineProperty(f.real.chart,'drawings',{get:selective(f.real.facade,foreign),configurable:true});
   expect(f.real.chart.drawings).toBe(foreign);
   expect(()=>router.duplicate([f.rows[0].id])).toThrow('Drawing command descriptor retired: drawings');
   expect(()=>f.real.facade.undo()).toThrow('Drawing command installation retired');expect(histories).toEqual([]);
   expect(()=>f.open()).toThrow('Native Reset ownership retired or changed');expect(f.latest()).toBeNull();
   expect(Reflect.deleteProperty(f.real.chart,'drawings')).toBe(true);
   expect(()=>f.real.facade.canUndo()).toThrow('Drawing command installation retired');
   reset.dispose();router.dispose();f.assertReleased();
  }finally{Reflect.deleteProperty(f.real.chart,'drawings');f.dispose();}
 });
 it('H2: a selective Vela.prototype getter swapped in after installation retires both owners',async()=>{
  const f=await fixture(),foreign=new DrawingsControl(f.native.controller as never);
  try{
   const router=f.track(installDrawingCommandRouter(f.paint.renderer,f.real.chart,f.routerHost())),reset=f.track(installNativeDrawingReset(f.paint.renderer,f.real.chart,f.resetHost()));
   Object.defineProperty(Vela.prototype,'drawings',{...original,get:selective(f.real.facade,foreign)});
   expect(f.real.chart.drawings).toBe(foreign);
   expect(()=>router.duplicate([f.rows[0].id])).toThrow('Drawing command descriptor retired: drawings');
   expect(()=>f.open()).toThrow('Native Reset ownership retired or changed');expect(f.latest()).toBeNull();
   restore();expect(()=>f.real.facade.canUndo()).toThrow('Drawing command installation retired');
   reset.dispose();router.dispose();f.assertReleased();
  }finally{restore();f.dispose();}
 });
 it('an own or foreign drawings accessor present before installation is refused even when it answers honestly',async()=>{
  for(const variant of ['own','prototype'] as const){
   const f=await fixture();
   try{
    if(variant==='own')Object.defineProperty(f.real.chart,'drawings',{get:honest,configurable:true});else Object.defineProperty(Vela.prototype,'drawings',{...original,get:honest});
    expect(f.real.chart.drawings).toBe(f.real.facade);
    expect(()=>installDrawingCommandRouter(f.paint.renderer,f.real.chart,f.routerHost())).toThrow('Drawing command facade accessor mismatch');
    expect(()=>installNativeDrawingReset(f.paint.renderer,f.real.chart,f.resetHost())).toThrow('Native Reset facade accessor mismatch');
    Reflect.deleteProperty(f.real.chart,'drawings');restore();
    // Behavior, not only text: neither owner holds any slot after the refusal.
    f.assertReleased();expect(()=>f.open()).not.toThrow();expect(f.latest()).not.toBeNull();
   }finally{Reflect.deleteProperty(f.real.chart,'drawings');restore();f.dispose();}
  }
 });
 it('standalone Reset retires on a post-install honest shadow or getter swap and never opens its popup',async()=>{
  for(const variant of ['own','prototype'] as const){
   const f=await fixture();
   try{
    const reset=f.track(installNativeDrawingReset(f.paint.renderer,f.real.chart,f.resetHost()));
    expect(typeof f.open().actions.resetSettings).toBe('function');f.popup.close();
    if(variant==='own')Object.defineProperty(f.real.chart,'drawings',{get:honest,configurable:true});else Object.defineProperty(Vela.prototype,'drawings',{...original,get:honest});
    expect(f.real.chart.drawings).toBe(f.real.facade);
    expect(()=>f.open()).toThrow('Native Reset ownership retired or changed');expect(f.latest()).toBeNull();
    Reflect.deleteProperty(f.real.chart,'drawings');restore();
    reset.dispose();f.assertReleased();
   }finally{Reflect.deleteProperty(f.real.chart,'drawings');restore();f.dispose();}
  }
 });
 it('a shadow present only while Reset writes its slots is refused by installation() itself',async()=>{
  let armed=false,removed=false;
  const f=await fixture({popupTraps:real=>({
   defineProperty(target,key,descriptor){const done=Reflect.defineProperty(target,key,descriptor);if(key==='open'&&!armed&&typeof descriptor.value==='function'){armed=true;Object.defineProperty(real.chart,'drawings',{get:honest,configurable:true});}return done;},
   getOwnPropertyDescriptor(target,key){if(armed&&!removed&&key==='open'&&Object.hasOwn(target,'open')){removed=true;Reflect.deleteProperty(real.chart,'drawings');}return Reflect.getOwnPropertyDescriptor(target,key);},
  })});
  try{
   expect(()=>installNativeDrawingReset(f.paint.renderer,f.real.chart,f.resetHost())).toThrow('Native Reset owner changed during installation');
   expect(armed).toBe(true);expect(removed).toBe(true);f.assertReleased();
  }finally{Reflect.deleteProperty(f.real.chart,'drawings');f.dispose();}
 });
});

describe('(c) createChartProbe chart-member requirements against the real prototype',()=>{
 const bare=()=>realVelaChart({renderer:Object.create(NativeRenderer.prototype),core:{}});
 it('the shared helper reproduces the real constructor own-field contract exactly',async()=>{
  const source=Function.prototype.toString.call(Vela),start=source.indexOf('constructor('),end=source.indexOf('\n  }\n',start);
  expect(start).toBeGreaterThan(-1);expect(end).toBeGreaterThan(start);
  const assigned=[...source.slice(start,end).matchAll(/\bthis\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)].map(match=>match[1]);
  expect(assigned).toEqual([...VELA_OWN_FIELDS]);
  const {chart}=await bare();expect(Object.getPrototypeOf(chart)).toBe(Vela.prototype);expect(Reflect.ownKeys(chart)).toEqual(assigned);
  for(const key of assigned)expect(Object.getOwnPropertyDescriptor(chart,key)).toMatchObject({writable:true,enumerable:true,configurable:true});
 });
 it('every public control surface is a getter-only Vela.prototype accessor over its own field, never an own member',async()=>{
  const real=await bare(),chart=real.chart as unknown as Record<string,unknown>;
  for(const [surface,field] of [['renderer','rendererControl'],['data','dataControl'],['panes','panesControl'],['drawings','drawingsControl'],['marks','marksControl'],['replay','replayControl']]){
   const descriptor=Object.getOwnPropertyDescriptor(Vela.prototype,surface)!;
   expect(typeof descriptor.get).toBe('function');expect(descriptor.set).toBeUndefined();expect(Object.hasOwn(descriptor,'value')).toBe(false);
   expect(Object.hasOwn(chart,surface)).toBe(false);expect(Reflect.apply(descriptor.get!,chart,[])).toBe(Reflect.get(chart,field));
  }
  expect(Object.getOwnPropertyDescriptor(Vela.prototype,'orchestrator')).toBeUndefined();expect(Object.getOwnPropertyDescriptor(Vela.prototype,'drawingsControl')).toBeUndefined();
  // A legacy-harness write such as `f.chart.drawings=proxy` cannot happen on a real chart.
  expect(()=>{chart.drawings=real.facade;}).toThrow(TypeError);
 });
 it('every own-data chart lookup in src names a real own field, never a prototype accessor',()=>{
  const root=resolve('src'),hits:Array<{file:string;key:string}>=[];
  for(const entry of readdirSync(root,{recursive:true}) as string[]){
   if(!/\.tsx?$/.test(entry))continue;
   const text=readFileSync(join(root,entry),'utf8');
   for(const match of text.matchAll(/\b(?:own|data|slot|duplicateOwn|inputData|getOwnPropertyDescriptor|hasOwn)\(\s*chart\s*,\s*'([^']+)'/g))hits.push({file:entry.replace(/\\/g,'/'),key:match[1]});
  }
  // Non-vacuous: createChartProbe and both drawing installers are in the scan.
  expect(hits.some(hit=>hit.file==='chart/adapter.ts'&&hit.key==='orchestrator')).toBe(true);
  for(const file of ['chart/drawing-command-router.ts','chart/native-drawing-reset.ts'])expect(hits.some(hit=>hit.file===file)).toBe(true);
  const offending=hits.filter(hit=>!(VELA_OWN_FIELDS as readonly string[]).includes(hit.key)||hit.key in Vela.prototype).map(hit=>hit.file+': '+hit.key);
  expect(offending).toEqual([]);
 });
});
