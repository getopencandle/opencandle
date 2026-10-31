import {afterEach,expect,it,vi} from 'vitest';
import {cloneProfileInputBars,seasonalityLiveNativeInputMatches,seasonalityLiveCloneMatchesContext} from '../../src/chart/profile-input-clone';
import {sourceContextForDataset,seasonalityDailyProducerInputValuesMatch,seasonalityDailyContextInputValuesMatch} from '../../src/chart/source-context';
import {publishedSource,unix,flushMtf} from '../fixtures/qualified-nyse-mtf-source';
import type {Bar} from '../../src/domain/types';

// Invented prices carried through the actual provider/session/context/clone
// constructors. Supplied native arrays test comparison only, not native
// ownership/publication or full live Seasonality numerical acceptance.
const owned:{dispose():void}[]=[];
afterEach(()=>{const errors:unknown[]=[];for(const value of owned.splice(0).reverse())try{value.dispose();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'SYNTHETIC fused-input cleanup failed.');});
const fields=['time','open','high','low','close','volume'] as const;
const start=unix('2024-03-11T13:30:00Z');
const literal=():Bar[]=>[
 {time:start,open:10,high:14,low:8,close:12,volume:1},
 {time:start+900,open:20,high:24,low:18,close:22,volume:2},
 {time:start+1800,open:6,high:8,low:4,close:6,volume:3}
];
async function setup(style='candles'){
 const producer=await publishedSource({bars:literal(),resolution:'15m'});owned.push(producer);const selected=producer.regular();
 expect(selected.bars.map(row=>row.close)).toEqual([12,22,6]);
 const context=sourceContextForDataset(selected,selected.bars),bars=cloneProfileInputBars(selected.bars),nativeRaw=bars.map(row=>({...row,time:row.time*1000}));
 const native=style==='heikinashi'?[
  {time:start*1000,open:11,high:14,low:8,close:11,volume:1},
  {time:(start+900)*1000,open:11,high:24,low:11,close:21,volume:2},
  {time:(start+1800)*1000,open:16,high:16,low:4,close:6,volume:3}
 ]:nativeRaw.map(row=>({...row}));
 const shown=native.map(row=>({...row})),nativeTimes=nativeRaw.map(row=>row.time),assert=vi.fn(()=>{});
 const check=()=>seasonalityLiveNativeInputMatches(bars,context,3,nativeRaw,native,shown,style,nativeTimes,assert);
 return{producer,selected,context,bars,nativeRaw,native,shown,nativeTimes,assert,check};
}
it('compares genuine ordinary selected/clone inputs and literal native prices with exactly2M+1 owner fences',async()=>{
 const f=await setup();expect(seasonalityDailyProducerInputValuesMatch(f.context,f.selected.bars,3)).toBe(true);expect(f.check()).toBe(true);expect(f.assert).toHaveBeenCalledTimes(7);
 expect(f.bars.map(row=>[row.open,row.close,row.volume])).toEqual([[10,12,1],[20,22,2],[6,6,3]]);
 expect(seasonalityLiveCloneMatchesContext(f.bars,f.context,3)).toBe(true);expect(seasonalityDailyContextInputValuesMatch(f.context,f.bars,3)).toBe(true);
});
it('preserves ordered Heikin Ashi open/close recurrence, extrema and millisecond native times',async()=>{
 const f=await setup('heikinashi');expect(f.check()).toBe(true);expect(f.native.map(row=>[row.open,row.high,row.low,row.close])).toEqual([[11,14,8,11],[11,24,11,21],[16,16,4,6]]);expect(f.assert).toHaveBeenCalledTimes(7);
});
it('unknown clones and copied contexts refuse before supplied row traps or owner callbacks',async()=>{
 const f=await setup(),trap=vi.fn(()=>{throw Error('Foreign native data.');}),foreign=new Proxy([],{get:trap,getOwnPropertyDescriptor:trap,getPrototypeOf:trap});
 expect(seasonalityLiveNativeInputMatches(f.bars.map(row=>({...row})),f.context,3,foreign,foreign,foreign,'candles',foreign,f.assert)).toBe(false);
 expect(seasonalityLiveNativeInputMatches(f.bars,{...f.context},3,foreign,foreign,foreign,'candles',foreign,f.assert)).toBe(false);expect(trap).not.toHaveBeenCalled();expect(f.assert).not.toHaveBeenCalled();
 expect(seasonalityDailyProducerInputValuesMatch({...f.context},f.selected.bars,3)).toBe(false);expect(seasonalityDailyProducerInputValuesMatch(f.context,[...f.selected.bars],3)).toBe(false);
});
it.each(fields)('rejects a changed private clone %s and keeps the rejected copy terminal',async field=>{
 const f=await setup();f.bars[0][field]+=1;expect(f.check()).toBe(false);f.bars[0][field]-=1;expect(f.check()).toBe(false);
});
it.each(fields)('rejects an actual selected-original %s mutation against the producer and private snapshot',async field=>{
 const f=await setup();f.selected.bars[0][field]+=1;expect(f.check()).toBe(false);f.selected.bars[0][field]-=1;expect(f.check()).toBe(false);
});
it.each(['nativeRaw','native','shown'] as const)('rejects every changed scalar in %s rather than checking the tail only',async target=>{
 for(const field of fields){const f=await setup();f[target][0][field]+=1;expect(f.check()).toBe(false);}
});
it('rejects same-valued cloned row replacement, wrong lengths and seconds used as native milliseconds',async()=>{
 const replaced=await setup();replaced.bars[0]={...replaced.bars[0]};expect(replaced.check()).toBe(false);
 const length=await setup();length.native.pop();expect(length.check()).toBe(false);
 const seconds=await setup();seconds.shown[0].time=start;expect(seconds.check()).toBe(false);
});
it('a later native descriptor cannot change an earlier clone after it was compared',async()=>{
 const f=await setup();let changed=false;f.shown[2]=new Proxy(f.shown[2],{getOwnPropertyDescriptor(target,key){if(!changed){changed=true;f.bars[0].close=999;}return Reflect.getOwnPropertyDescriptor(target,key);}});
 expect(f.check()).toBe(false);expect(changed).toBe(true);expect(f.bars[0].close).toBe(999);
});
it('the post-native clone pass detects earlier clone changes from the final row owner callback',async()=>{
 const f=await setup();f.assert.mockImplementation(()=>{if(f.assert.mock.calls.length===6)f.bars[0].close=999;});expect(f.check()).toBe(false);expect(f.assert).toHaveBeenCalledTimes(6);
});
it('preserves a falsy owner failure without converting it into successful comparison',async()=>{
 const f=await setup();f.assert.mockImplementation(()=>{throw 0;});let failed=false,caught:unknown;try{f.check();}catch(error){failed=true;caught=error;}expect(failed).toBe(true);expect(caught).toBe(0);
});
it('rejects accessor native fields without invoking the accessor',async()=>{
 const f=await setup(),get=vi.fn(()=>12);Object.defineProperty(f.native[0],'close',{enumerable:true,configurable:true,get});expect(()=>f.check()).toThrow();expect(get).not.toHaveBeenCalled();
});
it('actual provider retirement during the row fences invalidates the final producer pass',async()=>{
 const f=await setup();f.assert.mockImplementation(()=>{if(f.assert.mock.calls.length===6)f.producer.dispose();});expect(f.check()).toBe(false);await flushMtf();expect(seasonalityDailyProducerInputValuesMatch(f.context,f.selected.bars,3)).toBe(false);
});
it('compares every native coordinate time rather than only its count and edges',async()=>{
 const f=await setup();f.nativeTimes[1]+=1;expect(f.check()).toBe(false);expect(f.nativeTimes[0]).toBe(start*1000);expect(f.nativeTimes[2]).toBe((start+1800)*1000);
});
it('rejects seconds or wrong coordinate-array length without accepting otherwise equal native rows',async()=>{
 const seconds=await setup();seconds.nativeTimes[1]/=1000;expect(seconds.check()).toBe(false);
 const length=await setup();length.nativeTimes.pop();expect(length.check()).toBe(false);
});
it('checks interior coordinate times again after a later native descriptor callback',async()=>{
 const f=await setup();let changed=false;f.shown[2]=new Proxy(f.shown[2],{getOwnPropertyDescriptor(target,key){if(!changed){changed=true;f.nativeTimes[1]+=1;}return Reflect.getOwnPropertyDescriptor(target,key);}});
 expect(f.check()).toBe(false);expect(changed).toBe(true);
});

it('the final clone check also follows every descriptor from the coordinate postpass',async()=>{
 const f=await setup();let tails=0;const times=new Proxy(f.nativeTimes,{getOwnPropertyDescriptor(target,key){if(key==='2'&&++tails===2)f.bars[0].close=999;return Reflect.getOwnPropertyDescriptor(target,key);}});
 expect(seasonalityLiveNativeInputMatches(f.bars,f.context,3,f.nativeRaw,f.native,f.shown,'candles',times,f.assert)).toBe(false);expect(tails).toBe(2);expect(f.bars[0].close).toBe(999);
});
