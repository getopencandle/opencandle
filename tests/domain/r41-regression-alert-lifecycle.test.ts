import {describe,expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {BarDataset} from '../../src/domain/types';
import {prepareDrawingAlertGrid} from '../../src/chart/drawing-alert-geometry';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {alertDatasetKey,type AlertSourceSnapshot} from '../../src/domain/alert-observation';
import {evaluateTechnicalAlertSources,technicalSourceKey,technicalAlertEstimatedWork,TECHNICAL_ALERT_LIMITS} from '../../src/domain/technical-alerts';
import {DrawingAlertFollow,DRAWING_DELETED_DIAGNOSTIC} from '../../src/domain/drawing-alert-source';
import {createLocalAlert,setLocalAlertPaused} from '../../src/domain/alerts';
import {TechnicalAlertObserver} from '../../src/ui/technical-alert-observer';
import {drawingConditionText} from '../../src/domain/drawing-alert-rules';

// SYNTHETIC. All expected ratios are independently reduced from literal least-squares residuals.
const T=1767225600,D=86400,NOW=1791936000;
const data=(values=[10,14,12]):BarDataset=>({...fixtureDataset('GME',3),bars:values.map((close,i)=>({time:T+i*D,open:close,high:close+1,low:close-1,close,volume:1}))});
const drawing=(first=0,last=10,id='synthetic-regression')=>({id,type:'regressionchannel',paneId:'price',lvName:'Observed trend',anchors:[{time:(T+first*D)*1000,price:1},{time:(T+last*D)*1000,price:1}]});
function source(dataset=data(),record=drawing(),policy:'follow'|'frozen'='follow',style='candles'):Extract<AlertSourceSnapshot,{kind:'drawing-boundary'}>{
 const prepared=prepareDrawingAlertGrid(dataset.bars,{source:sourceContextForDataset(dataset),style,scale:'linear'});if(!prepared.ok)throw new Error(prepared.diagnostics.join(' '));
 const shot=prepared.grid.captureShape(record);if(!shot.ok)throw new Error(shot.diagnostics.join(' '));
 return {kind:'drawing-boundary',instanceId:record.id,snapshotId:'synthetic-regression-fit',geometry:shot.snapshot,mutationPolicy:policy};
}
async function observe(dataset:BarDataset,captured:AlertSourceSnapshot,drawings?:unknown[]|null){
 const batch=await evaluateTechnicalAlertSources(dataset.bars,[captured],'USD',{sourceBasis:alertDatasetKey(dataset,2),sourceRevision:dataset.provenance.revision,drawings});
 return batch.results.get(technicalSourceKey(captured))!;
}
describe(' Regression trend follows the observed drawing without future data',()=>{
 it('reads the hand-computed channel position and readable name',async()=>{
  const dataset=data(),captured=source(dataset),result=await observe(dataset,captured,[drawing()]);
  expect(result.sample.value).toBeCloseTo(.5-1/(4*Math.sqrt(2)),12);
  expect(result.sample.operands?.left.label).toBe('Observed trend');
  expect(result.sample.operands?.left.plots?.map(row=>row.title)).toEqual(['Lower line','Upper line','Close']);
  expect(drawingConditionText(captured,{kind:'entering',lower:0,upper:1})).toBe('Entering Observed trend');
 });
 it('refits a future-ended drawing when one observed bar arrives, without extending the captured segment',async()=>{
  const captured=source(),grown=data([10,14,12,15]),followed=await observe(grown,captured,[drawing()]);
  expect(followed.sample.value).toBeCloseTo(.5+.3/(2*Math.sqrt(6.3)),12);
  const frozen=await observe(grown,{...captured,mutationPolicy:'frozen'},[drawing()]);
  expect(frozen.sample.value).toBeNull();expect(frozen.diagnostics.join(' ')).toMatch(/outside the drawing/);
 });
 it('a current-prefix correction changes followed coefficients while a frozen fit keeps its captured geometry',async()=>{
  const captured=source(),corrected=data([10,14,20]);
  expect((await observe(corrected,captured,[drawing()])).sample.value).toBeCloseTo(.5+1/(4*Math.sqrt(2)),12);
  expect((await observe(corrected,{...captured,mutationPolicy:'frozen'},[drawing()])).sample.value).toBeCloseTo(.5+7/(4*Math.sqrt(2)),12);
 });
 it('frozen coefficients cannot evaluate an earlier prefix than their final fitting row',async()=>{
  const dataset=data(),captured=source(dataset,drawing(),'frozen'),earlier={...dataset,bars:dataset.bars.slice(0,2)};
  const result=await observe(earlier,captured,[drawing()]);expect(result.sample.value).toBeNull();expect(result.diagnostics.join(' ')).toMatch(/precedes the final bar/);
 });
 it('deletion is unavailable, Undo restores the drawing value, and Redo deletes it again',async()=>{
  const dataset=data(),captured=source(dataset);
  const absent=await observe(dataset,captured,[]);expect(absent.sample.value).toBeNull();expect(absent.diagnostics).toContain(DRAWING_DELETED_DIAGNOSTIC);
  expect((await observe(dataset,captured,[drawing()])).sample.value).toBeCloseTo(.5-1/(4*Math.sqrt(2)),12);
  expect((await observe(dataset,captured,[])).sample.value).toBeNull();
  expect((await observe(dataset,captured,null)).sample.value).toBeCloseTo(.5-1/(4*Math.sqrt(2)),12);// existing captured fallback when no drawing collection was supplied
 });
 it('moving the time window uses its actual new fit, and a shorter feed never silently borrows old coefficients',async()=>{
  const dataset=data([10,14,12,15]),captured=source(dataset),moved=drawing(1);
  expect((await observe(dataset,captured,[moved])).sample.value).toBeCloseTo(.5+1/(4*Math.sqrt(2)),12);
  const shorter={...dataset,bars:dataset.bars.slice(1)};
  const result=await observe(shorter,captured,[drawing()]);expect(result.sample.value).toBeNull();expect(result.diagnostics.join(' ')).toMatch(/Earlier fitting history/);
 });
 it('followed HA uses the saved transform even though the evaluator shares a standard-price time grid',async()=>{
  const dataset=data();dataset.bars=[
   {time:T,open:8,high:14,low:6,close:12,volume:1},
   {time:T+D,open:12,high:18,low:10,close:16,volume:1},
   {time:T+2*D,open:10,high:16,low:8,close:14,volume:1},
  ];
  const captured=source(dataset,drawing(),'follow','heikinashi'),result=await observe(dataset,captured,[drawing()]);
  expect(result.sample.value).toBeCloseTo(.5-1/(4*Math.sqrt(2)),12);
  expect(result.sample.operands?.left.plots?.find(row=>row.id==='price')?.value).toBe(12);
  expect(result.sample.operands?.left.plots?.find(row=>row.id==='lower')?.value).toBeCloseTo(13-2*Math.sqrt(2),12);
 });
 it('moving/undoing a followed drawing restarts its revision while cosmetic vertical prices do not',async()=>{
  const dataset=data([10,14,12,15]),captured=source(dataset),observer=new TechnicalAlertObserver(()=> 'synthetic-context',()=>Promise.resolve());
  const view=await observer.observe({dataset,bars:dataset.bars,chartId:'synthetic-chart',replay:null,assumeReplayCompletion:false,selectedSource:captured,alerts:[],drawings:[drawing()]},NOW),context=view.selectedContext!;
  const alert=createLocalAlert({id:'synthetic-alert',name:'Synthetic Regression alert',message:'Synthetic data only',instrumentId:context.instrumentId,sourceId:context.sourceId,mode:context.mode,runId:context.runId,observationBinding:context.binding,conditionVersion:2,condition:{kind:'entering',lower:0,upper:1},frequency:'every-time',createdAt:NOW,expiresAt:null});
  const tracker=new DrawingAlertFollow(),initial=[alert];expect(tracker.follow(initial,[drawing()],NOW+1).alerts).toBe(initial);
  expect(tracker.follow(initial,[{...drawing(),anchors:drawing().anchors.map(row=>({...row,price:999})),locked:true}],NOW+2).alerts).toBe(initial);
  const moved=tracker.follow(initial,[drawing(1)],NOW+3);expect(moved.restarted).toEqual(['synthetic-alert']);expect(moved.alerts[0].revision).toBe(alert.revision+1);expect(moved.alerts[0].history).toEqual(alert.history);
  const paused=[setLocalAlertPaused(moved.alerts[0],true)],undo=tracker.follow(paused,[drawing()],NOW+4);
  expect(undo.restarted).toEqual(['synthetic-alert']);expect(undo.alerts[0].status).toBe('paused');
 });
 it('charges the fitting work to the existing twenty-million-operation batch budget',()=>{
  const dataset=data(),three=[0,1,2].map(i=>source(dataset,drawing(0,10,'synthetic-regression-'+i)));
  const one=technicalAlertEstimatedWork(100000,three.slice(0,1)),many=technicalAlertEstimatedWork(100000,three);
  expect(one).toBeLessThan(TECHNICAL_ALERT_LIMITS.operations);expect(many).toBeGreaterThan(TECHNICAL_ALERT_LIMITS.operations);
  expect(many-one).toBeGreaterThanOrEqual(2*100000*64);
 });
});
