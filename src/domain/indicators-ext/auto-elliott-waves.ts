import type {Bar,NumericSeries} from '../types';
import type {CatalogDefinition} from '../indicator-catalog';
import type {PatternLine,PatternMarker} from './patterns-catalog';
import {AUTO_TREND_PIVOT_RULES} from './auto-trendlines-pivot';

/**
 * Automatic Elliott waves (original code). Visual-only, rendered through the chart-pattern marks path
 * exactly like Auto trendlines (IndicatorResult.marks -> patternMarksNative). The plots carry no values.
 *
 * Public fact: an Elliott impulse is five waves (1-5) in the trend direction and a correction is three waves (A-B-C) against it;
 * wave 2 never retraces beyond the start of wave 1, wave 3 is never the shortest of waves 1, 3 and 5, and wave 4 does not overlap
 * wave 1. Everything below is our own choice:
 *  - swing pivots reuse the Auto trendlines constants (AUTO_TREND_PIVOT_RULES): a pivot needs `radius` bars each side
 *    (Small 5, Large 25) and the alternating Zig Zag keeps a reversal only when it moves more than `deviation` (Small 2, Large 5)
 *    x ATR(14, RMA) from the previous pivot, so a swing is confirmed only with its full right side (no repainting of old swings);
 *  - waves are counted greedily from the oldest swing: the first six alternating swings that satisfy the impulse rules above
 *    are 0-1-2-3-4-5 (wave 5 must pass the end of wave 3); the next three swings form A-B-C when A goes against the impulse,
 *    B ends between the end of A and the end of the impulse, and C passes the end of A; counting continues after the last used swing;
 *  - the input "Show corrective waves" (initial on) hides A-B-C; only the newest 5000 bars are searched;
 *  - up legs use the bullish plot, down legs the bearish plot; colors are our own choice.
 */
export const AUTO_ELLIOTT_ID='autoelliott' as const;
const SWING_SIZES=['Small','Large'] as const;
const HORIZON=5000;
export interface ElliottPivot {index:number;price:number;high:boolean}
export interface ElliottWave {label:string;kind:'impulse'|'corrective';up:boolean;from:ElliottPivot;to:ElliottPivot}

/** Confirmed alternating swings. Exposed for tests. */
export function elliottSwings(bars:readonly Bar[],size:typeof SWING_SIZES[number]):ElliottPivot[]{
 const n=bars.length,start=Math.max(0,n-HORIZON),family=size==='Small'?'small':'large',radius=AUTO_TREND_PIVOT_RULES.radius[family],multiple=AUTO_TREND_PIVOT_RULES.deviation[family],length=AUTO_TREND_PIVOT_RULES.atrLength;
 const atr:(number|null)[]=new Array(n).fill(null);let seed=0,previous:number|null=null;
 for(let i=0;i<n;i++){
  const b=bars[i],tr=i===0?b.high-b.low:Math.max(b.high-b.low,Math.abs(b.high-bars[i-1].close),Math.abs(b.low-bars[i-1].close));
  if(previous===null){seed+=tr;if(i===length-1){previous=seed/length;atr[i]=previous;}}else{previous=(previous*(length-1)+tr)/length;atr[i]=previous;}
 }
 const swings:ElliottPivot[]=[];
 for(let i=Math.max(start,radius);i<n-radius;i++){
  const a=atr[i];if(a===null)continue;
  let isHigh=true,isLow=true;
  for(let j=i-radius;j<=i+radius&&(isHigh||isLow);j++){
   if(j===i)continue;
   if(bars[j].high>bars[i].high||bars[j].high===bars[i].high&&j<i)isHigh=false;
   if(bars[j].low<bars[i].low||bars[j].low===bars[i].low&&j<i)isLow=false;
  }
  for(const high of [true,false]){
   if(high?!isHigh:!isLow)continue;
   const point:ElliottPivot={index:i,price:high?bars[i].high:bars[i].low,high},last=swings[swings.length-1];
   if(!last){swings.push(point);continue;}
   if(last.high===high){if(high?point.price>=last.price:point.price<=last.price)swings[swings.length-1]=point;continue;}
   if(Math.abs(point.price-last.price)>multiple*(atr[last.index]??a))swings.push(point);
  }
 }
 return swings;
}
const leg=(a:ElliottPivot,b:ElliottPivot)=>Math.abs(b.price-a.price);
/** Impulse rules on six alternating swings p0..p5 (p0 a low for an up impulse). */
function impulse(p:readonly ElliottPivot[]):boolean{
 const s=p[0].high?-1:1;
 const w1=leg(p[0],p[1]),w3=leg(p[2],p[3]),w5=leg(p[4],p[5]);
 return s*(p[1].price-p[0].price)>0&&s*(p[2].price-p[0].price)>0&&s*(p[3].price-p[1].price)>0&&s*(p[4].price-p[1].price)>0&&s*(p[5].price-p[3].price)>0&&!(w3<w1&&w3<w5);
}
/** Count impulse (1-5) and corrective (A-B-C) waves over the swings. Exposed for tests. */
export function countElliottWaves(swings:readonly ElliottPivot[],corrective:boolean):ElliottWave[]{
 const out:ElliottWave[]=[];
 for(let i=0;i+5<swings.length;){
  const p=swings.slice(i,i+6);
  if(!impulse(p)){i++;continue;}
  const up=!p[0].high;
  ['1','2','3','4','5'].forEach((label,k)=>out.push({label,kind:'impulse',up:k%2===0?up:!up,from:p[k],to:p[k+1]}));
  let next=i+5;
  const c=swings.slice(i+5,i+9);
  if(corrective&&c.length===4){
   const s=up?1:-1,[e,a,b,end]=c;
   if(s*(a.price-e.price)<0&&s*(b.price-a.price)>0&&s*(b.price-e.price)<0&&s*(end.price-a.price)<0){
    ['A','B','C'].forEach((label,k)=>out.push({label,kind:'corrective',up:k%2===0?!up:up,from:c[k],to:c[k+1]}));
    next=i+8;
   }
  }
  i=next;
 }
 return out;
}

export const AUTO_ELLIOTT_DEFINITION:CatalogDefinition={id:AUTO_ELLIOTT_ID,name:'Auto Elliott waves',acronym:'Auto Elliott',overlay:true,pattern:'chart',
 inputs:[
  {key:'swingSize',title:'Swing size',type:'string',defval:'Small',options:SWING_SIZES},
  {key:'showCorrective',title:'Show corrective waves',type:'bool',defval:true},
 ],
 plots:[{id:'bullish',label:'Up wave',color:'#089981',width:1},{id:'bearish',label:'Down wave',color:'#f23645',width:1}],
 provenance:[
  {url:'lv-defined:auto-elliott-waves',facts:'An impulse is waves 1-5 and a correction A-B-C; wave 2 stays inside wave 1, wave 3 is not the shortest of 1/3/5 and wave 4 does not overlap wave 1. Swing pivots reuse the Auto trendlines radius and ATR Zig Zag constants.'},
 ],
 unknownDefaults:['Swing size initial Small, Show corrective waves initial on, the greedy counting order, the A-B-C acceptance rule and colors are OpenCandle-defined.'],
 policies:[
  'OpenCandle-defined detection from confirmed swings only: a swing needs its full right side, so a label never sits on an unfinished swing. Only the newest 5000 bars are searched.',
  'Auto Elliott waves is visual-only: no plot values, alerts or strategy signals.',
 ],
 calculate(ctx){
  const n=ctx.bars.length,empty=():NumericSeries=>new Array(n).fill(null);
  const waves=countElliottWaves(elliottSwings(ctx.bars,ctx.str('swingSize') as typeof SWING_SIZES[number]),ctx.bool('showCorrective'));
  const plot=(up:boolean)=>up?'bullish' as const:'bearish' as const;
  const lines:PatternLine[]=waves.map(w=>({plot:plot(w.up),from:{index:w.from.index,price:w.from.price},to:{index:w.to.index,price:w.to.price}}));
  const markers:PatternMarker[]=waves.map(w=>({index:w.to.index,plot:plot(w.up),text:w.label,tooltip:`${w.kind==='impulse'?'Impulse':'Corrective'} wave ${w.label} (${w.up?'up':'down'})`}));
  ctx.marks?.({markers,lines});
  return {bullish:empty(),bearish:empty()};
 },
 warmup:()=>2*AUTO_TREND_PIVOT_RULES.radius.large+AUTO_TREND_PIVOT_RULES.atrLength,
 work:count=>count*16+Math.min(count,HORIZON)*2*AUTO_TREND_PIVOT_RULES.radius.large,
};
