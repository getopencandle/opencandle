import type {MultiChartState} from './MultiChartGrid';
import {catalogDefinition} from '../domain/indicator-catalog';
import {parseSymbolMath} from '../domain/symbol-math';
import {indicatorTimeframeOf} from '../chart/indicator-timeframe';

/**
 * The second series the charts' two-symbol indicators still use, as loader keys (`<canonical symbol>\0<interval>`,
 * the same keys the App second-symbol loader opens). An indicator counts while it is on a chart, shown or hidden; its interval
 * is its own timeframe when it has one, else the chart's. A feed no key names is closed.
 */
export const secondSymbolKey=(symbol:string,resolution:string)=>symbol+'\u0000'+resolution;
export function secondSymbolDemand(grid:Pick<MultiChartState,'layout'|'cells'>|null|undefined):Set<string>{
 const keys=new Set<string>();if(!grid)return keys;
 for(const row of grid.layout.cells){
  for(const indicator of grid.cells[row.id]?.indicators??[]){
   const definition=catalogDefinition(indicator.kind);if(!definition?.secondSymbol)continue;
   const raw=Object.hasOwn(indicator.inputs??{},'symbol')?indicator.inputs.symbol:definition.inputs.find(input=>input.key==='symbol')?.defval;
   const parsed=parseSymbolMath(String(raw??'').trim().toUpperCase());if(!parsed.ok)continue;
   const resolution=indicatorTimeframeOf(indicator.presentation).interval??row.interval;
   if(resolution)keys.add(secondSymbolKey(parsed.expression.canonical,resolution));
  }
 }
 return keys;
}
