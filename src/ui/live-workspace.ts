import {COINBASE_PROVIDER_ID,COINBASE_RESOLUTIONS,coinbaseResolution,coinbaseSearchDatasets} from '../domain/coinbase-live';
import {ALPACA_IEX_PROVIDER_ID,ALPACA_RESOLUTIONS,alpacaResolution,alpacaSearchDatasets} from '../domain/alpaca-live';
import type {BarDataset} from '../domain/types';
import {fixtureDataset,fixtureInstrument,FIXTURE_CAPABILITIES} from '../domain/fixtures';
import {parseInterval} from '../domain/intervals';
import {validateCellSession,type CellSession} from '../chart/cell-session';
import {LAYOUT_LIBRARY_LIMIT} from './layout-library';
import {isLiveDatasetId,isLiveProviderId} from '../domain/live-provider';
import {registerLiveDataset,liveDatasetById,publishLiveDataset} from './live-registry';
import {FRED_PROVIDER_ID,FRED_SERIES_ID,FRED_RESOLUTION,fredDataset,fredDatasetId,loadFredDataset,fredNotice} from '../domain/fred';
import {ALPACA_SYMBOL,ALPACA_MAX_SYMBOLS,ALPACA_STUB_PROVIDER_ID} from '../domain/alpaca-live';
import type {MultiChartComparison,MultiChartState} from './MultiChartGrid';
import {projectGrid,transitionGridDrawingScopes,workspaceDatasets,type ChartWorkspace} from './workspace-grid';
import {resetIncompatibleFrame} from './frame-reset-policy';
import {parseSymbolMath,symbolMathComponentSource} from '../domain/symbol-math';
import {SYMBOL_MATH_PROVIDER_ID,isSymbolMathDatasetId,symbolMathPlaceholder} from '../domain/symbol-math-live';

/** Persisted live-data choices. The Alpaca key is never part of a workspace. */
/** AlpacaPlan is stored only when 'paid'; absent means the Free plan (the default). */
export interface LiveDataChoices {coinbase:boolean;alpacaSymbols:string[];alpacaPlan?:'paid';/** False turns FRED downloads off (saved copies only). Absent means on. */fred?:false}
export function liveDataOf(workspace:{liveData?:unknown}):LiveDataChoices{
 const value=workspace.liveData;if(!value||typeof value!=='object')return{coinbase:false,alpacaSymbols:[]};
 const row=value as {coinbase?:unknown;alpacaSymbols?:unknown;alpacaPlan?:unknown;fred?:unknown};
 return{...(row.fred===false?{fred:false as const}:{}),...(row.alpacaPlan==='paid'?{alpacaPlan:'paid' as const}:{}),coinbase:row.coinbase===true,alpacaSymbols:Array.isArray(row.alpacaSymbols)?row.alpacaSymbols.filter((item):item is string=>typeof item==='string'&&ALPACA_SYMBOL.test(item)).slice(0,ALPACA_MAX_SYMBOLS):[]};
}
/** Strict form for restore: a present value must be exact. */
export function restoreLiveData(value:unknown):LiveDataChoices{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid live data settings.');
 const row=value as Record<string,unknown>;
 if(Object.keys(row).some(key=>key!=='coinbase'&&key!=='alpacaSymbols'&&key!=='alpacaPlan'&&key!=='fred')||(row.fred!==undefined&&row.fred!==false)||(row.alpacaPlan!==undefined&&row.alpacaPlan!=='free'&&row.alpacaPlan!=='paid')||typeof row.coinbase!=='boolean'||!Array.isArray(row.alpacaSymbols)||row.alpacaSymbols.length>ALPACA_MAX_SYMBOLS||row.alpacaSymbols.some(item=>typeof item!=='string'||!ALPACA_SYMBOL.test(item)))throw new Error('Invalid live data settings.');
 return{...(row.fred===false?{fred:false as const}:{}),coinbase:row.coinbase,alpacaSymbols:[...new Set(row.alpacaSymbols as string[])],...(row.alpacaPlan==='paid'?{alpacaPlan:'paid' as const}:{})};
}

/** `drop` limits the move to the live feeds it names (a source being turned off); without it every live feed moves. */
function sanitizeGrid(workspace:ChartWorkspace,grid:MultiChartState,drop?:(ref:LiveChartRef)=>boolean):MultiChartState{
 const dropped=(id:string|undefined)=>{if(!isLiveDatasetId(id))return false;if(!drop)return true;const ref=liveRefOfDatasetId(id);return !!ref&&drop(ref);};
 if(!grid.layout.cells.some(row=>dropped(grid.cells[row.id]?.datasetId)||grid.cells[row.id]?.comparisons.some(item=>dropped(item.datasetId))))return grid;
 const next=structuredClone(grid) as MultiChartState,oldSources=workspaceDatasets({...workspace,grid});
 // A saved layout can name a live feed that is no longer open (an earlier live interval, or the source
 // was just turned off). Its labelled stand-in (same dataset id) is the old source, so the drawing-scope transition resolves.
 for(const row of grid.layout.cells){
  const id=grid.cells[row.id]?.datasetId,ref=liveRefOfDatasetId(id);if(!ref||oldSources.some(item=>item.provenance.datasetId===id))continue;
  const holder=liveChartPlaceholder(ref,false);if(holder&&holder.provenance.datasetId===id&&holder.instrument.symbol===row.symbol&&holder.resolution===row.interval)oldSources.push(holder);
 }
 for(const row of next.layout.cells){
  const cell=next.cells[row.id];
  const comparisons=cell.comparisons.filter(item=>!dropped(item.datasetId));
  if(!dropped(cell.datasetId)){if(comparisons.length!==cell.comparisons.length)next.cells[row.id]={...cell,comparisons};continue;}
  const fallback=fixtureDataset(row.symbol,500);row.interval=fallback.resolution;
  const {session:_desiredLiveSession,...fallbackCell}=cell;
   next.cells[row.id]={...fallbackCell,datasetId:fallback.provenance.datasetId,comparisons};
 }
 const newSources=workspaceDatasets({...workspace,grid:next});
 for(const row of next.layout.cells)next.cells[row.id]=resetIncompatibleFrame(grid.cells[row.id],next.cells[row.id],oldSources,newSources);
 return transitionGridDrawingScopes(grid,next,oldSources,newSources);
}
/** A saved reference to a live chart: which feed, symbol and interval. Never bars, never a key. */
export interface LiveChartRef {providerId:string;symbol:string;interval:string}
/** Desired chart settings belong to saved references, never to comparison/feed-open requests. */
interface SavedLiveBasis extends LiveChartRef {session?:CellSession['session']}
type SavedLiveLayoutContext=(SavedLiveBasis&{layoutId:string})|{layoutId:string;live:false};
export interface SavedLiveChartRef extends SavedLiveBasis {working?:false;layouts?:SavedLiveLayoutContext[]}
type SavedLiveOwner=ChartWorkspace&{layoutLibrary?:{entries:Array<{id?:string;grid:MultiChartState}>}};
const REF_KEYS=['providerId','symbol','interval'];
const SAVED_REF_KEYS=[...REF_KEYS,'session','working','layouts'];
const SAVED_LAYOUT_KEYS=[...REF_KEYS,'session','layoutId','live'];
/** Either Alpaca live namespace (owner key, or the keyless synthetic stub). Which one this session uses is
 * known only once main reports the key status, and that can arrive after the saved workspace was read, so a reference in
 * either namespace is valid; `sessionRef` moves it to this session's namespace when it is put back on a chart. */
const isAlpacaLiveId=(providerId:string)=>providerId==='alpaca-iex'||providerId===ALPACA_STUB_PROVIDER_ID;
/** A derived (symbol math) chart reference names its canonical expression and an interval a live feed supports. */
const symbolMathRefOk=(ref:LiveChartRef)=>{const parsed=parseSymbolMath(ref.symbol);return parsed.ok&&parsed.expression.ast.kind!=='sym'&&parsed.expression.canonical===ref.symbol;};
const symbolMathIntervalOk=(expression:string,interval:string)=>{const parsed=parseSymbolMath(expression);if(!parsed.ok)return false;const sources=new Set(parsed.expression.symbols.map(symbolMathComponentSource));return(!sources.has('coinbase')||coinbaseResolution(interval)===interval)&&(!sources.has('alpaca-or-import')||alpacaResolution(interval)===interval);};
const refSupported=(ref:LiveChartRef)=>ref.providerId===FRED_PROVIDER_ID?ref.interval===FRED_RESOLUTION:ref.providerId===SYMBOL_MATH_PROVIDER_ID?symbolMathIntervalOk(ref.symbol,ref.interval):ref.providerId===COINBASE_PROVIDER_ID?coinbaseResolution(ref.interval)===ref.interval:isAlpacaLiveId(ref.providerId)&&alpacaResolution(ref.interval)===ref.interval;
const refSymbolOk=(ref:LiveChartRef)=>ref.providerId===FRED_PROVIDER_ID?FRED_SERIES_ID.test(ref.symbol):ref.providerId===SYMBOL_MATH_PROVIDER_ID?symbolMathRefOk(ref):/^[A-Z0-9.^_-]{1,24}$/.test(ref.symbol)&&(!isAlpacaLiveId(ref.providerId)||ALPACA_SYMBOL.test(ref.symbol));
const sessionRef=<R extends LiveChartRef>(ref:R):R=>isAlpacaLiveId(ref.providerId)&&ref.providerId!==ALPACA_IEX_PROVIDER_ID?{...ref,providerId:ALPACA_IEX_PROVIDER_ID}:ref;
/** The cell still shows the empty Disconnected stand-in of this reference (put there while its source was
 * off or the key status was not known yet), so it is still waiting for its feed. An opened feed always has a snapshot of its own. */
const sameFeed=(ref:LiveChartRef,datasetId:string|undefined)=>{const shown=liveRefOfDatasetId(datasetId);return !!shown&&shown.symbol===ref.symbol&&shown.interval===ref.interval&&(shown.providerId===ref.providerId||isAlpacaLiveId(shown.providerId)&&isAlpacaLiveId(ref.providerId));};
const waitingStandIn=(ref:LiveChartRef,datasetId:string|undefined)=>{const shown=liveDatasetById(datasetId);return !!shown&&sameFeed(ref,datasetId)&&shown.provenance.state==='disconnected'&&!shown.bars.length;};
/** Plain message while main has not answered the Alpaca key check (it did not settle in time this start). */
export const ALPACA_KEY_WAIT_MESSAGE='Waiting for the Alpaca key check. Open Settings > Data sources if this persists.';
const standInMessage=(ref:Pick<LiveChartRef,'providerId'|'symbol'>,availability:LiveAvailability)=>availability.alpacaPending&&isAlpacaLiveId(ref.providerId)?ALPACA_KEY_WAIT_MESSAGE:disconnectedLiveMessage(ref);
/** A waiting stand-in shows the message for the current availability (the key check may have answered since). */
function refreshStandIn(ref:LiveChartRef,datasetId:string,availability:LiveAvailability):void{
 const message=standInMessage(ref,availability),holder=liveChartPlaceholder(ref,false,message);
 if(holder&&holder.provenance.datasetId===datasetId&&liveDatasetById(datasetId)?.provenance.notes[0]!==message)registerLiveDataset(holder);
}
/** Parse `live:<provider>:<symbol>:<interval>`; null for anything else. */
export function liveRefOfDatasetId(datasetId:unknown):LiveChartRef|null{
 if(!isLiveDatasetId(datasetId))return null;const parts=(datasetId as string).split(':');
 if(parts.length!==4||(parts[0]==='fred')!==(parts[1]===FRED_PROVIDER_ID)||!isLiveProviderId(parts[1])&&parts[1]!==SYMBOL_MATH_PROVIDER_ID&&parts[1]!==FRED_PROVIDER_ID)return null;
 const ref={providerId:parts[1],symbol:parts[2],interval:parts[3]};return refSupported(ref)&&refSymbolOk(ref)?ref:null;
}
/** Read own plain data only. New saved settings must never invoke an accessor. */
function savedRecord(value:unknown,allowed:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Invalid saved live chart.');
 const keys=Reflect.ownKeys(value);if(keys.length>allowed.length||keys.some(key=>typeof key!=='string'||!allowed.includes(key)))throw Error('Invalid saved live chart.');
 const out:Record<string,unknown>={};for(const key of keys as string[]){const descriptor=Object.getOwnPropertyDescriptor(value,key)!;if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))throw Error('Invalid saved live chart.');Object.defineProperty(out,key,{value:descriptor.value,enumerable:true});}return out;
}
function savedBasis(row:Record<string,unknown>):SavedLiveBasis{
 if(REF_KEYS.some(key=>typeof row[key]!=='string'))throw Error('Invalid saved live chart.');
 const ref:SavedLiveBasis={providerId:row.providerId as string,symbol:row.symbol as string,interval:row.interval as string};
 if(!refSupported(ref)||!refSymbolOk(ref))throw Error('Invalid saved live chart.');
 if(Object.hasOwn(row,'session')){validateCellSession(row.session);if(row.session===undefined)throw Error('Invalid saved live chart session.');
  /* A choice saved on 1D and longer is dormant (cellSessionDormant) and applies again on an intraday interval. */
  const interval=parseInterval(ref.interval);if(!isAlpacaLiveId(ref.providerId)||interval.kind!=='time')throw Error('Saved trading sessions require a US equity source.');ref.session=row.session;
 }return ref;
}
// These are the preexisting key-status aliases of one selected Alpaca feed, not numeric source authority.
const sameSavedBasis=(left:SavedLiveBasis,right:SavedLiveBasis)=>(left.providerId===right.providerId||isAlpacaLiveId(left.providerId)&&isAlpacaLiveId(right.providerId))&&left.symbol===right.symbol&&left.interval===right.interval&&left.session===right.session;
function ownSaved(value:unknown,key:string):unknown{
 if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Invalid saved live context owner.');
 const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor)return undefined;if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))throw Error('Invalid saved live context owner.');return descriptor.value;
}
function savedGridRows(value:unknown):{grid:MultiChartState;id:string;rows:Array<{id:string;symbol:string}>}{
 const layout=ownSaved(value,'layout'),id=ownSaved(layout,'id'),rows=ownSaved(layout,'cells');
 if(typeof id!=='string'||!id||!Array.isArray(rows)||Object.getPrototypeOf(rows)!==Array.prototype||rows.length>256)throw Error('Invalid saved live context owner.');
 const seen=new Set<string>(),metadata:Array<{id:string;symbol:string}>=[];
 for(let index=0;index<rows.length;index++){const descriptor=Object.getOwnPropertyDescriptor(rows,index);if(!descriptor||!Object.hasOwn(descriptor,'value'))throw Error('Invalid saved live context owner.');const cellId=ownSaved(descriptor.value,'id'),symbol=ownSaved(descriptor.value,'symbol');if(typeof cellId!=='string'||typeof symbol!=='string'||seen.has(cellId))throw Error('Invalid saved live context owner.');seen.add(cellId);metadata.push({id:cellId,symbol});}
 return{grid:value as MultiChartState,id,rows:metadata};
}
function ownerLayouts(owner:SavedLiveOwner):Array<{id:string;grid:MultiChartState}>{
 const book=ownSaved(owner,'layoutLibrary'),entries=book===undefined?[]:ownSaved(book,'entries');if(!Array.isArray(entries)||Object.getPrototypeOf(entries)!==Array.prototype||entries.length>LAYOUT_LIBRARY_LIMIT)throw Error('Invalid saved live layout contexts.');
 const result:Array<{id:string;grid:MultiChartState}>=[],ids=new Set<string>(),cells=new Set<string>();
 for(let index=0;index<entries.length;index++){const descriptor=Object.getOwnPropertyDescriptor(entries,index);if(!descriptor||!Object.hasOwn(descriptor,'value'))throw Error('Invalid saved live layout context.');const entry=descriptor.value,metadata=savedGridRows(ownSaved(entry,'grid')),entryId=ownSaved(entry,'id');
  if(ids.has(metadata.id)||entryId!==undefined&&entryId!==metadata.id)throw Error('Invalid saved live layout context.');ids.add(metadata.id);
  for(const cell of metadata.rows){if(cells.has(cell.id))throw Error('A saved live chart identity belongs to multiple layouts.');cells.add(cell.id);}result.push({id:metadata.id,grid:metadata.grid});
 }return result;
}
function readSavedRef(value:unknown,cellId:string,owner?:SavedLiveOwner):SavedLiveChartRef{
 const row=savedRecord(value,SAVED_REF_KEYS),ref:SavedLiveChartRef=savedBasis(row),contextual=Object.hasOwn(row,'session')||Object.hasOwn(row,'working')||Object.hasOwn(row,'layouts');
 if(!contextual)return ref;
 if(!owner)throw Error('Saved live chart contexts require their owner workspace.');
 const workingMetadata=savedGridRows(ownSaved(owner,'grid')),layouts=ownerLayouts(owner),working=workingMetadata.rows.find(cell=>cell.id===cellId),saved=layouts.filter(entry=>entry.grid.layout.cells.some(cell=>cell.id===cellId));
 if(!working&&!saved.length)throw Error('Saved live chart has a foreign chart identity.');
 if(Object.hasOwn(row,'working')){if(row.working!==false||!working||isLiveDatasetId(workingMetadata.grid.cells[cellId]?.datasetId))throw Error('Invalid saved live working context.');ref.working=false;}
 else if(working&&(working.symbol!==ref.symbol||!savedTargetMatches(workingMetadata.grid,cellId,ref)))throw Error('Saved live chart disagrees with its working source.');
 if(Object.hasOwn(row,'layouts')){
  if(!Array.isArray(row.layouts)||Object.getPrototypeOf(row.layouts)!==Array.prototype||row.layouts.length<1||row.layouts.length>layouts.length)throw Error('Invalid saved live layout contexts.');
  const count=row.layouts.length,fields=Reflect.ownKeys(row.layouts);if(fields.length!==count+1||fields.some(key=>key!=='length'&&(typeof key!=='string'||!/^\d+$/.test(key)||Number(key)>=count)))throw Error('Invalid saved live layout contexts.');
  const seen=new Set<string>();ref.layouts=[];
  for(let index=0;index<row.layouts.length;index++){const descriptor=Object.getOwnPropertyDescriptor(row.layouts,index);if(!descriptor||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))throw Error('Invalid saved live layout context.');
   const data=savedRecord(descriptor.value,SAVED_LAYOUT_KEYS),layoutId=data.layoutId;if(typeof layoutId!=='string'||seen.has(layoutId))throw Error('Duplicate or invalid saved live layout context.');seen.add(layoutId);
   const layout=layouts.find(entry=>entry.id===layoutId),cell=layout?.grid.layout.cells.find(entry=>entry.id===cellId);if(!cell)throw Error('Saved live chart has a foreign layout or chart identity.');
   if(Object.hasOwn(data,'live')){if(data.live!==false||Object.keys(data).length!==2||isLiveDatasetId(layout!.grid.cells[cellId]?.datasetId))throw Error('Invalid saved local layout context.');ref.layouts.push({layoutId,live:false});}
   else{const basis=savedBasis(data);if(basis.symbol!==cell.symbol||!savedTargetMatches(layout!.grid,cellId,basis)||ref.working!==false&&sameSavedBasis(basis,ref))throw Error('Invalid or redundant saved live layout context.');ref.layouts.push({layoutId,...basis});}
  }
 }
 if(ref.working===false&&!ref.layouts?.some(context=>!('live'in context)&&sameSavedBasis(context,ref)))throw Error('Saved-only live chart is missing its layout context.');
 if(!working&&(!saved[0]||!savedTargetMatches(saved[0].grid,cellId,ref)))throw Error('Saved live chart disagrees with its layout source.');
 return ref;
}
/** Lenient reader: malformed rows are skipped, but contextual settings require exact workspace ownership. */
export function liveChartsOf(source:object):Record<string,SavedLiveChartRef>{
 const value=(source as {liveCharts?:unknown}).liveCharts,out:Record<string,SavedLiveChartRef>={};if(!value||typeof value!=='object'||Array.isArray(value))return out;
 for(const cellId of Object.keys(value).slice(0,256)){try{const descriptor=Object.getOwnPropertyDescriptor(value,cellId);if(!descriptor||!Object.hasOwn(descriptor,'value'))continue;const ref=readSavedRef(descriptor.value,cellId,source as SavedLiveOwner);Object.defineProperty(out,cellId,{value:ref,enumerable:true,configurable:true,writable:true});}catch{/* A malformed saved row cannot reattach a chart. */}}
 return out;
}
/** Strict form for restore. Legacy flat feed references retain their one-argument contract. */
export function restoreLiveCharts(value:unknown,owner?:SavedLiveOwner):Record<string,SavedLiveChartRef>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Invalid saved live charts.');
 const keys=Reflect.ownKeys(value);if(keys.length>256||keys.some(key=>typeof key!=='string'))throw Error('Invalid saved live charts.');const out:Record<string,SavedLiveChartRef>={};
 for(const cellId of keys as string[]){const descriptor=Object.getOwnPropertyDescriptor(value,cellId)!;if(!cellId||cellId.length>128||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))throw Error('Invalid saved live chart.');Object.defineProperty(out,cellId,{value:readSavedRef(descriptor.value,cellId,owner),enumerable:true,configurable:true,writable:true});}return out;
}
/** Only an Alpaca reference carries a session (savedBasis). A choice left dormant on a Coinbase, FRED or
 * derived chart after a symbol switch is not written, so the saved file still restores. */
function gridLiveRefs(grid:MultiChartState,into:Record<string,SavedLiveChartRef>):void{
 for(const row of grid.layout.cells){const cell=grid.cells[row.id],ref=liveRefOfDatasetId(cell?.datasetId);if(ref){validateCellSession(cell.session);into[row.id]={...ref,...(cell.session===undefined||!isAlpacaLiveId(ref.providerId)?{}:{session:cell.session})};}}
}
/** The working chart and its saved entry may share an id without sharing a desired source/session. */
function savedLiveRefs(workspace:SavedLiveOwner):Record<string,SavedLiveChartRef>{
 const refs:Record<string,SavedLiveChartRef>={};if(!workspace.grid)return refs;const layouts=ownerLayouts(workspace),sessionCells=new Set<string>();
 // Preserve the legacy flat writer for every provider when no explicit per-cell session exists.
 for(const grid of [workspace.grid,...layouts.map(entry=>entry.grid)])for(const row of grid.layout.cells)if(grid.cells[row.id]?.session!==undefined)sessionCells.add(row.id);
 gridLiveRefs(workspace.grid,refs);
 for(const entry of layouts){const saved:Record<string,SavedLiveChartRef>={};gridLiveRefs(entry.grid,saved);
  for(const row of entry.grid.layout.cells){const cellId=row.id,ref=saved[cellId],current=refs[cellId];
   if(!sessionCells.has(cellId)){if(ref)refs[cellId]=ref;continue;}
   if(!ref){if(current)(current.layouts??=[]).push({layoutId:entry.id,live:false});continue;}
   if(!current){if(workspace.grid.cells[cellId])refs[cellId]={...ref,working:false,layouts:[{layoutId:entry.id,...ref}]};else refs[cellId]=ref;}
   else if(!sameSavedBasis(current,ref)){(current.layouts??=[]).push({layoutId:entry.id,...ref});}
  }
 }return refs;
}
function selectSavedRef(workspace:ChartWorkspace,grid:MultiChartState,cellId:string,value:LiveChartRef):{ref:SavedLiveBasis;qualified:boolean}|null{
 const saved=readSavedRef(value,cellId,workspace as SavedLiveOwner),qualified=Object.hasOwn(saved,'session')||Object.hasOwn(saved,'layouts')||Object.hasOwn(saved,'working');
 if(grid===workspace.grid)return saved.working===false?null:{ref:saved,qualified};
 const contextual=saved.layouts?.find(row=>row.layoutId===grid.layout.id);if(contextual&&'live'in contextual)return null;
 const ref=contextual??(saved.working===false?null:saved);return ref?{ref,qualified}:null;
}
function exactSavedFallback(grid:MultiChartState,cellId:string,ref:SavedLiveBasis):boolean{
 const row=grid.layout.cells.find(cell=>cell.id===cellId),cell=grid.cells[cellId],symbol=fixtureInstrument(ref.symbol).symbol;
 return !!row&&!!cell&&row.symbol===symbol&&row.interval==='1D'&&cell.datasetId===FIXTURE_CAPABILITIES.id+':'+symbol&&cell.session===undefined;
}
function savedTargetMatches(grid:MultiChartState,cellId:string,ref:SavedLiveBasis):boolean{
 if(exactSavedFallback(grid,cellId,ref))return true;
 const row=grid.layout.cells.find(cell=>cell.id===cellId),shown=liveRefOfDatasetId(grid.cells[cellId]?.datasetId);
 return !!row&&!!shown&&row.symbol===ref.symbol&&row.interval===ref.interval&&sameSavedBasis({...shown,session:ref.session},ref);
}
const reopenChart=(cellId:string,ref:LiveChartRef):LiveReopen=>({cellId,providerId:ref.providerId,symbol:ref.symbol,interval:ref.interval});
/** A saved live comparison. Which feed it follows (provider, symbol, interval), its own
 * settings and its place in the chart's comparison list. Never bars, never a key. Saved under `liveComparisons` per chart cell,
 * because the chart's stored comparisons must name sources a restored file can resolve (the live feed is not open yet). */
export interface LiveComparisonRef extends LiveChartRef {position:number;comparison:Omit<MultiChartComparison,'datasetId'>}
const COMPARISON_REF_KEYS=['providerId','symbol','interval','position','comparison'],COMPARISON_KEYS=['id','mode','color','width','visible','baseline'];
function comparisonRefOf(value:unknown):LiveComparisonRef|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;const row=value as Record<string,unknown>,item=row.comparison as Record<string,unknown>|null;
 if(Object.keys(row).some(key=>!COMPARISON_REF_KEYS.includes(key))||typeof row.providerId!=='string'||typeof row.symbol!=='string'||typeof row.interval!=='string'||!Number.isSafeInteger(row.position)||(row.position as number)<0||(row.position as number)>=1000)return null;
 // An optional placement ('same-scale' or 'new-pane'; absent is the original own price scale).
 const placed=Object.hasOwn(item??{},'placement');
 if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).length!==COMPARISON_KEYS.length+(placed?1:0)||Object.keys(item).some(key=>!COMPARISON_KEYS.includes(key)&&key!=='placement'))return null;
 if(placed&&!['same-scale','new-pane'].includes(item.placement as string))return null;
 if(typeof item.id!=='string'||!item.id||item.id.length>128||!['absolute','percent','indexed'].includes(item.mode as string)||!['first-visible-match','first-loaded-match'].includes(item.baseline as string)||typeof item.color!=='string'||!item.color.trim()||item.color.length>64||typeof item.width!=='number'||!Number.isFinite(item.width)||item.width<=0||item.width>100||typeof item.visible!=='boolean')return null;
 const ref={providerId:row.providerId,symbol:row.symbol,interval:row.interval};if(!refSupported(ref)||!refSymbolOk(ref))return null;
 return{...ref,position:row.position as number,comparison:{id:item.id,mode:item.mode as MultiChartComparison['mode'],color:item.color,width:item.width,visible:item.visible,baseline:item.baseline as MultiChartComparison['baseline'],...(placed?{placement:item.placement as NonNullable<MultiChartComparison['placement']>}:{})}};
}
/** Lenient reader (older or newer workspaces): unusable rows and duplicate comparison ids are skipped. */
export function liveComparisonsOf(source:object):Record<string,LiveComparisonRef[]>{
 const value=(source as {liveComparisons?:unknown}).liveComparisons,out:Record<string,LiveComparisonRef[]>={};if(!value||typeof value!=='object'||Array.isArray(value))return out;
 for(const [cellId,rows] of Object.entries(value)){
  if(!Array.isArray(rows))continue;const seen=new Set<string>(),kept:LiveComparisonRef[]=[];
  for(const row of rows){const ref=comparisonRefOf(row);if(ref&&!seen.has(ref.comparison.id)){seen.add(ref.comparison.id);kept.push(ref);}}
  if(kept.length)out[cellId]=kept;
 }
 return out;
}
/** Strict form for restore: a present value must be exact. */
export function restoreLiveComparisons(value:unknown):Record<string,LiveComparisonRef[]>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid saved live comparisons.');
 const entries=Object.entries(value as Record<string,unknown>);if(entries.length>256)throw new Error('Invalid saved live comparisons.');
 const out:Record<string,LiveComparisonRef[]>={};
 for(const [cellId,rows] of entries){
  if(!cellId||cellId.length>128||!Array.isArray(rows)||rows.length>1000)throw new Error('Invalid saved live comparisons.');
  const seen=new Set<string>();out[cellId]=rows.map(row=>{const ref=comparisonRefOf(row);if(!ref||seen.has(ref.comparison.id))throw new Error('Invalid saved live comparison.');seen.add(ref.comparison.id);return ref;});
 }
 return out;
}
function gridLiveComparisonRefs(grid:MultiChartState,into:Record<string,LiveComparisonRef[]>):void{
 for(const row of grid.layout.cells){
  const list=grid.cells[row.id]?.comparisons??[],refs:LiveComparisonRef[]=[];
  list.forEach(({datasetId,...comparison},position)=>{const ref=liveRefOfDatasetId(datasetId);if(ref)refs.push({...ref,position,comparison});});
  if(refs.length)into[row.id]=refs;
 }
}
/** The workspace as it may be written or exported: a chart on a live feed keeps its reference (provider, symbol,
 * interval) in `liveCharts` and its stored source falls back to the labelled synthetic demo of the same symbol so
 * the file stays valid; on restore `reconnectLiveCharts` puts the live source back (or a Disconnected state).
 * Live bars are never embedded. Identity is kept when no chart is live, so ordinary saves are unchanged.
 * A live comparison is kept the same way, as a reference in `liveComparisons` (see LiveComparisonRef), and
 * comes back through `reconnectLiveCharts`. The references are rebuilt from the grids on every save, so a comparison the user
 * removed is never written back from an older reference. */
export function persistableWorkspace<T extends ChartWorkspace&{layoutLibrary?:{entries:Array<{grid:MultiChartState}>}}>(workspace:T):T{
 const grid=workspace.grid;if(!grid)return workspace;
 const library=workspace.layoutLibrary,libraryGrids=library?library.entries.map(entry=>sanitizeGrid(workspace,entry.grid)):[];
 const libraryLive=!!library&&libraryGrids.some((safe,index)=>safe!==library.entries[index].grid);
 const safeGrid=sanitizeGrid(workspace,grid),stale=Object.hasOwn(workspace,'liveComparisons')||Object.hasOwn(workspace,'liveCharts');
 if(safeGrid===grid&&!libraryLive&&!stale)return workspace;
 let result:T=safeGrid===grid?workspace:projectGrid(workspace,safeGrid) as T;
 if(stale){const {liveComparisons:_dropped,liveCharts:_oldCharts,...rest}=result as T&{liveComparisons?:unknown;liveCharts?:unknown};result=rest as T;}
 if(library&&libraryLive)result={...result,layoutLibrary:{...library,entries:library.entries.map((entry,index)=>({...entry,grid:libraryGrids[index]}))}};
 const refs=savedLiveRefs(workspace);
 const compared:Record<string,LiveComparisonRef[]>={};gridLiveComparisonRefs(grid,compared);if(library)for(const entry of library.entries)gridLiveComparisonRefs(entry.grid,compared);
 if(Object.keys(refs).length)result={...result,liveCharts:refs};
 return Object.keys(compared).length?{...result,liveComparisons:compared}:result;
}
/** True when some chart cell still names this live dataset, as its chart source or as a comparison (a live
 * comparison keeps its feed open, so its line keeps moving after the chart that first opened the symbol switches away). */
export function gridReferencesDataset(grid:MultiChartState|undefined,datasetId:string):boolean{return !!grid&&grid.layout.cells.some(row=>grid.cells[row.id]?.datasetId===datasetId||!!grid.cells[row.id]?.comparisons?.some(item=>item.datasetId===datasetId));}

/** The live intervals every component of an expression supports (Coinbase and Alpaca interval lists intersect). */
export function symbolMathIntervals(expression:string):string[]{
 const parsed=parseSymbolMath(expression);if(!parsed.ok)return[];const sources=new Set(parsed.expression.symbols.map(symbolMathComponentSource));
 const lists=[...sources].map(source=>Object.keys(source==='coinbase'?COINBASE_RESOLUTIONS:ALPACA_RESOLUTIONS));
 return lists.length?lists[0].filter(name=>lists.every(list=>list.includes(name))):[];
}
/** The other intervals the active live feed supports, as searchable datasets with no bars. The interval menu
 * offers them; choosing one reopens the feed at that interval (live bars are never resampled). */
export function liveSiblings(active:BarDataset|undefined):BarDataset[]{
 if(!active||!isLiveDatasetId(active.provenance.datasetId)||active.provenance.providerId===FRED_PROVIDER_ID)return[];
 // A derived chart offers the intervals every component feed supports (empty stand-ins; choosing one reopens it).
 if(isSymbolMathDatasetId(active.provenance.datasetId))return symbolMathIntervals(active.instrument.symbol).filter(name=>name!==active.resolution).map(name=>symbolMathPlaceholder(active.instrument.symbol,name,'loading'));
 const symbol=active.instrument.symbol,coinbase=active.provenance.providerId===COINBASE_PROVIDER_ID;
 const names=Object.keys(coinbase?COINBASE_RESOLUTIONS:ALPACA_RESOLUTIONS);
 return names.flatMap(name=>coinbase?coinbaseSearchDatasets(true,name):alpacaSearchDatasets(true,[symbol],name)).filter(row=>row.instrument.symbol===symbol&&row.provenance.datasetId!==active.provenance.datasetId);
}

/** Which live sources are switched on right now. `alpacaPending` is true while the Alpaca key check has
 * not answered this start (Alpaca stand-ins then say they are waiting, not that the source is off). */
/** `fred` is whether remote data requests are allowed (absent means allowed); a FRED chart needs no key. */
export interface LiveAvailability {coinbase:boolean;alpacaKey:boolean;alpacaPending?:boolean;fred?:boolean}
export const liveSourceName=(providerId:string)=>providerId===FRED_PROVIDER_ID?'FRED':providerId===COINBASE_PROVIDER_ID?'Coinbase':providerId===SYMBOL_MATH_PROVIDER_ID?'its component sources':'Alpaca';
/** A derived (symbol math) chart needs every source its components use: Coinbase for a Coinbase product,
 * the Alpaca key for any other ticker (: an import-only expression is also reopened only with the key). */
export function liveSourceEnabled(providerId:string,availability:LiveAvailability,symbol?:string):boolean{
 if(providerId===FRED_PROVIDER_ID)return availability.fred!==false;
 if(providerId===SYMBOL_MATH_PROVIDER_ID){const parsed=parseSymbolMath(symbol??'');if(!parsed.ok)return false;const sources=parsed.expression.symbols.map(symbolMathComponentSource);return(!sources.includes('coinbase')||availability.coinbase)&&(!sources.includes('alpaca-or-import')||availability.alpacaKey);}
 return providerId===COINBASE_PROVIDER_ID?availability.coinbase:providerId===ALPACA_IEX_PROVIDER_ID&&availability.alpacaKey;
}
/** True when this live chart or comparison needs the source: a Coinbase chart, or a derived chart with a Coinbase
 * component, needs Coinbase; an Alpaca chart (either namespace), or a derived chart with any other component, needs the Alpaca key. */
export function liveRefDependsOn(ref:Pick<LiveChartRef,'providerId'|'symbol'>,source:'coinbase'|'alpaca'):boolean{
 if(ref.providerId===SYMBOL_MATH_PROVIDER_ID){const parsed=parseSymbolMath(ref.symbol);return parsed.ok&&parsed.expression.symbols.some(symbol=>symbolMathComponentSource(symbol)===(source==='coinbase'?'coinbase':'alpaca-or-import'));}
 if(ref.providerId===FRED_PROVIDER_ID)return false;
 return source==='coinbase'?ref.providerId===COINBASE_PROVIDER_ID:isAlpacaLiveId(ref.providerId);
}
/** The active grid with only the plain live charts and comparisons of one source moved to their saved-file
 * fallback (the same move `persistableWorkspace` makes for every live feed). Charts on other sources stay live, and a derived
 * chart is never moved here (it gets the Disconnected stand-in under its own dataset id). Same grid when nothing moves. */
export function moveSourceChartsOff(workspace:ChartWorkspace,source:'coinbase'|'alpaca'):MultiChartState|undefined{
 const grid=workspace.grid;return grid&&sanitizeGrid(workspace,grid,ref=>ref.providerId!==SYMBOL_MATH_PROVIDER_ID&&liveRefDependsOn(ref,source));
}
/** Plain message for a live chart whose source is switched off. */
export function disconnectedLiveMessage(ref:Pick<LiveChartRef,'providerId'|'symbol'>):string{
 if(ref.providerId===FRED_PROVIDER_ID)return 'FRED:'+ref.symbol+' is an economic data series, and remote data requests are turned off. Turn them on to load it.';
 if(ref.providerId===SYMBOL_MATH_PROVIDER_ID)return ref.symbol+' is a derived chart, and a data source it uses is turned off. Open Data sources to turn it on.';
 return ref.symbol+' is a live chart from '+liveSourceName(ref.providerId)+', and that data source is turned off. Open Data sources to turn it on.';
}
/** The empty stand-in of a saved FRED chart (same dataset id the loaded series uses). `available` = loading, else a notice. */
function fredStandIn(series:string,available:boolean,message:string):BarDataset{
 return fredDataset(series,[],available?{state:'loading',coverage:'Loading FRED series '+series,asOf:0}:{state:'disconnected',coverage:'Disconnected: '+message,asOf:0,notes:[message]});
}
/** Open one FRED series for the main chart or Compare. Registers it (so the grid can resolve its dataset id) and returns
 * it; on failure `dataset` is null and `notice` says why in plain words. A stale saved copy is returned with a notice. No request
 * is made when `opts.enabled` is false (remote requests off). */
export async function openFredSymbol(lv:unknown,symbol:string,opts:{enabled?:boolean}={}):Promise<{dataset:BarDataset|null;notice:string|null}>{
 const loaded=await loadFredDataset(lv,symbol,opts.enabled!==false);
 if(!loaded.ok)return{dataset:null,notice:loaded.notice};
 publishLiveDataset(loaded.dataset);return{dataset:loaded.dataset,notice:loaded.notice};
}
/** Open the saved FRED charts and comparisons that `reconnectLiveCharts` listed in `fredReopen`. Each loads through the
 * cache (a fresh copy needs no request). A failure leaves, or puts, an empty stand-in that carries the notice, never the
 * missing-dataset error; a series already loaded with bars is never replaced by a failed refresh. Returns the notices. */
export async function reopenFredCharts(lv:unknown,entries:readonly LiveReopen[],opts:{enabled?:boolean}={}):Promise<string[]>{
 const notices:string[]=[],seen=new Set<string>();
 for(const entry of entries){
  if(entry.providerId!==FRED_PROVIDER_ID||seen.has(entry.symbol))continue;seen.add(entry.symbol);
  /* The saved series goes in with its FRED: prefix, so an id outside the popular list (WALCL) reopens too. */
  const result=await openFredSymbol(lv,'FRED:'+entry.symbol,opts);if(result.notice)notices.push(result.notice);
  if(!result.dataset&&!liveDatasetById(FRED_SERIES_ID.test(entry.symbol)?fredDatasetId(entry.symbol):undefined)?.bars.length){
   const holder=fredStandIn(entry.symbol,false,result.notice??fredNotice('FRED_ERROR',entry.symbol));publishLiveDataset(holder);
  }
 }
 return notices;
}
/** The empty, labelled stand-in shown while a live chart is not connected. Same dataset id the live feed will use. */
export function liveChartPlaceholder(ref:LiveChartRef,available:boolean,message:string=disconnectedLiveMessage(ref)):BarDataset|null{
 if(!refSupported(ref))return null;
 if(ref.providerId===FRED_PROVIDER_ID)return refSymbolOk(ref)?fredStandIn(ref.symbol,available,message):null;
 if(ref.providerId===SYMBOL_MATH_PROVIDER_ID)return refSymbolOk(ref)?symbolMathPlaceholder(ref.symbol,ref.interval,available?'loading':'disconnected',available?undefined:message):null;
 const shells=ref.providerId===COINBASE_PROVIDER_ID?coinbaseSearchDatasets(true,ref.interval):alpacaSearchDatasets(true,[ref.symbol],ref.interval);
 const shell=shells.find(row=>row.instrument.symbol===ref.symbol&&row.resolution===ref.interval);if(!shell)return null;
 return{...shell,bars:[],provenance:{...shell.provenance,state:available?'loading':'disconnected',coverage:available?'Connecting to live data':'Disconnected: '+message,notes:available?shell.provenance.notes:[message,...shell.provenance.notes]}};
}
export interface LiveReopen extends LiveChartRef {cellId:string}
/** Put saved live references back on a grid. Enabled sources get a "connecting" stand-in (the app then opens the feed
 * under the same dataset id); disabled ones get a "Disconnected" stand-in with a plain message. Never the synthetic demo.
 * A chart still on its Disconnected stand-in is reopened once its source is on (the feed is listed in
 * `reopen`; a stand-in from the other Alpaca namespace moves to this session's dataset id). */
export function reconnectLiveGrid(workspace:ChartWorkspace,grid:MultiChartState,suppliedRefs:Record<string,LiveChartRef>,availability:LiveAvailability):{grid:MultiChartState;reopen:LiveReopen[];disconnected:Array<{cellId:string;message:string}>}{
 const refs:Record<string,SavedLiveBasis>={};for(const row of grid.layout.cells){const value=Object.getOwnPropertyDescriptor(suppliedRefs,row.id);if(!value||!Object.hasOwn(value,'value'))continue;const selected=selectSavedRef(workspace,grid,row.id,value.value);if(selected){const ref=selected.ref;if(!isLiveDatasetId(grid.cells[row.id]?.datasetId)&&selected.qualified&&!exactSavedFallback(grid,row.id,ref))throw Error('Saved trading-session source no longer matches its exact fallback.');refs[row.id]=sessionRef(ref);}}
 const reopen:LiveReopen[]=[],disconnected:Array<{cellId:string;message:string}>=[];
 for(const row of grid.layout.cells){
  const ref=refs[row.id],id=grid.cells[row.id]?.datasetId;if(!ref||!id||!waitingStandIn(ref,id))continue;
  if(!liveSourceEnabled(ref.providerId,availability,ref.symbol)){refreshStandIn(ref,id,availability);continue;}
  const holder=liveChartPlaceholder(ref,true)!;if(holder.provenance.datasetId!==id)continue;
  registerLiveDataset(holder);reopen.push(reopenChart(row.id,ref));
 }
 const moved=(row:{id:string})=>{const ref=refs[row.id],id=grid.cells[row.id]?.datasetId;return !!ref&&(!isLiveDatasetId(id)||liveSourceEnabled(ref.providerId,availability,ref.symbol)&&waitingStandIn(ref,id)&&liveChartPlaceholder(ref,true)?.provenance.datasetId!==id);};
 if(!grid.layout.cells.some(moved))return{grid,reopen,disconnected};
 const next=structuredClone(grid) as MultiChartState,oldSources=workspaceDatasets({...workspace,grid});
 for(const row of next.layout.cells){
  const ref=refs[row.id];if(!ref||!moved(row))continue;
  const enabled=liveSourceEnabled(ref.providerId,availability,ref.symbol),message=standInMessage(ref,availability),holder=liveChartPlaceholder(ref,enabled,message);if(!holder)continue;
  if(!liveDatasetById(holder.provenance.datasetId)||waitingStandIn(ref,holder.provenance.datasetId))registerLiveDataset(holder);
  const previous=grid.cells[row.id],restoreSession=!isLiveDatasetId(previous.datasetId)&&ref.session!==undefined;
  if(restoreSession&&!exactSavedFallback(grid,row.id,ref))throw Error('Saved trading-session source no longer matches its exact fallback.');
  row.symbol=ref.symbol;row.interval=ref.interval;next.cells[row.id]={...next.cells[row.id],datasetId:holder.provenance.datasetId,...(restoreSession?{session:ref.session}:{})};
  if(enabled)reopen.push(reopenChart(row.id,ref));else disconnected.push({cellId:row.id,message});
 }
 const newSources=workspaceDatasets({...workspace,grid:next});
 for(const row of next.layout.cells)next.cells[row.id]=resetIncompatibleFrame(grid.cells[row.id],next.cells[row.id],oldSources,newSources);
 return{grid:transitionGridDrawingScopes(grid,next,oldSources,newSources),reopen,disconnected};
}
// A saved comparison is put back once per loaded reference list. The list stays in memory with the loaded
// workspace (a grid commit keeps it), so this remembers which references were used: a comparison the user removed after the
// restore is not added again when a data source is switched on or off later.
const usedComparisonRefs=new WeakMap<object,Set<string>>();
/** Put saved live comparisons back on a grid. An enabled source gets a "connecting" stand-in under the dataset id its feed
 * will use, and the feed is listed in `reopen`; a disabled one gets the "Disconnected" stand-in and a plain message. A
 * comparison already present on its Disconnected stand-in is reopened once its source is on. The settings and the place in
 * the list are the saved ones. */
export function reconnectLiveComparisonsGrid(workspace:ChartWorkspace,grid:MultiChartState,saved:Record<string,LiveComparisonRef[]>,availability:LiveAvailability,used:Set<string>=new Set()):{grid:MultiChartState;reopen:LiveReopen[];disconnected:Array<{cellId:string;message:string}>}{
 const reopen:LiveReopen[]=[],disconnected:Array<{cellId:string;message:string}>=[],adds=new Map<string,LiveComparisonRef[]>(),moves=new Map<string,Map<string,string>>();
 for(const row of grid.layout.cells){
  const cell=grid.cells[row.id];if(!cell)continue;
  for(const ref of saved[row.id]??[]){
   const key=row.id+'\u0000'+ref.comparison.id,present=cell.comparisons.find(item=>item.id===ref.comparison.id),enabled=liveSourceEnabled(ref.providerId,availability,ref.symbol);
   if(present){
    used.add(key);const holder=liveChartPlaceholder(ref,enabled);
    if(!enabled&&waitingStandIn(ref,present.datasetId))refreshStandIn(ref,present.datasetId,availability);
    if(enabled&&holder&&waitingStandIn(ref,present.datasetId)){
     registerLiveDataset(holder);reopen.push({cellId:row.id,providerId:ref.providerId,symbol:ref.symbol,interval:ref.interval});
     if(holder.provenance.datasetId!==present.datasetId){const list=moves.get(row.id)??new Map<string,string>();list.set(present.id,holder.provenance.datasetId);moves.set(row.id,list);}
    }
    continue;
   }
   if(used.has(key))continue;used.add(key);
   const list=adds.get(row.id)??[];list.push(ref);adds.set(row.id,list);
  }
 }
 if(!adds.size&&!moves.size)return{grid,reopen,disconnected};
 const next=structuredClone(grid) as MultiChartState,oldSources=workspaceDatasets({...workspace,grid});
 for(const [cellId,ids] of moves)next.cells[cellId]={...next.cells[cellId],comparisons:next.cells[cellId].comparisons.map(item=>ids.has(item.id)?{...item,datasetId:ids.get(item.id)!}:item)};
 for(const [cellId,refs] of adds){
  const comparisons=[...next.cells[cellId].comparisons];
  for(const ref of [...refs].sort((a,b)=>a.position-b.position)){
   const enabled=liveSourceEnabled(ref.providerId,availability,ref.symbol),message=standInMessage(ref,availability),holder=liveChartPlaceholder(ref,enabled,message);if(!holder)continue;
   if(!liveDatasetById(holder.provenance.datasetId))registerLiveDataset(holder);
   comparisons.splice(Math.min(ref.position,comparisons.length),0,{...ref.comparison,datasetId:holder.provenance.datasetId});
   if(enabled)reopen.push({cellId,providerId:ref.providerId,symbol:ref.symbol,interval:ref.interval});else disconnected.push({cellId,message});
  }
  next.cells[cellId]={...next.cells[cellId],comparisons};
 }
 const newSources=workspaceDatasets({...workspace,grid:next});
 for(const row of next.layout.cells)next.cells[row.id]=resetIncompatibleFrame(grid.cells[row.id],next.cells[row.id],oldSources,newSources);
 return{grid:next,reopen,disconnected};
}
/** Restore the active grid's saved live charts and live comparisons. Returns the same workspace when nothing on the grid
 * changes; `reopen` can still list feeds to open (a stand-in waiting for its source), so callers always open them.
 * A chart on a waiting stand-in with no saved reference (a startup-open chart laid out before the Alpaca
 * key check answered) names its own feed through its dataset id. */
export function reconnectLiveCharts<T extends ChartWorkspace&{liveCharts?:unknown;liveComparisons?:unknown}>(workspace:T,availability:LiveAvailability):{workspace:T;reopen:LiveReopen[];disconnected:Array<{cellId:string;message:string}>;fredReopen?:LiveReopen[]}{
 const result=reconnectAllLive(workspace,availability),fred=result.reopen.filter(entry=>entry.providerId===FRED_PROVIDER_ID);
 return fred.length?{...result,reopen:result.reopen.filter(entry=>entry.providerId!==FRED_PROVIDER_ID),fredReopen:fred}:result;
}
function reconnectAllLive<T extends ChartWorkspace&{liveCharts?:unknown;liveComparisons?:unknown}>(workspace:T,availability:LiveAvailability):{workspace:T;reopen:LiveReopen[];disconnected:Array<{cellId:string;message:string}>}{
 const refs:Record<string,LiveChartRef>=Object.fromEntries(Object.entries(liveChartsOf(workspace)).map(([cellId,ref])=>[cellId,sessionRef(ref)])),compared=Object.fromEntries(Object.entries(liveComparisonsOf(workspace)).map(([cellId,rows])=>[cellId,rows.map(sessionRef)]));
 for(const row of workspace.grid?.layout.cells??[]){const id=workspace.grid!.cells[row.id]?.datasetId,ref=refs[row.id]?null:liveRefOfDatasetId(id);if(ref&&waitingStandIn(ref,id))refs[row.id]=sessionRef(ref);}
 if(!workspace.grid||!Object.keys(refs).length&&!Object.keys(compared).length)return{workspace,reopen:[],disconnected:[]};
 const charts=Object.keys(refs).length?reconnectLiveGrid(workspace,workspace.grid,refs,availability):{grid:workspace.grid,reopen:[],disconnected:[]};
 const owner=workspace.liveComparisons as object|undefined;let used=owner&&typeof owner==='object'?usedComparisonRefs.get(owner):undefined;
 if(owner&&typeof owner==='object'&&!used){used=new Set();usedComparisonRefs.set(owner,used);}
 const result=Object.keys(compared).length?reconnectLiveComparisonsGrid(workspace,charts.grid,compared,availability,used):{grid:charts.grid,reopen:[],disconnected:[]};
 return{workspace:result.grid===workspace.grid?workspace:projectGrid(workspace,result.grid) as T,reopen:[...charts.reopen,...result.reopen],disconnected:[...charts.disconnected,...result.disconnected]};
}
