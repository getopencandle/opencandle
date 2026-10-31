import React,{useEffect,useRef,useState} from 'react';
import type {AssetClass} from '../domain/types';
import {coinbaseOfferFor,ASSET_CLASS_LABELS,SOURCE_FILTER_LABELS,generatedLeads,noSymbolsMatch,rememberDepartedSymbol,type RecentSymbolStorage,sourceLabel,createSymbolSearchSession,formatBarDate,mergeAssetCandidates,recentSymbolRows,searchSymbols,switchRequest,syntheticGenerationCandidate,type SymbolSearchCandidate,type SymbolSearchFilters,type SymbolSearchOrigin,type SymbolSearchSession,type SymbolSwitchRequest} from './symbol-search';
import './symbol-search.css';
import {displayExchange} from '../domain/fixtures';
import {symbolMathCandidates} from './symbol-search';
import {isCanonicalSymbolMath} from '../domain/symbol-math';

export interface SymbolSearchDialogProps {
 /** Built once per universe with buildSymbolSearchCandidates(universe,workspace.imports). */
 candidates:readonly SymbolSearchCandidate[];
 /** Extra rows for the typed text (for example a live Alpaca row for any US ticker once a key is saved). */
 typedCandidates?:(query:string,candidates:readonly SymbolSearchCandidate[])=>readonly SymbolSearchCandidate[];
 /** Rows from the owner's Alpaca asset list for the typed text (alpacaAssetCandidates over
  * lv.searchAlpacaAssets). Asked once per query; an answer for an older query is dropped. A rejection's message is shown. */
 searchAssets?:(query:string)=>Promise<readonly SymbolSearchCandidate[]>;
 initialQuery?:string;origin:SymbolSearchOrigin;
 currentDatasetId?:string|null;
 /** Recent symbols, newest first (readRecentSymbols). With an empty query they are listed first under "Recent". */
 recent?:readonly string[];
 /** The current chart interval, for recent derived symbols (their Derived row opens at it). */
 resolution?:string;
 /** The current chart's symbol (else read from currentDatasetId), recorded in recents when a switch leaves it. */
 currentSymbol?:string|null;
 /** Where recents live; defaults to this computer's local storage (the store App reads recents from). */
 recentStorage?:RecentSymbolStorage|null;
 /** Charts the choice changes (linkedSymbolTargets); above 1 shows the symbol-sync notice. */
 linkedCharts?:number;
 assertOwner?:()=>void;
 /** Set while Coinbase live data is off; a crypto query then offers to turn it on. */
 onEnableCoinbase?:()=>void;
 /** Set when no live stock source is set up; an empty result then says live data is needed and links Data sources. */
 onOpenDataSources?:()=>void;
 /** Perform the actual chart switch. false keeps the dialog open with an error. */
 onSelect:(request:SymbolSwitchRequest)=>boolean|void;
 onClose:()=>void;
}
const defaultRecentStorage=():RecentSymbolStorage|null=>{try{return typeof window==='undefined'?null:window.localStorage??null;}catch{return null;}};
const LIST_ID='lv-symbol-search-results';
/** Source details for a row's tooltip (rows show symbol, name, exchange and type only). */
function rowDetail(row:SymbolSearchCandidate):string{return [row.providerName||row.providerId,row.resolution,row.barCount===null?(row.sourceKind==='expression'?'bars computed on open':'bars generated on open'):row.barCount.toLocaleString()+' bars',row.sourceKind==='generated'?'':'last bar '+formatBarDate(row.lastBarTime),'adjustment '+(row.adjustment||'unknown'),'revision '+(row.revision||'unknown'),row.coverage].filter(Boolean).join(' · ');}
interface AssetSearchState {query:string;status:'searching'|'done'|'error';rows:readonly SymbolSearchCandidate[];error:string|null}
function withTyped(props:SymbolSearchDialogProps,query:string,assets?:AssetSearchState|null):readonly SymbolSearchCandidate[]{const typed=[...props.typedCandidates?.(query,props.candidates)??[],...recentDerivedRows(props,query)];const base=typed.length?[...props.candidates,...typed]:props.candidates;const rows=assets&&assets.query===query.trim()?assets.rows:[];return rows.length?mergeAssetCandidates(base,rows):base;}
/** With an empty query, recent derived symbols are rows of their own (opened at the current chart interval). */
function recentDerivedRows(props:SymbolSearchDialogProps,query:string):SymbolSearchCandidate[]{if(query.trim()||!props.resolution)return[];const resolution=props.resolution;return(props.recent??[]).filter(isCanonicalSymbolMath).flatMap(symbol=>symbolMathCandidates(symbol,resolution)).filter(row=>!props.candidates.some(item=>item.key===row.key));}
/** Stable per-source option id, so aria-activedescendant changes whenever the row behind it does. */
function optionId(key:string){let hash=2166136261;for(let i=0;i<key.length;i++)hash=Math.imul(hash^key.charCodeAt(i),16777619);return 'lv-symbol-option-'+(hash>>>0).toString(36)+'-'+key.length;}
export function SymbolSearchDialog(props:SymbolSearchDialogProps){
 const latest=useRef(props);latest.current=props;
 const mounted=useRef(true),session=useRef<SymbolSearchSession|null>(null),ticket=useRef(0),inputRef=useRef<HTMLInputElement>(null),rootRef=useRef<HTMLDivElement>(null),autoKey=useRef<{ticket:number;key:string}|null>(null);
 if(!session.current){session.current=createSymbolSearchSession();ticket.current=session.current.begin();}
 const [query,setQuery]=useState(()=>props.initialQuery??''),[filters,setFilters]=useState<SymbolSearchFilters>({assetClass:'all',source:'all',exchange:'all'}),[highlight,setHighlight]=useState<string|null>(null),[error,setError]=useState('');
 useEffect(()=>{mounted.current=true;const previous=typeof document==='undefined'?null:document.activeElement as HTMLElement|null,input=inputRef.current;
  if(input){input.focus();if(latest.current.origin==='typed'){const end=input.value.length;input.setSelectionRange(end,end);}else input.select();}
  return()=>{mounted.current=false;if(previous?.isConnected&&typeof document!=='undefined'&&(document.activeElement===document.body||rootRef.current?.contains(document.activeElement)))previous.focus();};},[]);
 // Hooks after the existing ones so their order is unchanged: the Alpaca lookup for the typed text.
 const [assetSearch,setAssetSearch]=useState<AssetSearchState|null>(null),assetRef=useRef<AssetSearchState|null>(null),assetTicket=useRef(0);
 assetRef.current=assetSearch;
 useEffect(()=>{
  const search=latest.current.searchAssets,text=query.trim(),mine=++assetTicket.current;
  if(!search||!text){if(assetRef.current)setAssetSearch(null);return;}
  const set=(next:AssetSearchState)=>{if(!mounted.current||assetTicket.current!==mine)return;assetRef.current=next;setAssetSearch(next);};
  set({query:text,status:'searching',rows:assetRef.current?.query===text?assetRef.current.rows:[],error:null});
  let pending:Promise<readonly SymbolSearchCandidate[]>;try{pending=Promise.resolve(search(text));}catch(cause){pending=Promise.reject(cause);}
  pending.then(rows=>set({query:text,status:'done',rows:Array.isArray(rows)?rows:[],error:null}),cause=>set({query:text,status:'error',rows:[],error:cause instanceof Error?cause.message:String(cause)}));
 },[query]);
 const renderTicket=ticket.current,candidates=withTyped(props,query,assetSearch);
 const result=searchSymbols(candidates,query,filters),generated=filters.source==='imported'||filters.source==='live'?null:syntheticGenerationCandidate(query,candidates);
 const generatedVisible=generated&&(filters.assetClass==='all'||generated.assetClass===filters.assetClass)?generated:null;
 // With an empty query, recent symbols that pass the filters come first.
 const recentRows=query.trim()?[]:recentSymbolRows(result.rows,props.recent??[],filters.source==='all'||filters.source==='live'?props.resolution:undefined),recentKeys=new Set(recentRows.map(row=>row.key));
 const ranked=recentRows.length?[...recentRows,...result.rows.filter(row=>!recentKeys.has(row.key))]:result.rows;
 // An exact typed ticker leads (generatedLeads); a one-letter DEMO row stays last and is never auto-chosen.
 const coinbaseOffer=props.onEnableCoinbase?coinbaseOfferFor(query,false):[];
 const leads=!coinbaseOffer.length&&generatedLeads(query,generatedVisible,result.rows),options=generatedVisible?leads?[generatedVisible,...ranked]:[...ranked,generatedVisible]:ranked;
 // Auto-highlight the first row unless it is a trailing DEMO row.
 // A highlight that disappears (source removed, re-imported or generation row withdrawn) never falls back
 // to another source, whether the user chose it or it was the automatic first row of this search. The
 // automatic row is also sticky: a new better-ranked arrival does not silently take its place.
 const kept=highlight===null?null:options.find(row=>row.key===highlight)??null;
 const priorAuto=highlight===null&&autoKey.current?.ticket===renderTicket?autoKey.current.key:null,autoRow=priorAuto===null?null:options.find(row=>row.key===priorAuto)??null;
 const lost=highlight!==null?!kept:priorAuto!==null&&!autoRow;
 const active=lost?null:highlight!==null?kept:autoRow??(leads?generatedVisible:ranked[0])??null,activeIndex=active?options.indexOf(active):-1;
 if(highlight===null&&!lost)autoKey.current=active?{ticket:renderTicket,key:active.key}:null;
 const exchanges=[...new Set(candidates.map(row=>row.exchange).filter(Boolean))].sort();
 const classes=[...new Set(candidates.map(row=>row.assetClass))].sort((a,b)=>Object.keys(ASSET_CLASS_LABELS).indexOf(a)-Object.keys(ASSET_CLASS_LABELS).indexOf(b));
 function restart(){const s=session.current!;if(s.closed)return false;ticket.current=s.begin();return true;}
 function changeQuery(value:string){if(!restart())return;setQuery(value.slice(0,80));setHighlight(null);setError('');}
 function changeFilters(next:SymbolSearchFilters){if(!restart())return;setFilters(next);setHighlight(null);setError('');}
 function cancel(){if(!mounted.current||!session.current!.close())return;latest.current.onClose();}
 function choose(row:SymbolSearchCandidate|null,at:number){
  const s=session.current!;if(!mounted.current||s.closed||s.busy)return;
  try{
   if(!row)throw Error(lost?'The highlighted result is no longer available. Choose a current result.':query.trim()?noSymbolsMatch(query):'Type a symbol or choose a result.');
   latest.current.assertOwner?.();
   const accepted=s.choose(at,row,withTyped(latest.current,query,assetRef.current),query,()=>{const now=latest.current,from=now.currentSymbol??now.candidates.find(item=>item.datasetId===now.currentDatasetId)?.symbol;rememberDepartedSymbol(now.recentStorage===undefined?defaultRecentStorage():now.recentStorage,from,row.symbol);const outcome=latest.current.onSelect(switchRequest(row,latest.current.origin));return outcome;});
   if(accepted)latest.current.onClose();
  }catch(cause){if(mounted.current&&!s.closed)setError(cause instanceof Error?cause.message:String(cause));}
 }
 function move(delta:number){if(!options.length)return;const next=activeIndex<0?0:Math.min(options.length-1,Math.max(0,activeIndex+delta));setHighlight(options[next].key);setError('');}
 function inputKey(event:React.KeyboardEvent<HTMLInputElement>){
  if(event.nativeEvent?.isComposing)return;
  if(event.key==='ArrowDown'){event.preventDefault();move(1);}
  else if(event.key==='ArrowUp'){event.preventDefault();move(-1);}
  else if(event.key==='PageDown'){event.preventDefault();move(10);}
  else if(event.key==='PageUp'){event.preventDefault();move(-10);}
  else if(event.key==='Home'&&options.length&&(event.ctrlKey||!query)){event.preventDefault();move(-options.length);}
  else if(event.key==='End'&&options.length&&(event.ctrlKey||!query)){event.preventDefault();move(options.length);}
  else if(event.key==='Enter'){event.preventDefault();choose(active,renderTicket);}
 }
 function dialogKey(event:React.KeyboardEvent<HTMLDivElement>){
  if(event.nativeEvent?.isComposing)return;
  if(event.key==='Escape'){event.stopPropagation();event.preventDefault();cancel();return;}
  if(event.key==='Tab'&&rootRef.current){const list=Array.from(rootRef.current.querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled),select:not(:disabled),[tabindex="0"]')).filter(x=>x.offsetParent!==null);if(event.shiftKey&&document.activeElement===list[0]){event.preventDefault();list.at(-1)?.focus();}else if(!event.shiftKey&&document.activeElement===list.at(-1)){event.preventDefault();list[0]?.focus();}}
 }
 // With supplied matches, the count names every listed row, including the DEMO row (UI audit 1028 #13).
 const shown=result.total+(generatedVisible?1:0);
 const status=!candidates.length&&!generatedVisible?'No instruments are available. Import data to make it searchable.':!result.total?(query.trim()?noSymbolsMatch(query.toUpperCase())+(generatedVisible?' Open it as a demo symbol.':''):noSymbolsMatch('')):shown+' result'+(shown===1?'':'s')+(result.truncated?', showing the first '+result.rows.length+'. Refine the search to see the rest.':'');
 const assetStatus=!assetSearch||assetSearch.query!==query.trim()?'':assetSearch.status==='searching'?' Searching Alpaca...':assetSearch.status==='error'?' Alpaca search failed: '+assetSearch.error:'';
 return <div className="modal-shade" onMouseDown={event=>{if(event.target===event.currentTarget)cancel();}}>
  <div className="lv-modal symbol-search-dialog" role="dialog" aria-modal="true" aria-label="Symbol search" ref={rootRef} onKeyDown={dialogKey}>
   <header><h2>Symbol search</h2><button type="button" aria-label="Close Symbol search" onClick={cancel}>×</button></header>
   <div className="symbol-search-controls">
    <input ref={inputRef} role="combobox" aria-label="Search symbols" aria-autocomplete="list" aria-expanded={options.length>0} aria-controls={LIST_ID} aria-activedescendant={active?optionId(active.key):undefined} placeholder="Ticker, name, or EXCHANGE:TICKER" value={query} spellCheck={false} autoComplete="off" onChange={event=>changeQuery(event.target.value)} onKeyDown={inputKey}/>
    <div className="symbol-search-filters">
     <div role="group" aria-label="Instrument type">{(['all',...classes] as ('all'|AssetClass)[]).map(id=><button type="button" key={id} aria-pressed={filters.assetClass===id} className={filters.assetClass===id?'active':''} onClick={()=>changeFilters({...filters,assetClass:id})}>{id==='all'?'All':ASSET_CLASS_LABELS[id]}</button>)}</div>
     <select aria-label="Source filter" value={filters.source} onChange={event=>changeFilters({...filters,source:event.target.value as SymbolSearchFilters['source']})}>{(['all','imported','synthetic','live'] as const).map(id=><option key={id} value={id}>{SOURCE_FILTER_LABELS[id]}</option>)}</select>
     <select aria-label="Exchange filter" value={filters.exchange??'all'} onChange={event=>changeFilters({...filters,exchange:event.target.value})}><option value="all">All exchanges</option>{exchanges.map(exchange=><option key={exchange} value={exchange}>{displayExchange(exchange)}</option>)}</select>
    </div>
    {(props.linkedCharts??1)>1&&<p className="symbol-search-linked">Symbol sync is on: this choice changes {props.linkedCharts} linked charts. If a linked chart's interval has no supplied history for the chosen source, no chart changes.</p>}
    {coinbaseOffer.length>0&&<p className="symbol-search-offer">{coinbaseOffer.join(', ')} live data comes from Coinbase, which is turned off. <button type="button" onClick={()=>{latest.current.onEnableCoinbase?.();/* This button goes away once Coinbase is on; focus returns to the search field so Enter opens the top row. */inputRef.current?.focus({preventScroll:true});setTimeout(()=>{if(mounted.current&&typeof document!=='undefined'&&(document.activeElement===document.body||document.activeElement===null))inputRef.current?.focus({preventScroll:true});},0);}}>Turn on Coinbase live data</button></p>}
    <p className="symbol-search-status" role="status">{lost?'The highlighted result changed. ':''}{status}{assetStatus}</p>{props.onOpenDataSources&&!result.total&&<p className="symbol-search-status symbol-search-needs-live">Live data is needed to find more symbols. <button type="button" onClick={props.onOpenDataSources}>Open Data sources</button></p>}
   </div>
   <ul id={LIST_ID} className="symbol-search-results" role="listbox" aria-label="Symbol results">
    {options.map((row,index)=><React.Fragment key={row.key}>
     {recentRows.length>0&&(index===0||index===recentRows.length)&&<li role="presentation" className="symbol-search-section">{index===0?'Recent':'All symbols'}</li>}
     <li key={row.key} id={optionId(row.key)} role="option" aria-selected={row===active} aria-disabled={!row.openable||undefined} title={rowDetail(row)} className={'symbol-search-row'+(row===active?' active':'')+(row.openable?'':' unavailable')+(row.sourceKind==='generated'?' generated':'')} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(row,renderTicket)}>
     <div className="symbol-search-main"><strong>{row.symbol}</strong><span className="symbol-search-name">{row.name&&row.name!==row.symbol?row.name:''}</span><span className="symbol-search-exchange">{row.exchange?displayExchange(row.exchange):'Exchange not supplied'}</span><span className="symbol-search-type">{ASSET_CLASS_LABELS[row.assetClass]??''}</span><span className={row.synthetic?'synthetic-badge':'symbol-search-source'}>{sourceLabel(row)}</span>{row.datasetId===props.currentDatasetId&&<span className="symbol-search-current">Current chart</span>}</div>
     {!row.openable&&<div className="symbol-search-reason">Unavailable: {row.unavailableReason}</div>}
     {row.openable&&row.notice&&<div className="symbol-search-reason">{row.notice}</div>}
    </li></React.Fragment>)}
   </ul>
   <footer><span role="alert">{error}</span><small>↑↓ move · Enter open · Esc close</small></footer>
  </div>
 </div>;
}
