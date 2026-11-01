import {afterEach,expect,it} from 'vitest';
import {builtinPresentationFixture} from '../fixtures/builtin-presentation';
import {createBuiltinPresentationPort,type BuiltinPresentationControl,type BuiltinNumericDraft} from '../../src/chart/builtin-presentation-proof';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {encodeIndicatorSource} from '../../src/domain/indicator-source';
const held:Awaited<ReturnType<typeof builtinPresentationFixture>>[]=[],controls:BuiltinPresentationControl[]=[];afterEach(()=>{for(const c of controls.splice(0).reverse())c.dispose();for(const h of held.splice(0).reverse())h.dispose();});
async function fixture(){const h=await builtinPresentationFixture();held.push(h);return h;}
function ready(h:Awaited<ReturnType<typeof fixture>>,id:string){const view=h.port.captureReadout?.(id);expect(view?.state).toBe('ready');if(view?.state!=='ready')throw Error('Synthetic native proof missing.');return view;}
/** Counter/descriptor unit harness is a FOREIGN factory, never installed into the actual indicator port. */
function foreign(h:Awaited<ReturnType<typeof fixture>>,primary:()=>readonly any[]=()=>h.rows){let control!:BuiltinPresentationControl;const port=createBuiltinPresentationPort(h.chart as any,h.owner.host,primary,c=>{control=c;return{};});controls.push(control);return{port,control};}
function draft(h:Awaited<ReturnType<typeof fixture>>,control:BuiltinPresentationControl,id:string,budget:{operations:number;numericSlots:number},input:readonly any[]=h.core.bars,raw:readonly any[]=h.rows){const model=h.instance(id),hooks=control.hooks(model,()=>true),token=hooks.prepare(model.settings,model.result,raw,h.rows,input,budget,()=>{},'candles');return{model,hooks,token};}
function emit(h:Awaited<ReturnType<typeof fixture>>,row:ReturnType<typeof draft>){if(!row.token)throw Error('Expected admitted optional draft.');const prepared=renderIndicatorPresentation(row.model.settings,row.model.result,h.rows,{resolution:'1m',style:'candles'},row.token);row.model.ctx.emit(prepared.output);row.model.acceptedOutput=prepared.output;row.hooks.accept(row.token,row.model.result,prepared.output,prepared.precision);row.hooks.abort(row.token);}
it('a replacement numerical getter cannot execute through an accepted view or revive after restoration',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),view=ready(h,id),plot=h.instance(id).result.series[0],original=Object.getOwnPropertyDescriptor(plot,'values')!;let calls=0;Object.defineProperty(plot,'values',{configurable:true,get(){calls++;throw Error('Numerical getter must not run.');}});expect(()=>view.readAt(160)).toThrow();expect(calls).toBe(0);Object.defineProperty(plot,'values',original);expect(()=>view.assertCurrent()).toThrow();expect(h.port.captureReadout?.(id).state).toBe('unavailable');
});
it('effective input accessors are observed descriptor-first without coercion or getter execution',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),view=ready(h,id),inputs=h.instance(id).settings.inputs,original=Object.getOwnPropertyDescriptor(inputs,'length')!;let calls=0;Object.defineProperty(inputs,'length',{configurable:true,get(){calls++;return 99;}});expect(()=>view.assertCurrent()).toThrow();expect(calls).toBe(0);Object.defineProperty(inputs,'length',original);expect(()=>view.readAt(160)).toThrow();
});
it('a no-op native emit cannot certify new accepted numbers under the previous mounted arrays',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),model=h.instance(id),original=model.ctx.emit;model.ctx.emit=()=>{};h.port.update(id,{inputs:{length:1}});expect(h.port.values(id).series[0].values).toEqual([3,9,6,12]);expect(h.port.captureReadout?.(id).state).toBe('unavailable');model.ctx.emit=original;h.port.recompute();expect(ready(h,id).readAt(160).plots[0].value).toBe(9);
});
it('a public foreign factory cannot rebind or retire authority on the real port',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),view=ready(h,id);expect(()=>createBuiltinPresentationPort(h.chart as any,{captureOwner:()=>({isCurrent:()=>true,quarantine(){}})},()=>h.rows,()=>h.port)).toThrow('already owned');expect(view.readAt(160).plots[0].value).toBe(6);
});
it('matching native times and counts do not authorize a view whose actual prices differ from private primary input',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),old=ready(h,id);h.core.bars=h.core.bars.map((row:any,index:number)=>index===1?{...row,close:123}:row);h.instance(id).onBars();expect(h.port.values(id).series[0].values).toEqual([null,6,7.5,9]);expect(h.port.captureReadout?.(id).state).toBe('unavailable');expect(()=>old.assertCurrent()).toThrow();
});
it('a substituted transformation callback cannot mint proof while normal calculation still completes',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),model=h.instance(id),original=model.calculationBars;model.calculationBars=(bars:any[])=>bars.map(row=>({...row,close:999}));model.compute();expect(h.port.values(id).series[0].values).toEqual([null,999,999,999]);expect(h.port.captureReadout?.(id).state).toBe('unavailable');model.calculationBars=original;model.compute();expect(ready(h,id).readAt(160).plots[0].value).toBe(6);
});
it('dependency and viewport readers stay unavailable without replacing valid independent core values',async()=>{
 const h=await fixture(),base=h.port.add('sma',{length:2}),dependent=h.port.add('ema',{length:2,source:encodeIndicatorSource(base,'sma')}),viewport=h.port.add('visibleavg');expect(h.port.values(dependent).series.length).toBeGreaterThan(0);expect(h.port.captureReadout?.(dependent).state).toBe('unavailable');expect(h.port.captureReadout?.(viewport).state).toBe('unavailable');expect(ready(h,base).readAt(160).plots[0].value).toBe(6);
});
it('returned tiny immutable scalars contain no numerical arrays model or source graph aliases',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),view=ready(h,id),value=view.readAt(160);expect(Reflect.ownKeys(view).sort()).toEqual(['assertCurrent','readAt','state']);expect(Object.isFrozen(value)).toBe(true);expect(Object.isFrozen(value.plots)).toBe(true);expect(Object.isFrozen(value.plots[0])).toBe(true);expect(Reflect.ownKeys(value).sort()).toEqual(['paneId','plots','precision','time','title','visible']);expect(value.plots[0].label).toBe('SMA');expect(value.plots[0].value).toBe(6);
});
it('operation headroom refuses before any history index inspection while existing calculation remains accepted',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2});let reads=0;const primary=new Proxy(h.rows,{getOwnPropertyDescriptor(target,key){if(typeof key==='string'&&/^\d+$/.test(key))reads++;return Reflect.getOwnPropertyDescriptor(target,key);}}),native=new Proxy(h.core.bars,{getOwnPropertyDescriptor(target,key){if(typeof key==='string'&&/^\d+$/.test(key))reads++;return Reflect.getOwnPropertyDescriptor(target,key);}}),x=foreign(h,()=>primary);h.core.bars=native;const row=draft(h,x.control,id,{operations:80000000-703,numericSlots:0},native,primary);expect(row.token).toBeUndefined();expect(reads).toBe(0);expect(h.port.values(id).series[0].values).toEqual([null,6,7.5,9]);
});
it('storage headroom includes pending U160 plus K72 and refuses before history work',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2});let reads=0;const primary=new Proxy(h.rows,{getOwnPropertyDescriptor(target,key){if(typeof key==='string'&&/^\d+$/.test(key))reads++;return Reflect.getOwnPropertyDescriptor(target,key);}}),x=foreign(h,()=>primary);expect(draft(h,x.control,id,{operations:0,numericSlots:8000000-160-72+1},h.core.bars,primary).token).toBeUndefined();expect(reads).toBe(0);expect(h.port.values(id).series[0].values[1]).toBe(6);
});
it('accepted W704 remains charged for a second sequential proof until the first retires',async()=>{
 const h=await fixture(),one=h.port.add('sma',{length:2}),two=h.port.add('sma',{length:2}),x=foreign(h),budget={operations:80000000-704,numericSlots:0},first=draft(h,x.control,one,budget);emit(h,first);const snapshot=x.control.capture(first.model);expect(snapshot.state).toBe('ready');expect(draft(h,x.control,two,budget).token).toBeUndefined();expect(h.port.values(two).series[0].values[1]).toBe(6);x.control.drop(first.model);if(snapshot.state==='ready')expect(()=>snapshot.assertCurrent()).toThrow();const second=draft(h,x.control,two,budget);expect(second.token).toBeDefined();emit(h,second);expect(x.control.capture(second.model).state).toBe('ready');
});
it('array side-key enumeration is never needed to lock only owned numeric indices',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),model=h.instance(id);let enumerations=0;const original=model.result.series[0].values,proxy=new Proxy(original,{ownKeys(){enumerations++;throw Error('Unbounded array key enumeration.');}});model.result.series[0].values=proxy;const x=foreign(h),row=draft(h,x.control,id,{operations:0,numericSlots:0});emit(h,row);expect(enumerations).toBe(0);expect(Object.getOwnPropertyDescriptor(original,'1')).toMatchObject({writable:false,configurable:false});expect(x.control.capture(model).state).toBe('ready');
});

it('a runtime-writable shadow preflight callback cannot replace the genuine private aggregate budget',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),model=h.instance(id);let calls=0;Object.defineProperty(model,'preflight',{configurable:true,get(){calls++;return()=>({operations:0,numericSlots:0});}});model.compute();expect(calls).toBe(0);expect(ready(h,id).readAt(160).plots[0].value).toBe(6);
});
it('earlier native-only timestamp mutation cannot relabel accepted index values to an unaccepted time',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),view=ready(h,id),row=h.core.bars[1];row.time=130000;expect(()=>view.readAt(130)).toThrow();expect(()=>view.readAt(160)).toThrow();row.time=160000;expect(()=>view.assertCurrent()).toThrow();expect(h.port.captureReadout?.(id).state).toBe('unavailable');
});
