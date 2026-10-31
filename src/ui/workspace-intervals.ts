import type {BarDataset} from '../domain/types';
import {chooseIntervalSource,restoreIntervalMenuState,restoreIntervalDerivation,intervalDatasetKey,parseInterval,type IntervalMenuState} from '../domain/intervals';
import {ensureWorkspaceGrid,projectGrid,workspaceDatasets,transitionGridDrawingScopes,withDemoSiblings,demoIntradaySibling,type ChartWorkspace} from './workspace-grid';
import {resetIncompatibleFrame} from './frame-reset-policy';
import {isDerivedStyle} from '../chart/derived/common';

type Viewport={from:number;to:number};
/** A saved viewport is a time range, so reusing it after an interval change kept the old span (1D to 1W drew
 * hairline weekly candles in a wide cell, and a cell whose span started before the new bars kept an empty band). It now
 * keeps the bar spacing instead. A view at the latest bar returns null (the renderer keeps its spacing, right-aligned); a view
 * scrolled back shows the same number of bars ending where the old view ended. Null drops the viewport. */
export function refitViewportForInterval(old:Viewport,oldTimes:readonly number[],newTimes:readonly number[]):Viewport|null{
 if(!oldTimes.length||!newTimes.length||!Number.isFinite(old.from)||!Number.isFinite(old.to)||old.to<=old.from)return null;
 const count=oldTimes.filter(time=>time>=old.from&&time<=old.to).length;if(count<1)return null;
 const oldLast=oldTimes[oldTimes.length-1];
 // A view at the latest bar drops its saved range, so the renderer keeps the current bar
 // spacing at the right edge. The saved range is clamped to the loaded bars, so a weekly view with an empty left
 // band read as "101 bars" and 1D came back at half the bars each trip.
 if(old.to>=oldLast)return null;
 let end=newTimes.length-1;while(end>0&&newTimes[end]>old.to)end--;const to=newTimes[end];
 const from=newTimes[Math.max(0,end-count+1)];
 return to>from?{from,to}:null;
}

function originalIdentity(dataset:BarDataset){return 'derivation' in dataset||dataset.provenance.providerId==='lv-local-aggregation'?restoreIntervalDerivation((dataset as BarDataset&{derivation:unknown}).derivation,dataset).sourceKey:intervalDatasetKey(dataset);}
function compatibleSources(old:BarDataset,sources:readonly BarDataset[]){
 const key=originalIdentity(old),origins=sources.filter(row=>intervalDatasetKey(row)===key);if(origins.length>1)throw new Error('The original linked source is ambiguous. No interval was changed.');
 const basis=origins[0]??(!('derivation' in old)&&old.provenance.providerId!=='lv-local-aggregation'?old:null);
 return sources.filter(row=>{
  if(row.instrument.id!==old.instrument.id||row.instrument.currency!==old.instrument.currency||row.provenance.fixture!==old.provenance.fixture)return false;
  if('derivation' in row||row.provenance.providerId==='lv-local-aggregation')return originalIdentity(row)===key;
  return !!basis&&row.provenance.providerId===basis.provenance.providerId&&row.provenance.session===basis.provenance.session&&row.provenance.adjustment===basis.provenance.adjustment&&row.provenance.timezone===basis.provenance.timezone;
 });
}

/** Resolve every linked chart before returning a new workspace. Never derive linked data implicitly. */
export function selectWorkspaceInterval<T extends ChartWorkspace>(state:T,dataset:BarDataset,menu:IntervalMenuState):T&{intervals:IntervalMenuState}{
 const intervals=restoreIntervalMenuState(menu),previous=ensureWorkspaceGrid(state),grid=structuredClone(previous.grid),active=grid.layout.cells.find(row=>row.id===grid.layout.activeCellId)!;
 // A demo intraday series (1m, 5m, 15m, 60m) is a generated source like the demo daily: it is never copied
 // into imports (the saved file stays small, and the grid then names it exactly once). It joins the source list here, and
 // workspaceDatasets brings it in once a cell sits on it.
 const sibling=demoIntradaySibling(dataset),available=sibling?withDemoSiblings(workspaceDatasets(previous),dataset):workspaceDatasets(previous),existing=available.find(row=>row.provenance.datasetId===dataset.provenance.datasetId);
 if(existing&&(existing.instrument.id!==dataset.instrument.id||existing.resolution!==dataset.resolution))throw new Error('Dataset identity conflicts with a different instrument or interval.');
 const imports=sibling||existing===dataset||existing&&JSON.stringify(existing)===JSON.stringify(dataset)?state.imports:[...state.imports.filter(row=>row.provenance.datasetId!==dataset.provenance.datasetId),dataset];
 if(imports.length>1000)throw new Error('The local dataset limit is 1,000. Export and remove unneeded data first.');
 const next={...previous,imports,intervals},sources=sibling?withDemoSiblings(workspaceDatasets(next),dataset):workspaceDatasets(next);
 for(const cell of grid.layout.cells){
  if(cell.id!==active.id&&(!grid.layout.sync.interval||cell.group!==active.group))continue;
  let selected=dataset;
  if(cell.id!==active.id){const old=sources.find(row=>row.provenance.datasetId===grid.cells[cell.id].datasetId&&row.instrument.symbol===cell.symbol&&row.resolution===cell.interval);if(!old)throw new Error('A linked source is missing. No interval was changed.');
   const selectedDerived='derivation' in dataset||dataset.provenance.providerId==='lv-local-aggregation';
   if(selectedDerived&&originalIdentity(dataset)===originalIdentity(old))selected=dataset;
   else if(parseInterval(old.resolution).id===parseInterval(dataset.resolution).id)selected=old;
   else {const result=chooseIntervalSource(compatibleSources(old,sources),{instrumentId:old.instrument.id,target:dataset.resolution,policy:intervals.policy});if(!result.ok||result.kind!=='exact')throw new Error('Linked '+cell.symbol+': '+(!result.ok?result.message:'Choose a data source first.'));selected=result.dataset;}
  }
  const before=available.find(row=>row.provenance.datasetId===previous.grid.cells[cell.id].datasetId);
  cell.symbol=selected.instrument.symbol;cell.interval=selected.resolution;grid.cells[cell.id].datasetId=selected.provenance.datasetId;
  grid.cells[cell.id]=resetIncompatibleFrame(previous.grid.cells[cell.id],grid.cells[cell.id],available,sources);
  const saved=grid.cells[cell.id];
  if(saved.viewport&&before&&before.resolution!==selected.resolution&&!isDerivedStyle(saved.style)){const refit=refitViewportForInterval(saved.viewport,before.bars.map(bar=>bar.time),selected.bars.map(bar=>bar.time));if(refit)saved.viewport=refit;else delete saved.viewport;}
 }
 return projectGrid(next,transitionGridDrawingScopes(previous.grid,grid,available,sources));
}

export {identifyLocalImport} from './local-import-identity';
