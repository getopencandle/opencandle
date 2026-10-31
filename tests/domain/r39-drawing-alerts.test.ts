import {describe,expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {BarDataset} from '../../src/domain/types';
import {evaluateTechnicalAlertSources,technicalSourceKey} from '../../src/domain/technical-alerts';
import {TechnicalAlertObserver,type TechnicalAlertInput,type TechnicalAlertView} from '../../src/ui/technical-alert-observer';
import {alertDatasetKey,validateTechnicalAlertSource,type AlertSourceSnapshot} from '../../src/domain/alert-observation';
import {prepareDrawingAlertGrid} from '../../src/chart/drawing-alert-geometry';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {createLocalAlert,processAlertEvent,setLocalAlertPaused,type LocalAlert,type AlertCondition} from '../../src/domain/alerts';
import {DRAWING_DELETED_DIAGNOSTIC,DrawingAlertFollow,alertsWatchDrawings} from '../../src/domain/drawing-alert-source';
import {drawingConditionText,drawingConditionError,drawingAlertDraft} from '../../src/domain/drawing-alert-rules';
import {dockListRows} from '../../src/ui/alerts-dock-model';

// Version 2 drawing alerts through the evaluator, the observer and the alert rules. SYNTHETIC data only.
const day=1704153600,now=1791936000;
const close:AlertSourceSnapshot={kind:'price',field:'close',transformId:'standard'};
const dataset=(values:number[]):BarDataset=>{const base=fixtureDataset('GME',5);return {...base,bars:values.map((value,index)=>({time:day+index*86400,open:value,high:value+1,low:Math.max(.01,value-1),close:value,volume:100}))};};
const t=(index:number)=>(day+index*86400)*1000;
function follow(data:BarDataset,record:Record<string,unknown>):Extract<AlertSourceSnapshot,{kind:'drawing-boundary'}>{
 const prepared=prepareDrawingAlertGrid(data.bars,{source:sourceContextForDataset(data),style:'candles',scale:'linear'});if(!prepared.ok)throw new Error(prepared.diagnostics.join(' '));
 const captured=prepared.grid.captureShape(record);if(!captured.ok)throw new Error(captured.diagnostics.join(' '));
 return {kind:'drawing-boundary',instanceId:String(record.id),snapshotId:'SYNTHETIC-geometry',geometry:captured.snapshot,mutationPolicy:'follow'};
}
const options=(data:BarDataset,drawings?:unknown[]|null)=>({sourceBasis:alertDatasetKey(data,2),sourceRevision:data.provenance.revision,drawings});
async function value(data:BarDataset,source:AlertSourceSnapshot,drawings?:unknown[]|null){const batch=await evaluateTechnicalAlertSources(data.bars,[source],'USD',options(data,drawings));return batch.results.get(technicalSourceKey(source))!;}
const box=(price:[number,number]=[12,20],id='box1')=>({id,type:'box',paneId:'price',anchors:[{time:t(0),price:price[0]},{time:t(3),price:price[1]}],props:{lvBoxExtend:{schemaVersion:1,left:false,right:true}}});

describe('channel and vertical line values',()=>{
 it('a channel reads the close place between its lines (0 lower, 1 upper) with the lines as plots',async()=>{
  const data=dataset([10,14,18,16]),source=follow(data,box());
  const result=await value(data,source,[box()]);
  expect(result.sample.value).toBe(0.5);expect(result.diagnostics).toEqual([]);
  expect(result.sample.operands?.left.plots).toEqual([{id:'lower',title:'Lower line',value:12},{id:'upper',title:'Upper line',value:20},{id:'price',title:'Close',value:16}]);
  expect(result.sample.operands?.left.label).toBe('Rectangle');
 });
 it('a vertical line reads the endpoint bar time minus the line time',async()=>{
  const data=dataset([10,11,12]),line={id:'v1',type:'vline',anchors:[{time:t(5),price:1}]},source=follow(data,line);
  expect((await value(data,source,[line])).sample.value).toBe(-3*86400);
  const later=dataset([10,11,12,13,14,15,16]);expect((await value(later,source,[line])).sample.value).toBe(86400);
 });
});

describe('the alert follows its drawing',()=>{
 it('moved: the current position; deleted: no value with a diagnostic; back again: a value; not supplied: the creation geometry',async()=>{
  const data=dataset([10,14,18,16]),source=follow(data,box());
  expect((await value(data,source,[box([8,24])])).sample.value).toBe(0.5);
  const moved=await value(data,source,[box([16,18])]);expect(moved.sample.value).toBe(0);expect(moved.sample.operands?.left.basis).toMatch(/current position/);
  const deleted=await value(data,source,[]);expect(deleted.sample.value).toBeNull();expect(deleted.diagnostics).toContain(DRAWING_DELETED_DIAGNOSTIC);
  expect((await value(data,source,[box()])).sample.value).toBe(0.5);
  expect((await value(data,source,null)).sample.value).toBe(0.5);
  const frozen={...source,mutationPolicy:'frozen' as const};expect((await value(data,frozen,[box([16,18])])).sample.value).toBe(0.5);
 });
 it('a price compared with a followed trend line uses the moved line',async()=>{
  const data=dataset([10,10,10,10]),line=(end:number)=>({id:'tl',type:'trendline',paneId:'price',anchors:[{time:t(0),price:8},{time:t(3),price:end}]}),boundary=follow(data,line(14));
  const source:AlertSourceSnapshot={kind:'comparison',snapshotId:'SYNTHETIC-cmp',left:close,right:boundary};
  expect((await value(data,source,[line(14)])).sample.value).toBe(-4);
  expect((await value(data,source,[line(5)])).sample.value).toBe(5);
 });
 it('restarts a followed alert when its drawing moves (history kept, paused stays paused), never on first sight',async()=>{
  const data=dataset([10,14,18,16]),view=await engine().observe(input(data,follow(data,box()),[],[box()]),now);
  const alert=consume(makeAlert(view,{kind:"entering",lower:0,upper:1}),view);
  const tracker=new DrawingAlertFollow(),alerts=[alert];
  expect(tracker.follow(alerts,[box()],now+1).alerts).toBe(alerts);
  expect(tracker.follow(alerts,[box()],now+2).alerts).toBe(alerts);
  const restarted=tracker.follow(alerts,[box([1,2])],now+3);expect(restarted.restarted).toEqual(['review-alert']);expect(restarted.alerts[0].revision).toBe(alert.revision+1);
  expect(tracker.follow(restarted.alerts,[box([1,2])],now+4).alerts).toBe(restarted.alerts);
  const paused=[setLocalAlertPaused(restarted.alerts[0],true)],again=tracker.follow(paused,[box()],now+5);expect(again.alerts[0].status).toBe('paused');expect(again.restarted).toHaveLength(1);
  expect(tracker.follow(again.alerts,[],now+6).alerts).toBe(again.alerts);
 });
});

const input=(data:BarDataset,source:AlertSourceSnapshot,alerts:LocalAlert[]=[],drawings?:unknown[]):TechnicalAlertInput=>({dataset:data,bars:data.bars,chartId:'SYNTHETIC-chart',replay:null,assumeReplayCompletion:false,selectedSource:source,alerts,...(drawings?{drawings}:{})});
const engine=()=>{let i=0;return new TechnicalAlertObserver(()=> 'SYNTHETIC-session-'+ ++i,()=>Promise.resolve());};
function makeAlert(view:TechnicalAlertView,condition:AlertCondition):LocalAlert{
 const c=view.selectedContext!;return createLocalAlert({id:'review-alert',name:'SYNTHETIC drawing alert',message:'Synthetic observations only',instrumentId:c.instrumentId,sourceId:c.sourceId,mode:c.mode,runId:c.runId,observationBinding:c.binding,conditionVersion:2,condition,frequency:'every-time',createdAt:view.now,expiresAt:null});
}
const consume=(alert:LocalAlert,view:TechnicalAlertView)=>view.events.reduce((state,event)=>processAlertEvent(state,event).alert,alert);

describe('conditions',()=>{
 it('a rectangle alert fires on Entering when the close moves inside, through the observer',async()=>{
  const data=dataset([10,11]),drawing=box([12,20]),source=follow(data,drawing),observer=engine();
  const first=await observer.observe(input(data,source,[],[drawing]),now);expect(first.selectedEvent?.value).toBeLessThan(0);
  let alert=consume(makeAlert(first,{kind:'entering',lower:0,upper:1}),first);expect(alert.history).toHaveLength(0);
  const grown={...data,bars:[...data.bars,{time:day+2*86400,open:15,high:16,low:14,close:15,volume:100}]};
  const next=await observer.observe(input(grown,source,[alert],[drawing]),now+1);alert=consume(alert,next);
  expect(alert.history).toHaveLength(1);expect(alert.history[0].value).toBeCloseTo(3/8,9);
 });
 it('a channel takes only Entering, Exiting, Inside, Outside with bounds 0 and 1; a vertical line only Crossing 0',async()=>{
  const data=dataset([10,11]),view=await engine().observe(input(data,follow(data,box()),[],[box()]),now);
  for(const condition of [{kind:'entering',lower:0,upper:1},{kind:'exiting',lower:0,upper:1},{kind:'inside',lower:0,upper:1},{kind:'outside',lower:0,upper:1}] as AlertCondition[])expect(()=>makeAlert(view,condition)).not.toThrow();
  for(const condition of [{kind:'crossing',value:0},{kind:'entering',lower:0,upper:2},{kind:'greater',value:1}] as AlertCondition[])expect(()=>makeAlert(view,condition)).toThrow(/channel alert/);
  const line={id:'v1',type:'vline',anchors:[{time:t(5),price:1}]},vertical=await engine().observe(input(data,follow(data,line),[],[line]),now);
  expect(()=>makeAlert(vertical,{kind:'crossing-up',value:0})).not.toThrow();
  expect(()=>makeAlert(vertical,{kind:'crossing-up',value:5})).toThrow(/vertical line/);
  expect(drawingConditionError(close,{kind:'crossing',value:3})).toBeNull();
 });
 it('a channel or vertical line is never one side of a comparison; a frozen policy stays the default meaning',()=>{
  const data=dataset([10,11]),channel=follow(data,box());
  expect(()=>validateTechnicalAlertSource({kind:'comparison',snapshotId:'x',left:close,right:channel})).toThrow(/alone/);
  expect(()=>validateTechnicalAlertSource(channel)).not.toThrow();
  expect(()=>validateTechnicalAlertSource({...channel,mutationPolicy:'live'} as never)).toThrow(/mutation policy/);
 });
});

describe('the alert list names the drawing',()=>{
 it('condition texts and dock rows say the drawing name, not an id',async()=>{
  const data=dataset([10,11]),channel=follow(data,box()),line=follow(data,{id:'tl',type:'trendline',lvName:'Support',anchors:[{time:t(0),price:8},{time:t(1),price:9}]}),vertical=follow(data,{id:'v',type:'vline',anchors:[{time:t(5),price:1}]});
  expect(drawingConditionText(channel,{kind:'entering',lower:0,upper:1})).toBe('Entering Rectangle');
  expect(drawingConditionText({kind:'comparison',snapshotId:'c',left:close,right:line},{kind:'crossing-up',value:0})).toBe('Crossing up Support');
  expect(drawingConditionText(vertical,{kind:'crossing-up',value:0})).toBe('Reaching Vertical line');
  expect(drawingConditionText(close,{kind:'crossing',value:1})).toBeNull();
  const view=await engine().observe(input(data,channel,[],[box()]),now),alert=makeAlert(view,{kind:'exiting',lower:0,upper:1});
  const [row]=dockListRows([alert],{activeInstrumentId:alert.definition.instrumentId,unwatched:new Map(),formatTime:String,now});
  expect(row.condition).toBe('Exiting Rectangle');expect(row.condition).not.toContain('box1');
  expect(alertsWatchDrawings([alert])).toBe(true);
 });
 it('the form preset gives a drawing source a condition its shape takes and a default name',()=>{
  const draft={name:'GME price alert',message:'',kind:'crossing-up',value:'5',lower:'1',upper:'2'};
  expect(drawingAlertDraft(draft,{shape:'channel',symbol:'GME',name:'Parallel channel',previousName:null})).toMatchObject({kind:'entering',lower:'0',upper:'1',name:'GME Parallel channel alert'});
  expect(drawingAlertDraft({...draft,kind:'exiting'},{shape:'channel',symbol:'GME',name:'Parallel channel',previousName:null}).kind).toBe('exiting');
  expect(drawingAlertDraft(draft,{shape:'time',symbol:'GME',name:'Vertical line',previousName:null})).toMatchObject({kind:'crossing-up',value:'0'});
  expect(drawingAlertDraft({...draft,name:'Mine'},{shape:'line',symbol:'GME',name:'Trend line',previousName:null}).name).toBe('Mine');
  expect(drawingAlertDraft({...draft,name:'GME Trend line alert'},{shape:null,symbol:'GME',name:null,previousName:'Trend line'}).name).toBe('GME price alert');
  const same={...draft,kind:'crossing'};expect(drawingAlertDraft(same,{shape:'line',symbol:'GME',name:null,previousName:null})).toBe(same);
 });
});
