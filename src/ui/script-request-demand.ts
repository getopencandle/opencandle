import type {MultiChartState} from './MultiChartGrid';
import {cachedScriptRequestDeclarations} from './script-jobs';
import {canonicalRequestSymbol,declaresScriptRequests,scriptRequestKey} from './script-requests';
import {catalogDefinition} from '../domain/indicator-catalog';
import {profileFinerInterval} from '../domain/volume-profile';
import {volumeDeltaInterval,isIntradayResolution} from '../domain/indicators-ext/r40-volume-catalog';
import {indicatorTimeframeOf} from '../chart/indicator-timeframe';

/**
 * The loader keys the chart scripts on the charts still request (the same `<symbol>\0<interval>` keys as
 * the second-symbol feeds, see second-symbol-demand.ts). A script counts while it is bound to a chart, shown or hidden,
 * once its declarations are known (after its first run). A request with no symbol names the chart's own symbol, which is
 * loaded on demand only on a live chart. A request with no interval uses the chart interval.
 */
export function scriptRequestDemand(grid:Pick<MultiChartState,'layout'|'cells'>|null|undefined):Set<string>{
 const keys=new Set<string>();if(!grid)return keys;
 for(const row of grid.layout.cells){
  const cell=grid.cells[row.id];if(!cell)continue;
  for(const binding of cell.scriptBindings??[]){
   if(typeof binding?.source!=='string'||!declaresScriptRequests(binding.source))continue;
   for(const declaration of cachedScriptRequestDeclarations(binding.source)??[]){
    const symbol=declaration.symbol??(String(cell.datasetId).startsWith('live:')?row.symbol:null),interval=declaration.interval??row.interval;
    const canonical=symbol?canonicalRequestSymbol(symbol):null;
    if(canonical&&interval)keys.add(scriptRequestKey(canonical,interval));
   }
  }
  // A volume profile on a live chart keeps the chart symbol's finer feed open (shown or hidden), at
  // the finer interval of its calculation interval. Only a live chart's own symbol is ever opened for it.
  if(String(cell.datasetId).startsWith('live:'))for(const indicator of cell.indicators??[]){
   const definition=catalogDefinition(indicator?.kind);if(!definition)continue;
   const resolution=indicatorTimeframeOf(indicator.presentation).interval??row.interval,canonical=canonicalRequestSymbol(row.symbol);
   let finer:string|null=null;
   if(definition.profile)finer=profileFinerInterval(resolution);
   else if(definition.dailyHistory&&isIntradayResolution(resolution))finer='1D';
   else if(definition.finerBars){try{finer=volumeDeltaInterval(resolution,indicator.inputs?.useCustomTimeframe===true,String(indicator.inputs?.timeframe??'1m'));}catch{/* Invalid settings show a calculation refusal; never open a substitute feed. */}}
   if(finer&&canonical)keys.add(scriptRequestKey(canonical,finer));
  }
 }
 return keys;
}
