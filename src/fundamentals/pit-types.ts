import type {CompanyFacts} from './company-facts';
import type {CorporateActionEvent} from '../domain/chart-events';
import type {IntervalSpec} from '../domain/intervals';
import type {AdjustmentBasis} from '../domain/types';
/** Point-in-time fundamentals: shared types. Every value carries the filing it came from and the instant it became
 * public, so a chart bar never shows a number before the market could have known it. */
export type {AdjustmentBasis};
export type PitRevisions='first'|'latest';
export type PitPeriod='ttm'|'quarterly'|'annual';
export type PitDisplay='value'|'yoy';
/** How a value was obtained. The data window shows PIT_METHOD_LABELS[method]. */
export type PitMethod='reported'|'ytd-diff'|'fy-less-9m'|'sum-4q'|'computed';
export const PIT_METHOD_LABELS:Readonly<Record<PitMethod,string>>=Object.freeze({
 reported:'Reported','ytd-diff':'Year to date less prior period','fy-less-9m':'Full year less 9 months','sum-4q':'Sum of last 4 quarters',computed:'Calculated by OpenCandle',
});
/** money: filing currency; per-share: currency per share; count: shares; percent and ratio are pure numbers. */
export type PitMeasure='money'|'per-share'|'count'|'percent'|'ratio';
/** Provenance of one plotted value. availableAt is Unix seconds (SEC acceptance, else the next New York session after
 * the filed date). note carries remarks such as "14-week quarter". */
export interface PitStamp {start:string|null;end:string;filed:string;accession:string|null;form:string|null;tag:string|null;method:PitMethod;retrievedAt:string;availableAt:number;note:string|null}
/** index[i] is the stamp of bar i, or -1 when the bar has none. */
export interface PitStamps {table:readonly PitStamp[];index:Int32Array}
export type PitMetricKey='eps'|'revenue'|'net_income'|'ocf'|'capex'|'fcf'|'fcf_margin'|'fcf_ps'|'gross_margin'|'op_margin'|'net_margin'|'current_ratio'|'liab_equity'|'shares'|'dps'|'pe'|'ey'|'mcap'|'ps'|'pb'|'pfcf'|'fcfy'|'dy';
/** ratio: needs the bar's close; ignores the Period and Display inputs ("Ratios always use TTM"). */
export interface PitMetricSpec {key:PitMetricKey;label:string;short:string;measure:PitMeasure;ratio:boolean}
export interface PitCompanyInput {
 facts:CompanyFacts;
 /** When the companyfacts document was retrieved (FactsSource.retrievedAt). */
 retrievedAt:string;
 /** Accession number to the submissions acceptanceDateTime text. Missing entries use the next session after the filed date. */
 acceptance?:ReadonlyMap<string,string|null>|null;
 /** Alpaca split actions for the chart symbol, or null/undefined when they are not loaded. */
 splitActions?:readonly CorporateActionEvent[]|null;
 /** Every ticker the SEC ticker file maps to this CIK. More than one means several share classes. */
 classTickers?:readonly string[];
}
/** A chart bar as the engine needs it. time is the bar's open in Unix seconds, in time order. */
export interface PitBar {time:number;open:number;close:number}
export interface PitChart {bars:readonly PitBar[];interval:Pick<IntervalSpec,'unit'|'multiplier'|'seconds'>;adjustment:AdjustmentBasis;
 /** Instrument currency, or null when the dataset does not state one. */
 currency:string|null}
export interface PitRequest {metric:PitMetricKey;period:PitPeriod;display:PitDisplay;revisions:PitRevisions}
/** One plot. values[i] is null where gapNotes[i] (when set) says why. reason is set when the whole series is empty. */
export interface PitSeries {values:(number|null)[];fundamentalStamps:PitStamps;gapNotes:(string|null)[];reason:string|null;notes:string[]}
export interface PeBandsRequest {mode:'own'|'multiples';lookbackYears:number;bands:'percentile'|'sigma';multiples:readonly [number,number,number];graham:boolean;revisions:PitRevisions}
export interface PeBandsResult {median:(number|null)[];upper:(number|null)[];lower:(number|null)[];m1:(number|null)[];m2:(number|null)[];m3:(number|null)[];graham:(number|null)[];fundamentalStamps:PitStamps;gapNotes:(string|null)[];reason:string|null;notes:string[]}
/** A share split or stock dividend: p new shares for every q old shares (k = p / q). effective is the New York date
 * of the first session on the new basis, when known. after/through bound it from the filings: the last filing still
 * on the old basis and the first one on the new basis. */
export interface PitSplit {p:number;q:number;k:number;effective:string|null;after:string|null;through:string|null;source:'alpaca'|'restatement';confirmed:boolean}
/** One value for one period as known from instant `at` on. A later version of the same period supersedes it. */
export interface PitVersion {at:number;value:number|null;reason:string|null;start:string|null;end:string;filed:string;accession:string|null;form:string|null;tag:string|null;method:PitMethod;note:string|null;conflict?:boolean}
