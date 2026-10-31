import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {DrawingBox} from '@luxalgo/vela';
import {seasonalityIntradayBoxes,seasonalityIntradayBoxCost,type SeasonalityIntradayBoxCoordinates} from '../../src/chart/seasonality-intraday-boxes';

const ms=(value:string)=>Date.parse(value),sec=(value:string)=>ms(value)/1000;
const box=(left=0,right=90000):DrawingBox=>({id:'SYNTHETIC month',paneId:'',overlay:true,xloc:'bar_time',left,right,top:28.125,bottom:25,extend:'none',bgColor:'#26a69a20',borderColor:'#26a69a',borderWidth:1,borderStyle:'solid',text:'12.50%',textColor:'#26a69a',textSize:'small',hAlign:'center',vAlign:'center',wrap:false,fontFamily:'default',bold:false,italic:false});
const grid=(times:readonly number[]=[0,60,120],extra:Partial<SeasonalityIntradayBoxCoordinates>={}):SeasonalityIntradayBoxCoordinates=>({loadedTimes:Object.freeze([...times]),firstObservedTime:times[0],firstLoadedTime:times[0],prefixBars:0,future:null,...extra});
it.each([[30000,.5],[60000,1],[90000,1.5],[120000,2]])('maps a literal loaded boundary/interior %s to %s', (right,expected)=>{
 const result=seasonalityIntradayBoxes([box(0,right)],grid());expect(result[0].left).toBe(0);expect(result[0].right).toBe(expected);expect(result[0].xloc).toBe('bar_index');
});
it('maps only the actual oldest observed LEFT to the destination-excluding negative prefix',()=>{
 const result=seasonalityIntradayBoxes([box(0,660000)],grid([600,660,720],{firstObservedTime:0,prefixBars:10}));expect(result[0].left).toBe(-10);expect(result[0].right).toBe(1);
});
it('refuses arbitrary preloaded extrapolation instead of inventing a calendar endpoint',()=>{
 expect(()=>seasonalityIntradayBoxes([box(60000,660000)],grid([600,660,720],{firstObservedTime:0,prefixBars:10}))).toThrow('unavailable');
});
it('never applies the negative-prefix exception to a right endpoint',()=>{
 expect(()=>seasonalityIntradayBoxes([box(0,60000)],grid([600,660,720],{firstObservedTime:0,prefixBars:10}))).toThrow('unavailable');
});
it('interpolates a weekend loaded gap using actual unequal timestamps',()=>{
 const result=seasonalityIntradayBoxes([box(ms('2024-03-29T19:00Z'),ms('2024-04-01T04:00Z'))],grid([sec('2024-03-29T19:00Z'),sec('2024-04-01T13:30Z')]));expect(result[0].right).toBe(114/133);
});
it('retains literal interpolation across the DST weekend without nominal hourly extrapolation',()=>{
 const result=seasonalityIntradayBoxes([box(ms('2024-03-08T20:00Z'),ms('2024-03-10T07:00Z'))],grid([sec('2024-03-08T20:00Z'),sec('2024-03-11T13:30Z')]));expect(result[0].right).toBe(70/131);
});
it('maps a short final60m session bar and overnight midnight in the actual loaded gap',()=>{
 const result=seasonalityIntradayBoxes([box(ms('2024-03-11T18:30Z'),ms('2024-03-12T04:00Z'))],grid([sec('2024-03-11T18:30Z'),sec('2024-03-11T19:30Z'),sec('2024-03-12T13:30Z')]));expect(result[0].right).toBe(1+17/36);
});
it('uses the tail as implicit future offset0 and preserves exact authored anchors',()=>{
 const c=grid([0,60,120],{future:{times:new Float64Array([180000,300000]),offsets:new Float64Array([1,3])}}),result=seasonalityIntradayBoxes([box(120000,300000)],c);expect(result[0].left).toBe(2);expect(result[0].right).toBe(5);
});
it('interpolates future logical ordinals across an actual weekend and DST gap',()=>{
 const c=grid([sec('2024-03-08T19:30Z'),sec('2024-03-08T20:30Z')],{future:{times:new Float64Array([ms('2024-03-11T13:30Z'),ms('2024-03-11T19:30Z')]),offsets:new Float64Array([1,7])}});
 const result=seasonalityIntradayBoxes([box(ms('2024-03-08T20:30Z'),ms('2024-03-10T07:00Z'))],c);expect(result[0].right).toBe(1+69/130);
});
it('maps the future calendar month boundary inside a qualified time bracket',()=>{
 const c=grid([sec('2024-03-28T18:30Z'),sec('2024-03-28T19:30Z')],{future:{times:new Float64Array([ms('2024-04-01T13:30Z')]),offsets:new Float64Array([1])}});
 const result=seasonalityIntradayBoxes([box(ms('2024-03-28T19:30Z'),ms('2024-04-01T04:00Z'))],c);expect(result[0].right).toBe(1+161/180);
});
it('refuses any future endpoint without the authored pairs',()=>{expect(()=>seasonalityIntradayBoxes([box(0,180000)],grid())).toThrow('unavailable');});
it('refuses beyond the final qualified future anchor rather than continuing cadence',()=>{expect(()=>seasonalityIntradayBoxes([box(0,180001)],grid([0,60],{future:{times:new Float64Array([180000]),offsets:new Float64Array([2])}}))).toThrow('unavailable');});
it('preserves every producer scalar field and optional absence without mutating accepted inputs',()=>{
 const original=box();delete original.text;Object.freeze(original);const input=Object.freeze([original]),result=seasonalityIntradayBoxes(input,grid());expect(result).not.toBe(input);expect(result[0]).not.toBe(original);for(const key of Object.keys(original).filter(key=>!['left','right','xloc'].includes(key)))expect(Object.is((result[0] as any)[key],(original as any)[key])).toBe(true);expect(Object.hasOwn(result[0],'text')).toBe(false);expect(original.xloc).toBe('bar_time');expect(original.right).toBe(90000);
});
it('preserves the original native signed-zero first-time boundary and price scalars',()=>{
 const b=box(-0,60000);b.top=0;b.bottom=-0;const result=seasonalityIntradayBoxes([b],grid());expect(Object.is(result[0].left,-0)).toBe(true);expect(Object.is(result[0].top,0)).toBe(true);expect(Object.is(result[0].bottom,-0)).toBe(true);
});
it('returns the native positive zero for a singleton loaded grid',()=>{
 const result=seasonalityIntradayBoxes([box(-0,60000)],grid([0],{future:{times:new Float64Array([60000]),offsets:new Float64Array([1])}}));expect(Object.is(result[0].left,0)).toBe(true);expect(result[0].right).toBe(1);
});
it('refuses nonfinite prices and unsupported native xloc/extension as a whole',()=>{
 for(const patch of [{top:Infinity},{xloc:'bar_index'},{extend:'right'}])expect(()=>seasonalityIntradayBoxes([Object.assign(box(),patch) as DrawingBox],grid())).toThrow('unavailable');
});
it('rejects accessor scalar fields without invoking the getter',()=>{
 let calls=0;const b=box();Object.defineProperty(b,'top',{enumerable:true,get(){calls++;return 28.125;}});expect(()=>seasonalityIntradayBoxes([b],grid())).toThrow('unavailable');expect(calls).toBe(0);
});
it('bounds rows/boxes/future anchors and reports only its additional candidate cost',()=>{
 expect(seasonalityIntradayBoxCost(168)).toEqual({operations:720896,numericSlots:6400});expect(()=>seasonalityIntradayBoxCost(169)).toThrow();expect(()=>seasonalityIntradayBoxes(Array.from({length:169},()=>box()),grid())).toThrow();expect(()=>seasonalityIntradayBoxes([box()],grid(Array(100001).fill(0)))).toThrow();expect(()=>seasonalityIntradayBoxes([box()],grid([0,60],{future:{times:new Float64Array(374),offsets:new Float64Array(374)}}))).toThrow();
});
it('uses bounded endpoint probes instead of scanning the whole supplied M history',()=>{
 const values=Object.freeze(Array.from({length:100000},(_,i)=>i)),reads:string[]=[];const observed=new Proxy(values,{getOwnPropertyDescriptor(target,key){reads.push(String(key));return Reflect.getOwnPropertyDescriptor(target,key);}});
 const result=seasonalityIntradayBoxes([box(0,99999000)],{loadedTimes:observed,firstObservedTime:0,firstLoadedTime:0,prefixBars:0,future:null});expect(result[0].right).toBe(99999);expect(reads.length).toBeLessThan(64);
});
it('refuses an unsafe coordinate span and foreign future brands without consulting proxy properties',()=>{
 expect(()=>seasonalityIntradayBoxes([box(-9007199254740000,0)],grid([-9007199254740,9007199254740]))).toThrow('unavailable');
 let traps=0;const foreign=new Proxy(new Float64Array([180000]),{get(){traps++;throw Error('foreign typed-array property');}});
 expect(()=>seasonalityIntradayBoxes([box(0,180000)],grid([0,60],{future:{times:foreign,offsets:new Float64Array([2])}}))).toThrow('unavailable');expect(traps).toBe(0);
});
it('agrees with the original pinned SDK loaded-time function on unequal native grids',()=>{
 const source=readFileSync(resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js'),'utf8'),first=source.indexOf('function barTimeToLogical('),last=source.indexOf('\n}',first)+2;expect(first).toBeGreaterThan(0);const native=Function(source.slice(first,last)+';return barTimeToLogical;')() as (ms:number,times:number[],interval:number)=>number;
 const times=[0,60,180,600,720],nativeTimes=times.map(value=>value*1000);for(const right of [30000,60000,120000,180000,390000,600000,690000,720000])expect(Object.is(seasonalityIntradayBoxes([box(0,right)],grid(times))[0].right,native(right,nativeTimes,60000))).toBe(true);
});
