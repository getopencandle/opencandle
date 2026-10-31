import {afterEach,expect,it,vi} from 'vitest';
import {NativeRenderer,type NativeIndicatorOutput} from '@luxalgo/vela';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import {nativeCoreHarness} from './native-core-harness';
import {createNativeFullModelBridge,type NativeFullModelBridge} from '../../src/chart/native-full-model';

// Executes the EXACT renderer declaration used by createChartProbe, with its
// actual trusted module captures and genuine installed SDK/core/bridge. This
// does not invoke createChartProbe, mount a DOM chart, or claim GUI acceptance.
// The existing constructor-source seam is fixed by the reviewed sparse harness;
// ordinary actual-main execution reads src/chart/adapter.ts.
const source=readFileSync(resolve(process.env.LV_CONSTRUCTOR_SOURCE_ROOT??'.','src/chart/adapter.ts'),'utf8').replace(/\r\n/g,'\n');
const capture=source.split('\n').find(line=>line.startsWith('const lvNativeMountIndicator='));
const declaration=source.split('\n').find(line=>line.includes('const rendererHolder:')&&line.includes('class LVRenderer extends NativeRenderer'));
if(!capture||!declaration||!source.includes('renderer:LVRenderer,data: toVelaBars(bars)'))throw Error('Actual application renderer construction boundary missing.');
function applicationRenderer(){
 const code=`function construct(){${capture}\nlet fullModels=null;${declaration}\nreturn {renderer:new LVRenderer(),holder:rendererHolder,setBridge(value){fullModels=value;}};}`;
 return Function('NativeRenderer',stripTypeScriptTypes(code,{mode:'transform'})+';return construct();')(NativeRenderer) as {renderer:NativeRenderer;holder:{current:NativeRenderer};setBridge(value:NativeFullModelBridge):void};
}
const cleanup:Array<()=>void>=[];
afterEach(()=>{const errors:unknown[]=[];for(const close of cleanup.splice(0).reverse())try{close();}catch(error){errors.push(error);}vi.restoreAllMocks();if(errors.length)throw new AggregateError(errors,'SYNTHETIC app renderer cleanup failed.');});
const output=(color='#123456'):NativeIndicatorOutput=>({series:[{id:'plot',title:'SYNTHETIC app renderer',paneId:'',kind:'line',points:[{time:1700000000000,value:10}],style:{color,width:2,lineStyle:'solid'}}],fills:[],priceLines:[]});
async function actual(){
 const h=await nativeCoreHarness(false);cleanup.push(()=>h.dispose());
 const owned=applicationRenderer(),renderer=owned.renderer,native=renderer as any;
 native.scheduler={invalidate(){}};native.inputsUI={upsert(){},remove(){},setValues(){},setVisible(){},setPane(){},setCollapsedPanes(){},reposition(){}};native.scene.ensurePane('price','price',0,3);
 h.core.renderer=renderer;const bridge=createNativeFullModelBridge(h.chart,renderer),release=bridge.claim(h.descriptor);owned.setBridge(bridge);cleanup.push(()=>{release();bridge.dispose();});
 return{...h,...owned,native,bridge};
}

it('the exact app LVRenderer owns an immediate canonical mount and publishes same-id full models through the actual bridge',async()=>{
 const h=await actual();expect(h.holder.current).toBe(h.renderer);expect(h.renderer).toBeInstanceOf(NativeRenderer);
 const parent=Object.getPrototypeOf(h.renderer);expect(Object.getPrototypeOf(parent)).toBe(NativeRenderer.prototype);expect(Object.getOwnPropertyDescriptor(parent,'mountIndicator')?.value).toBeTypeOf('function');
 h.emit(output());const first=h.native.scene.indicators.get(h.record.id),handle=h.record.renderHandle;h.emit(output('#abcdef'));
 const current=h.native.scene.indicators.get(h.record.id);expect(current).not.toBe(first);expect(current.series[0].style.color).toBe('#abcdef');expect(h.record.model).toBe(current);expect(h.record.renderHandle).toBe(handle);
});

it('the app forwarder retains the captured native function and apply after later global/prototype replacement',async()=>{
 const h=await actual(),mount=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(h.renderer),'mountIndicator')!.value;let reads=0;
 const descriptor=Object.getOwnPropertyDescriptor(NativeRenderer.prototype,'mountIndicator')!,apply=Reflect.apply;
 cleanup.push(()=>{Object.defineProperty(NativeRenderer.prototype,'mountIndicator',descriptor);Reflect.apply=apply;});
 const model=h.core.buildNativeModel(h.record,output());h.core.placeModel(model,h.record.id,'price');let returned:unknown;
 try{Object.defineProperty(NativeRenderer.prototype,'mountIndicator',{configurable:true,get(){reads++;throw Error('Late parent lookup');}});Reflect.apply=(()=>{throw Error('Late apply lookup');}) as typeof Reflect.apply;returned=apply(mount,h.renderer,[model]);}
 finally{Object.defineProperty(NativeRenderer.prototype,'mountIndicator',descriptor);Reflect.apply=apply;}
 expect(returned).toEqual({id:h.record.id});expect(h.native.scene.indicators.get(h.record.id)).toBe(model);expect(reads).toBe(0);
});

it.each([0,false])('the actual native mount preserves a falsy throw %s through the app forwarder',async failure=>{
 const h=await actual(),mount=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(h.renderer),'mountIndicator')!.value,model=h.core.buildNativeModel(h.record,output());h.core.placeModel(model,h.record.id,'price');
 h.native.scheduler.invalidate=()=>{throw failure;};let threw=false,caught:unknown;try{Reflect.apply(mount,h.renderer,[model]);}catch(error){threw=true;caught=error;}
 expect(threw).toBe(true);expect(caught).toBe(failure);expect(h.native.scene.indicators.get(h.record.id)).toBe(model);
});

it('a deep chain inserted ahead of the actual app renderer still refuses before any deeper prototype trap',async()=>{
 const h=await actual();h.emit(output());const previous=h.native.scene.indicators.get(h.record.id),parent=Object.getPrototypeOf(h.renderer),model=h.core.buildNativeModel(h.record,output('#abcdef'));h.core.placeModel(model,h.record.id,'price');h.record.model=model;let traps=0;
 const proxy=new Proxy(Object.create(parent),{getOwnPropertyDescriptor(target,key){traps++;return Reflect.getOwnPropertyDescriptor(target,key);},getPrototypeOf(target){traps++;return Reflect.getPrototypeOf(target);}});let head:object=proxy;for(let index=0;index<4096;index++)head=Object.create(head);
 cleanup.push(()=>{Object.setPrototypeOf(h.renderer,parent);});Object.setPrototypeOf(h.renderer,head);
 expect(()=>h.bridge.update(h.record.renderHandle,{kind:'value',indicatorId:h.record.id,dirty:{from:0,to:0},series:[]})).toThrow('bounded data method unavailable');expect(traps).toBe(0);expect(h.native.scene.indicators.get(h.record.id)).toBe(previous);
});
