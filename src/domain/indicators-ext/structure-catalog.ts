import type {Bar,NumericSeries} from '../types';
import type {CatalogDefinition,CatalogInput} from '../indicator-catalog';
import type {PatternBox,PatternLine} from './patterns-catalog';
import {pivotPoints} from './r40-catalog';
import {AUTO_FIB_LEVELS,FIB_COLORS} from './r27-catalog';
import {fibLevelPrice,lookbackFibSwing,rollingFibSwings,zigzagFibSwing,type FibSwing} from './fib-swing';
import {anchoredProfileLevels,VP_EXTRA_POLICIES,R38_POLICIES,VP_SHARED} from './vp-catalog';
import {VOLUME_PROFILE_POLICIES} from '../volume-profile';

/**
 * Market structure built-ins: Support and resistance zones, Adaptive trend channel, Auto fib multi-scale and Auto fib
 * range volume profile. The underlying ideas are the published ones cited per row; the calculations are original OpenCandle
 * code and every rule a source leaves open is our own choice, marked OpenCandle-defined and listed in `unknownDefaults`.
 * The three overlays draw their latest state as lines and boxes (display only, through the marker path), while their plots
 * are what was knowable at each bar, so alerts, the legend, the data window and replay never see later bars.
 */
export const STRUCTURE_INDICATOR_IDS=['srzones','adaptivechannel','autofibmulti','autofibvp'] as const;
export type StructureIndicatorId=typeof STRUCTURE_INDICATOR_IDS[number];
/** The profile kinds of this module (Profiles tab; alertable like Auto anchored volume profile). */
export const STRUCTURE_PROFILE_IDS:readonly StructureIndicatorId[]=Object.freeze(['autofibvp']);

/** LV palette entries (src/chart/indicator-settings.ts LV_INDICATOR_PALETTE / LV_GUIDE_COLOR). */
const C=Object.freeze({cyan:'#4fc3d9',amber:'#f5b14c',violet:'#b48cf2',green:'#7fd17a',blue:'#6e9cf2',pink:'#e88ad8',up:'#3fbf8f',down:'#e8605a',guide:'#8a92a6'});
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const LV='lv-defined:',HELP='public-indicator-definition:';
const nulls=(n:number):NumericSeries=>new Array<number|null>(n).fill(null);
const int=(key:string,title:string,defval:number,min:number,max:number):CatalogInput=>({key,title,type:'int',defval,min,max,step:1});

// ---- Support and resistance zones ----
export const SR_ZONE_MODES=['ATR','Wick to body'] as const;
/** Bound on unbroken zones tracked at once; the lowest ranked is dropped beyond it (OpenCandle-defined). */
export const SR_ACTIVE_LIMIT=256;
export interface SrZone {top:number;bottom:number;from:number;confirmed:number;touches:number;above:boolean;inside:boolean;brokenAt:number|null;shown:boolean}
export interface SrOptions {left:number;right:number;mode:string;width:number;maxZones:number}
export interface SrResult {support:NumericSeries;resistance:NumericSeries;zone:NumericSeries;broken:NumericSeries;active:SrZone[];brokenShown:SrZone[]}
const overlaps=(a:{top:number;bottom:number},b:{top:number;bottom:number})=>a.bottom<=b.top&&b.bottom<=a.top;
const rankZones=(zones:readonly SrZone[])=>[...zones].sort((a,b)=>b.touches-a.touches||b.confirmed-a.confirmed||b.top-a.top);
/**
 * OpenCandle-defined zone construction from the support and resistance idea of Edwards and Magee (Technical Analysis of
 * Stock Trends): price levels where earlier swings turned. One causal pass; bar i reads bars 0..i only.
 * A pivot high (low) is strictly above (below) the `left` bars before it and the `right` bars after it (the Pivot points
 * high/low rule), so it is confirmed `right` bars later and its zone appears on that bar. ATR zone: pivot price +/- width x
 * ATR at the pivot bar (Wilder ATR). Wick to body: the pivot bar's wick, from its high down to the top of its body (or from
 * its low up to the bottom of its body). A new zone overlapping unbroken zones merges with them (the union of their spans,
 * touches added). Touches: one per pivot, plus one per later bar whose range enters the zone after a bar outside it.
 * A zone is support while price is above it and resistance while below (a zone confirmed with the close inside it takes the
 * side of its pivot: lows support, highs resistance). It is broken by a close beyond its far side, and then stops extending.
 * The shown zones are the `maxZones` unbroken zones with the most touches (later confirmed first on a tie).
 */
export function srZones(bars:readonly Bar[],atr:readonly (number|null)[],options:SrOptions):SrResult{
 const n=bars.length,{left,right,width,maxZones}=options,wick=options.mode==='Wick to body';
 const ph=pivotPoints(bars.map(bar=>bar.high),left,right,'high'),pl=pivotPoints(bars.map(bar=>bar.low),left,right,'low');
 const out:SrResult={support:nulls(n),resistance:nulls(n),zone:nulls(n),broken:nulls(n),active:[],brokenShown:[]};
 let active:SrZone[]=[];
 const span=(p:number,kind:'high'|'low'):{top:number;bottom:number}|null=>{
  const bar=bars[p];
  if(wick){if(!finite(bar.open)||!finite(bar.close))return null;return kind==='high'?{top:bar.high,bottom:Math.max(bar.open,bar.close)}:{top:Math.min(bar.open,bar.close),bottom:bar.low};}
  const a=atr[p],price=kind==='high'?bar.high:bar.low;return finite(a)?{top:price+width*a,bottom:price-width*a}:null;
 };
 for(let i=0;i<n;i++){
  const bar=bars[i],priced=finite(bar.close)&&finite(bar.high)&&finite(bar.low);let broke=0,created=0;
  if(priced){
   const still:SrZone[]=[];
   for(const z of active){
    const inside=bar.high>=z.bottom&&bar.low<=z.top;if(inside&&!z.inside)z.touches++;z.inside=inside;
    if(z.above?bar.close<z.bottom:bar.close>z.top){z.brokenAt=i;broke=1;if(z.shown)out.brokenShown.push(z);continue;}
    still.push(z);
   }
   active=still;
  }
  const p=i-right;
  if(p>=0)for(const kind of ['high','low'] as const){
   if(!finite((kind==='high'?ph:pl)[p]))continue;const bounds=span(p,kind);if(!bounds)continue;
   const sideOf=(top:number,bottom:number,fallback:boolean)=>finite(bar.close)?bar.close>top?true:bar.close<bottom?false:fallback:fallback;
   let zone:SrZone={...bounds,from:p,confirmed:i,touches:1,above:sideOf(bounds.top,bounds.bottom,kind==='low'),inside:priced&&bar.high>=bounds.bottom&&bar.low<=bounds.top,brokenAt:null,shown:false};
   let merged=false;
   for(;;){
    const hit=active.filter(z=>overlaps(z,zone));if(!hit.length)break;merged=true;
    const first=hit.reduce((a,b)=>a.from<=b.from?a:b),top=Math.max(zone.top,...hit.map(z=>z.top)),bottom=Math.min(zone.bottom,...hit.map(z=>z.bottom));
    zone={top,bottom,from:Math.min(zone.from,...hit.map(z=>z.from)),confirmed:i,touches:zone.touches+hit.reduce((sum,z)=>sum+z.touches,0),above:sideOf(top,bottom,first.above),
     inside:priced&&bar.high>=bottom&&bar.low<=top,brokenAt:null,shown:hit.some(z=>z.shown)};
    active=active.filter(z=>!hit.includes(z));
   }
   if(!merged)created=1;active.push(zone);
  }
  if(active.length>SR_ACTIVE_LIMIT)active=rankZones(active).slice(0,SR_ACTIVE_LIMIT);
  const ranked=rankZones(active);for(const z of active)z.shown=false;
  let support:number|null=null,resistance:number|null=null;
  for(const z of ranked.slice(0,maxZones)){z.shown=true;if(z.above){if(support===null||z.top>support)support=z.top;}else if(resistance===null||z.bottom<resistance)resistance=z.bottom;}
  if(finite(bar.close)){out.support[i]=support;out.resistance[i]=resistance;out.zone[i]=created;out.broken[i]=broke;}
 }
 out.active=rankZones(active).slice(0,maxZones);
 return out;
}
/** Zone boxes of the final state: the shown unbroken zones from their first pivot, extended right (only their pivot to
 *  confirmation span reaches the pane autoscale), and with Show broken zones the latest `maxZones` zones that broke while
 *  shown, from their first pivot to the breaking bar. */
export function srZoneBoxes(result:SrResult,maxZones:number,showBroken:boolean):PatternBox[]{
 const boxes:PatternBox[]=[];
 if(showBroken)for(const z of result.brokenShown.slice(-maxZones))boxes.push({plot:'broken',from:{index:z.from,price:z.top},to:{index:z.brokenAt!,price:z.bottom}});
 for(const z of result.active)boxes.push({plot:'zone',from:{index:z.from,price:z.top},to:{index:z.confirmed,price:z.bottom},extendRight:true});
 return boxes;
}

// ---- Adaptive trend channel ----
/** Candidate fit lengths per Term (OpenCandle-defined). */
export const ADAPTIVE_TERMS=Object.freeze({Short:[20,200],Long:[300,1200]} as const);
export type AdaptiveTerm=keyof typeof ADAPTIVE_TERMS;
export interface AdaptiveFit {length:number;start:number;intercept:number;slope:number;deviation:number;r:number;reference:number}
export interface AdaptiveResult {mid:NumericSeries;upper:NumericSeries;lower:NumericSeries;length:NumericSeries;r:NumericSeries;last:AdaptiveFit|null}
/**
 * Least squares (Legendre 1805, Gauss 1809) of the natural log of the close against bar position, for every candidate
 * length L in [minLength, maxLength] whose window ends at the bar; the chosen fit has the largest |Pearson r| (the shorter
 * length on a tie; OpenCandle-defined rule). Channel = fit +/- k x the population standard deviation of the log residuals,
 * mapped back with exp. One causal pass: the values at bar i are the right end of the fit chosen at bar i, from bars
 * 0..i only. Sums come from prefix sums of the log close (offset by the first log close for precision), so every
 * (bar, length) pair is O(1). A window with a missing or non-positive close cannot be a candidate; a flat window (no
 * variance) has no r and is skipped. With fewer bars than a length, that length is not a candidate yet.
 */
export function adaptiveChannel(bars:readonly Bar[],minLength:number,maxLength:number,k:number):AdaptiveResult{
 const n=bars.length,out:AdaptiveResult={mid:nulls(n),upper:nulls(n),lower:nulls(n),length:nulls(n),r:nulls(n),last:null};
 const first=bars.find(bar=>finite(bar.close)&&bar.close>0);if(!first)return out;const reference=Math.log(first.close);
 const s1=new Float64Array(n+1),s2=new Float64Array(n+1),sj=new Float64Array(n+1),bad=new Int32Array(n+1);
 for(let j=0;j<n;j++){const c=bars[j].close,ok=finite(c)&&c>0,y=ok?Math.log(c)-reference:0;s1[j+1]=s1[j]+y;s2[j+1]=s2[j]+y*y;sj[j+1]=sj[j]+j*y;bad[j+1]=bad[j]+(ok?0:1);}
 for(let i=0;i<n;i++){
  if(bad[i+1]!==bad[i])continue;
  let best:AdaptiveFit|null=null,bestAbs=-1;
  for(let L=minLength;L<=maxLength&&L<=i+1;L++){
   const s=i-L+1;if(bad[i+1]!==bad[s])break;// a longer window holds the same missing close
   const sy=s1[i+1]-s1[s],syy=s2[i+1]-s2[s],sxy=sj[i+1]-sj[s]-s*sy,sx=L*(L-1)/2,sxx=(L-1)*L*(2*L-1)/6;
   const vx=L*sxx-sx*sx,vy=L*syy-sy*sy,cxy=L*sxy-sx*sy;if(!(vy>1e-12*L*Math.max(syy,1e-300))||!(vx>0))continue;
   const r=Math.max(-1,Math.min(1,cxy/Math.sqrt(vx*vy))),abs=Math.abs(r);if(!(abs>bestAbs))continue;
   const slope=cxy/vx,intercept=(sy-slope*sx)/L;bestAbs=abs;
   best={length:L,start:s,intercept,slope,deviation:Math.sqrt(Math.max(0,vy*(1-r*r))/L)/Math.sqrt(L),r,reference};
  }
  if(!best)continue;
  const end=best.reference+best.intercept+best.slope*(best.length-1);
  out.mid[i]=Math.exp(end);out.upper[i]=Math.exp(end+k*best.deviation);out.lower[i]=Math.exp(end-k*best.deviation);out.length[i]=best.length;out.r[i]=best.r===0?0:best.r;
  if(i===n-1)out.last=best;
 }
 return out;
}
/** The latest fit drawn over its own window as short chords of the exponential curve (at most 32 per line), so the drawn
 *  channel follows the log-linear fit on a linear price scale. */
export function adaptiveChannelLines(fit:AdaptiveFit,k:number):PatternLine[]{
 const lines:PatternLine[]=[],steps=Math.max(1,Math.min(32,fit.length-1)),at=(x:number,offset:number)=>Math.exp(fit.reference+fit.intercept+fit.slope*x+offset);
 for(const [plot,offset] of [['upper',k*fit.deviation],['mid',0],['lower',-k*fit.deviation]] as const)for(let q=0;q<steps;q++){
  const a=Math.round(q*(fit.length-1)/steps),b=Math.round((q+1)*(fit.length-1)/steps);if(b<=a)continue;
  lines.push({plot,from:{index:fit.start+a,price:at(a,offset)},to:{index:fit.start+b,price:at(b,offset)}});
 }
 return lines;
}

// ---- Auto fib multi-scale ----
/** Scale prefix, name, default lookback and color (OpenCandle-defined). */
export const FIB_SCALES=[['s','Short',50,C.cyan],['m','Medium',150,C.amber],['l','Long',400,C.violet]] as const;
const scaleKey=(name:string)=>name.toLowerCase();
export const fibScalePlotId=(prefix:string,levelId:string)=>prefix+levelId.slice(1);
const FIB_LEVEL_TEXT=AUTO_FIB_LEVELS.map(([,,label])=>label).join(', ');

// ---- Auto fib range volume profile ----
export const FIB_VP_RANGES=['Short','Medium','Long','Zig zag'] as const;
const LOOKBACK_INPUTS:CatalogInput[]=FIB_SCALES.map(([,name,length])=>int(scaleKey(name)+'Length',name+' lookback',length,2,5000));
const ZIGZAG_INPUTS:CatalogInput[]=[{key:'deviation',title:'Deviation (%)',type:'float',defval:3,min:0.1,max:100,step:0.1},int('depth','Depth',10,1,5000)];
/** The fib swing a range choice names, over the loaded bars (null when none). */
export function fibRangeSwing(bars:readonly Bar[],range:string,value:(key:string)=>number):FibSwing|null{
 if(range==='Zig zag')return zigzagFibSwing(bars,value('deviation'),value('depth'));
 const length=value(scaleKey(range)+'Length');return lookbackFibSwing(bars,bars.length-length,bars.length-1);
}

/** The fib level plot ids of Auto fib range volume profile ('fib' + the Auto fib retracement level id: fibl0 .. fibl1). */
export const fibVpPlotId=(levelId:string)=>'fib'+levelId;
/** The Fibonacci levels of the range swing (the Auto fib retracement level set and direction: level 0 at the swing end,
 *  level 1 at its start) from the swing start through the last bar, on bars with a high and a low; all null without a
 *  swing or with Show Fibonacci levels off. Like the profile, they are the latest swing's levels and move with it. */
export function fibVpLevels(bars:readonly Bar[],swing:FibSwing|null,show:boolean):Record<string,NumericSeries>{
 const out:Record<string,NumericSeries>={};
 for(const [ratio,id] of AUTO_FIB_LEVELS){
  const values=nulls(bars.length);out[fibVpPlotId(id)]=values;if(!swing||!show)continue;
  const price=fibLevelPrice(swing,ratio);for(let i=swing.start.index;i<bars.length;i++)if(finite(bars[i].high)&&finite(bars[i].low))values[i]=price;
 }
 return out;
}

const FIB_SOURCE={url:LV+'textbook-fibonacci-retracement',facts:'Fibonacci retracement levels 0, 23.6, 38.2, 50, 61.8, 78.6 and 100 percent of a swing, measured back from the swing end.'};
const DISPLAY_POLICY='The plots are calculated on every bar from that bar and earlier bars only (what was knowable then); they are what alerts, the legend, the data window and replay read. The chart draws the latest state as lines and boxes in the plot colors (a hidden plot hides its drawing); lines count toward the price scale only over their own bars.';

const definitions:readonly CatalogDefinition[]=[
 {id:'srzones',name:'Support and resistance zones',acronym:'S/R Zones',overlay:true,pattern:'chart',
  keywords:['support','resistance','S/R','zones','pivot','levels','supply','demand'],
  inputs:[int('left','Pivot left bars',10,1,500),int('right','Pivot right bars',10,1,500),{key:'zoneMode',title:'Zone width',type:'string',defval:'ATR',options:SR_ZONE_MODES},
   int('atrLength','ATR length',14,1,500),{key:'atrMultiplier',title:'ATR multiplier',type:'float',defval:0.25,min:0.05,max:10,step:0.05},
   int('maxZones','Max zones',8,1,50),{key:'showBroken',title:'Show broken zones',type:'bool',defval:true}],
  plots:[{id:'support',label:'Support',color:C.up,width:1},{id:'resistance',label:'Resistance',color:C.down,width:1},{id:'zone',label:'Zone',color:C.blue,width:1},{id:'broken',label:'Broken zone',color:C.guide,width:1}],
  provenance:[{url:LV+'edwards-magee-technical-analysis-of-stock-trends',facts:'Robert D. Edwards and John Magee, Technical Analysis of Stock Trends (1948): support and resistance are price levels where earlier swings turned; a level holds until price closes decisively through it.'},
   {url:LV+'textbook-swing-pivots',facts:'A pivot (swing) high is a bar whose high exceeds the highs of a set number of bars on its left and on its right; a pivot low mirrors it with the lows.'},
   {url:HELP+'average-true-range',facts:'J. Welles Wilder: ATR is the Wilder-smoothed average of the true range.'}],
  unknownDefaults:['The zone construction is OpenCandle-defined: pivots 10 left and 10 right, zone = pivot price +/- 0.25 x ATR(14) or the pivot bar wick to its body, overlap merging, the touch count, ranking by touches, at most 8 zones, the close-beyond break rule and faded broken zones.','Colors are OpenCandle\'s own palette; broken zones use the grey Broken zone style.'],
  policies:['A pivot needs Pivot right bars after it, so its zone appears on the bar that confirms it and never earlier. Zones merge when they overlap; touches count one per pivot plus one per later bar entering the zone from outside. A close above a resistance zone or below a support zone breaks it; a broken zone stops extending and is drawn faded. The shown zones are the Max zones unbroken zones with the most touches.',
   'Support is the top of the nearest shown zone below price and Resistance the bottom of the nearest shown zone above it (unavailable when none). Zone is 1 on a bar that confirms a new zone and Broken zone is 1 on a bar that breaks one, else 0.',
   DISPLAY_POLICY,'At most '+SR_ACTIVE_LIMIT+' unbroken zones are tracked at once; beyond that the lowest ranked is dropped (OpenCandle-defined).'],
  calculate(ctx){const {bars,tk,num,str,bool}=ctx,result=srZones(bars,tk.rma(tk.trueRange(bars),num('atrLength')),{left:num('left'),right:num('right'),mode:str('zoneMode'),width:num('atrMultiplier'),maxZones:num('maxZones')});
   ctx.marks?.({markers:[],lines:[],boxes:srZoneBoxes(result,num('maxZones'),bool('showBroken'))});
   return {support:result.support,resistance:result.resistance,zone:result.zone,broken:result.broken};},
  warmup:value=>value('left')+value('right')+value('atrLength')+1,work:(count,value)=>count*(value('left')+value('right')+48)},
 {id:'adaptivechannel',name:'Adaptive trend channel',acronym:'Adaptive Channel',overlay:true,pattern:'chart',
  keywords:['regression','linear regression','channel','trend channel','log','Pearson','adaptive','least squares'],
  inputs:[{key:'term',title:'Term',type:'string',defval:'Short',options:Object.keys(ADAPTIVE_TERMS)},{key:'deviation',title:'Deviation',type:'float',defval:2,min:0,max:10,step:0.1}],
  plots:[{id:'upper',label:'Upper',color:C.blue,width:1},{id:'mid',label:'Midline',color:C.amber,width:1},{id:'lower',label:'Lower',color:C.blue,width:1},{id:'length',label:'Length',color:C.guide,width:1,precision:0},{id:'r',label:'Pearson r',color:C.guide,width:1,precision:3}],
  provenance:[{url:LV+'textbook-least-squares-channel',facts:'Least squares (Legendre 1805, Gauss 1809): the line minimising the squared residuals; a standard deviation channel is the line +/- k standard deviations of the residuals.'},
   {url:LV+'textbook-pearson-correlation',facts:'Karl Pearson: r = cov(x, y) / (sd(x) sd(y)); |r| near 1 is a close linear fit.'}],
  unknownDefaults:['The length-selection rule is OpenCandle-defined: the fit of the natural log of the close over each candidate length, choosing the largest |Pearson r|. Term Short tries lengths 20 to 200 and Long 300 to 1200; Deviation 2.0 and the colors are OpenCandle-defined.'],
  policies:['Every candidate length ending at the bar is fitted by least squares to the log close; the length with the largest |r| wins (the shorter on a tie). Upper and Lower are the fit +/- Deviation population standard deviations of the log residuals. A window with a missing or non-positive close is not a candidate; with fewer bars than the shortest length the channel is unavailable.',
   'Midline, Upper and Lower are the right end of the channel chosen on each bar; Length and Pearson r are that bar\'s chosen length and signed r. The chart draws the latest channel over its own window, refitted on each new bar.',DISPLAY_POLICY],
  calculate(ctx){const [min,max]=ADAPTIVE_TERMS[ctx.str('term') as AdaptiveTerm]??ADAPTIVE_TERMS.Short,k=ctx.num('deviation'),result=adaptiveChannel(ctx.bars,min,max,k);
   ctx.marks?.({markers:[],lines:result.last?adaptiveChannelLines(result.last,k):[]});
   return {upper:result.upper,mid:result.mid,lower:result.lower,length:result.length,r:result.r};},
  warmup:value=>(value('term') as unknown)==='Long'?1200:200,work:(count,value)=>{const [min,max]=(value('term') as unknown)==='Long'?ADAPTIVE_TERMS.Long:ADAPTIVE_TERMS.Short;return count*((max-min+1)*6+16);}},
 {id:'autofibmulti',name:'Auto fib multi-scale',acronym:'Auto Fib MS',overlay:true,pattern:'chart',legendNames:true,
  keywords:['fibonacci','fib','retracement','multi-scale','micro','macro','auto fib'],
  inputs:FIB_SCALES.flatMap(([,name,length]):CatalogInput[]=>[{key:'show'+name,title:'Show '+name.toLowerCase(),type:'bool',defval:true},int(scaleKey(name)+'Length',name+' lookback',length,2,5000)]).concat([{key:'reverse',title:'Reverse',type:'bool',defval:false}]),
  plots:FIB_SCALES.flatMap(([prefix,name,,color])=>AUTO_FIB_LEVELS.map(([,id,label])=>({id:fibScalePlotId(prefix,id),label:name+' '+label,color,width:1}))),
  provenance:[FIB_SOURCE],
  unknownDefaults:['Three retracement sets (Short 50, Medium 150 and Long 400 bars), each from the highest high and lowest low of its lookback, all shown, are OpenCandle-defined, as are the scale colors. Levels '+FIB_LEVEL_TEXT+'.'],
  policies:['Each set is the swing between the highest high and the lowest low of its last lookback bars (all bars so far when fewer; the latest bar wins a tie). The earlier extreme is the swing start (level 1) and the later one its end (level 0); Reverse swaps them. A hidden set has no values and no lines.',
   'On each bar the levels are those of that bar\'s own lookback window; the chart draws the latest window\'s levels from its swing start, extended right.',DISPLAY_POLICY],
  calculate(ctx){const {bars,num,bool}=ctx,n=bars.length,reverse=bool('reverse'),out:Record<string,NumericSeries>={},lines:PatternLine[]=[];
   for(const [prefix,name] of FIB_SCALES){
    for(const [,id] of AUTO_FIB_LEVELS)out[fibScalePlotId(prefix,id)]=nulls(n);
    if(!bool('show'+name))continue;const swings=rollingFibSwings(bars,num(scaleKey(name)+'Length'));
    swings.forEach((swing,i)=>{if(swing)for(const [ratio,id] of AUTO_FIB_LEVELS)out[fibScalePlotId(prefix,id)][i]=fibLevelPrice(swing,ratio,reverse);});
    const last=swings[n-1];
    if(last)for(const [ratio,id] of AUTO_FIB_LEVELS){const price=fibLevelPrice(last,ratio,reverse);lines.push({plot:fibScalePlotId(prefix,id),from:{index:last.start.index,price},to:{index:n-1,price},extendRight:true});}
   }
   ctx.marks?.({markers:[],lines});return out;},
  warmup:value=>Math.max(value('shortLength'),value('mediumLength'),value('longLength')),work:count=>count*80},
 {id:'autofibvp',name:'Auto fib range volume profile',acronym:'Fib VP',overlay:true,requiresVolume:true,segmented:true,profile:true,
  keywords:['fibonacci','fib','volume profile','POC','value area','auto fib','range'],
  inputs:[{key:'range',title:'Fib range',type:'string',defval:'Medium',options:FIB_VP_RANGES},...LOOKBACK_INPUTS,...ZIGZAG_INPUTS,
   VP_SHARED.rowsLayout,VP_SHARED.rowSize,VP_SHARED.volume,VP_SHARED.valueArea,VP_SHARED.placement('Left'),VP_SHARED.width,...VP_SHARED.extras,
   {key:'showFib',title:'Show Fibonacci levels',type:'bool',defval:true}],
  plots:[...VP_SHARED.plots,...AUTO_FIB_LEVELS.map(([,id,label],k)=>({id:fibVpPlotId(id),label:'Fib '+label,color:FIB_COLORS[k],width:1}))],continuousPlots:VP_SHARED.continuous,
  provenance:[FIB_SOURCE,{url:LV+'textbook-zigzag-percent-reversal',facts:'The Zig zag range is the latest completed leg of the OpenCandle percent-reversal zig zag, as for Auto fib retracement.'},
   {url:LV+'textbook-volume-profile',facts:'A volume profile spreads the volume traded over a range of bars into price rows; the point of control (POC) is the row with the most volume and the value area the rows around it holding the Value Area Volume share (70%).'}],
  unknownDefaults:[VP_SHARED.unknownShared,'Fib range Medium (choices Short 50, Medium 150, Long 400 bars and the Auto fib retracement zig zag with deviation 3% and depth 10), Placement Left and the acronym Fib VP are OpenCandle-defined.','Fibonacci levels '+FIB_LEVEL_TEXT+' of the range swing, shown by default in the Auto fib retracement colors, are OpenCandle-defined choices.'],
  policies:[...VOLUME_PROFILE_POLICIES,...VP_EXTRA_POLICIES,...R38_POLICIES,
   'OpenCandle-defined range: one profile from the start of the chosen auto Fibonacci swing (the earlier of the highest high and lowest low of the lookback, or the start of the latest completed zig zag leg) through the last bar, recalculated as bars arrive, so its levels move with the anchor. With a lookback range the profile spans exactly the swing low to the swing high.',
   'Fibonacci levels: the retracement levels of the same swing, level 0 at the swing end and level 1 at its start (the Auto fib retracement convention), drawn from the swing start through the last bar over the profile, so retracements can be compared with the POC and value area. They move with the swing, like the profile.',
   'OpenCandle-defined alerts: POC, VAH, VAL and the Fibonacci levels are alertable with Number Of Rows; the alert recalculates the profile on the observed bars without finer bars.'],
  calculate(ctx){const swing=fibRangeSwing(ctx.bars,ctx.str('range'),ctx.num);return {...anchoredProfileLevels(ctx,swing?swing.start.index:null),...fibVpLevels(ctx.bars,swing,ctx.bool('showFib'))};},
  warmup:()=>1,work:VP_SHARED.work},
];
export const STRUCTURE_INDICATORS:readonly CatalogDefinition[]=Object.freeze(definitions);
