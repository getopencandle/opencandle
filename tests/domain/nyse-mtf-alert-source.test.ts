import {afterEach,expect,it,vi} from 'vitest';
import {publishedSource,syntheticSession,unix,flushMtf} from '../fixtures/qualified-nyse-mtf-source';
import {NyseMtfAlertEvaluator,prepareNyseAlertBatch,qualifiedNyseAlertObservation,NyseAlertUnavailable,assertNysePendingObservation,validateNyseAlertCalculation,captureNyseAlertHistory,nyseAlertHistoryExtends,releaseNyseAlertHistory,nyseAlertRetainedUsage} from '../../src/domain/nyse-mtf-alert-source';
import {captureIndicatorAlertSource,captureNyseIndicatorAlertSource} from '../../src/domain/technical-alerts';
import {validateTechnicalAlertSource,createAlertObservationSession,observeAlertSnapshot} from '../../src/domain/alert-observation';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import type {BarDataset} from '../../src/domain/types';
import {liveAlertView,liveAlertCompletionFacts,captureLiveAlertCompletion} from '../../src/domain/live-history';
const owned:{dispose():void}[]=[];
afterEach(()=>{const failures:unknown[]=[];for(const item of owned.splice(0).reverse())try{item.dispose();}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'SYNTHETIC daily alert source cleanup failed.');});
async function source(options:Parameters<typeof publishedSource>[0]={}){const result=await publishedSource(options);owned.push(result);return result;}
function engine(){const result=new NyseMtfAlertEvaluator();owned.push(result);return result;}
const settings=(waitForClose=true)=>({id:'synthetic-daily-sma',kind:'sma' as const,...factoryIndicatorDefault('sma'),inputs:{...factoryIndicatorDefault('sma').inputs,length:2,source:'close'},presentation:{...factoryIndicatorDefault('sma').presentation!,timeframe:{schemaVersion:1 as const,interval:'1D',waitForClose}}});
const frozen=(wait=true,transform:'standard'|'heikinashi'='standard')=>captureNyseIndicatorAlertSource(settings(wait),'sma',transform,'synthetic-daily-snapshot');
const prepare=(e:NyseMtfAlertEvaluator,dataset:BarDataset,wait=true,transform:'standard'|'heikinashi'='standard')=>prepareNyseAlertBatch(e,dataset,dataset.bars,'ordinary',[frozen(wait,transform)],dataset.instrument.currency,new AbortController().signal);

it('keeps generic own-timeframe capture refused and stores only a strict qualified declaration',()=>{
 expect(()=>captureIndicatorAlertSource(settings(),'sma','standard','old')).toThrow('Alerts are unavailable for an indicator calculated on its own 1D timeframe');
 const value=frozen();expect(value.calculation).toEqual({schemaVersion:1,interval:'1D',calendar:'nyse-regular',sampling:'observed-prefix',waitForClose:true});
 expect(()=>validateTechnicalAlertSource(value)).not.toThrow();expect(()=>validateNyseAlertCalculation({...value.calculation,closedThrough:unix('2024-03-11T20:00:00Z')})).toThrow();
 expect(Reflect.ownKeys(value.calculation)).toEqual(['schemaVersion','interval','calendar','sampling','waitForClose']);
});

it('calculates literal120 from a genuine regular-session producer observation',async()=>{
 const p=await source(),view=p.regular(),e=engine(),result=prepare(e,view),sample=result.samples[0].sample,observation=qualifiedNyseAlertObservation(sample);
 expect(sample.value).toBe(120);expect(observation.closed).toBe(true);expect(observation.barId).toBe('nyse:1D:1710163800:ordinary');
 expect(sample.informationEndTime).toBe(unix('2024-03-11T19:30:00Z'));expect(sample.informationEndIndex).toBe(25);expect(sample.informationBars).toBe(26);expect(()=>result.assertCurrent()).not.toThrow();
});

it('aggregates raw daily OHLC before HA once with independent SMA112.5',async()=>{
 const rows=[...syntheticSession('2024-03-08T14:30:00Z',26,110).map(row=>({...row,open:100,high:120,low:90,close:110})),...syntheticSession('2024-03-11T13:30:00Z',26,130).map(row=>({...row,open:110,high:140,low:100,close:130}))];
 const p=await source({bars:rows}),e=engine(),standard=prepare(e,p.regular()),ha=prepare(e,p.regular(),true,'heikinashi');
 expect(standard.samples[0].sample.value).toBe(120);expect(ha.samples[0].sample.value).toBe(112.5);expect(qualifiedNyseAlertObservation(ha.samples[0].sample).closed).toBe(true);
});

it('cannot close at19:59:59 even when the response arrived after20:00',async()=>{
 const p=await source({now:unix('2024-03-11T19:59:59Z')}),e=engine();let failure:unknown;
 try{prepare(e,p.regular());}catch(error){failure=error;}
 expect(failure).toBeInstanceOf(NyseAlertUnavailable);expect((failure as NyseAlertUnavailable).state).toBe('pending');
 expect(()=>assertNysePendingObservation(failure)).not.toThrow();expect(()=>assertNysePendingObservation(new NyseAlertUnavailable('pending','copied descriptive error'))).toThrow();
 const developing=prepare(e,p.regular(),false);expect(developing.samples[0].sample.value).toBe(120);expect(qualifiedNyseAlertObservation(developing.samples[0].sample).closed).toBe(false);
});

it('refuses copied source objects and copied rows without attributing permission to them',async()=>{
 const p=await source(),view=p.regular(),e=engine();
 expect(()=>prepare(e,{...view})).toThrow('genuine');expect(()=>prepare(e,{...view,bars:view.bars.map(row=>({...row}))})).toThrow('genuine');
 const actual=prepare(e,view);expect(actual.samples[0].sample.value).toBe(120);expect(()=>actual.assertCurrent()).not.toThrow();
});

it('does not regain a raw-producer sample after an observed interior mutation is restored',async()=>{
 const p=await source(),view=p.raw(),e=engine(),result=prepare(e,view),sample=result.samples[0].sample,old=view.bars[1].close;
 view.bars[1].close=old+0.5;expect(()=>result.assertCurrent()).toThrow();view.bars[1].close=old;
 expect(()=>result.assertCurrent()).toThrow();expect(()=>qualifiedNyseAlertObservation(sample)).toThrow();
});

it('keeps serialized settings descriptive and drops private sample membership on copying',async()=>{
 const p=await source(),e=engine(),sample=prepare(e,p.regular()).samples[0].sample;
 const copy=structuredClone(sample);expect(()=>validateTechnicalAlertSource(copy.source)).not.toThrow();expect(()=>qualifiedNyseAlertObservation(copy)).toThrow('no current owned observation');
 expect(qualifiedNyseAlertObservation(sample).closed).toBe(true);expect(sample.value).toBe(120);
});

it('late A release cannot retire a freshly accepted genuine B',async()=>{
 const a=await source(),b=await source(),e=engine(),old=prepare(e,a.regular());e.retire();const current=prepare(e,b.regular());old.release();
 expect(()=>old.assertCurrent()).toThrow();expect(()=>current.assertCurrent()).not.toThrow();expect(current.samples[0].sample.value).toBe(120);
});

it('rejects accessors without calling the numeric getter and leaves a fresh calculation usable',async()=>{
 const p=await source(),view=p.raw(),e=engine(),row=view.bars[1],descriptor=Object.getOwnPropertyDescriptor(row,'close')!;let reads=0;
 Object.defineProperty(row,'close',{get(){reads++;return 110;},configurable:true,enumerable:true});
 try{expect(()=>prepare(e,view)).toThrow();expect(reads).toBe(0);}finally{Object.defineProperty(row,'close',descriptor);}
 expect(prepare(e,view).samples[0].sample.value).toBe(120);
});

it('refuses aggregate admission before evicting an accepted sample and releases exact charges once',async()=>{
 const p=await source(),view=p.regular(),e=engine(),first=prepare(e,view),held=[first];let refused=false;
 for(let index=0;index<256;index++){try{held.push(prepare(e,view));}catch(error){expect(String(error)).toContain('cannot admit');refused=true;break;}}
 expect(refused).toBe(true);expect(()=>first.assertCurrent()).not.toThrow();expect(first.samples[0].sample.value).toBe(120);
 e.retire();const next=prepare(e,view);for(const old of held){old.release();old.release();}expect(()=>next.assertCurrent()).not.toThrow();expect(next.samples[0].sample.value).toBe(120);
});

it('keeps constructor-owned sample values and prefix wrappers immutable without locking original rows',async()=>{
 const p=await source(),e=engine(),sample=prepare(e,p.regular()).samples[0].sample,observation=qualifiedNyseAlertObservation(sample);
 expect(Reflect.set(sample,'value',999)).toBe(false);expect(Reflect.set(sample.operands!.left,'value',999)).toBe(false);expect(Reflect.set(sample.source,'plotId','fabricated')).toBe(false);expect(Reflect.ownKeys(observation)).toEqual(['barId','closed','assertCurrent']);expect(Object.hasOwn(observation,'dataset')).toBe(false);expect(Object.hasOwn(observation,'history')).toBe(false);
 expect(Object.isFrozen(p.raw().bars[0])).toBe(false);expect(sample.value).toBe(120);expect(()=>observation.assertCurrent()).not.toThrow();expect(()=>qualifiedNyseAlertObservation(structuredClone(sample))).toThrow();
});

it('does not recover an aborted sample when the caller keeps its descriptive DTO',async()=>{
 const p=await source(),e=engine(),controller=new AbortController(),view=p.regular(),result=prepareNyseAlertBatch(e,view,view.bars,'ordinary',[frozen()],'USD',controller.signal),sample=result.samples[0].sample;
 controller.abort();expect(()=>result.assertCurrent()).toThrow();expect(()=>qualifiedNyseAlertObservation(sample)).toThrow();result.release();result.release();expect(prepare(e,view).samples[0].sample.value).toBe(120);
});

it('rejects malformed persisted declarations and accessor fields without invoking their getters',async()=>{
 const p=await source(),e=engine(),view=p.regular(),original=frozen(),signal=new AbortController().signal;let reads=0;
 const accessor={...original};Object.defineProperty(accessor,'calculation',{get(){reads++;return original.calculation;},enumerable:true});
 expect(()=>prepareNyseAlertBatch(e,view,view.bars,'ordinary',[accessor],'USD',signal)).toThrow();expect(reads).toBe(0);
 for(const calculation of [{...original.calculation,schemaVersion:2},{...original.calculation,calendar:'utc'},{...original.calculation,waitForClose:1},{...original.calculation,closedThrough:1710187200}])expect(()=>validateTechnicalAlertSource({...original,calculation})).toThrow();
 expect(prepare(e,view).samples[0].sample.value).toBe(120);
});

it('makes missing required source volume unavailable rather than substituting a price-only calculation',async()=>{
 const p=await source(),view=p.raw(),e=engine(),row=view.bars[1],volume=row.volume;row.volume=NaN;
 const value=captureNyseIndicatorAlertSource({id:'synthetic-daily-volume',kind:'volume',...factoryIndicatorDefault('volume'),presentation:{...factoryIndicatorDefault('volume').presentation!,timeframe:{schemaVersion:1,interval:'1D',waitForClose:true}}},'volume','standard','synthetic-volume');
 try{expect(()=>prepareNyseAlertBatch(e,view,view.bars,'ordinary',[value],'USD',new AbortController().signal)).toThrow('volume');}finally{row.volume=volume;}
 expect(prepare(e,view).samples[0].sample.value).toBe(120);
});

it('keeps the genuine subscription suffix and daily110 stable after real historical paging',async()=>{
// One older page is now up to 1000 bars, so the whole 1024-row synthetic window lands in one page (was 300 -> 600).
 const rows=syntheticSession('2024-03-01T04:00:00Z',1024,110),p=await source({bars:rows,resolution:'15m'}),e=engine(),before=liveAlertView(p.raw()),first=prepare(e,before),count=before.bars.length,origin=before.bars[0].time;
 expect(count).toBe(300);expect(first.samples[0].sample.value).toBe(110);await p.handle.loadOlder!();const after=liveAlertView(p.raw());expect(p.raw().bars.length).toBe(1024);expect(after.bars).toHaveLength(count);expect(after.bars[0].time).toBe(origin);
 expect(liveAlertCompletionFacts(after,after.bars,'ordinary')?.sourceRows).toBe(1024);expect(()=>first.assertCurrent()).toThrow();const current=prepare(e,after);expect(current.samples[0].sample.value).toBe(110);expect(current.samples[0].sample.informationBars).toBe(first.samples[0].sample.informationBars);expect(()=>prepare(e,{...after})).toThrow('genuine');expect(()=>current.assertCurrent()).not.toThrow();
});

async function largeSource(){const p=await source({bars:syntheticSession('2024-02-20T00:00:00Z',2000,110),resolution:'15m'});for(let page=0;page<8&&p.raw().bars.length<2000;page++){p.setNow(unix('2024-03-11T20:00:00Z')+2*(page+1));await p.handle.loadOlder!();}expect(p.raw().bars).toHaveLength(2000);return p;}

it('admits the next actual2000-row calculation while separately retaining the immutable history packet',async()=>{
 const p=await largeSource(),e=engine(),a=prepare(e,p.raw()),history=captureNyseAlertHistory(a.samples[0].sample);expect(a.samples[0].sample.value).toBe(110);expect(nyseAlertRetainedUsage(e).work).toBeGreaterThan(10000000);expect(nyseAlertRetainedUsage(e).work).toBeLessThan(20000000);
 a.release();const retained=nyseAlertRetainedUsage(e);expect(retained.work).toBe(0);expect(retained.slots).toBeGreaterThan(0);const b=prepare(e,p.raw());expect(b.samples[0].sample.value).toBe(110);expect(nyseAlertHistoryExtends(history,b.samples[0].sample)).toBe(true);expect(Reflect.ownKeys(history)).toEqual([]);
 releaseNyseAlertHistory(history);releaseNyseAlertHistory(history);expect(()=>b.assertCurrent()).not.toThrow();expect(nyseAlertRetainedUsage(e).work).toBeGreaterThan(10000000);e.dispose();expect(nyseAlertRetainedUsage(e)).toEqual({work:0,slots:0});
});

it('holds actual calculation charge while retireA and prepareB reenter an active numeric assertion',async()=>{
 const p=await largeSource(),e=engine(),dataset=p.raw(),row=dataset.bars[1];let armed=false,called=false,refused=false;
 dataset.bars[1]=new Proxy(row,{getOwnPropertyDescriptor(target,key){if(armed&&!called&&key==='close'){called=true;e.retire();try{prepare(e,dataset);}catch(error){refused=String(error).includes('cannot admit');}}return Reflect.getOwnPropertyDescriptor(target,key);}});
 const a=prepare(e,dataset);expect(a.samples[0].sample.value).toBe(110);armed=true;expect(()=>a.assertCurrent()).toThrow();expect(called).toBe(true);expect(refused).toBe(true);expect(nyseAlertRetainedUsage(e)).toEqual({work:0,slots:0});
 const b=prepare(e,dataset);expect(b.samples[0].sample.value).toBe(110);a.release();expect(()=>b.assertCurrent()).not.toThrow();
});

it('terminally retires same-value descriptor or row replacement without enumerating unrelated row keys',async()=>{
 const p=await source(),e=engine(),dataset=p.raw(),a=prepare(e,dataset),row=dataset.bars[1],descriptor=Object.getOwnPropertyDescriptor(row,'close')!;
 Object.defineProperty(row,'close',{...descriptor,writable:!descriptor.writable});expect(()=>a.assertCurrent()).toThrow();Object.defineProperty(row,'close',descriptor);expect(()=>a.assertCurrent()).toThrow();a.release();
 const b=prepare(e,dataset);dataset.bars[1]={...row};expect(()=>b.assertCurrent()).toThrow();b.release();const unrelated=dataset.bars[1];Object.defineProperty(unrelated,'irrelevant',{get(){throw Error('An unrelated field must never be read.');},enumerable:true});const c=prepare(e,dataset);expect(c.samples[0].sample.value).toBe(120);expect(()=>c.assertCurrent()).not.toThrow();
});

async function pagedSuffix(){const p=await source({bars:syntheticSession('2024-03-01T04:00:00Z',1024,110),resolution:'15m'});await p.handle.loadOlder!();const view=liveAlertView(p.raw());expect(p.raw().bars).toHaveLength(1024);expect(view.bars).toHaveLength(300);return{p,view};}

it('refuses a detached paged suffix row before preparation without borrowing its genuine parent completion',async()=>{
 const {p,view}=await pagedSuffix(),e=engine(),last=view.bars.length-1,original=view.bars[last];view.bars[last]={...original,close:112};expect(liveAlertCompletionFacts(view,view.bars,'ordinary')).not.toBeNull();expect(()=>prepare(e,view)).toThrow();expect(nyseAlertRetainedUsage(e)).toEqual({work:0,slots:0});
 view.bars[last]=original;expect(()=>prepare(e,view)).toThrow();expect(prepare(e,p.raw()).samples[0].sample.value).toBe(110);
});

it('terminally retires an admitted suffix completion lease when actual selected references detach and are restored',async()=>{
 const {p,view}=await pagedSuffix(),e=engine(),accepted=prepare(e,view),lease=captureLiveAlertCompletion(view,view.bars,'ordinary')!,last=view.bars.length-1,original=view.bars[last];expect(accepted.samples[0].sample.value).toBe(110);expect(()=>lease.assertCurrent()).not.toThrow();
 view.bars[last]={...original};expect(()=>lease.assertCurrent()).toThrow();expect(()=>accepted.assertCurrent()).toThrow();view.bars[last]=original;expect(()=>lease.assertCurrent()).toThrow();expect(()=>accepted.assertCurrent()).toThrow();expect(prepare(e,p.raw()).samples[0].sample.value).toBe(110);
});

it('rejects registered suffix instrument substitution and never revives after the old instrument is restored',async()=>{
 const {p,view}=await pagedSuffix(),e=engine(),original=view.instrument;view.instrument={...original,id:'US:SPY',symbol:'SPY'};expect(liveAlertCompletionFacts(view,view.bars,'ordinary')).toBeNull();expect(()=>prepare(e,view)).toThrow();view.instrument=original;expect(liveAlertCompletionFacts(view,view.bars,'ordinary')).toBeNull();expect(()=>prepare(e,view)).toThrow();expect(prepare(e,p.raw()).samples[0].sample.value).toBe(110);
});

it('rejects registered suffix interval substitution and keeps wrong-array queries from retiring an untampered owner',async()=>{
 const {p,view}=await pagedSuffix(),e=engine(),original=view.resolution;expect(liveAlertCompletionFacts(view,[...view.bars],'ordinary')).toBeNull();expect(prepare(e,view).samples[0].sample.value).toBe(110);view.resolution='1h';expect(liveAlertCompletionFacts(view,view.bars,'ordinary')).toBeNull();view.resolution=original;expect(()=>prepare(e,view)).toThrow();expect(prepare(e,p.raw()).samples[0].sample.value).toBe(110);
});

it('retires raw-source currentness on unit or readiness mutation without relying on a later chart guard',async()=>{
 for(const kind of ['currency','state'] as const){const p=await source(),e=engine(),dataset=p.raw(),accepted=prepare(e,dataset);if(kind==='currency'){const old=dataset.instrument.currency;dataset.instrument.currency='EUR';expect(()=>accepted.assertCurrent()).toThrow();dataset.instrument.currency=old;}else{const old=dataset.provenance.state;dataset.provenance.state='stale';expect(()=>accepted.assertCurrent()).toThrow();dataset.provenance.state=old;}expect(()=>accepted.assertCurrent()).toThrow();accepted.release();expect(prepare(e,dataset).samples[0].sample.value).toBe(120);}
});


it('memoizes only one paid ordinary closed-calendar pair and fails closed for a different pair',async()=>{
 const p=await source(),e=engine(),a=prepare(e,p.raw(),false),first=observeAlertSnapshot(createAlertObservationSession(p.raw(),{version:2,chartId:'synthetic-calendar-pair',sessionId:'synthetic-calendar-pair',mode:'ordinary',startedAt:unix('2024-03-11T20:00:05Z'),source:frozen(false)}),{dataset:p.raw(),sample:a.samples[0].sample,observedAt:unix('2024-03-11T20:00:05Z')});expect(first.event?.value).toBe(120);a.release();const time=unix('2024-03-12T13:30:00Z');p.setNow(time+1);p.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time,price:140,high:140,low:140,size:1}],receivedAt:''});await flushMtf();const b=prepare(e,p.raw(),false),original=Intl.DateTimeFormat.prototype.formatToParts;let calls=0;
 const spy=vi.spyOn(Intl.DateTimeFormat.prototype,'formatToParts').mockImplementation(function(this:Intl.DateTimeFormat,date?:Date|number){calls++;return Reflect.apply(original,this,[date]);});
 try{const input={dataset:p.raw(),sample:b.samples[0].sample,observedAt:time+1},current=observeAlertSnapshot(first.session,input);expect(current.event?.value).toBe(135);expect(current.event?.observation?.continuity).toBe('continuous');const paid=calls;expect(paid).toBeGreaterThan(0);expect(paid).toBeLessThanOrEqual(26);expect(observeAlertSnapshot(first.session,input).event?.observation?.continuity).toBe('continuous');expect(calls).toBe(paid);expect(observeAlertSnapshot(first.session,{...input,observedAt:time+2}).event?.observation?.continuity).toBe('gap');expect(calls).toBe(paid);}finally{spy.mockRestore();}
});

it('holds the actual calendar fee and current matrix when a formatter reenters retireA and prepareB',async()=>{
 const p=await largeSource(),e=engine(),a=prepare(e,p.raw(),false),first=observeAlertSnapshot(createAlertObservationSession(p.raw(),{version:2,chartId:'synthetic-calendar-stack',sessionId:'synthetic-calendar-stack',mode:'ordinary',startedAt:unix('2024-03-11T20:00:30Z'),source:frozen(false)}),{dataset:p.raw(),sample:a.samples[0].sample,observedAt:unix('2024-03-11T20:00:30Z')});expect(first.event?.value).toBe(110);a.release();const time=unix('2024-03-12T13:30:00Z');p.setNow(time+1);p.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time,price:130,high:130,low:130,size:1}],receivedAt:''});await flushMtf();const b=prepare(e,p.raw(),false),original=Intl.DateTimeFormat.prototype.formatToParts;let called=false,refused=false,held=0;
 const spy=vi.spyOn(Intl.DateTimeFormat.prototype,'formatToParts').mockImplementation(function(this:Intl.DateTimeFormat,date?:Date|number){if(!called){called=true;e.retire();held=nyseAlertRetainedUsage(e).work;try{prepare(e,p.raw(),false);}catch(error){refused=String(error).includes('cannot admit');}}return Reflect.apply(original,this,[date]);});
 try{const result=observeAlertSnapshot(first.session,{dataset:p.raw(),sample:b.samples[0].sample,observedAt:time+1});expect(called).toBe(true);expect(refused).toBe(true);expect(held).toBeGreaterThan(10000000);expect(result.event).toBeNull();expect(nyseAlertRetainedUsage(e)).toEqual({work:0,slots:0});}finally{spy.mockRestore();}
 const current=prepare(e,p.raw(),false);expect(current.samples[0].sample.value).toBe(120);
});
