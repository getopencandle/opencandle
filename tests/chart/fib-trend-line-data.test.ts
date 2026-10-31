import {expect,it} from 'vitest';
import {FIB_TREND_LINE_FIELD as field,assertFibTrendLinePatchValues,cloneFibTrendLineMember,readFibTrendLine,retainFibTrendLineMember,sameFibTrendLineInterpretation,validateFibTrendLineSettings,withFibTrendLineDraftColor} from '../../src/chart/fib-trend-line-data';
const defaults=Object.freeze({schemaVersion:1 as const,enabled:false,color:'#123456',width:2,style:'solid' as const});
it('distinguishes absent, supported, and unknown semantic presence without getters',()=>{
 expect(readFibTrendLine(undefined,defaults)).toEqual({state:'legacy',settings:defaults});expect(readFibTrendLine({[field]:defaults},defaults)).toEqual({state:'supported',settings:defaults});
 for(const value of [undefined,null,{}, {...defaults,future:undefined},{...defaults,schemaVersion:2}])expect(readFibTrendLine({[field]:value},defaults).state).toBe('unavailable');
 let reads=0;expect(readFibTrendLine({get [field](){reads++;return defaults;}},defaults).state).toBe('unavailable');expect(reads).toBe(0);
 expect(sameFibTrendLineInterpretation(undefined,{[field]:defaults},defaults)).toBe(true);expect(sameFibTrendLineInterpretation({[field]:{...defaults,future:undefined}},{[field]:defaults},defaults)).toBe(false);
});
it('retains the exact opaque whole member after transport, without normalizing other data',()=>{
 const value={...defaults,future:{empty:undefined,zero:-0}},raw={id:'SYNTHETIC',type:'fibretracement',props:{[field]:value,other:undefined}},prepared=JSON.parse(JSON.stringify(raw)),next=retainFibTrendLineMember(raw,prepared);
 expect(next.props[field]).toStrictEqual(value);expect(Object.is(next.props[field].future.zero,-0)).toBe(true);expect(Object.hasOwn(next.props,'other')).toBe(false);expect(next.props[field]).not.toBe(value);
 expect(retainFibTrendLineMember({...raw,props:{[field]:undefined}},prepared).props[field]).toBeUndefined();expect(()=>retainFibTrendLineMember(raw,{...prepared,id:'foreign'})).toThrow();
 let reads=0;expect(()=>cloneFibTrendLineMember({get future(){reads++;return 1;}})).toThrow();expect(reads).toBe(0);
});
it.each([undefined,null,0,11,1.5,'2'])('rejects invalid raw width %s before detachment',(width)=>{expect(()=>assertFibTrendLinePatchValues({'lvFibTrendLine.width':width})).toThrow();});
it('validates every raw path and closed setting while preserving no-op draft omission',()=>{
 expect(()=>assertFibTrendLinePatchValues({lvFibTrendLine:defaults})).toThrow();expect(()=>assertFibTrendLinePatchValues({'lvFibTrendLine.future':1})).toThrow();expect(()=>validateFibTrendLineSettings({...defaults,color:'url(hostile)'})).toThrow();
 const values={unrelated:12};expect(withFibTrendLineDraftColor({state:'legacy',settings:defaults},values,defaults.color)).toBe(values);expect(withFibTrendLineDraftColor({state:'legacy',settings:defaults},values,'#abcdef')).toEqual({...values,'lvFibTrendLine.color':'#abcdef'});expect(()=>withFibTrendLineDraftColor({state:'unavailable',message:'unknown'},values,'#abcdef')).toThrow();
});
