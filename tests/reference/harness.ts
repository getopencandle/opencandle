/**
 * Shared helpers for the indicator guardrails (tests/reference/*.test.ts).
 * Fixtures come from scripts/reference/generate_reference.py (deterministic, seeded; no market data).
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {CATALOG_INDICATORS,ALL_CATALOG_INDICATOR_IDS,type CatalogDefinition} from '../../src/domain/indicator-catalog';
import type {Bar} from '../../src/domain/types';
import {indicatorDefaults} from '../../src/chart/indicator-settings';

const fixture=(name:string)=>JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/reference/'+name,import.meta.url)),'utf8'));
export interface ReferenceCase {id:string;indicator:string;inputs:Record<string,unknown>;plots:Record<string,(number|null)[]>;source:string;cite:string;notes:string;warmup:number|null;tol:number}
export interface VwapCase {id:string;series:'us30m'|'crypto1h';inputs:Record<string,unknown>;plots:{vwap:(number|null)[]};cite:string}
export const BARS:{daily:Bar[];dailyEdge:Bar[];us30m:Bar[];crypto1h:Bar[]}=fixture('bars.json');
export const EXPECTED:{cases:ReferenceCase[];vwap:VwapCase[];crosschecked:string[];talibVersion:string}=fixture('expected.json');
export interface CoverageRow {id:string;status:'reference-tested'|'hand-tested'|'untested';cases:string[];reason?:string;disagreements?:string[]}
export const loadCoverage=():{rows:CoverageRow[]}=>fixture('coverage.json');

/** The ten original built-ins (src/domain/indicators.ts) plus every catalog id. */
export const BASE_IDS=['volume','sma','ema','rsi','macd','bb','vwap','stochastic','atr','obv'] as const;
export const ALL_IDS:readonly string[]=[...BASE_IDS,...ALL_CATALOG_INDICATOR_IDS];
export const definitionOf=(id:string):CatalogDefinition|undefined=>CATALOG_INDICATORS.find(row=>row.id===id);
/** New-instance defaults: every catalog input at its defval (what the indicator dialog creates). */
export function defaultInputs(id:string):Record<string,unknown>{
 const definition=definitionOf(id);
 // Anchored VWAP has no anchor until the user clicks a bar; the fixtures anchor it before their first bar (the user's choice of the first bar).
 if(definition)return {...Object.fromEntries(definition.inputs.map(input=>[input.key,input.defval])),...(id==='avwap'?{anchor:'1970-01-01'}:{})};
 // The original ten: the app's own new-instance defaults (src/chart/indicator-settings.ts).
 return {...(indicatorDefaults as Record<string,Record<string,unknown>>)[id]};
}
export const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
/** First mismatch between two series from `from`, or null. Null equals null; a finite value equals a finite value within rel tolerance (abs floor 1). */
export function firstMismatch(actual:readonly (number|null|undefined)[],expected:readonly (number|null|undefined)[],from=0,tol=1e-6):{index:number;actual:unknown;expected:unknown}|null{
 const length=Math.max(actual.length,expected.length);
 for(let index=from;index<length;index++){
  const a=actual[index]??null,e=expected[index]??null;
  if(a===null&&e===null)continue;
  if(!finite(a)||!finite(e))return {index,actual:a,expected:e};
  if(Math.abs(a-e)>tol*Math.max(1,Math.abs(e)))return {index,actual:a,expected:e};
 }
 return null;
}
/** Exact (Object.is) equality, first difference or null. */
export function firstExactDifference(actual:readonly unknown[],expected:readonly unknown[],from=0):{index:number;actual:unknown;expected:unknown}|null{
 const length=Math.max(actual.length,expected.length);
 for(let index=from;index<length;index++){const a=actual[index]??null,e=expected[index]??null;if(!Object.is(a,e))return {index,actual:a,expected:e};}
 return null;
}
export const describeMismatch=(m:{index:number;actual:unknown;expected:unknown}|null,bars?:readonly Bar[])=>m===null?'ok':`bar ${m.index}${bars?.[m.index]?' ('+new Date(bars[m.index].time*1000).toISOString()+')':''}: expected ${String(m.expected)}, actual ${String(m.actual)}`;
