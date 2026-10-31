import type {ChartController} from '../chart/adapter';
import type {ChartMenuActionLease,ChartMenuSnapshot} from '../chart/context-menu';
import type {ChartInputSnapshot} from '../chart/input-visibility';
import {chartSourceContextKey} from '../chart/source-context';
import {sameBarsInput} from '../chart/bar-input-identity';

export interface RootChartTarget {
 epoch:number;cellId:string;controller:ChartController|null;input:ChartInputSnapshot;executionIdentity:string;
}
export interface RootChartActionOwnership {assertCurrent:(native?:boolean)=>void;release:()=>void}
/** The term of the captured target that no longer holds. */
export type ChartActionStaleTerm='epoch'|'bars'|'style'|'execution'|'source'|'owner';
export const CHART_ACTION_STALE_MESSAGE='The chart changed. Reopen the menu.';
/** The user message stays plain; `term` and `diagnostic` say which captured term failed (diagnostics only, never shown). */
export class ChartActionStaleError extends Error {
 readonly term:ChartActionStaleTerm;readonly diagnostic:string;
 constructor(term:ChartActionStaleTerm,detail:string){super(CHART_ACTION_STALE_MESSAGE);this.name='ChartActionStaleError';this.term=term;this.diagnostic=`Chart action target is stale: ${term} (${detail}).`;}
}
/** A menu may close while its dialog remains open. Only its adopted target can
 * authorize that dialog, and native preparations keep their own publication lease.
 * Bars compare as the same chart input (sameBarsInput), not by array identity. A live feed publishes a
 * new array on every tick, on the Alpaca all-exchange tail re-read and on paging, all on one lineage (same dataset id and
 * revision), so those keep the action current. A non-live input still compares exactly, and a new source, revision,
 * symbol or re-adjusted reload (a new revision and lineage) still refuses through the bars and source terms. */
export function captureRootChartAction(snapshot:ChartMenuSnapshot,lease:ChartMenuActionLease,read:()=>RootChartTarget):RootChartActionOwnership {
 if(lease.snapshot!==snapshot)throw new Error('The chart menu target is no longer current.');
 let epoch:number,sourceKey:string,live=true;
 const stale=(current:RootChartTarget,native:boolean):ChartActionStaleError|null=>{
  if(current.epoch!==epoch)return new ChartActionStaleError('epoch','the chart grid generation changed');
  if(current.cellId!==snapshot.cellId)return new ChartActionStaleError('owner','the active chart cell changed');
  if(current.controller!==snapshot.controller)return new ChartActionStaleError('owner','the chart controller changed');
  if(!sameBarsInput(current.input.bars,snapshot.input.bars))return new ChartActionStaleError('bars','the chart bars are another input, not a live update of the captured one');
  if(current.input.style!==snapshot.input.style)return new ChartActionStaleError('style','the chart style changed');
  if(current.executionIdentity!==snapshot.executionIdentity)return new ChartActionStaleError('execution','the replay or ordinary execution changed');
  if(chartSourceContextKey(current.input.source)!==sourceKey)return new ChartActionStaleError('source','the chart source identity changed');
  if(native&&!lease.isOwnerCurrent())return new ChartActionStaleError('owner','the chart menu lease is no longer the owner');
  return null;
 };
 const assertCurrent=(native=true)=>{
  if(!live)throw new Error('The chart action was closed or replaced.');
  const failure=stale(read(),native);if(failure)throw failure;
 };
 try{if(!lease.isCurrent())throw new Error('The chart menu target is no longer current.');epoch=read().epoch;sourceKey=chartSourceContextKey(snapshot.input.source);assertCurrent();}catch(cause){live=false;try{lease.release();}catch(cleanup){throw new AggregateError([cause,cleanup],'Chart action acquisition and release failed.');}throw cause;}
 return Object.freeze({assertCurrent,release(){if(!live)return;live=false;lease.release();}});
}
