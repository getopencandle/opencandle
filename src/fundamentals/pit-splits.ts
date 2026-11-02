import type {CorporateActionEvent} from '../domain/chart-events';
import type {AdjustmentBasis,PitSplit} from './pit-types';
/** Share splits, reverse splits and stock dividends: detection and the per-share basis.
 * Sources, in order: Alpaca split actions (the only way to know a split after the latest filing), then restatement
 * pairs in the filings, which confirm Alpaca's splits or stand in for them. Every value is put on the latest basis
 * (after every known split); raw price bars then multiply per-share values back by the splits still ahead of them. */
const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a;
/** The simplest fraction p/q (p, q <= maxTerm, smallest q first) within `tolerance` (relative) of ratio. */
export function simpleFraction(ratio:number,maxTerm=100,tolerance=0.001):{p:number;q:number}|null{
 if(!(ratio>0)||!Number.isFinite(ratio))return null;
 for(let q=1;q<=maxTerm;q++){const p=Math.round(ratio*q);if(p<1||p>maxTerm||gcd(p,q)!==1)continue;if(Math.abs(p/q-ratio)<=tolerance*ratio)return {p,q};}
 return null;
}
/** Decimal places of a reported value as written (2.97 has 2, 3 has 0). */
export function decimalPlaces(value:number):number{
 const text=Math.abs(value).toString(),[mantissa,exponent]=text.split('e'),dot=mantissa.indexOf('.'),digits=dot<0?0:mantissa.length-dot-1;
 return Math.max(0,digits-Number(exponent??0));
}
/** An EPS restatement agrees with split ratio k when the old value divided by k matches the new one within both
 * values' rounding: |earlier / k - later| <= 0.5 * 10^-d_later + 0.5 * 10^-d_earlier / k.
 * JSON numbers drop trailing zeros (1.00 arrives as 1), so both values use the finer precision of the pair. */
export function epsPairAgrees(earlier:number,later:number,k:number):boolean{
 const d=Math.max(decimalPlaces(earlier),decimalPlaces(later)),tolerance=0.5*10**-d+0.5*10**-d/k;
 return Math.abs(earlier/k-later)<=tolerance+1e-12;
}
export const splitText=(split:Pick<PitSplit,'p'|'q'>)=>split.p+'-for-'+split.q;
/** Vintages of one reported period, oldest filing first. */
export interface SplitSeries {kind:'shares'|'eps';vintages:readonly {filed:string;value:number|null}[]}
interface Pair {k:number;p:number;q:number;after:string;through:string}
interface EpsPair {earlier:number;later:number;after:string;through:string}
const overlaps=(a:{after:string;through:string},b:{after:string;through:string})=>a.after<b.through&&b.after<a.through;
function consecutive(series:SplitSeries):{a:{filed:string;value:number};b:{filed:string;value:number}}[]{
 const known=series.vintages.filter((v):v is {filed:string;value:number}=>v.value!==null&&v.value!==0),out=[];
 for(let i=0;i+1<known.length;i++)if(known[i].filed<known[i+1].filed)out.push({a:known[i],b:known[i+1]});
 return out;
}
/** Splits implied by restatements. A share pair (diluted weighted shares or the cover-page count, same period, two
 * filing dates) gives k as a simple fraction of the share ratio; an EPS pair must agree with that k and not with 1.
 * A split needs one of each; its window is the intersection of the agreeing pairs' windows. */
export function inferRestatementSplits(series:readonly SplitSeries[]):PitSplit[]{
 const shares:Pair[]=[],eps:EpsPair[]=[];
 for(const s of series)for(const {a,b} of consecutive(s)){
  if(s.kind==='shares'){if(!(a.value>0&&b.value>0))continue;const f=simpleFraction(b.value/a.value);if(f&&f.p!==f.q)shares.push({...f,k:f.p/f.q,after:a.filed,through:b.filed});}
  else if(a.value!==b.value&&Math.sign(a.value)===Math.sign(b.value))eps.push({earlier:a.value,later:b.value,after:a.filed,through:b.filed});
 }
 const candidates:Pair[]=[];
 for(const pair of shares){
  const agreeing=eps.filter(e=>overlaps(e,pair)&&epsPairAgrees(e.earlier,e.later,pair.k)&&!epsPairAgrees(e.earlier,e.later,1));
  if(!agreeing.length)continue;
  let window={after:pair.after,through:pair.through};
  for(const w of [...agreeing,...shares.filter(other=>other!==pair&&other.p===pair.p&&other.q===pair.q&&overlaps(other,pair))]){const next={after:w.after>window.after?w.after:window.after,through:w.through<window.through?w.through:window.through};if(next.after<next.through)window=next;}
  const same=candidates.find(c=>c.p===pair.p&&c.q===pair.q&&overlaps(c,window));
  if(same){const next={after:same.after>window.after?same.after:window.after,through:same.through<window.through?same.through:window.through};if(next.after<next.through){same.after=next.after;same.through=next.through;}continue;}
  candidates.push({...pair,...window});
 }
 // A pair spanning two splits implies their product; drop it when narrower accepted splits already explain it.
 const length=(c:Pair)=>Date.parse(c.through)-Date.parse(c.after),accepted:Pair[]=[];
 for(const c of [...candidates].sort((a,b)=>length(a)-length(b)||a.after.localeCompare(b.after))){
  const inner=accepted.filter(a=>a.after>=c.after&&a.through<=c.through),product=inner.reduce((x,a)=>x*a.k,1);
  if(inner.length&&Math.abs(product/c.k-1)<=0.001)continue;
  accepted.push(c);
 }
 return accepted.sort((a,b)=>a.after.localeCompare(b.after)).map(c=>({p:c.p,q:c.q,k:c.k,effective:null,after:c.after,through:c.through,source:'restatement',confirmed:false}));
}
/** Alpaca split actions as splits (newRate shares for every oldRate). Events without positive rates are skipped. */
export function alpacaSplits(actions:readonly CorporateActionEvent[]):PitSplit[]{
 const out:PitSplit[]=[];
 for(const event of actions){
  if(event.kind!=='forward-split'&&event.kind!=='reverse-split')continue;
  const p0=event.newRate,q0=event.oldRate;if(!(typeof p0==='number'&&typeof q0==='number'&&p0>0&&q0>0)||p0===q0||!/^\d{4}-\d{2}-\d{2}$/.test(event.exDate))continue;
  let p=p0,q=q0;
  if(Number.isInteger(p)&&Number.isInteger(q)){const g=gcd(p,q);p/=g;q/=g;}else{const f=simpleFraction(p0/q0,1000,1e-9);if(f){p=f.p;q=f.q;}}
  out.push({p,q,k:p0/q0,effective:event.exDate,after:null,through:null,source:'alpaca',confirmed:false});
 }
 return out.sort((a,b)=>a.effective!.localeCompare(b.effective!));
}
/** Alpaca first; a restatement split is confirmed by Alpaca splits whose ex-dates fall inside its window and whose
 * ratios multiply to its k. Restatement splits with no Alpaca event in the window stand in; one whose window holds
 * Alpaca events with another ratio is dropped (Alpaca wins). */
export function mergeSplits(alpaca:readonly PitSplit[]|null,inferred:readonly PitSplit[]):PitSplit[]{
 const out=(alpaca??[]).map(s=>({...s}));
 for(const split of inferred){
  const inside=out.filter(a=>a.source==='alpaca'&&a.effective!>split.after!&&a.effective!<=split.through!);
  if(!inside.length){out.push({...split});continue;}
  const product=inside.reduce((x,a)=>x*a.k,1);
  if(Math.abs(product/split.k-1)<=0.001)for(const a of inside){a.confirmed=true;a.after=split.after;a.through=split.through;}
 }
 return out.sort((a,b)=>(a.effective??a.through??'').localeCompare(b.effective??b.through??''));
}
/** Product of k over splits after a filing: a value filed on `filed` is divided (per share) or multiplied (counts) by
 * it to reach the latest basis. A split with a known date counts when it is effective after the filed date; one known
 * only by its window counts when the filing is no later than the last old-basis filing. */
export function vintageFactor(splits:readonly PitSplit[],filed:string):number{
 let factor=1;for(const s of splits)if(s.effective!==null?s.effective>filed:filed<=s.after!)factor*=s.k;return factor;
}
export interface BarFactors {
 /** Per-share values on bar i are latest-basis values times factor[i]; counts are divided by it. NaN means unknown. */
 factor:Float64Array;
 /** Why factor[i] is unknown. */
 notes:(string|null)[];
 /** Chart-level notes (a split date inferred from a price gap). */
 seriesNotes:string[];
 /** Splits with any date inferred from this chart's bars. */
 splits:PitSplit[];
}
const near=(ratio:number,target:number)=>Math.abs(ratio/target-1)<=0.15;
/** Bars where the previous close over this open is within 15% of k, inside (after, through]. Only the first bar of
 * each New York date is tested, since a split takes effect at a session open. */
function gapBars(bars:readonly {open:number;close:number}[],dates:readonly string[],split:PitSplit):number[]{
 const out:number[]=[];
 for(let i=1;i<bars.length;i++){
  if(dates[i]===dates[i-1]||dates[i]<=split.after!||dates[i]>split.through!)continue;
  const ratio=bars[i-1].close/bars[i].open;if(Number.isFinite(ratio)&&ratio>0&&near(ratio,split.k))out.push(i);
 }
 return out;
}
/** The first bar on or after a date's index, or -1. */
const firstOnOrAfter=(dates:readonly string[],date:string)=>{let lo=0,hi=dates.length;while(lo<hi){const mid=(lo+hi)>>1;if(dates[mid]<date)lo=mid+1;else hi=mid;}return lo<dates.length?lo:-1;};
type Vote='raw'|'adjusted'|'unclear';
/** Per-bar split factors for a chart.
 * Split-adjusted and total-return bars use latest-basis values directly (factor 1).
 * Raw bars multiply by k for every split effective after the bar date. A split known only by its filing window is
 * dated by the single bar with a matching price gap; failing that, bars inside the window are left empty.
 * Unknown adjustment: the price gaps at the splits decide raw or adjusted. When they do not, bars before a split are
 * left empty. */
export function barFactors(splitsIn:readonly PitSplit[],bars:readonly {open:number;close:number}[],dates:readonly string[],adjustment:AdjustmentBasis):BarFactors{
 const n=bars.length,factor=new Float64Array(n).fill(1),notes:(string|null)[]=new Array(n).fill(null),seriesNotes:string[]=[];
 const splits=splitsIn.map(s=>({...s}));
 if(adjustment==='split-adjusted'||adjustment==='total-return'||!n)return {factor,notes,seriesNotes,splits};
 const votes:Vote[]=[],relevant:PitSplit[]=[];
 for(const split of splits){
  if(split.effective===null){
   const gaps=gapBars(bars,dates,split);
   if(gaps.length===1){split.effective=dates[gaps[0]];seriesNotes.push('The '+splitText(split)+' split took effect on '+split.effective+' (date inferred from a price gap).');votes.push('raw');relevant.push(split);continue;}
   if(dates[0]>split.through!)continue;
   relevant.push(split);
   const covers=dates[0]<=split.after!&&dates[n-1]>split.through!;
   votes.push(!gaps.length&&covers&&!near(split.k,1)?'adjusted':'unclear');
   continue;
  }
  if(dates[0]>=split.effective)continue;
  relevant.push(split);
  const at=firstOnOrAfter(dates,split.effective);
  if(at<=0){votes.push('unclear');continue;}
  const ratio=bars[at-1].close/bars[at].open,isK=near(ratio,split.k),isOne=near(ratio,1);
  votes.push(isK&&!isOne?'raw':isOne&&!isK?'adjusted':'unclear');
 }
 if(!relevant.length)return {factor,notes,seriesNotes,splits};
 let mode:'raw'|'adjusted'|'unclear'=adjustment==='raw'?'raw':votes.every(v=>v==='raw')?'raw':votes.every(v=>v==='adjusted')?'adjusted':'unclear';
 if(adjustment==='unknown'&&mode==='adjusted')return {factor,notes,seriesNotes,splits};
 if(mode==='unclear'){
  const UNKNOWN='The price adjustment of this chart is unknown.';
  for(let i=0;i<n;i++)if(relevant.some(s=>s.effective!==null?dates[i]<s.effective:dates[i]<=s.through!)){factor[i]=NaN;notes[i]=UNKNOWN;}
  return {factor,notes,seriesNotes,splits};
 }
 for(let i=0;i<n;i++){
  let f=1,note:string|null=null;
  for(const s of splits){
   if(s.effective!==null){if(s.effective>dates[i])f*=s.k;continue;}
   if(dates[i]<=s.after!)f*=s.k;
   else if(dates[i]<=s.through!){note='A '+splitText(s)+' split took effect between '+s.after+' and '+s.through+', on a date OpenCandle does not know, so per-share values here are left empty.';break;}
  }
  if(note){factor[i]=NaN;notes[i]=note;}else factor[i]=f;
 }
 return {factor,notes,seriesNotes,splits};
}
