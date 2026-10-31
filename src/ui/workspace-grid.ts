import {demoDailyDataset,demoIntradayDatasets,demoPlaceholderDataset,isDemoSourceShape,isExampleShaped,DEMO_INTRADAY_RESOLUTIONS} from '../domain/fixtures';
import {demoSymbolAllowed,demoDataMode,universeDemoSymbols} from '../domain/demo-mode';
import type {BarDataset} from '../domain/types';
import {createMultiChartState,type MultiChartState,type MultiChartCellState} from './MultiChartGrid';
import {themePresets} from './themes';
import {linkedDatasetAtInterval} from './source-basis';
import {cellSessionDataset} from '../chart/cell-session';
import {resetIncompatibleFrame} from './frame-reset-policy';
import {transitionDrawingScope,validateCellDrawingScopes} from './drawing-scopes';
import {liveDatasetById,registeredLiveDatasets} from './live-registry';
import {isLiveDatasetId} from '../domain/live-provider';
import {isStubDerivedDataset} from '../domain/symbol-math-live';

export interface ChartWorkspace {
 symbol:string;sourceId:string|null;imports:BarDataset[];chartStyle:string;themeId:string;
 scriptBindings?:MultiChartCellState['scriptBindings'];chartTypeSettings?:MultiChartCellState['chartTypeSettings'];appearance:MultiChartCellState['appearance'];chartOptions:MultiChartCellState['chartOptions'];
 drawings:MultiChartCellState['drawings'];indicators:MultiChartCellState['indicators'];comparisons:MultiChartCellState['comparisons'];
 grid?:MultiChartState;
}
/** Compare plain data while skipping shared immutable subtrees. No user serializer
 * or accessor runs just to decide whether an accepted model changed. */
function sameChartData(left:unknown,right:unknown,depth=0):boolean{
 if(left===right)return true;
 if(depth>80||!left||!right||typeof left!=='object'||typeof right!=='object'||Array.isArray(left)!==Array.isArray(right))return false;
 const array=Array.isArray(left),allowed=(value:object)=>array?Object.getPrototypeOf(value)===Array.prototype:[Object.prototype,null].includes(Object.getPrototypeOf(value));if(!allowed(left)||!allowed(right))return false;
 const fields=(value:object)=>{const result=new Map<string,unknown>();for(const key of Reflect.ownKeys(value)){if(typeof key!=='string')return null;const descriptor=Object.getOwnPropertyDescriptor(value,key)!;if(!Object.hasOwn(descriptor,'value')||!descriptor.enumerable&&!(array&&key==='length'))return null;if(descriptor.value!==undefined||array)result.set(key,descriptor.value);}return result;};
 const a=fields(left),b=fields(right);if(!a||!b||a.size!==b.size)return false;
 for(const [key,value] of a)if(!b.has(key)||!sameChartData(value,b.get(key),depth+1))return false;return true;
}
/** Grid projection creates fresh chart objects. Do not serialize unchanged large imported data on every pointer edit. */
export function sameWorkspace(left:Record<string,unknown>,right:Record<string,unknown>):boolean{
 const chartFields=new Set(['grid','appearance','drawings','indicators','comparisons','chartOptions','chartTypeSettings','scriptBindings']);
 const keys=Object.keys(left);if(keys.length!==Object.keys(right).length)return false;
 return keys.every(key=>Object.hasOwn(right,key)&&(left[key]===right[key]||chartFields.has(key)&&sameChartData(left[key],right[key])));
}
/** Demo datasets are generated once per symbol, so a live update never hands every demo chart a new
 * bars array (each new array was a full chart reload). Bounded: least recently used symbols are dropped first. */
const demoCache=new Map<string,BarDataset>();
const DEMO_CACHE_LIMIT=256;
/** While generated prices are hidden (demo-mode.ts) a demo symbol resolves to its placeholder: same identity, no bars. */
const placeholderCache=new Map<string,BarDataset>();
function placeholder(symbol:string,resolution='1D'):BarDataset{
 const key=symbol.trim().toUpperCase()+'|'+resolution,hit=placeholderCache.get(key);if(hit)return hit;
 const created=demoPlaceholderDataset(symbol,resolution);if(placeholderCache.size>=256)placeholderCache.clear();placeholderCache.set(key,created);return created;
}
/** An import built from demo bars (a 4h or 1W interval made from the example series) is kept in workspace.imports
 * with its bars. While its symbol may not show generated prices it reads as a placeholder (same dataset id, no bars), so leaving
 * example mode never leaves invented prices on a chart or in a panel. The saved import is not changed. */
const hiddenImports=new WeakMap<BarDataset,BarDataset>();
export function shownImport(row:BarDataset):BarDataset{
 if(demoDataMode()==='legacy'||row.provenance?.fixture!==true||row.instrument?.exchange!=='SYNTHETIC'||!row.bars?.length||demoSymbolAllowed(row.instrument.symbol))return row;
 const hit=hiddenImports.get(row);if(hit)return hit;
 const base=placeholder(row.instrument.symbol),created:BarDataset={...base,resolution:row.resolution,provenance:{...base.provenance,datasetId:row.provenance.datasetId}};
 hiddenImports.set(row,created);return created;
}
export function demoDataset(symbol:string):BarDataset{
 if(!demoSymbolAllowed(symbol))return placeholder(symbol);
 return generatedDemoDaily(symbol);
}
/** The generated series a saved derived-interval recipe (workspace-derived-imports.ts) is rebuilt from, in
 * every demo mode. A recipe saved from a demo 1W/4h chart must keep loading when generated prices are hidden (the 'off' mode
 * turned it into a placeholder with no bars, the rebuild failed, and the whole workspace went to recovery). The rebuilt import
 * is then shown as its placeholder (shownImport), so no generated price reaches a chart. Never use these rows for display. */
export function demoRecipeSources(symbol:string,intraday:boolean):BarDataset[]{return intraday?generatedDemoIntraday(symbol):[generatedDemoDaily(symbol)];}
function generatedDemoDaily(symbol:string):BarDataset{
 /* Example-mode series have their own shape, so they never share a cache entry with the legacy series. */
 const key=(isExampleShaped(symbol)?'x:':'')+symbol.trim().toUpperCase(),hit=demoCache.get(key);
 if(hit){demoCache.delete(key);demoCache.set(key,hit);return hit;}
 /* The app's demo chart holds ~19 years of daily bars (tests and watch sources keep the 500-bar fixture). */
 const created=demoDailyDataset(symbol);demoCache.set(key,created);
 while(demoCache.size>DEMO_CACHE_LIMIT)demoCache.delete(demoCache.keys().next().value!);
 return created;
}
/** Keep the source universe identity across live growth. A live entry that is a newer snapshot of the
 * same subscription (same dataset id and revision) is the same source; the live chart cell follows the feed through the
 * live channel, and App state reads the newest snapshot. Any other change (a source added, removed, reopened or
 * replaced) returns the new universe. */
export function stableDatasetUniverse(previous:readonly BarDataset[]|null,next:BarDataset[]):BarDataset[]{
 if(!previous||previous.length!==next.length)return next;
 for(let index=0;index<next.length;index++){const a=previous[index],b=next[index];if(a===b)continue;
  if(!isLiveDatasetId(a.provenance.datasetId)||a.provenance.datasetId!==b.provenance.datasetId||a.provenance.revision!==b.provenance.revision||a.resolution!==b.resolution||a.instrument.symbol!==b.instrument.symbol)return next;}
 return previous as BarDataset[];
}
export function selectedDataset(state:ChartWorkspace):BarDataset{
 if(state.sourceId!==null){const live=liveDatasetById(state.sourceId);if(live&&live.instrument.symbol===state.symbol)return live;const dataset=state.imports.find(row=>row.provenance.datasetId===state.sourceId&&row.instrument.symbol===state.symbol);if(!dataset)throw new Error('Selected local dataset is missing.');return shownImport(dataset);}
 const daily=demoDataset(state.symbol);
 /* A demo chart on one of its intraday series has no import (sourceId null); its cell names the series. */
 const cellId=state.grid?.cells[state.grid.layout.activeCellId]?.datasetId,m=typeof cellId==='string'?/^lv-synthetic-v1:(.+):(1m|5m|15m|60m)$/.exec(cellId):null;
 if(m&&m[1]===daily.instrument.symbol){const hit=demoIntradaySources(m[1]!).find(row=>row.provenance.datasetId===cellId);if(hit)return hit;}
 return daily;
}
/** Generated or imported derivatives retain their exact stored source even when synthetic. */
export function suppliedSourceId(state:Pick<ChartWorkspace,'imports'>,dataset:BarDataset):string|null{
 // A live feed snapshot is its own kind of source (never an import): its id names it.
 if(liveDatasetById(dataset.provenance.datasetId)&&dataset.provenance.fixture===false)return dataset.provenance.datasetId;
 // The one synthetic live source accepted: a derived chart computed only from the labelled keyless
 // Alpaca stub, in a stub run, saying SYNTHETIC (the provider refuses any synthetic/real mix). Nothing is substituted.
 if(isStubDerivedDataset(dataset)&&isStubDerivedDataset(liveDatasetById(dataset.provenance.datasetId)))return dataset.provenance.datasetId;
 const matches=state.imports.filter(row=>row.provenance.datasetId===dataset.provenance.datasetId);
 if(matches.length===1){const row=matches[0];/* The placeholder view of a hidden demo import is that import. */if(dataset!==row&&dataset===shownImport(row))return dataset.provenance.datasetId;if(row.resolution===dataset.resolution&&(['id','symbol','exchange','currency','assetClass'] as const).every(key=>row.instrument[key]===dataset.instrument[key])&&(['providerId','revision','fixture','session','adjustment','timezone','coverage'] as const).every(key=>row.provenance[key]===dataset.provenance[key]))return dataset.provenance.datasetId;throw new Error('The supplied source changed. Select its current dataset again.');}
 if(matches.length>1)throw new Error('The supplied source identity is ambiguous.');
 if(isDemoSourceShape(dataset))return null;
 throw new Error('The requested data source is unavailable.');
}
/** Intraday demo sources (1m, 5m, 15m, 60m) exist only for symbols a chart is using, and are generated on first use. */
const intradayCache=new Map<string,BarDataset[]>();
const placeholderSets=new Map<string,BarDataset[]>();
export function demoIntradaySources(symbol:string):BarDataset[]{
 if(!demoSymbolAllowed(symbol)){const key=symbol.trim().toUpperCase();let set=placeholderSets.get(key);if(!set){set=DEMO_INTRADAY_RESOLUTIONS.map(resolution=>placeholder(key,resolution));if(placeholderSets.size>=64)placeholderSets.clear();placeholderSets.set(key,set);}return set;}
 return generatedDemoIntraday(symbol);
}
function generatedDemoIntraday(symbol:string):BarDataset[]{
 const symbolKey=symbol.trim().toUpperCase(),key=(isExampleShaped(symbolKey)?'x:':'')+symbolKey,hit=intradayCache.get(key);
 if(hit){intradayCache.delete(key);intradayCache.set(key,hit);return hit;}
 const created=demoIntradayDatasets(symbolKey);intradayCache.set(key,created);
 while(intradayCache.size>8)intradayCache.delete(intradayCache.keys().next().value!);
 return created;
}
/** The intraday demo sources are not part of the universe (search, watchlists and quotes keep one row per demo symbol). A chart whose
 * cell sits on an intraday demo source brings that symbol's set in, so the cell can find its dataset. */
function intradayInUse(state:ChartWorkspace):string[]{
 const symbols=new Set<string>();
 for(const cell of Object.values(state.grid?.cells??{}))for(const id of [cell.datasetId,...cell.comparisons.map(row=>row.datasetId)]){const m=typeof id==='string'?/^lv-synthetic-v1:(.+):(1m|5m|15m|60m)$/.exec(id):null;if(m)symbols.add(m[1]!);}
 return [...symbols];
}
/** The chart symbols plus any demo intraday cell sources. App memoises the source universe and the
 * active dataset on symbols, imports and sourceId; a demo chart moving between its daily and intraday series changes none of
 * those (sourceId stays null), so this key is what tells the memos the active source changed. */
export function gridSourceKey(grid:MultiChartState|undefined):string|undefined{
 return grid?.layout.cells.map(row=>{const id=grid.cells[row.id]?.datasetId;return typeof id==='string'&&/^lv-synthetic-v1:.+:(1m|5m|15m|60m)$/.test(id)?row.symbol+'@'+id:row.symbol;}).join('|');
}
/** True when `dataset` is exactly one of the generated demo intraday series (never an import). */
export function demoIntradaySibling(dataset:BarDataset):boolean{
 const m=/^lv-synthetic-v1:(.+):(1m|5m|15m|60m)$/.exec(dataset.provenance.datasetId);
 return !!m&&dataset.resolution===m[2]&&isDemoSourceShape(dataset)&&demoIntradaySources(m[1]!).some(row=>row.provenance.datasetId===dataset.provenance.datasetId&&row.bars.length===dataset.bars.length);
}
/** Interval sources for the chart being switched: the demo chart's intraday set, minus any already in `list`. */
export function withDemoSiblings(list:readonly BarDataset[],dataset:BarDataset):BarDataset[]{
 if(dataset.instrument.exchange!=='SYNTHETIC'||dataset.provenance.fixture!==true)return list as BarDataset[];
 const have=new Set(list.map(row=>row.provenance.datasetId+'|'+row.resolution)),add=demoIntradaySources(dataset.instrument.symbol).filter(row=>!have.has(row.provenance.datasetId+'|'+row.resolution));
 return add.length?[...list,...add]:list as BarDataset[];
}
/** Outside the legacy mode a demo source joins the universe only for the example symbols, or where a chart (or a
 * comparison) still names a demo source; those are placeholders unless example mode allows the symbol. */
function demoSymbolsInUse(state:ChartWorkspace):string[]{
 const out:string[]=[];if(state.sourceId===null)out.push(state.symbol);
 for(const row of state.grid?.layout.cells??[]){const cell=state.grid!.cells[row.id];if(!cell)continue;for(const id of [cell.datasetId,...cell.comparisons.map(item=>item.datasetId)]){const m=typeof id==='string'?/^lv-synthetic-v1:([^:]+)(?::(?:1m|5m|15m|60m))?$/.exec(id):null;if(m)out.push(m[1]!);}}
 return out;
}
export function workspaceDatasets(state:ChartWorkspace):BarDataset[]{
 const symbols=new Set<string>(demoDataMode()==='legacy'?[...universeDemoSymbols(),state.symbol,...state.grid?.layout.cells.map(row=>row.symbol)??[]]:[...universeDemoSymbols(),...demoSymbolsInUse(state)]);
 return [...symbols].map(symbol=>demoDataset(symbol)).concat(intradayInUse(state).flatMap(symbol=>demoIntradaySources(symbol)),demoDataMode()==='legacy'?state.imports:state.imports.map(shownImport),registeredLiveDatasets());
}
export function ensureWorkspaceGrid<T extends ChartWorkspace>(state:T):T&{grid:MultiChartState}{
 if(state.grid){
  let grid=state.grid;const legacy=grid.layout.cells.filter(row=>!Object.hasOwn(grid.cells[row.id]??{},'drawingScopes'));
  if(legacy.length){const sources=workspaceDatasets(state),cells={...grid.cells};for(const row of legacy){const cell=cells[row.id],matches=sources.filter(item=>item.provenance.datasetId===cell?.datasetId&&item.instrument.symbol===row.symbol&&item.resolution===row.interval);if(!cell||matches.length!==1)throw new Error('Legacy drawings cannot be assigned without their exact saved chart source.');cells[row.id]=transitionDrawingScope(cell,cellSessionDataset(matches[0],cell),cellSessionDataset(matches[0],cell));}grid={...grid,cells};}
  return projectGrid(state,grid);
 }
 const grid=createMultiChartState(selectedDataset(state),{scriptBindings:state.scriptBindings,chartTypeSettings:state.chartTypeSettings,style:state.chartStyle,appearance:state.appearance,chartOptions:state.chartOptions,drawings:state.drawings,indicators:state.indicators,comparisons:state.comparisons});
 (grid.cells[grid.layout.activeCellId] as MultiChartCellState&{themeId:string}).themeId=state.themeId;
 return {...state,grid};
}
/** The active cell is authoritative; toolbar fields are a projection, never another renderer owner. */
export function projectGrid<T extends ChartWorkspace>(state:T,grid:MultiChartState):T&{grid:MultiChartState}{
 const cell=grid.cells[grid.layout.activeCellId],metadata=grid.layout.cells.find(row=>row.id===grid.layout.activeCellId);
 if(!cell||!metadata)throw new Error('Active chart is missing from the layout.');
 const dataset=workspaceDatasets({...state,grid}).find(row=>row.provenance.datasetId===cell.datasetId&&row.instrument.symbol===metadata.symbol&&row.resolution===metadata.interval);
 if(!dataset)throw new Error('Active chart source is unavailable.');
 const themeId=(cell as MultiChartCellState&{themeId?:string}).themeId??themePresets.find(row=>JSON.stringify(row.appearance)===JSON.stringify(cell.appearance))?.id??'custom';
 return {...state,grid,symbol:metadata.symbol,sourceId:suppliedSourceId(state,dataset),scriptBindings:cell.scriptBindings??[],chartStyle:cell.style,themeId,chartTypeSettings:cell.chartTypeSettings,appearance:cell.appearance,chartOptions:cell.chartOptions,drawings:cell.drawings,indicators:cell.indicators,comparisons:cell.comparisons};
}
export function focusOnlyChange(before:MultiChartState|undefined,after:MultiChartState):boolean{
 if(!before||before.layout.activeCellId===after.layout.activeCellId)return false;
 return JSON.stringify({...before,layout:{...before.layout,activeCellId:after.layout.activeCellId}})===JSON.stringify(after);
}
/** Preflight ordinary source mutations before native preparation or publication.
 * Complete restored/history grids already own their archived state and skip this. */
export function transitionGridDrawingScopes(before:MultiChartState,after:MultiChartState,oldSources:readonly BarDataset[],newSources:readonly BarDataset[]):MultiChartState{
 const cells={...after.cells};
 for(const row of after.layout.cells){const prior=before.layout.cells.find(item=>item.id===row.id);if(!prior)throw new Error('An ordinary source change cannot create a chart.');
  const opening=oldSources.filter(item=>item.provenance.datasetId===before.cells[row.id].datasetId&&item.instrument.symbol===prior.symbol&&item.resolution===prior.interval),closing=newSources.filter(item=>item.provenance.datasetId===cells[row.id].datasetId&&item.instrument.symbol===row.symbol&&item.resolution===row.interval);
  if(opening.length!==1||closing.length!==1)throw new Error('Exact drawing source is missing or ambiguous. No symbol archive was changed.');
  cells[row.id]=transitionDrawingScope(cells[row.id],cellSessionDataset(opening[0],before.cells[row.id]),cellSessionDataset(closing[0],cells[row.id]));
 }
 return{...after,cells};
}
/** Validate newly published drawing/archive values without rescanning unchanged
 * documents on unrelated chart edits. Source owners are immutable snapshots. */
export function validateGridDrawingScopeChanges(before:MultiChartState|undefined,after:MultiChartState,sources:readonly BarDataset[]):void{
 for(const row of after.layout.cells){const cell=after.cells[row.id],previous=before?.cells[row.id],metadata=before?.layout.cells.find(item=>item.id===row.id);
  if(previous&&cell.drawings===previous.drawings&&cell.drawingScopes===previous.drawingScopes&&cell.datasetId===previous.datasetId&&cell.session===previous.session&&row.symbol===metadata?.symbol&&row.interval===metadata?.interval)continue;
  const matches=sources.filter(item=>item.provenance.datasetId===cell.datasetId&&item.instrument.symbol===row.symbol&&item.resolution===row.interval);if(matches.length!==1)throw new Error('The exact drawing publication source is unavailable.');
  validateCellDrawingScopes(cell,cellSessionDataset(matches[0],cell));
 }
}
export function allChartsDataset<T extends ChartWorkspace>(state:T,dataset:BarDataset):T&{grid:MultiChartState}{
 suppliedSourceId(state,dataset);
 const previous=ensureWorkspaceGrid(state),grid=structuredClone(previous.grid),available=workspaceDatasets(state);
 const resolved=grid.layout.cells.map(row=>{const interval=grid.layout.sync.interval?dataset.resolution:row.interval;const next=interval===dataset.resolution?dataset:linkedDatasetAtInterval(available,dataset,interval);return {row,next};});
 for(const {row,next} of resolved){row.symbol=next.instrument.symbol;row.interval=next.resolution;grid.cells[row.id].datasetId=next.provenance.datasetId;grid.cells[row.id]=resetIncompatibleFrame(previous.grid.cells[row.id],grid.cells[row.id],available,available);}
 return projectGrid(previous,transitionGridDrawingScopes(previous.grid,grid,available,workspaceDatasets({...previous,grid})));
}
/** Workspace fields that are projections of, or inputs to, the chart grid (patchWorkspace below). */
const GRID_PATCH_KEYS=new Set(['grid','scriptBindings','chartTypeSettings','chartStyle','appearance','chartOptions','drawings','indicators','comparisons','themeId','symbol','sourceId','imports']);
/** Resolve every linked source before committing. A missing interval leaves all cells unchanged. */
export function patchWorkspace<T extends ChartWorkspace>(state:T,patch:Partial<T>):T&{grid:MultiChartState}{
 const previous=ensureWorkspaceGrid(state),merged={...previous,...patch};
 // A patch that names no chart field (drawing utility, favorites, watchlists, settings...) keeps the
 // grid object itself. A fresh grid identity reads as "the workspace changed" to an open native frame gesture's
 // 200 ms tail (grid-frame-gesture flush), which then quarantined the chart after any toolbar toggle right after a pan.
 if(previous.grid===state.grid&&!Object.keys(patch).some(key=>GRID_PATCH_KEYS.has(key)))return projectGrid(merged,previous.grid);
 if(patch.grid){validateGridDrawingScopeChanges(previous.grid,patch.grid,workspaceDatasets({...merged,grid:patch.grid}));return projectGrid(merged,patch.grid);}
 const grid:MultiChartState={...previous.grid,layout:{...previous.grid.layout,cells:previous.grid.layout.cells.map(row=>({...row}))},cells:{...previous.grid.cells}},activeId=grid.layout.activeCellId,active=grid.layout.cells.find(row=>row.id===activeId)!;
 const cell=grid.cells[activeId]={...grid.cells[activeId]};
 const keys={scriptBindings:'scriptBindings',chartTypeSettings:'chartTypeSettings',chartStyle:'style',appearance:'appearance',chartOptions:'chartOptions',drawings:'drawings',indicators:'indicators',comparisons:'comparisons',themeId:'themeId'} as const;
 for(const [from,to] of Object.entries(keys))if(Object.hasOwn(patch,from))(cell as unknown as Record<string,unknown>)[to]=(patch as Record<string,unknown>)[from];
 if(Object.hasOwn(patch,'symbol')||Object.hasOwn(patch,'sourceId')){
  const dataset=selectedDataset(merged),available=workspaceDatasets(merged);
  const targets=grid.layout.cells.filter(row=>row.id===activeId||grid.layout.sync.symbol&&row.group===active.group);
  const resolved=targets.map(row=>{
   const interval=row.id===activeId||grid.layout.sync.interval?dataset.resolution:row.interval;
   const next=interval===dataset.resolution?dataset:linkedDatasetAtInterval(available,dataset,interval);
   if(!next)throw new Error('No supplied '+interval+' history for '+dataset.instrument.symbol+'. Linked charts were unchanged.');
   return {row,next};
  });
  for(const {row,next} of resolved){row.symbol=next.instrument.symbol;row.interval=next.resolution;grid.cells[row.id]={...grid.cells[row.id],datasetId:next.provenance.datasetId};}
 }
 const oldSources=workspaceDatasets(previous),newSources=workspaceDatasets({...merged,grid});
 for(const row of grid.layout.cells)grid.cells[row.id]=resetIncompatibleFrame(previous.grid.cells[row.id],grid.cells[row.id],oldSources,newSources);
 const sourceChange=['symbol','sourceId','imports'].some(key=>Object.hasOwn(patch,key));
 const scoped=sourceChange?transitionGridDrawingScopes(previous.grid,grid,oldSources,newSources):grid;
 if(!sourceChange)validateGridDrawingScopeChanges(previous.grid,scoped,newSources);
 return projectGrid(merged,scoped);
}
