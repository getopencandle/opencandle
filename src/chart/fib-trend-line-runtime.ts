import type {Drawing,Projector} from '@luxalgo/vela';
import {acquireOwnedFibTrendLineHit} from './trendline-annotation';
export interface FibTrendLineHitLease {
 readonly points:Readonly<{x1:number;y1:number;x2:number;y2:number}>;
 assertCurrent():void;assertLocal():void;dispose():void;
}
/** Native models have no action authority by themselves. Only an active owned
 * native invocation can supply the additional diagonal hit segment. */
// Lazy function-only dependency: annotation owns the map and exposes no mint.
// It imports this lease as a type, so no module initialization reads an unfinished
// native class or attempts registration/creation through the cycle.
export function acquireFibTrendLineHit(model:Drawing,projector:Projector):FibTrendLineHitLease|undefined{return acquireOwnedFibTrendLineHit(model,projector);}
