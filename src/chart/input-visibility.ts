import type {Bar} from '../domain/types';
import type {ChartSourceContext} from './adapter';
import {sameChartSourceBasis} from './source-context';
import {sameBarsInput} from './bar-input-identity';
export interface ChartInputSnapshot {bars:readonly Bar[];source:ChartSourceContext;style:string}
/** React inputs are immutable. Equal counts/times do not identify equal prices or sources. A newer snapshot of the same
 * live subscription is the same input that grew: the chart shows it without hiding prices. */
export function chartInputCommitted(committed:ChartInputSnapshot|null,desired:ChartInputSnapshot){
 return !!committed&&sameBarsInput(committed.bars,desired.bars)&&committed.style===desired.style&&sameChartSourceBasis(committed.source,desired.source);
}
