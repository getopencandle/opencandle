import {describe,expect,it} from 'vitest';
import {captureIndicatorAlertSource,evaluateTechnicalAlertSources,technicalSourceLabel} from '../../src/domain/technical-alerts';
import {alertConditionMemberRefusal,alertOperandResult,alertSourceId,validateAlertSource,validateTechnicalAlertSource,type AlertSourceSnapshot,type AlertConditionSource} from '../../src/domain/alert-observation';
import {fixtureDataset} from '../../src/domain/fixtures';
import {createLocalAlert,editLocalAlert,processAlertEvent,validateLocalAlerts,type AlertCondition,type AlertFrequency,type LocalAlert} from '../../src/domain/alerts';
import {alertSourceType,filterAlertManagerAlerts,DEFAULT_ALERT_MANAGER_FILTER} from '../../src/domain/alert-manager-view';
import {TechnicalAlertObserver,type TechnicalAlertInput,type TechnicalAlertView} from '../../src/ui/technical-alert-observer';
import {TechnicalAlertCatalog} from '../../src/ui/technical-alert-catalog';
import type {BarDataset} from '../../src/domain/types';

// Multi-condition (all-conditions) alerts on the single-alert path. SYNTHETIC daily bars only.
const day=Date.UTC(2024,0,2)/1000,now=Date.UTC(2026,9,14)/1000;
const close:AlertSourceSnapshot={kind:'price',field:'close',transformId:'standard'};
const high:AlertSourceSnapshot={kind:'price',field:'high',transformId:'standard'};
const data=(values:number[]):BarDataset=>{const dataset=fixtureDataset('GME',500);dataset.bars=values.map((value,index)=>({time:day+index*86400,open:value,high:value+1,low:value-1,close:value,volume:100}));return dataset;};
const sma=(length=2,id='sma1',snapshot='sma-snapshot')=>captureIndicatorAlertSource({id,kind:'sma',inputs:{length,source:'close'},plots:{},offset:0,visible:true},'sma','standard',snapshot);
const compare=(left:AlertSourceSnapshot,right:AlertSourceSnapshot,id='cmp'):AlertConditionSource=>({kind:'comparison',snapshotId:id,left,right} as AlertConditionSource);
const group=(...members:AlertSourceSnapshot[]):AlertSourceSnapshot=>({kind:'all',snapshotId:'group-1',members:members as AlertConditionSource[]});
const observer=()=>{let id=0;return new TechnicalAlertObserver(()=>`session-${++id}`,()=>Promise.resolve());};
function create(view:TechnicalAlertView,conditions:AlertCondition[],frequency:AlertFrequency='every-time'):LocalAlert{
 const context=view.selectedContext!;expect(context,JSON.stringify(view.diagnostics)).toBeTruthy();
 return createLocalAlert({id:'multi',name:'multi',message:'all matched',instrumentId:context.instrumentId,sourceId:context.sourceId,mode:context.mode,runId:context.runId,observationBinding:context.binding,conditionVersion:2,condition:conditions[0],conditions,frequency,createdAt:view.now,expiresAt:null});
}
/** Observe a growing prefix (ordinary, or a replay run that simulates completed rows); returns the 1-based bars that triggered. */
async function run(values:number[],source:AlertSourceSnapshot,conditions:AlertCondition[],options:{replay?:boolean;frequency?:AlertFrequency}={}){
 const engine=observer(),full=data(values);let alert:LocalAlert|null=null;const fired:number[]=[];
 for(let k=1;k<=values.length;k++){
  const dataset=options.replay?full:data(values.slice(0,k)),bars=dataset.bars.slice(0,k);
  const input:TechnicalAlertInput={dataset,bars,chartId:'chart-1',replay:options.replay?{runId:'replay-1',cursor:k-1}:null,assumeReplayCompletion:!!options.replay,selectedSource:source,alerts:alert?[alert]:[]};
  const view=await engine.observe(input,now+k);
  if(!alert){alert=create(view,conditions,options.frequency);}
  const before=alert.history.length;for(const event of [...(view.closedEvents??[]),...view.events])alert=processAlertEvent(alert,event).alert;
  if(alert.history.length>before)fired.push(k);
 }
 expect(validateLocalAlerts([alert]).ok).toBe(true);
 return {alert:alert!,fired};
}

describe('ALERTS-10 all-conditions source contract',()=>{
 it('validates 2 to 5 conditions, refuses nesting and gives a stable label and identity',()=>{
  const source=group(close,compare(close,sma()));
  expect(()=>validateTechnicalAlertSource(source)).not.toThrow();
  expect(alertSourceId(source)).toBe(JSON.stringify(['all','group-1']));
  expect(technicalSourceLabel(source)).toBe('CLOSE (standard) and CLOSE (standard) compared with SMA / sma (standard)');
  expect(()=>validateAlertSource(group(close))).toThrow('2 to 5 conditions');
  expect(()=>validateAlertSource(group(close,close,close,close,close,close))).toThrow('2 to 5 conditions');
  expect(()=>validateAlertSource(group(close,group(close,high)))).toThrow('Nested all-conditions');
  expect(()=>validateAlertSource({kind:'comparison',snapshotId:'x',left:group(close,high) as never,right:close as never})).toThrow('cannot be a comparison operand');
 });
 it('refuses sources that need their own evaluation owner, drawings and scripts',()=>{
  const vwap:AlertSourceSnapshot={kind:'indicator',instanceId:'v',snapshotId:'v',indicator:'vwap',plotId:'vwap',inputs:{kernelVersion:2,source:'close',anchor:'Session',timezone:'UTC'},inputBasis:'standard-ohlc',transformId:'standard'};
  const script:AlertSourceSnapshot={kind:'script',instanceId:'s',snapshotId:'s',title:'T',source:'ctx.plot(1)',inputs:{},output:'plot',outputId:'p',transformId:'standard'};
  const drawing:AlertSourceSnapshot={kind:'drawing',instanceId:'d',snapshotId:'d',tool:'hline',anchors:[{time:day,price:10}],settings:{},evaluation:'signed-price-distance',coordinateModel:'linear-time-price'};
  expect(alertConditionMemberRefusal(vwap)).toMatch(/VWAP alerts on its own/);
  expect(alertConditionMemberRefusal(script)).toMatch(/Script outputs alert on their own/);
  expect(alertConditionMemberRefusal(drawing)).toMatch(/Drawings alert on their own/);
  expect(alertConditionMemberRefusal(compare(close,drawing as never))).toMatch(/Drawings/);
  expect(alertConditionMemberRefusal(sma())).toBeNull();expect(alertConditionMemberRefusal(compare(close,sma()))).toBeNull();
  expect(()=>validateTechnicalAlertSource(group(close,script))).toThrow('Script outputs alert on their own');
 });
 it('evaluates every condition on one prefix and reports the first value only when all have one',async()=>{
  const dataset=data([9,10,12]),source=group(close,compare(close,sma(2)),sma(5,'sma5','s5'));
  const batch=await evaluateTechnicalAlertSources(dataset.bars,[source],'USD');
  const result=[...batch.results.values()][0];
  expect(result.sample.operands!.conditions!.map(row=>alertOperandResult(row))).toEqual([12,1,null]);
  expect(result.sample.value).toBeNull();
  expect(result.diagnostics.some(text=>text.startsWith('Condition 3: '))).toBe(true);
  const ready=[...(await evaluateTechnicalAlertSources(dataset.bars,[group(close,compare(close,sma(2)))],'USD')).results.values()][0];
  expect(ready.sample.value).toBe(12);expect(ready.sample.operands!.left.value).toBe(12);
 });
});

describe('ALERTS-10 definition rules',()=>{
 const base=async()=>{const engine=observer(),view=await engine.observe({dataset:data([9]),bars:data([9]).bars,chartId:'chart-1',replay:null,assumeReplayCompletion:false,selectedSource:group(close,compare(close,sma())),alerts:[]},now);return view;};
 it('needs one supported condition per source, the first repeated in condition',async()=>{
  const view=await base();
  expect(()=>create(view,[{kind:'greater',value:1}])).toThrow('one condition for each');
  expect(()=>create(view,[{kind:'greater',value:1},{kind:'inside',lower:-1,upper:1}])).toThrow('compares two sources');
  expect(()=>create(view,[{kind:'greater',value:1},{kind:'crossing',value:2}])).toThrow('compares two sources');
  expect(()=>create(view,[{kind:'position' as never},{kind:'crossing',value:0}])).toThrow();
  const made=create(view,[{kind:'greater',value:1},{kind:'crossing-up',value:0}]);
  expect(made.definition.conditions).toHaveLength(2);
  expect(()=>createLocalAlert({...made.definition,condition:{kind:'less',value:1}})).toThrow('first condition disagrees');
  const edited=editLocalAlert(made,{condition:{kind:'less',value:5},conditions:[{kind:'less',value:5},{kind:'crossing-down',value:0}]},now+5);
  expect(edited.definition.conditions![1].kind).toBe('crossing-down');expect(edited.revision).toBe(2);
 });
 it('is listed and searchable in the alert manager',async()=>{
  const made=create(await base(),[{kind:'greater',value:1},{kind:'crossing-up',value:0}]);
  expect(alertSourceType(made.definition.observationBinding!.source)).toBe('comparison');
  expect(filterAlertManagerAlerts([made],{...DEFAULT_ALERT_MANAGER_FILTER,sourceType:'comparison'})).toHaveLength(1);
  expect(filterAlertManagerAlerts([made],{...DEFAULT_ALERT_MANAGER_FILTER,query:'all conditions'})).toHaveLength(1);
  expect(alertSourceType(group(close,sma()))).toBe('indicator');expect(alertSourceType(group(close,high))).toBe('price');
 });
});

describe('ALERTS-10 operators in the live (ordinary) path',()=>{
 it('crossing up AND greater than fires only when both hold',async()=>{
  expect((await run([9,11,9,11],group(close,high),[{kind:'crossing-up',value:10},{kind:'greater',value:11.5}])).fired).toEqual([2,4]);
  expect((await run([9,11,9,11],group(close,high),[{kind:'crossing-up',value:10},{kind:'greater',value:12.5}])).fired).toEqual([]);
 });
 it('crossing down, crossing and less than',async()=>{
  expect((await run([11,9,11,9],group(close,close),[{kind:'crossing-down',value:10},{kind:'less',value:9.5}])).fired).toEqual([2,4]);
  expect((await run([11,9,11,9],group(close,high),[{kind:'crossing',value:10},{kind:'less',value:11}])).fired).toEqual([2,4]);
  expect((await run([11,9,11,9],group(close,high),[{kind:'crossing',value:10},{kind:'greater',value:11}])).fired).toEqual([3]);
 });
 it('entering, exiting, inside and outside channel',async()=>{
  expect((await run([5,10,20,10],group(close,close),[{kind:'entering',lower:8,upper:12},{kind:'inside',lower:0,upper:100}])).fired).toEqual([2,4]);
  expect((await run([5,10,20,10],group(close,close),[{kind:'exiting',lower:8,upper:12},{kind:'outside',lower:0,upper:15}])).fired).toEqual([3]);
 });
 it('source against source: close crossing its SMA, AND a level',async()=>{
  // SMA(2) of 10,10,8,12,13: -,10,9,10,12.5. Close minus SMA: -,0,-1,2,0.5. Crossing up 0 at bar 4.
  const result=await run([10,10,8,12,13],group(compare(close,sma(2)),close),[{kind:'crossing-up',value:0},{kind:'greater',value:11}]);
  expect(result.fired).toEqual([4]);expect(result.alert.history[0].value).toBe(2);
  expect(result.alert.history[0].observation!.operands!.conditions).toHaveLength(2);
 });
 it('an unavailable condition waits for data and clears every baseline',async()=>{
  // SMA(3) has no value on bars 1-2, so the alert waits; a crossing that started before the wait never fires.
  const result=await run([9,11,12,13],group(close,sma(3,'sma3','s3')),[{kind:'crossing-up',value:10},{kind:'greater',value:0}]);
  expect(result.fired).toEqual([]);expect(result.alert.missedDataGaps).toBeGreaterThan(0);
 });
 it('only once stops after the first combined trigger',async()=>{
  const result=await run([9,11,9,11],group(close,high),[{kind:'crossing-up',value:10},{kind:'greater',value:0}],{frequency:'only-once'});
  expect(result.fired).toEqual([2]);expect(result.alert.status).toBe('stopped');
 });
});

describe('ALERTS-10 replay path',()=>{
 it('fires in an isolated replay run with simulated completed rows',async()=>{
  const result=await run([9,11,9,11],group(close,high),[{kind:'crossing-up',value:10},{kind:'greater',value:11.5}],{replay:true});
  expect(result.fired).toEqual([2,4]);expect(result.alert.definition.mode).toBe('replay');expect(result.alert.history.every(item=>item.mode==='replay')).toBe(true);
 });
 it('moving up and moving down percent use each condition\'s own completed bars',async()=>{
  // Close 100,100,111,111,99: +11% on bar 3, -10.8% on bar 5. High = close+1 stays above 100 throughout.
  expect((await run([100,100,111,111,99],group(close,high),[{kind:'moving-up',amount:10,bars:1,percent:true},{kind:'greater',value:100}],{replay:true})).fired).toEqual([3]);
  expect((await run([100,100,111,111,99],group(high,close),[{kind:'greater',value:0},{kind:'moving-down',amount:10,bars:1,percent:true}],{replay:true})).fired).toEqual([5]);
  expect((await run([100,100,111,111,99],group(close,close),[{kind:'moving-up',amount:10,bars:1,percent:true},{kind:'moving-down',amount:10,bars:1,percent:true}],{replay:true})).fired).toEqual([]);
 });
 it('once per bar close compares completed bars of every condition',async()=>{
  const result=await run([9,11,9,11],group(close,high),[{kind:'crossing-up',value:10},{kind:'greater',value:11.5}],{replay:true,frequency:'once-per-bar-close'});
  expect(result.fired).toEqual([2,4]);
  expect(result.alert.closedBars.at(-1)!.values).toEqual([11,12]);
 });
});

describe('ALERTS-10 catalog source identity',()=>{
 it('keeps one snapshot identity for an unchanged draft of several comparisons',()=>{
  let id=0;const catalog=new TechnicalAlertCatalog(()=>'id-'+(++id));
  const build=()=>catalog.group([catalog.expression(close,sma()),catalog.expression(high,sma())]);
  const first=build(),second=build();
  expect(second).toEqual(first);expect(first.kind==='all'&&first.members.map(member=>member.kind)).toEqual(['comparison','comparison']);
  expect((catalog.group([catalog.expression(close,sma()),close]) as {snapshotId:string}).snapshotId).not.toBe((first as {snapshotId:string}).snapshotId);
  expect(()=>catalog.group([close])).toThrow('2 to 5');
 });
});
