import type {Bar,BarDataset} from './types';
import {validateTechnicalAlertSource,observeAlertSnapshot,type AlertScalarSource,type AlertSourceSample,type AlertOperandValue,type AlertObservationSession,type AlertSnapshotInput,type AlertSnapshotResult} from './alert-observation';
import {liveAlertCompletionFacts,captureLiveAlertCompletion,type LiveAlertCompletion} from './live-history';
import {planNyseDailyTimeframe,nyseDailyChartInterval,type HigherTimeframePlan,type HigherTimeframeBucket} from './indicator-resample';
import {usSessionDay,newYorkWallTime,NYSE_CALENDAR_YEARS} from './us-market-hours';
import {parseInterval,US_EQUITY_EXCHANGES} from './intervals';
import {catalogDefinition} from './indicator-catalog';
import {indicatorAlertBlock} from './indicator-alertability';
import {isPatternIndicator} from './indicators-ext/patterns-catalog';
import {parseIndicatorSource} from './indicator-source';
import {isVwapEventAnchor} from './vwap-event-anchors';
import {calculateIndicator,indicatorVwapKernelVersion,type IndicatorId} from './indicators';
import {indicatorEstimatedWork,indicatorEstimatedSlots,validateFrozenIndicatorInputs,INDICATOR_OUTPUT_LIMIT} from '../chart/indicator-settings';
import {heikinAshiBars} from '../chart/calculation-bars';

/** The qualified own-timeframe intervals. 1D is the producer-confirmed regular-session day; 1W and 1M group those
 * days by New York calendar week (Monday to Sunday) and month, and confirm only on the producer-observed close of the
 * period's last NYSE trading session (holidays and early closes from the NYSE calendar). */
export type NyseAlertInterval='1D'|'1W'|'1M';
export const NYSE_ALERT_INTERVALS:readonly NyseAlertInterval[]=Object.freeze(['1D','1W','1M']);
export const isNyseAlertInterval=(value:unknown):value is NyseAlertInterval=>typeof value==='string'&&(NYSE_ALERT_INTERVALS as readonly string[]).includes(value);
export interface NyseAlertCalculation {schemaVersion:1;interval:NyseAlertInterval;calendar:'nyse-regular';sampling:'observed-prefix';waitForClose:boolean}
export type NyseIndicatorAlertSource=Extract<AlertScalarSource,{kind:'indicator'}>&{calculation:NyseAlertCalculation};
const FIELDS=['time','open','high','low','close','volume'] as const,WORK_LIMIT=20000000,CLOSED_GAP_WORK=32768,CLOSED_GAP_SLOTS=4096;
const clock=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const own=(owner:unknown,key:string):unknown=>{if(!owner||typeof owner!=='object')throw Error('A qualified alert needs own source data.');const d=Object.getOwnPropertyDescriptor(owner,key);if(!d||!d.enumerable||!Object.hasOwn(d,'value'))throw Error('A qualified alert needs own source data.');return d.value;};
const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
export function hasNyseAlertCalculation(value:unknown):value is NyseIndicatorAlertSource{
 if(!value||typeof value!=='object')return false;const kind=Object.getOwnPropertyDescriptor(value,'kind'),calculation=Object.getOwnPropertyDescriptor(value,'calculation');return kind?.value==='indicator'&&!!calculation;
}
export function validateNyseAlertCalculation(value:unknown):asserts value is NyseAlertCalculation{
 const names=['schemaVersion','interval','calendar','sampling','waitForClose'];
 if(!plain(value)||Reflect.ownKeys(value).length!==names.length||names.some(key=>!Object.hasOwn(value,key))||Reflect.ownKeys(value).some(key=>typeof key!=='string'||!names.includes(key)))throw Error('Daily alert calculation requires its exact versioned declaration.');
 if(own(value,'schemaVersion')!==1||!isNyseAlertInterval(own(value,'interval'))||own(value,'calendar')!=='nyse-regular'||own(value,'sampling')!=='observed-prefix'||typeof own(value,'waitForClose')!=='boolean')throw Error('Unsupported daily alert calculation policy.');
}
export function nyseAlertKindRefusal(kind:string,inputs:Readonly<Record<string,unknown>>):string|null{
 const definition=catalogDefinition(kind),blocked=indicatorAlertBlock(kind,inputs);
 if(blocked)return blocked;
 if(parseIndicatorSource(inputs.source)||definition?.profile||definition?.viewport||definition?.finerBars||definition?.dailyHistory||definition?.secondSymbol||definition?.seasonality||definition?.tradingSessions)return 'This source needs dependencies outside the qualified daily alert prefix.';
 if(kind==='vwap'&&(indicatorVwapKernelVersion(inputs)===2||isVwapEventAnchor(inputs.anchor)))return 'This VWAP anchor requires dependencies outside the qualified daily alert prefix.';
 return null;
}
export class NyseAlertUnavailable extends Error{constructor(readonly state:'pending'|'unavailable',message:string){super(message);this.name='NyseAlertUnavailable';}}
export function nyseAlertEstimatedWork(sourceRows:number,rows:number,sources:readonly NyseIndicatorAlertSource[]):number{
 let work=CLOSED_GAP_WORK*sources.length+(4096+1024*sources.length)*sourceRows+rows*64+65536+sources.reduce((n,source)=>n+65536+JSON.stringify(source).length*16,0);const seen=new Set<string>();
 for(const source of sources){const key=formulaKey(source);if(seen.has(key))continue;seen.add(key);work+=indicatorEstimatedWork(source.indicator as IndicatorId,rows,source.inputs)+rows*32+4096;}
 return work;
}
function declarationSlots(sources:readonly NyseIndicatorAlertSource[]):number{return sources.reduce((n,source)=>n+16384+Math.ceil(JSON.stringify(source).length/4)*8,0);}
function historyMaximum(rows:number,sources:readonly NyseIndicatorAlertSource[]):number{return 80*rows+declarationSlots(sources)+128;}
export function nyseAlertEstimatedSlots(sourceRows:number,rows:number,sources:readonly NyseIndicatorAlertSource[]):number{
 let slots=CLOSED_GAP_SLOTS*sources.length+128*sourceRows+rows*(8+2*sources.length)+declarationSlots(sources)+128+historyMaximum(rows,sources);const seen=new Set<string>();
 for(const source of sources){const key=formulaKey(source);if(seen.has(key))continue;seen.add(key);slots+=2*indicatorEstimatedSlots(source.indicator as IndicatorId,rows,source.inputs,undefined,'calculation')+512;}
 return slots;
}
function formulaKey(source:NyseIndicatorAlertSource):string{return JSON.stringify([source.indicator,source.transformId,Object.entries(source.inputs).sort(([a],[b])=>a.localeCompare(b)),[source.calculation.schemaVersion,source.calculation.interval,source.calculation.calendar,source.calculation.sampling,source.calculation.waitForClose]]);}
/** The identical private-state partition is used by all batch consumers. */
export function nyseAlertGroupKey(source:NyseIndicatorAlertSource):string{validateTechnicalAlertSource(source);return 'nyse:'+formulaKey(source);}
function groupedNyseSources(sources:readonly NyseIndicatorAlertSource[]):NyseIndicatorAlertSource[][]{const groups=new Map<string,NyseIndicatorAlertSource[]>();for(const source of sources){const key=nyseAlertGroupKey(source),group=groups.get(key);if(group)group.push(source);else groups.set(key,[source]);}return [...groups.values()];}
export function nyseAlertBatchEstimatedWork(sourceRows:number,rows:number,sources:readonly NyseIndicatorAlertSource[]):number{return groupedNyseSources(sources).reduce((total,group)=>total+nyseAlertEstimatedWork(sourceRows,rows,group),0);}
export function nyseAlertBatchEstimatedSlots(sourceRows:number,rows:number,sources:readonly NyseIndicatorAlertSource[]):number{return groupedNyseSources(sources).reduce((total,group)=>total+nyseAlertEstimatedSlots(sourceRows,rows,group),0);}
function sourceKey(source:NyseIndicatorAlertSource):string{return JSON.stringify([source.instanceId,source.snapshotId,source.plotId,formulaKey(source)]);}
function dayAt(time:number){const p=clock.formatToParts(new Date(time*1000)),part=(kind:string)=>p.find(row=>row.type===kind)!.value,date=part('year')+'-'+part('month')+'-'+part('day'),wall=Number(part('hour'))*3600+Number(part('minute'))*60+Number(part('second')),midnight=time-wall,session=usSessionDay(date);return{date,midnight,session};}
function numericRow(row:unknown):readonly number[]{
 if(!plain(row))throw Error('Qualified alert rows require plain own numeric fields.');
 const descriptors=FIELDS.map(key=>{const descriptor=Object.getOwnPropertyDescriptor(row,key);if(!descriptor||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))throw Error('Qualified alert rows require own data fields.');return descriptor;}),values=descriptors.map(descriptor=>descriptor.value);
 if(values.some((v,i)=>typeof v!=='number'||(i===5?!Number.isFinite(v)&&!Number.isNaN(v):!Number.isFinite(v))))throw Error('Qualified alert OHLCV data is unavailable.');const rowValues=values as number[];
 if(rowValues.slice(1,5).some(value=>value<=0)||rowValues[2]<Math.max(rowValues[1],rowValues[3],rowValues[4])||rowValues[3]>Math.min(rowValues[1],rowValues[2],rowValues[4])||Number.isFinite(rowValues[5])&&rowValues[5]<0)throw Error('Qualified alert OHLCV values are invalid.');
 let flags=0;descriptors.forEach((descriptor,index)=>{flags|=((descriptor.writable?1:0)|(descriptor.configurable?2:0))<<(index*2);});return [...rowValues,flags];
}

const DAY=86400,MONDAY=Date.parse('1969-12-29T00:00:00Z')/1000;
const isoDate=(at:number)=>new Date(at*1000).toISOString().slice(0,10),dateSeconds=(date:string)=>Date.parse(date+'T00:00:00Z')/1000;
/** The New York calendar period of a session date and its last NYSE trading date. Outside the certified calendar: refused. */
function nysePeriod(date:string,interval:'1W'|'1M'):{key:string;lastSession:string}{
 let first:number,last:number;
 if(interval==='1W'){const week=Math.floor((dateSeconds(date)-MONDAY)/(7*DAY));first=MONDAY+week*7*DAY;last=first+6*DAY;}
 else{const year=Number(date.slice(0,4)),month=Number(date.slice(5,7));first=Date.UTC(year,month-1,1)/1000;last=Date.UTC(year,month,1)/1000-DAY;}
 for(let at=last;at>=first;at-=DAY){const key=isoDate(at),year=Number(key.slice(0,4));if(year<NYSE_CALENDAR_YEARS.first||year>NYSE_CALENDAR_YEARS.last)throw new NyseAlertUnavailable('unavailable','This '+(interval==='1W'?'week':'month')+' reaches outside the supported session calendar.');const day=usSessionDay(key);if(!day.weekend&&!day.holiday)return{key:isoDate(first),lastSession:key};}
 throw new NyseAlertUnavailable('unavailable','This calendar period has no NYSE trading session.');
}
/**
 * The producer-confirmed weekly or monthly plan, built only from the qualified daily
 * plan. A period is confirmed on the chart row where the daily close of its last NYSE trading session was observed; a later
 * loaded period never confirms an earlier one, and a period whose last session is missing from the loaded rows stays
 * developing. Bucket first/last and confirmedAt are row indexes of the same regular-session rows as the daily plan.
 */
export function planNysePeriodTimeframe(daily:HigherTimeframePlan,interval:'1W'|'1M'):HigherTimeframePlan{
 if(daily.target!=='1D'||daily.bars.length!==daily.buckets.length||daily.confirmedAt.length!==daily.buckets.length)throw Error('A qualified period plan requires the qualified daily plan.');
 const bars:Bar[]=[],buckets:HigherTimeframeBucket[]=[],confirmedAt:(number|null)[]=[];let current:{key:string;lastSession:string;lastDate:string;lastDaily:number}|null=null;
 const close=()=>{if(!current)return;const confirmed=current.lastDate===current.lastSession?daily.confirmedAt[current.lastDaily]:null;confirmedAt.push(confirmed??null);};
 for(let index=0;index<daily.buckets.length;index++){
  const bucket=daily.buckets[index],row=daily.bars[index],date=dayAt(bucket.start).date,period=nysePeriod(date,interval);
  if(current&&period.key<current.key)throw Error('Qualified daily sessions are out of calendar order.');
  if(!current||period.key!==current.key){close();current={key:period.key,lastSession:period.lastSession,lastDate:date,lastDaily:index};bars.push({...row});buckets.push({start:bucket.start,end:newYorkWallTime(period.lastSession,usSessionDay(period.lastSession).close),first:bucket.first,last:bucket.last});continue;}
  const out=bars[bars.length-1],target=buckets[buckets.length-1];out.high=Math.max(out.high,row.high);out.low=Math.min(out.low,row.low);out.close=row.close;out.volume=Number.isFinite(out.volume)&&Number.isFinite(row.volume)?out.volume+row.volume:NaN;target.last=bucket.last;current.lastDate=date;current.lastDaily=index;
 }
 close();
 const word=interval==='1W'?'week':'month';
 return{chartInterval:daily.chartInterval,target:interval,bars,buckets,confirmedAt,developing:confirmedAt.at(-1)===null,policies:[(interval==='1W'?'Weekly values group the qualified New York regular-session days by Monday-to-Sunday New York week.':'Monthly values group the qualified New York regular-session days by New York calendar month.'),'A '+word+' is complete only when the producer-observed daily close of its last NYSE trading session (holidays and early closes included) is loaded; a later period never confirms it.',...daily.policies]};
}
const SOURCE_INSTRUMENT=['id','symbol','name','exchange','currency','assetClass','timezone','tickSize','lotSize'] as const,SOURCE_PROVENANCE=['providerId','providerName','datasetId','revision','fixture','adjustment','session','timezone','coverage','state'] as const;
interface SourcePins {instrument:WeakRef<object>;provenance:WeakRef<object>;values:readonly unknown[]}
function sourceValues(dataset:BarDataset):readonly unknown[]{const instrument=own(dataset,'instrument'),provenance=own(dataset,'provenance');const values=[own(dataset,'resolution'),...SOURCE_INSTRUMENT.map(key=>own(instrument,key)),...SOURCE_PROVENANCE.map(key=>own(provenance,key))];if(values.some(value=>!['string','number','boolean'].includes(typeof value)||typeof value==='string'&&value.length>4096||typeof value==='number'&&!Number.isFinite(value)))throw Error('Qualified alert source metadata requires bounded primitive fields.');return values;}
function captureSourcePins(dataset:BarDataset):SourcePins{return{instrument:new WeakRef(own(dataset,'instrument') as object),provenance:new WeakRef(own(dataset,'provenance') as object),values:Object.freeze(sourceValues(dataset))};}
function currentSourcePins(dataset:BarDataset,pins:SourcePins|null):boolean{if(!pins||own(dataset,'instrument')!==pins.instrument.deref()||own(dataset,'provenance')!==pins.provenance.deref())return false;const values=sourceValues(dataset);return values.length===pins.values.length&&values.every((value,index)=>Object.is(value,pins.values[index]));}
interface State {live:boolean;working:boolean;active:number;historyActive:number;borrow():NyseAlertHistoryRead;retired:boolean;computeReleased:boolean;historyReleased:boolean;historyClosed:boolean;historyRefs:number;finish():void;source:WeakRef<BarDataset>;rows:WeakRef<readonly Bar[]>;observation:LiveAlertCompletion|null;values:Float64Array|null;rowRefs:Bar[]|null;inputs:Map<object,BarDataset>;count:number;signal:AbortSignal|null;metadata:SourcePins|null;W:number;computeU:number;historyU:number;accepted:boolean;history:string;key:object}
interface ClosedGapMemo {prior:number|null;now:number|null;limit:number|null;ready:boolean;exempt:boolean}
interface SampleRecord {ordinary:boolean;gapMemo:ClosedGapMemo|null;state:State;dataset:WeakRef<BarDataset>;barId:string;closed:boolean;sourceKey:string;informationBars:number}
const samples=new WeakMap<object,SampleRecord>(),evaluators=new WeakSet<object>(),pendingObservations=new WeakMap<object,LiveAlertCompletion>();
export interface NyseAlertPrepared {samples:ReadonlyArray<{source:NyseIndicatorAlertSource;sample:AlertSourceSample;diagnostics:string[]}>;estimatedWork:number;assertCurrent():void;release():void}
export interface NyseAlertObservationInput {barId:string;closed:boolean;assertCurrent():void}
export interface NyseAlertHistoryRead {release():void}
export interface NyseAlertHistory {readonly opaqueNyseHistory:unique symbol}
interface HistoryRecord {state:State;sourceKey:string;live:boolean}
const histories=new WeakMap<NyseAlertHistory,HistoryRecord>(),sampleHistories=new WeakMap<object,NyseAlertHistory>(),snapshotInputs=new WeakMap<object,{state:State;barId:string;closed:boolean;closedCalendarGapExempt:boolean}>();
function historyActive<T>(state:State,work:()=>T):T{state.historyActive++;try{return work();}finally{state.historyActive--;state.finish();}}
function active<T>(state:State,work:()=>T):T{state.active++;try{return work();}finally{state.active--;state.finish();}}
export function assertNysePendingObservation(value:unknown):void{if(!value||typeof value!=='object')throw Error('No genuine pending daily observation.');const observed=pendingObservations.get(value);if(!observed)throw Error('No genuine pending daily observation.');observed.assertCurrent();}
function assertStateValues(state:State):void{
 try{
 const signal=state.signal;if(!state.live||!signal||signal.aborted||!state.values||!state.rowRefs||!state.observation)throw new NyseAlertUnavailable('unavailable','The qualified daily alert owner retired.');
 const dataset=state.source.deref(),rows=state.rows.deref();if(!dataset||!rows||rows.length!==state.count||!currentSourcePins(dataset,state.metadata)||own(own(dataset,'provenance'),'state')!=='ready')throw new NyseAlertUnavailable('unavailable','The qualified daily alert input changed.');
 state.observation.assertCurrent();
 for(let i=0;i<state.count;i++){const field=Object.getOwnPropertyDescriptor(rows,String(i));if(!field||!Object.hasOwn(field,'value'))throw Error('Qualified alert row ownership changed.');if(field.value!==state.rowRefs[i])throw Error('Qualified alert row identity changed.');const values=numericRow(field.value);for(let j=0;j<7;j++)if(!Object.is(values[j],state.values[i*7+j]))throw new NyseAlertUnavailable('unavailable','Qualified daily alert history changed.');}
 state.observation.assertCurrent();if(!state.live||signal.aborted)throw Error('Qualified daily alert retired during validation.');
 }catch(error){state.live=false;throw error;}
}
function sampleRecord(sample:AlertSourceSample):SampleRecord{
 const record=samples.get(sample);if(!record||!record.state.accepted||!hasNyseAlertCalculation(sample.source)||record.sourceKey!==sourceKey(sample.source))throw Error('The daily alert sample has no current owned observation.');return record;
}
function assertState(state:State):void{active(state,()=>assertStateValues(state));}
/** Small current metadata only. Neither a prefix nor historical text escapes. */
export function qualifiedNyseAlertObservation(sample:AlertSourceSample):NyseAlertObservationInput{
 const record=sampleRecord(sample);assertState(record.state);return Object.freeze({barId:record.barId,closed:record.closed,assertCurrent:()=>assertState(record.state)});
}
export function captureNyseAlertHistory(sample:AlertSourceSample):NyseAlertHistory{
 const record=sampleRecord(sample),state=record.state;return active(state,()=>{assertStateValues(state);const existing=sampleHistories.get(sample);if(existing){const old=histories.get(existing);if(!old?.live||old.state.historyClosed)throw Error('The daily history handle retired.');return existing;}const handle=Object.freeze({}) as NyseAlertHistory;state.historyRefs++;histories.set(handle,{state,sourceKey:record.sourceKey,live:true});sampleHistories.set(sample,handle);return handle;});
}
export function nyseAlertHistoryExtends(handle:NyseAlertHistory,sample:AlertSourceSample):boolean{
 const prior=histories.get(handle),current=sampleRecord(sample);if(!prior?.live||prior.state.historyClosed||prior.state.historyReleased||prior.sourceKey!==current.sourceKey)throw Error('The daily history comparison owner retired.');return historyActive(prior.state,()=>active(current.state,()=>{assertStateValues(current.state);if(!prior.live||prior.state.historyClosed)throw Error('The daily history comparison retired.');const same=current.state.history.startsWith(prior.state.history);assertStateValues(current.state);if(!prior.live||prior.state.historyClosed)throw Error('The daily history comparison retired.');return same;}));
}
export function holdNyseAlertHistory(handle:NyseAlertHistory):NyseAlertHistoryRead{const record=histories.get(handle);if(!record?.live||record.state.historyClosed||record.state.historyReleased)throw Error('The daily history read owner retired.');return record.state.borrow();}
export function releaseNyseAlertHistory(handle:NyseAlertHistory):void{const record=histories.get(handle);if(!record?.live)return;record.live=false;record.state.historyRefs--;record.state.finish();}
/** All output parts are bounded by the existing fixed formatter. No shared
 * hourly-offset cache or unbounded calendar/date collection is allocated. */
function closedGapParts(time:number):{date:string;year:number;local:number}{
 const parts=clock.formatToParts(new Date(time*1000));if(parts.length>20)throw Error('Unsupported bounded calendar conversion.');const get=(kind:string)=>{const value=parts.find(part=>part.type===kind)?.value;if(typeof value!=='string'||value.length>4||!/^\d+$/.test(value))throw Error('Unsupported calendar part.');return value;},year=get('year'),month=get('month'),day=get('day'),hour=get('hour'),minute=get('minute'),second=get('second'),date=year+'-'+month+'-'+day,local=Date.parse(date+'T'+hour+':'+minute+':'+second+'Z')/1000;
 if(!Number.isSafeInteger(local)||Number(year)<NYSE_CALENDAR_YEARS.first||Number(year)>NYSE_CALENDAR_YEARS.last)throw Error('The gap calendar is uncertified.');return{date,year:Number(year),local};
}
function closedRegularGap(prior:number,now:number,limit:number):boolean{
 if(!Number.isSafeInteger(prior)||!Number.isSafeInteger(now)||prior<0||now<=prior||now-prior<=limit||now-prior>8*86400||!Number.isSafeInteger(limit)||limit<1)return false;
 const first=closedGapParts(prior),last=closedGapParts(now),from=Date.parse(first.date+'T00:00:00Z')/1000,to=Date.parse(last.date+'T00:00:00Z')/1000,days=(to-from)/86400;
 if(!Number.isSafeInteger(days)||days<0||days>7)return false;let regular=0;
 for(let index=0;index<=days;index++){
  const at=from+index*86400,key=new Date(at*1000).toISOString().slice(0,10),year=Number(key.slice(0,4));if(year<NYSE_CALENDAR_YEARS.first||year>NYSE_CALENDAR_YEARS.last)return false;const day=usSessionDay(key);if(day.weekend||day.holiday)continue;
  const noon=at+12*3600,offset=closedGapParts(noon).local-noon;if(!Number.isSafeInteger(offset)||Math.abs(offset)>86400)return false;const open=at+day.open*60-offset,close=at+day.close*60-offset;
  if(closedGapParts(open).local!==at+day.open*60||closedGapParts(close).local!==at+day.close*60||close<=open)return false;
  regular+=Math.max(0,Math.min(now,close)-Math.max(prior,open));if(regular>Math.min(limit,60))return false;
 }
 return regular<=Math.min(limit,60);
}
/** Existing closed-consume entry/query/exit retain the full numeric/source checks.
 * This calendar branch adds scalar guards and bounded dates only; no new N-pass.
 * One exact pair per admitted sample. Busy is set before any session or clock
 * boundary; reentry/different pairs fail closed to the original wall gap. */
function closedGapExemption(record:SampleRecord,session:AlertObservationSession,input:AlertSnapshotInput):boolean{
 if(!record.ordinary)return false;const priorMemo=record.gapMemo;if(priorMemo&&!priorMemo.ready)return false;const memo:ClosedGapMemo=priorMemo??{prior:null,now:null,limit:null,ready:false,exempt:false};if(!priorMemo)record.gapMemo=memo;memo.ready=false;
 try{const prior=own(session,'lastObservedAt'),now=own(input,'observedAt'),limit=own(session,'maxObservationGapSeconds');if(priorMemo)return memo.prior===prior&&memo.now===now&&memo.limit===limit&&memo.exempt&&own(session,'mode')==='ordinary'&&input.continuity!=='gap'&&!input.correction;
  if(own(session,'mode')!=='ordinary'||input.continuity==='gap'||input.correction||typeof prior!=='number'||typeof now!=='number'||typeof limit!=='number')return false;
  memo.prior=prior;memo.now=now;memo.limit=limit;if(!record.state.live||record.state.retired||record.state.signal?.aborted)return false;const exempt=closedRegularGap(prior,now,limit);if(!record.state.live||record.state.retired||record.state.signal?.aborted)return false;if(own(session,'lastObservedAt')!==prior||own(session,'maxObservationGapSeconds')!==limit||own(session,'mode')!=='ordinary'||own(input,'observedAt')!==now||input.continuity as AlertSnapshotInput['continuity'] ==='gap'||input.correction)return false;memo.exempt=exempt;return exempt;
 }catch{memo.exempt=false;return false;}finally{memo.ready=true;}
}
interface OwnedNyseSnapshotInput extends NyseAlertObservationInput {readonly closedCalendarGapExempt:boolean}
/** Only the closed operation below creates this exact input membership. */
export function qualifiedNyseSnapshotInput(input:AlertSnapshotInput):OwnedNyseSnapshotInput|null{const record=snapshotInputs.get(input);if(!record)return null;assertState(record.state);return Object.freeze({barId:record.barId,closed:record.closed,closedCalendarGapExempt:record.closedCalendarGapExempt,assertCurrent:()=>assertState(record.state)});}
/** Invokes the actual observation implementation; accepts no callback or target. */
export function observeQualifiedNyseAlertSnapshot(session:AlertObservationSession,input:AlertSnapshotInput):AlertSnapshotResult{
 if(!input.sample)throw Error('Daily alert sample is waiting for its owned observation.');const record=sampleRecord(input.sample),state=record.state;return active(state,()=>{assertStateValues(state);const dataset=state.inputs.get(input.sample!);if(!dataset||record.dataset.deref()!==dataset)throw Error('The qualified alert prefix retired.');const owned:AlertSnapshotInput={dataset,observedAt:input.observedAt,replayRunId:input.replayRunId,sample:input.sample,continuity:input.continuity,reason:input.reason,correction:input.correction,barIndex:dataset.bars.length-1,barClosed:undefined};const closedCalendarGapExempt=closedGapExemption(record,session,owned);snapshotInputs.set(owned,{state,barId:record.barId,closed:record.closed,closedCalendarGapExempt});try{const result=observeAlertSnapshot(session,owned);assertStateValues(state);return result;}finally{snapshotInputs.delete(owned);}});
}
/** One observer owns this closed admission/cache lifetime. No source resolver,
 * attach operation, caller budget or callback can mint a producer observation. */
export class NyseMtfAlertEvaluator{
 #states=new Set<State>();#W=0;#U=0;#closed=false;
 constructor(){evaluators.add(this);}
 #finish(state:State):void{
  if(state.working||state.active)return;
  if(state.retired&&!state.computeReleased){state.values=null;state.rowRefs=null;state.observation=null;state.metadata=null;state.signal=null;state.inputs.clear();state.computeReleased=true;this.#W-=state.W;this.#U-=state.computeU;}
  if(state.retired&&(state.historyClosed||state.historyRefs===0)&&state.historyActive===0&&!state.historyReleased){state.history='';state.historyReleased=true;this.#U-=state.historyU;}
  if(state.computeReleased&&state.historyReleased)this.#states.delete(state);
 }
 #borrowHistory(state:State):NyseAlertHistoryRead{
  if(this.#closed||state.historyClosed||state.historyReleased||this.#W+128>WORK_LIMIT||this.#U+32>INDICATOR_OUTPUT_LIMIT)throw Error('The shared alert batch cannot admit this history read.');this.#W+=128;this.#U+=32;state.historyActive++;let live=true;return Object.freeze({release:()=>{if(!live)return;live=false;this.#W-=128;this.#U-=32;state.historyActive--;this.#finish(state);}});
 }
 #releaseState(state:State):void{state.live=false;state.retired=true;this.#finish(state);}
 retire():void{for(const state of [...this.#states])this.#releaseState(state);}
 dispose():void{this.#closed=true;for(const state of [...this.#states]){state.historyClosed=true;this.#releaseState(state);}}
 usage():Readonly<{work:number;slots:number}>{return Object.freeze({work:this.#W,slots:this.#U});}
 facts(dataset:BarDataset,bars:readonly Bar[],execution:string){return liveAlertCompletionFacts(dataset,execution==='ordinary'?(own(dataset,'bars') as readonly Bar[]):bars,execution);}
 prepare(dataset:BarDataset,bars:readonly Bar[],execution:string,sources:readonly NyseIndicatorAlertSource[],currency:string,signal:AbortSignal):NyseAlertPrepared{
  if(!evaluators.has(this)||this.#closed||signal.aborted||!sources.length||sources.length>256)throw new NyseAlertUnavailable('unavailable','The qualified daily alert evaluation retired.');
  if(typeof currency!=='string'||!currency||currency.length>200)throw Error('A qualified alert requires bounded source currency text.');
  for(const source of sources){validateTechnicalAlertSource(source);if(!hasNyseAlertCalculation(source))throw Error('A qualified alert requires its exact daily declaration.');validateNyseAlertCalculation(source.calculation);validateFrozenIndicatorInputs(source.indicator as IndicatorId,source.inputs,source.plotId);const refused=nyseAlertKindRefusal(source.indicator,source.inputs);if(refused)throw new NyseAlertUnavailable('unavailable',refused);if(!['standard','heikinashi'].includes(source.transformId))throw Error('Unsupported daily alert transform.');}
  const rows=execution==='ordinary'?own(dataset,'bars') as readonly Bar[]:bars,facts=liveAlertCompletionFacts(dataset,rows,execution);
  if(!facts||!nyseDailyChartInterval(facts.resolution,'1D'))throw new NyseAlertUnavailable('unavailable','The current source has no genuine supported daily-session observation.');
  const instrument=own(dataset,'instrument'),provenance=own(dataset,'provenance');
  if(currency!==own(instrument,'currency'))throw Error('Qualified alert currency disagrees with its actual source.');
  if(!['stock','etf'].includes(own(instrument,'assetClass') as string)||!US_EQUITY_EXCHANGES.has(String(own(instrument,'exchange')).toUpperCase())||own(instrument,'timezone')!=='America/New_York'||own(provenance,'timezone')!=='America/New_York')throw new NyseAlertUnavailable('unavailable','Daily alerts require a supported US equity source in New York time.');
  if(own(provenance,'state')!=='ready')throw new NyseAlertUnavailable(own(provenance,'state')==='loading'?'pending':'unavailable','Daily alerts are waiting for their ready producer source.');
  const W=nyseAlertEstimatedWork(facts.sourceRows,facts.rows,sources),U=nyseAlertEstimatedSlots(facts.sourceRows,facts.rows,sources);
  if(![W,U].every(Number.isSafeInteger)||this.#W+W>WORK_LIMIT||this.#U+U>INDICATOR_OUTPUT_LIMIT)throw new NyseAlertUnavailable('unavailable','The shared alert batch cannot admit this daily calculation.');
  // This exact reservation exists before observation capture or any row allocation.
  const historyU=historyMaximum(facts.rows,sources);this.#W+=W;this.#U+=U;const state:State={live:true,working:true,active:0,historyActive:0,borrow:()=>this.#borrowHistory(state),retired:false,computeReleased:false,historyReleased:false,historyClosed:false,historyRefs:0,finish:()=>this.#finish(state),source:new WeakRef(dataset),rows:new WeakRef(rows),observation:null,values:null,rowRefs:null,inputs:new Map(),count:facts.rows,signal,metadata:null,W,computeU:U-historyU,historyU,accepted:false,history:'',key:{}};this.#states.add(state);
  const release=()=>this.#releaseState(state);
  try{
   state.metadata=captureSourcePins(dataset);
   const observation=captureLiveAlertCompletion(dataset,rows,execution);if(!observation)throw new NyseAlertUnavailable('pending','Daily alerts are waiting for genuine producer completion.');
   state.observation=observation;observation.assertCurrent();if(!state.live||signal.aborted||this.#closed)throw Error('Daily alert cancelled before source capture.');
   const values=new Float64Array(facts.rows*7),rowRefs:Bar[]=new Array(facts.rows),regular:Bar[]=[];let complete=0,prior=-Infinity;
   for(let i=0;i<facts.rows;i++){
    const field=Object.getOwnPropertyDescriptor(rows,String(i));if(!field||!Object.hasOwn(field,'value'))throw Error('Qualified alert rows require own data.');const row=field.value as Bar,v=numericRow(row);if(!Number.isSafeInteger(v[0])||v[0]<=prior)throw Error('Qualified alert times must increase.');prior=v[0];rowRefs[i]=row;for(let j=0;j<7;j++)values[i*7+j]=v[j];
    const day=dayAt(v[0]),year=Number(day.date.slice(0,4));if(year<NYSE_CALENDAR_YEARS.first||year>NYSE_CALENDAR_YEARS.last)throw new NyseAlertUnavailable('unavailable','This session year is outside the supported calendar.');
    if(!day.session.weekend&&!day.session.holiday&&v[0]>=day.midnight+day.session.open*60&&v[0]<day.midnight+day.session.close*60){regular.push(row);if(i<observation.completeRows)complete++;}
   }
   observation.assertCurrent();
   const planned=planNyseDailyTimeframe(regular,facts.resolution,{completeRows:complete,coveredFrom:observation.coveredFrom,closedThrough:observation.closedThrough});if(!planned.ok)throw new NyseAlertUnavailable('unavailable',planned.message);
   const interval=sources[0].calculation.interval;if(sources.some(source=>source.calculation.interval!==interval))throw Error('A qualified alert batch requires one calculation interval.');
   const plan=interval==='1D'?planned.plan:planNysePeriodTimeframe(planned.plan,interval),output:NyseAlertPrepared['samples'][number][]=[],computed=new Map<string,ReturnType<typeof calculateIndicator>>(),transformed=new Map<string,readonly Bar[]>([['standard',plan.bars]]);
   const prefixDataset={instrument:dataset.instrument,provenance:dataset.provenance,resolution:dataset.resolution,bars:[] as Bar[]};
   state.values=values;state.rowRefs=rowRefs;assertState(state);
   let lastConfirmed=plan.confirmedAt.length-1;while(lastConfirmed>=0&&plan.confirmedAt[lastConfirmed]===null)lastConfirmed--;
   state.history=plan.bars.slice(0,lastConfirmed+1).map(row=>JSON.stringify(FIELDS.map(key=>Number.isNaN(row[key])?'NaN':Object.is(row[key],-0)?'-0':row[key]))).join('\n')+(lastConfirmed>=0?'\n':'');
   // Stored text is ASCII numeric JSON. UTF16 text plus exact retained metadata
   // and two prior-row/checkpoint copies fit the separately admitted packet.
   const actualHistoryU=Math.ceil(state.history.length/4)+16*facts.rows+declarationSlots(sources)+128;if(actualHistoryU>state.historyU)throw Error('The daily history packet exceeded its admitted upper bound.');this.#U-=state.historyU-actualHistoryU;state.historyU=actualHistoryU;
   for(const source of sources){
    let daily=plan.buckets.length-1;if(daily<0||source.calculation.waitForClose&&plan.confirmedAt[daily]===null){const pending=new NyseAlertUnavailable('pending',interval==='1D'?'Daily alerts are waiting for the current observed session close.':(interval==='1W'?'Weekly alerts are waiting for the observed close of the week':'Monthly alerts are waiting for the observed close of the month')+"'s last trading session.");pendingObservations.set(pending,observation);throw pending;}
    const last=plan.confirmedAt[daily]??plan.buckets[daily].last,closed=plan.confirmedAt[daily]!==null,sourceRows=regular.slice(0,last+1),key=formulaKey(source);let result=computed.get(key);
    if(!result){let calculation=transformed.get(source.transformId);if(!calculation){calculation=heikinAshiBars(plan.bars);transformed.set(source.transformId,calculation);}const needsVolume=['volume','vwap','obv'].includes(source.indicator)||source.inputs.basisType==='VWMA';if(needsVolume&&calculation.some(row=>!Number.isFinite(row.volume)||row.volume<0))throw new NyseAlertUnavailable('unavailable','This daily indicator requires volume, which is unavailable in the observed prefix.');result=calculateIndicator(source.indicator as IndicatorId,calculation,source.inputs,{resolution:interval,calendar:'us-equity'});computed.set(key,result);}
    const plot=result.series.find(row=>row.id===source.plotId),raw=plot?.values[daily],value=typeof raw==='number'&&Number.isFinite(raw)?raw:null;
    const operand:AlertOperandValue={value,unit:['volume','obv'].includes(source.indicator)?'source volume units':source.indicator==='rsi'?'RSI points':source.indicator==='stochastic'?'oscillator percent':isPatternIndicator(source.indicator)?'pattern signal (1 appeared on this bar, 0 none)':currency,basis:'Qualified New York regular-session '+(interval==='1D'?'daily':interval==='1W'?'weekly':'monthly')+' '+source.transformId+' prices',label:source.indicator.toUpperCase()+' / '+source.plotId,plots:result.series.slice(0,64).map(row=>({id:row.id,title:row.label,value:typeof row.values[daily]==='number'&&Number.isFinite(row.values[daily])?row.values[daily]:null}))};
    const sample:AlertSourceSample={value,source:structuredClone(source),informationBars:last+1,informationEndIndex:last,informationEndTime:sourceRows[last].time,informationStartTime:sourceRows[0].time,operands:{left:operand}},selected={...prefixDataset,bars:sourceRows};
    // These constructor outputs are immutable; original producer rows are never locked.
    Object.freeze(sourceRows);Object.freeze(selected);Object.freeze(sample.source.kind==='indicator'?sample.source.inputs:{});if(hasNyseAlertCalculation(sample.source))Object.freeze(sample.source.calculation);Object.freeze(sample.source);for(const point of operand.plots??[])Object.freeze(point);if(operand.plots)Object.freeze(operand.plots);Object.freeze(operand);Object.freeze(sample.operands);Object.freeze(sample);
    state.inputs.set(sample,selected);samples.set(sample,{ordinary:!facts.replay,gapMemo:null,state,dataset:new WeakRef(selected),barId:'nyse:'+interval+':'+plan.buckets[daily].start+':'+execution,closed,sourceKey:sourceKey(source),informationBars:last+1});const diagnosticText=[...result.diagnostics,...(result.plotDiagnostics?.[source.plotId]??[])];output.push({source,sample,diagnostics:diagnosticText.slice(0,16).map(message=>message.slice(0,500))});
   }
   assertState(state);state.accepted=true;
   return{samples:output,estimatedWork:W,assertCurrent:()=>assertState(state),release};
  }catch(error){release();throw error;}finally{state.working=false;this.#finish(state);}
 }
}

const prepareOwned=NyseMtfAlertEvaluator.prototype.prepare,retireOwned=NyseMtfAlertEvaluator.prototype.retire,usageOwned=NyseMtfAlertEvaluator.prototype.usage;
export function prepareNyseAlertBatch(evaluator:NyseMtfAlertEvaluator,dataset:BarDataset,bars:readonly Bar[],execution:string,sources:readonly NyseIndicatorAlertSource[],currency:string,signal:AbortSignal):NyseAlertPrepared{if(!evaluators.has(evaluator))throw Error('No owned daily alert evaluator.');return Reflect.apply(prepareOwned,evaluator,[dataset,bars,execution,sources,currency,signal]);}
export function retireNyseAlertEvaluator(evaluator:NyseMtfAlertEvaluator):void{if(!evaluators.has(evaluator))throw Error('No owned daily alert evaluator.');Reflect.apply(retireOwned,evaluator,[]);}

export function nyseAlertRetainedUsage(evaluator:NyseMtfAlertEvaluator):Readonly<{work:number;slots:number}>{if(!evaluators.has(evaluator))throw Error('No owned daily alert evaluator.');return Reflect.apply(usageOwned,evaluator,[]);}
