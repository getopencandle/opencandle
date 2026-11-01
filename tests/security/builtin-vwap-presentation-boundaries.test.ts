import {afterEach,expect,it} from 'vitest';
import {builtinVwapFixture} from '../fixtures/builtin-vwap-presentation';
import {createBuiltinPresentationPort,type BuiltinPresentationControl} from '../../src/chart/builtin-presentation-proof';
import {drainVwap} from '../chart/vwap-indicator-native-harness';
const held:Awaited<ReturnType<typeof builtinVwapFixture>>[]=[],controls:BuiltinPresentationControl[]=[];
afterEach(()=>{for(const c of controls.splice(0).reverse())c.dispose();for(const h of held.splice(0).reverse())h.dispose();});
async function fixture(){const h=await builtinVwapFixture();held.push(h);return h;}
function ready(h:Awaited<ReturnType<typeof fixture>>,id:string){const view=h.port.captureReadout?.(id);expect(view?.state).toBe('ready');if(view?.state!=='ready')throw Error('Missing genuine accepted VWAP.');return view;}
/** Foreign counter unit only. It cannot replace the actual installed port's private pipeline. */
function foreign(h:Awaited<ReturnType<typeof fixture>>,primary:()=>readonly any[]=()=>h.rows){let control!:BuiltinPresentationControl;const value=createBuiltinPresentationPort(h.chart as any,h.owner.host,primary,c=>{control=c;return{};});controls.push(control);return{control,value};}

it('a public foreign factory cannot register authority on the real pending VWAP port',async()=>{
 const h=await fixture(),id=h.port.add('vwap',{kernelVersion:2,source:'close'});expect(()=>createBuiltinPresentationPort(h.chart as any,h.owner.host,()=>h.rows,()=>h.port)).toThrow(/already owned/);expect((h.port as any).prepareVwap).toBeUndefined();expect(h.port.captureReadout?.(id).state).toBe('unavailable');await h.finish();expect(ready(h,id).readAt(h.rows[0].time).plots[0].value).toBe(12);
});
it('a current native replacement cannot borrow a settled VWAP numerical result',async()=>{
 const h=await fixture(),id=h.port.add('vwap',{kernelVersion:2,source:'close'});await h.finish();const view=ready(h,id),nativeId=h.port.list()[0].rendererId,record=h.records.get(nativeId);h.core.applyModel(nativeId,h.core.buildNativeModel(record,{series:[],fills:[],priceLines:[]}));expect(()=>view.assertCurrent()).toThrow();expect(h.port.captureReadout?.(id).state).toBe('unavailable');expect(h.port.values(id).series[0].values).toEqual([12,44/3,98/6]);
});
it('an external source-owner retirement terminates a retained ready VWAP view',async()=>{
 const h=await fixture(),id=h.port.add('vwap',{kernelVersion:2,source:'close'});await h.finish();const view=ready(h,id);h.retire();expect(()=>view.assertCurrent()).toThrow();expect(h.port.captureReadout?.(id).state).toBe('unavailable');
});
it('the async persistent and scratch surcharge is admitted before any history index read',async()=>{
 const h=await fixture(),id=h.port.add('vwap',{kernelVersion:2,source:'close'});await h.finish();const model=h.instance(id),P=model.result.series.length,N=h.rows.length,Q=Object.keys(model.settings.inputs).length,U=192+32*P+16*(Q+1),K=80+8*P;let reads=0;
 const guarded=new Proxy(h.rows,{getOwnPropertyDescriptor(target,key){if(key!=='length'){reads++;throw Error('History traversed before optional capacity refusal.');}return Reflect.getOwnPropertyDescriptor(target,key);}}),x=foreign(h,()=>guarded),hooks=x.control.hooks(model,()=>true);
 expect(hooks.prepareVwap(model.settings,model.result,guarded,h.rows,h.core.bars,{operations:0,numericSlots:8000000-U-K+1},()=>{},'candles',Q)).toBeUndefined();expect(reads).toBe(0);expect(ready(h,id).readAt(h.rows[1].time).plots[0].value).toBe(44/3);expect(N).toBe(3);
});
it('async proof work refuses one operation beyond the unchanged cap before row traversal',async()=>{
 const h=await fixture(),id=h.port.add('vwap',{kernelVersion:2,source:'close'});await h.finish();const model=h.instance(id),N=h.rows.length,P=model.result.series.length,Q=Object.keys(model.settings.inputs).length,W=64*N+16*N*P+128*P+256+8192*(Q+1)*(2*P+9);let reads=0;
 const guarded=new Proxy(h.rows,{getOwnPropertyDescriptor(target,key){if(key!=='length'){reads++;throw Error('History traversed before optional work refusal.');}return Reflect.getOwnPropertyDescriptor(target,key);}}),x=foreign(h,()=>guarded),hooks=x.control.hooks(model,()=>true);
 expect(hooks.prepareVwap(model.settings,model.result,guarded,h.rows,h.core.bars,{operations:80000000-W+1,numericSlots:0},()=>{},'candles',Q)).toBeUndefined();expect(reads).toBe(0);expect(ready(h,id).readAt(h.rows[0].time).plots[0].value).toBe(12);
});
it('the exact async headroom boundary accepts and retains its whole reservation once',async()=>{
 const h=await fixture(),id=h.port.add('vwap',{kernelVersion:2,source:'close'});await h.finish();const model=h.instance(id),P=model.result.series.length,Q=Object.keys(model.settings.inputs).length,U=192+32*P+16*(Q+1),K=80+8*P,x=foreign(h),hooks=x.control.hooks(model,()=>true),token=hooks.prepareVwap(model.settings,model.result,h.rows,h.rows,h.core.bars,{operations:0,numericSlots:8000000-U-K},()=>{},'candles',Q);expect(token).toBeDefined();hooks.accept(token,model.result,model.acceptedOutput,model.displayPrecision);hooks.abort(token);expect(x.control.capture(model).state).toBe('ready');hooks.retire();expect(x.control.capture(model).state).toBe('unavailable');expect(ready(h,id).readAt(h.rows[1].time).plots[0].value).toBe(44/3);
});
it('async scalar locking preserves the preexisting sealed source and mutable native row descriptors',async()=>{
 const h=await fixture(),id=h.port.add('vwap',{kernelVersion:2,source:'close'});await drainVwap();expect(h.transports[0].request).toBeDefined();const sourceDescriptor=Object.getOwnPropertyDescriptor(h.rows[0],'close')!,nativeDescriptor=Object.getOwnPropertyDescriptor(h.core.bars[0],'close')!;expect(sourceDescriptor.writable).toBe(false);expect(nativeDescriptor.writable).toBe(true);await h.finish();const model=h.instance(id),value=model.result.series[0].values;expect(Object.getOwnPropertyDescriptor(value,'1')).toMatchObject({writable:false,configurable:false});expect(Object.getOwnPropertyDescriptor(value,'length')!.writable).toBe(false);expect(Object.getOwnPropertyDescriptor(h.rows[0],'close')).toEqual(sourceDescriptor);expect(Object.getOwnPropertyDescriptor(h.core.bars[0],'close')).toEqual(nativeDescriptor);expect(ready(h,id).readAt(h.rows[1].time).plots[0].value).toBe(44/3);
});
it('an earlier native-only time correction cannot relabel a settled asynchronous value',async()=>{
 const h=await fixture(),id=h.port.add('vwap',{kernelVersion:2,source:'close'});await h.finish();const view=ready(h,id),time=h.core.bars[1].time;h.core.bars[1].time=time-30000;expect(()=>view.readAt((time-30000)/1000)).toThrow();expect(()=>view.readAt(time/1000)).toThrow();h.core.bars[1].time=time;expect(()=>view.assertCurrent()).toThrow();
});
