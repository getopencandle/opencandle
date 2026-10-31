import {describe,expect,it} from 'vitest';
import {getDrawingType} from '@luxalgo/vela';
import {fitRegressionAlert} from '../../src/chart/regression-alert-fit';
import {prepareDrawingAlertGrid,validateDrawingBoundarySnapshot} from '../../src/chart/drawing-alert-geometry';
import {drawingAlertKey,evaluateDrawingAlertShape,validateDrawingAlertShape} from '../../src/chart/drawing-alert-shapes';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {Bar,BarDataset} from '../../src/domain/types';

// SYNTHETIC independent oracle: closes [10,14,12], x=[0,1,2], mean12, slope1, fitted [11,12,13].
// Residuals [-1,2,-1] have population variance2, so the renderer's two-SD half-width is 2*sqrt(2).
const T=1767225600,D=86400,W=2*Math.sqrt(2);
const data=(closes=[10,14,12],times=closes.map((_,i)=>T+i*D)):BarDataset=>({...fixtureDataset('GME',closes.length),bars:closes.map((close,i)=>({time:times[i],open:close,high:close+1,low:close-1,close,volume:1}))});
const drawing=(from=T,to=T+2*D)=>({id:'synthetic-regression',type:'regressionchannel',paneId:'price',anchors:[{time:from*1000,price:123},{time:to*1000,price:456}]});
function capture(dataset:BarDataset,record=drawing(),style='candles',scale='linear'){
 const grid=prepareDrawingAlertGrid(dataset.bars,{source:sourceContextForDataset(dataset),style,scale:scale as never});
 if(!grid.ok)throw new Error(grid.diagnostics.join(' '));return grid.grid.captureShape(record);
}
function snapshot(dataset=data(),record=drawing(),style='candles',scale='linear'){
 const captured=capture(dataset,record,style,scale);if(!captured.ok)throw new Error(captured.diagnostics.join(' '));return captured.snapshot;
}
describe(' Regression trend: original numerical capture against synthetic observations',()=>{
 it('fits the hand-computed slope, endpoints and two population residual deviations',()=>{
  const fit=fitRegressionAlert(data().bars,T,T+2*D);
  expect(fit).toEqual({firstIndex:0,lastIndex:2,firstTime:T,lastTime:T+2*D,count:3,startCenter:11,endCenter:13,halfWidth:W,slope:1});
  const shape=snapshot();expect(shape.tool).toBe('regressionchannel');expect(shape.shape).toBe('channel');
  expect(shape.anchors).toEqual([{time:T,price:11,logical:0},{time:T+2*D,price:13,logical:2}]);
  expect(evaluateDrawingAlertShape(shape,2)).toEqual({ok:true,shape:'channel',lower:13-W,upper:13+W});
 });
 it('uses ordinal bar coordinates through overnight/weekend gaps, not elapsed-time regression',()=>{
  const dataset=data([10,14,12],[T,T+60,T+7*D]),shape=snapshot(dataset,drawing(T,T+7*D));
  expect(shape.anchors.map(row=>row.logical)).toEqual([0,2]);
  expect(evaluateDrawingAlertShape(shape,2)).toEqual({ok:true,shape:'channel',lower:13-W,upper:13+W});
  expect(shape.lines[0].from.logical).toBe(0);expect(shape.lines[0].to!.logical).toBe(2);
 });
 it('uses only the selected fitting window and preserves its global bar positions',()=>{
  const dataset=data([99,10,14,12,99]),shape=snapshot(dataset,drawing(T+D,T+3*D));
  expect(shape.anchors.map(row=>[row.logical,row.price])).toEqual([[1,11],[3,13]]);
  expect(evaluateDrawingAlertShape(shape,3)).toEqual({ok:true,shape:'channel',lower:13-W,upper:13+W});
  expect(evaluateDrawingAlertShape(shape,4).ok).toBe(false);// the renderer paints a finite segment
 });
 it('a future right anchor fits available observed rows and records the real final fitting time',()=>{
  const shape=snapshot(data(),drawing(T,T+10*D));
  expect(shape.capturedRows).toBe(3);expect(shape.anchors[1]).toEqual({time:T+2*D,price:13,logical:2});
  expect(shape.lines[0].max).toBe(2);expect(shape.drawingKey).toContain(String((T+10*D)*1000));
  const grown=snapshot(data([10,14,12,15]),drawing(T,T+10*D));
  expect(grown.anchors[1].time).toBe(T+3*D);expect(grown.anchors[1].price).toBeCloseTo(14.7,12);
  expect(grown.lines[1].to!.price-grown.anchors[1].price).toBeCloseTo(Math.sqrt(6.3),12);
 });
 it('captures Close in price space on a log scale and refuses nonpositive fitted bands',()=>{
  const shape=snapshot(data(),drawing(),'candles','logarithmic');expect(shape.coordinateModel).toBe('logical-bar-log-price');
  expect(evaluateDrawingAlertShape(shape,2)).toEqual({ok:true,shape:'channel',lower:13-W,upper:13+W});
  const refused=capture(data([1,10,1]),drawing(),'candles','logarithmic');expect(refused.ok).toBe(false);
  if(!refused.ok)expect(refused.diagnostics.join(' ')).toMatch(/positive fitted bands/);
 });
 it('fits the Heikin Ashi calculation closes, with a hand-computed OHLC average distinct from standard Close',()=>{
  const dataset=data();dataset.bars=[
   {time:T,open:8,high:14,low:6,close:12,volume:1},// HA close10
   {time:T+D,open:12,high:18,low:10,close:16,volume:1},// HA close14
   {time:T+2*D,open:10,high:16,low:8,close:14,volume:1},// HA close12
  ];
  const shape=snapshot(dataset,drawing(),'heikinashi');expect(shape.transform).toBe('heikinashi');
  expect(shape.anchors.map(row=>row.price)).toEqual([11,13]);
  expect(snapshot(dataset).anchors.map(row=>row.price)).toEqual([13,15]);
 });
 it('ignores unused vertical anchor prices and cosmetic styles but changes key when the fitting window moves',()=>{
  const original=drawing(),base=drawingAlertKey(original);
  expect(drawingAlertKey({...original,anchors:original.anchors.map(row=>({...row,price:-999})),props:{upperColor:'#000'},locked:true})).toBe(base);
  expect(drawingAlertKey({...original,anchors:[...original.anchors].reverse()})).toBe(base);
  expect(drawingAlertKey(drawing(T+D,T+3*D))).not.toBe(base);
 });
 it('a frozen fit cannot be evaluated on an earlier fitting row or extrapolated beyond its painted segment',()=>{
  const shape=snapshot();expect(evaluateDrawingAlertShape(shape,1).ok).toBe(false);expect(evaluateDrawingAlertShape(shape,3).ok).toBe(false);
  const early=evaluateDrawingAlertShape(shape,1);if(!early.ok)expect(early.diagnostics.join(' ')).toMatch(/precedes the final bar/);
 });
 it('zero residual width and missing earlier fitting history refuse instead of inventing a channel',()=>{
  const flat=capture(data([10,11,12]));expect(flat.ok).toBe(false);if(!flat.ok)expect(flat.diagnostics.join(' ')).toMatch(/no residual channel height/);
  const partial=capture(data(),drawing(T-D,T+2*D));expect(partial.ok).toBe(false);if(!partial.ok)expect(partial.diagnostics.join(' ')).toMatch(/Earlier fitting history/);
 });
 it('preserves the exact version2 field set and validates a JSON round trip',()=>{
  const shape=snapshot();expect(Object.keys(shape).sort()).toEqual(['schemaVersion','drawingId','tool','shape','name','paneId','coordinateModel','sourceBasis','sourceRevision','transform','gridOrigin','capturedRows','anchors','lines','lineTime','drawingKey','geometryFingerprint'].sort());
  expect(validateDrawingAlertShape(JSON.parse(JSON.stringify(shape)))).toEqual(shape);
  expect(validateDrawingBoundarySnapshot(JSON.parse(JSON.stringify(shape)))).toEqual(shape);
 });
 it('rejects oversized, unordered, nonfinite and overflowing observations before a snapshot exists',()=>{
  expect(()=>fitRegressionAlert(new Array(100001),T,T+D)).toThrow(/100000/);
  expect(()=>fitRegressionAlert([...data().bars].reverse(),T,T+2*D)).toThrow(/increasing/);
  expect(()=>fitRegressionAlert(data([10,NaN,12]).bars,T,T+2*D)).toThrow(/finite/);
  expect(()=>fitRegressionAlert(data([1e308,1.5e308,1.2e308]).bars,T,T+2*D)).toThrow(/not representable/);
 });
 it('independently agrees with the pinned native drawing on a finite synthetic fit',()=>{
  const dataset=data([10,14,12,15]),record=drawing(T,T+3*D),native=getDrawingType('regressionchannel')!.create(record as never) as any;
  const rows=dataset.bars.map(row=>({...row,time:row.time*1000}));
  const rendered=native.fit({barsInRange:(from:number,to:number)=>rows.filter(row=>row.time>=from&&row.time<=to)});
  const shape=snapshot(dataset,record),last=shape.lines[0].to!;
  expect(rendered.mid0).toBeCloseTo(shape.anchors[0].price,12);expect(rendered.mid1).toBeCloseTo(shape.anchors[1].price,12);
  expect(rendered.mid1-rendered.dev).toBeCloseTo(last.price,12);expect(rendered.mid1+rendered.dev).toBeCloseTo(shape.lines[1].to!.price,12);
 });
});
