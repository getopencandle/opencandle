import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cloneProfileInputBars,seasonalityLiveNativeInputGrid,seasonalityLiveNativeInputMatches} from '../../src/chart/profile-input-clone';
import {sourceContextForDataset,captureSeasonalityDailyContext} from '../../src/chart/source-context';
import {isAlpacaSyntheticStub,selectAlpacaSyntheticStub} from '../../src/domain/alpaca-live';
import {publishedSource,unix} from '../fixtures/qualified-nyse-mtf-source';
import type {Bar} from '../../src/domain/types';

// Genuine producer/session/context/private-clone construction. The supplied
// native arrays below exercise comparison only; they grant no native ownership,
// budget or publication. The unchanged original-SDK pipeline whole file is the
// separate actual closed-caller integration, including literal300->301 values.
const close:Array<()=>void>=[],authenticFreeze=Object.freeze,descriptor=Object.getOwnPropertyDescriptor;
const start=unix('2024-03-11T13:30:00Z');
beforeEach(()=>{const previous=isAlpacaSyntheticStub();close.push(()=>selectAlpacaSyntheticStub(previous));selectAlpacaSyntheticStub(true);});
afterEach(()=>{vi.restoreAllMocks();const errors:unknown[]=[];for(const dispose of close.splice(0).reverse())try{dispose();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'SYNTHETIC live-grid cleanup failed.');});
const literal=():Bar[]=>[
 {time:start,open:10,high:14,low:8,close:12,volume:1},
 {time:start+900,open:20,high:24,low:18,close:22,volume:2},
 {time:start+1800,open:6,high:8,low:4,close:6,volume:3}
];
async function fixture(style='candles',outsideSession=false){
 const selectedRows=literal(),rows=outsideSession?[
  {time:start-900,open:9,high:12,low:8,close:11,volume:4},...selectedRows,
  {time:start+23400,open:7,high:10,low:5,close:8,volume:5}
 ]:selectedRows;
 const producer=await publishedSource({bars:rows,resolution:'15m'});close.push(()=>producer.dispose());
 const selected=producer.regular(),context=sourceContextForDataset(selected,selected.bars),daily=captureSeasonalityDailyContext(context,2016,2026,'ordinary');if(!daily)throw Error('Missing genuine SYNTHETIC daily source classification.');
 const bars=cloneProfileInputBars(selected.bars),nativeRaw=bars.map(row=>({...row,time:row.time*1000}));
 const native=style==='heikinashi'?[
  {time:start*1000,open:11,high:14,low:8,close:11,volume:1},
  {time:(start+900)*1000,open:11,high:24,low:11,close:21,volume:2},
  {time:(start+1800)*1000,open:16,high:16,low:4,close:6,volume:3}
 ]:nativeRaw.map(row=>({...row}));
 const shown=native.map(row=>({...row})),nativeTimes=nativeRaw.map(row=>row.time),assert=vi.fn(()=>daily.assertCurrent());
 const grid=(times:readonly number[]=nativeTimes)=>seasonalityLiveNativeInputGrid(bars,context,3,nativeRaw,native,shown,style,times,assert);
 const emit=(output:(times:readonly number[])=>void)=>seasonalityLiveNativeInputMatches(bars,context,3,nativeRaw,native,shown,style,nativeTimes,assert,output);
 return{producer,selected,context,bars,nativeRaw,native,shown,nativeTimes,assert,grid,emit};
}
function interceptGridFreeze(action:(grid:number[])=>unknown){
 return vi.spyOn(Object,'freeze').mockImplementation(((value:unknown)=>{
  if(Array.isArray(value)&&value.length===3&&descriptor(value,'0')?.value===start)return action(value);
  return authenticFreeze(value);
 }) as typeof Object.freeze);
}

it('returns exact immutable Candles seconds after genuine source/clone comparison with both original row fences',async()=>{
 const f=await fixture(),grid=f.grid();expect(grid).toEqual([start,start+900,start+1800]);expect(Object.isFrozen(grid)).toBe(true);expect(f.assert).toHaveBeenCalledTimes(8);
 expect(f.bars.map(row=>[row.open,row.close,row.volume])).toEqual([[10,12,1],[20,22,2],[6,6,3]]);
});
it('preserves literal Heikin Ashi recurrence and returns original seconds rather than native milliseconds',async()=>{
 const f=await fixture('heikinashi');expect(f.grid()).toEqual([start,start+900,start+1800]);expect(f.native.map(row=>[row.open,row.high,row.low,row.close])).toEqual([[11,14,8,11],[11,24,11,21],[16,16,4,6]]);expect(f.assert).toHaveBeenCalledTimes(8);
});
it('uses the actual regular selection when the genuine raw producer has a larger pre/post-session extent',async()=>{
 const f=await fixture('candles',true);expect(f.producer.raw().bars).toHaveLength(5);expect(f.selected.bars).toHaveLength(3);expect(f.grid()).toEqual([start,start+900,start+1800]);
});
it.each(['nativeRaw','native','shown'] as const)('refuses a changed earlier %s price without returning a derived grid',async target=>{
 const f=await fixture();f[target][0].close+=1;expect(f.grid()).toBeNull();
});
it('preserves terminal original retirement from the final coordinate descriptor before any observable grid freeze',async()=>{
 const f=await fixture();let tails=0,freezes=0;const times=new Proxy(f.nativeTimes,{getOwnPropertyDescriptor(target,key){if(key==='2'&&++tails===2)f.selected.bars[0].close=999;return Reflect.getOwnPropertyDescriptor(target,key);}});
 interceptGridFreeze(grid=>{freezes++;return authenticFreeze(grid);});expect(f.grid(times)).toBeNull();expect(tails).toBe(2);expect(freezes).toBe(0);expect(f.selected.bars[0].close).toBe(999);
 f.selected.bars[0].close=12;expect(f.grid()).toBeNull();expect(freezes).toBe(0);
});
it('refuses accessor native fields without invoking their getter',async()=>{
 const f=await fixture(),getter=vi.fn(()=>12);Object.defineProperty(f.native[0],'close',{enumerable:true,configurable:true,get:getter});expect(()=>f.grid()).toThrow();expect(getter).not.toHaveBeenCalled();
});
it('rejects an owned-grid scalar changed inside observable freeze',async()=>{
 const f=await fixture();let observed=0;interceptGridFreeze(grid=>{observed++;grid[1]+=60;return authenticFreeze(grid);});expect(f.grid()).toBeNull();expect(observed).toBe(1);
});
it('rejects an indexed grid getter installed by freeze without executing it',async()=>{
 const f=await fixture(),getter=vi.fn(()=>start+900);interceptGridFreeze(grid=>{Object.defineProperty(grid,'1',{enumerable:true,configurable:true,get:getter});return authenticFreeze(grid);});expect(f.grid()).toBeNull();expect(getter).not.toHaveBeenCalled();
});
it('does not substitute a foreign freeze return for the unfrozen actual owned grid',async()=>{
 const f=await fixture(),foreign=authenticFreeze([1,2,3]);interceptGridFreeze(()=>foreign);expect(f.grid()).toBeNull();
});
it('ignores a foreign freeze return when the actual owned grid was frozen and validated',async()=>{
 const f=await fixture(),foreign=authenticFreeze([1,2,3]);let actual:readonly number[]|null=null;interceptGridFreeze(grid=>{actual=grid;authenticFreeze(grid);return foreign;});const result=f.grid();expect(result).toBe(actual);expect(result).not.toBe(foreign);expect(result).toEqual([start,start+900,start+1800]);
});
it('propagates a falsy freeze exception after the original final comparison effects',async()=>{
 const f=await fixture();interceptGridFreeze(()=>{throw 0;});let failed=false,caught:unknown;try{f.grid();}catch(error){failed=true;caught=error;}expect(failed).toBe(true);expect(caught).toBe(0);expect(f.assert).toHaveBeenCalledTimes(7);
});
it('checks genuine producer retirement immediately after freeze before returning a grid',async()=>{
 const f=await fixture();interceptGridFreeze(grid=>{f.producer.dispose();return authenticFreeze(grid);});expect(()=>f.grid()).toThrow();expect(f.assert).toHaveBeenCalledTimes(8);
});
it('bounds the owned array shape before the observable freeze can attach an extra graph',async()=>{
 const f=await fixture();let extensible:boolean|undefined;interceptGridFreeze(grid=>{extensible=Object.isExtensible(grid);Object.defineProperty(grid,'unexpected',{value:{invented:'SYNTHETIC'}});return authenticFreeze(grid);});expect(()=>f.grid()).toThrow(TypeError);expect(extensible).toBe(false);
});
it('the canonical boolean entry point computes once and emits the actual immutable derived grid exactly once',async()=>{
 const f=await fixture();let actual:readonly number[]|null=null;const output=vi.fn((grid:readonly number[])=>{actual=grid;return false;});expect(f.emit(output)).toBe(true);expect(output).toHaveBeenCalledTimes(1);expect(actual).toEqual([start,start+900,start+1800]);expect(Object.isFrozen(actual)).toBe(true);expect(f.assert).toHaveBeenCalledTimes(8);
});
it('rejects a nonfunction derived-grid receiver before inspecting supplied row traps',()=>{
 const trap=vi.fn(()=>{throw Error('Do not inspect foreign rows.');}),foreign=new Proxy([],{get:trap,getOwnPropertyDescriptor:trap,getPrototypeOf:trap});
 const invoke=seasonalityLiveNativeInputMatches as unknown as (...args:unknown[])=>boolean;expect(invoke(foreign,{},3,foreign,foreign,foreign,'candles',foreign,trap,0)).toBe(false);expect(trap).not.toHaveBeenCalled();
});
it('propagates a falsy output-callback exception without converting it into successful boolean admission',async()=>{
 const f=await fixture();let failed=false,caught:unknown;try{f.emit(()=>{throw false;});}catch(error){failed=true;caught=error;}expect(failed).toBe(true);expect(caught).toBe(false);expect(f.assert).toHaveBeenCalledTimes(8);
});

it('unknown clones and copied contexts refuse the new grid path before supplied native traps or owner callbacks',async()=>{
 const f=await fixture(),trap=vi.fn(()=>{throw Error('Foreign native data must not be inspected.');}),foreign=new Proxy([],{get:trap,getOwnPropertyDescriptor:trap,getPrototypeOf:trap});
 expect(seasonalityLiveNativeInputGrid(f.bars.map(row=>({...row})),f.context,3,foreign,foreign,foreign,'candles',foreign,f.assert)).toBeNull();
 expect(seasonalityLiveNativeInputGrid(f.bars,{...f.context},3,foreign,foreign,foreign,'candles',foreign,f.assert)).toBeNull();expect(trap).not.toHaveBeenCalled();expect(f.assert).not.toHaveBeenCalled();
 expect(f.grid()).toEqual([start,start+900,start+1800]);
});
