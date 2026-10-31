import type {Bar,NumericSeries} from '../types';
import type {CatalogContext,CatalogDefinition,CatalogInput} from '../indicator-catalog';
import {parseInterval} from '../intervals';
import {pivotCalendar,pivotPeriodKey,zigzagPivots} from './r23-catalog';
import type {PatternBox,PatternCandle,PatternLine,PatternMarker} from './patterns-catalog';

/**
 * Built-ins that need markers, boxes or candles (Gaps, Bollinger bars, Moon phases, the Rob Booker set) plus Auto fib
 * extension and Auto pitchfork. Rules are the published or textbook ones cited per row, everything else is our own choice and
 * listed in `unknownDefaults`. Colors are LV's own palette (src/chart/indicator-settings.ts).
 *
 * The marker kinds set `pattern:'chart'`: their plots are 0/1 signals (alertable, in the legend and data window) and the chart
 * draws IndicatorResult.marks (markers, lines, boxes, candles; src/chart/indicator-presentation.ts patternMarksNative) instead.
 */
export const INDGAPS2_INDICATOR_IDS=['gaps','bbars','moonphases','rbintrapivots','rbknoxville','rbmissedpivots','rbreversal','rbzivpivots','autofibext','autopitchfork'] as const;
export type IndGaps2IndicatorId=typeof INDGAPS2_INDICATOR_IDS[number];

/** LV palette entries (src/chart/indicator-settings.ts LV_INDICATOR_PALETTE / LV_HISTOGRAM_COLORS / LV_GUIDE_COLOR). */
const C=Object.freeze({cyan:'#4fc3d9',amber:'#f5b14c',violet:'#b48cf2',coral:'#f07a7a',green:'#7fd17a',blue:'#6e9cf2',pink:'#e88ad8',sand:'#d9cf6a',teal:'#4fbfa3',tan:'#c9a27e',up:'#3fbf8f',down:'#e8605a',guide:'#8a92a6'});
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const zero=(value:number)=>value===0?0:value;
const LIST='public-indicator-definition:builtin-indicators-list';
const TV_LIST='public-indicator-definition:indicators-list';
const LV='lv-defined:';
const COLORS_LV='Plot, marker, box and candle colors are OpenCandle\'s own palette (OpenCandle-defined), not the reference colors.';
const SIGNAL_POLICY='The signal plots are 1 on the bar that reports the event and 0 otherwise (unavailable where a needed price is missing). They are what alerts, the legend and the data window read; the chart draws the markers.';
const nulls=(n:number):NumericSeries=>new Array(n).fill(null);
const hlc=(bar:Bar|undefined)=>!!bar&&finite(bar.high)&&finite(bar.low)&&finite(bar.close);

// ---- Gaps ----
export interface GapZone {side:'up'|'down';index:number;top:number;bottom:number;filledAt:number|null}
/** Gap up: low > prior high (zone prior high..low). Gap down: high < prior low (zone high..prior low). A zone is filled on the
 *  first later bar that trades back through its far edge (low <= prior high, high >= prior low). `minDeviation` is the gap
 *  size in percent of the prior bar's edge. */
export function detectGaps(bars:readonly Bar[],minDeviation:number):{zones:GapZone[];up:NumericSeries;down:NumericSeries}{
 const n=bars.length,up=nulls(n),down=nulls(n),zones:GapZone[]=[],open:GapZone[]=[];
 for(let i=0;i<n;i++){
  const bar=bars[i];if(!finite(bar.high)||!finite(bar.low))continue;
  for(let k=open.length-1;k>=0;k--){const zone=open[k];if(zone.side==='up'?bar.low<=zone.bottom:bar.high>=zone.top){zone.filledAt=i;open.splice(k,1);}}
  const prior=bars[i-1];if(!prior||!finite(prior.high)||!finite(prior.low))continue;
  up[i]=0;down[i]=0;
  if(bar.low>prior.high&&prior.high!==0&&100*(bar.low-prior.high)/Math.abs(prior.high)>=minDeviation){const zone:GapZone={side:'up',index:i,top:bar.low,bottom:prior.high,filledAt:null};zones.push(zone);open.push(zone);up[i]=1;}
  else if(bar.high<prior.low&&prior.low!==0&&100*(prior.low-bar.high)/Math.abs(prior.low)>=minDeviation){const zone:GapZone={side:'down',index:i,top:prior.low,bottom:bar.high,filledAt:null};zones.push(zone);open.push(zone);down[i]=1;}
 }
 return {zones,up,down};
}
function gaps(ctx:CatalogContext):Record<string,NumericSeries>{
 const {bars}=ctx,last=bars.length-1,found=detectGaps(bars,ctx.num('minDeviation')),showFilled=ctx.bool('showFilled');
 const shown=found.zones.filter(zone=>showFilled||zone.filledAt===null).slice(-ctx.num('maxGaps'));
 const boxes:PatternBox[]=shown.map(zone=>({plot:zone.side==='up'?'bullish':'bearish',from:{index:zone.index,price:zone.top},to:{index:zone.filledAt??last,price:zone.bottom},...(zone.filledAt===null?{extendRight:true}:{})}));
 ctx.marks?.({markers:[],lines:[],boxes});
 return {bullish:found.up,bearish:found.down};
}

// ---- Bollinger bars ----
/** John Bollinger's bars: hollow when close > open, filled otherwise; colored up when close >= the prior close, down when below
 *  (the first bar compares close with its own open). */
function bollingerBars(ctx:CatalogContext):Record<string,NumericSeries>{
 const {bars}=ctx,n=bars.length,up=nulls(n),down=nulls(n),candles:PatternCandle[]=[];
 for(let i=0;i<n;i++){
  const bar=bars[i];if(![bar.open,bar.high,bar.low,bar.close].every(finite))continue;
  const reference=i===0?bar.open:bars[i-1].close;if(!finite(reference))continue;
  const rising=bar.close>=reference;up[i]=rising?1:0;down[i]=rising?0:1;
  candles.push({index:i,plot:rising?'up':'down',...(bar.close>bar.open?{hollow:true}:{})});
 }
 ctx.marks?.({markers:[],lines:[],candles});
 return {up,down};
}

// ---- Moon phases ----
const RAD=Math.PI/180,UNIX_JD=2440587.5,SYNODIC=29.530588861,K0_JDE=2451550.09766;
/** Meeus, Astronomical Algorithms (2nd ed.) ch. 49: the instant (unix seconds, TT treated as UTC; a ~70 s difference) of the
 *  new moon (integer k) or full moon (k + 0.5), with the 14 largest periodic terms (error a few minutes). */
export function moonPhaseTime(k:number):number{
 const T=k/1236.85,T2=T*T,T3=T2*T,T4=T3*T;
 const jde=K0_JDE+SYNODIC*k+0.00015437*T2-0.00000015*T3+0.00000000073*T4;
 const E=1-0.002516*T-0.0000074*T2;
 const M=(2.5534+29.1053567*k-0.0000014*T2-0.00000011*T3)*RAD;
 const Mp=(201.5643+385.81693528*k+0.0107582*T2+0.00001238*T3-0.000000058*T4)*RAD;
 const F=(160.7108+390.67050284*k-0.0016118*T2-0.00000227*T3+0.000000011*T4)*RAD;
 const O=(124.7746-1.56375588*k+0.0020672*T2+0.00000215*T3)*RAD;
 const full=Math.abs(k-Math.floor(k)-0.5)<1e-9;
 const c=full?[-0.40614,0.17302,0.01614,0.01043,0.00734,-0.00515,0.00209]:[-0.4072,0.17241,0.01608,0.01039,0.00739,-0.00514,0.00208];
 const sum=c[0]*Math.sin(Mp)+c[1]*E*Math.sin(M)+c[2]*Math.sin(2*Mp)+c[3]*Math.sin(2*F)+c[4]*E*Math.sin(Mp-M)+c[5]*E*Math.sin(Mp+M)+c[6]*E*E*Math.sin(2*M)
  -0.00111*Math.sin(Mp-2*F)-0.00057*Math.sin(Mp+2*F)+0.00056*E*Math.sin(2*Mp+M)-0.00042*Math.sin(3*Mp)+0.00042*E*Math.sin(M+2*F)+0.00038*E*Math.sin(M-2*F)-0.00024*E*Math.sin(2*Mp-M)-0.00017*Math.sin(O);
 return (jde+sum-UNIX_JD)*86400;
}
/** Every new (phase 0) and full (phase 0.5) moon instant in [from, to), ascending. */
export function moonPhasesBetween(from:number,to:number):{time:number;full:boolean}[]{
 const out:{time:number;full:boolean}[]=[];if(!(to>from))return out;
 const kOf=(t:number)=>(t/86400+UNIX_JD-K0_JDE)/SYNODIC;
 for(let half=Math.floor(kOf(from)*2)-2;half<=Math.ceil(kOf(to)*2)+2;half++){const time=moonPhaseTime(half/2);if(time>=from&&time<to)out.push({time,full:half%2!==0});}
 return out;
}
/** Bar i covers [end of bar i-1, open + nominal length), the nominal length being the smallest positive bar spacing up to i
 *  (the chart resolution for the first bar). So a phase in a gap (weekend, overnight) goes to the next bar, and a bar never
 *  depends on later bars. */
function moonPhases(ctx:CatalogContext):Record<string,NumericSeries>{
 const {bars}=ctx,n=bars.length,newMoon=nulls(n),fullMoon=nulls(n),markers:PatternMarker[]=[];
 let resolution=0;try{const spec=ctx.chart?.resolution?parseInterval(ctx.chart.resolution):null;resolution=spec?.seconds??0;}catch{resolution=0;}
 let nominal=resolution>0?resolution:Infinity,end=-Infinity,prior=NaN;
 for(let i=0;i<n;i++){
  const time=bars[i].time;if(!finite(time))continue;
  if(finite(prior)&&time>prior)nominal=Math.min(nominal,time-prior);prior=time;
  const start=Number.isFinite(end)?end:time,stop=Math.max(start,time+(Number.isFinite(nominal)?nominal:0));end=stop;
  newMoon[i]=0;fullMoon[i]=0;
  for(const phase of moonPhasesBetween(start,stop)){
   (phase.full?fullMoon:newMoon)[i]=1;
   const when=new Date(Math.round(phase.time/60)*60000).toISOString().slice(0,16).replace('T',' ');
   markers.push({index:i,plot:phase.full?'fullmoon':'newmoon',text:'',tooltip:`${phase.full?'Full moon':'New moon'} ${when} UTC`,position:phase.full?'above':'below',shape:'circle'});
  }
 }
 ctx.marks?.({markers,lines:[]});
 return {newmoon:newMoon,fullmoon:fullMoon};
}

// ---- Rob Booker pivots ----
export const BOOKER_PIVOT_TIMEFRAMES=['Daily','4 hours'] as const;
/** Traditional floor pivots of one period's high, low and close. */
export function floorPivots(H:number,L:number,Cl:number):{p:number;r1:number;s1:number;r2:number;s2:number;r3:number;s3:number}{
 const p=(H+L+Cl)/3;return {p,r1:2*p-L,s1:2*p-H,r2:p+(H-L),s2:p-(H-L),r3:H+2*(p-L),s3:L-2*(H-p)};
}
const PIVOT_IDS=['p','r1','s1','r2','s2','r3','s3'] as const;
function periodKeys(ctx:CatalogContext):(string|null)[]{
 const {bars}=ctx;if(ctx.str('timeframe')==='4 hours')return bars.map(bar=>finite(bar.time)?String(Math.floor(bar.time/14400)):null);
 const calendar=pivotCalendar(bars,ctx.chart?.resolution,ctx.chart?.calendar);return bars.map(bar=>pivotPeriodKey(bar.time,'Daily',calendar));
}
/** `developing` false: each period carries the previous complete period's levels. true: the levels of the current period so far
 *  (the next period's levels as they form). */
function bookerPivots(ctx:CatalogContext,developing:boolean,ids:readonly typeof PIVOT_IDS[number][]):Record<string,NumericSeries>{
 const {bars}=ctx,n=bars.length,keys=periodKeys(ctx),out:Record<string,NumericSeries>=Object.fromEntries(ids.map(id=>[id,nulls(n)]));
 let key:string|null=null,H=-Infinity,L=Infinity,Cl=NaN,valid=false,levels:ReturnType<typeof floorPivots>|null=null;
 for(let i=0;i<n;i++){
  const k=keys[i];if(k===null){valid=false;continue;}
  if(k!==key){levels=key!==null&&valid&&finite(Cl)?floorPivots(H,L,Cl):null;key=k;H=-Infinity;L=Infinity;Cl=NaN;valid=true;}
  const bar=bars[i];if(hlc(bar)){H=Math.max(H,bar.high);L=Math.min(L,bar.low);Cl=bar.close;}else valid=false;
  const shown=developing?(valid&&finite(Cl)?floorPivots(H,L,Cl):null):levels;
  if(shown)for(const id of ids)out[id][i]=zero(shown[id]);
 }
 return out;
}
const PIVOT_COLORS={p:C.amber,r1:C.coral,s1:C.green,r2:C.coral,s2:C.green,r3:C.coral,s3:C.green} as const;
const PIVOT_LABELS={p:'P',r1:'R1',s1:'S1',r2:'R2',s2:'S2',r3:'R3',s3:'S3'} as const;

// ---- Knoxville divergence ----
/** Bearish at bar i: the high rises above the prior high and above an earlier swing high j (high[j] at least both neighbours)
 *  within Bars back, with no high between them above high[i], while momentum is lower than at j and the RSI was above 70
 *  somewhere in j..i. Bullish mirrors it on lows, momentum higher, RSI below 30. The newest qualifying j is used; a signal on
 *  the bar right after the same signal is not repeated. */
export function knoxvilleDivergence(bars:readonly Bar[],rsi:readonly (number|null)[],barsBack:number,momLength:number):{bullish:NumericSeries;bearish:NumericSeries;lines:PatternLine[];markers:PatternMarker[]}{
 const n=bars.length,bullish=nulls(n),bearish=nulls(n),lines:PatternLine[]=[],markers:PatternMarker[]=[];
 const mom=bars.map((bar,i)=>i>=momLength&&finite(bar.close)&&finite(bars[i-momLength].close)?bar.close-bars[i-momLength].close:null);
 const scan=(i:number,high:boolean):number|null=>{
  const price=(k:number)=>high?bars[k].high:bars[k].low,beyond=(a:number,b:number)=>high?a>b:a<b,m=mom[i];
  if(!finite(m)||!finite(price(i))||!finite(price(i-1))||!beyond(price(i),price(i-1)))return null;
  let extreme=finite(rsi[i])?rsi[i] as number:NaN;
  for(let j=i-1;j>=Math.max(1,i-barsBack);j--){
   const value=price(j),r=rsi[j];if(!finite(value))return null;if(beyond(value,price(i)))return null;
   if(finite(r))extreme=Number.isNaN(extreme)?r:high?Math.max(extreme,r):Math.min(extreme,r);
   if(j>i-2)continue;const left=price(j-1),right=price(j+1),mj=mom[j];
   const swing=finite(left)&&finite(right)&&(high?value>=left&&value>=right:value<=left&&value<=right);
   if(swing&&value!==price(i)&&finite(mj)&&(high?mj>m:mj<m)&&(high?extreme>70:extreme<30))return j;
  }
  return null;
 };
 for(let i=1;i<n;i++){
  if(!hlc(bars[i])||!hlc(bars[i-1]))continue;bullish[i]=0;bearish[i]=0;
  for(const high of [true,false]){
   const j=scan(i,high),plot=high?'bearish':'bullish',series=high?bearish:bullish;if(j===null||series[i-1]===1)continue;
   series[i]=1;const price=(k:number)=>high?bars[k].high:bars[k].low;
   lines.push({plot,from:{index:j,price:price(j)},to:{index:i,price:price(i)}});
   markers.push({index:i,plot,text:'KD',tooltip:high?'Bearish Knoxville divergence':'Bullish Knoxville divergence'});
  }
 }
 return {bullish,bearish,lines,markers};
}

// ---- Missed pivot points ----
/** Pivot high at p: high[p] above every high in the leftBars before it and the rightBars after it (confirmed rightBars later;
 *  a tie is no pivot). When two pivots of one kind follow each other, the opposite pivot between them was missed: the lowest
 *  low (highest high) strictly between them (the earliest on a tie). It is reported on the bar that confirms the second pivot
 *  and marked on its own bar. */
export function missedPivots(bars:readonly Bar[],left:number,right:number):{bullish:NumericSeries;bearish:NumericSeries;markers:PatternMarker[]}{
 const n=bars.length,bullish=nulls(n),bearish=nulls(n),markers:PatternMarker[]=[];let lastKind:'high'|'low'|null=null,lastIndex=-1;
 const isPivot=(p:number,high:boolean)=>{const value=high?bars[p].high:bars[p].low;if(!finite(value))return null;
  for(let k=p-left;k<=p+right;k++){if(k===p)continue;const other=high?bars[k].high:bars[k].low;if(!finite(other))return null;if(high?other>=value:other<=value)return false;}return true;};
 for(let i=0;i<n;i++){
  const p=i-right;if(p-left<0)continue;
  const ph=isPivot(p,true),pl=isPivot(p,false);if(ph===null||pl===null)continue;bullish[i]=0;bearish[i]=0;
  for(const [hit,kind] of [[ph,'high'],[pl,'low']] as const){
   if(!hit)continue;
   if(lastKind===kind&&p-lastIndex>1){
    const high=kind==='low';let m=lastIndex+1;
    for(let k=lastIndex+2;k<p;k++){const a=high?bars[k].high:bars[k].low,b=high?bars[m].high:bars[m].low;if(high?a>b:a<b)m=k;}
    (high?bearish:bullish)[i]=1;
    markers.push({index:m,plot:high?'bearish':'bullish',text:'',tooltip:high?'Missed pivot high':'Missed pivot low',position:high?'above':'below',shape:'xcross'});
   }
   lastKind=kind;lastIndex=p;
  }
 }
 return {bullish,bearish,markers};
}

// ---- Reversal ----
/** Bullish: the MACD line crosses above its signal line while the smoothed stochastic %K is at or below Lower. Bearish: it
 *  crosses below while %K is at or above Upper. */
function reversal(ctx:CatalogContext):Record<string,NumericSeries>{
 const {bars,tk,num}=ctx,n=bars.length,close=bars.map(bar=>finite(bar.close)?bar.close:null);
 const fast=tk.ema(close,num('fastLength')),slow=tk.ema(close,num('slowLength'));
 const macd=fast.map((value,i)=>finite(value)&&finite(slow[i])?(value as number)-(slow[i] as number):null),signal=tk.ema(macd,num('signalLength'));
 const length=num('stochLength'),raw=bars.map((bar,i)=>{if(i<length-1||!finite(bar.close))return null;let hh=-Infinity,ll=Infinity;
  for(let k=i-length+1;k<=i;k++){if(!finite(bars[k].high)||!finite(bars[k].low))return null;hh=Math.max(hh,bars[k].high);ll=Math.min(ll,bars[k].low);}return hh===ll?null:100*(bar.close-ll)/(hh-ll);});
 const k=tk.sma(raw,num('smoothK')),upper=num('upper'),lower=num('lower'),bullish=nulls(n),bearish=nulls(n),markers:PatternMarker[]=[];
 for(let i=1;i<n;i++){
  const a=macd[i],b=signal[i],pa=macd[i-1],pb=signal[i-1],kv=k[i];if(!finite(a)||!finite(b)||!finite(pa)||!finite(pb)||!finite(kv))continue;
  const up=a>b&&pa<=pb&&kv<=lower,down=a<b&&pa>=pb&&kv>=upper;bullish[i]=up?1:0;bearish[i]=down?1:0;
  if(up)markers.push({index:i,plot:'bullish',text:'',tooltip:'Bullish reversal',position:'below',shape:'arrowup'});
  if(down)markers.push({index:i,plot:'bearish',text:'',tooltip:'Bearish reversal',position:'above',shape:'arrowdown'});
 }
 ctx.marks?.({markers,lines:[]});
 return {bullish,bearish};
}

// ---- Auto fib extension / Auto pitchfork ----
export const AUTO_FIB_EXT_LEVELS=[[0,'e0','0'],[0.236,'e236','0.236'],[0.382,'e382','0.382'],[0.5,'e5','0.5'],[0.618,'e618','0.618'],[0.786,'e786','0.786'],[1,'e1','1'],[1.618,'e1618','1.618'],[2.618,'e2618','2.618'],[3.618,'e3618','3.618'],[4.236,'e4236','4.236']] as const;
const EXT_COLORS=[C.guide,C.coral,C.amber,C.green,C.teal,C.cyan,C.guide,C.blue,C.violet,C.pink,C.tan];
/** The three newest completed zig zag pivots (the last zig zag point is the leg still forming); null with fewer. */
export function lastThreePivots(bars:readonly Bar[],deviation:number,depth:number){
 const points=zigzagPivots(bars,deviation,depth);if(points.length<3)return null;
 return points.length>=4?[points.at(-4)!,points.at(-3)!,points.at(-2)!] as const:[points[0],points[1],points[2]] as const;
}
const ZIGZAG_INPUTS:CatalogInput[]=[{key:'deviation',title:'Deviation (%)',type:'float',defval:3,min:0.1,max:100,step:0.1},{key:'depth',title:'Depth',type:'int',defval:10,min:1,max:5000,step:1}];
const PIVOT_INPUT:CatalogInput={key:'timeframe',title:'Pivot timeframe',type:'string',defval:'Daily',options:BOOKER_PIVOT_TIMEFRAMES};
const SIGNALS=(bull:string,bear:string)=>[{id:'bullish',label:bull,color:C.up,width:1},{id:'bearish',label:bear,color:C.down,width:1}];

const definitions:readonly CatalogDefinition[]=[
 {id:'gaps',name:'Gaps',acronym:'Gaps',overlay:true,pattern:'chart',
  inputs:[{key:'minDeviation',title:'Minimal deviation (%)',type:'float',defval:0,min:0,max:100,step:0.1},{key:'maxGaps',title:'Max number of gaps',type:'int',defval:20,min:1,max:500,step:1},{key:'showFilled',title:'Show filled gaps',type:'bool',defval:true}],
  plots:SIGNALS('Gap up','Gap down'),
  provenance:[{url:TV_LIST,facts:'"Gaps" is a built-in: boxes mark price gaps between consecutive bars until price fills them.'},{url:LV+'textbook-price-gap',facts:'Gap up: the low is above the prior high; gap down: the high is below the prior low. A gap is filled when price trades back through the prior bar\'s edge.'}],
  unknownDefaults:['Minimal deviation 0 %, at most 20 gaps, filled gaps shown, a full-fill rule (no partial shrinking) and the box from the gap bar are OpenCandle-defined.',COLORS_LV],
  policies:[SIGNAL_POLICY,'An open gap\'s box runs from the gap bar to the newest bar and extends right; a filled gap\'s box ends on the filling bar. Only bars up to each bar are read, so a signal never changes; a box end moves only when a later bar fills it.'],
  calculate:gaps,warmup:()=>2,work:count=>count*12},
 {id:'bbars',name:'Bollinger bars',acronym:'BBars',overlay:true,pattern:'chart',inputs:[],
  plots:[{id:'up',label:'Up close',color:C.up,width:1},{id:'down',label:'Down close',color:C.down,width:1}],
  provenance:[{url:TV_LIST,facts:'"Bollinger Bars" is a built-in candle-style display.'},{url:LV+'bollinger-bars-john-bollinger',facts:'John Bollinger\'s Bollinger Bars: the body is hollow when the close is above the open and filled otherwise; the color shows the close against the prior close.'}],
  unknownDefaults:['The reference implementation was not read. Equal closes count as up and the first bar compares its close with its open (OpenCandle-defined).',COLORS_LV],
  policies:['Draws one candle per bar over the chart candles; the Up close / Down close Style rows color them. The plots are 1/0 (close at or above, or below, the prior close).'],
  calculate:bollingerBars,warmup:()=>1,work:count=>count*4},
 {id:'moonphases',name:'Moon phases',acronym:'Moon',overlay:true,pattern:'chart',inputs:[],
  plots:[{id:'newmoon',label:'New moon',color:C.guide,width:1},{id:'fullmoon',label:'Full moon',color:C.sand,width:1}],
  provenance:[{url:TV_LIST,facts:'"Moon Phases" is a built-in: marks new and full moons on the bars where they occur.'},{url:LV+'meeus-astronomical-algorithms-ch49',facts:'New and full moon instants from Meeus ch. 49 (mean phase plus the 14 largest periodic terms; error a few minutes).'}],
  unknownDefaults:['New moon below the bar and full moon above, both circles, are OpenCandle-defined. A phase that falls between bars (weekend, overnight) goes to the next bar (OpenCandle-defined).',COLORS_LV],
  policies:['The phases are astronomical, so the newest bar shows a phase due later within its own period; nothing reads later bars and a marked bar never changes.',SIGNAL_POLICY],
  calculate:moonPhases,warmup:()=>1,work:count=>count*6},
 {id:'rbintrapivots',name:'Rob Booker - Intraday pivot points',acronym:'RB Intraday Pivots',overlay:true,segmented:true,
  inputs:[PIVOT_INPUT],
  plots:PIVOT_IDS.map(id=>({id,label:PIVOT_LABELS[id],color:PIVOT_COLORS[id],width:1})),
  provenance:[{url:TV_LIST,facts:'"Rob Booker - Intraday Pivot Points" is a built-in (Rob Booker section).'},{url:LV+'traditional-floor-pivots',facts:'P = (H + L + C) / 3; R1 = 2P - L; S1 = 2P - H; R2 = P + (H - L); S2 = P - (H - L); R3 = H + 2(P - L); S3 = L - 2(H - P) from the previous period.'}],
  unknownDefaults:['The Daily / 4 hours period choice (default Daily) and the traditional formula are OpenCandle-defined; the reference inputs were not read.',COLORS_LV],
  policies:['Periods: Daily follows the pivot calendar (New York trading dates for US equities, UTC days otherwise); 4 hours are UTC blocks from 00:00. The first period and any period after one with a missing price are unavailable.'],
  calculate:ctx=>bookerPivots(ctx,false,PIVOT_IDS),warmup:()=>2,work:count=>count*10},
 {id:'rbknoxville',name:'Rob Booker - Knoxville divergence',acronym:'RB Knoxville',overlay:true,pattern:'chart',
  inputs:[{key:'barsBack',title:'Bars back',type:'int',defval:150,min:2,max:1000,step:1},{key:'rsiLength',title:'RSI period',type:'int',defval:21,min:1,max:500,step:1},{key:'momLength',title:'Momentum period',type:'int',defval:20,min:1,max:500,step:1}],
  plots:SIGNALS('Bullish divergence','Bearish divergence'),
  provenance:[{url:TV_LIST,facts:'"Rob Booker - Knoxville Divergence" is a built-in.'},{url:LV+'rob-booker-knoxville-divergence',facts:'Knoxville divergence (Rob Booker): price momentum divergence confirmed by an overbought (RSI above 70) or oversold (RSI below 30) reading, with Bars back 150, RSI 21 and Momentum 20.'}],
  unknownDefaults:['The swing test (high at least both neighbours), the newest qualifying swing, the no-higher-high-between rule and the no-repeat rule are OpenCandle-defined.',COLORS_LV],
  policies:[SIGNAL_POLICY,'Each divergence draws a line from the earlier swing to the signal bar and a KD label. Only bars up to the signal bar are read.'],
  calculate(ctx){const close=ctx.bars.map(bar=>finite(bar.close)?bar.close:null),out=knoxvilleDivergence(ctx.bars,ctx.tk.rsi(close,ctx.num('rsiLength')),ctx.num('barsBack'),ctx.num('momLength'));
   ctx.marks?.({markers:out.markers.slice(-5000),lines:out.lines.slice(-5000)});return {bullish:out.bullish,bearish:out.bearish};},
  warmup:value=>Math.max(value('rsiLength'),value('momLength'))+2,work:(count,value)=>count*(value('barsBack')*2+16)},
 {id:'rbmissedpivots',name:'Rob Booker - Missed pivot points',acronym:'RB Missed Pivots',overlay:true,pattern:'chart',
  inputs:[{key:'leftBars',title:'Pivot lookback left',type:'int',defval:10,min:1,max:500,step:1},{key:'rightBars',title:'Pivot lookback right',type:'int',defval:10,min:1,max:500,step:1}],
  plots:SIGNALS('Missed pivot low','Missed pivot high'),
  provenance:[{url:TV_LIST,facts:'"Rob Booker - Missed Pivot Points" is a built-in.'},{url:LV+'missed-pivot-rule',facts:'Two pivot highs in a row mean the pivot low between them was missed (and the mirror for lows); the missed pivot is the extreme between them.'}],
  unknownDefaults:['The rule, lookbacks 10/10 and the strict (no tie) pivot test are OpenCandle-defined; the reference was not read.',COLORS_LV],
  policies:[SIGNAL_POLICY,'A pivot needs its right side, so a missed pivot is reported Pivot lookback right bars after the second pivot and its x mark sits on its own (earlier) bar.'],
  calculate(ctx){const out=missedPivots(ctx.bars,ctx.num('leftBars'),ctx.num('rightBars'));ctx.marks?.({markers:out.markers.slice(-5000),lines:[]});return {bullish:out.bullish,bearish:out.bearish};},
  warmup:value=>value('leftBars')+value('rightBars')+1,work:(count,value)=>count*(value('leftBars')+value('rightBars')+2)*2},
 {id:'rbreversal',name:'Rob Booker - Reversal',acronym:'RB Reversal',overlay:true,pattern:'chart',
  inputs:[{key:'fastLength',title:'MACD fast length',type:'int',defval:12,min:1,max:500,step:1},{key:'slowLength',title:'MACD slow length',type:'int',defval:26,min:1,max:500,step:1},{key:'signalLength',title:'MACD signal length',type:'int',defval:9,min:1,max:500,step:1},
   {key:'stochLength',title:'Stochastic length',type:'int',defval:70,min:1,max:1000,step:1},{key:'smoothK',title:'Stochastic smoothing',type:'int',defval:10,min:1,max:500,step:1},{key:'upper',title:'Upper band',type:'float',defval:80,min:0,max:100,step:1},{key:'lower',title:'Lower band',type:'float',defval:20,min:0,max:100,step:1}],
  plots:SIGNALS('Bullish reversal','Bearish reversal'),
  provenance:[{url:TV_LIST,facts:'"Rob Booker - Reversal" is a built-in.'},{url:LV+'rob-booker-reversal',facts:'Rob Booker\'s reversal setup combines MACD (12, 26, 9) with a slow stochastic (70, 10) at overbought (80) or oversold (20).'}],
  unknownDefaults:['The trigger (MACD line crossing its signal line while the smoothed %K is at or beyond a band) is OpenCandle-defined.',COLORS_LV],
  policies:[SIGNAL_POLICY,'EMAs use the OpenCandle first-value seed. A flat stochastic window is unavailable.'],
  calculate:reversal,warmup:value=>Math.max(value('slowLength')+value('signalLength'),value('stochLength')+value('smoothK')),work:(count,value)=>count*(value('stochLength')+24)},
 {id:'rbzivpivots',name:'Rob Booker - Ziv ghost pivots',acronym:'RB Ziv Ghost',overlay:true,
  inputs:[PIVOT_INPUT],
  plots:(['p','r1','s1','r2','s2'] as const).map(id=>({id,label:PIVOT_LABELS[id],color:PIVOT_COLORS[id],width:1})),
  provenance:[{url:TV_LIST,facts:'"Rob Booker - Ziv Ghost Pivots" is a built-in.'},{url:LV+'traditional-floor-pivots',facts:'Traditional floor pivot formulas (P, R1, S1, R2, S2).'}],
  unknownDefaults:['"Ghost" pivots are OpenCandle-defined as the next period\'s levels forming from the current period\'s high, low and close so far; the reference was not read.',COLORS_LV],
  policies:['Each bar reads only its period\'s bars up to itself, so the lines move within a period and a closed bar never changes. A bar with a missing price ends the period\'s values.'],
  calculate:ctx=>bookerPivots(ctx,true,['p','r1','s1','r2','s2']),warmup:()=>1,work:count=>count*10},
 {id:'autofibext',name:'Auto fib extension',acronym:'Auto Fib Ext',overlay:true,
  inputs:ZIGZAG_INPUTS,
  plots:AUTO_FIB_EXT_LEVELS.map(([ratio,id,label],k)=>({id,label,color:EXT_COLORS[k],width:1,...(ratio>2.618?{visible:false}:{})})),
  provenance:[{url:LIST,facts:'"Auto Fib Extension" is in the built-in list.'},{url:LV+'textbook-trend-based-fib-extension',facts:'Trend-based extension over three pivots A, B, C: level = C + ratio x (B - A), ratios 0 .. 4.236.'},{url:LV+'textbook-zigzag-percent-reversal',facts:'Pivots are the OpenCandle percent-reversal zig zag (the R23 Zig zag kernel), as for Auto fib retracement.'}],
  unknownDefaults:['Deviation 3 % and Depth 10 (as Auto fib retracement), the level set and 3.618 / 4.236 hidden by default are OpenCandle-defined.',COLORS_LV],
  policies:['Repaints like the reference drawing: the three newest completed zig zag pivots move when a new leg completes, and the levels then carry values from the new C pivot to the newest bar. Bars with a missing high or low are unavailable.'],
  calculate({bars,num}){const out:Record<string,NumericSeries>=Object.fromEntries(AUTO_FIB_EXT_LEVELS.map(([,id])=>[id,nulls(bars.length)])),three=lastThreePivots(bars,num('deviation'),num('depth'));
   if(!three)return out;const [a,b,c]=three;
   for(const [ratio,id] of AUTO_FIB_EXT_LEVELS){const level=zero(c.price+ratio*(b.price-a.price));for(let i=c.index;i<bars.length;i++)if(finite(bars[i].high)&&finite(bars[i].low))out[id][i]=level;}
   return out;},
  warmup:value=>value('depth')*3,work:count=>count*16},
 {id:'autopitchfork',name:'Auto pitchfork',acronym:'Auto Pitchfork',overlay:true,
  inputs:ZIGZAG_INPUTS,
  plots:[{id:'median',label:'Median',color:C.amber,width:1},{id:'upper',label:'Upper',color:C.cyan,width:1},{id:'lower',label:'Lower',color:C.cyan,width:1}],
  provenance:[{url:LIST,facts:'"Auto Pitchfork" is in the built-in list.'},{url:LV+'textbook-andrews-pitchfork',facts:'Andrews pitchfork over pivots A, B, C: the median line runs from A through the midpoint of B and C; the tines are parallel to it through B and C.'}],
  unknownDefaults:['Deviation 3 % and Depth 10 (as Auto fib retracement) and the original (Andrews) pitchfork are OpenCandle-defined.',COLORS_LV],
  policies:['Repaints like the reference drawing: the pivots move when a new zig zag leg completes. The median line starts at A and the tines at B and C; all run to the newest bar. Upper is the tine through the higher of B and C.'],
  calculate({bars,num}){const n=bars.length,out:Record<string,NumericSeries>={median:nulls(n),upper:nulls(n),lower:nulls(n)},three=lastThreePivots(bars,num('deviation'),num('depth'));
   if(!three)return out;const [a,b,c]=three,mid={index:(b.index+c.index)/2,price:(b.price+c.price)/2},slope=(mid.price-a.price)/(mid.index-a.index);
   const [hi,lo]=b.price>=c.price?[b,c]:[c,b];
   for(let i=0;i<n;i++){if(!finite(bars[i].high)||!finite(bars[i].low))continue;
    if(i>=a.index)out.median[i]=zero(a.price+slope*(i-a.index));if(i>=hi.index)out.upper[i]=zero(hi.price+slope*(i-hi.index));if(i>=lo.index)out.lower[i]=zero(lo.price+slope*(i-lo.index));}
   return out;},
  warmup:value=>value('depth')*3,work:count=>count*16},
];
export const INDGAPS2_INDICATORS:readonly CatalogDefinition[]=definitions;
