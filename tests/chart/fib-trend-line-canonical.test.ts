import {createDrawing,deserializeDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {expect,it} from 'vitest';
import {drawingEditor,patchDrawingProperties} from '../../src/chart/drawing-port';
import {assertNativeDrawingMatchesCanonical,projectNativeDrawingRecord} from '../../src/chart/drawing-canonical';
import {resolvePortableDrawingDocument} from '../../src/chart/drawing-document-bindings';
import {nativeFibTrendLineDefaults} from '../../src/chart/fib-level-format-native';

const key='lvFibTrendLine',bars=[1000,1060,1120].map(time=>({time,open:100,high:200,low:90,close:150,volume:10}));
function row(value?:unknown,explicit=false):SerializedDrawing{
 const result=createDrawing('fibretracement',{id:'SYNTHETIC baseline integration',paneId:'price',createdAt:1,anchors:[{time:1000000,price:100},{time:1120000,price:200}]})!.serialize();
 delete result.props![key];if(explicit)result.props![key]=value;return result;
}
const defaults=()=>nativeFibTrendLineDefaults();
const inventory={panes:[{paneId:'price',logicalPaneId:'price',owners:[],replaceable:false}],occupiedIds:['price']};

it('exposes the effective legacy baseline without adding canonical saved state',()=>{
 const original=row(),editor=drawingEditor(original,bars) as ReturnType<typeof drawingEditor>&{fibTrendLine?:unknown};
 expect(editor.fibTrendLine).toStrictEqual({state:'legacy',settings:defaults()});
 expect(Object.hasOwn(original.props!,key)).toBe(false);
});

it('keeps an absent baseline absent through an unrelated level edit',()=>{
 const original=row(),next=patchDrawingProperties(original,{'levels.0.color':'#123456'});
 expect(Object.hasOwn(next.props!,key)).toBe(false);
 expect(next.anchors).toStrictEqual(original.anchors);
 expect(patchDrawingProperties(original,{[key+'.color']:defaults().color})).toBe(original);
});

it('materializes only a changed baseline color with all other effective settings intact',()=>{
 const original=row(),next=patchDrawingProperties(original,{[key+'.color']:'rgba(15,30,45,0.25)'});
 expect(next.props![key]).toStrictEqual({...defaults(),color:'rgba(15,30,45,0.25)'});
 expect(next.props!.levels).toStrictEqual(original.props!.levels);
 expect(next.anchors).toStrictEqual(original.anchors);
});

it.each([undefined,{schemaVersion:1,enabled:true,color:'#123456',width:2,style:'solid',future:undefined}])('retains unknown %j during unrelated editing and portable import',value=>{
 const original=row(value,true),next=patchDrawingProperties(original,{'levels.0.color':'#abcdef'});
 expect(Object.hasOwn(next.props!,key)).toBe(true);expect(next.props![key]).toStrictEqual(value);
 const resolved=resolvePortableDrawingDocument({version:1,drawings:[original]},inventory,new Set(['fibretracement']));
 const native=(resolved.nativeDocument.drawings as SerializedDrawing[])[0];
 expect(Object.hasOwn(native.props!,key)).toBe(true);expect(native.props![key]).toStrictEqual(value);
 expect(resolved.unavailableIds).toEqual([]);
 expect(resolved.diagnostics.some(item=>item.code==='FIB_TREND_LINE_UNAVAILABLE')).toBe(true);
 const editor=drawingEditor(original,bars) as ReturnType<typeof drawingEditor>&{fibTrendLine?:{state:string};fibTrendLineDiagnostic?:string};
 expect(editor.fibTrendLine?.state).toBe('unavailable');expect(editor.fibTrendLineDiagnostic).toMatch(/retained/i);
});

it('rejects JSON-equivalent unknown-to-known native interpretation',()=>{
 const unknown=row({...defaults(),enabled:true,future:undefined},true);
 const normalized=JSON.parse(JSON.stringify(unknown)) as SerializedDrawing;
 expect(JSON.stringify(normalized)).toBe(JSON.stringify(unknown));
 expect(()=>assertNativeDrawingMatchesCanonical(unknown,normalized)).toThrow();
 expect(()=>assertNativeDrawingMatchesCanonical(unknown,deserializeDrawing(unknown)!.serialize())).not.toThrow();
});

it('preserves the exact unsupported object during a native default update',()=>{
 const value={...defaults(),enabled:true,future:{unset:undefined,negativeZero:-0}},original=row(value,true);
 const native=deserializeDrawing(original)!.serialize();native.props![key]={...defaults()};
 const next=projectNativeDrawingRecord(original as any,native as any) as unknown as SerializedDrawing;
 expect(next.props![key]).toStrictEqual(value);
 expect(Object.is((next.props![key] as any).future.negativeZero,-0)).toBe(true);
});

it('rejects explicit undefined baseline paths before a valid sibling edit',()=>{
 const original=row(),before=structuredClone(original);
 for(const field of ['enabled','color','width','style'])expect(()=>patchDrawingProperties(original,{[key+'.'+field]:undefined,'levels.0.color':'#abcdef'})).toThrow();
 expect(original).toStrictEqual(before);
});
