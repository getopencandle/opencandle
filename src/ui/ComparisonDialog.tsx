import {FRED_PROVIDER_ID} from '../domain/fred';
import {AnalysisPublicationError,isAnalysisPublicationFailure} from '../chart/analysis-publication';
import React,{useEffect,useRef,useState} from 'react';
import type {ChartController} from '../chart/adapter';
import type {BarDataset} from '../domain/types';
import {supportedColor} from '../chart/color-validation';
import {applySameScalePercent,comparisonLoadState,comparisonSourceTag,comparisonSourceText,COMPARISON_MODE_LABELS,COMPARISON_PLACEMENTS,COMPARISON_PLACEMENT_LABELS,DEFAULT_COMPARISON_PLACEMENT,type ComparisonLoadRequest,type ComparisonLoadResult,type ComparisonMode,type ComparisonPlacement} from '../chart/compare-port';
import {buildSymbolSearchCandidates,mergeAssetCandidates,searchSymbols,sourceLabel,SYMBOL_TEXT,type SymbolSearchCandidate} from './symbol-search';
import {isCanonicalSymbolMath} from '../domain/symbol-math';
import {isLiveProviderId} from '../domain/live-provider';
import {SYMBOL_MATH_PROVIDER_ID} from '../domain/symbol-math-live';
import {Modal} from './Modal';
import {ColorControl} from './ColorControl';
import {InfoTip} from './dialog-extras';
import './comparison.css';
import {plainErrorText} from './user-error';
// Live and keyless-stub sources show their own source words (comparisonSourceText) instead of "Local import".
// A live source with no bars yet (an Alpaca search row before its feed opens) is listed but cannot be added (our own wording).
// The symbol field searches the way the main symbol search does (the same candidates,
// typed live and symbol math rows and the Alpaca asset lookup), not only loaded symbols. A symbol that is not loaded opens
// through the chart loaders (loadSymbol) and is added once its history has loaded, with a pending row meanwhile. With no
// loader (older callers), a source with no bars stays listed but cannot be added, as before.
/** What each placement does, shown under the add-to choice. */
export const COMPARISON_PLACEMENT_HELP:Readonly<Record<ComparisonPlacement,string>>=Object.freeze({'same-scale':'Both lines in % change on the main scale.','new-scale':'Own price scale on the main pane.','new-pane':'Own pane below the chart.'});
export const COMPARISON_NO_BARS='No bars loaded yet. Open this symbol on a chart first, then compare it.';
/** Plain words for a row that cannot be opened here. */
export const COMPARISON_CANNOT_LOAD='This symbol cannot be loaded for a comparison here. Open it on a chart first, then compare it.';
/** Recently compared symbols, a per-computer convenience kept in local storage (never part of the workspace
 * record), newest first, unique, at most RECENT_COMPARISONS_LIMIT. Unreadable or blocked storage reads as empty and never throws. */
export const RECENT_COMPARISONS_KEY='lv.compare.recent',RECENT_COMPARISONS_LIMIT=10;
export interface RecentComparisonStorage {getItem(key:string):string|null;setItem(key:string,value:string):void}
const recentSymbolOk=(item:unknown):item is string=>typeof item==='string'&&(SYMBOL_TEXT.test(item)||isCanonicalSymbolMath(item));
export function readRecentComparisons(storage:RecentComparisonStorage|null|undefined):string[]{
 try{const raw=storage?.getItem(RECENT_COMPARISONS_KEY);if(!raw)return[];const value:unknown=JSON.parse(raw);if(!Array.isArray(value))return[];return [...new Set(value.filter(recentSymbolOk))].slice(0,RECENT_COMPARISONS_LIMIT);}catch{return[];}
}
export function rememberRecentComparison(storage:RecentComparisonStorage|null|undefined,symbol:string):string[]{
 const clean=String(symbol??'').trim().toUpperCase();if(!recentSymbolOk(clean))return readRecentComparisons(storage);
 const next=[clean,...readRecentComparisons(storage).filter(item=>item!==clean)].slice(0,RECENT_COMPARISONS_LIMIT);
 try{storage?.setItem(RECENT_COMPARISONS_KEY,JSON.stringify(next));}catch{/* blocked storage: recents are a convenience only */}
 return next;
}
const defaultRecentStorage=():RecentComparisonStorage|null=>{try{return typeof window==='undefined'?null:window.localStorage??null;}catch{return null;}};
/** A row the chart loaders can open (a live feed or symbol math). Imports and synthetic demo rows are already loaded. */
export function comparisonLoadable(row:Pick<SymbolSearchCandidate,'openable'|'providerId'|'sourceKind'>):boolean{return row.openable&&(row.sourceKind==='live'&&isLiveProviderId(row.providerId)||row.sourceKind==='expression'&&row.providerId===SYMBOL_MATH_PROVIDER_ID||row.providerId===FRED_PROVIDER_ID);}
/* A FRED series loads on demand through the App's loadSymbol (cache first). */
/** A stable element id per listed row, for the search field's aria-activedescendant. */
function compareOptionId(key:string){let hash=2166136261;for(let i=0;i<key.length;i++)hash=Math.imul(hash^key.charCodeAt(i),16777619);return 'lv-compare-option-'+(hash>>>0).toString(36)+'-'+key.length;}
interface PendingComparison {datasetId:string;symbol:string;placement:ComparisonPlacement;mode:ComparisonMode;seen:boolean}
interface AssetSearchState {query:string;status:'searching'|'done'|'error';rows:readonly SymbolSearchCandidate[];error:string|null}
export function ComparisonDialog({chart,datasets,onClose:parentClose,onChange,assertOwner,assertEditable,ownerToken,candidates,typedCandidates,searchAssets,resolution,loadSymbol,recentStorage}:{chart:ChartController;datasets:BarDataset[];onClose:()=>void;onChange:()=>boolean|void;assertOwner?:()=>void;assertEditable?:()=>void;ownerToken?:object;
 /** The main symbol search candidates (buildSymbolSearchCandidates); absent, they are built from datasets. */
 candidates?:readonly SymbolSearchCandidate[];
 /** The main search's typed rows (live Alpaca ticker, symbol math) and Alpaca asset lookup. */
 typedCandidates?:(query:string,candidates:readonly SymbolSearchCandidate[])=>readonly SymbolSearchCandidate[];
 searchAssets?:(query:string)=>Promise<readonly SymbolSearchCandidate[]>;
 /** The chart interval a symbol that is not loaded opens at (timestamps must match the chart to compare). */
 resolution?:string;
 /** Opens a symbol that is not loaded through the chart loaders (ROOT App). */
 loadSymbol?:(request:ComparisonLoadRequest)=>ComparisonLoadResult;
 recentStorage?:RecentComparisonStorage|null}){
 const [query,setQuery]=useState(''),[mode,setMode]=useState<ComparisonMode>('percent'),[placement,setPlacement]=useState<ComparisonPlacement>(DEFAULT_COMPARISON_PLACEMENT),[rows,setRows]=useState(()=>chart.comparisons.list()),[error,setError]=useState('');
 const localOwner=useRef<object>({}),token=ownerToken??localOwner.current;
 const alive=useRef(true),closed=useRef({token,value:false,busy:false,terminal:false}),latest=useRef({chart,datasets,token});latest.current={chart,datasets,token};if(closed.current.token!==token)closed.current={token,value:false,busy:false,terminal:false};
 const ownsRender=()=>alive.current&&latest.current.token===token&&latest.current.chart===chart&&latest.current.datasets===datasets;
 const session=closed.current;
 const current=()=>ownsRender()&&closed.current===session&&!session.value&&!session.terminal&&session.token===token;
 const parentCurrent=()=>{if(!current())return false;try{assertOwner?.();return current();}catch{return false;}};
 function assertCurrent(){if(!current())throw new Error('This comparison dialog was closed or replaced.');assertOwner?.();assertEditable?.();assertOwner?.();if(!current())throw new Error('This comparison dialog was closed or replaced.');}
 function onClose(){if(!ownsRender()||closed.current!==session||session.value)return;session.value=true;parentClose();}
 useEffect(()=>{alive.current=true;let listening=true;if(current())setRows(chart.comparisons.list());const off=chart.comparisons.subscribe(()=>{if(listening&&current())setRows(chart.comparisons.list());});return()=>{listening=false;alive.current=false;off();};},[chart,datasets,token]);
 function act(action:()=>void){if(!current()){if(ownsRender()&&closed.current===session&&session.value)setError('This comparison dialog was closed or replaced.');return false;}if(session.busy)return false;session.busy=true;let accepted=false;try{assertCurrent();action();accepted=true;if(!parentCurrent())return false;if(onChange()===false)throw Error('The saved comparison configuration does not match the accepted edit.');if(!parentCurrent())return false;setError('');return true;}catch(cause){const error=accepted&&!isAnalysisPublicationFailure(cause)?new AnalysisPublicationError('Comparison',[cause]):cause;if(ownsRender()&&closed.current===session&&!session.value&&parentCurrent()){if(isAnalysisPublicationFailure(error))session.terminal=true;setError(plainErrorText(error));}return false;}finally{session.busy=false;}}
 // Hooks after the existing ones so their order is unchanged.
 const storage=recentStorage===undefined?defaultRecentStorage():recentStorage;
 const [recent,setRecent]=useState<string[]>(()=>readRecentComparisons(storage)),[pending,setPending]=useState<PendingComparison[]>([]),settling=useRef(new Set<string>());
 const [assetSearch,setAssetSearch]=useState<AssetSearchState|null>(null),assetRef=useRef<AssetSearchState|null>(null),assetTicket=useRef(0),searchRef=useRef(searchAssets);searchRef.current=searchAssets;assetRef.current=assetSearch;
 // After the hooks above so their order is unchanged: the row Enter adds; arrows move it.
 const [activeKey,setActiveKey]=useState<string|null>(null);
 useEffect(()=>{
  const search=searchRef.current,text=query.trim(),mine=++assetTicket.current;
  if(!search||!text){if(assetRef.current)setAssetSearch(null);return;}
  const set=(next:AssetSearchState)=>{if(!alive.current||assetTicket.current!==mine)return;assetRef.current=next;setAssetSearch(next);};
  set({query:text,status:'searching',rows:assetRef.current?.query===text?assetRef.current.rows:[],error:null});
  let answer:Promise<readonly SymbolSearchCandidate[]>;try{answer=Promise.resolve(search(text));}catch(cause){answer=Promise.reject(cause);}
  answer.then(found=>set({query:text,status:'done',rows:Array.isArray(found)?found:[],error:null}),cause=>set({query:text,status:'error',rows:[],error:cause instanceof Error?cause.message:String(cause)}));
 },[query]);
 /** Same % scale switches the main scale to Percent (sameScaleMainCommand). The save that follows the add
  * holds the chart briefly, so applySameScalePercent retries a busy refusal; any other refusal keeps the comparison and says why. */
 function sameScaleMain(){
  const scale=(chart as Partial<Pick<ChartController,'priceScale'>>).priceScale;if(!scale||typeof scale.state!=='function'||typeof scale.execute!=='function'||!current())return;
  applySameScalePercent(scale,{report:message=>{if(current())setError('The comparison was added, but the main price scale did not switch to Percent. '+message);}});
 }
 function addDataset(item:BarDataset,where:ComparisonPlacement,as:ComparisonMode){
  const ok=act(()=>{chart.comparisons.add(item,where==='new-scale'?{mode:as}:{mode:as,placement:where});});
  if(ok){setRecent(rememberRecentComparison(storage,item.instrument.symbol));if(where==='same-scale')sameScaleMain();}
  return ok;
 }
 // A pending comparison is added once its feed has history (comparisonLoadState), in the render that holds the current
 // datasets: an older render's callbacks no longer own the dialog. One add per pending row (settling).
 useEffect(()=>{
  if(!pending.length||!current())return;
  let next=pending,touched=false;
  for(const row of pending){
   if(settling.current.has(row.datasetId))continue;
   const data=datasets.find(item=>item.provenance.datasetId===row.datasetId),load=comparisonLoadState(data,row.symbol,row.seen);
   if(load.state==='loading'){if(data&&!row.seen){next=next.map(item=>item===row?{...item,seen:true}:item);touched=true;}continue;}
   next=next.filter(item=>item!==row);touched=true;
   if(load.state==='unavailable'){setError(load.message);continue;}
   settling.current.add(row.datasetId);try{addDataset(data!,row.placement,row.mode);}finally{settling.current.delete(row.datasetId);}
  }
  if(touched)setPending(next);
 });
 const loadedFor=(row:SymbolSearchCandidate)=>datasets.find(item=>item.provenance.datasetId===row.datasetId&&item.instrument.symbol===row.symbol);
 function choose(row:SymbolSearchCandidate){
  const loaded=loadedFor(row);
  if(loaded?.bars.length){addDataset(loaded,placement,mode);return;}
  if(!current())return;
  if(!loadSymbol||!comparisonLoadable(row)){if(!loaded)setError(row.unavailableReason??COMPARISON_CANNOT_LOAD);return;}
  let result:ComparisonLoadResult;
  try{assertCurrent();result=loadSymbol({providerId:row.providerId,symbol:row.symbol,resolution:resolution??row.resolution});}catch(cause){if(current())setError(cause instanceof Error?cause.message:String(cause));return;}
  if(!current())return;
  if(!result.ok){setError(result.message);return;}
  const ready=datasets.find(item=>item.provenance.datasetId===result.datasetId);
  if(ready&&comparisonLoadState(ready,row.symbol).state==='ready'){addDataset(ready,placement,mode);return;}
  if(pending.some(item=>item.datasetId===result.datasetId))return;
  setError('');setPending([...pending,{datasetId:result.datasetId,symbol:row.symbol,placement,mode,seen:false}]);
 }
 function cancelPending(datasetId:string){if(current())setPending(pending.filter(item=>item.datasetId!==datasetId));}
 const base=candidates??buildSymbolSearchCandidates(datasets,[]);
 const typed=typedCandidates?.(query,base)??[],assetRows=assetSearch&&assetSearch.query===query.trim()?assetSearch.rows:[];
 const searchable=mergeAssetCandidates(typed.length?[...base,...typed]:base,assetRows),found=searchSymbols(searchable,query).rows;
 // With an empty query the recently compared symbols come first: the best row the search has for each, or the main
 // search's typed row for that text (a live ticker or symbol math that is not listed until typed).
 const recentRows=query.trim()?[]:recent.flatMap(symbol=>{const rowsFor=searchSymbols(searchable,symbol).rows.filter(item=>item.symbol===symbol),best=rowsFor.find(item=>loadedFor(item)?.bars.length)??rowsFor.find(comparisonLoadable)??rowsFor[0]??typedCandidates?.(symbol,base).find(item=>item.symbol===symbol);return best?[best]:[];});
 const recentKeys=new Set(recentRows.map(item=>item.key)),seenSources=new Set<string>(),listed=found.filter(item=>{if(recentKeys.has(item.key))return false;const id=item.symbol+' '+item.providerId+' '+item.sourceKind;if(seenSources.has(id))return false;seenSources.add(id);return true;});/* One row per symbol and source */
 const rowDisabled=(row:SymbolSearchCandidate)=>{const loaded=loadedFor(row),waiting=pending.some(item=>item.datasetId===row.datasetId),canLoad=!!loadSymbol&&comparisonLoadable(row);return waiting||(loaded?!loaded.bars.length&&!canLoad:!canLoad);};
 // The listed rows in screen order; the highlighted one is the chosen key, else the first row that can be added.
 const options=[...recentRows,...listed],active=options.find(item=>item.key===activeKey)??options.find(item=>!rowDisabled(item))??null;
 function searchKey(event:React.KeyboardEvent<HTMLInputElement>){
  if(event.nativeEvent?.isComposing)return;
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(!options.length)return;const at=active?options.indexOf(active):-1,next=Math.min(options.length-1,Math.max(0,at+(event.key==='ArrowDown'?1:-1)));setActiveKey(options[next].key);return;}
  if(event.key==='Enter'){event.preventDefault();event.stopPropagation();if(!active){if(query.trim()&&current())setError('No symbols match "'+query.trim()+'".');return;}if(rowDisabled(active)){if(current())setError(loadedFor(active)?COMPARISON_NO_BARS:active.unavailableReason??COMPARISON_CANNOT_LOAD);return;}choose(active);}
 }
 const symbolButton=(row:SymbolSearchCandidate)=>{
  const loaded=loadedFor(row),waiting=pending.some(item=>item.datasetId===row.datasetId),canLoad=!!loadSymbol&&comparisonLoadable(row);
  const disabled=rowDisabled(row);
  const title=waiting?'Loading '+row.symbol+'.':disabled?(loaded?COMPARISON_NO_BARS:row.unavailableReason??COMPARISON_CANNOT_LOAD):loaded?.bars.length?undefined:'Loads '+row.symbol+' and adds it once its history arrives.';
  return <button key={row.key} id={compareOptionId(row.key)} disabled={disabled} title={title} className={row===active?'active':undefined} data-active={row===active?'true':undefined} onMouseEnter={()=>{if(!disabled)setActiveKey(row.key);}} onClick={()=>{if(disabled)return;choose(row);}}><strong>{row.symbol}</strong><span>{loaded?comparisonSourceText(loaded):row.providerName?sourceLabel(row)+' · '+row.providerName:sourceLabel(row)}</span><b>{waiting?'…':'+'}</b></button>;
 };
 return <Modal title="Compare symbols" onClose={onClose} wide><fieldset disabled={session.terminal} className="indicator-layout" data-lv-compare="" style={{border:0,padding:0,margin:0,minWidth:0}}><section className="indicator-catalog"><input aria-label="Search comparison symbols" autoFocus value={query} onChange={e=>{setQuery(e.target.value);setActiveKey(null);}} onKeyDown={searchKey} aria-activedescendant={active?compareOptionId(active.key):undefined} spellCheck={false} autoComplete="off" placeholder="Search symbols to compare"/><div className="lv-compare-options"><label>Mode<select aria-label="Comparison scale" value={mode} disabled={placement==='same-scale'} onChange={e=>setMode(e.target.value as ComparisonMode)}>{(['percent','indexed','absolute'] as const).map(v=><option key={v} value={v}>{COMPARISON_MODE_LABELS[v]}</option>)}</select></label><label>Add to<select aria-label="Add comparison to" value={placement} onChange={e=>setPlacement(e.target.value as ComparisonPlacement)}>{COMPARISON_PLACEMENTS.map(v=><option key={v} value={v}>{COMPARISON_PLACEMENT_LABELS[v]}</option>)}</select></label><InfoTip label="About this placement" className="lv-info-end">{COMPARISON_PLACEMENT_HELP[placement]}</InfoTip></div>{pending.length?<div role="status" aria-label="Loading comparisons">{pending.map(item=><div key={item.datasetId} className="form-row"><span>Loading {item.symbol}…</span><button onClick={()=>cancelPending(item.datasetId)} aria-label={'Cancel loading '+item.symbol}>Cancel</button></div>)}</div>:null}{recentRows.length?<div role="group" aria-label="Recently compared"><h3>Recently compared</h3>{recentRows.map(symbolButton)}</div>:null}{assetSearch?.status==='error'?<small className="help" role="note">{assetSearch.error}</small>:null}{listed.map(symbolButton)}{query.trim()&&!options.length?<p className="lv-compare-none" role="note">No symbols match "{query.trim()}".</p>:null}</section><section className="indicator-instances"><h3>Comparisons on this chart<InfoTip label="About comparisons" className="lv-info-end">Only matching dates are compared. No currency conversion.</InfoTip></h3>{rows.length?null:<div className="lv-compare-empty" role="note"><strong>No comparisons yet</strong><span>Pick a symbol on the left to add it to this chart.</span></div>}{rows.map(row=><fieldset key={row.id}><legend>{row.dataset.instrument.symbol} · {comparisonSourceTag(row.dataset)}</legend><label className="form-row">Mode<select value={row.mode} onChange={e=>act(()=>chart.comparisons.update(row.id,{mode:e.target.value as ComparisonMode}))}>{(['absolute','percent','indexed'] as const).map(v=><option key={v} value={v}>{COMPARISON_MODE_LABELS[v]}</option>)}</select></label><label className="form-row">Placement<select aria-label={row.dataset.instrument.symbol+' comparison placement'} value={row.placement??'new-scale'} onChange={e=>{const next=e.target.value as ComparisonPlacement;if(act(()=>chart.comparisons.update(row.id,{placement:next}))&&next==='same-scale')sameScaleMain();}}>{COMPARISON_PLACEMENTS.map(v=><option key={v} value={v}>{COMPARISON_PLACEMENT_LABELS[v]}</option>)}</select></label><label className="form-row">Baseline<select value={row.baseline} onChange={e=>act(()=>chart.comparisons.update(row.id,{baseline:e.target.value as typeof row.baseline}))}><option value="first-visible-match">First visible bar</option><option value="first-loaded-match">First loaded bar</option></select></label><div className="form-row">Color<ColorControl label={row.dataset.instrument.symbol+' comparison color'} fieldKey={row.id+':color'} value={row.color} ownerToken={token} isCurrent={current} onChange={color=>act(()=>{if(!supportedColor(color))throw new Error('Enter a supported color.');chart.comparisons.update(row.id,{color});})}/></div><label className="form-row">Width<input type="number" min="0.5" max="8" step="0.5" value={row.width} onChange={e=>act(()=>chart.comparisons.update(row.id,{width:Number(e.target.value)}))}/></label><div className="button-row"><button onClick={()=>act(()=>chart.comparisons.update(row.id,{visible:!row.visible}))}>{row.visible?'Hide':'Show'}</button><button onClick={()=>act(()=>chart.comparisons.remove(row.id))}>Remove comparison</button></div></fieldset>)}</section></fieldset><footer><span role="alert">{error}</span><button onClick={onClose}>Close</button></footer></Modal>;
}
