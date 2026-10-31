import {describe,expect,it} from 'vitest';
import {captureIndicatorAlertSource,evaluateTechnicalAlertSources,technicalAlertEstimatedWork,technicalSourceKey,TECHNICAL_ALERT_LIMITS} from '../../src/domain/technical-alerts';
import {alertDatasetKey,validateAlertBinding,type AlertSourceSnapshot} from '../../src/domain/alert-observation';
import {fixtureDataset} from '../../src/domain/fixtures';
import {createLocalAlert,processAlertEvent,setLocalAlertPaused,validateLocalAlerts,type LocalAlert} from '../../src/domain/alerts';
import {AlertCommitEvaluationGate,TechnicalAlertObserver,type TechnicalAlertInput,type TechnicalAlertView} from '../../src/ui/technical-alert-observer';
import type {BarDataset} from '../../src/domain/types';
const day=Date.UTC(2024,0,2)/1000,now=Date.UTC(2026,9,14)/1000;
const close:AlertSourceSnapshot={kind:'price',field:'close',transformId:'standard'};
const data=(values:number[]):BarDataset=>{const dataset=fixtureDataset('GME',500);dataset.bars=values.map((value,index)=>({time:day+index*86400,open:value,high:value+1,low:value-1,close:value,volume:100}));return dataset;};
const sma=(length=2,id='sma1',snapshot='sma-snapshot'):AlertSourceSnapshot=>captureIndicatorAlertSource({id,kind:'sma',inputs:{length,source:'close'},plots:{},offset:100,visible:false},'sma','standard',snapshot);
const input=(dataset:BarDataset,source:AlertSourceSnapshot=close,alerts:LocalAlert[]=[]):TechnicalAlertInput=>({dataset,bars:dataset.bars,chartId:'chart-1',replay:null,assumeReplayCompletion:false,selectedSource:source,alerts});
const observer=()=>{let id=0;return new TechnicalAlertObserver(()=>`session-${++id}`,()=>Promise.resolve());};
function alert(view:TechnicalAlertView,id='a',condition:{kind:'crossing-up'|'greater';value:number}={kind:'crossing-up',value:10}):LocalAlert{const context=view.selectedContext!;return createLocalAlert({id,name:id,message:'local',instrumentId:context.instrumentId,sourceId:context.sourceId,mode:context.mode,runId:context.runId,observationBinding:context.binding,conditionVersion:2,condition,frequency:'every-time',createdAt:view.now,expiresAt:null});}
function process(current:LocalAlert,view:TechnicalAlertView):LocalAlert{return view.events.reduce((state,event)=>processAlertEvent(state,event).alert,current);}

it('waits for committed resumed state before explicitly evaluating an unselected frozen SMA stream',async()=>{
 const engine=observer(),dataset=data([9,11]),first=await engine.observe(input(dataset,sma()),now),created=process(alert(first,'frozen-sma',{kind:'greater',value:9}),first),paused=setLocalAlertPaused(created,true),oldAlerts=[paused];
 expect(created.history).toHaveLength(1);await engine.observe(input(dataset,close,oldAlerts),now+1);
 const gate=new AlertCommitEvaluationGate(),resumed=setLocalAlertPaused(paused,false),committed=[resumed];gate.staged(committed);gate.request();
 expect(gate.take(oldAlerts)).toBe(false);expect(gate.take([...oldAlerts])).toBe(false);
 const precommit=await engine.observe(input(dataset,close,oldAlerts),now+2,'source-observation');expect(precommit.events.some(event=>event.sourceId===resumed.definition.sourceId)).toBe(false);
 expect(gate.take(committed)).toBe(true);expect(gate.take(committed)).toBe(false);
 const explicit=await engine.observe(input(dataset,close,committed),now+3,'explicit-evaluation'),saved=process(resumed,explicit);
 expect(saved.history).toHaveLength(2);expect(saved.history[1].value).toBe(10);expect(saved.history[1].observation?.reason).toBe('explicit-evaluation');expect(saved.definition.observationBinding).toEqual(created.definition.observationBinding);
});

describe('versioned technical sources and independent known values',()=>{
 it('captures complete SMA settings without offset, visibility or mutable instance linkage',async()=>{
  const settings={id:'sma1',kind:'sma' as const,inputs:{length:2,source:'close'},plots:{},offset:100,visible:false};
  const source=captureIndicatorAlertSource(settings,'sma','standard','captured');settings.inputs.length=3;settings.offset=-100;
  const result=await evaluateTechnicalAlertSources(data([9,11]).bars,[source],'USD');
  expect(result.results.get(technicalSourceKey(source))?.sample.value).toBe(10);
  expect(source).not.toHaveProperty('offset');expect(source.inputs.length).toBe(2);
 });
 it('never reads a future tail and transforms only the explicitly supplied prefix',async()=>{
  const full=data([2,4,100000]).bars;let futureReads=0;Object.defineProperty(full,2,{get(){futureReads++;throw new Error('future read');}});
  const prefix=[full[0],full[1]],source=sma();
  const result=await evaluateTechnicalAlertSources(prefix,[source,{kind:'price',field:'open',transformId:'heikinashi'}],'USD');
  expect(result.results.get(technicalSourceKey(source))?.sample.value).toBe(3);
  expect(result.results.get(technicalSourceKey({kind:'price',field:'open',transformId:'heikinashi'}))?.sample.value).toBe(2);
  expect(futureReads).toBe(0);
 });
 it('keeps unavailable volume and warmup distinct from zero and permits explicit mixed-unit comparisons',async()=>{
  const dataset=data([9]);dataset.bars[0].volume=NaN;
  const volume=captureIndicatorAlertSource({id:'v',kind:'volume',inputs:{length:20},plots:{},offset:0,visible:true},'volume','standard','v');
  const comparison:AlertSourceSnapshot={kind:'comparison',snapshotId:'mixed',left:close,right:volume};
  const result=await evaluateTechnicalAlertSources(dataset.bars,[volume,sma(),comparison],'USD');
  expect(result.results.get(technicalSourceKey(volume))?.sample.value).toBeNull();
  expect(result.results.get(technicalSourceKey(sma()))?.sample.value).toBeNull();
  expect(result.results.get(technicalSourceKey(comparison))?.sample.operands?.left.unit).toBe('USD');
  expect(result.results.get(technicalSourceKey(comparison))?.sample.operands?.right?.unit).toBe('source volume units');
 });
 it('binds exchange, coverage, units and chart identity, with revision outside the stable source basis',async()=>{
  const dataset=data([9]),first=alertDatasetKey(dataset,2),changed=structuredClone(dataset);changed.provenance.revision='correction';expect(alertDatasetKey(changed,2)).toBe(first);
  changed.provenance.coverage='single venue';expect(alertDatasetKey(changed,2)).not.toBe(first);
  const view=await observer().observe(input(dataset),now);validateAlertBinding(view.selectedContext!.binding);
  expect(()=>validateAlertBinding({...view.selectedContext!.binding,chartId:undefined})).toThrow();
  const saved=process(alert(view),view);expect(validateLocalAlerts([saved])).toEqual({ok:true,alerts:[saved],errors:[]});
 });
 it('rejects unsupported settings, invalid chronological input, and oversized work before calculations',async()=>{
  const unsupported={...sma(),inputs:{length:2,source:'other-indicator:plot'}};
  await expect(evaluateTechnicalAlertSources(data([9,11]).bars,[unsupported],'USD')).rejects.toThrow();
  const reversed=data([9,11]).bars.reverse();await expect(evaluateTechnicalAlertSources(reversed,[close],'USD')).rejects.toThrow('strictly increasing');
  const bb=captureIndicatorAlertSource({id:'b',kind:'bb',inputs:{length:25000,multiplier:2,basisType:'WMA',source:'close'},plots:{},offset:0,visible:true},'upper','standard','b');
  expect(technicalAlertEstimatedWork(100000,[bb])).toBeGreaterThan(TECHNICAL_ALERT_LIMITS.operations);
  await expect(evaluateTechnicalAlertSources(new Array(100000),[bb],'USD')).rejects.toThrow('estimated operations');
 });
});

describe('multiplex sessions, boundary conditions and continuity',()=>{
 it('version 2 reaches a level while retained version 1 requires passing it',async()=>{
  const engine=observer(),first=await engine.observe(input(data([9])),now);let modern=process(alert(first),first);
  const second=await engine.observe(input(data([9,10]),close,[modern]),now+1);modern=process(modern,second);expect(modern.history).toHaveLength(1);expect(modern.history[0].value).toBe(10);
  const third=await engine.observe(input(data([9,10,10]),close,[modern]),now+2);expect(process(modern,third).history).toHaveLength(1);
  let legacy=createLocalAlert({id:'legacy',name:'legacy',message:'',instrumentId:'x',sourceId:'x',runId:'x',mode:'ordinary',createdAt:now,expiresAt:null,frequency:'every-time',condition:{kind:'crossing-up',value:10}});
  for(const [sequence,value] of [9,10].entries())legacy=processAlertEvent(legacy,{instrumentId:'x',sourceId:'x',runId:'x',mode:'ordinary',time:now+sequence,availableAt:now+sequence,sequence,barId:String(sequence),barClosed:false,feedState:'ready',value}).alert;
  expect(legacy.history).toEqual([]);
 });
 it('retains both comparison values while evaluating their signed difference',async()=>{
  const source:AlertSourceSnapshot={kind:'comparison',snapshotId:'comparison',left:close,right:{kind:'price',field:'open',transformId:'standard'}};
  const firstData=data([9]);firstData.bars[0].open=10;firstData.bars[0].high=11;
  const engine=observer(),first=await engine.observe(input(firstData,source),now);let current=process(alert(first,'compare',{kind:'crossing-up',value:0}),first);
  const secondData=data([9,11]);secondData.bars[0]=firstData.bars[0];secondData.bars[1].open=10;
  const second=await engine.observe(input(secondData,source,[current]),now+1);current=process(current,second);
  expect(current.history[0].value).toBe(1);expect(current.history[0].observation?.operands).toMatchObject({left:{value:11},right:{value:10}});
 });
 it('observes two frozen sources even after the picker selects a third source',async()=>{
  const engine=observer(),dataset=data([9,9]);const first=await engine.observe(input(dataset,close),now);let a=process(alert(first,'price'),first);
  const second=await engine.observe(input(dataset,sma(),[a]),now+1);let b=process(alert(second,'sma'),second);
  const third=await engine.observe(input(data([9,9,13]),{kind:'price',field:'low',transformId:'standard'},[a,b]),now+2);
  a=process(a,third);b=process(b,third);expect(a.history[0].value).toBe(13);expect(b.history[0].value).toBe(11);expect(third.contexts).toHaveLength(3);
 });
 it('clears an earlier seed correction even when the last source row and revision are unchanged',async()=>{
  const engine=observer(),first=await engine.observe(input(data([9,9]),sma()),now);let current=process(alert(first),first);
  const second=await engine.observe(input(data([13,9]),sma(),[current]),now+1);expect(second.selectedEvent?.value).toBe(11);expect(second.selectedEvent?.observation?.correction).toBe(true);
  current=process(current,second);expect(current.history).toEqual([]);
 });
 it('heartbeats do not invent events and prevent a false sleep gap before a valid append',async()=>{
  const engine=observer(),dataset=data([9]),first=await engine.observe(input(dataset),now);let current=process(alert(first),first);
  for(let seconds=10;seconds<=90;seconds+=10){const view=await engine.observe(input(dataset,close,[current]),now+seconds);expect(view.events).toEqual([]);}
  const appended=await engine.observe(input(data([9,11]),close,[current]),now+91);expect(appended.selectedEvent?.observation?.continuity).toBe('continuous');expect(process(current,appended).history).toHaveLength(1);
 });
 it('waiting briefly for a renderer prefix commit cancels queued work without inventing a data gap',async()=>{
  const engine=observer(),first=await engine.observe(input(data([9])),now),current=process(alert(first),first);
  engine.cancelPending();const ready=await engine.observe(input(data([9,11]),close,[current]),now+1);
  expect(ready.selectedEvent?.observation?.continuity).toBe('continuous');expect(process(current,ready).history).toHaveLength(1);
 });
 it('cancels an obsolete yielded batch without publishing or consuming session identity',async()=>{
  let release!:()=>void,id=0;const engine=new TechnicalAlertObserver(()=>String(++id),()=>new Promise(resolve=>{release=resolve;}));
  const pending=engine.observe(input(data([9])),now);await Promise.resolve();engine.reset();release();expect((await pending).cancelled).toBe(true);expect(id).toBe(0);
 });
 it('isolates replay seeks and discloses unknown ordinary completion',async()=>{
  const engine=observer(),dataset=data([9,11]),firstInput={...input(dataset),replay:{runId:'replay-a',cursor:1},assumeReplayCompletion:true};
  const first=await engine.observe(firstInput,now);const current=alert(first);expect(first.selectedEvent?.barClosed).toBe(true);
  const sought=await engine.observe({...firstInput,bars:dataset.bars.slice(0,1),replay:{runId:'replay-b',cursor:0},alerts:[current]},now+1);
  expect(sought.inactiveAlertIds).toContain(current.definition.id);expect(sought.selectedContext?.runId).not.toBe(first.selectedContext?.runId);
  const ordinary=await engine.observe(input(dataset),now+2);expect(ordinary.selectedEvent?.barClosed).toBe(false);expect(ordinary.selectedEvent?.observation?.sourceAvailableAt).toBeNull();
 });
});
