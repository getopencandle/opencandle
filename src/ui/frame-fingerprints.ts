import type {MultiChartCellState} from './MultiChartGrid';
import type {BarDataset} from '../domain/types';
import {historicalCalculationFingerprint,historicalOwnerKey,HISTORICAL_FRAME_LIMITS} from '../chart/historical-frame';
import {indicatorLegacyDefaults,indicatorActivePlotIds,SMOOTHING_INDICATORS,SMOOTHING_INPUT_KEYS,validateIndicatorSnapshots,type IndicatorSnapshot} from '../chart/indicator-settings';
import {indicatorSmoothingSettings,indicatorVwapBandSettings,indicatorVolumeMaType,VWAP_BAND_INPUT_KEYS} from '../domain/indicators';
import {validateComparisonSettings} from '../chart/compare-port';
import {sourceContextForDataset} from '../chart/source-context';
import {restoreScriptBindings} from './script-library';
import {measureWorkspaceJSON} from './workspace-json';

const sorted=(record:Record<string,unknown>)=>Object.keys(record).sort().map(key=>[key,record[key]]);
/** Dormant controls do not change the historical calculation or loaded plot geometry.
 * Keep the pre-smoothing descriptor byte-for-byte for legacy and explicit None. */
function builtDescriptor(row:IndicatorSnapshot){
 const inputs:Record<string,unknown>={...indicatorLegacyDefaults[row.kind],...row.inputs};
 if(row.kind==='volume'&&indicatorVolumeMaType(row.inputs)==='SMA')delete inputs.maType;
 if(row.kind==='rsi'&&inputs.divergence!==true)delete inputs.divergence;
 if(SMOOTHING_INDICATORS.includes(row.kind)){
  const smoothing=indicatorSmoothingSettings(row.inputs);
  for(const key of SMOOTHING_INPUT_KEYS)delete inputs[key];
  if(smoothing.type!=='None'){
   inputs.smoothingType=smoothing.type;inputs.smoothingLength=smoothing.length;
   if(smoothing.type==='SMA+BB')inputs.smoothingMultiplier=smoothing.multiplier;
  }
 }
 if(row.kind==='vwap'){
  if(inputs.kernelVersion!==2)delete inputs.kernelVersion;
  const bands=indicatorVwapBandSettings(row.inputs);
  for(const key of VWAP_BAND_INPUT_KEYS)delete inputs[key];
  for(const n of [1,2,3] as const)if(bands[`band${n}Enabled`]){
   inputs.bandMode=bands.bandMode;inputs[`band${n}Enabled`]=true;inputs[`band${n}Multiplier`]=bands[`band${n}Multiplier`];
  }
 }
 const active=new Set(indicatorActivePlotIds(row.kind,row.inputs));
 return [1,'built',row.kind,sorted(inputs),row.offset,Object.keys(row.plots).filter(id=>active.has(id)).sort().map(id=>[id,row.plots[id].kind])];
}
/** Models and dataset arrays are immutable. A rejected calculation is not cached.
 * No native instance IDs, transient input tokens, prices, colors or titles enter
 * these portable calculation identities. Source/version changes remain exact. */
export function createFrameFingerprintCalculator(){
 const cache=new WeakMap<MultiChartCellState,WeakMap<BarDataset[],Promise<Readonly<Record<string,string>>>>>();
 return function calculate(cell:MultiChartCellState,datasets:BarDataset[]):Promise<Readonly<Record<string,string>>>{
  let sources=cache.get(cell);if(!sources){sources=new WeakMap();cache.set(cell,sources);}const existing=sources.get(datasets);if(existing)return existing;
  const work=(async()=>{
   measureWorkspaceJSON({cell});validateIndicatorSnapshots(cell.indicators);const scripts=restoreScriptBindings(cell.scriptBindings??[]);
   if(!Array.isArray(cell.comparisons)||cell.indicators.length+scripts.length+cell.comparisons.length>HISTORICAL_FRAME_LIMITS.owners)throw Error('Historical calculation owner budget exceeded.');
   if(!Array.isArray(datasets)||Object.getPrototypeOf(datasets)!==Array.prototype||Reflect.ownKeys(datasets).length!==datasets.length+1)throw Error('Historical sources require a dense plain array.');
   const catalog=Array.from({length:datasets.length},(_,index)=>{const descriptor=Object.getOwnPropertyDescriptor(datasets,String(index));if(!descriptor?.enumerable||!('value' in descriptor))throw Error('Historical source entries require plain data.');const dataset=descriptor.value as BarDataset;return{dataset,source:sourceContextForDataset(dataset)};});
   const descriptors=new Map<string,string>();
   const add=(kind:'built'|'script'|'comparison',id:string,descriptor:unknown)=>{const key=historicalOwnerKey({kind,id});if(descriptors.has(key))throw Error('Duplicate historical calculation owner.');descriptors.set(key,JSON.stringify(descriptor));};
   for(const row of cell.indicators)add('built',row.id,builtDescriptor(row));
   for(const row of scripts)add('script',row.id,[1,'script',row.documentId,row.version,row.source,row.pane,row.paneId??null,row.ownScale??false,Object.keys(row.plots).sort().map(id=>[id,row.plots[id].kind])]);
   for(const row of cell.comparisons){const matches=catalog.filter(entry=>entry.source.datasetId===row.datasetId);if(matches.length!==1)throw Error('Historical comparison requires one exact supplied source.');const {dataset,source}=matches[0];validateComparisonSettings({...row,dataset});add('comparison',row.id,[1,'comparison',source.basisIdentity,source.revision,row.mode,row.baseline]);}
   return Object.freeze(Object.fromEntries(await Promise.all([...descriptors].map(async([key,descriptor])=>[key,await historicalCalculationFingerprint(descriptor)]))));
  })();sources.set(datasets,work);void work.catch(()=>{if(sources!.get(datasets)===work)sources!.delete(datasets);});return work;
 };
}
