import {describe,expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {Bar} from '../../src/domain/types';
import {prepareDrawingAlertGrid} from '../../src/chart/drawing-alert-geometry';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {fitRegressionAlert} from '../../src/chart/regression-alert-fit';
import {validateDrawingAlertShape,type DrawingAlertShapeSnapshot} from '../../src/chart/drawing-alert-shapes';
import {alertDatasetKey,validateTechnicalAlertSource,type AlertSourceSnapshot} from '../../src/domain/alert-observation';
import {evaluateTechnicalAlertSources,technicalSourceKey} from '../../src/domain/technical-alerts';
import {drawingConditionError} from '../../src/domain/drawing-alert-rules';

// NEW security coverage. Synthetic observations only; no existing security assertion is changed.
const T=1767225600,D=86400;
const dataset=()=>({...fixtureDataset('GME',3),bars:[10,14,12].map((close,i)=>({time:T+i*D,open:close,high:close+1,low:close-1,close,volume:1}))});
const drawing=(id='synthetic-regression')=>({id,type:'regressionchannel',paneId:'price',anchors:[{time:T*1000,price:1},{time:(T+10*D)*1000,price:1}]});
function prepared(data=dataset()){
 const result=prepareDrawingAlertGrid(data.bars,{source:sourceContextForDataset(data),style:'candles',scale:'linear'});
 if(!result.ok)throw new Error(result.diagnostics.join(' '));return result.grid;
}
function captured(data=dataset(),id='synthetic-regression'):Extract<AlertSourceSnapshot,{kind:'drawing-boundary'}>&{geometry:DrawingAlertShapeSnapshot}{
 const result=prepared(data).captureShape(drawing(id));if(!result.ok)throw new Error(result.diagnostics.join(' '));
 return {kind:'drawing-boundary',instanceId:id,snapshotId:'synthetic-capture',geometry:result.snapshot,mutationPolicy:'follow'};
}
describe(' regression alert prefix and saved-data boundaries',()=>{
 it('caller options cannot substitute future observations for the prepared grid prefix',()=>{
  const data=dataset(),grid=prepared(data),future=[...data.bars,{time:T+3*D,open:9999,high:9999,low:9999,close:9999,volume:1}];
  const shot=grid.captureShape(drawing(),{observedBars:future});expect(shot.ok).toBe(true);
  if(shot.ok){expect(shot.snapshot.anchors.map(row=>row.price)).toEqual([11,13]);expect(shot.snapshot.anchors[1].time).toBe(T+2*D);expect(shot.snapshot.capturedRows).toBe(3);}
 });
 it('widening the caller array after preparation never widens the observed information boundary',()=>{
  const data=dataset(),grid=prepared(data);data.bars.push({time:T+3*D,open:9999,high:9999,low:9999,close:9999,volume:1});
  const shot=grid.captureShape(drawing());expect(shot.ok).toBe(true);
  if(shot.ok){expect(shot.snapshot.capturedRows).toBe(3);expect(shot.snapshot.anchors[1].time).toBe(T+2*D);expect(shot.snapshot.anchors[1].price).toBe(13);}
 });
 it('legacy time-only rows still capture ordinary geometry without requiring regression price fields',()=>{
  const data=dataset(),timeOnly=data.bars.map(row=>({time:row.time})) as Bar[];
  const grid=prepareDrawingAlertGrid(timeOnly,{source:sourceContextForDataset(data),style:'candles',scale:'linear'});expect(grid.ok).toBe(true);
  if(grid.ok){
   const horizontal={id:'synthetic-legacy',type:'hline',paneId:'price',anchors:[{time:T*1000,price:10}]};
   expect(grid.grid.capture(horizontal).ok).toBe(true);expect(grid.grid.captureShape(horizontal).ok).toBe(true);
   expect(grid.grid.captureShape(drawing()).ok).toBe(false);
  }
  let reads=0;const guarded=dataset().bars;Object.defineProperty(guarded[1],'open',{get(){reads++;return 99;},enumerable:true});
  expect(prepareDrawingAlertGrid(guarded,{source:sourceContextForDataset(data),style:'candles',scale:'linear'}).ok).toBe(false);expect(reads).toBe(0);
 });
 it('same-time OHLC corrections after preparation cannot alter the prepared capture proof',()=>{
  for(const field of ['open','high','low','close','volume'] as const){
   const data=dataset(),grid=prepared(data);data.bars[1][field]+=99;
   const changed=grid.captureShape(drawing());expect(changed.ok).toBe(false);
   if(!changed.ok)expect(changed.diagnostics.join(' ')).toMatch(/observed prices changed/);
   // A new grid can deliberately adopt the corrected input after its caller supplies a new input proof.
   const corrected=prepared(data).captureShape(drawing());expect(corrected.ok).toBe(true);
  }
  const data=dataset(),grid=prepared(data);data.bars[1]={...data.bars[1],close:40};
  expect(grid.captureShape(drawing()).ok).toBe(false);
  const haData=dataset(),ha=prepareDrawingAlertGrid(haData.bars,{source:sourceContextForDataset(haData),style:'heikinashi',scale:'linear'});
  expect(ha.ok).toBe(true);haData.bars[1].high+=400;
  if(ha.ok)expect(ha.grid.captureShape(drawing()).ok).toBe(false);
 });
 it('a replaced observed timestamp or accessor row refuses instead of reading a new future value',()=>{
  const data=dataset(),grid=prepared(data);data.bars[2]={...data.bars[2],time:T+99*D};
  const shifted=grid.captureShape(drawing());expect(shifted.ok).toBe(false);if(!shifted.ok)expect(shifted.diagnostics.join(' ')).toMatch(/time grid changed/);
  const other=dataset(),otherGrid=prepared(other);let reads=0;Object.defineProperty(other.bars[1],'close',{get(){reads++;return 9999;},enumerable:true});
  expect(otherGrid.captureShape(drawing()).ok).toBe(false);expect(reads).toBe(0);
 });
 it('the standalone fit refuses accessor closes and sparse/accessor array rows without executing them',()=>{
  let reads=0;const bars=dataset().bars;Object.defineProperty(bars[1],'close',{get(){reads++;return 9999;},enumerable:true});
  expect(()=>fitRegressionAlert(bars,T,T+2*D)).toThrow(/finite observed/);expect(reads).toBe(0);
  const array=dataset().bars;Object.defineProperty(array,'1',{get(){reads++;return bars[1];},enumerable:true});
  expect(()=>fitRegressionAlert(array,T,T+2*D)).toThrow(/accessor/);expect(reads).toBe(0);
 });
 it('saved regression geometry refuses fabricated extension domains and fitting rows beyond captured history',()=>{
  const source=captured(),extended={...structuredClone(source.geometry),lines:[{...source.geometry.lines[0],max:null},source.geometry.lines[1]]};
  expect(()=>validateDrawingAlertShape(extended)).toThrow(/Regression trend fitted segment/);
  const future=structuredClone(source.geometry);future.anchors=[future.anchors[0],{...future.anchors[1],logical:future.capturedRows}];
  expect(()=>validateDrawingAlertShape(future)).toThrow(/Regression trend fitting endpoints/);
  expect(()=>validateDrawingAlertShape({...source.geometry,observedBars:dataset().bars})).toThrow(/Invalid drawing alert geometry/);
 });
 it('a regular/extended session source mismatch cannot borrow captured regression coefficients',async()=>{
  const regular={...dataset(),provenance:{...dataset().provenance,session:'regular' as const}},extended={...regular,provenance:{...regular.provenance,session:'extended' as const}},source=captured(regular);
  const result=await evaluateTechnicalAlertSources(extended.bars,[source],'USD',{sourceBasis:alertDatasetKey(extended,2),sourceRevision:extended.provenance.revision,drawings:[drawing()]});
  const observed=result.results.get(technicalSourceKey(source))!;expect(observed.sample.value).toBeNull();expect(observed.diagnostics.join(' ')).toMatch(/another exact source basis/);
 });
 it('a regression channel cannot bypass the existing channel-only condition and comparison rules',()=>{
  const source=captured();expect(drawingConditionError(source,{kind:'crossing-up',value:0})).toMatch(/channel alert/);
  expect(()=>validateTechnicalAlertSource({kind:'comparison',snapshotId:'synthetic-comparison',left:{kind:'price',field:'close',transformId:'standard'},right:source})).toThrow(/watches the drawing alone/);
 });
 it('the shared operation budget refuses oversized regression batches before traversing a prefix',async()=>{
  const data=dataset(),sources=[0,1,2].map(i=>captured(data,'synthetic-regression-'+i));
  await expect(evaluateTechnicalAlertSources(new Array(100000),sources,'USD',{sourceBasis:alertDatasetKey(data,2),sourceRevision:data.provenance.revision})).rejects.toThrow(/estimated operations/);
 });
});
