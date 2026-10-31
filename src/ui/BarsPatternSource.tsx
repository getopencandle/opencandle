// Bars pattern "Interval" UI (original extension, a deliberate divergence from the reference:
// the setting in the drawing dialog plus a one-click chip on the
// selected-drawing toolbar; re-sample rules in src/chart/lv-types/bars-pattern-resample.ts).
// The reference dialog rows (Color, Mode, Mirrored, Flipped) are untouched; this is a separate "OpenCandle" group.
// Both surfaces compute the re-sample off-canvas, stage it, and Apply one token through the ordinary drawing edit path, so a
// change is one canonical record change and one history step; a failure commits nothing and keeps the last good bars.
// A finer interval with no stored or loaded data is fetched over the span through the host's fetcher (existing live bridges):
// the section shows a loading line with Apply disabled, then the preview; a failed fetch is a plain message.
import React,{useState} from 'react';
import type {BarDataset} from '../domain/types';
import {STANDARD_INTERVALS,type AggregationPolicy,type IntervalSourceChoice} from '../domain/intervals';
import {BARS_PATTERN_SOURCE_PATH,LV_BARS_PATTERN,parseBarsPatternEditorState,type BarsPatternEditorState} from '../chart/lv-types/bars-pattern';
import {approxSeconds,barsPatternResolutionChoices,bindBarsPatternSource,describeBarsPattern,resolutionLabel,type ResolutionChoice,type ChartSourceHint} from '../chart/lv-types/bars-pattern-source';
import {capturedSeries,fetchBarsPatternSpan,resampleBarsPatternInterval,withFetchedSeries,type IntervalResampleResult,type SpanFetcher,type StoredSeries} from '../chart/lv-types/bars-pattern-resample';
import type {BarsPatternMember} from '../chart/lv-types/bars-pattern-data';
import {stageBarsPatternRequest,stagePendingBarsPatternRequest} from '../chart/lv-types/bars-pattern-request';

/** Supplied by the dialog host (root App wiring): the workspace datasets and the interval aggregation policy. */
export interface BarsPatternData{readonly datasets:readonly BarDataset[];readonly policy?:AggregationPolicy;/** Replay clock (Unix seconds): rows not complete at it never influence a result (ResampleContext.asOf). */readonly asOf?:number|null;
 /** Host-wired fetch of finer bars over a span from the chart's live source (barsPatternSpanFetcher over window.lv). */readonly fetchSpan?:SpanFetcher|null}
export interface BarsPatternSelection{readonly target:string;readonly sourceKey:string|null;readonly range:'full'|'available'}
const NO_DATA:BarsPatternData={datasets:Object.freeze([]) as readonly BarDataset[]};

type FetchEntry={readonly state:'loading'}|{readonly state:'done';readonly series:StoredSeries}|{readonly state:'failed';readonly message:string};
/** Span fetches per host fetcher, by (payload fingerprint, target). Bounded; a fetch is never repeated for the same payload. */
const fetches=new WeakMap<SpanFetcher,Map<string,FetchEntry>>();
const fetchRows=(fetcher:SpanFetcher)=>{let rows=fetches.get(fetcher);if(!rows){rows=new Map();fetches.set(fetcher,rows);}return rows;};
const fetchKey=(state:BarsPatternEditorState,target:string)=>state.fingerprint+'|'+target;
/** Starts the span fetch a FETCH preview asks for (once per payload and target); `done` runs when it settles. */
export function startBarsPatternFetch(state:BarsPatternEditorState,data:BarsPatternData,preview:IntervalResampleResult,done:()=>void):boolean{
 const fetcher=data.fetchSpan;if(!fetcher||preview.ok||preview.code!=='FETCH')return false;
 const rows=fetchRows(fetcher),key=fetchKey(state,preview.fetch.resolution);if(rows.has(key))return false;
 rows.set(key,{state:'loading'});while(rows.size>16)rows.delete(rows.keys().next().value!);
 void fetchBarsPatternSpan(preview.fetch,fetcher).then(result=>{rows.set(key,result.ok?{state:'done',series:result.series}:{state:'failed',message:result.message});try{done();}catch{/* the view is gone */}});
 return true;
}

const memo=new WeakMap<readonly BarDataset[],Map<string,IntervalResampleResult>>();
/** Interval preview, memoised per datasets array and (payload, target, source, range, fetch state). */
export function previewBarsPattern(state:BarsPatternEditorState,data:BarsPatternData,selection:BarsPatternSelection,chart?:ChartSourceHint|null):IntervalResampleResult{
 const entry=data.fetchSpan?fetchRows(data.fetchSpan).get(fetchKey(state,selection.target)):undefined;
 const key=[state.fingerprint,selection.target,selection.sourceKey??'',selection.range,chart?.datasetId??'',chart?.resolution??'',String(data.asOf??''),data.fetchSpan?'f':'',entry?.state??''].join('\u0001');
 let rows=memo.get(data.datasets);if(!rows){rows=new Map();memo.set(data.datasets,rows);}
 const hit=rows.get(key);if(hit)return hit;
 let result:IntervalResampleResult;
 if(!state.member)result={ok:false,code:'INVALID',message:state.message??'Pattern data unavailable.'};
 else{
  let member:BarsPatternMember=state.member;
  if(entry?.state==='done'){try{member=withFetchedSeries(member,entry.series);}catch{/* unusable fetched bars: the message below */}}
  result=resampleBarsPatternInterval(member,{datasets:data.datasets,policy:data.policy,chart,asOf:data.asOf??null,canFetch:!!data.fetchSpan},selection);
  if(!result.ok&&result.code==='FETCH'&&entry&&entry.state!=='loading')
   result={ok:false,code:'NO_SOURCE',message:entry.state==='failed'?entry.message:`The fetched data cannot build ${resolutionLabel(selection.target)} bars for this span. The interval is unchanged.`};
 }
 rows.set(key,result);if(rows.size>16)rows.delete(rows.keys().next().value!);
 return result;
}
/** Interval choices: every standard time interval plus loaded ones, all selectable (an unavailable one explains itself). */
function intervalChoices(member:BarsPatternMember,current:string|null,data:BarsPatternData,chart?:ChartSourceHint|null):readonly ResolutionChoice[]{
 const ids=new Set<string>(STANDARD_INTERVALS.filter(spec=>spec.kind==='time').map(spec=>spec.id));
 for(const choice of barsPatternResolutionChoices(member,{datasets:data.datasets,policy:data.policy,chart,asOf:data.asOf??null}))ids.add(choice.value);
 if(current)ids.add(current);
 return Object.freeze([...ids].sort((a,b)=>approxSeconds(a)-approxSeconds(b)).map(value=>Object.freeze({value,label:resolutionLabel(value),available:true})));
}

export interface SectionModel{
 readonly state:BarsPatternEditorState|null;
 readonly current:string|null;
 readonly choices:readonly ResolutionChoice[];
 readonly preview:IntervalResampleResult|null;
 /** True while the chosen value cannot be applied (Apply must be disabled). */
 readonly blocked:boolean;
 readonly status:string;
}
/** Everything the dialog section shows, derived from the editor value, the chosen value and the host data. Pure. */
export function barsPatternSectionModel(editorValue:unknown,selection:BarsPatternSelection|null|undefined,hostData:BarsPatternData|undefined,chart?:ChartSourceHint|null):SectionModel{
 const state=parseBarsPatternEditorState(editorValue),data=hostData??NO_DATA;
 if(!state||state.state==='unavailable')return{state,current:null,choices:[],preview:null,blocked:false,status:state?.message??'Pattern data unavailable.'};
 if(!state.member)return{state,current:null,choices:[],preview:null,blocked:false,status:'This pattern holds no copied bars.'};
 // An unbound pattern (placed without root's creation hook) shows the source it binds to; binding is committed with the next Apply.
 const bound=state.member.source.instrumentId===null&&data.datasets.length?bindBarsPatternSource(state.member,data.datasets,chart):null,found=bound?.ok?{...state.member,source:bound.source}:state.member;
 // The default is the interval the pattern was captured on (inferred from the bars when it was never bound to a dataset).
 const current=found.source.resolution??capturedSeries(state.member)?.resolution??null,shown=current===found.source.resolution?found:{...found,source:{...found.source,resolution:current}};
 const choices=intervalChoices(state.member,current,data,chart);
 const unchanged=!selection||selection.target===current&&selection.range==='full'&&(selection.sourceKey??null)===state.member.source.sourceKey;
 if(unchanged)return{state,current,choices,preview:null,blocked:false,status:describeBarsPattern(shown)};
 const preview=previewBarsPattern(state,data,selection!,chart);
 return{state,current,choices,preview,blocked:!preview.ok,status:preview.ok?describeBarsPattern(preview.member,preview.summary):preview.message};
}
/** The Apply token for a successful preview (staged now), or null. */
export function stageSectionPreview(model:SectionModel):string|null{
 return model.preview?.ok&&model.state?.member?stageBarsPatternRequest(model.state.member,model.preview.member):null;
}

/** The latest interval asked for per payload or chip: a fetch that settles after another choice never re-applies the older one. */
const latestChoice=new Map<string,BarsPatternSelection>();
function remember(key:string,selection:BarsPatternSelection){latestChoice.delete(key);latestChoice.set(key,selection);while(latestChoice.size>32)latestChoice.delete(latestChoice.keys().next().value!);}

interface SectionProps{
 editorValue:unknown;selection:BarsPatternSelection|null|undefined;data?:BarsPatternData;chart?:ChartSourceHint|null;disabled?:boolean;
 /** Stages the selection and the value of the `lvBarsPatternSource` setting (an Apply token, or the original value to change nothing). */
 onSelect:(selection:BarsPatternSelection,value:unknown)=>void;
}
/** Dialog section. The choice lives in the dialog draft; the only local state is a repaint counter for a fetch that settles. */
export function BarsPatternSourceSection({editorValue,selection,data,chart,disabled,onSelect}:SectionProps){
 const [,repaint]=useState(0);
 const model=barsPatternSectionModel(editorValue,selection,data,chart);
 const choose=(next:BarsPatternSelection)=>{
  const after=barsPatternSectionModel(editorValue,next,data,chart),state=after.state;
  if(state)remember(state.fingerprint,next);
  const preview=after.preview;
  if(state?.member&&data&&preview&&!preview.ok&&preview.code==='FETCH'){
   // The draft holds a pending token now; the settled fetch resolves it (the dialog refuses a later re-stage from this
   // closure by design), and Apply stays disabled until the preview is ready.
   const pending=stagePendingBarsPatternRequest(state.member);
   onSelect(next,pending.token);
   startBarsPatternFetch(state,data,preview,()=>{
    const settled=barsPatternSectionModel(editorValue,next,data,chart).preview;
    if(settled?.ok)pending.resolve(settled.member);
    if(latestChoice.get(state.fingerprint)===next)repaint(count=>count+1);
   });
   return;
  }
  onSelect(next,stageSectionPreview(after)??editorValue);
 };
 const value=selection?.target??model.current??'';
 const failure=model.preview&&!model.preview.ok&&model.preview.code!=='FETCH'?model.preview:null;
 return <fieldset className="lv-bars-pattern-source" data-lv-group="bars-pattern-source"><legend>OpenCandle</legend>
  {model.state?.member&&<label className="form-row">Interval<select aria-label="Interval" data-property={BARS_PATTERN_SOURCE_PATH} disabled={disabled} value={value} onChange={event=>choose({target:event.target.value,sourceKey:null,range:'full'})}>
   {!model.current&&<option value="">Not recorded yet</option>}
   {model.choices.map(choice=><option key={choice.value} value={choice.value} disabled={!choice.available} title={choice.reason}>{choice.label}{choice.available?'':' (no data)'}</option>)}
   {!model.choices.length&&model.current&&<option value={model.current}>{resolutionLabel(model.current)}</option>}
  </select></label>}
  {failure?.candidates?.length?<label className="form-row">Source data<select aria-label="Source data" disabled={disabled} value={selection?.sourceKey??''} onChange={event=>choose({target:selection!.target,sourceKey:event.target.value||null,range:'full'})}><option value="">Choose a source</option>{failure.candidates.map(candidate=><option key={candidate.key} value={candidate.key}>{candidate.label}</option>)}</select></label>:null}
  <p role="status" aria-live="polite" className="lv-bars-pattern-status">{model.status}</p>
  {failure&&<p role="alert">{failure.message}</p>}
  {failure?.code==='PARTIAL'&&failure.available&&<button type="button" disabled={disabled} onClick={()=>choose({target:selection!.target,sourceKey:selection!.sourceKey,range:'available'})}>Use available range</button>}
  {!data&&model.state?.member&&<p className="help">Loaded data is not available in this view, so only the captured interval or coarser can be chosen here.</p>}
 </fieldset>;
}

// ---------------------------------------------------------------- selected-drawing toolbar chip

interface ChipChart{
 getDrawingEditor(id:string):{type:string;values:Record<string,unknown>};
 getSourceContext?():{datasetId:string;resolution?:string};
 updateDrawingEdit(id:string,patch:Record<string,unknown>):{accepted?:boolean;changed?:boolean}|unknown;
}
export interface ChipProps{chart:ChipChart;id:string;data?:BarsPatternData;onChange:()=>boolean|void;onMessage?:(message:string)=>void;
 /** True when the host queued the choice (the routine background autosave holds the chart, which refused it:
  * "Drawing editing is unavailable while the chart is busy"); run applies it when the write ends. App: queueDrawingEdit. */
 deferEdit?:(run:()=>void,id:string)=>boolean}
/** Applies one interval choice now (one Apply = one history step). Returns the visible notice ('' on success). */
export interface ChipOutcome{notice:string;partial:boolean;candidates?:readonly IntervalSourceChoice[]}
/** `fetched`: runs when a span fetch this choice started settles (the caller re-applies the same choice). */
export function applyBarsPatternChip(props:ChipProps,selection:BarsPatternSelection,fetched?:()=>void):ChipOutcome{
 const {chart,id}=props,data=props.data??NO_DATA;
 const editor=chart.getDrawingEditor(id),value=editor.values[BARS_PATTERN_SOURCE_PATH],source=chart.getSourceContext?.()??null;
 const model=barsPatternSectionModel(value,selection,data,source);
 if(!model.preview)return{notice:'',partial:false};
 if(!model.preview.ok&&model.preview.code==='FETCH'){if(model.state&&fetched)startBarsPatternFetch(model.state,data,model.preview,fetched);return{notice:model.preview.message,partial:false};}
 if(!model.preview.ok)return{notice:model.preview.message,partial:model.preview.code==='PARTIAL'&&!!model.preview.available,...model.preview.candidates?.length?{candidates:model.preview.candidates}:{}};
 const token=stageSectionPreview(model);if(!token)return{notice:'Pattern data unavailable.',partial:false};
 const receipt=chart.updateDrawingEdit(id,{[BARS_PATTERN_SOURCE_PATH]:token}) as {changed?:boolean}|undefined;
 if(!(receipt&&receipt.changed===false)&&props.onChange()===false)return{notice:'The pattern changed, but the workspace could not record it. Reopen this chart before editing again.',partial:false};
 return{notice:'',partial:false};
}
/** One-click interval chip for the selected-drawing toolbar. Renders nothing for other drawing types. */
export function BarsPatternResolutionChip(props:ChipProps){
 // A notice belongs to one pattern state: App keeps ONE chip and only changes `id`, and undo/redo or a dialog Apply replace the
 // payload, so a notice (with its Source data select and Use available range) shows only for the drawing and fingerprint it was raised on.
 const [raised,setNotice]=useState<{id:string;fingerprint:string;message:string;partial:boolean;target:string;sourceKey:string|null;candidates?:readonly IntervalSourceChoice[]}|null>(null);
 let editor:{type:string;values:Record<string,unknown>};
 try{editor=props.chart.getDrawingEditor(props.id);}catch{return null;}
 if(editor.type!==LV_BARS_PATTERN)return null;
 const source=props.chart.getSourceContext?.()??null,model=barsPatternSectionModel(editor.values[BARS_PATTERN_SOURCE_PATH],null,props.data,source);
 if(!model.state?.member)return null;
 const owner={id:props.id,fingerprint:model.state.fingerprint},notice=raised&&raised.id===owner.id&&raised.fingerprint===owner.fingerprint?raised:null;
 const run=(selection:BarsPatternSelection)=>{
  // During the routine background autosave the choice waits for the write; it runs from the queue at once.
  if(props.deferEdit?.(()=>run(selection),owner.id))return;
  const key='chip|'+owner.id+'|'+owner.fingerprint;remember(key,selection);
  // A fetch that settles re-applies this choice only while it is still the latest one for the same drawing and payload.
  const again=()=>{if(latestChoice.get(key)===selection)run(selection);};
  try{const result=applyBarsPatternChip(props,selection,again);setNotice(result.notice?{...owner,message:result.notice,partial:result.partial,target:selection.target,sourceKey:selection.sourceKey,candidates:result.candidates}:null);if(result.notice)props.onMessage?.(result.notice);}
  catch(error){setNotice({...owner,message:String((error as Error).message??error),partial:false,target:selection.target,sourceKey:selection.sourceKey});}
 };
 return <span className="lv-bars-pattern-chip">
  <select aria-label="Pattern interval" title="Pattern interval" value={model.current??''} onChange={event=>run({target:event.target.value,sourceKey:null,range:'full'})}>
   {!model.current&&<option value="">Interval</option>}
   {model.choices.map(choice=><option key={choice.value} value={choice.value} disabled={!choice.available} title={choice.reason}>{choice.label}</option>)}
   {!model.choices.length&&model.current&&<option value={model.current}>{resolutionLabel(model.current)}</option>}
  </select>
  {notice&&<span role="alert">{notice.message}{notice.candidates?.length?<select aria-label="Pattern source data" title="Pattern source data" value={notice.sourceKey??''} onChange={event=>run({target:notice.target,sourceKey:event.target.value||null,range:'full'})}><option value="">Choose a source</option>{notice.candidates.map(candidate=><option key={candidate.key} value={candidate.key}>{candidate.label}</option>)}</select>:null}{notice.partial&&<button type="button" onClick={()=>run({target:notice.target,sourceKey:notice.sourceKey,range:'available'})}>Use available range</button>}</span>}
 </span>;
}
