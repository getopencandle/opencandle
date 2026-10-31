/**
 * Volume footprint alert sources. requirements/
 * analysis.json says only: "Supported condition requires appropriate source ... Footprint historical/live differences
 * disclosed." Everything else is pending reference comparison:
 * - The source is offered on a Volume footprint chart. Its settings (row size as a price, imbalance %, stacked count,
 *   ignore zero volume, minimal imbalance volume) are frozen when the alert is created, so a later Auto row size change
 *   does not move it.
 * - Each observation builds the footprint of the endpoint bar (the latest supplied bar) with the model in
 *   src/domain/footprint.ts. Imbalance metrics read 1 when that bar has at least one such imbalance (stacked: a run of at
 *   least the stacked count), else 0. Volume delta, total buy and total sell read the bar's approximated volumes.
 * - Disclosure: buy and sell volume is approximated from bar paths, not tick or bid/ask data, and a forming live bar
 *   can change until it closes, so live values and the values a closed historical bar shows can differ.
 */
import {footprintBar,footprintBuySell,FOOTPRINT_MAX_ROWS,type FootprintOptions} from './footprint';

export const FOOTPRINT_ALERT_METRICS=['newBuyImbalance','newSellImbalance','stackedBuyImbalance','stackedSellImbalance','volumeDelta','totalBuyVolume','totalSellVolume'] as const;
export type FootprintAlertMetric=typeof FOOTPRINT_ALERT_METRICS[number];
export const FOOTPRINT_ALERT_LABELS:Readonly<Record<FootprintAlertMetric,string>>=Object.freeze({newBuyImbalance:'New buy imbalance',newSellImbalance:'New sell imbalance',stackedBuyImbalance:'Stacked buy imbalance',stackedSellImbalance:'Stacked sell imbalance',volumeDelta:'Volume delta',totalBuyVolume:'Total buy volume',totalSellVolume:'Total sell volume'});
export const FOOTPRINT_ALERT_POLICY='Volume footprint alert (OpenCandle policy pending reference comparison): buy and sell volume is approximated from bar price paths, not tick or bid/ask data. A forming live bar can change until it closes, so live and historical values can differ.';
export interface FootprintAlertInputs {rowSize:number;imbalancePercent:number;stackedImbalanceCount:number;ignoreZeroVolume:boolean;minimalImbalanceVolume:number}
/** Stored inputs keep the shared alert-input record shape (validateFootprintAlertSource checks the exact FootprintAlertInputs fields). */
export interface FootprintAlertSource {kind:'footprint';instanceId:'footprint';snapshotId:string;metric:FootprintAlertMetric;inputs:Record<string,number|string|boolean|null>;transformId:'standard'}
export const isFootprintSignalMetric=(metric:FootprintAlertMetric)=>metric.endsWith('Imbalance');

const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exactKeys=(value:Record<string,unknown>,allowed:readonly string[])=>{
 if(Reflect.ownKeys(value).some(key=>typeof key!=='string'||!allowed.includes(key))||allowed.some(key=>!Object.hasOwn(value,key))||Object.values(Object.getOwnPropertyDescriptors(value)).some(p=>!p.enumerable||!Object.hasOwn(p,'value')))throw new Error('Unsupported, missing or accessor-based footprint alert property.');
};
/** Structural check of a stored footprint source. */
export function validateFootprintAlertSource(source:unknown):asserts source is FootprintAlertSource{
 if(!plain(source))throw new Error('Footprint alert source must be a settings snapshot.');
 exactKeys(source,['kind','instanceId','snapshotId','metric','inputs','transformId']);
 if(source.kind!=='footprint'||source.instanceId!=='footprint'||typeof source.snapshotId!=='string'||!source.snapshotId||source.snapshotId.length>100||source.transformId!=='standard'||!(FOOTPRINT_ALERT_METRICS as readonly unknown[]).includes(source.metric))throw new Error('Invalid footprint alert source.');
 const inputs=source.inputs;if(!plain(inputs))throw new Error('Footprint alert settings are required.');
 exactKeys(inputs,['rowSize','imbalancePercent','stackedImbalanceCount','ignoreZeroVolume','minimalImbalanceVolume']);
 const finite=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
 if(!finite(inputs.rowSize,Number.MIN_VALUE,1e12)||!finite(inputs.imbalancePercent,100,100000)||!finite(inputs.stackedImbalanceCount,2,50)||!Number.isInteger(inputs.stackedImbalanceCount)||typeof inputs.ignoreZeroVolume!=='boolean'||!finite(inputs.minimalImbalanceVolume,0,1e12))throw new Error('Footprint alert settings are out of range.');
}
/** Frozen settings from the chart's footprint settings and its current row size. */
export function footprintAlertInputs(settings:Record<string,unknown>,rowSize:number):FootprintAlertInputs{
 const number=(key:string,fallback:number)=>{const v=Number(settings[key]);return Number.isFinite(v)?v:fallback;};
 return {rowSize,imbalancePercent:number('imbalancePercent',300),stackedImbalanceCount:Math.round(number('stackedImbalanceCount',3)),ignoreZeroVolume:settings.ignoreZeroVolume===true,minimalImbalanceVolume:number('minimalImbalanceVolume',0)};
}
export function footprintAlertSource(metric:FootprintAlertMetric,inputs:FootprintAlertInputs,snapshotId='pending'):FootprintAlertSource{
 const source:FootprintAlertSource={kind:'footprint',instanceId:'footprint',snapshotId,metric,inputs:{rowSize:inputs.rowSize,imbalancePercent:inputs.imbalancePercent,stackedImbalanceCount:inputs.stackedImbalanceCount,ignoreZeroVolume:inputs.ignoreZeroVolume,minimalImbalanceVolume:inputs.minimalImbalanceVolume},transformId:'standard'};
 validateFootprintAlertSource(source);return source;
}
export const footprintAlertSourceLabel=(source:Pick<FootprintAlertSource,'metric'>)=>`Volume footprint: ${FOOTPRINT_ALERT_LABELS[source.metric]}`;
export const footprintAlertUnit=(metric:FootprintAlertMetric)=>isFootprintSignalMetric(metric)?'footprint signal (1 on a bar with it, 0 none)':'approximated volume units';
type Ohlcv={open:number;high:number;low:number;close:number;volume?:number};
/** The metric at the endpoint bar (the last bar), or null with a diagnostic. */
export function footprintAlertValue(bars:readonly Ohlcv[],source:FootprintAlertSource):{value:number|null;diagnostics:string[]}{
 const bar=bars.at(-1);if(!bar)return {value:null,diagnostics:['No bar to evaluate.']};
 if(!(typeof bar.volume==='number'&&Number.isFinite(bar.volume)&&bar.volume>=0))return {value:null,diagnostics:['Volume footprint alerts need bar volume, which the endpoint bar does not have.']};
 const metric=source.metric,inputs=source.inputs as unknown as FootprintAlertInputs;
 if(metric==='volumeDelta'||metric==='totalBuyVolume'||metric==='totalSellVolume'){const split=footprintBuySell(bar)!;return {value:metric==='volumeDelta'?split.buy-split.sell:metric==='totalBuyVolume'?split.buy:split.sell,diagnostics:[]};}
 const options:FootprintOptions={...inputs,vaPercent:70};
 if((bar.high-bar.low)/inputs.rowSize>FOOTPRINT_MAX_ROWS-1)return {value:null,diagnostics:[`The frozen footprint row size is too small for this bar (more than ${FOOTPRINT_MAX_ROWS} rows). Create the alert again.`]};
 const fp=footprintBar(bar,options);
 const flags=metric==='newBuyImbalance'?fp.buyImbalance:metric==='newSellImbalance'?fp.sellImbalance:metric==='stackedBuyImbalance'?fp.stackedBuy:fp.stackedSell;
 return {value:flags.some(Boolean)?1:0,diagnostics:[]};
}
