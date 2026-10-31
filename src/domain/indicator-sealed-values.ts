/**
 * Sealed indicator value arrays.
 *
 * The scalar readout proof (src/chart/builtin-presentation-proof.ts) used to lock every owned output index of every plot
 * with its own Object.defineProperty on each calculation. That turned each values array into a slow dictionary array and
 * cost about 4 ms per plot at 4,000 bars, on every live tick. A sealed array is built here, by copying, into a new plain
 * Array that is then frozen: every index is an own data property that can never change, and so is its length. Only arrays
 * this module built are in the set, so membership proves exactly what the per-index lock would have established, and the
 * proof and the legend copy may skip that work for them. Anything else (a foreign array, a Proxy) takes the old path.
 */
const sealed=new WeakSet<object>();
/** A frozen copy of `values` (read once, by index). The input is not changed. */
export function sealIndicatorValues(values:ArrayLike<number|null>):readonly (number|null)[]{
 const count=values.length,copy:(number|null)[]=[];
 for(let index=0;index<count;index++)copy.push(values[index]);
 Object.freeze(copy);sealed.add(copy);return copy;
}
/** True only for an array built by sealIndicatorValues. */
export function isSealedIndicatorValues(values:unknown):boolean{return typeof values==='object'&&values!==null&&sealed.has(values);}
