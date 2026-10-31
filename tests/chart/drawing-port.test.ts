import { it,expect } from 'vitest';
import { createDrawing } from '@luxalgo/vela';
import { barNumberToTime,timeToBarNumber,patchDrawingCoordinates,patchDrawingProperties,drawingEditor,patchDrawingEdit,drawingDraftChanges,drawingFieldApplicable,assertDrawingRecordUnchanged } from '../../src/chart/drawing-port';
const bars=[0,60,180,240].map(time=>({time:1700000000+time,open:100,high:110,low:90,close:105,volume:10}));
it('logical bar coordinates roundtrip across irregular market-time spacing',()=>{
  for(const number of [-1,0,0.5,1,1.5,2,3,4])expect(timeToBarNumber(bars,barNumberToTime(bars,number))).toBeCloseTo(number,12);
  expect(barNumberToTime(bars,1.5)).toBe(1700000120);
});
it('same-source concurrent drawing edits reject a stale draft before deliberate fields can overwrite another edit',()=>{
 const original=createDrawing('trendline',{id:'same-source',paneId:'price',anchors:[{time:1000,price:100},{time:2000,price:110}]})!.serialize(),baseline=JSON.stringify(original),concurrent=patchDrawingProperties(original,{'style.lineColor':'#12ab34'}),before=structuredClone(concurrent);
 expect(()=>{assertDrawingRecordUnchanged(baseline,JSON.stringify(concurrent));patchDrawingEdit(concurrent,bars,{'style.lineColor':'#ab1234'});}).toThrow('changed while settings');expect(concurrent).toEqual(before);expect(()=>assertDrawingRecordUnchanged(baseline,JSON.stringify(structuredClone(original)))).not.toThrow();
});
it('malformed drawing and level colors reject atomically while alpha is retained',()=>{
 const record=createDrawing('fibretracement',{paneId:'price',anchors:[{time:1,price:100},{time:2,price:110}]})!.serialize(),before=structuredClone(record);
 for(const value of ['rgba(1)','rgb(,)','invalid-color','#12345','rgba(1,2,3,2)'])expect(()=>patchDrawingProperties(record,{'levels.0.color':value})).toThrow('color');
 expect(patchDrawingProperties(record,{'levels.0.color':'#12345678'}).props).toEqual(expect.objectContaining({levels:expect.any(Array)}));expect(record).toEqual(before);
 const trend=createDrawing('trendline',{paneId:'price'})!.serialize();expect(()=>patchDrawingProperties(trend,{'style.lineColor':'rgba(1)'})).toThrow('color');
});
it('position property and coordinate drafts preserve their distinct deliberate edits',()=>{
 const record=createDrawing('position',{paneId:'price',anchors:[{time:bars[0].time*1000,price:100},{time:bars[2].time*1000,price:90},{time:bars[2].time*1000,price:120}]})!.serialize(),editor=drawingEditor(record,bars);
 const property=drawingDraftChanges(editor,{...editor.values,entryPrice:105},editor.anchors);expect(property.properties).toEqual({entryPrice:105});expect(property.coordinates).toBeUndefined();expect(patchDrawingEdit(record,bars,property.properties,property.coordinates).anchors[0].price).toBe(105);
 const coordinate=drawingDraftChanges(editor,editor.values,editor.anchors.map((anchor,index)=>index===0?{...anchor,price:105}:anchor));expect(coordinate.properties).toEqual({});expect(patchDrawingEdit(record,bars,{},coordinate.coordinates).anchors[0].price).toBe(105);
 expect(patchDrawingEdit(record,bars,{direction:'short'},drawingDraftChanges(editor,editor.values,editor.anchors).coordinates).anchors.map(anchor=>anchor.price)).toEqual([100,110,80]);
 expect(()=>patchDrawingEdit(record,bars,{entryPrice:105},[{price:106},{},{}])).toThrow('not both');
});
it('channel endpoint translation preserves its relative price offset and rejects third coordinate substitution',()=>{
 const record=createDrawing('parallelchannel',{paneId:'price',anchors:[{time:bars[0].time*1000,price:100},{time:bars[2].time*1000,price:120},{time:bars[0].time*1000,price:105}]})!.serialize();
 expect(patchDrawingCoordinates(record,bars,[{barNumber:1,price:110},{},{}]).anchors[2]).toEqual({time:bars[0].time*1000,price:110});expect(()=>patchDrawingCoordinates(record,bars,[{},{},{price:999}])).toThrow('price offset');
});
it('SDK arc midpoint and position crossing invariants use actual post-placement anchors',()=>{
 const arc=createDrawing('arc',{paneId:'price',anchors:[{time:1000,price:10},{time:3000,price:20},{time:2000,price:30}]})!.serialize();expect(patchDrawingCoordinates(arc,bars,[{timeSeconds:5},{},{}]).anchors[2].time).toBe(4000);
 const position=createDrawing('position',{paneId:'price',anchors:[{time:1000,price:100},{time:3000,price:90},{time:3000,price:120}]})!.serialize();expect(patchDrawingCoordinates(position,bars,[{},{price:110},{}]).anchors.map(anchor=>anchor.price)).toEqual([100,110,80]);expect(patchDrawingCoordinates(position,bars,[{},{price:110},{price:120}]).anchors.map(anchor=>anchor.price)).toEqual([100,110,80]);expect(()=>patchDrawingCoordinates(position,bars,[{},{price:110},{price:130}])).toThrow('opposite sides');
});
it('conditional fields follow their controlling setting and blank level ratios reject before mutation',()=>{
 const drawing=createDrawing('fairvaluegap',{paneId:'price'})!,field=drawing.schema().fields.find(field=>field.path==='gap.inverse')!;expect(drawingFieldApplicable(field,{'gap.extend':'tested'})).toBe(false);expect(drawingFieldApplicable(field,{'gap.extend':'filled'})).toBe(true);
 const fib=createDrawing('fibretracement',{paneId:'price'})!.serialize();expect(()=>patchDrawingProperties(fib,{'levels.0.ratio':NaN})).toThrow('finite');
});
it('coordinate overflow fails before committing an unrepresentable timestamp',()=>{
 const record=createDrawing('trendline',{paneId:'price',anchors:[{time:1000,price:100},{time:2000,price:110}]})!.serialize(),before=structuredClone(record);expect(()=>patchDrawingCoordinates(record,bars,[{timeSeconds:Number.MAX_VALUE},{}])).toThrow('representable');expect(record).toEqual(before);
});
it('oversized level labels and settings-derived position overflow reject atomically',()=>{
 const fib=createDrawing('fibretracement',{paneId:'price'})!.serialize();expect(()=>patchDrawingProperties(fib,{'levels.0.label':'x'.repeat(20001)})).toThrow('20000');
 const record=createDrawing('position',{paneId:'price',anchors:[{time:1000,price:Number.MAX_VALUE},{time:3000,price:1},{time:3000,price:Number.MAX_VALUE/2}]})!.serialize(),before=structuredClone(record);expect(()=>patchDrawingProperties(record,{direction:'long'})).toThrow('overflow');expect(record).toEqual(before);
});
it('parallel channel coordinates use price offset instead of arbitrary third anchor editing',()=>{
  const record=createDrawing('parallelchannel',{paneId:'price',anchors:[{time:bars[0].time*1000,price:100},{time:bars[2].time*1000,price:120},{time:bars[0].time*1000,price:105}]})!.serialize();
  const updated=patchDrawingCoordinates(record,bars,[{barNumber:1,price:110},{barNumber:3,price:130},{}],-7);
  expect(updated.anchors[2]).toEqual({time:bars[0].time*1000,price:113});
  expect(drawingEditor(updated,bars).priceOffset).toBe(-7);
});
it('per-tool property edits reject unsupported or invalid controls and preserve prior record',()=>{
  const record=createDrawing('trendline',{paneId:'price',anchors:[{time:1,price:100},{time:2,price:110}]})!.serialize();const original=structuredClone(record);
  expect(()=>patchDrawingProperties(record,{'style.lineWidth':-1})).toThrow();
  expect(()=>patchDrawingProperties(record,{'props.imaginary':true})).toThrow();
  const updated=patchDrawingProperties(record,{'style.arrowLeft':true,'style.lineColor':'rgba(10, 20, 30, 0.25)','text.value':'OpenCandle synthetic note','text.place':'end','locked':true});
  expect(updated.style.arrowLeft).toBe(true);expect(updated.style.lineColor).toBe('rgba(10, 20, 30, 0.25)');expect(updated.text?.place).toBe('end');expect(updated.locked).toBe(true);expect(record).toEqual(original);
  expect(patchDrawingProperties(record,drawingEditor(record,bars).values)).toEqual(record);
});
