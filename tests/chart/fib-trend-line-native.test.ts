import {createDrawing,deserializeDrawing,getDrawingType} from '@luxalgo/vela';
import {expect,it} from 'vitest';
import {nativeFibTrendLineDefaults,assertNativeFibTrendLineModel} from '../../src/chart/fib-level-format-native';
import {FIB_TREND_LINE_FIELD as field} from '../../src/chart/fib-trend-line-data';
// the recorded facts (trendline visible true, linewidth 2, linestyle 2 = dashed, color #808080): a fresh Fib's trend line.
const FRESH_FIB_TREND_LINE={schemaVersion:1,enabled:true,color:'#808080',width:2,style:'dashed'};
function drawing(value:unknown=nativeFibTrendLineDefaults()){return createDrawing('fibretracement',{id:'SYNTHETIC baseline native',paneId:'price',createdAt:1,anchors:[{time:1000,price:100},{time:2000,price:200}],props:{[field]:value,levels:[{ratio:.236,color:'#123456',enabled:true},{ratio:.618,color:'#abcdef',enabled:true}],reverse:false}})!;}
it('constructs and serializes independent mutable native settings from frozen defaults',()=>{
 const defaults=nativeFibTrendLineDefaults(),d=drawing();expect(Object.isFrozen(defaults)).toBe(true);expect(d.serialize().props![field]).toEqual(defaults);expect(()=>assertNativeFibTrendLineModel(d)).not.toThrow();
 d.applySettings({'lvFibTrendLine.enabled':true,'lvFibTrendLine.color':'rgba(20,40,60,0.25)','lvFibTrendLine.width':5,'lvFibTrendLine.style':'dashed'});
 expect(d.serialize().props![field]).toEqual({...defaults,enabled:true,color:'rgba(20,40,60,0.25)',width:5,style:'dashed'});expect(nativeFibTrendLineDefaults()).toBe(defaults);expect(defaults.enabled).toBe(false);
 const clone=deserializeDrawing(d.serialize())!;expect(clone.serialize()).toStrictEqual(d.serialize());clone.applySettings({'lvFibTrendLine.width':1});expect((d.serialize().props![field] as any).width).toBe(5);
});
it.each([undefined,null,{schemaVersion:2},{...nativeFibTrendLineDefaults(),future:undefined}])('retains opaque initial state through partial/default reset and unrelated settings %s',(opaque)=>{
 const d=drawing(opaque);if(opaque===undefined)d.applyProps({[field]:undefined});
 const before=d.serialize().props![field];d.applyProps({[field]:{...nativeFibTrendLineDefaults()}});d.applyProps({background:false});d.applySettings({'levels.0.color':'#ffffff'});
 expect(d.serialize().props![field]).toStrictEqual(before);expect(d.schema().fields.some(row=>row.path.startsWith('lvFibTrendLine.'))).toBe(false);expect(()=>d.applySettings({'lvFibTrendLine.enabled':true})).toThrow();expect(d.serialize().props![field]).toStrictEqual(before);
});
it('resets known baseline explicitly to fresh OpenCandle defaults and preserves original levels and geometry',()=>{
 const d=drawing({...nativeFibTrendLineDefaults(),enabled:true,color:'#ffffff'}),before=d.serialize(),fresh=getDrawingType('fibretracement')!.create({paneId:'price',createdAt:0});
 d.applyProps(fresh.serialize().props!);expect(d.serialize().props![field]).toEqual(FRESH_FIB_TREND_LINE);expect(d.serialize().anchors).toStrictEqual(before.anchors);
 // the recorded facts (levels 1-11 visible, highest 4.236): the fresh levels now drive the range, level 0 at the second anchor (reverse false).
 const range=d.priceRange()!;expect(range.max).toBe(200);expect(range.min).toBeCloseTo(200-100*4.236,9);
});
it('includes anchor prices only for enabled supported baseline, including no visible levels',()=>{
 const d=drawing(),nativeRange=d.priceRange();expect(nativeRange).toEqual({min:138.2,max:176.4});d.applySettings({'lvFibTrendLine.enabled':true});expect(d.priceRange()).toEqual({min:100,max:200});
 d.applySettings({'levels.0.enabled':false,'levels.1.enabled':false});expect(d.priceRange()).toEqual({min:100,max:200});d.applySettings({'lvFibTrendLine.enabled':false});expect(d.priceRange()).toBeNull();
});
it('rejects raw invalid native baseline edits atomically before unrelated native fields',()=>{
 const d=drawing(),before=d.serialize();expect(()=>d.applySettings({'lvFibTrendLine.width':undefined,'levels.0.color':'#ffffff'})).toThrow();expect(d.serialize()).toStrictEqual(before);
});
