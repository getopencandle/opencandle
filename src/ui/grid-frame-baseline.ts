import type {Bar,BarDataset} from '../domain/types';
import type {ReplayState} from '../domain/replay';
import type {GridFrameEditBaseline,MultiChartCellState,MultiChartState} from './MultiChartGrid';
import {assertHistoricalFrameCompatible,validateHistoricalFrame} from '../chart/historical-frame';
import {chartSourceContextKey,sourceContextForDataset} from '../chart/source-context';
import {cellSessionDataset} from '../chart/cell-session';
import {isReplaySnapshotOf} from '../domain/replay-live-snapshot';
// A newer snapshot of the same live feed is the same input (identity for every other source).
import {sameBarsInput} from '../chart/bar-input-identity';
import {validateViewport} from '../chart/inspection';
import {validateChartOptions} from '../chart/navigation';
import {defaultPriceScaleSettings,validatePriceScaleSettings,type PriceScaleSettings} from '../chart/price-scale-state';
import {measureWorkspaceJSON} from './workspace-json';
import {projectGrid,type ChartWorkspace} from './workspace-grid';

const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const fixed=(cell:MultiChartCellState)=>{const {frame,viewport,chartOptions,...rest}=cell;const {auto,scale,invert,...options}=chartOptions;return{...rest,chartOptions:options};};
/** A lock or reset of a lock saves its price scale document in the same frame publication (one undo step).
 * Only the lock fields may ride it; see lockOnly. */
const framed=(cell:MultiChartCellState)=>{const {priceScale,...rest}=fixed(cell);return rest;};
/** The price scale fields a frame publication must keep, in canonical (validated) order. An absent document is the
 * factory default the chart's price scale port starts from. */
const lockless=(value:PriceScaleSettings|undefined)=>{const {lockRatio,ratio,...kept}=validatePriceScaleSettings(value??defaultPriceScaleSettings());return kept;};
function lockOnly(before:MultiChartCellState,after:MultiChartCellState){
 if(after.priceScale===undefined)throw new Error('The chart layout change was not applied.');
 const closing=validatePriceScaleSettings(after.priceScale);
 if(!same(lockless(before.priceScale),lockless(closing)))throw new Error('The chart layout change was not applied.');
 if(closing.lockRatio&&after.chartOptions.auto!==false)throw new Error('A locked price to bar ratio requires a manual price range.');
}
function record(value:unknown):asserts value is Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).some(key=>typeof key!=='string'||!Object.getOwnPropertyDescriptor(value,key)?.enumerable||!('value' in Object.getOwnPropertyDescriptor(value,key)!)))throw new Error('Frame edit metadata requires plain data records.');}

/** Local, current-generation gesture metadata can enrich the opening Undo entry.
 * This is never an imported authority token. The Grid owns native observation;
 * root independently pins model, exact arrays, replay run and allowed changes. */
export function prepareGridFrameHistory<T extends ChartWorkspace>(workspace:T,next:MultiChartState,baseline:GridFrameEditBaseline,current:{datasets:BarDataset[];dataset:BarDataset;bars:Bar[];replay:ReplayState|null}):T&{grid:MultiChartState}{
 record(baseline);if(baseline.kind!=='native-frame'||baseline.expectedGrid!==workspace.grid||!workspace.grid)throw new Error('The chart layout change was not applied.');
 const previous=workspace.grid;measureWorkspaceJSON({previous,next,frames:baseline.frames,viewports:baseline.viewports});record(baseline.inputs);record(baseline.viewports);
 const ids=Object.keys(baseline.frames),inputIds=Object.keys(baseline.inputs),viewportIds=Object.keys(baseline.viewports);if(!ids.length||ids.length>16||ids.length!==inputIds.length||ids.length!==viewportIds.length||ids.some(id=>!Object.hasOwn(baseline.inputs,id)||!Object.hasOwn(baseline.viewports,id)||!Object.hasOwn(previous.cells,id)))throw new Error('The chart layout change was not applied.');
 if(!same(previous.layout,next.layout)||previous.presetId!==next.presetId||previous.schemaVersion!==next.schemaVersion||Object.keys(previous.cells).length!==Object.keys(next.cells).length||Object.keys(previous.cells).some(id=>!Object.hasOwn(next.cells,id)))throw new Error('The chart layout change was not applied.');
 const cells={...previous.cells};
 for(const id of Object.keys(previous.cells)){
  const before=previous.cells[id],after=next.cells[id],observed=Object.hasOwn(baseline.frames,id);if(!same(observed?framed(before):fixed(before),observed?framed(after):fixed(after)))throw new Error('The chart layout change was not applied.');
  if(observed&&!same(before.priceScale,after.priceScale))lockOnly(before,after);
  validateChartOptions(after.chartOptions);if(after.viewport!==undefined)validateViewport(after.viewport);
  if(!Object.hasOwn(baseline.frames,id)){if(!same(before.frame,after.frame)||!same(before.chartOptions,after.chartOptions)||!same(before.viewport,after.viewport))throw new Error('A changed frame or viewport is missing its opening observation.');continue;}
  const input=baseline.inputs[id];record(input);record(input.source);
  const metadata=previous.layout.cells.find(row=>row.id===id);if(!metadata)throw new Error('The chart layout change was not applied.');
  const matches=current.datasets.filter(data=>data.provenance.datasetId===before.datasetId&&data.instrument.symbol===metadata.symbol&&data.resolution===metadata.interval);if(matches.length!==1)throw new Error('The chart layout change was not applied.');
  const dataset=cellSessionDataset(matches[0],before),active=id===previous.layout.activeCellId,bars=active?current.bars:dataset.bars,source=sourceContextForDataset(dataset,bars),execution=active?current.replay?.runId??'ordinary':'ordinary';
  // A held replay copy (Bar Replay on a live chart, also while its start bar is chosen) is the root's active dataset, while the
  // cell draws those same bars under the live feed's source; that pair is this chart, not a changed one.
  if(active&&chartSourceContextKey(sourceContextForDataset(current.dataset,bars))!==chartSourceContextKey(source)&&!isReplaySnapshotOf(current.dataset,dataset)||!sameBarsInput(input.bars,bars)||input.executionIdentity!==execution||input.style!==before.style||chartSourceContextKey(input.source)!==chartSourceContextKey(source))throw new Error('The chart layout change was not applied.');
  const viewport=baseline.viewports[id];record(viewport);if(Object.keys(viewport).length!==2||!Object.hasOwn(viewport,'from')||!Object.hasOwn(viewport,'to'))throw new Error('Opening viewport requires exact finite time bounds.');validateViewport(viewport);
  const opening=validateHistoricalFrame(baseline.frames[id]);assertHistoricalFrameCompatible(opening,{source,style:before.style,calculationFingerprints:opening.calculationFingerprints});
  const closing=assertHistoricalFrameCompatible(after.frame,{source,style:before.style,calculationFingerprints:opening.calculationFingerprints});
  for(const [cell,frame] of [[before,opening],[after,closing]] as const){const price=frame.panes.find(pane=>pane.key.kind==='price')!,scale=price.log?'logarithmic':price.mode==='price'?'linear':price.mode;if(cell.chartOptions.scale!==scale||cell.chartOptions.invert!==price.invert||cell.chartOptions.auto!==(price.manualRange===null))throw new Error('Price frame settings disagree with the chart controls.');}
  if(same(opening,closing)&&same(viewport,after.viewport??viewport)&&before.chartOptions.auto===after.chartOptions.auto)throw new Error('The chart layout change was not applied.');
  cells[id]={...before,frame:opening,viewport:{from:viewport.from,to:viewport.to}};
 }
 return projectGrid(workspace,{...previous,cells});
}
