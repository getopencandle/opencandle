// Volume footprint chart type. A time-based type: an LV layer
// replaces the price painting (basePainting 'none', like TPO) and draws, for each visible bar, a thin candle and its price
// rows with buy and sell volume, POC, value area, imbalances and a summary table under the bars. The axis, drawings, live
// updates and indicators (on the standard bars) are those of an ordinary time chart. Bar Replay keeps refusing the type
// (src/domain/replay-session.ts).
// Model and rules: src/domain/footprint.ts. Colors are the LV theme token values (--lv-up, --lv-down, --lv-positive-text, --lv-negative-text,
// --lv-notice-text, --lv-accent of src/ui/styles.css); dialog row order is our own choice.
// Performance: only the visible bars are built (cached per bar), cell text needs room (a cell at least 22 px wide and 9 px
// tall), and below 12 px per bar the layer paints plain candles.
import {registerChartType,registerRendererLayer,type RendererLayerArgs,type RendererLayerInstance} from '@luxalgo/vela';
import type {ChartSettingField} from './chart-settings';
import type {Bar} from '../domain/types';
import type {PivotCalendar} from '../domain/indicators-ext/r23-catalog';
import {footprintBar,footprintRowSize,footprintSessionCvd,FOOTPRINT_ROW_SIZE_MODES,FOOTPRINT_TYPES,type FootprintBar,type FootprintOptions} from '../domain/footprint';

export const FOOTPRINT_STYLE='footprint';
const f=(key:string,label:string,kind:ChartSettingField['kind'],extra:Partial<ChartSettingField>={}):ChartSettingField=>({key,label,kind,...extra});
const color=(key:string,label:string)=>f(key,label,'color');
/** Settings rows. Keys follow the reference input and style names. */
export const FOOTPRINT_SETTING_FIELDS:readonly ChartSettingField[]=Object.freeze([
 f('rowSize','Row size','select',{options:[...FOOTPRINT_ROW_SIZE_MODES]}),
 f('atrLength','ATR length','number',{min:1,max:500,step:1}),
 f('ticksPerRow','Ticks per row','number',{min:1,max:100000,step:1}),
 f('type','Type','select',{options:[...FOOTPRINT_TYPES]}),
 f('deltaAdjust','Color gradient','boolean'),color('buyColor','Buy volume color'),color('sellColor','Sell volume color'),
 f('pointOfControl','Point of control','boolean'),color('pocColor','Point of control color'),
 f('showVA','Value area (VAH and VAL)','boolean'),f('vaPercent','Value area (%)','number',{min:1,max:100,step:1}),color('valueAreaColor','Value area color'),
 f('imbalanceHighlight','Imbalance highlight','boolean'),f('imbalancePercent','Imbalance (%)','number',{min:100,max:100000,step:1}),
 f('ignoreZeroVolume','Ignore zero volume in imbalance','boolean'),f('minimalImbalanceVolume','Minimal imbalance volume','number',{min:0,max:1e12,step:1}),
 color('buyImbalanceColor','Buy imbalance color'),color('sellImbalanceColor','Sell imbalance color'),
 f('calcStackedImbalance','Stacked imbalance','boolean'),f('stackedImbalanceCount','Stacked imbalance count','number',{min:2,max:50,step:1}),
 f('showUnfinishedAuction','Unfinished auction','boolean'),color('unfinishedAuctionColor','Unfinished auction color'),
 f('showSummary','Summary','boolean'),f('summaryVolume','Summary volume','boolean'),f('summaryDelta','Summary delta','boolean'),
 f('summarySessionCvd','Summary session CVD','boolean'),f('summaryPoc','Summary POC price','boolean'),
]);
/** Factory values: behavior defaults from the facts above; colors are LV token values. */
export const FOOTPRINT_LV_DEFAULTS:Readonly<Record<string,unknown>>=Object.freeze({
 rowSize:'Auto',atrLength:14,ticksPerRow:100,type:'Buy and sell',deltaAdjust:true,buyColor:'#38b486',sellColor:'#e8605a',
 pointOfControl:true,pocColor:'#e9c27a',showVA:true,vaPercent:70,valueAreaColor:'#3cc0cf',
 imbalanceHighlight:true,imbalancePercent:300,ignoreZeroVolume:false,minimalImbalanceVolume:0,buyImbalanceColor:'#4cc795',sellImbalanceColor:'#f2736c',
 calcStackedImbalance:false,stackedImbalanceCount:3,showUnfinishedAuction:false,unfinishedAuctionColor:'#e9c27a',
 showSummary:true,summaryVolume:true,summaryDelta:true,summarySessionCvd:true,summaryPoc:true,
});
export const FOOTPRINT_UNRESOLVED:readonly string[]=Object.freeze([
 'OpenCandle-defined: OpenCandle has no tick or bid/ask data. Buy and sell volume at each price is approximated from each bar\'s own price path (up bar: open, low, high, close; down bar: open, high, low, close), with volume on rising moves counted as buy and on falling moves as sell. It can differ from a reference that reads real order flow.',
 'Auto row size (ATR / 8), imbalance, stacked imbalance, unfinished auction and session CVD rules, colors and row order are OpenCandle-defined.',
 'Footprint alerts read the same approximation on the alert\'s bars; a forming live bar can change until it closes, so live and historical values can differ.',
]);
/** Native-data payload on the footprint channel (all optional). */
export interface FootprintLayerPayload {tickSize?:number|null;calendar?:PivotCalendar|null;timeZone?:string|null;resolution?:string|null}

/** The model options for the settings and a row size. */
export function footprintOptions(settings:Record<string,unknown>,rowSize:number):FootprintOptions{
 const v={...FOOTPRINT_LV_DEFAULTS,...settings};
 return {rowSize,vaPercent:Number(v.vaPercent),imbalancePercent:Number(v.imbalancePercent),stackedImbalanceCount:v.calcStackedImbalance===true?Number(v.stackedImbalanceCount):Number.MAX_SAFE_INTEGER,ignoreZeroVolume:v.ignoreZeroVolume===true,minimalImbalanceVolume:Number(v.minimalImbalanceVolume)};
}
/** Compact volume text: 950, 1.2K, 3.4M. */
export function footprintVolumeText(value:number):string{
 const a=Math.abs(value),sign=value<0?'-':'';
 return a>=1e9?sign+(a/1e9).toFixed(1)+'B':a>=1e6?sign+(a/1e6).toFixed(1)+'M':a>=1e4?sign+(a/1e3).toFixed(1)+'K':sign+String(Math.round(a));
}
/** Hex color with an alpha 0..1 (#rrggbb or #rrggbbaa in; #rrggbbaa out). */
export function footprintAlpha(hex:string,alpha:number):string{
 const base=/^#[0-9a-f]{6}/i.test(hex)?hex.slice(0,7):'#808080';
 return base+Math.round(Math.max(0,Math.min(1,alpha))*255).toString(16).padStart(2,'0');
}
/** Zoom detail for a bar slot and a row height: what the layer paints. */
export function footprintDetail(spacing:number,rowHeight:number,type:string):{cells:boolean;text:boolean;summaryText:boolean}{
 const cells=spacing>=12,cellWidth=(spacing-8)/(type==='Buy and sell'||type==='Ladder'?2:1);
 return {cells,text:cells&&cellWidth>=22&&rowHeight>=9,summaryText:spacing>=40};
}
const SUMMARY_ROW=14;
class FootprintLayer implements RendererLayerInstance{
 private canvas:HTMLCanvasElement|null=null;
 private sizeMemo:{bars:readonly unknown[];length:number;lastJson:string;key:string;rowSize:number|null;note:string|null;cvd:(number|null)[]}|null=null;
 private cache=new Map<number,{key:string;bar:FootprintBar|null}>();private cacheKey='';
 mount(canvas:HTMLCanvasElement){this.canvas=canvas;canvas.dataset.lvChartType=FOOTPRINT_STYLE;}
 render(args:RendererLayerArgs){
  const canvas=this.canvas;if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;ctx.clearRect(0,0,canvas.width,canvas.height);
  if(args.priceStyle!==FOOTPRINT_STYLE||!args.bars.length){canvas.dataset.lvPaintedBars='0';return;}
  const s={...FOOTPRINT_LV_DEFAULTS,...args.settings},payload=(args.data??{}) as FootprintLayerPayload,bars=args.bars;
  const lastJson=JSON.stringify(bars.at(-1)),sizeKey=JSON.stringify([s.rowSize,s.atrLength,s.ticksPerRow,payload.tickSize??null,payload.calendar??null,payload.resolution??null]);
  if(!this.sizeMemo||this.sizeMemo.bars!==bars||this.sizeMemo.length!==bars.length||this.sizeMemo.lastJson!==lastJson||this.sizeMemo.key!==sizeKey){
   const seconds:Bar[]=bars.map(bar=>({time:Math.floor(bar.time/1000),open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:Number((bar as {volume?:number}).volume??NaN)}));
   const size=footprintRowSize(seconds,s,payload.tickSize??null);
   let cvd:(number|null)[]=[];try{cvd=footprintSessionCvd(seconds,{resolution:payload.resolution??null,calendar:payload.calendar??null}).cvd;}catch{cvd=[];}
   this.sizeMemo={bars,length:bars.length,lastJson,key:sizeKey,rowSize:size.rowSize,note:size.note,cvd};
  }
  const {rowSize,note,cvd}=this.sizeMemo;canvas.dataset.lvFootprintNote=note??'';
  const range=args.coords.visibleLogicalRange(),start=Math.max(0,Math.floor(range.from)-1),end=Math.min(bars.length-1,Math.ceil(range.to)+1);
  if(start>end||rowSize===null){canvas.dataset.lvPaintedBars='0';return;}
  const options=footprintOptions(s,rowSize),optionsKey=JSON.stringify(options);
  if(this.cacheKey!==optionsKey||this.cache.size>20000){this.cache.clear();this.cacheKey=optionsKey;}
  const built=(index:number):FootprintBar|null=>{const bar=bars[index],key=`${bar.time}|${bar.open}|${bar.high}|${bar.low}|${bar.close}|${(bar as {volume?:number}).volume}`;const held=this.cache.get(index);if(held&&held.key===key)return held.bar;
   let value:FootprintBar|null=null;try{value=footprintBar({open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:Number((bar as {volume?:number}).volume??NaN)},options);}catch{value=null;}this.cache.set(index,{key,bar:value});return value;};
  const x=(index:number)=>args.coords.logicalToX(index),y=(price:number)=>args.coords.priceToY(price,args.scale,args.bounds),spacing=Math.max(1,args.coords.bodySpacing());
  const rowHeight=Math.abs(y(0)-y(rowSize)),type=String(s.type),detail=footprintDetail(spacing,rowHeight,type);
  const summaryKeys=s.showSummary===true?(['summaryVolume','summaryDelta','summarySessionCvd','summaryPoc'] as const).filter(key=>s[key]===true):[];
  const summaryRows=detail.cells&&summaryKeys.length&&args.bounds.height>SUMMARY_ROW*(summaryKeys.length+4)?summaryKeys.length:0;
  const up=args.theme.upColor||'#38b486',down=args.theme.downColor||'#e8605a',text=args.theme.textColor||'#a0a7b8',font=args.theme.fontFamily||'sans-serif';
  const buyColor=String(s.buyColor),sellColor=String(s.sellColor);
  ctx.save();ctx.scale(args.coords.dpr,args.coords.dpr);ctx.beginPath();ctx.rect(0,args.bounds.top,args.coords.width,args.bounds.height-summaryRows*SUMMARY_ROW);ctx.clip();
  let painted=0,cellsPainted=0,textPainted=0;
  for(let index=start;index<=end;index++){
   const bar=bars[index],cx=x(index),left=cx-spacing/2,isUp=bar.close>=bar.open;
   if(!detail.cells){
    // Small zoom: plain candles, no rows.
    const width=Math.max(1,spacing*0.7);ctx.strokeStyle=isUp?up:down;ctx.fillStyle=isUp?up:down;ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(cx,y(bar.high));ctx.lineTo(cx,y(bar.low));ctx.stroke();
    ctx.fillRect(cx-width/2,Math.min(y(bar.open),y(bar.close)),width,Math.max(1,Math.abs(y(bar.open)-y(bar.close))));painted++;continue;
   }
   // Thin candle at the slot's left edge (the type keeps the candle colors).
   const wickX=left+3;ctx.strokeStyle=isUp?up:down;ctx.fillStyle=isUp?up:down;ctx.lineWidth=1;
   ctx.beginPath();ctx.moveTo(wickX,y(bar.high));ctx.lineTo(wickX,y(bar.low));ctx.stroke();
   ctx.fillRect(wickX-1.5,Math.min(y(bar.open),y(bar.close)),3,Math.max(1,Math.abs(y(bar.open)-y(bar.close))));
   painted++;
   const fp=built(index);if(!fp||!fp.volumeAvailable||!(fp.volume>0))continue;
   const cellLeft=left+6,cellWidth=Math.max(2,spacing-8),split=type==='Buy and sell'||type==='Ladder',half=cellWidth/2;
   let maxSide=0,maxTotal=0,maxDelta=0;for(const row of fp.rows){maxSide=Math.max(maxSide,row.buy,row.sell);maxTotal=Math.max(maxTotal,row.buy+row.sell);maxDelta=Math.max(maxDelta,Math.abs(row.buy-row.sell));}
   const shade=(value:number,max:number)=>s.deltaAdjust===true&&max>0?0.15+0.6*value/max:0.4;
   ctx.textBaseline='middle';
   for(let k=0;k<fp.rows.length;k++){
    const row=fp.rows[k],top=Math.min(y(row.low),y(row.high))+0.5,height=Math.max(1,Math.abs(y(row.low)-y(row.high))-1),mid=top+height/2;
    const buyImb=s.imbalanceHighlight===true&&fp.buyImbalance[k],sellImb=s.imbalanceHighlight===true&&fp.sellImbalance[k];
    if(split){
     if(type==='Ladder'){
      const sellW=maxSide>0?half*row.sell/maxSide:0,buyW=maxSide>0?half*row.buy/maxSide:0;
      ctx.fillStyle=footprintAlpha(sellColor,0.55);ctx.fillRect(cellLeft+half-sellW,top,sellW,height);
      ctx.fillStyle=footprintAlpha(buyColor,0.55);ctx.fillRect(cellLeft+half,top,buyW,height);
     }else{
      ctx.fillStyle=footprintAlpha(sellColor,shade(row.sell,maxSide));ctx.fillRect(cellLeft,top,half-0.5,height);
      ctx.fillStyle=footprintAlpha(buyColor,shade(row.buy,maxSide));ctx.fillRect(cellLeft+half+0.5,top,half-0.5,height);
     }
     if(sellImb){ctx.fillStyle=String(s.sellImbalanceColor);ctx.fillRect(cellLeft,top,2,height);}
     if(buyImb){ctx.fillStyle=String(s.buyImbalanceColor);ctx.fillRect(cellLeft+cellWidth-2,top,2,height);}
     if(detail.text){
      ctx.font=`${Math.max(7,Math.min(11,Math.floor(height)-1))}px ${font}`;
      ctx.textAlign='right';ctx.fillStyle=sellImb?String(s.sellImbalanceColor):text;ctx.fillText(footprintVolumeText(row.sell),cellLeft+half-3,mid);
      ctx.textAlign='left';ctx.fillStyle=buyImb?String(s.buyImbalanceColor):text;ctx.fillText(footprintVolumeText(row.buy),cellLeft+half+3,mid);textPainted++;
     }
    }else{
     const delta=row.buy-row.sell,total=row.buy+row.sell,ink=delta>=0?buyColor:sellColor;
     ctx.fillStyle=type==='Delta'?footprintAlpha(ink,shade(Math.abs(delta),maxDelta)):footprintAlpha(s.deltaAdjust===true?ink:buyColor,shade(total,maxTotal));
     ctx.fillRect(cellLeft,top,cellWidth,height);
     if(buyImb){ctx.fillStyle=String(s.buyImbalanceColor);ctx.fillRect(cellLeft+cellWidth-2,top,2,height);}
     if(sellImb){ctx.fillStyle=String(s.sellImbalanceColor);ctx.fillRect(cellLeft,top,2,height);}
     if(detail.text){ctx.font=`${Math.max(7,Math.min(11,Math.floor(height)-1))}px ${font}`;ctx.textAlign='center';ctx.fillStyle=text;ctx.fillText(footprintVolumeText(type==='Delta'?delta:total),cellLeft+cellWidth/2,mid);textPainted++;}
    }
    cellsPainted++;
   }
   const yTop=(k:number)=>Math.min(y(fp.rows[k].low),y(fp.rows[k].high)),yBottom=(k:number)=>Math.max(y(fp.rows[k].low),y(fp.rows[k].high));
   if(s.calcStackedImbalance===true){
    ctx.lineWidth=2;
    for(const [flags,ink,xx] of [[fp.stackedBuy,String(s.buyImbalanceColor),cellLeft+cellWidth+1],[fp.stackedSell,String(s.sellImbalanceColor),cellLeft-1]] as const)
     for(let k=0;k<flags.length;k++)if(flags[k]){let j=k;while(j+1<flags.length&&flags[j+1])j++;ctx.strokeStyle=ink;ctx.beginPath();ctx.moveTo(xx,yBottom(k));ctx.lineTo(xx,yTop(j));ctx.stroke();k=j;}
   }
   if(s.pointOfControl===true&&fp.poc>=0){ctx.strokeStyle=String(s.pocColor);ctx.lineWidth=1;ctx.strokeRect(cellLeft+0.5,yTop(fp.poc)+0.5,cellWidth-1,Math.max(1,yBottom(fp.poc)-yTop(fp.poc)-1));}
   if(s.showVA===true&&fp.vah!==null&&fp.val!==null){ctx.strokeStyle=String(s.valueAreaColor);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cellLeft+cellWidth+3,y(fp.val));ctx.lineTo(cellLeft+cellWidth+3,y(fp.vah));ctx.stroke();}
   if(s.showUnfinishedAuction===true){ctx.strokeStyle=String(s.unfinishedAuctionColor);ctx.lineWidth=2;
    if(fp.unfinishedHigh){const yy=yTop(fp.rows.length-1)-1;ctx.beginPath();ctx.moveTo(cellLeft,yy);ctx.lineTo(cellLeft+cellWidth,yy);ctx.stroke();}
    if(fp.unfinishedLow){const yy=yBottom(0)+1;ctx.beginPath();ctx.moveTo(cellLeft,yy);ctx.lineTo(cellLeft+cellWidth,yy);ctx.stroke();}}
  }
  ctx.restore();
  // Summary table under the bars: one row per enabled metric.
  if(summaryRows){
   ctx.save();ctx.scale(args.coords.dpr,args.coords.dpr);
   const tableTop=args.bounds.top+args.bounds.height-summaryRows*SUMMARY_ROW;
   ctx.fillStyle=footprintAlpha(args.theme.background&&/^#[0-9a-f]{6}/i.test(args.theme.background)?args.theme.background:'#232734',0.85);ctx.fillRect(0,tableTop,args.coords.width,summaryRows*SUMMARY_ROW);
   ctx.font=`10px ${font}`;ctx.textBaseline='middle';ctx.textAlign='center';
   for(let index=start;index<=end;index++){
    const fp=built(index),cx=x(index);
    summaryKeys.forEach((key,r)=>{
     const yy=tableTop+r*SUMMARY_ROW;let value:number|null=null;
     if(fp&&fp.volumeAvailable)value=key==='summaryVolume'?fp.volume:key==='summaryDelta'?fp.delta:key==='summarySessionCvd'?cvd[index]??null:fp.pocPrice;
     if(value===null)return;
     if(key==='summaryDelta'||key==='summarySessionCvd'){ctx.fillStyle=footprintAlpha(value>=0?buyColor:sellColor,0.3);ctx.fillRect(cx-spacing/2+1,yy+1,spacing-2,SUMMARY_ROW-2);}
     if(detail.summaryText){ctx.fillStyle=text;ctx.fillText(key==='summaryPoc'?String(Number(value.toPrecision(8))):footprintVolumeText(value),cx,yy+SUMMARY_ROW/2);}
    });
   }
   ctx.restore();
  }
  canvas.dataset.lvPaintedBars=String(painted);canvas.dataset.lvFootprintCells=String(cellsPainted);canvas.dataset.lvFootprintText=String(textPainted);canvas.dataset.lvFootprintSummaryRows=String(summaryRows);
  canvas.dataset.lvFrames=String(Number(canvas.dataset.lvFrames??0)+1);
 }
 destroy(){this.canvas=null;this.sizeMemo=null;this.cache.clear();}
}
let registered=false;
/** Registers the Volume footprint type (the layer replaces the price painting) and its layer. Idempotent. */
export function registerFootprintChartType(){if(registered)return;registered=true;registerChartType({id:FOOTPRINT_STYLE,label:'Volume footprint',basePainting:'none'});registerRendererLayer({id:FOOTPRINT_STYLE,placement:'below-data',create:()=>new FootprintLayer()});}
/** Rows the current choices do not use (the dialog dims them). */
export function footprintRowUnused(key:string,values:Record<string,unknown>):boolean{
 if(key==='atrLength')return values.rowSize!=='Auto';
 if(key==='ticksPerRow')return values.rowSize!=='Ticks per row';
 if(key==='pocColor')return values.pointOfControl===false;
 if(key==='vaPercent'||key==='valueAreaColor')return values.showVA===false;
 if(key==='buyImbalanceColor'||key==='sellImbalanceColor')return values.imbalanceHighlight===false&&values.calcStackedImbalance!==true;
 if(key==='stackedImbalanceCount')return values.calcStackedImbalance!==true;
 if(key==='unfinishedAuctionColor')return values.showUnfinishedAuction!==true;
 if(['summaryVolume','summaryDelta','summarySessionCvd','summaryPoc'].includes(key))return values.showSummary===false;
 return false;
}
