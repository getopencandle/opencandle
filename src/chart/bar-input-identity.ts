import type {Bar,BarDataset} from '../domain/types';

const identities=new WeakMap<readonly Bar[],string>();
/** Arrays published by one live feed subscription share a lineage. Ticks replace the forming bar or append
 * one, so every snapshot of a subscription is the same chart input that grew; ownership guards compare lineage, not array
 * identity. `seq` orders snapshots of one lineage (newer snapshots have a larger seq). */
interface LiveLineage {key:string;seq:number}
const lineages=new WeakMap<readonly Bar[],LiveLineage>();
let sequence=0n;
/** Stamp a live snapshot. Only arrays that were never identified can join a lineage (an identity never changes). */
export function stampLiveLineage(bars:readonly Bar[],key:string,seq:number):void{
 if(typeof key!=='string'||!key.length||key.length>4096||!Number.isSafeInteger(seq))throw new Error('Invalid live lineage stamp');
 if(identities.has(bars)&&!lineages.has(bars))return;
 const prior=lineages.get(bars);if(prior&&prior.key!==key)return;
 lineages.set(bars,{key,seq});
}
export function liveLineageOf(bars:readonly Bar[]|null|undefined):Readonly<LiveLineage>|null{return bars?lineages.get(bars)??null:null;}
/** Inputs are immutable. This local token follows the array before the renderer clones it. Live snapshots of one
 * subscription share one token: they are the same input as it grows. */
export function barInputIdentity(bars:readonly Bar[]):string{
 let identity=identities.get(bars);
 if(identity===undefined){const lineage=lineages.get(bars);identity=lineage?`live:${lineage.key}`:`bars:${++sequence}`;identities.set(bars,identity);}
 return identity;
}
/** Arrays that are an All-charts Bar Replay frame of a non-active chart (replayLayoutFrames). Their last bar is forming, whatever the cell's execution identity says. */
const replayFrames=new WeakSet<readonly Bar[]>();
export function markReplayFrameBars(bars:readonly Bar[]):void{replayFrames.add(bars);}
export function isReplayFrameBars(bars:readonly Bar[]|null|undefined):boolean{return !!bars&&replayFrames.has(bars);}
export function isLiveInputIdentity(identity:string|null|undefined):boolean{return typeof identity==='string'&&identity.startsWith('live:');}
/** Same chart input: the exact array, or two snapshots of one live subscription. */
export function sameBarsInput(left:readonly Bar[]|null|undefined,right:readonly Bar[]|null|undefined):boolean{
 if(left===right)return true;if(!left||!right)return false;
 const a=lineages.get(left),b=lineages.get(right);return !!a&&!!b&&a.key===b.key;
}
/** The same chart dataset input. The exact object, or two snapshots of one live subscription: the same live
 * lineage (so the same dataset id and revision), instrument and resolution. A live tick, append, page or Alpaca tail re-read
 * publishes a new dataset object on the same lineage; a new symbol, source, revision or re-adjusted reload does not match. */
export function sameDatasetInput(left:BarDataset|null|undefined,right:BarDataset|null|undefined):boolean{
 if(left===right)return true;if(!left||!right||!liveLineageOf(left.bars)||!sameBarsInput(left.bars,right.bars))return false;
 return left.provenance.datasetId===right.provenance.datasetId&&left.provenance.revision===right.provenance.revision&&left.resolution===right.resolution&&left.instrument.id===right.instrument.id;
}
/** The same chart universe: the exact array, or one of equal length whose datasets are pairwise the same input. */
export function sameDatasetsInput(left:readonly BarDataset[]|null|undefined,right:readonly BarDataset[]|null|undefined):boolean{
 if(left===right)return true;if(!left||!right||left.length!==right.length)return false;
 return left.every((dataset,index)=>sameDatasetInput(dataset,right[index]));
}
/** True when `candidate` is a strictly newer snapshot of the same live subscription as `current`. */
export function newerLiveBars(current:readonly Bar[]|null|undefined,candidate:readonly Bar[]|null|undefined):boolean{
 const a=liveLineageOf(current),b=liveLineageOf(candidate);return !!a&&!!b&&a.key===b.key&&b.seq>a.seq;
}
