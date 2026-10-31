import {afterEach,expect,it,vi} from 'vitest';
import {NativeRenderer,type NativeIndicatorOutput} from '@luxalgo/vela';
import {nativeCoreHarness} from './native-core-harness';

// Actual pinned core/full-model bridge and genuine NativeRenderer. No new
// descriptor/source registrar, fixture rewrite, numeric receipt or DOM claim.
const closes:Array<()=>void>=[];
afterEach(()=>{const failures:unknown[]=[];for(const close of closes.splice(0).reverse())try{close();}catch(error){failures.push(error);}vi.restoreAllMocks();if(failures.length)throw new AggregateError(failures,'SYNTHETIC bounded full-model cleanup failed.');});
const output=(color='#ff0000'):NativeIndicatorOutput=>({series:[{id:'plot',title:'SYNTHETIC',paneId:'',kind:'line',points:[{time:1700000000000,value:10}],style:{color,width:2,lineStyle:'solid'}}],fills:[],priceLines:[]});
const leaves=(error:unknown):unknown[]=>error instanceof AggregateError?[error,...error.errors.flatMap(leaves)]:[error];
function captured(action:()=>void):{threw:boolean;error:unknown}{try{action();return{threw:false,error:undefined};}catch(error){return{threw:true,error};}}
function deep(parent:object){let traps=0;const proxy=new Proxy(Object.create(parent),{getOwnPropertyDescriptor(target,key){traps++;return Reflect.getOwnPropertyDescriptor(target,key);},getPrototypeOf(target){traps++;return Reflect.getPrototypeOf(target);}});let head:object=proxy;for(let i=0;i<4096;i++)head=Object.create(head);return{head,traps:()=>traps};}
async function actual(){
 const h=await nativeCoreHarness();closes.push(()=>h.dispose());
 h.native.inputsUI.setTheme=()=>{};h.renderer.applyConfig({animations:{intro:false}});
 h.core.rawBars=[];h.core.syncBarTransform('candles');h.core.setBarSeries([{time:1700000000000,open:10,high:11,low:9,close:10,volume:1}],{clearing:true,preserveView:true});(h.renderer as unknown as {coords:{setSize(width:number,height:number,ratio:number):void}}).coords.setSize(400,200,1);
 h.emit(output());const scene=h.native.scene,previous=scene.indicators.get(h.record.id),registry=h.core.registry;
 const capture=Object.getOwnPropertyDescriptor(NativeRenderer.prototype,'lvCaptureTimeFrame')!.value as (count:number,tail:number)=>object,frame=Reflect.apply(capture,h.renderer,[1,1700000000000]);
 return{...h,scene,previous,registry,frame,capture};
}
function preservePrototype(object:object){const parent=Object.getPrototypeOf(object);closes.push(()=>{Object.setPrototypeOf(object,parent);});return parent;}

it('canonical actual registry and renderer methods retain genuine private frame and full same-id native updates',async()=>{
 const h=await actual();h.emit(output('#123456'));expect(h.renderer).toBeInstanceOf(NativeRenderer);expect(Reflect.apply(h.capture,h.renderer,[1,1700000000000])).toBe(h.frame);expect(h.scene.indicators.get(h.record.id).series[0].style.color).toBe('#123456');expect(h.record.model).toBe(h.scene.indicators.get(h.record.id));
});

it('a farther registry get is refused before the first owned bridge lookup visits its deep prototype',async()=>{
 const h=await actual(),registry=h.registry,prior=Object.getOwnPropertyDescriptor(registry,'get')!,parent=preservePrototype(registry),chain=deep(Object.assign(Object.create(parent),{get:prior.value}));
 delete registry.get;Object.setPrototypeOf(registry,chain.head);closes.push(()=>{Object.defineProperty(registry,'get',prior);});
 expect(()=>h.emit(output('#123456'))).toThrow('bounded data method unavailable');expect(chain.traps()).toBe(0);expect(h.scene.indicators.get(h.record.id)).toBe(h.previous);
});

it('a farther renderer mount is refused although instanceof, private frame, and own native scene remain exact',async()=>{
 const h=await actual(),parent=preservePrototype(h.renderer),chain=deep(parent),sceneDescriptor=Object.getOwnPropertyDescriptor(h.renderer,'scene');expect(h.renderer).toBeInstanceOf(NativeRenderer);Object.setPrototypeOf(h.renderer,chain.head);
 expect(Reflect.apply(h.capture,h.renderer,[1,1700000000000])).toBe(h.frame);expect(Object.getOwnPropertyDescriptor(h.renderer,'scene')).toEqual(sceneDescriptor);
 expect(()=>h.emit(output('#123456'))).toThrow('bounded data method unavailable');expect(chain.traps()).toBe(0);expect(h.scene.indicators.get(h.record.id)).toBe(h.previous);
});

it('a deep registry chain inserted by the actual get callback refuses before any accepted mount or deep lookup',async()=>{
 const h=await actual(),registry=h.registry,parent=preservePrototype(registry),chain=deep(parent),get=registry.get,mount=vi.spyOn(h.renderer,'mountIndicator');let inserted=false;
 Object.defineProperty(registry,'get',{configurable:true,writable:true,value:function(this:object,...args:unknown[]){const record=Reflect.apply(get,this,args);if(!inserted){inserted=true;Object.setPrototypeOf(registry,chain.head);}return record;}});
 expect(()=>h.bridge.update(h.record.renderHandle,{kind:'value',indicatorId:h.record.id,dirty:{from:0,to:0},series:[]})).toThrow('method chain changed');expect(inserted).toBe(true);expect(chain.traps()).toBe(0);expect(mount).not.toHaveBeenCalled();expect(h.scene.indicators.get(h.record.id)).toBe(h.previous);
});

it('a native mount callback inserting a deep renderer chain cannot get a successful stale recovery mount',async()=>{
 const h=await actual(),parent=preservePrototype(h.renderer),chain=deep(parent),mount=h.renderer.mountIndicator.bind(h.renderer);let calls=0;
 h.renderer.mountIndicator=model=>{calls++;const handle=mount(model);Object.setPrototypeOf(h.renderer,chain.head);return handle;};
 const result=captured(()=>h.emit(output('#123456')));expect(result.threw).toBe(true);expect(result.error).toBeInstanceOf(AggregateError);expect(calls).toBe(1);expect(chain.traps()).toBe(0);expect(leaves(result.error).some(error=>error instanceof Error&&error.message.includes('method observation retired'))).toBe(true);
});

it('same-function registry descriptor changes inside the actual callback retire the captured observation',async()=>{
 const h=await actual(),registry=h.registry,get=registry.get,mount=vi.spyOn(h.renderer,'mountIndicator');let callback:(...args:unknown[])=>unknown;
 callback=function(this:object,...args:unknown[]){const record=Reflect.apply(get,this,args);Object.defineProperty(registry,'get',{value:callback,configurable:true,writable:false});return record;};Object.defineProperty(registry,'get',{value:callback,configurable:true,writable:true});
 expect(()=>h.bridge.update(h.record.renderHandle,{kind:'value',indicatorId:h.record.id,dirty:{from:0,to:0},series:[]})).toThrow('method changed');expect(mount).not.toHaveBeenCalled();expect(h.scene.indicators.get(h.record.id)).toBe(h.previous);
});

it('a falsy callback failure propagates unchanged when its method observation remains current',async()=>{
 const h=await actual(),registry=h.registry;Object.defineProperty(registry,'get',{configurable:true,writable:true,value(){throw 0;}});
 const result=captured(()=>h.bridge.update(h.record.renderHandle,{kind:'value',indicatorId:h.record.id,dirty:{from:0,to:0},series:[]}));expect(result.threw).toBe(true);expect(result.error).toBe(0);expect(h.scene.indicators.get(h.record.id)).toBe(h.previous);
});

it('a falsy primary callback failure is first in the aggregate when its post-callback chain also retires',async()=>{
 const h=await actual(),registry=h.registry,parent=preservePrototype(registry),chain=deep(parent);Object.defineProperty(registry,'get',{configurable:true,writable:true,value(){Object.setPrototypeOf(registry,chain.head);throw false;}});
 const result=captured(()=>h.bridge.update(h.record.renderHandle,{kind:'value',indicatorId:h.record.id,dirty:{from:0,to:0},series:[]}));expect(result.threw).toBe(true);expect(result.error).toBeInstanceOf(AggregateError);expect((result.error as AggregateError).errors[0]).toBe(false);expect((result.error as AggregateError).errors[1]).toBeInstanceOf(Error);expect(chain.traps()).toBe(0);expect(h.scene.indicators.get(h.record.id)).toBe(h.previous);
});

it('actual claimed descriptor retirement during mount prevents stale rollback without recreating claim authority',async()=>{
 const h=await actual(),mount=h.renderer.mountIndicator.bind(h.renderer);let calls=0;h.renderer.mountIndicator=model=>{calls++;const handle=mount(model);h.release();return handle;};
 const result=captured(()=>h.emit(output('#123456')));expect(result.threw).toBe(true);expect(result.error).toBeInstanceOf(AggregateError);expect(calls).toBe(1);expect(()=>h.bridge.claim(h.descriptor)).toThrow('not current');
});
