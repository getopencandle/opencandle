import {afterEach,expect,it,vi} from 'vitest';
import {nyseAlertFixture,alertFromView,applyView} from '../fixtures/nyse-mtf-alert-fixture';
import {publishedSource,response,fridayMonday,syntheticSession,flushMtf,unix} from '../fixtures/qualified-nyse-mtf-source';
import {TechnicalAlertObserver} from '../../src/ui/technical-alert-observer';
import {BackgroundAlertWatcher} from '../../src/ui/background-alert-watcher';
import {planBackgroundAlertFeeds} from '../../src/ui/background-alert-plan';
import {createLocalAlert,processAlertEvent,setLocalAlertPaused,validateLocalAlerts,type LocalAlert} from '../../src/domain/alerts';
import {validateAlertBinding,alertDatasetKey,alertSourceDatasetKey,createAlertObservationSession,alertObservationContext,type AlertSourceSnapshot} from '../../src/domain/alert-observation';
import type {LiveHandle} from '../../src/domain/live-provider';
import {cellSessionDataset} from '../../src/chart/cell-session';
import type {AlertPositionLevels} from '../../src/domain/alert-position';
import {nyseAlertRetainedUsage,type NyseMtfAlertEvaluator} from '../../src/domain/nyse-mtf-alert-source';
import {captureIndicatorAlertSource,captureNyseIndicatorAlertSource} from '../../src/domain/technical-alerts';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
const owned:{dispose():void}[]=[];afterEach(()=>{const errors:unknown[]=[];for(const item of owned.splice(0).reverse())try{item.dispose();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'SYNTHETIC daily alert workflow cleanup failed.');});
async function setup(options:Parameters<typeof nyseAlertFixture>[0]={},wait=true){const f=await nyseAlertFixture(options,wait);owned.push(f);return f;}
const NOW=unix('2024-03-11T20:00:05Z');

it('captures actual applied settings from the UI catalog and evaluates literal120 without a native-value shortcut',async()=>{
 const f=await setup(),choice=f.choice();expect(f.native.port.values(f.id).series[0].values.at(-1)).toBe(120);expect(choice.source).not.toBeNull();expect(choice.disabledReason).toBeUndefined();expect(choice.constantOnly).toBe(true);
 const view=await f.observe();expect(view.selectedEvent?.value).toBe(120);expect(view.selectedEvent?.barClosed).toBe(true);expect(view.selectedEvent?.observation?.completion).toBe('observed-closed');expect(view.selectedContext?.binding.calculationVersion).toBe('lv-nyse-daily-1');
 expect(view.selectedEvent?.barId).toBe('nyse:1D:1710163800:ordinary');expect(view.selectedContext?.binding.source).toEqual(choice.source);expect(view.diagnostics).toEqual([]);
});

it('keeps constant-only source capture explicit and refuses a silently substituted right operand',async()=>{
 const f=await setup(),daily=f.choice().source!,price=f.choices().find(row=>row.id==='price:close:chart')!.source!;
 expect(()=>f.catalog.expression(daily,price)).toThrow('constant only');expect(()=>f.catalog.expression(price,daily)).toThrow('constant only');expect(f.catalog.expression(daily,null)).toBe(daily);
});

it('records one genuine close per target daily session and keeps repeated same-target observations quiet',async()=>{
 const f=await setup(),first=await f.observe();let alert=applyView(alertFromView(first),first);expect(alert.history).toHaveLength(1);expect(alert.history[0].value).toBe(120);
 const second=await f.observe([alert],NOW+1);alert=applyView(alert,second);expect(second.events).toEqual([]);expect(alert.history).toHaveLength(1);expect(alert.closedBars.at(-1)?.value).toBe(120);
 expect(f.observer.currentContext(f.choice().source!,f.producer.regular())).not.toBeNull();
});

it('does not let the chart-bar timer certify a selected daily close',async()=>{
 const f=await setup({now:unix('2024-03-11T19:59:59Z')}),view=await f.observer.observe({...f.input(),barClosed:true},NOW);
 expect(view.events).toEqual([]);expect(view.selectedContext).toBeNull();expect(view.selectedEvent).toBeNull();
});

it('treats developing values as unknown completion even if the ordinary replay checkbox is supplied',async()=>{
 const f=await setup({now:unix('2024-03-11T19:59:59Z')},false),view=await f.observer.observe({...f.input(),assumeReplayCompletion:true},NOW);
 expect(view.selectedEvent?.value).toBe(120);expect(view.selectedEvent?.barClosed).toBe(false);expect(view.selectedEvent?.observation?.completion).toBe('unknown');
 let alert=applyView(alertFromView(view),view);expect(alert.history).toEqual([]);expect(alert.previousClosedValue).toBeNull();
});

it('retires a save context after actual producer replacement while retaining descriptive settings',async()=>{
 const f=await setup(),view=await f.observe(),source=f.choice().source!,saved=alertFromView(view);expect(f.observer.currentContext(source,f.producer.regular())).not.toBeNull();
 f.producer.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:unix('2024-03-11T19:59:30Z'),price:140,high:140,low:140,size:1}],receivedAt:''});await flushMtf();
 expect(f.observer.currentContext(source,f.producer.regular())).toBeNull();expect(()=>validateAlertBinding(saved.definition.observationBinding)).not.toThrow();
 await f.native.apply(f.producer.regular());await flushMtf();const fresh=await f.observe([saved],NOW+1);expect(fresh.selectedContext).not.toBeNull();expect(fresh.selectedEvent?.value).toBe(125);expect(fresh.selectedEvent?.observation?.correction).toBe(true);expect(fresh.selectedEvent?.barId).toBe('nyse:1D:1710163800:ordinary');expect(fresh.diagnostics.join(' ')).toContain('Source correction observed');
});

it('saves and restores only settings while a fresh genuine background observer reacquires completion',async()=>{
 const f=await setup(),view=await f.observe(),original=alertFromView(view),saved=JSON.parse(JSON.stringify([original])) as LocalAlert[];expect(validateLocalAlerts(saved).ok).toBe(true);
 const serialized=JSON.stringify(saved[0].definition.observationBinding);expect(serialized).not.toMatch(/coveredThrough|closedThrough|observationToken|WeakRef/);f.observer.reset();
 const producer=await publishedSource();owned.push(producer);let alerts=saved,serial=0,opened=0,published=0;
 const watcher=new BackgroundAlertWatcher({open:feed=>{expect(feed.family).toBe('nyse-daily');opened++;return producer.handle;},alerts:()=>alerts,publish:(next,expected)=>{expect(expected).toBe(alerts);published++;alerts=next;return true;},now:()=>NOW,identity:()=>`synthetic-background-${++serial}`,openAlpacaSymbols:()=>new Set()});owned.push(watcher);
 const plan=watcher.sync('US:SPY','live:alpaca-iex:SPY:30m','30m');expect(plan.feeds).toHaveLength(1);await watcher.settled();
 expect(opened).toBe(1);expect(published).toBe(1);expect(alerts[0].history).toHaveLength(1);expect(alerts[0].history[0].value).toBe(120);expect(alerts[0].lastObservation?.completion).toBe('observed-closed');
});

it('assigns one publisher to the exact saved feed and opens the frozen interval when the active interval differs',async()=>{
 const f=await setup(),saved=alertFromView(await f.observe()),dataset=f.producer.regular(),base={alerts:[saved],activeInstrumentId:dataset.instrument.id,openAlpacaSymbols:new Set<string>()};
 expect(planBackgroundAlertFeeds({...base,activeDatasetId:dataset.provenance.datasetId,activeResolution:'30m'}).feeds).toEqual([]);
 const different=planBackgroundAlertFeeds({...base,activeDatasetId:dataset.provenance.datasetId.replace(':30m',':1h'),activeResolution:'1h'});expect(different.feeds).toHaveLength(1);expect(different.feeds[0].resolution).toBe('30m');expect(different.feeds[0].family).toBe('nyse-daily');
 const unknown=planBackgroundAlertFeeds(base);expect(unknown.feeds).toEqual([]);expect(unknown.skipped[0].reason).toContain('The active data source is not identified');
});

it('rolls back a refused background publication and offers the same genuine target on the next producer update',async()=>{
 const f=await setup(),saved=alertFromView(await f.observe()),producer=await publishedSource();owned.push(producer);let alerts=[saved],refuse=true,attempts=0,serial=0;
 const watcher=new BackgroundAlertWatcher({open:()=>producer.handle,alerts:()=>alerts,publish:next=>{attempts++;if(refuse)return false;alerts=next;return true;},now:()=>NOW,identity:()=>`synthetic-retry-${++serial}`,openAlpacaSymbols:()=>new Set()});owned.push(watcher);watcher.sync('US:SPY','live:alpaca-iex:SPY:30m','30m');await watcher.settled();expect(attempts).toBe(1);expect(alerts[0].history).toHaveLength(0);
 refuse=false;producer.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:unix('2024-03-11T19:59:30Z'),price:130,high:130,low:130,size:1}],receivedAt:''});await flushMtf();await watcher.settled();expect(alerts[0].history).toHaveLength(1);expect(alerts[0].history[0].value).toBe(120);
});

it('retires the exact background owner before a throwing unsubscribe and still closes its genuine feed',async()=>{
 const f=await setup(),saved=alertFromView(await f.observe()),producer=await publishedSource();owned.push(producer);let offCalls=0,closeCalls=0,serial=0;
 const handle:LiveHandle={...producer.handle,onChange(listener){const off=producer.handle.onChange(listener);return()=>{off();offCalls++;throw 0;};},close(){closeCalls++;producer.handle.close();}};
 const watcher=new BackgroundAlertWatcher({open:()=>handle,alerts:()=>[saved],publish:()=>true,now:()=>NOW,identity:()=>`synthetic-cleanup-${++serial}`,openAlpacaSymbols:()=>new Set()});watcher.sync('US:SPY','live:alpaca-iex:SPY:30m','30m');await watcher.settled();let failed=false,error:unknown;try{watcher.dispose();}catch(cause){failed=true;error=cause;}expect(failed).toBe(true);expect(error).toBe(0);expect(offCalls).toBe(1);expect(closeCalls).toBe(1);expect(watcher.sync('US:SPY').feeds).toEqual([]);watcher.dispose();expect(closeCalls).toBe(1);
});

it('does not publish a late background result after ownership hands back to the active exact feed',async()=>{
 const f=await setup(),saved=alertFromView(await f.observe()),producer=await publishedSource();owned.push(producer);let publications=0,serial=0;
 const watcher=new BackgroundAlertWatcher({open:()=>producer.handle,alerts:()=>[saved],publish:()=>{publications++;return true;},now:()=>NOW,identity:()=>`synthetic-late-${++serial}`,openAlpacaSymbols:()=>new Set()});owned.push(watcher);watcher.sync('US:SPY','live:alpaca-iex:SPY:30m','30m');const dataset=producer.handle.dataset();watcher.sync(dataset.instrument.id,dataset.provenance.datasetId,'30m');await watcher.settled();await flushMtf();expect(publications).toBe(0);
});

it('keeps the previous confirmed daily baseline across multiple developing observations when waiting is off',async()=>{
 const f=await setup({now:unix('2024-03-08T21:00:00Z')},false);f.native.port.update(f.id,{inputs:{length:1}});await flushMtf();const source=f.choice().source!;
 const first=await f.observer.observe(f.input(source),unix('2024-03-08T21:00:05Z'));expect(first.selectedEvent?.value).toBe(110);expect(first.selectedEvent?.barClosed).toBe(true);
 let alert=applyView(alertFromView(first,{kind:'crossing-up',level:120}),first);expect(alert.closedBars.at(-1)?.value).toBe(110);expect(alert.history).toEqual([]);
 const open=unix('2024-03-11T13:30:00Z');f.producer.setNow(open+1);f.producer.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:open,price:130,high:130,low:130,size:1}],receivedAt:''});await flushMtf();const opening=await f.observer.observe(f.input(source,[alert]),open+1);expect(opening.selectedEvent?.observation?.continuity).toBe('continuous');alert=applyView(alert,opening);expect(alert.previousClosedValue).toBe(110);
 for(const [time,price]of [[unix('2024-03-11T13:31:00Z'),130],[unix('2024-03-11T13:32:00Z'),140]]){
  f.producer.setNow(time+1);f.producer.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time,price,high:price,low:price,size:1}],receivedAt:''});await flushMtf();
  const developing=await f.observer.observe(f.input(source,[alert]),time+1);expect(developing.selectedEvent?.value).toBe(price);expect(developing.selectedEvent?.barClosed).toBe(false);alert=applyView(alert,developing);expect(alert.previousClosedValue).toBe(110);expect(alert.history).toEqual([]);
 }
});

it('rechecks exact background ownership after the actual alert-collection callback reenters handoff',async()=>{
 const f=await setup(),saved=alertFromView(await f.observe()),producer=await publishedSource();owned.push(producer);let publications=0,serial=0,armed=false;
 const watcher=new BackgroundAlertWatcher({open:()=>producer.handle,alerts:()=>{if(armed){armed=false;const current=producer.handle.dataset();watcher.sync(current.instrument.id,current.provenance.datasetId,'30m');}return[saved];},publish:()=>{publications++;return true;},now:()=>NOW,identity:()=>`synthetic-handoff-${++serial}`,openAlpacaSymbols:()=>new Set()});owned.push(watcher);
 watcher.sync('US:SPY','live:alpaca-iex:SPY:30m','30m');armed=true;await watcher.settled();await flushMtf();expect(publications).toBe(0);
});

it('canonicalizes only the declared regular calculation slot and never grants copied source permission',async()=>{
 const f=await setup(),source=f.choice().source!,regular=f.producer.regular(),raw=f.producer.raw(),actual=JSON.parse(alertDatasetKey(regular,2)),calculated=JSON.parse(alertSourceDatasetKey(regular,source,2));
 expect(actual).toHaveLength(18);expect(calculated).toHaveLength(18);expect(calculated[12]).toBe('nyse-regular');for(let i=0;i<18;i++)if(i!==12)expect(calculated[i]).toEqual(actual[i]);expect(alertSourceDatasetKey(raw,source,2)).toBe(alertSourceDatasetKey(regular,source,2));expect(raw.provenance.session).toBe('unknown');
 const view=await f.observe(),alert=alertFromView(view),observer=new TechnicalAlertObserver(()=> 'synthetic-copied-context',()=>Promise.resolve());owned.push(observer);const copied={...raw};expect(alertSourceDatasetKey(copied,source,2)).toBe(alert.definition.observationBinding!.datasetKey);
 const refused=await observer.observe({dataset:copied,bars:copied.bars,chartId:'background',replay:null,assumeReplayCompletion:false,selectedSource:null,alerts:[alert],adopt:true},NOW+1);expect(refused.events).toEqual([]);expect(refused.selectedEvent).toBeNull();expect(refused.diagnostics.join(' ')).toContain('genuine');
});

it('preserves the frozen daily session across actual Regular and Extended display changes with fresh proof',async()=>{
 const f=await setup(),source=f.choice().source!,first=await f.observe(),alert=applyView(alertFromView(first),first),binding=first.selectedContext!.binding;
 const extended=cellSessionDataset(f.producer.raw(),{session:'extended'});await f.native.apply(extended);await flushMtf();
 const second=await f.observer.observe({...f.input(source,[alert]),dataset:extended,bars:extended.bars},NOW+1);expect(second.events).toEqual([]);expect(second.selectedContext!.binding).toEqual(binding);expect(second.selectedContext!.completion).toBe('observed-closed');
 await f.native.apply(f.producer.regular());await flushMtf();const third=await f.observer.observe(f.input(source,[alert]),NOW+2);expect(third.events).toEqual([]);expect(third.selectedContext!.binding).toEqual(binding);expect(f.observer.currentContext(source,f.producer.regular())).not.toBeNull();
});

it('retains real feed, adjustment and base-interval mismatches despite the calculation-only session marker',async()=>{
 const f=await setup(),saved=alertFromView(await f.observe()),source=f.choice().source!,free=await publishedSource({plan:'free',reply:request=>Promise.resolve(request.feed==='sip'?{ok:false,error:{code:'DATA',message:'SYNTHETIC SIP unavailable'}}:response(request,fridayMonday()))}),interval=await publishedSource({resolution:'15m'});owned.push(free,interval);
 f.producer.provider.setDividendAdjustment(true);await flushMtf();
 for(const dataset of [free.raw(),interval.raw(),f.producer.raw()]){expect(alertSourceDatasetKey(dataset,source,2)).not.toBe(saved.definition.observationBinding!.datasetKey);const observer=new TechnicalAlertObserver(()=> 'synthetic-wrong-family',()=>Promise.resolve());owned.push(observer);const view=await observer.observe({dataset,bars:dataset.bars,chartId:'background',replay:null,assumeReplayCompletion:false,selectedSource:null,alerts:[saved],adopt:true},NOW+1);expect(view.events).toEqual([]);expect(view.inactiveAlertIds).toEqual([saved.definition.id]);}
});

async function corrected(){
 const f=await setup(),before=await f.observe();f.producer.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:unix('2024-03-11T19:59:30Z'),price:140,high:140,low:140,size:1}],receivedAt:''});await flushMtf();await f.native.apply(f.producer.regular());await flushMtf();const after=await f.observe([],NOW+1),event=after.selectedEvent!;expect(event.value).toBe(125);expect(event.observation?.correction).toBe(true);return{before,event};
}

it('updates a corrected daily scalar and baseline without notifying a real greater-than every-time alert',async()=>{
 const {before,event}=await corrected(),original=applyView(alertFromView(before,{frequency:'every-time',level:124}),before),result=processAlertEvent(original,event);
 expect(original.lastValue).toBe(120);expect(result.notification).toBeNull();expect(result.alert.history).toEqual([]);expect(result.alert.lastValue).toBe(125);expect(result.alert.closedBars).toEqual([{id:event.barId,value:125}]);expect(result.alert.previousClosedValue).toBeNull();expect(result.alert.lastSequence).toBe(event.sequence);expect(validateLocalAlerts([result.alert]).ok).toBe(true);
});

it('does not infer a crossing from a real completed daily correction from120 to125',async()=>{
 const {before,event}=await corrected(),original=applyView(alertFromView(before,{frequency:'every-time',kind:'crossing-up',level:124}),before),result=processAlertEvent(original,event);
 expect(result.notification).toBeNull();expect(result.alert.history).toEqual([]);expect(result.alert.lastValue).toBe(125);expect(result.alert.previousClosedValue).toBeNull();expect(result.diagnostics.join(' ')).toContain('no market tick');
});

it('keeps indicator-position definitions refused and cannot advance a malformed in-memory phase from correction',async()=>{
 const {before,event}=await corrected(),base=applyView(alertFromView(before,{frequency:'every-time',level:124}),before);
 for(const phase of ['waiting-entry','entered'] as const){const position:AlertPositionLevels={schemaVersion:1,drawingId:'synthetic-unsupported-position',side:'long',entry:phase==='entered'?115:124,target:phase==='entered'?124:130,stop:100,quantity:1,ticker:'GME',currency:'USD'},definition={...base.definition,condition:{kind:'position' as const,position}};expect(()=>createLocalAlert(definition)).toThrow('Position alerts use one price condition');
  const malformed:LocalAlert={...structuredClone(base),definition,positionPhase:phase};expect(validateLocalAlerts([malformed]).ok).toBe(false);const result=processAlertEvent(malformed,event);expect(result.notification).toBeNull();expect(result.alert.history).toEqual([]);expect(result.alert.positionPhase).toBe(phase);expect(result.alert.lastValue).toBe(125);
 }
});

it('retires superseded checkpoint graphs before freeing their packet and never lets late A restore B',async()=>{
 const f=await setup(),source=f.choice().source!,a=await f.observer.observeForPublication(f.input(source),NOW),b=await f.observer.observeForPublication(f.input(source),NOW+1);expect(a.view.selectedEvent?.value).toBe(120);expect(b.view.selectedEvent?.value).toBe(120);expect(a.rollback()).toBe(false);
 const alert=applyView(alertFromView(b.view),b.view);b.commit();const c=await f.observer.observeForPublication(f.input(source,[alert]),NOW+2);expect(c.view.events).toEqual([]);expect(c.rollback()).toBe(true);expect(f.observer.currentContext(source,f.producer.regular())).toBeNull();
 const fresh=await f.observer.observeForPublication(f.input(source,[alert]),NOW+3);expect(fresh.view.events).toEqual([]);expect(f.observer.currentContext(source,f.producer.regular())).not.toBeNull();fresh.commit();
 const evaluator=(f.observer as unknown as {timeframeEvaluator:NyseMtfAlertEvaluator}).timeframeEvaluator;expect(nyseAlertRetainedUsage(evaluator).slots).toBeGreaterThan(0);f.observer.reset();expect(nyseAlertRetainedUsage(evaluator)).toEqual({work:0,slots:0});a.commit();expect(nyseAlertRetainedUsage(evaluator)).toEqual({work:0,slots:0});
});

it('releases numerical and history graphs while paused and resumes the same frozen session with an explicit gap',async()=>{
 const f=await setup(),source=f.choice().source!,first=await f.observe(),original=applyView(alertFromView(first),first),paused=setLocalAlertPaused(original,true),evaluator=(f.observer as unknown as {timeframeEvaluator:NyseMtfAlertEvaluator}).timeframeEvaluator;
 const quiet=await f.observer.observe({...f.input(source,[paused]),selectedSource:null},NOW+1);expect(quiet.events).toEqual([]);expect(nyseAlertRetainedUsage(evaluator)).toEqual({work:0,slots:0});
 const resumed=setLocalAlertPaused(paused,false),view=await f.observer.observe({...f.input(source,[resumed]),selectedSource:null},NOW+2);expect(view.events[0]?.value).toBe(120);expect(view.events[0]?.observation?.continuity).toBe('gap');expect(applyView(resumed,view).history).toHaveLength(1);expect(f.observer.currentContext(source,f.producer.regular())).not.toBeNull();
});

it('notifies the first genuine daily close after an unconfirmed first day without inventing a correction',async()=>{
 vi.useFakeTimers({now:Date.UTC(2024,2,11,19,59,59)});let f:Awaited<ReturnType<typeof setup>>|undefined;
 try{
  const bars=syntheticSession('2024-03-11T13:30:00Z',26,130);f=await setup({bars,now:unix('2024-03-11T19:59:59Z'),reply:request=>Promise.resolve(response(request,request.timeframe==='1Min'?Array.from({length:(request.end-request.start)/60},(_,index)=>({time:request.start+index*60,open:128,high:133,low:126,close:130,volume:index%30<20?1:0})):bars))},false);f.native.port.update(f.id,{inputs:{length:1}});await flushMtf();const source=f.choice().source!;
  const developing=await f.observer.observe(f.input(source),unix('2024-03-11T19:59:59Z'));expect(developing.selectedEvent?.value).toBe(130);expect(developing.selectedEvent?.barClosed).toBe(false);let alert=applyView(alertFromView(developing,{level:120}),developing);expect(alert.history).toEqual([]);
  f.producer.setNow(unix('2024-03-11T20:00:05Z'));await vi.advanceTimersByTimeAsync(60000);expect(f.producer.requests.some(request=>request.timeframe==='1Min')).toBe(true);await f.native.apply(f.producer.regular());await flushMtf();
  const closed=await f.observer.observe(f.input(source,[alert]),unix('2024-03-11T20:00:05Z'));expect(closed.selectedEvent?.value).toBe(130);expect(closed.selectedEvent?.barClosed).toBe(true);expect(closed.selectedEvent?.observation?.correction).toBe(false);expect(closed.selectedEvent?.barId).toBe(developing.selectedEvent?.barId);alert=applyView(alert,closed);expect(alert.history).toHaveLength(1);expect(alert.history[0].value).toBe(130);
 }finally{f?.dispose();vi.useRealTimers();}
});

it('refuses two real daily formula states plus six legacy WMA bands before their combined work exceeds20M',async()=>{
 const producer=await publishedSource({bars:syntheticSession('2024-03-01T10:00:00Z',1000,110),resolution:'15m'});owned.push(producer);for(let page=0;page<5&&producer.raw().bars.length<1000;page++){producer.setNow(unix('2024-03-11T20:00:00Z')+2*(page+1));await producer.handle.loadOlder!();}const dataset=producer.raw();expect(dataset.bars).toHaveLength(1000);
 const setting=(kind:'sma'|'ema')=>({id:'synthetic-daily-'+kind,kind,...factoryIndicatorDefault(kind),inputs:{length:2,source:'close'},presentation:{...factoryIndicatorDefault(kind).presentation!,timeframe:{schemaVersion:1 as const,interval:'1D',waitForClose:true}}}),sma=captureNyseIndicatorAlertSource(setting('sma'),'sma','standard','synthetic-sma'),ema=captureNyseIndicatorAlertSource(setting('ema'),'ema','standard','synthetic-ema');
 const sources=[ema,...[495,496,497,498,499,500].map(length=>captureIndicatorAlertSource({id:'synthetic-legacy-bb-'+length,kind:'bb',...factoryIndicatorDefault('bb'),inputs:{length,multiplier:2,basisType:'WMA',source:'close'}},'upper','standard','synthetic-bb-'+length))],alerts=sources.map((source,index)=>{const session=createAlertObservationSession(dataset,{version:2,chartId:'synthetic-budget',sessionId:'synthetic-budget-'+index,mode:'ordinary',startedAt:NOW,source}),context=alertObservationContext(session,dataset);return createLocalAlert({id:'synthetic-budget-alert-'+index,name:'SYNTHETIC budget control',message:'SYNTHETIC local-only',instrumentId:context.instrumentId,sourceId:context.sourceId,mode:context.mode,runId:context.runId,observationBinding:context.binding,condition:{kind:'greater',value:100},frequency:'every-time',createdAt:NOW,expiresAt:null});});
 const observer=new TechnicalAlertObserver(()=> 'synthetic-budget-selected',()=>Promise.resolve());owned.push(observer);const view=await observer.observe({dataset,bars:dataset.bars,chartId:'synthetic-budget',replay:null,assumeReplayCompletion:false,selectedSource:sma,alerts,adopt:true},NOW);expect(view.events).toEqual([]);expect(view.selectedContext).toBeNull();expect(view.diagnostics.join(' ')).toContain('estimated operations; local limit is 20000000');const evaluator=(observer as unknown as {timeframeEvaluator:NyseMtfAlertEvaluator}).timeframeEvaluator;expect(nyseAlertRetainedUsage(evaluator)).toEqual({work:0,slots:0});
});

it('holds the old history packet through reset and newer B during the actual outer prior-copy callback',async()=>{
 const f=await setup(),source=f.choice().source!,target=f.producer.regular().bars,producer=await publishedSource({bars:fridayMonday().map(row=>({...row,open:row.open+20,high:row.high+20,low:row.low+20,close:row.close+20}))});owned.push(producer);const next=producer.regular(),evaluator=(f.observer as unknown as {timeframeEvaluator:NyseMtfAlertEvaluator}).timeframeEvaluator,originalMap=Array.prototype.map;const facts:{entered:boolean;usage:{work:number;slots:number}|null;pendingB:ReturnType<TechnicalAlertObserver['observe']>|null}={entered:false,usage:null,pendingB:null};
 // Transparent native-map instrumentation selects only the genuine A array.
 // It forwards the actual production callback and never supplies a source proof.
 Array.prototype.map=function(this:unknown[],callback:(value:unknown,index:number,array:unknown[])=>unknown,thisArg?:unknown){if(this!==target)return Reflect.apply(originalMap,this,[callback,thisArg]);return Reflect.apply(originalMap,this,[(value:unknown,index:number,array:unknown[])=>{const copied=Reflect.apply(callback,thisArg,[value,index,array]);if(index===1&&!facts.entered){facts.entered=true;f.observer.reset();facts.usage=nyseAlertRetainedUsage(evaluator);facts.pendingB=f.observer.observe({...f.input(source),dataset:next,bars:next.bars},NOW+1);}return copied;},thisArg]);} as typeof originalMap;
 const cancelled=await(async()=>{try{return await f.observer.observe(f.input(source),NOW);}finally{Array.prototype.map=originalMap;}})();
 expect(facts.entered).toBe(true);expect(facts.usage?.slots).toBeGreaterThan(32);expect(facts.usage?.work).toBeGreaterThanOrEqual(128);expect(cancelled.cancelled).toBe(true);if(!facts.pendingB)throw Error('Actual newer B never started.');const accepted=await facts.pendingB;expect(accepted.selectedEvent?.value).toBe(140);expect(accepted.cancelled).toBe(false);expect(f.observer.currentContext(source,next)).not.toBeNull();
});

it('preflights the whole real background feed before separate NY and legacy observer groups allocate',async()=>{
 const producer=await publishedSource({bars:syntheticSession('2024-03-08T17:00:00Z',300,110),resolution:'15m'});owned.push(producer);const end=producer.raw().bars.at(-1)!.time,trades=Array.from({length:700},(_,index)=>({symbol:'GME',time:end+(index+1)*900+1,price:110,high:110,low:110,size:1})),now=trades.at(-1)!.time+1;producer.setNow(now);producer.emit({schemaVersion:1,kind:'batch',bars:[],trades,receivedAt:''});await flushMtf();const dataset=producer.raw();expect(dataset.bars).toHaveLength(1000);
 const source=(kind:'sma'|'ema')=>captureNyseIndicatorAlertSource({id:'synthetic-background-'+kind,kind,...factoryIndicatorDefault(kind),inputs:{length:2,source:'close'},presentation:{...factoryIndicatorDefault(kind).presentation!,timeframe:{schemaVersion:1,interval:'1D',waitForClose:false}}},kind,'standard','synthetic-background-'+kind),sources=[source('sma'),source('ema'),...[495,496,497,498,499,500].map(length=>captureIndicatorAlertSource({id:'synthetic-background-bb-'+length,kind:'bb',...factoryIndicatorDefault('bb'),inputs:{length,multiplier:2,basisType:'WMA',source:'close'}},'upper','standard','synthetic-background-bb-'+length))],alerts=sources.map((source,index)=>{const context=alertObservationContext(createAlertObservationSession(dataset,{version:2,chartId:'synthetic-background-budget',sessionId:'synthetic-background-budget-'+index,mode:'ordinary',startedAt:now,source}),dataset);return createLocalAlert({id:'synthetic-background-budget-'+index,name:'SYNTHETIC background budget',message:'SYNTHETIC local-only',instrumentId:context.instrumentId,sourceId:context.sourceId,mode:context.mode,runId:context.runId,observationBinding:context.binding,condition:{kind:'greater',value:100},frequency:'every-time',createdAt:now,expiresAt:null});});
 let published=0,serial=0;const watcher=new BackgroundAlertWatcher({open:()=>producer.handle,alerts:()=>alerts,publish:()=>{published++;return true;},now:()=>now,identity:()=>`synthetic-feed-budget-${++serial}`,openAlpacaSymbols:()=>new Set()});owned.push(watcher);expect(watcher.sync('US:SPY','live:alpaca-iex:SPY:15m','15m').feeds).toHaveLength(1);await watcher.settled();expect(published).toBe(0);
 const watches=(watcher as unknown as {watches:Map<string,{observers:Map<string,TechnicalAlertObserver>}>}).watches;expect([...watches.values()][0].observers.size).toBe(0);expect(alerts.every(alert=>alert.history.length===0)).toBe(true);
});


async function duplicateLegacyPartitions(sameSource:boolean){
 const producer=await publishedSource({bars:syntheticSession('2024-03-08T17:00:00Z',300,110),resolution:'15m'});owned.push(producer);const end=producer.raw().bars.at(-1)!.time,trades=Array.from({length:700},(_,index)=>({symbol:'GME',time:end+(index+1)*900+1,price:110,high:110,low:110,size:1})),now=trades.at(-1)!.time+1;producer.setNow(now);producer.emit({schemaVersion:1,kind:'batch',bars:[],trades,receivedAt:''});await flushMtf();const dataset=producer.raw();expect(dataset.bars).toHaveLength(1000);
 const daily=captureNyseIndicatorAlertSource({id:'synthetic-partition-daily',kind:'sma',...factoryIndicatorDefault('sma'),inputs:{length:2,source:'close'},presentation:{...factoryIndicatorDefault('sma').presentation!,timeframe:{schemaVersion:1,interval:'1D',waitForClose:false}}},'sma','standard','synthetic-partition-daily'),left=captureIndicatorAlertSource({id:'synthetic-partition-vwap',kind:'vwap',...factoryIndicatorDefault('vwap'),inputs:{...factoryIndicatorDefault('vwap').inputs,kernelVersion:2}},'vwap','heikinashi','synthetic-partition-vwap'),right=captureIndicatorAlertSource({id:'synthetic-partition-bb',kind:'bb',...factoryIndicatorDefault('bb'),inputs:{length:500,multiplier:2,basisType:'WMA',source:'close'}},'upper','heikinashi','synthetic-partition-bb'),comparison:AlertSourceSnapshot={kind:'comparison',snapshotId:'synthetic-same-formula',left,right},sources:AlertSourceSnapshot[]=[daily,...Array.from({length:10},(_,index)=>sameSource?comparison:{...comparison,snapshotId:'synthetic-distinct-source-'+index})];
 const alerts=sources.map((source,index)=>{const context=alertObservationContext(createAlertObservationSession(dataset,{version:2,chartId:'synthetic-partition-budget',sessionId:'synthetic-partition-'+index,mode:'ordinary',startedAt:now,source}),dataset);return createLocalAlert({id:'synthetic-partition-'+index,name:'SYNTHETIC duplicate formula groups',message:'SYNTHETIC local-only',instrumentId:context.instrumentId,sourceId:context.sourceId,mode:context.mode,runId:context.runId,observationBinding:context.binding,condition:{kind:'greater',value:source.kind==='comparison'?0:100},frequency:'every-time',createdAt:now,expiresAt:null});});return{producer,dataset,daily,alerts,now};
}

it('refuses duplicated legacy VWAP failure domains with a genuine daily source before chart allocation',async()=>{
 const f=await duplicateLegacyPartitions(false),observer=new TechnicalAlertObserver(()=> 'synthetic-duplicate-chart',()=>Promise.resolve());owned.push(observer);let workerCalls=0;const view=await observer.observe({dataset:f.dataset,bars:f.dataset.bars,chartId:'synthetic-partition-budget',replay:null,assumeReplayCompletion:false,selectedSource:f.daily,alerts:f.alerts,adopt:true,vwap:{assertCurrent(){},async evaluate(){workerCalls++;throw Error('SYNTHETIC worker must not be reached after whole-batch refusal.');}}},f.now);
 expect(view.events).toEqual([]);expect(view.selectedContext).toBeNull();expect(view.diagnostics.join(' ')).toContain('estimated operations; local limit is 20000000');expect(workerCalls).toBe(0);expect(observer.retainedUsage()).toEqual({work:0,slots:0});
});

it('counts repeated identical legacy sources separately for each actual qualified background alert group',async()=>{
 const f=await duplicateLegacyPartitions(true);let workerCalls=0,published=0,serial=0;const watcher=new BackgroundAlertWatcher({open:()=>f.producer.handle,alerts:()=>f.alerts,publish:()=>{published++;return true;},now:()=>f.now,identity:()=>`synthetic-duplicate-background-${++serial}`,openAlpacaSymbols:()=>new Set(),vwapClient:()=>{workerCalls++;throw Error('SYNTHETIC worker must not be acquired after whole-feed refusal.');}});owned.push(watcher);expect(watcher.sync('US:SPY','live:alpaca-iex:SPY:15m','15m').feeds).toHaveLength(1);await watcher.settled();expect(published).toBe(0);expect(workerCalls).toBe(0);
 const watches=(watcher as unknown as {watches:Map<string,{observers:Map<string,TechnicalAlertObserver>}>}).watches;expect([...watches.values()][0].observers.size).toBe(0);expect(f.alerts.every(alert=>alert.history.length===0)).toBe(true);
});


async function closedCalendarBaseline(open:string,count:number,observed:string){
 const f=await setup({bars:syntheticSession(open,count,110),now:unix(observed)},false);f.native.port.update(f.id,{inputs:{length:1}});await flushMtf();const source=f.choice().source!,first=await f.observer.observe(f.input(source),unix(observed));expect(first.selectedEvent?.value).toBe(110);expect(first.selectedEvent?.barClosed).toBe(true);const alert=applyView(alertFromView(first,{kind:'crossing-up',level:120}),first);expect(alert.closedBars.at(-1)?.value).toBe(110);return{f,source,alert};
}
async function actualOpening(value:Awaited<ReturnType<typeof closedCalendarBaseline>>,at:string,delay=1){const time=unix(at);value.f.producer.setNow(time+delay);value.f.producer.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time,price:130,high:130,low:130,size:1}],receivedAt:''});await flushMtf();return value.f.observer.observe(value.f.input(value.source,[value.alert]),time+delay);}

it('keeps the confirmed daily reference across a genuine Memorial Day closed interval',async()=>{
 const value=await closedCalendarBaseline('2024-05-24T13:30:00Z',26,'2024-05-24T20:00:05Z'),view=await actualOpening(value,'2024-05-28T13:30:00Z');expect(view.selectedEvent?.value).toBe(130);expect(view.selectedEvent?.barClosed).toBe(false);expect(view.selectedEvent?.observation?.continuity).toBe('continuous');const alert=applyView(value.alert,view);expect(alert.previousClosedValue).toBe(110);expect(alert.history).toEqual([]);
});

it('uses the certified early close before a genuine Friday to Monday opening',async()=>{
 const value=await closedCalendarBaseline('2023-11-24T14:30:00Z',14,'2023-11-24T18:00:05Z'),view=await actualOpening(value,'2023-11-27T14:30:00Z');expect(view.selectedEvent?.value).toBe(130);expect(view.selectedEvent?.barClosed).toBe(false);expect(view.selectedEvent?.observation?.continuity).toBe('continuous');expect(applyView(value.alert,view).previousClosedValue).toBe(110);
});

it('retains the original direct Monday61 regular-second scenario as a genuine observation gap',async()=>{
 const value=await closedCalendarBaseline('2024-03-08T14:30:00Z',26,'2024-03-08T21:00:05Z'),view=await actualOpening(value,'2024-03-11T13:31:00Z');expect(view.selectedEvent?.value).toBe(130);expect(view.selectedEvent?.observation?.continuity).toBe('gap');const alert=applyView(value.alert,view);expect(alert.previousClosedValue).toBeNull();expect(alert.history).toEqual([]);
});

it('cannot use closed calendar time to override an explicit owned observer gap',async()=>{
 const value=await closedCalendarBaseline('2024-03-08T14:30:00Z',26,'2024-03-08T21:00:05Z');value.f.observer.invalidate();const view=await actualOpening(value,'2024-03-11T13:30:00Z');expect(view.selectedEvent?.value).toBe(130);expect(view.selectedEvent?.observation?.continuity).toBe('gap');expect(applyView(value.alert,view).previousClosedValue).toBeNull();
});

it('cannot exempt a genuine completed-history correction merely because all elapsed time was closed',async()=>{
 const f=await setup(),source=f.choice().source!,first=await f.observe(),original=applyView(alertFromView(first,{frequency:'every-time',level:124}),first);f.producer.setNow(NOW+120);f.producer.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:unix('2024-03-11T19:59:30Z'),price:140,high:140,low:140,size:1}],receivedAt:''});await flushMtf();const view=await f.observer.observe(f.input(source,[original]),NOW+120);expect(view.selectedEvent?.value).toBe(125);expect(view.selectedEvent?.observation?.correction).toBe(true);expect(view.selectedEvent?.observation?.continuity).toBe('gap');const alert=applyView(original,view);expect(alert.previousClosedValue).toBeNull();expect(alert.history).toEqual([]);
});

it('falls back to a gap across a span longer than seven calendar days',async()=>{
 const value=await closedCalendarBaseline('2024-03-08T14:30:00Z',26,'2024-03-08T21:00:05Z'),view=await actualOpening(value,'2024-03-18T13:30:00Z');expect(view.selectedEvent?.value).toBe(130);expect(view.selectedEvent?.observation?.continuity).toBe('gap');expect(applyView(value.alert,view).previousClosedValue).toBeNull();
});
