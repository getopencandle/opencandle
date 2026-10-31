import {createDrawing,deserializeDrawing,type Drawing,type SerializedDrawing} from '@luxalgo/vela';
import {expect,it} from 'vitest';
import {drawingDraftChanges,drawingEditor,patchDrawingProperties} from '../../src/chart/drawing-port';
import {templateProperties} from '../../src/chart/drawing-manager';

const path='lvFibLevelFormat';
const bars=[1000,1060,1120].map(time=>({time,open:100,high:200,low:90,close:150,volume:10}));
type FibModel=Drawing&{levelText(ratio:number,price:number):string;showRatios:boolean;showPrices:boolean};
function row(format?:unknown,explicit=false):SerializedDrawing{
 const value=createDrawing('fibretracement',{id:'SYNTHETIC format',paneId:'price',createdAt:1,anchors:[{time:1000000,price:100},{time:1120000,price:200}]})!.serialize();
 delete value.props![path];
 if(explicit)value.props![path]=format;
 return value;
}
function model(record:SerializedDrawing):FibModel{return deserializeDrawing(record)! as FibModel;}

it.each([
 [0,'0%'],[1,'100%'],[-1,'-100%'],[.236,'23.6%'],[.382,'38.2%'],[.618,'61.8%'],[1.618,'161.8%'],[-.236,'-23.6%'],[-0,'0%'],
 [Number.MIN_VALUE,'5e-322%'],[Number.MAX_VALUE,'1.7976931348623157e+310%'],
])('formats literal ratio %s as %s without multiplying in binary floating point',(ratio,expected)=>{
 const drawing=model(row('percent',true));drawing.showPrices=false;
 expect(drawing.levelText(ratio as number,125)).toBe(expected);
});

it('keeps format independent of level visibility, price text and stored ratios',()=>{
 const drawing=model(row('percent',true)),before=structuredClone(drawing.serialize());
 expect(drawing.levelText(.618,123.456)).toBe('61.8% (123.46)');
 drawing.showRatios=false;expect(drawing.levelText(.618,123.456)).toBe('123.46');
 drawing.showPrices=false;expect(drawing.levelText(.618,123.456)).toBe('');
 drawing.showRatios=true;expect(drawing.levelText(.618,123.456)).toBe('61.8%');
 expect(drawing.serialize().anchors).toStrictEqual(before.anchors);
 expect(drawing.serialize().props!.levels).toStrictEqual(before.props!.levels);
});

it('offers a format selector and stages one property without geometry or opaque data loss',()=>{
 const original=row();(original as any).future={empty:undefined,negativeZero:-0};
 (original.props!.levels as any[])[0].future={empty:undefined,negativeZero:-0};
 const editor=drawingEditor(original,bars),field=editor.fields.find(item=>item.path===path);
 expect(field).toMatchObject({kind:'select',label:'Level format',options:[{value:'coefficient',label:'Coefficients'},{value:'percent',label:'Percent'}]});
 expect(editor.values[path]).toBe('coefficient');
 const changes=drawingDraftChanges(editor,{...editor.values,[path]:'percent'},editor.anchors);
 expect(changes).toEqual({properties:{[path]:'percent'},coordinates:undefined,priceOffset:undefined});
 const next=patchDrawingProperties(original,changes.properties);
 expect(next).toStrictEqual({...original,props:{...original.props,[path]:'percent'}});
 expect(model(next).levelText(.618,123)).toBe('61.8% (123.00)');
 expect(patchDrawingProperties(next,{[path]:'percent'})).toBe(next);
});

it('preserves legacy omission on no-op and unrelated color edits',()=>{
 const original=row();expect(patchDrawingProperties(original,{[path]:'coefficient'})).toBe(original);
 const next=patchDrawingProperties(original,{'levels.0.color':'#123456'});
 expect(Object.hasOwn(next.props!,path)).toBe(false);
 expect(model(next).levelText(.618,123)).toBe('0.618 (123.00)');
});

it.each([undefined,null,'future',{schemaVersion:2,mode:'percent'}])('retains and diagnoses unsupported explicit format %j',(format)=>{
 const original=row(format,true),editor=drawingEditor(original,bars);
 expect(editor.fields.some(item=>item.path===path)).toBe(false);
 expect((editor as unknown as {fibFormatDiagnostic?:string}).fibFormatDiagnostic).toMatch(/format.*retained|retained.*format/i);
 expect(()=>patchDrawingProperties(original,{[path]:'coefficient'})).toThrow();
 const next=patchDrawingProperties(original,{'levels.0.color':'#123456'});
 expect(Object.hasOwn(next.props!,path)).toBe(true);expect(next.props![path]).toStrictEqual(format);
 const drawing=model(original);expect(drawing.levelText(.618,123)).toBe('123.00');
 drawing.showPrices=false;expect(drawing.levelText(.618,123)).toBe('');
});

it.each([undefined,null,'Percent',1,{},[]])('refuses invalid requested format %j before any other change',(value)=>{
 const original=row(),before=structuredClone(original);
 expect(()=>patchDrawingProperties(original,{[path]:value,'levels.0.color':'#123456'})).toThrow();
 expect(original).toStrictEqual(before);
});

it('saves known format in style templates and leaves other Fib tools without this selector',()=>{
 const original=row('percent',true);expect(templateProperties(original)[path]).toBe('percent');
 for(const type of ['fibextension','fibchannel','trendline'] as const){
  const other=createDrawing(type,{paneId:'price'});if(!other)throw Error('Expected installed fixture tool '+type);
  expect(drawingEditor(other.serialize(),bars).fields.some(item=>item.path===path)).toBe(false);
 }
});
