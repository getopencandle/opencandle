import {createDrawing,deserializeDrawing} from '@luxalgo/vela';
import {expect,it} from 'vitest';
import {nativeFibTrendLineDefaults} from '../../src/chart/fib-level-format-native';
import {assertFibTrendLinePatchValues,cloneFibTrendLineMember,readFibTrendLine,retainFibTrendLineMember,FIB_TREND_LINE_FIELD as field} from '../../src/chart/fib-trend-line-data';

const defaults=()=>nativeFibTrendLineDefaults();
function native(value:unknown={...defaults(),enabled:true}){
 return createDrawing('fibretracement',{id:'SYNTHETIC independent baseline model',paneId:'price',createdAt:1,
  anchors:[{time:1000,price:100},{time:2000,price:200}],
  props:{[field]:value,reverse:false,showRatios:true,showPrices:true,levels:[{ratio:.25,color:'#123456',enabled:true},{ratio:.75,color:'#abcdef',enabled:true}]}})!;
}
const composite=()=>({schemaVersion:2,enabled:true,future:{omitted:undefined,zero:-0,rows:[{value:undefined,zero:-0},null,'SYNTHETIC opaque']}});

it('retains a composite unknown baseline through native defaults, partial updates and unrelated edits',()=>{
 const value=composite(),drawing=native(value),before=drawing.serialize();
 drawing.applyProps({[field]:{...defaults()},reverse:false});drawing.applyProps({showPrices:false});drawing.applySettings({'levels.0.color':'#ffffff'});
 const after=drawing.serialize(),saved=after.props![field] as ReturnType<typeof composite>;
 expect(saved).toStrictEqual(value);expect(Object.hasOwn(saved.future,'omitted')).toBe(true);expect(Object.is(saved.future.zero,-0)).toBe(true);
 expect(Object.hasOwn(saved.future.rows[0] as object,'value')).toBe(true);expect(Object.is((saved.future.rows[0] as {zero:number}).zero,-0)).toBe(true);
 expect(after.anchors).toStrictEqual(before.anchors);expect(after.props!.showPrices).toBe(false);
 expect(drawing.schema().fields.some(row=>row.path.startsWith(field+'.'))).toBe(false);
 const edited=drawing.serialize();expect(()=>drawing.applySettings({[field+'.enabled']:true,'levels.0.color':'#112233'})).toThrow();expect(drawing.serialize()).toStrictEqual(edited);
});

it('preserves detached unknown semantic member data through JSON projection repair and native clone',()=>{
 const value=composite(),raw={type:'fibretracement',id:'SYNTHETIC projection',props:{[field]:value,unrelated:undefined}},prepared=JSON.parse(JSON.stringify(raw));
 const repaired=retainFibTrendLineMember(raw,prepared),member=repaired.props[field] as ReturnType<typeof composite>;
 expect(member).toStrictEqual(value);expect(member).not.toBe(value);expect(member.future).not.toBe(value.future);expect(member.future.rows).not.toBe(value.future.rows);
 expect(Object.hasOwn(member.future,'omitted')).toBe(true);expect(Object.is(member.future.zero,-0)).toBe(true);expect(Object.hasOwn(repaired.props,'unrelated')).toBe(false);
 const drawing=native(member),copy=deserializeDrawing(drawing.serialize())!,copyValue=copy.serialize().props![field] as ReturnType<typeof composite>;
 expect(copyValue).toStrictEqual(value);copyValue.future.rows.push('SYNTHETIC external change');expect(drawing.serialize().props![field]).toStrictEqual(value);expect(copy.serialize().props![field]).toStrictEqual(value);
});

it('does not execute raw member, width or nested opaque getters while rejecting them',()=>{
 let reads=0;
 const props=Object.defineProperty({},field,{enumerable:true,get(){reads++;return defaults();}});
 expect(readFibTrendLine(props,defaults()).state).toBe('unavailable');
 const patch=Object.defineProperty({},field+'.width',{enumerable:true,get(){reads++;return 5;}});
 expect(()=>assertFibTrendLinePatchValues(patch)).toThrow();
 expect(()=>cloneFibTrendLineMember({future:{get value(){reads++;return 1;}}})).toThrow();expect(reads).toBe(0);
});

it('replaces a known native baseline atomically without sharing the previous record or frozen defaults',()=>{
 const drawing=native(),old=(drawing as unknown as Record<string,unknown>)[field] as Record<string,unknown>,before=drawing.serialize();
 drawing.applySettings({[field+'.color']:'rgba(20,40,60,0.25)',[field+'.width']:5,[field+'.style']:'dotted'});
 const current=(drawing as unknown as Record<string,unknown>)[field];expect(current).not.toBe(old);expect(current).not.toBe(defaults());
 expect(drawing.serialize().props![field]).toEqual({...defaults(),enabled:true,color:'rgba(20,40,60,0.25)',width:5,style:'dotted'});
 old.color='#ffffff';expect((drawing.serialize().props![field] as Record<string,unknown>).color).toBe('rgba(20,40,60,0.25)');expect(defaults().enabled).toBe(false);
 expect(drawing.serialize().anchors).toStrictEqual(before.anchors);expect(drawing.serialize().props!.levels).toStrictEqual(before.props!.levels);
 const accepted=drawing.serialize();expect(()=>drawing.applySettings({[field+'.width']:11,'levels.0.color':'#000000'})).toThrow();expect(drawing.serialize()).toStrictEqual(accepted);
});

it('uses literal native level semantics and anchor union for reversed, exterior and empty ranges',()=>{
 const drawing=native();expect(drawing.priceRange()).toStrictEqual({min:100,max:200});
 drawing.applyProps({levels:[{ratio:-.5,color:'#123456',enabled:true},{ratio:2,color:'#abcdef',enabled:true}],reverse:false});
 expect(drawing.priceRange()).toStrictEqual({min:0,max:250});
 drawing.applyProps({reverse:true});expect(drawing.priceRange()).toStrictEqual({min:50,max:300});
 drawing.applySettings({'levels.0.enabled':false,'levels.1.enabled':false});expect(drawing.priceRange()).toStrictEqual({min:100,max:200});
 drawing.applySettings({[field+'.enabled']:false});expect(drawing.priceRange()).toBeNull();
});

it('refuses an accessor-backed enabled model geometry without executing it',()=>{
 const drawing=native();let reads=0;
 const descriptor=Object.getOwnPropertyDescriptor(drawing,'anchors')!;
 try{Object.defineProperty(drawing,'anchors',{configurable:true,enumerable:true,get(){reads++;return descriptor.value;}});expect(()=>drawing.priceRange()).toThrow(/data field|geometry/i);expect(reads).toBe(0);}
 finally{Object.defineProperty(drawing,'anchors',descriptor);}
});
