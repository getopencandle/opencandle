// Bars pattern source data: placement capture, dataset binding, and the original source-resolution re-sample.
//
// Deliberate OpenCandle addition:
// a placed pattern re-reads its SAME source time span at
// another resolution from the same instrument's supplied data (never vela seriesInRange, which is always no-source for LV's
// inline data). Design decisions (2026-10-16):
//  * the pattern keeps its anchors and projected width (geometry handles that, nothing here moves anchors);
//  * cap 50,000 bars with a visible notice above it;
//  * a coarser resolution trims the last bar to the original span (built only from source bars inside the span);
//  * partial data is refused with a visible notice plus a "use available range" result; the last good bars are kept.
// Pure: datasets and the aggregation policy are passed in by the caller (the dialog host), never read from globals.
import type {Bar,BarDataset} from '../../domain/types';
import {STANDARD_INTERVALS,aggregateInterval,intervalDatasetKey,intervalLabel,parseInterval,type AggregationPolicy,type IntervalSourceChoice,type IntervalSpec} from '../../domain/intervals';
import {BARS_PATTERN_BAR_CAP,columnsToBars,makeBarsPatternMember,readBarsPattern,type BarsPatternMember,type BarsPatternSource,type PatternBar} from './bars-pattern-data';

const DAY=86_400;
const fmt=(n:number)=>n.toLocaleString('en-US');
const day=(seconds:number)=>new Date(seconds*1000).toISOString().slice(0,10);
const range=(start:number,end:number)=>`${day(start)} to ${day(end-1)}`;
const canonical=(resolution:string)=>{try{return parseInterval(resolution).id;}catch{return resolution;}};
export const resolutionLabel=(resolution:string)=>{try{return intervalLabel(resolution);}catch{return resolution;}};

/** End of the bar that opens at `open` (UTC calendar for D/W/M, intervals.ts conventions). */
export function periodEnd(open:number,resolution:string|IntervalSpec):number{
 const spec=typeof resolution==='string'?parseInterval(resolution):resolution;
 if(spec.kind!=='time')throw Error('Tick and range bars have no time duration.');
 if(spec.seconds!==null)return open+spec.seconds;
 if(spec.unit==='day')return open+DAY*spec.multiplier;
 if(spec.unit==='week')return open+7*DAY*spec.multiplier;
 const date=new Date(open*1000);date.setUTCMonth(date.getUTCMonth()+spec.multiplier);return date.getTime()/1000;
}
/** Approximate duration for ordering resolutions (months as 30 days). */
export function approxSeconds(resolution:string):number{
 const spec=parseInterval(resolution);
 if(spec.kind!=='time')return Number.NaN;
 return spec.seconds??(spec.unit==='day'?DAY:spec.unit==='week'?7*DAY:30*DAY)*spec.multiplier;
}
const isDerived=(dataset:BarDataset)=>'derivation' in dataset||dataset.provenance.providerId==='lv-local-aggregation';
const toPattern=(bar:Bar):PatternBar=>({time:bar.time,open:bar.open,high:bar.high,low:bar.low,close:bar.close});

// ---------------------------------------------------------------- placement

/** Bars the renderer projector reports between two placement clicks (epoch ms, inclusive), as pattern bars in seconds. */
export function capturePlacementBars(bars:ReadonlyArray<{time:number;open:number;high:number;low:number;close:number}>):PatternBar[]{
 return bars.map(bar=>({time:bar.time/1000,open:bar.open,high:bar.high,low:bar.low,close:bar.close}));
}
export type PlacementResult={ok:true;member:BarsPatternMember}|{ok:false;code:'EMPTY'|'OVER_CAP'|'INVALID';message:string};
/** The stored member of a fresh placement. The source is unbound (the projector has no dataset identity); the first
 *  re-sample, or root's creation hook (bindBarsPatternMember), binds it. */
export function placementMember(bars:readonly PatternBar[],refPrice:number):PlacementResult{
 if(!bars.length)return{ok:false,code:'EMPTY',message:'No bars between the two points. Nothing was placed.'};
 if(bars.length>BARS_PATTERN_BAR_CAP)return{ok:false,code:'OVER_CAP',message:`The two points hold ${fmt(bars.length)} bars; the limit is ${fmt(BARS_PATTERN_BAR_CAP)}. Nothing was placed.`};
 let step=Infinity;for(let i=1;i<bars.length;i++)step=Math.min(step,bars[i].time-bars[i-1].time);
 const last=bars[bars.length-1].time;
 const source:BarsPatternSource={instrumentId:null,symbol:null,fixture:null,datasetKey:null,revision:null,sourceKey:null,resolution:null,placedResolution:null,
  spanStart:bars[0].time,spanEnd:last+(Number.isFinite(step)&&step>0?step:1),refPrice,derived:false,trimmed:false};
 try{return{ok:true,member:makeBarsPatternMember(source,bars)};}
 catch(error){return{ok:false,code:'INVALID',message:'The copied bars are not usable: '+String((error as Error).message??error)};}
}

// ---------------------------------------------------------------- content identity

/** Content fingerprint: the count of rows inside the span that also END by the span end, their first and
 *  last time, and up to 32 evenly sampled CLOSES. Rows outside [spanStart, spanEnd) and a row that straddles the span end never
 *  count, so earlier or later history changes nothing and the fingerprint never carries future data. Limit: only closes are
 *  sampled, so high/low/open edits inside the span are not detected. Local imports have carried revision '1'
 *  (src/domain/data.ts), which is why this exists; it stays the fallback for such revisions. */
export function datasetFingerprint(dataset:BarDataset,spanStart:number,spanEnd:number):string{
 const all=dataset.bars,rows:Bar[]=[];
 for(let i=lowerBound(all,spanStart);i<all.length&&all[i].time<spanEnd;i++){
  let end:number;try{end=periodEnd(all[i].time,dataset.resolution);}catch{end=Infinity;}
  if(end>spanEnd)break;
  rows.push(all[i]);
 }
 const n=rows.length;let hash=2166136261;
 const mix=(value:number)=>{const text=String(value);for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);};
 if(n){const step=Math.max(1,Math.floor(n/32));for(let i=0;i<n;i+=step)mix(rows[i].close);mix(rows[n-1].close);}
 return `lv2:${n}:${n?rows[0].time:0}:${n?rows[n-1].time:0}:${(hash>>>0).toString(16)}`;
}
/** The saved source choice: its own revision and fingerprint are checked whenever it is used, whichever dataset was used
 *  last. Patterns saved before the choice fields existed fall back to the last-used revision (their old fingerprint format is
 *  not comparable). During a replay clock inside the span only the revision is compared (rows past the clock are not read). */
function savedChoice(pool:readonly BarDataset[],source:BarsPatternSource,asOf:number|null){
 if(!source.sourceKey)return null;
 const found=pool.filter(dataset=>intervalDatasetKey(dataset)===source.sourceKey);
 let changed=false;
 if(found.length===1){
  const dataset=found[0],revision=source.choiceRevision??(source.datasetKey===source.sourceKey?source.revision:null);
  if(revision!=null&&dataset.provenance.revision!==revision)changed=true;
  const fp=source.choiceFingerprint,replayInside=asOf!==null&&asOf<(source.choiceSpanEnd??source.spanEnd);
  // The span fields are validated together; an inconsistent saved choice is treated as invalid (ask again).
  const cs=source.choiceSpanStart??null,ce=source.choiceSpanEnd??null;
  if((cs===null)!==(ce===null)||cs!==null&&ce!==null&&!(cs<ce&&cs<=source.spanStart&&ce>=source.spanEnd))changed=true;
  if(!changed&&!replayInside&&typeof fp==='string'&&fp.startsWith('lv2:')&&datasetFingerprint(dataset,source.choiceSpanStart??source.spanStart,source.choiceSpanEnd??source.spanEnd)!==fp)changed=true;
 }
 return{found,changed};
}

// ---------------------------------------------------------------- binding

/** First index with bar.time >= time (bars ascending). */
function lowerBound(bars:readonly Bar[],time:number){let lo=0,hi=bars.length;while(lo<hi){const mid=(lo+hi)>>1;if(bars[mid].time<time)lo=mid+1;else hi=mid;}return lo;}
function containsRun(dataset:BarDataset,bars:readonly PatternBar[]):boolean{
 const rows=dataset.bars,start=lowerBound(rows,bars[0].time);
 if(start+bars.length>rows.length)return false;
 for(let i=0;i<bars.length;i++){const a=rows[start+i],b=bars[i];if(a.time!==b.time||a.open!==b.open||a.high!==b.high||a.low!==b.low||a.close!==b.close)return false;}
 return true;
}
export interface ChartSourceHint{readonly datasetId:string;readonly resolution?:string}
export type BindResult={ok:true;source:BarsPatternSource;dataset:BarDataset}|{ok:false;code:'UNBOUND';message:string};
/** Binds an unbound pattern to the one supplied dataset whose bars contain the copied bars exactly (times and OHLC).
 *  The chart's own dataset wins a tie. A transformed chart style (for example Heikin Ashi) does not match raw bars. */
export function bindBarsPatternSource(member:BarsPatternMember,datasets:readonly BarDataset[],chart?:ChartSourceHint|null):BindResult{
 const read=readBarsPattern({lvBarsPattern:member});
 if(read.state!=='supported')return{ok:false,code:'UNBOUND',message:'The pattern data is unavailable.'};
 const bars=columnsToBars(read.columns);
 let matches=datasets.filter(dataset=>{try{parseInterval(dataset.resolution);return Array.isArray(dataset.bars)&&containsRun(dataset,bars);}catch{return false;}});
 if(matches.length>1&&chart){const own=matches.filter(dataset=>dataset.provenance.datasetId===chart.datasetId&&(!chart.resolution||canonical(chart.resolution)===canonical(dataset.resolution)));if(own.length)matches=own;}
 if(matches.length>1){const raw=matches.filter(dataset=>!isDerived(dataset));if(raw.length)matches=raw;}
 if(matches.length!==1)return{ok:false,code:'UNBOUND',message:matches.length?'More than one loaded dataset holds exactly these bars. Open the pattern on its own chart to re-sample it. The current pattern is kept.':'The copied bars do not match any loaded data (the chart style may transform its bars). The current pattern is kept.'};
 const dataset=matches[0],resolution=canonical(dataset.resolution),last=bars[bars.length-1].time;
 return{ok:true,dataset,source:{...member.source,instrumentId:dataset.instrument.id,symbol:dataset.instrument.symbol,fixture:dataset.provenance.fixture,datasetKey:intervalDatasetKey(dataset),
  revision:dataset.provenance.revision,sourceFingerprint:datasetFingerprint(dataset,member.source.spanStart,periodEnd(last,resolution)),sourceKey:null,resolution,placedResolution:member.source.placedResolution??resolution,spanEnd:periodEnd(last,resolution),derived:isDerived(dataset),trimmed:false}};
}
/** Root creation hook: the placed member bound to the chart's own dataset in the same create publication (null when unbindable). */
export function bindBarsPatternMember(member:BarsPatternMember,datasets:readonly BarDataset[],chart?:ChartSourceHint|null):BarsPatternMember|null{
 if(member.source.instrumentId!==null)return member;
 const bound=bindBarsPatternSource(member,datasets,chart);if(!bound.ok)return null;
 const read=readBarsPattern({lvBarsPattern:member});if(read.state!=='supported')return null;
 return makeBarsPatternMember(bound.source,columnsToBars(read.columns));
}

// ---------------------------------------------------------------- re-sample

/** The real open of the bucket that contains `time` at `resolution`. A trimmed leading bar is stored clamped to the span
 *  start, so window math must not use its stored time. Computed by the interval policy itself (a one-row probe), never by a
 *  second copy of the calendar rules; falls back to `time` when the resolution has no time bucket. */
function bucketOpen(time:number,resolution:string,template:BarDataset|undefined,policy:AggregationPolicy|undefined):number{
 try{
  if(!template)return time;
  const spec=parseInterval(resolution);if(spec.kind!=='time')return time;
  const {derivation:_d,...rest}=template as BarDataset&{derivation?:unknown};
  const probe:BarDataset={...rest,resolution:'1s',bars:[{time,open:1,high:1,low:1,close:1,volume:1}],provenance:{...template.provenance,providerId:'lv-probe'}};
  return aggregateInterval(probe,spec.id,policy).dataset.bars[0].time;
 }catch{return time;}
}

/** `asOf`: an optional replay clock (Unix seconds). Source rows that are not complete at `asOf` never influence the pattern. */
export interface ResampleContext{readonly datasets:readonly BarDataset[];readonly policy?:AggregationPolicy;readonly chart?:ChartSourceHint|null;readonly asOf?:number|null}
export interface ResampleRequest{readonly target:string;readonly sourceKey?:string|null;readonly range?:'full'|'available'}
export interface ResampleSummary{
 readonly count:number;readonly resolution:string;readonly derived:boolean;readonly trimmed:boolean;readonly extendsPastSpan:boolean;
 readonly trimmedFirst?:boolean;readonly gaps:number;readonly spanStart:number;readonly spanEnd:number;readonly symbol:string;readonly fixture:boolean;readonly narrowed:boolean;
}
export type ResampleFailureCode='UNBOUND'|'NO_SOURCE'|'AMBIGUOUS'|'EMPTY'|'PARTIAL'|'OVER_CAP'|'INVALID';
export type ResampleResult=
 |{readonly ok:true;readonly member:BarsPatternMember;readonly summary:ResampleSummary}
 |{readonly ok:false;readonly code:ResampleFailureCode;readonly message:string;readonly candidates?:readonly IntervalSourceChoice[];
   readonly needs?:number;readonly limit?:number;readonly covered?:{readonly start:number;readonly end:number};
   /** PARTIAL only: the committable "use available range" result (span narrowed to the covered range, stored honestly). */
   readonly available?:{readonly member:BarsPatternMember;readonly summary:ResampleSummary}};

const fail=(code:ResampleFailureCode,message:string,extra:Partial<Extract<ResampleResult,{ok:false}>>={}):ResampleResult=>({ok:false,code,message,...extra});
const kept=' The current pattern is kept.';

/** `cutAt`: the open of an exact bar that straddles the span end and cannot be rebuilt from finer in-span data; `cutFrom`: the
 *  end of an exact bar that straddles the span start. The re-sample is then refused (Use available range keeps the whole bars
 *  between them), so no bar ever holds data outside the span. `input` is in-span only. */
interface Picked{bars:Bar[];input:Bar[];dataset:BarDataset;derived:boolean;extendsPastSpan:boolean;cutAt?:number;cutFrom?:number;
 /** A finer source row opened inside the span but ended after it: it was left out, so the coverage is partial. */
 straddled?:boolean;
 /** Round 11: the cut comes from a chosen or saved source while other (finer) sources are loaded. */
 alternatives?:IntervalSourceChoice[]}
/** Picks the bars of `target` over [spanStart, spanEnd) from the pool (same instrument and fixture flag only). Every bar is
 *  built from, or is, a source row inside the span (and complete at `asOf` when a replay clock is given): later rows never
 *  influence the result. */
function pickBars(pool:readonly BarDataset[],source:BarsPatternSource,target:IntervalSpec,request:ResampleRequest,policy:AggregationPolicy|undefined,asOf:number|null):Picked|ResampleResult{
 const {spanStart,spanEnd}=source,label=resolutionLabel(target.id),symbol=source.symbol??'this symbol';
 // Path-independent: judged against the resolution the pattern was PLACED at, never the last re-sample's.
 const origin=source.placedResolution??source.resolution;
 const coarser=origin!==null&&approxSeconds(target.id)>approxSeconds(origin);
 /** Rows opening inside the span and (replay) complete at `asOf`. `whole`: rows that end after the span end are left out and
  *  reported (`straddled`); an exact target bar is kept so the exact-bar cut can see it. */
 const inSpanRows=(dataset:BarDataset,whole:boolean)=>{
  const rows=dataset.bars,out:Bar[]=[];let straddled=false;
  for(let i=lowerBound(rows,spanStart);i<rows.length&&rows[i].time<spanEnd;i++){
   let end:number;try{end=periodEnd(rows[i].time,dataset.resolution);}catch{end=Infinity;}
   if(asOf!==null&&end>asOf)break;
   if(whole&&end>spanEnd){straddled=true;break;}
   out.push(rows[i]);
  }
  return{out,straddled};
 };
 const inSpan=(dataset:BarDataset)=>inSpanRows(dataset,false).out;
 const exactOf=(dataset:BarDataset)=>canonical(dataset.resolution)===target.id;
 const finerOf=(dataset:BarDataset)=>{try{return !isDerived(dataset)&&approxSeconds(dataset.resolution)<approxSeconds(target.id);}catch{return false;}};
 const choice=(dataset:BarDataset):IntervalSourceChoice=>({key:intervalDatasetKey(dataset),label:`${dataset.provenance.providerName} | ${dataset.resolution} | ${dataset.provenance.datasetId}${dataset.provenance.fixture?' | SYNTHETIC':''}`,resolution:dataset.resolution,exact:exactOf(dataset),derived:isDerived(dataset)});
 const noSource=()=>fail('NO_SOURCE','No supplied '+label+' data (or finer) for '+symbol+(source.fixture?' (SYNTHETIC)':'')+' is loaded.'+kept);
 const ambiguous=(rows:readonly BarDataset[],could:boolean)=>fail('AMBIGUOUS',lost+'More than one loaded source '+(could?'could build ':'has ')+label+' bars for '+symbol+'. Choose the source data.',{candidates:rows.map(choice)});
 /** Target bars built from finer in-span source rows only. The buckets that open before the span start or end after the span
  *  end hold only in-span rows (trimmed, the leading one included). */
 const build=(original:BarDataset):Picked|ResampleResult=>{
  const {out:input,straddled}=inSpanRows(original,true);
  if(!input.length&&straddled)return fail('PARTIAL','The '+resolutionLabel(original.resolution)+' source bar at the end of the span runs past it and cannot be trimmed. Load finer data.'+kept);
  if(!input.length)return{bars:[],input,dataset:original,derived:true,extendsPastSpan:false};
  let built;
  try{built=aggregateInterval({...original,bars:input},target.id,policy);}
  catch(error){return fail('NO_SOURCE','The '+resolutionLabel(original.resolution)+' data cannot build '+label+' bars: '+String((error as Error).message??error)+kept);}
  return{bars:built.dataset.bars,input,dataset:original,derived:true,extendsPastSpan:false,straddled};
 };
 /** Exact target bars: honest only while the first one starts and the last one ends inside the span; otherwise the straddling
  *  edge is cut (refused with Use available range, never leaked). */
 const exactBars=(dataset:BarDataset):Picked=>{
  const bars=inSpan(dataset),derived=isDerived(dataset),last=bars[bars.length-1];
  const out:Picked={bars,input:bars,dataset,derived,extendsPastSpan:false};
  if(last&&periodEnd(last.time,target)>spanEnd){out.cutAt=last.time;out.extendsPastSpan=true;}
  const before=dataset.bars[lowerBound(dataset.bars,spanStart)-1];
  if(before&&periodEnd(before.time,target)>spanStart)out.cutFrom=periodEnd(before.time,target);
  return out;
 };
 const cut=(picked:Picked)=>picked.cutAt!==undefined||picked.cutFrom!==undefined;
 const finestOf=(rows:readonly BarDataset[])=>{const best=Math.min(...rows.map(dataset=>approxSeconds(dataset.resolution)));return rows.filter(dataset=>approxSeconds(dataset.resolution)===best);};
 // A chosen source (this request's, else the one saved with the pattern while it is still loaded and can serve the target)
 // is used over the span only (never aggregated whole).
 let sourceKey=request.sourceKey??null,lost='';
 if(!sourceKey&&source.sourceKey){
  const choice0=savedChoice(pool,source,asOf)!,saved=choice0.found,changed=choice0.changed;
  if(saved.length>1)return fail('AMBIGUOUS','More than one loaded source has this identity. Remove the duplicate and try again.'+kept,{candidates:saved.map(choice)});
  const serves=saved.length===1&&(exactOf(saved[0])||finerOf(saved[0]));
  if(!saved.length||changed&&serves){
   // Never fall back silently, even with one candidate left. The refusal lists every source that can serve the target
   // and reuses the chip/dialog Source data select: choosing one proceeds. A changed choice asks the same way.
   lost=saved.length?'The source you chose earlier has changed. ':'The source you chose earlier is no longer loaded. ';
   const can=pool.filter(dataset=>exactOf(dataset)||finerOf(dataset));
   if(can.length)return fail('AMBIGUOUS',lost+'Choose the source data.',{candidates:can.map(choice)});
  }else if(serves)sourceKey=source.sourceKey;
 }
 if(sourceKey){
  const chosen=pool.filter(dataset=>intervalDatasetKey(dataset)===sourceKey);
  if(chosen.length>1)return fail('AMBIGUOUS','More than one loaded source has this identity. Remove the duplicate and try again.'+kept,{candidates:chosen.map(choice)});
  if(chosen.length!==1)return fail('NO_SOURCE','The selected source is no longer available for this instrument.'+kept);
  if(exactOf(chosen[0])){const p=exactBars(chosen[0]);const others=pool.filter(finerOf);if(others.length)p.alternatives=others.map(choice);return p;}
  if(finerOf(chosen[0]))return build(chosen[0]);
  return fail('NO_SOURCE','The selected '+resolutionLabel(chosen[0].resolution)+' source cannot build '+label+' bars.'+kept);
 }
 const exacts=pool.filter(exactOf);
 if(!coarser&&exacts.length>1)return ambiguous(exacts,false);
 // An exact source whose edge bars sit inside the span is used as supplied (nothing to trim).
 if(exacts.length===1){const picked=exactBars(exacts[0]);if(!cut(picked))return picked;}
 // Otherwise rebuild from a finer original, which trims the edge buckets honestly; the user chooses only between finer originals.
 let finer=pool.filter(finerOf);
 if(finer.length>1&&origin){
  // Datasets at the placed timeframe win; two or more of them are asked about, never skipped for a finer source.
  const own=finer.filter(dataset=>canonical(dataset.resolution)===canonical(origin));
  if(own.length===1)finer=own;else if(own.length>1)return ambiguous(own,true);
 }
 if(finer.length>1){const finest=finestOf(finer);if(finest.length>1)return ambiguous(finest,true);finer=finest;}
 if(finer.length)return build(finer[0]);
 // No finer data: exact bars only, cut at a straddling edge bar.
 if(exacts.length===1)return exactBars(exacts[0]);
 if(exacts.length>1)return ambiguous(exacts,false);
 return noSource();
}

/** Re-samples a pattern at `request.target` over its stored span (or binds and re-samples an unbound one). Every failure keeps
 *  the current pattern: the caller commits nothing. */
export function resampleBarsPattern(member:BarsPatternMember,context:ResampleContext,request:ResampleRequest):ResampleResult{
 let target:IntervalSpec;
 try{target=parseInterval(request.target);}catch(error){return fail('INVALID',String((error as Error).message??error));}
 if(target.kind!=='time')return fail('INVALID','Tick and range bars need actual event data; a pattern cannot be re-sampled to them.'+kept);
 let source=member.source;
 if(source.instrumentId===null){const bound=bindBarsPatternSource(member,context.datasets,context.chart);if(!bound.ok)return fail('UNBOUND',bound.message);source=bound.source;}
 if(context.datasets.length>2000)return fail('INVALID','Too many loaded datasets.');
 const pool=context.datasets.filter(dataset=>dataset.instrument?.id===source.instrumentId&&dataset.provenance?.fixture===source.fixture);
 const label=resolutionLabel(target.id),symbol=source.symbol??'this symbol';
 if(!pool.length)return fail('NO_SOURCE','No '+(source.fixture?'SYNTHETIC':'imported')+' data for '+symbol+' is loaded.'+kept);
 // The saved source choice survives timeframe changes while that dataset is loaded.
const keptKey=request.sourceKey??(source.sourceKey&&pool.some(dataset=>intervalDatasetKey(dataset)===source.sourceKey)?source.sourceKey:null);
 const priorChoice=savedChoice(pool,source,context.asOf??null);
 const got=pickBars(pool,source,target,request,context.policy,context.asOf??null);
 if('ok' in got)return got;
 const picked:Picked=got,pk=picked;
 const {bars}=picked;
 // A bar belongs to a window when it overlaps it (a leading bucket opens before the window start and holds only in-window rows).
 const overlaps=(bar:Bar,start:number,end:number)=>bar.time<end&&periodEnd(bar.time,target)>start;
 let gaps=0;for(let i=1;i<bars.length;i++)if(bars[i].time>periodEnd(bars[i-1].time,target))gaps++;
 // An exact edge bar that straddles the span and cannot be trimmed: refused visibly; Use available range keeps the whole bars.
 if(picked.cutAt!==undefined||picked.cutFrom!==undefined){
  const whole=bars.filter(bar=>(picked.cutFrom===undefined||bar.time>=picked.cutFrom)&&(picked.cutAt===undefined||bar.time<picked.cutAt));
  const start=picked.cutFrom!==undefined?Math.max(source.spanStart,picked.cutFrom):source.spanStart,end=picked.cutAt??source.spanEnd;
  let available;try{available=whole.length&&start<end?makeFrom(whole,start,end,true):undefined;}catch{available=undefined;}
  const edge=picked.cutFrom!==undefined&&picked.cutAt!==undefined?'first and last':picked.cutFrom!==undefined?'first':'last';
  const message=picked.alternatives?.length
   ?`The chosen source cannot build this timeframe for the full range: its ${edge} ${label} bar runs past this pattern's span and cannot be trimmed.`+(available?` Use the available range ${range(start,end)}, or choose another source.`:' Choose another source.')+kept
   :`The ${edge} ${label} bar runs past this pattern's span and cannot be trimmed (no finer data is loaded).`+(available?` Use the available range ${range(start,end)}, or load finer data.`:' Load finer data.')+kept;
  if(request.range==='available'&&available)return{ok:true,...available};
  return fail('PARTIAL',message,{covered:{start,end},...available?{available}:{},...picked.alternatives?.length?{candidates:picked.alternatives}:{}});
 }
 if(!bars.length)return fail('EMPTY',`No ${label} bars inside this pattern's span (${range(source.spanStart,source.spanEnd)}).`+kept);
 if(bars.length>BARS_PATTERN_BAR_CAP){
  const ratio=bars.length/BARS_PATTERN_BAR_CAP,fits=STANDARD_INTERVALS.find(spec=>spec.kind==='time'&&approxSeconds(spec.id)>=approxSeconds(target.id)*ratio);
  return fail('OVER_CAP',`Needs ${fmt(bars.length)} bars at ${label}; the limit is ${fmt(BARS_PATTERN_BAR_CAP)}.`+(fits?` Choose ${resolutionLabel(fits.id)} or coarser.`:' Choose a coarser resolution.')+kept,{needs:bars.length,limit:BARS_PATTERN_BAR_CAP});
 }
 /** The member over the window [spanStart, spanEnd): bars overlapping it, a leading bucket clamped to the window start, and
  *  `trimmed` recorded from the actual edge buckets. */
 function makeFrom(rows:readonly Bar[],spanStart:number,spanEnd:number,narrowed:boolean){
  const inside=rows.filter(bar=>overlaps(bar,spanStart,spanEnd));
  const trimmedFirst=inside.length>0&&pk.derived&&inside[0].time<spanStart;
  const trimmedLast=inside.length>0&&pk.derived&&periodEnd(inside[inside.length-1].time,target)>spanEnd;
  const trimmed=trimmedFirst||trimmedLast;
  // The saved choice carries its own revision and fingerprint, refreshed at the new span only while it still matches.
  const chosenDs=keptKey?pool.filter(dataset=>intervalDatasetKey(dataset)===keptKey):[];
  // When the comparison was skipped (replay clock inside the span) or the choice already changed, the old values and the span
  // they cover are kept; they are never refreshed from content that was not verified.
  const keepOld=!request.sourceKey&&(priorChoice?.changed||(context.asOf!=null&&context.asOf<(source.choiceSpanEnd??source.spanEnd)));
  const choiceNow=chosenDs.length!==1?null:keepOld?{revision:source.choiceRevision??null,fingerprint:source.choiceFingerprint??null,start:source.choiceSpanStart??source.spanStart,end:source.choiceSpanEnd??source.spanEnd}:{revision:chosenDs[0].provenance.revision,fingerprint:datasetFingerprint(chosenDs[0],spanStart,spanEnd),start:spanStart,end:spanEnd};
  const next:BarsPatternSource={...source,resolution:target.id,placedResolution:source.placedResolution??source.resolution,sourceKey:keptKey,
   datasetKey:intervalDatasetKey(pk.dataset),revision:pk.dataset.provenance.revision,sourceFingerprint:datasetFingerprint(pk.dataset,spanStart,spanEnd),choiceRevision:choiceNow?.revision??null,choiceFingerprint:choiceNow?.fingerprint??null,choiceSpanStart:choiceNow?.start??null,choiceSpanEnd:choiceNow?.end??null,spanStart,spanEnd,derived:pk.derived,trimmed};
  const kept=inside.map(bar=>toPattern(bar.time<spanStart?{...bar,time:spanStart}:bar));
  const summary:ResampleSummary={count:kept.length,resolution:target.id,derived:pk.derived,trimmed,trimmedFirst,extendsPastSpan:pk.extendsPastSpan,gaps,spanStart,spanEnd,symbol,fixture:source.fixture===true,narrowed};
  return{member:makeBarsPatternMember(next,kept),summary};
 }
 const make=(spanStart:number,spanEnd:number,narrowed:boolean)=>makeFrom(bars,spanStart,spanEnd,narrowed);
 // Partial edge coverage. Authoritative rule: the input data must reach into the FIRST and the LAST bar
 // of the current pattern. Spec 3.5's literal thresholds (first open > spanStart + 1 target bar, last open < spanEnd - 2 target
 // bars) would refuse every session-only source (equity 1m data opens 14:30 UTC, hours after a 1D bar's 00:00 open), which
 // contradicts the spec's own worked 1D to 1m RTH example (section 3.6); spec 3.5 carries that amendment.
 const input=picked.input.length?picked.input:bars,inputResolution=picked.input.length?picked.dataset.resolution:target.id;
 const firstOpen=input[0].time,lastEnd=Math.min(periodEnd(input[input.length-1].time,inputResolution),source.spanEnd);
 // Judged against the ORIGINAL stored span and the original pattern's first and last source bars (placed resolution), never the
 // current bar windows, so the answer is the same whatever chain of timeframes led here (path independence).
 let firstWindowEnd=source.spanEnd,lastWindowStart=source.spanStart;
 const originRes=source.placedResolution??source.resolution;
 if(originRes){
  firstWindowEnd=Math.min(source.spanEnd,periodEnd(bucketOpen(source.spanStart,originRes,pool[0],context.policy),originRes));
  lastWindowStart=Math.max(source.spanStart,bucketOpen(source.spanEnd-1,originRes,pool[0],context.policy));
 }
 // A replay clock inside the span means the pattern's own span is not fully observable yet: always partial (BSR asOf).
 const partial=firstOpen>=firstWindowEnd||lastEnd<=lastWindowStart||picked.straddled===true||(context.asOf!=null&&context.asOf<source.spanEnd);
 if(partial){
  // The covered range is the actual input coverage inside the span, not the target bucket bounds.
  const start=Math.max(source.spanStart,firstOpen),end=lastEnd;
  let available;try{available=make(start,end,true);}catch{available=undefined;}
  const message=`${label[0].toUpperCase()+label.slice(1)} data covers ${range(start,end)} of ${range(source.spanStart,source.spanEnd)}.`+kept;
  if(request.range!=='available')return fail('PARTIAL',message,{covered:{start,end},...available?{available}:{}});
  if(!available)return fail('PARTIAL',message,{covered:{start,end}});
  return{ok:true,...available};
 }
 try{return{ok:true,...make(source.spanStart,source.spanEnd,false)};}
 catch(error){return fail('INVALID',String((error as Error).message??error)+kept);}
}

// ---------------------------------------------------------------- choices for the dialog and the chip

export interface ResolutionChoice{readonly value:string;readonly label:string;readonly available:boolean;readonly reason?:string}
/** Source-resolution choices: the standard time intervals plus every loaded resolution of the instrument. An entry is
 *  available when an exact source or a finer original source is loaded; otherwise it is listed disabled with the reason. */
export function barsPatternResolutionChoices(member:BarsPatternMember,context:ResampleContext):readonly ResolutionChoice[]{
 let source=member.source;
 if(source.instrumentId===null){const bound=bindBarsPatternSource(member,context.datasets,context.chart);if(bound.ok)source=bound.source;}
 const pool=source.instrumentId===null?[]:context.datasets.filter(dataset=>dataset.instrument?.id===source.instrumentId&&dataset.provenance?.fixture===source.fixture);
 const ids=new Set<string>();
 for(const spec of STANDARD_INTERVALS)if(spec.kind==='time')ids.add(spec.id);
 for(const dataset of pool){try{const spec=parseInterval(dataset.resolution);if(spec.kind==='time')ids.add(spec.id);}catch{/* unparsed resolutions are not choosable */}}
 if(source.resolution)ids.add(canonical(source.resolution));
 const loaded=pool.flatMap(dataset=>{try{return[{id:parseInterval(dataset.resolution).id,derived:isDerived(dataset)}];}catch{return[];}});
 return Object.freeze([...ids].sort((a,b)=>approxSeconds(a)-approxSeconds(b)).map(id=>{
  const label=resolutionLabel(id);
  if(source.instrumentId===null)return Object.freeze({value:id,label,available:false,reason:'The copied bars are not matched to loaded data yet.'});
  const exact=loaded.some(row=>row.id===id),finer=loaded.some(row=>!row.derived&&approxSeconds(row.id)<approxSeconds(id));
  return Object.freeze(exact||finer||id===source.resolution?{value:id,label,available:true}:{value:id,label,available:false,reason:'No '+label+' or finer data is loaded for '+(source.symbol??'this symbol')+'.'});
 }));
}

/** One line of status for the dialog and the chip (LV wording, no internal ids). */
export function describeBarsPattern(member:BarsPatternMember|null,summary?:ResampleSummary|null):string{
 if(!member)return 'Pattern data unavailable.';
 const s=member.source,count=summary?.count??member.bars.count,resolution=summary?.resolution??s.resolution,spanStart=summary?.spanStart??s.spanStart,spanEnd=summary?.spanEnd??s.spanEnd;
 const parts=['Source: '+(summary?.symbol??s.symbol??'this chart'),...((summary?summary.fixture:s.fixture)?['SYNTHETIC']:[]),resolution?resolutionLabel(resolution):'resolution not recorded yet',`${fmt(count)} bar${count===1?'':'s'}`,range(spanStart,spanEnd)+' (UTC)'];
 const notes:string[]=[];
 if(summary?.derived??s.derived)notes.push('built by OpenCandle aggregation');
 if(summary?.trimmed??s.trimmed)notes.push(summary?.trimmedFirst?'edge bars trimmed to the original span':'last bar trimmed to the original span');
 if(summary?.extendsPastSpan)notes.push('last bar extends past the original span');
 if(summary?.narrowed)notes.push('span narrowed to the available data');
 if(summary&&summary.gaps>0)notes.push(`${fmt(summary.gaps)} clock gap${summary.gaps===1?'':'s'}`);
 return parts.join(' · ')+(notes.length?'. '+notes.join('; ')[0].toUpperCase()+notes.join('; ').slice(1)+'.':'');
}
