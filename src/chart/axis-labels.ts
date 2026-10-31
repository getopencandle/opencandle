// LV price-axis labels: pure geometry, text and session rules for the labels
// the appearance painter draws on the main price scale. OpenCandle's own code.
//  * The last price chip stays clamped at the pane edge when the close is outside the visible window.
//  * Daily and higher bars count down to the session close; a session-bound instrument hides the countdown while its
//    market is closed.
//  * Previous day close, visible high and low, horizontal line, horizontal ray, cross line and Long/Short labels.
//  * Time-axis labels at the anchor time of vertical lines and cross lines (drawingTimeAxisLabels).
//  * "No overlapping labels" moves the movable labels to the nearest free slot; fixed labels never move.
import {usMarketSession} from '../domain/us-market-hours';
import {formatWithPrecision,precisionAxisExact} from './symbol-precision';
import {axisLineFlag} from './lv-types/axis-line-settings';

export const AXIS_LABEL_HEIGHT=16;
const DAY_MS=86_400_000;

/** Decimals that print any multiple of `tick` (mirrors the pinned renderer's tickDecimals, capped at 8). */
export function tickDecimals(tick:number):number{
 if(!(tick>0)||!Number.isFinite(tick))return 2;
 for(let digits=0;digits<=8;digits++)if(Math.abs(Number(tick.toFixed(digits))-tick)<=tick*1e-6)return digits;
 return 8;
}
/** The pinned renderer's zoom-based decimals (priceDecimals) used when no tick is known. */
function zoomDecimals(min:number,max:number,height:number):number{
 if(!(max>min))return 2;
 const target=Math.max(2,Math.min(16,Math.round(height/50))),raw=(max-min)/Math.max(1,target),mag=Math.pow(10,Math.floor(Math.log10(raw))),norm=raw/mag;
 const step=(norm<1.5?1:norm<3?2:norm<7?5:10)*mag;
 return Math.max(0,Math.min(8,-Math.floor(Math.log10(step))+1));
}
export interface AxisFormatContext{scale:{min:number;max:number;log?:boolean};height:number;mintick?:number;percent?:{baseline:number;indexed:boolean}|null;
 /** The stored Symbol precision. Integer, 9 to 15 decimals and 1/N (values the renderer tick cannot print) format
  * price-mode text with formatWithPrecision, like the legend and the axis ticks. Default and 1 to 8 decimals keep the tick path. */
 precision?:string}
/** Axis text for a price, the way the price scale prints its own ticks and last price chip (formatAxisValue). */
export function axisPriceText(value:number,context:AxisFormatContext):string{
 const pct=context.percent;
 if(pct&&Number.isFinite(pct.baseline)&&pct.baseline!==0){
  if(pct.indexed)return(value/pct.baseline*100).toFixed(2);
  const change=(value/pct.baseline-1)*100;return(change>=0?'+':'-')+Math.abs(change).toFixed(2)+'%';
 }
 if(context.precision!==undefined&&!precisionAxisExact(context.precision)&&Number.isFinite(value))return formatWithPrecision(value,context.precision);
 const {scale}=context;
 if(scale.log&&scale.min>0&&Math.log10(scale.max)-Math.log10(scale.min)>=1.1){const a=Math.abs(value),d=a>=100?0:a>=1?2:a>=0.01?4:6;return value.toFixed(d===0?2:d);}
 const decimals=context.mintick!==undefined&&context.mintick>0?tickDecimals(context.mintick):zoomDecimals(scale.min,scale.max,context.height);
 return value.toFixed(decimals===0?2:decimals);
}

/** The tick the price scale formats with. A stored Precision of 1 to 8 decimals wins; otherwise the instrument tick.
 * Integer, fractional and 9 to 15 decimal precisions are drawn by the renderer at the instrument tick (see symbol-precision.ts). */
export function axisMintick(precisionTick:number|undefined,instrumentTick:number|undefined):number|undefined{
 if(precisionTick!==undefined&&precisionTick>0&&Number.isFinite(precisionTick))return precisionTick;
 return instrumentTick!==undefined&&instrumentTick>0&&Number.isFinite(instrumentTick)?instrumentTick:undefined;
}
/** Rounds a price to the nearest multiple of the tick (half away from zero), printed at the tick's decimals. */
export function roundToTick(price:number,tick:number|undefined):number{
 if(!Number.isFinite(price)||tick===undefined||!(tick>0)||!Number.isFinite(tick))return price;
 const digits=tickDecimals(tick),units=Math.sign(price)*Math.round(Math.abs(price)/tick);
 return Number((units*tick).toFixed(digits));
}

/** Last price chip center, clamped so the whole chip stays inside the pane. `below` is the chip height under the
 * price (8, or 24 with the countdown row). */
export function clampChipCenter(y:number,top:number,bottom:number,below:number=8,above:number=8):{y:number;clamped:boolean}{
 const low=top+above,high=bottom-below;
 if(!Number.isFinite(y)||high<low)return{y:Number.isFinite(y)?y:top,clamped:false};
 if(y<low)return{y:low,clamped:y<top};
 if(y>high)return{y:high,clamped:y>bottom};
 return{y,clamped:false};
}

export interface AxisLabelRequest{id:string;y:number;height?:number}
export interface AxisLabelPlacement{id:string;y:number;center:number;hidden:boolean}
/** Places movable labels. Fixed ranges (the last price chip, indicator tags) never move. With `noOverlap` the labels keep
 * their price order and are pushed apart just enough to stop overlapping: a label next to a fixed range moves away from it,
 * two movable labels share the move, and the pane edges hold. A label that still cannot fit (boxed in against an edge) is
 * hidden; earlier requests keep their place first. Without `noOverlap` every label sits at its price. Labels whose price is
 * outside the pane are hidden. */
export function layoutAxisLabels(fixed:readonly (readonly [number,number])[],labels:readonly AxisLabelRequest[],bounds:{top:number;bottom:number},noOverlap:boolean):AxisLabelPlacement[]{
 const out:AxisLabelPlacement[]=labels.map(label=>({id:label.id,y:label.y,center:label.y,hidden:!Number.isFinite(label.y)||label.y<bounds.top||label.y>bounds.bottom}));
 if(!noOverlap)return out;
 type Item={index:number;fixed:boolean;center:number;half:number};
 const items:Item[]=[...fixed.map(([a,b])=>({index:-1,fixed:true,center:(a+b)/2,half:Math.abs(b-a)/2})),...labels.flatMap((label,index)=>out[index].hidden?[]:[{index,fixed:false,center:label.y,half:(label.height??AXIS_LABEL_HEIGHT)/2}])];
 const clamp=(item:Item)=>{if(!item.fixed)item.center=Math.min(Math.max(item.center,bounds.top+item.half),bounds.bottom-item.half);};
 items.forEach(clamp);
 items.sort((a,b)=>a.center-b.center||(a.fixed===b.fixed?a.index-b.index:a.fixed?-1:1));
 for(let pass=0;pass<200;pass++){
  let moved=false;
  for(let i=0;i+1<items.length;i++){const a=items[i],b=items[i+1],overlap=a.center+a.half-(b.center-b.half);if(overlap<=1e-6||a.fixed&&b.fixed)continue;
   if(a.fixed)b.center+=overlap;else if(b.fixed)a.center-=overlap;else{a.center-=overlap/2;b.center+=overlap/2;}clamp(a);clamp(b);moved=true;}
  if(!moved)break;
 }
 // Validation in request order: a label is kept only where it overlaps nothing already kept.
 const kept:[number,number][]=fixed.map(([a,b])=>[Math.min(a,b),Math.max(a,b)]);
 for(const item of [...items].filter(row=>!row.fixed).sort((a,b)=>a.index-b.index)){
  const top=item.center-item.half,bottom=item.center+item.half,fits=top>=bounds.top-1e-6&&bottom<=bounds.bottom+1e-6&&kept.every(([a,b])=>bottom<=a+0.5||top>=b-0.5);
  if(!fits){out[item.index].hidden=true;continue;}
  kept.push([top,bottom]);out[item.index].center=item.center;
 }
 return out;
}

/** Calendar date (YYYY-MM-DD) of a time in a timezone; UTC when the zone is unknown to this computer. */
const dateFormatters=new Map<string,Intl.DateTimeFormat>();
export function zonedDate(ms:number,timezone:string):string{
 let format=dateFormatters.get(timezone);
 if(!format){try{format=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'});}catch{format=new Intl.DateTimeFormat('en-CA',{timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit'});}dateFormatters.set(timezone,format);}
 return format.format(new Date(ms));
}
/** Previous trading day close. Intraday bars: the close of the last bar dated before the latest bar's exchange
 * date. Daily bars: the previous bar's close. Weekly and longer bars carry no daily close, so there is none. */
export function previousDayClose(bars:readonly {time:number;close:number}[],intervalMs:number,timezone:string):number|null{
 const n=bars.length;if(n<2||!(intervalMs>0))return null;
 if(intervalMs>DAY_MS*1.5)return null;
 if(intervalMs>=DAY_MS){const close=bars[n-2].close;return Number.isFinite(close)?close:null;}
 const today=zonedDate(bars[n-1].time,timezone);
 for(let index=n-2;index>=0;index--){if(zonedDate(bars[index].time,timezone)!==today){const close=bars[index].close;return Number.isFinite(close)?close:null;}}
 return null;
}
/** (scales.symbolLabelsLines "Price and percentage value"): the change percentage shown under the last price
 * chip, signed with two decimals ("+1.25%", "-0.40%", "0.00%"). The reference is the previous day close on intraday bars and
 * the previous bar close on daily and longer bars (our own for weekly and monthly). Null when there is no usable reference. */
export function lastChangePercentText(bars:readonly {time:number;close:number}[],intervalMs:number,timezone:string,value:number):string|null{
 const n=bars.length;if(n<2||!(intervalMs>0)||!Number.isFinite(value))return null;
 const reference=intervalMs>=DAY_MS?bars[n-2].close:previousDayClose(bars,intervalMs,timezone);
 if(reference===null||!Number.isFinite(reference)||reference===0)return null;
 const percent=Math.round((value-reference)/Math.abs(reference)*10000)/100;
 return (percent>0?'+':'')+(Object.is(percent,-0)?0:percent).toFixed(2)+'%';
}
/** Visible high and low of the bars between two logical indexes (inclusive, clamped). */
export function visibleHighLow(bars:readonly {high:number;low:number}[],from:number,to:number):{high:number;low:number}|null{
 const start=Math.max(0,Math.ceil(from)),end=Math.min(bars.length-1,Math.floor(to));if(start>end)return null;
 let high=-Infinity,low=Infinity;for(let index=start;index<=end;index++){high=Math.max(high,bars[index].high);low=Math.min(low,bars[index].low);}
 return Number.isFinite(high)&&Number.isFinite(low)?{high,low}:null;
}

/** Session of the instrument the countdown follows. `us-equity`: NYSE hours by New York wall clock (us-market-hours.ts).
 * `continuous`: trades around the clock (crypto, forex, unknown); the bar's own close is used. */
export interface CountdownSession{kind:'us-equity'|'continuous';extended:boolean}
export function countdownSessionFor(assetClass:string|undefined,timezone:string|undefined,sessionBasis:string|undefined):CountdownSession{
 const equity=['stock','etf','option','index'].includes(assetClass??'')&&timezone==='America/New_York';
 return{kind:equity?'us-equity':'continuous',extended:sessionBasis==='extended'||sessionBasis==='all'};
}
const nyParts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',weekday:'short'});
function partsOf(ms:number){const parts=Object.fromEntries(nyParts.formatToParts(new Date(ms)).map(part=>[part.type,part.value]));return{year:Number(parts.year),month:Number(parts.month),day:Number(parts.day),weekday:parts.weekday,minutes:Number(parts.hour)*60+Number(parts.minute),seconds:Number(parts.second)};}
/** Epoch ms of a New York wall-clock minute on a New York calendar date. */
export function newYorkTime(year:number,month:number,day:number,minuteOfDay:number):number{
 let guess=Date.UTC(year,month-1,day,0,minuteOfDay)+5*3_600_000;
 for(let step=0;step<3;step++){const p=partsOf(guess),wall=Date.UTC(p.year,p.month-1,p.day,0,p.minutes,p.seconds),want=Date.UTC(year,month-1,day,0,minuteOfDay);if(wall===want)return guess;guess+=want-wall;}
 return guess;
}
const REGULAR_CLOSE=960,EXTENDED_CLOSE=1200;
function tradingDay(year:number,month:number,day:number):boolean{const noon=newYorkTime(year,month,day,720);return usMarketSession(newYorkTime(year,month,day,600))!=='closed'||usMarketSession(noon)==='regular';}
/** Last NYSE trading day at or before a calendar date, stepping back at most two weeks. */
function lastTradingDayOnOrBefore(year:number,month:number,day:number):{year:number;month:number;day:number}|null{
 let cursor=Date.UTC(year,month-1,day);
 for(let step=0;step<14;step++,cursor-=DAY_MS){const d=new Date(cursor),y=d.getUTCFullYear(),m=d.getUTCMonth()+1,dd=d.getUTCDate();if(tradingDay(y,m,dd))return{year:y,month:m,day:dd};}
 return null;
}
/** Epoch ms the bar countdown counts to, or null when no countdown shows.
 * Continuous instruments: the bar's own end. US equities: intraday bars end at the bar end or the session close, whichever
 * is first, and show only while the market is open (regular hours; extended hours too when the source carries them);
 * daily bars end at today's close, weekly bars at the close of the week's last trading day, monthly bars at the close of
 * the month's last trading day; all hide while the market is closed. */
export function countdownTarget(barOpen:number,barMs:number,now:number,session:CountdownSession):number|null{
 if(!(barMs>0)||!Number.isFinite(barOpen)||!Number.isFinite(now))return null;
 const barEnd=barOpen+barMs;
 if(session.kind==='continuous')return barEnd>now?barEnd:null;
 const state=usMarketSession(now);
 if(state==='closed'||state==='extended'&&(!session.extended||barMs>=DAY_MS))return null;
 const p=partsOf(now);
 if(barMs<DAY_MS){const close=newYorkTime(p.year,p.month,p.day,state==='regular'&&!session.extended?REGULAR_CLOSE:EXTENDED_CLOSE),end=Math.min(barEnd,close);return end>now&&now>=barOpen?end:null;}
 // A daily or longer bar that does not cover today is stale (no live bar): no countdown.
 if(now-barOpen>barMs+DAY_MS*3)return null;
 let target:{year:number;month:number;day:number}|null;
 if(barMs<DAY_MS*6)target={year:p.year,month:p.month,day:p.day};
 else if(barMs<DAY_MS*27){const weekday=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p.weekday),friday=new Date(Date.UTC(p.year,p.month-1,p.day+(5-weekday)));target=lastTradingDayOnOrBefore(friday.getUTCFullYear(),friday.getUTCMonth()+1,friday.getUTCDate());}
 else{const last=new Date(Date.UTC(p.year,p.month,0));target=lastTradingDayOnOrBefore(last.getUTCFullYear(),last.getUTCMonth()+1,last.getUTCDate());}
 if(!target)return null;
 const close=newYorkTime(target.year,target.month,target.day,REGULAR_CLOSE);
 return close>now?close:null;
}

/** Black or white text for a label background (WCAG relative luminance, like the renderer's own chip). */
export function labelTextColor(background:string):string{
 const hex=/^#([\da-f]{3,8})$/i.exec(background.trim());let r=0,g=0,b=0;
 if(hex){const raw=hex[1],full=raw.length<=4?[...raw].map(x=>x+x).join(''):raw;r=parseInt(full.slice(0,2),16);g=parseInt(full.slice(2,4),16);b=parseInt(full.slice(4,6),16);}
 else{const rgb=/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(background.trim());if(!rgb)return '#ffffff';r=Number(rgb[1]);g=Number(rgb[2]);b=Number(rgb[3]);}
 const lin=(c:number)=>{const v=c/255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
 return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b)>=0.4?'#000000':'#ffffff';
}

/** A drawing as the label painter reads it (the serialized native record). */
export interface AxisDrawing{id:string;type:string;paneId:string;anchors:readonly {price:number;time?:number}[];style?:{lineColor?:unknown};visible?:boolean;props?:Record<string,unknown>}
export interface AxisDrawingLabel{id:string;price:number;color:string}
export interface AxisDrawingBand{id:string;min:number;max:number;color:string}
export const POSITION_TYPES:readonly string[]=Object.freeze(['position','lvshortposition']);
// The cross line labels its price like a horizontal line (Cross line Price label on).
const HORIZONTAL_TYPES=new Set(['hline','hray','crossline']);
const PROFIT_FALLBACK='#089981',LOSS_FALLBACK='#f23645',ENTRY_FALLBACK='#787b86';
const colorOf=(value:unknown,fallback:string)=>typeof value==='string'&&value.length>0&&value.length<=200?value:fallback;
/** Axis labels and the selected-drawing price band. Horizontal line and horizontal ray always label their price in
 * the line color. A selected drawing highlights its price range; a selected Long/Short labels entry, stop and target, and
 * any other selected drawing labels its lowest and highest anchors. Hidden drawings and other panes draw nothing. */
export function drawingAxisLabels(drawings:readonly AxisDrawing[],selected:readonly string[],paneId='price'):{labels:AxisDrawingLabel[];bands:AxisDrawingBand[]}{
 const labels:AxisDrawingLabel[]=[],bands:AxisDrawingBand[]=[],chosen=new Set(selected);
 for(const drawing of drawings){
  if(drawing.paneId!==paneId||drawing.visible===false||!Array.isArray(drawing.anchors))continue;
  const prices=drawing.anchors.map(anchor=>anchor?.price).filter((price):price is number=>typeof price==='number'&&Number.isFinite(price));if(!prices.length)continue;
  const color=colorOf(drawing.style?.lineColor,'#2962ff'),isSelected=chosen.has(drawing.id);
  // A cross line saved with Price label off (props.lvAxisLine.priceLabel false) keeps only its selection band.
  if(HORIZONTAL_TYPES.has(drawing.type)){if(axisLineFlag(drawing.type,drawing.props,'priceLabel'))labels.push({id:drawing.id+':price',price:prices[0],color});if(isSelected)bands.push({id:drawing.id,min:prices[0],max:prices[0],color});continue;}
  if(!isSelected)continue;
  const min=Math.min(...prices),max=Math.max(...prices);bands.push({id:drawing.id,min,max,color});
  if(POSITION_TYPES.includes(drawing.type)&&prices.length>=3){
   // The position Price labels setting (props.lvPositionInputs.priceLabels false) keeps the band and drops the three labels.
   if((drawing.props?.lvPositionInputs as {priceLabels?:unknown}|undefined)?.priceLabels===false)continue;
   const [entry,stop,target]=drawing.anchors.map(anchor=>anchor.price);
   labels.push({id:drawing.id+':entry',price:entry,color:ENTRY_FALLBACK},{id:drawing.id+':target',price:target,color:colorOf(drawing.props?.profitColor,PROFIT_FALLBACK)},{id:drawing.id+':stop',price:stop,color:colorOf(drawing.props?.lossColor,LOSS_FALLBACK)});
   continue;
  }
  labels.push({id:drawing.id+':max',price:max,color});if(max!==min)labels.push({id:drawing.id+':min',price:min,color});
 }
 return{labels,bands};
}

/** Vertical line / Cross line Time label on: one time-axis label per visible vertical line and
 * cross line, at its anchor time, in the line color. The time axis is shared, so every pane counts. */
export const TIME_LABEL_TYPES:readonly string[]=Object.freeze(['vline','crossline']);
export interface AxisTimeLabel{id:string;time:number;color:string}
export function drawingTimeAxisLabels(drawings:readonly AxisDrawing[]):AxisTimeLabel[]{
 const out:AxisTimeLabel[]=[];
 for(const drawing of drawings){
  if(!TIME_LABEL_TYPES.includes(drawing.type)||drawing.visible===false||!Array.isArray(drawing.anchors)||!axisLineFlag(drawing.type,drawing.props,'timeLabel'))continue;
  const time=drawing.anchors[0]?.time;if(typeof time!=='number'||!Number.isFinite(time))continue;
  out.push({id:drawing.id+':time',time,color:colorOf(drawing.style?.lineColor,'#2962ff')});
 }
 return out;
}
const timeFormatters=new Map<string,Intl.DateTimeFormat>();
// Fixed three-letter months: some ICU builds print 'Sept' for the en-GB short month.
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
/** Time-axis label text (LV format): "Tue 28 Oct '26 14:30" on intraday bars, "Tue 28 Oct '26" on daily and longer bars, in the
 * chart timezone (UTC when the zone is unknown to this computer). */
export function timeAxisLabelText(ms:number,timezone:string,intervalMs:number):string{
 if(!Number.isFinite(ms))return '';
 const intraday=!(intervalMs>=DAY_MS),key=timezone+(intraday?'|t':'|d');
 let format=timeFormatters.get(key);
 if(!format){const options:Intl.DateTimeFormatOptions={weekday:'short',day:'2-digit',month:'numeric',year:'2-digit',...(intraday?{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}:{})};
  try{format=new Intl.DateTimeFormat('en-GB',{...options,timeZone:timezone});}catch{format=new Intl.DateTimeFormat('en-GB',{...options,timeZone:'UTC'});}timeFormatters.set(key,format);}
 const p=Object.fromEntries(format.formatToParts(new Date(ms)).map(part=>[part.type,part.value]));
 return `${p.weekday} ${p.day} ${MONTHS[Number(p.month)-1]??p.month} '${p.year}`+(intraday?` ${p.hour}:${p.minute}`:'');
}
/** Places time-axis labels of width `width` centered on x, kept inside [0, dataWidth]; a label whose x is off the plot is hidden. */
export function layoutTimeAxisLabels(labels:readonly {id:string;x:number;width:number}[],dataWidth:number):{id:string;left:number;hidden:boolean}[]{
 return labels.map(label=>{
  const hidden=!Number.isFinite(label.x)||label.x<0||label.x>dataWidth||!(label.width>0);
  const left=hidden?0:Math.max(0,Math.min(dataWidth-label.width,label.x-label.width/2));
  return{id:label.id,left,hidden};
 });
}

/** Paints the drawing time-axis labels into the time-axis strip (y from `top`, `height` tall): a box in the line color with the
 * contrast text, centered on the anchor x and kept on the plot. Meant to run right after the native time axis. Returns the count. */
export function paintDrawingTimeLabels(ctx:CanvasRenderingContext2D,labels:readonly AxisTimeLabel[],view:{xOf(time:number):number;textTime?(time:number,id:string):number;timezone:string;intervalMs:number;dataWidth:number;top:number;height:number;font:string}):number{
 if(!labels.length||!(view.height>0))return 0;
 ctx.save();
 try{
  ctx.font=view.font;ctx.textBaseline='middle';ctx.textAlign='center';
  const rows=labels.map(label=>{const shown=view.textTime?view.textTime(label.time,label.id):label.time,text=Number.isFinite(shown)?timeAxisLabelText(shown,view.timezone,view.intervalMs):'';return{label,text,x:view.xOf(label.time),width:ctx.measureText(text).width+12};});
  const placed=layoutTimeAxisLabels(rows.map(row=>({id:row.label.id,x:row.x,width:row.width})),view.dataWidth);
  let painted=0;const boxHeight=Math.min(view.height,AXIS_LABEL_HEIGHT+4),boxTop=view.top+(view.height-boxHeight)/2;
  placed.forEach((spot,index)=>{const row=rows[index];if(spot.hidden||!row.text)return;ctx.fillStyle=row.label.color;ctx.fillRect(spot.left,boxTop,row.width,boxHeight);ctx.fillStyle=labelTextColor(row.label.color);ctx.fillText(row.text,spot.left+row.width/2,boxTop+boxHeight/2);painted++;});
  return painted;
 }finally{ctx.restore();}
}

/** Scale ranges other painters already hold in a pane's master price column this frame (indicator value tags), keyed by the
 * renderer scene. Movable LV labels avoid the main pane's ranges under "No overlapping labels", and the price scale port blanks
 * the tick labels under any pane's ranges. A publisher replaces its ranges each
 * frame. `paneId` defaults to the main price pane. */
const reservedRanges=new WeakMap<object,Map<string,{paneId:string;ranges:readonly (readonly [number,number])[]}>>();
const reservedListeners=new WeakMap<object,Set<()=>void>>();
export function publishReservedAxisRanges(scene:object,owner:string,ranges:readonly (readonly [number,number])[],paneId='price'):void{
 let byOwner=reservedRanges.get(scene);if(!byOwner){byOwner=new Map();reservedRanges.set(scene,byOwner);}
 byOwner.set(paneId==='price'?owner:owner+' '+paneId,{paneId,ranges:Object.freeze(ranges.filter(row=>Array.isArray(row)&&row.length===2&&row.every(Number.isFinite)).map(([a,b])=>Object.freeze([a,b] as const)))});
 const listeners=reservedListeners.get(scene);if(listeners)for(const listener of [...listeners])try{listener();}catch{/* One observer never blocks a painter. */}
}
export function reservedAxisRanges(scene:object,paneId='price'):(readonly [number,number])[]{return[...(reservedRanges.get(scene)?.values()??[])].filter(row=>row.paneId===paneId).flatMap(row=>row.ranges);}
/** Every pane with published ranges, for change detection. */
export function reservedAxisPanes(scene:object):string[]{return[...new Set([...(reservedRanges.get(scene)?.values()??[])].filter(row=>row.ranges.length>0).map(row=>row.paneId))];}
/** Called (synchronously, during painting) after every publish for `scene`. Returns the unsubscribe. */
export function subscribeReservedAxisRanges(scene:object,listener:()=>void):()=>void{
 let set=reservedListeners.get(scene);if(!set){set=new Set();reservedListeners.set(scene,set);}set.add(listener);
 return()=>{set!.delete(listener);};
}
export interface AxisTickLabel{price:number;label:string;major?:boolean}
/** The reference hides a scale's tick label where a value label sits on it. Ticks
 * whose text band (y +- halfHeight, y from `yOf`) meets a reserved range keep their price (the grid line stays) with an empty
 * label. Ranges are in the same coordinates as `yOf`. */
export function clearTickLabels(ticks:readonly AxisTickLabel[],yOf:(price:number)=>number,ranges:readonly (readonly [number,number])[],halfHeight=7):AxisTickLabel[]{
 if(!ranges.length)return[...ticks];
 const spans=ranges.map(([a,b])=>[Math.min(a,b),Math.max(a,b)] as const);
 return ticks.map(tick=>{const y=yOf(tick.price);if(!Number.isFinite(y)||!tick.label)return tick;return spans.some(([a,b])=>y+halfHeight>a&&y-halfHeight<b)?{...tick,label:''}:tick;});
}
/** New York wall-clock minute of the day (0-1439) for an epoch ms. The UTC offset is cached per UTC hour (New York changes
 * offset only on the hour), so classifying a long intraday history costs one Intl call per hour, not per bar. */
const nyOffsets=new Map<number,number>();
export function newYorkMinuteOfDay(ms:number):number{
 const hour=Math.floor(ms/3_600_000);let offset=nyOffsets.get(hour);
 if(offset===undefined){const at=hour*3_600_000,p=partsOf(at);offset=(Date.UTC(p.year,p.month-1,p.day,0,p.minutes)-at)/60_000;if(nyOffsets.size>20_000)nyOffsets.clear();nyOffsets.set(hour,offset);}
 const minute=Math.floor(ms/60_000)+offset;return((minute%1440)+1440)%1440;
}
