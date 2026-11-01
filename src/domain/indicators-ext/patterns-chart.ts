import type {Bar} from '../types';

/**
 * Chart pattern detection (original code, every rule).
 *
 * The detection below is OpenCandle's own, written from the usual textbook shapes (Bulkowski, "Encyclopedia of Chart
 * Patterns").
 * Flags, pennants and cup and handle are reasoned from the public description of those shapes (a sharp pole
 * then a small parallel or converging consolidation; a rounded bowl between two equal rims, then a short shallow handle).
 *
 * Pivots: bar j is a pivot high when its high is above every high of the `pivotLength` bars before it and at least every
 * high of the `pivotLength` bars after it (pivot low mirrors it with lows). A pivot is known only on its confirmation bar
 * j + pivotLength, so detection is causal: nothing is reported before the bar that completes it, and later bars never
 * change an earlier report. Pivots form an alternating zigzag; a second pivot of the same kind replaces the first when it
 * is more extreme, else it is ignored.
 *
 * Each time a pivot is appended, the newest pivots are tested against every enabled pattern. `tolerance` (percent) is the
 * largest relative difference for two levels to count as equal and the smallest relative move for a level to count as
 * rising, falling or clearly lower or higher.
 */
export type ChartPatternId='doubletop'|'doublebottom'|'tripletop'|'triplebottom'|'headshoulders'|'invheadshoulders'|'triangle'|'rectangle'|'risingwedge'|'fallingwedge'|'bullflag'|'bearflag'|'bullpennant'|'bearpennant'|'cuphandle'|'invcuphandle';
export type ChartDirection='bullish'|'bearish'|'neutral';
export interface ChartPatternInfo {id:ChartPatternId;name:string;direction:ChartDirection;rule:string}
export const CHART_PATTERNS:readonly ChartPatternInfo[]=Object.freeze([
 {id:'doubletop',name:'Double top',direction:'bearish',rule:'High, low, high: the two highs equal within tolerance, the low below the lower high by more than tolerance.'},
 {id:'doublebottom',name:'Double bottom',direction:'bullish',rule:'Low, high, low: the two lows equal within tolerance, the high above the higher low by more than tolerance.'},
 {id:'tripletop',name:'Triple top',direction:'bearish',rule:'Three highs within tolerance of each other (max - min against the max), both lows between them below the lowest high by more than tolerance.'},
 {id:'triplebottom',name:'Triple bottom',direction:'bullish',rule:'Three lows within tolerance of each other, both highs between them above the highest low by more than tolerance.'},
 {id:'headshoulders',name:'Head and shoulders',direction:'bearish',rule:'Five pivots high, low, high, low, high: the middle high (head) above both outer highs (shoulders) by more than tolerance, the shoulders equal within tolerance, both lows below the lower shoulder.'},
 {id:'invheadshoulders',name:'Inverted head and shoulders',direction:'bullish',rule:'The mirror of Head and shoulders on lows.'},
 {id:'triangle',name:'Triangle',direction:'neutral',rule:'Last two highs and last two lows: highs not rising and lows not falling (a move within tolerance is flat), not both flat, and the second high-low width narrower than the first.'},
 {id:'rectangle',name:'Rectangle',direction:'neutral',rule:'Last two highs equal within tolerance and last two lows equal within tolerance, the lows below the highs by more than tolerance.'},
 {id:'risingwedge',name:'Rising wedge',direction:'bearish',rule:'Last two highs and lows both rising by more than tolerance, lows rising faster (the width narrows).'},
 {id:'fallingwedge',name:'Falling wedge',direction:'bullish',rule:'Last two highs and lows both falling by more than tolerance, highs falling faster (the width narrows).'},
 // Flags and pennants: five pivots, the pole (low then high for bullish) and a two-high, two-low consolidation.
 {id:'bullflag',name:'Bullish flag',direction:'bullish',rule:'Five pivots low, high, low, high, low: the pole (first low to first high) rises by more than 3 x tolerance; both later lows stay above the pole midpoint; the flag highs and lows are each flat or falling (neither rises by more than tolerance) and the second high-low width is at least half the first (parallel, not converging).'},
 {id:'bearflag',name:'Bearish flag',direction:'bearish',rule:'The mirror of Bullish flag: a falling pole (high to low) of more than 3 x tolerance, both later highs below the pole midpoint, the flag highs and lows each flat or rising, the second width at least half the first.'},
 {id:'bullpennant',name:'Bullish pennant',direction:'bullish',rule:'The Bullish flag pole and midpoint rules, but the consolidation converges: the second high falls and the second low rises, each by more than tolerance.'},
 {id:'bearpennant',name:'Bearish pennant',direction:'bearish',rule:'The Bearish flag pole and midpoint rules, but the consolidation converges: the second high falls and the second low rises, each by more than tolerance.'},
 // Cups: four pivots, rim, bottom, rim, handle.
 {id:'cuphandle',name:'Cup and handle',direction:'bullish',rule:'Four pivots high, low, high, low: the two rims (highs) equal within tolerance, the bottom below the lower rim by more than tolerance; the cup is rounded (at least 40% of the bars from rim to rim have their low in the bottom quarter of the cup depth, a V gives about 25%); the handle low stays above the cup midpoint, and the handle (right rim to handle low) lasts at most half as many bars as the cup.'},
 {id:'invcuphandle',name:'Inverted cup and handle',direction:'bearish',rule:'The mirror of Cup and handle on lows: two equal low rims, a rounded dome (at least 40% of the bars with their high in the top quarter), a handle high below the dome midpoint, lasting at most half the dome.'},
] as ChartPatternInfo[]);
export const chartPatternInfo=(id:ChartPatternId):ChartPatternInfo=>CHART_PATTERNS.find(row=>row.id===id)!;

export interface Pivot {index:number;price:number;kind:'high'|'low'}
export interface ChartPatternHit {id:ChartPatternId;direction:ChartDirection;name:string;/** Reporting bar: the bar that confirmed the last pivot, or with breakout confirmation the breakout bar. */confirmedAt:number;pivots:readonly Pivot[];/** Boundary lines (trend lines or neckline) as pivot-to-pivot segments, extended to confirmedAt. */lines:readonly {from:{index:number;price:number};to:{index:number;price:number}}[];
 /** With breakout confirmation: the side the confirming close broke (a rectangle or triangle can break either way). */breakout?:'up'|'down'}

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);

/** Accepted pivot events in confirmation order: a new pivot, or a more extreme pivot of the same kind that replaces the
 *  last one (`replaces` true). Each carries the bar that confirmed it. */
export function zigzagEvents(bars:readonly Bar[],length:number):Array<Pivot&{confirmedAt:number;replaces:boolean}>{
 const out:Array<Pivot&{confirmedAt:number;replaces:boolean}>=[];let last:Pivot|null=null;
 for(let i=2*length;i<bars.length;i++){
  const j=i-length;let usable=true;for(let k=j-length;k<=i;k++)if(!finite(bars[k].high)||!finite(bars[k].low)){usable=false;break;}if(!usable)continue;
  let highPivot=true,lowPivot=true;
  for(let k=j-length;k<=i;k++){if(k===j)continue;const before=k<j;
   if(before?!(bars[k].high<bars[j].high):!(bars[k].high<=bars[j].high))highPivot=false;
   if(before?!(bars[k].low>bars[j].low):!(bars[k].low>=bars[j].low))lowPivot=false;}
  for(const kind of ['high','low'] as const){
   if(kind==='high'?!highPivot:!lowPivot)continue;
   const pivot:Pivot={index:j,price:kind==='high'?bars[j].high:bars[j].low,kind};
   if(last&&last.kind===kind){if(kind==='high'?pivot.price>last.price:pivot.price<last.price){last=pivot;out.push({...pivot,confirmedAt:i,replaces:true});}continue;}
   last=pivot;out.push({...pivot,confirmedAt:i,replaces:false});
  }
 }
 return out;
}
/** The final alternating zigzag (after replacements). */
export function zigzagPivots(bars:readonly Bar[],length:number):Pivot[]{
 const out:Pivot[]=[];for(const event of zigzagEvents(bars,length)){const pivot={index:event.index,price:event.price,kind:event.kind};if(event.replaces)out[out.length-1]=pivot;else out.push(pivot);}return out;
}

const equal=(a:number,b:number,tol:number)=>Math.abs(a-b)<=tol*Math.max(Math.abs(a),Math.abs(b));
const segment=(a:Pivot,b:Pivot)=>({from:{index:a.index,price:a.price},to:{index:b.index,price:b.price}});
/** The line through a and b, continued to bar `at`. */
const extended=(a:Pivot,b:Pivot,at:number)=>{const slope=b.index===a.index?0:(b.price-a.price)/(b.index-a.index);return {from:{index:a.index,price:a.price},to:{index:at,price:b.price+slope*(at-b.index)}};};

/** The share of cup bars that must sit in the cup's extreme quarter for it to count as rounded. */
export const CUP_ROUND_SHARE=0.4;
/** Share of bars a..c (inclusive) whose low (top: high) is within a quarter of the depth from the bottom (top) price. */
function roundShare(bars:readonly Bar[],a:number,c:number,bottom:number,depth:number,top:boolean):number|null{
 let near=0;for(let k=a;k<=c;k++){const value=top?bars[k].high:bars[k].low;if(!finite(value))return null;if(top?value>=bottom-depth/4:value<=bottom+depth/4)near++;}
 return near/(c-a+1);
}

function test(id:ChartPatternId,p:readonly Pivot[],tol:number,at:number,bars:readonly Bar[]):ChartPatternHit|null{
 const n=p.length,info=chartPatternInfo(id);
 const hit=(pivots:readonly Pivot[],lines:ChartPatternHit['lines']):ChartPatternHit=>({id,direction:info.direction,name:info.name,confirmedAt:at,pivots,lines});
 const zigzag=(pivots:readonly Pivot[])=>pivots.slice(1).map((pivot,k)=>segment(pivots[k],pivot));
 const last=p[n-1];
 if(id==='doubletop'||id==='doublebottom'){
  if(n<3)return null;const [a,b,c]=p.slice(n-3);const top=id==='doubletop';if(c.kind!==(top?'high':'low'))return null;
  if(!equal(a.price,c.price,tol))return null;
  const ok=top?b.price<Math.min(a.price,c.price)*(1-tol):b.price>Math.max(a.price,c.price)*(1+tol);if(!ok)return null;
  return hit([a,b,c],[...zigzag([a,b,c]),{from:{index:b.index,price:b.price},to:{index:at,price:b.price}}]);
 }
 if(id==='tripletop'||id==='triplebottom'){
  if(n<5)return null;const q=p.slice(n-5),top=id==='tripletop';if(last.kind!==(top?'high':'low'))return null;
  const peaks=[q[0],q[2],q[4]].map(row=>row.price),valleys=[q[1],q[3]].map(row=>row.price);
  const hi=Math.max(...peaks),lo=Math.min(...peaks);if(hi-lo>tol*Math.max(Math.abs(hi),Math.abs(lo)))return null;
  const ok=top?valleys.every(v=>v<lo*(1-tol)):valleys.every(v=>v>hi*(1+tol));if(!ok)return null;
  return hit(q,[...zigzag(q),extended(q[1],q[3],at)]);
 }
 if(id==='headshoulders'||id==='invheadshoulders'){
  if(n<5)return null;const q=p.slice(n-5),top=id==='headshoulders';if(last.kind!==(top?'high':'low'))return null;
  const [ls,t1,head,t2,rs]=q;if(!equal(ls.price,rs.price,tol))return null;
  if(top?!(head.price>Math.max(ls.price,rs.price)*(1+tol)):!(head.price<Math.min(ls.price,rs.price)*(1-tol)))return null;
  if(top?!(Math.max(t1.price,t2.price)<Math.min(ls.price,rs.price)):!(Math.min(t1.price,t2.price)>Math.max(ls.price,rs.price)))return null;
  return hit(q,[...zigzag(q),extended(t1,t2,at)]);
 }
 if(id==='bullflag'||id==='bearflag'||id==='bullpennant'||id==='bearpennant'){
  // Pole p0-e1, then the consolidation e1, r1, e2, r2 (e = pole-end side, r = retrace side).
  if(n<5)return null;const q=p.slice(n-5),bull=id==='bullflag'||id==='bullpennant';if(last.kind!==(bull?'low':'high'))return null;
  const [p0,e1,r1,e2,r2]=q,pole=e1.price-p0.price,mid=p0.price+pole/2;
  if(!(bull?pole>3*tol*Math.abs(p0.price):-pole>3*tol*Math.abs(p0.price)))return null;
  if(bull?!(Math.min(r1.price,r2.price)>mid):!(Math.max(r1.price,r2.price)<mid))return null;
  const [h1,l1,h2,l2]=bull?[e1,r1,e2,r2]:[r1,e1,r2,e2],dh=(h2.price-h1.price)/Math.abs(h1.price),dl=(l2.price-l1.price)/Math.abs(l1.price);
  if(!finite(dh)||!finite(dl))return null;
  const flag=id==='bullflag'||id==='bearflag';
  const ok=flag?(bull?dh<=tol&&dl<=tol:dh>=-tol&&dl>=-tol)&&h2.price-l2.price>=(h1.price-l1.price)/2:dh<-tol&&dl>tol;
  if(!ok)return null;
  return hit(q,[segment(p0,e1),extended(h1,h2,at),extended(l1,l2,at)]);
 }
 if(id==='cuphandle'||id==='invcuphandle'){
  // Rim a, bottom b, rim c, handle d.
  if(n<4)return null;const q=p.slice(n-4),cup=id==='cuphandle';if(last.kind!==(cup?'low':'high'))return null;
  const [a,b,c,d]=q;if(!equal(a.price,c.price,tol))return null;
  const rim=cup?Math.min(a.price,c.price):Math.max(a.price,c.price),depth=cup?rim-b.price:b.price-rim;
  if(cup?!(b.price<rim*(1-tol)):!(b.price>rim*(1+tol)))return null;
  const mid=cup?b.price+depth/2:b.price-depth/2;if(cup?!(d.price>mid):!(d.price<mid))return null;
  if(d.index-c.index>(c.index-a.index)/2)return null;
  const share=roundShare(bars,a.index,c.index,b.price,depth,!cup);if(share===null||share<CUP_ROUND_SHARE)return null;
  return hit(q,[...zigzag(q),extended(a,c,at)]);
 }
 // Four-pivot shapes: the last two highs and the last two lows.
 if(n<4)return null;const q=p.slice(n-4),highs=q.filter(row=>row.kind==='high'),lows=q.filter(row=>row.kind==='low');
 if(highs.length!==2||lows.length!==2)return null;
 const [h1,h2]=highs,[l1,l2]=lows,dh=(h2.price-h1.price)/Math.abs(h1.price),dl=(l2.price-l1.price)/Math.abs(l1.price);
 if(!finite(dh)||!finite(dl))return null;
 const flatHigh=Math.abs(dh)<=tol,flatLow=Math.abs(dl)<=tol,narrower=h2.price-l2.price<h1.price-l1.price;
 let ok=false;
 if(id==='rectangle')ok=flatHigh&&flatLow&&Math.max(l1.price,l2.price)<Math.min(h1.price,h2.price)*(1-tol);
 if(id==='triangle')ok=(dh<-tol||flatHigh)&&(dl>tol||flatLow)&&!(flatHigh&&flatLow)&&narrower;
 if(id==='risingwedge')ok=dh>tol&&dl>tol&&dl>dh&&narrower;
 if(id==='fallingwedge')ok=dh<-tol&&dl<-tol&&dh<dl&&narrower;
 if(!ok)return null;
 return hit(q,[extended(h1,h2,at),extended(l1,l2,at)]);
}

/** Every chart pattern has a breakout rule (Edwards and Magee, "Technical Analysis of Stock Trends", and Bulkowski,
 *  "Encyclopedia of Chart Patterns": a pattern counts only once a close breaks its boundary; ChartSchool, "Flag, Pennant":
 *  "a break above resistance signals that the previous advance has resumed"). Without breakout confirmation every shape is
 *  reported unconfirmed, on the bar that confirms its last pivot. */
export const BREAKOUT_PATTERNS:ReadonlySet<ChartPatternId>=new Set<ChartPatternId>(CHART_PATTERNS.map(row=>row.id));
export interface ChartPatternOptions {/** Report patterns on their confirming breakout close instead of on the last pivot. Default false. */breakout?:boolean}
/** The breakout rule of a found pattern, as levels at bar k: a close above `up` (below `down`) breaks out upward
 *  (downward); a close above `voidUp` (below `voidDown`) first voids the pattern. `window` is the pattern's own span. */
interface BreakoutRule {up?:(k:number)=>number;down?:(k:number)=>number;voidUp?:(k:number)=>number;voidDown?:(k:number)=>number;window:number}
const lineAt=(a:Pivot,b:Pivot)=>{const slope=b.index===a.index?0:(b.price-a.price)/(b.index-a.index);return (k:number)=>b.price+slope*(k-b.index);};
function breakoutRule(hit:ChartPatternHit):BreakoutRule{
 const p=hit.pivots,top=hit.direction==='bearish',window=p[p.length-1].index-p[0].index;
 const flat=(value:number)=>()=>value;
 // Tops and bottoms: the extreme a close must not pass first (the pattern's highest high for a top, lowest low for a bottom).
 const extreme=()=>top?Math.max(...p.filter(row=>row.kind==='high').map(row=>row.price)):Math.min(...p.filter(row=>row.kind==='low').map(row=>row.price));
 const reversal=(level:(k:number)=>number):BreakoutRule=>top?{down:level,voidUp:flat(extreme()),window}:{up:level,voidDown:flat(extreme()),window};
 switch(hit.id){
  // Bulkowski: a double top is confirmed by a close below the valley between the tops (a bottom mirrors it).
  case 'doubletop':case 'doublebottom':return reversal(flat(p[1].price));
  // ChartSchool, "Triple Top": "the lowest of the intermittent lows marks this key support level".
  case 'tripletop':case 'triplebottom':return reversal(flat(top?Math.min(p[1].price,p[3].price):Math.max(p[1].price,p[3].price)));
  // Head and shoulders: the neckline through the two troughs (peaks), continued.
  case 'headshoulders':case 'invheadshoulders':return reversal(lineAt(p[1],p[3]));
  case 'bullflag':case 'bullpennant':case 'bearflag':case 'bearpennant':{
   // Pole p0-e1, consolidation e1, r1, e2, r2. Confirmed by a close beyond the consolidation's far line (ChartSchool:
   // the break resumes the pole's move). Void on a close past the other line or past the pole midpoint (the detection
   // already requires the consolidation to hold the midpoint); OpenCandle-defined void rule.
   const [p0,e1,r1,e2,r2]=p,bull=hit.direction==='bullish',mid=(p0.price+e1.price)/2;
   if(bull){const upper=lineAt(e1,e2),lower=lineAt(r1,r2);return {up:upper,voidDown:k=>Math.max(lower(k),mid),window};}
   const upper=lineAt(r1,r2),lower=lineAt(e1,e2);return {down:lower,voidUp:k=>Math.min(upper(k),mid),window};
  }
  case 'cuphandle':case 'invcuphandle':{
   // Rim a, bottom b, rim c, handle d. Cup and handle: a close above the higher rim (O'Neil's pivot is the handle high;
   // the rim is the ChartSchool resistance and the stricter level). Void on a close below the handle low. Inverted: mirror.
   const [a,,c,d]=p;
   return hit.id==='cuphandle'?{up:flat(Math.max(a.price,c.price)),voidDown:flat(d.price),window}:{down:flat(Math.min(a.price,c.price)),voidUp:flat(d.price),window};
  }
  default:{
   // Four-pivot shapes: the line through the two highs and the line through the two lows.
   const highs=p.filter(row=>row.kind==='high'),lows=p.filter(row=>row.kind==='low'),upper=lineAt(highs[0],highs[1]),lower=lineAt(lows[0],lows[1]);
   // ChartSchool, "Rising Wedge": confirmed only when the lower support line breaks; the falling wedge mirrors it. A close
   // through the other line first voids it (OpenCandle-defined).
   if(hit.id==='risingwedge')return {down:lower,voidUp:upper,window};
   if(hit.id==='fallingwedge')return {up:upper,voidDown:lower,window};
   // Rectangle and triangle (ChartSchool: neutral until a breakout on a closing basis): the first close outside either line.
   return {up:upper,down:lower,window};
  }
 }
}
/** The breakout of a found pattern, or null: the first bar after the last pivot whose close crosses a breakout level, within
 *  `window` bars (the pattern's own width, an OpenCandle choice) and before any close past a void level. Reported no
 *  earlier than the bar the pattern became known (`confirmedAt`). Reads only bars up to the bar it returns. */
function breakoutBar(bars:readonly Bar[],hit:ChartPatternHit):{at:number;side:'up'|'down'}|null{
 const rule=breakoutRule(hit),last=hit.pivots[hit.pivots.length-1].index,end=Math.min(bars.length-1,last+rule.window);
 for(let k=last+1;k<=end;k++){
  const close=bars[k].close;if(!finite(close))continue;
  if(rule.voidUp&&close>rule.voidUp(k)||rule.voidDown&&close<rule.voidDown(k))return null;
  if(rule.up&&close>rule.up(k))return {at:Math.max(k,hit.confirmedAt),side:'up'};
  if(rule.down&&close<rule.down(k))return {at:Math.max(k,hit.confirmedAt),side:'down'};
 }
 return null;
}
/** Every hit of the chosen patterns, in reporting-bar order. tolerancePercent is a percent (2 = 2%). With
 *  options.breakout a pattern is reported on its breakout bar (confirmedAt, with the broken side) or not at all. */
export function detectChartPatterns(bars:readonly Bar[],ids:readonly ChartPatternId[],pivotLength:number,tolerancePercent:number,options:ChartPatternOptions={}):ChartPatternHit[]{
 const tol=tolerancePercent/100,out:ChartPatternHit[]=[],seen:Pivot[]=[];
 for(const event of zigzagEvents(bars,pivotLength)){
  const pivot:Pivot={index:event.index,price:event.price,kind:event.kind};
  if(event.replaces)seen[seen.length-1]=pivot;else seen.push(pivot);
  for(const id of ids){
   const found=test(id,seen,tol,event.confirmedAt,bars);if(!found)continue;
   if(!options.breakout||!BREAKOUT_PATTERNS.has(id)){out.push(found);continue;}
   const broke=breakoutBar(bars,found);if(broke===null)continue;
   out.push({...test(id,found.pivots,tol,broke.at,bars)!,breakout:broke.side});
  }
 }
 // Breakouts can arrive after later pivots; a stable sort keeps the pivot order within one bar.
 return options.breakout?out.map((hit,order)=>({hit,order})).sort((a,b)=>a.hit.confirmedAt-b.hit.confirmedAt||a.order-b.order).map(row=>row.hit):out;
}
