import {expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {BarDataset} from '../../src/domain/types';
import {captureIndicatorAlertSource,evaluateTechnicalAlertSources,technicalSourceKey} from '../../src/domain/technical-alerts';
import {TechnicalAlertObserver,type TechnicalAlertInput,type TechnicalAlertView} from '../../src/ui/technical-alert-observer';
import {alertDatasetKey,type AlertSourceSnapshot} from '../../src/domain/alert-observation';
import {captureDrawingBoundary} from '../../src/chart/drawing-alert-geometry';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {createLocalAlert,processAlertEvent,processLocalAlertBatch,advanceLocalAlertClock,validateLocalAlerts,type LocalAlert,type AlertCondition,type AlertFrequency} from '../../src/domain/alerts';

const day=1704153600,now=1791936000;
const close:AlertSourceSnapshot={kind:'price',field:'close',transformId:'standard'};
const dataset=(values:number[]):BarDataset=>{const base=fixtureDataset('GME',5);return {...base,bars:values.map((value,index)=>({time:day+index*86400,open:value,high:value+1,low:Math.max(.01,value-1),close:value,volume:100}))};};
const input=(data:BarDataset,source:AlertSourceSnapshot=close,alerts:LocalAlert[]=[]):TechnicalAlertInput=>({dataset:data,bars:data.bars,chartId:'review-chart',replay:null,assumeReplayCompletion:false,selectedSource:source,alerts});
const engine=()=>{let i=0;return new TechnicalAlertObserver(()=> 'review-session-'+ ++i,()=>Promise.resolve());};
const sma=()=>captureIndicatorAlertSource({id:'original-sma',kind:'sma',inputs:{length:2,source:'close'},plots:{},offset:100,visible:false},'sma','standard','original-snapshot');
function makeAlert(view:TechnicalAlertView,condition:AlertCondition={kind:'crossing-up',value:10},frequency:AlertFrequency='every-time',expiresAt:number|null=null):LocalAlert{
 const c=view.selectedContext!;return createLocalAlert({id:'review-alert',name:'Original synthetic test',message:'Synthetic observations only',instrumentId:c.instrumentId,sourceId:c.sourceId,mode:c.mode,runId:c.runId,observationBinding:c.binding,conditionVersion:2,condition,frequency,createdAt:view.now,expiresAt});
}
const consume=(alert:LocalAlert,view:TechnicalAlertView)=>view.events.reduce((state,event)=>processAlertEvent(state,event).alert,alert);

it('the actual observer identity path never reads the hidden complete future dataset behind a replay prefix',async()=>{
 const data=dataset([2,4,100000]),prefix=data.bars.slice(0,2);let futureReads=0;
 Object.defineProperty(data.bars,'2',{enumerable:true,get(){futureReads++;throw new Error('Forbidden future data read');}});
 const view=await engine().observe({...input(data,sma()),bars:prefix,replay:{runId:'original-replay',cursor:1},assumeReplayCompletion:true},now);
 expect(futureReads).toBe(0);expect(view.selectedEvent?.value).toBe(3);expect(view.selectedEvent?.observation?.informationBars).toBe(2);expect(view.selectedEvent?.observation?.informationEndTime).toBe(day+86400);
});

it('saved required fields cannot silently disappear after a non-enumerable field passes validation',async()=>{
 const view=await engine().observe(input(dataset([9])),now),saved=consume(makeAlert(view),view);
 Object.defineProperty(saved.definition,'name',{value:'Original synthetic test',enumerable:false});expect(validateLocalAlerts([saved]).ok).toBe(false);
});

it('frozen mixed-unit operands remain explicitly labeled and unavailable values never become zero',async()=>{
 const volume=captureIndicatorAlertSource({id:'original-volume',kind:'volume',inputs:{length:2},plots:{},offset:0,visible:true},'volume','standard','volume-snapshot');
 const source:AlertSourceSnapshot={kind:'comparison',snapshotId:'original-comparison',left:sma(),right:volume};
 const prefix=dataset([2,4]).bars,result=await evaluateTechnicalAlertSources(prefix,[source],'USD'),sample=result.results.get(technicalSourceKey(source))!.sample;
 expect(sample.value).toBe(-97);expect(sample.operands).toMatchObject({left:{value:3,unit:'USD'},right:{value:100,unit:'source volume units'}});
 const missing=prefix.map(bar=>({...bar,volume:NaN})),unavailable=(await evaluateTechnicalAlertSources(missing,[source],'USD')).results.get(technicalSourceKey(source))!;
 expect(unavailable.sample.value).toBeNull();expect(unavailable.sample.operands?.left.value).toBe(3);expect(unavailable.sample.operands?.right?.value).toBeNull();expect(unavailable.diagnostics.join(' ')).toContain('volume');
});

it('ordinary completion waits while replay opts into completed observations and close frequency',async()=>{
 const ordinary=engine(),first=await ordinary.observe(input(dataset([9])),now);let waiting=consume(makeAlert(first,undefined,'once-per-bar-close'),first);
 const second=await ordinary.observe(input(dataset([9,11]),close,[waiting]),now+1);waiting=consume(waiting,second);expect(waiting.history).toEqual([]);expect(waiting.closedBars).toEqual([]);expect(second.selectedEvent?.observation?.completion).toBe('unknown');
 const replay=engine(),data=dataset([9,11]),base={...input(data),bars:data.bars.slice(0,1),replay:{runId:'replay-original',cursor:0},assumeReplayCompletion:true};const completed=await replay.observe(base,now);let alert=consume(makeAlert(completed,undefined,'once-per-bar-close'),completed);
 const next=await replay.observe({...base,bars:data.bars,replay:{runId:'replay-original',cursor:1},alerts:[alert]},now+1);alert=consume(alert,next);expect(alert.history).toHaveLength(1);expect(alert.history[0].value).toBe(11);expect(alert.history[0].observation?.completion).toBe('simulated-complete');
});

it('corrections, unusable data and resume clear crossing history rather than reconstructing a tick',async()=>{
 const observer=engine(),first=await observer.observe(input(dataset([9,9]),sma()),now);let alert=consume(makeAlert(first),first);
 const corrected=await observer.observe(input(dataset([13,9]),sma(),[alert]),now+1);alert=consume(alert,corrected);expect(corrected.selectedEvent?.value).toBe(11);expect(corrected.selectedEvent?.observation?.correction).toBe(true);expect(alert.history).toEqual([]);
 const broken=dataset([13,9]);broken.provenance.state='disconnected';const unavailable=await observer.observe(input(broken,sma(),[alert]),now+2);alert=consume(alert,unavailable);expect(alert.status).toBe('waiting-for-data');expect(alert.lastValue).toBeNull();
 const resumed=await observer.observe(input(dataset([13,9,15]),sma(),[alert]),now+3);alert=consume(alert,resumed);expect(alert.history).toEqual([]);expect(alert.lastValue).toBe(12);
});

it('local minute throttling and inactive expiration use observation time, not historical row time',async()=>{
 const observer=engine(),data=dataset([11]),first=await observer.observe(input(data),now);let alert=consume(makeAlert(first,{kind:'greater',value:10},'once-per-minute',now+120),first);expect(alert.history).toHaveLength(1);
 for(const offset of [1,59]){const next=await observer.observe(input(data,close,[alert]),now+offset,'explicit-evaluation');alert=consume(alert,next);expect(alert.history).toHaveLength(1);}
 const minute=await observer.observe(input(data,close,[alert]),now+60,'explicit-evaluation');alert=consume(alert,minute);expect(alert.history).toHaveLength(2);expect(alert.history[1].at).toBe(now+60);expect(alert.history[1].observation?.sourceTime).toBe(day);
 const other=dataset([11]);other.instrument={...other.instrument,exchange:'OTHER'};const retired=await observer.observe(input(other,close,[alert]),now+120);expect(retired.inactiveAlertIds).toContain(alert.definition.id);expect(advanceLocalAlertClock(alert,now+120).status).toBe('expired');expect(alert.history).toHaveLength(2);
});

it('changing the draft source preserves eligible frozen sources and retirement blocks their old bindings',async()=>{
 const observer=engine(),original=dataset([4,4]),first=await observer.observe(input(original),now);let price=consume(makeAlert(first,{kind:'crossing-up',value:5}),first);
 const second=await observer.observe(input(original,sma(),[price]),now+1);let average=consume(createLocalAlert({...makeAlert(second,{kind:'crossing-up',value:5}).definition,id:'review-sma'}),second);
 const low:AlertSourceSnapshot={kind:'price',field:'low',transformId:'standard'},third=await observer.observe(input(dataset([4,4,8]),low,[price,average]),now+2);price=consume(price,third);average=consume(average,third);
 expect(price.history.map(row=>row.value)).toEqual([8]);expect(average.history.map(row=>row.value)).toEqual([6]);expect(third.selectedEvent?.value).toBe(7);expect(third.inactiveAlertIds).toEqual([]);
 const changed=dataset([4,4,8]);changed.provenance.coverage='different supplied coverage';const retired=await observer.observe(input(changed,low,[price,average]),now+3);expect(retired.inactiveAlertIds.sort()).toEqual(['review-alert','review-sma']);
 expect(consume(price,retired).history).toEqual(price.history);expect(consume(average,retired).history).toEqual(average.history);
});

it('an obsolete yielded batch publishes no partial results and creates no runtime session',async()=>{
 let release!:()=>void,identities=0;const observer=new TechnicalAlertObserver(()=> 'allocated-'+ ++identities,()=>new Promise<void>(done=>release=done));
 const pending=observer.observe(input(dataset([9]),sma()),now);await Promise.resolve();observer.invalidate();release();const view=await pending;
 expect(view.cancelled).toBe(true);expect(view.events).toEqual([]);expect(view.contexts).toEqual([]);expect(identities).toBe(0);
});

it('saved comparison histories reject altered operands, source binding, chronology and unsupported semantics',async()=>{
 const data=dataset([11]);data.bars[0].open=10;const source:AlertSourceSnapshot={kind:'comparison',snapshotId:'compare',left:close,right:{kind:'price',field:'open',transformId:'standard'}},view=await engine().observe(input(data,source),now),saved=consume(makeAlert(view,{kind:'greater',value:0}),view);expect(saved.history).toHaveLength(1);expect(validateLocalAlerts([saved]).ok).toBe(true);
 const variants=[(copy:LocalAlert)=>{copy.history[0].observation!.operands!.right!.value=5;},(copy:LocalAlert)=>{copy.definition.observationBinding!.chartId='other-chart';},(copy:LocalAlert)=>{copy.lastTime=now-1;},(copy:LocalAlert)=>{(copy.definition as any).conditionVersion=3;}];
 for(const mutate of variants){const copy=structuredClone(saved);mutate(copy);expect(validateLocalAlerts([copy]).ok).toBe(false);}
 let accessed=0;const getter=structuredClone(saved);Object.defineProperty(getter.definition.condition,'value',{get(){accessed++;return 0;}});expect(validateLocalAlerts([getter]).ok).toBe(false);expect(accessed).toBe(0);
});

it('retired unbound selections release their stream while an active frozen alert keeps its exact runtime session',async()=>{
 const observer=engine(),data=dataset([4,4]),first=await observer.observe(input(data),now),price=consume(makeAlert(first,{kind:'crossing-up',value:5}),first);
 const selectedSma=await observer.observe(input(data,sma(),[price]),now+1),oldSession=selectedSma.selectedContext!.binding.sessionId;
 await observer.observe(input(data,{kind:'price',field:'low',transformId:'standard'},[price]),now+2);
 expect(observer.currentContext(sma(),data)).toBeNull();expect(observer.currentContext(close,data)?.binding).toEqual(price.definition.observationBinding);
 const selectedAgain=await observer.observe(input(data,sma(),[price]),now+3);expect(selectedAgain.selectedContext?.binding.sessionId).not.toBe(oldSession);
});

it('an exhausted whole-batch save budget pauses without dropping prior history or publishing a partial batch',()=>{
 const definition={id:'budget-original',name:'Original synthetic quota',message:'Synthetic '.padEnd(4000,'x'),instrumentId:'SYNTHETIC:GME',sourceId:'price:close',mode:'ordinary' as const,runId:'synthetic-budget',conditionVersion:2 as const,condition:{kind:'greater' as const,value:10},frequency:'every-time' as const,createdAt:now,expiresAt:null};
 const firstEvent={instrumentId:definition.instrumentId,sourceId:definition.sourceId,mode:definition.mode,runId:definition.runId,value:11,time:now,availableAt:now,sequence:1,barId:'synthetic-first',barClosed:false,feedState:'ready' as const};
 const saved=processAlertEvent(createLocalAlert(definition),firstEvent).alert as LocalAlert&{retainedOpaque:string[]};
 const expired=createLocalAlert({...definition,id:'expiry-original',expiresAt:now+1});
 saved.retainedOpaque=Array(209).fill('x'.repeat(100000));const target=20*1024*1024-3000,already=new TextEncoder().encode(JSON.stringify([saved,expired])).length;saved.retainedOpaque.push('x'.repeat(target-already-3));
 expect(new TextEncoder().encode(JSON.stringify([saved,expired])).length).toBe(target);expect(validateLocalAlerts([saved,expired]).ok).toBe(true);
 const result=processLocalAlertBatch([saved,expired],[{...firstEvent,time:now+1,availableAt:now+1,sequence:2,barId:'synthetic-next'}],now+1);
 expect(result.alerts[0].status).toBe('paused');expect(result.alerts[0].history).toEqual(saved.history);expect(result.alerts[1].status).toBe('expired');expect(result.alerts[1].history).toEqual([]);expect(result.diagnostics.join(' ')).toContain('History is unchanged');expect(saved.status).toBe('active');expect(saved.history).toHaveLength(1);
});

it('frozen drawing comparison uses logical row spacing across irregular gaps and never silently follows later edits',async()=>{
 const data=dataset([100,100,119]);data.bars.forEach((bar,i)=>bar.time=day+[0,60,240][i]);
 const record={id:'original-line',type:'trendline',paneId:'price',anchors:[{time:day*1000,price:100},{time:(day+240)*1000,price:120}],style:{extendRight:true}};
 const captured=captureDrawingBoundary(record,data.bars,{source:sourceContextForDataset(data),style:'candles',scale:'linear'});if(!captured.ok)throw new Error(captured.diagnostics.join(' '));
 const boundary:AlertSourceSnapshot={kind:'drawing-boundary',instanceId:record.id,snapshotId:'original-geometry',geometry:captured.snapshot,mutationPolicy:'frozen'},source:AlertSourceSnapshot={kind:'comparison',snapshotId:'original-line-comparison',left:close,right:boundary};
 const observer=engine(),first=await observer.observe(input(data,source),now);let alert=consume(makeAlert(first,{kind:'crossing-up',value:0}),first);expect(first.selectedEvent?.value).toBe(-1);
 record.anchors[1].price=999;const appended={...data,bars:[...data.bars,{time:day+10000,open:140,high:141,low:139,close:140,volume:100}]};
 const next=await observer.observe(input(appended,source,[alert]),now+1);alert=consume(alert,next);expect(alert.history).toHaveLength(1);expect(alert.history[0].value).toBe(10);expect(alert.history[0].observation?.operands).toMatchObject({left:{value:140},right:{value:130}});
 const movedGrid={...appended,bars:[data.bars[0],{...data.bars[1],time:day+30},...appended.bars.slice(1)]};
 const unavailable=(await evaluateTechnicalAlertSources(movedGrid.bars,[source],'USD',{sourceBasis:alertDatasetKey(data,2),sourceRevision:data.provenance.revision})).results.get(technicalSourceKey(source))!;expect(unavailable.sample.value).toBeNull();expect(unavailable.diagnostics.join(' ')).toContain('grid changed');
});
