import {NativeRenderer,type Vela,type SerializedDrawing} from '@luxalgo/vela';
import {LosslessDrawingDocument,type OwnedDrawingEditAcceptance,type ChartDiagnostic} from './contracts';
import {readTrendlineStats,readTrendlineMarkers,TRENDLINE_STATS_DEFAULTS,type TrendlineStatsSettings,type TrendlineStatsPosition} from './trendline-stats-data';
import type {TrendlineStatisticsSource,TrendlineStatisticsGridRead} from './trendline-stats-source';
import {calculateTrendlineStatistics,calculateTrendlineDistance,calculateTrendlineAngle,calculateChangeInPips,type TrendlineStatisticName,type TrendlineStatistics,type TrendlineDistance,type TrendlineStatistic} from '../domain/trendline-statistics';
import {captureNativeInlineLayoutOwner,resolveNativeInlineLayoutOwner} from './native-inline-layout-owner';
import {resolveTrendlineStatisticsNativeOwner} from './trendline-stats-owner';
import {registerOwnedTrendlineStatistics,resolveOwnedStatisticsFrame,resolveOwnedStatisticsTarget,type OwnedStatisticsFrameParts,type OwnedTrendlineStatisticsTarget,type OwnedTrendlineStatisticsPass} from './trendline-annotation';

export interface TrendlineStatisticsPaintHost {
 readonly document:LosslessDrawingDocument;
 captureSource():TrendlineStatisticsSource;
 captureNativeOwner(canonical:Readonly<SerializedDrawing>,projected:Readonly<SerializedDrawing>,canonicalOwner:OwnedDrawingEditAcceptance,assertSource:()=>void):()=>void;
 reportUnavailable(message:string):void;
 /** Renderer row (synthetic time on a derived chart) -> source-time row, applied before the projected renderer
  * row is bound against its canonical record. Omitted, or the same row on a time chart, means no mapping. */
 rendererRowToSource?(row:Readonly<SerializedDrawing>):Readonly<SerializedDrawing>;
 /** The instrument pip size (domain/pip-size.ts), null when none can be derived. */
 pipSize?():number|null;
}
/** The stored statistics plus the two added rows, which live in props.lvTrendlineMarkers (the closed lvTrendlineStats shape is unchanged). */
export type TrendlineStatsPaintSettings=TrendlineStatsSettings&{readonly distance:boolean;readonly angle:boolean;readonly pips?:boolean};
export interface TrendlineStatisticsInstallation {invalidate():void;diagnostics():readonly ChartDiagnostic[];dispose():void}
type Data=Record<string,any>;
const readonlyCapture=Object.getOwnPropertyDescriptor(LosslessDrawingDocument.prototype,'captureReadOnlyOwner')!.value as LosslessDrawingDocument['captureReadOnlyOwner'];
function own(owner:object,key:string):any{const field=Object.getOwnPropertyDescriptor(owner,key);if(!field||!Object.hasOwn(field,'value'))throw Error('Statistics requires a data field: '+key);return field.value;}
function method(owner:object,key:string):Function{for(let current:object|null=owner;current;current=Object.getPrototypeOf(current)){const field=Object.getOwnPropertyDescriptor(current,key);if(field){if(!Object.hasOwn(field,'value')||typeof field.value!=='function')throw Error('Statistics method requires data: '+key);return field.value;}}throw Error('Statistics method unavailable: '+key);}
function number(value:number,signed=false){if(!Number.isFinite(value))throw Error('Statistics value is not finite');const text=value===0?'0':Number(value.toPrecision(12)).toString();return signed&&value>0?'+'+text:text;}
/** Precision: prices show 2 decimals at or above 1 and 4 significant digits below it (the
 * statistics source carries no symbol tick size), percent 2 decimals, bars whole, time as a d/h/m span. */
export function trendlinePriceDecimals(prices:readonly number[]):number{
 const largest=Math.max(0,...prices.filter(Number.isFinite).map(Math.abs));
 return largest>=1||largest===0?2:Math.min(8,Math.max(2,3-Math.floor(Math.log10(largest))));
}
function fixed(value:number,decimals:number,signed=false){if(!Number.isFinite(value))throw Error('Statistics value is not finite');let text=value.toFixed(decimals);if(/^-0(\.0+)?$/.test(text))text=text.slice(1);return signed&&Number(text)>0?'+'+text:text;}
/** Elapsed time as a short span: "160d", "3d 4h", "2h 15m", "45m", "30s". */
export function trendlineSpanText(ms:number):string{
 const seconds=Math.round(Math.abs(ms)/1000),days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60);
 if(days)return hours&&days<10?days+'d '+hours+'h':days+'d';
 if(hours)return minutes?hours+'h '+minutes+'m':hours+'h';
 if(minutes)return minutes+'m';
 return seconds+'s';
}
const NA='n/a';
/** On a derived chart (Renko and the other non-time types) the renderer anchors carry synthetic logical times,
 * so the shown time span comes from the source-time row (rendererRowToSource); undefined keeps the renderer anchors' span. */
function sourceElapsedMs(row:Readonly<SerializedDrawing>):number|undefined{
 const anchors=(row as {anchors?:unknown}).anchors;if(!Array.isArray(anchors)||anchors.length!==2)return undefined;
 const [a,b]=anchors.map(point=>(point as {time?:unknown})?.time);return typeof a==='number'&&typeof b==='number'&&Number.isFinite(a)&&Number.isFinite(b)?Math.abs(b-a):undefined;
}
function linesFor(result:TrendlineStatistics,settings:Readonly<TrendlineStatsPaintSettings>,distance:TrendlineStatistic<TrendlineDistance>|undefined,anchors:readonly {price:number}[],elapsedMs?:number,pips?:TrendlineStatistic<number>):readonly string[]{
 const lines:string[]=[],decimals=trendlinePriceDecimals(anchors.map(point=>point.price));
 if(settings.priceRange){const metric=result.priceRange;lines.push('Price: '+(metric.state==='available'?fixed(metric.value,decimals,true):NA));}
 if(settings.percentChange){const metric=result.percentChange;lines.push('Change: '+(metric.state==='available'?fixed(metric.value,2,true)+'%':NA));}
 // Change in pips, one decimal (fractional pips), signed like the price change.
 if(settings.pips&&pips)lines.push('Pips: '+(pips.state==='available'?fixed(pips.value,1,true):NA));
 if(settings.barsRange){const metric=result.barsRange;lines.push('Bars: '+(metric.state==='available'?String(Math.round(metric.value)):NA));}
 if(settings.dateTimeRange){const raw=result.dateTimeRange;lines.push('Time: '+(raw.state==='available'?trendlineSpanText(elapsedMs??raw.value.elapsedMs):NA));}
 // Distance is the bar count and the price difference as a pair.
 if(settings.distance&&distance)lines.push('Distance: '+(distance.state==='available'?Math.round(distance.value.bars)+' bars, '+fixed(distance.value.price,decimals):NA));
 if(lines.length>6||lines.reduce((count,line)=>count+line.length,0)>768)throw Error('Statistics label exceeds the six-line/768-unit display bound');
 return Object.freeze(lines);
}
interface Index {owner:OwnedDrawingEditAcceptance;canonical:()=>void;source:object;rows:Map<string,{record:Readonly<SerializedDrawing>;settings:Readonly<TrendlineStatsPaintSettings>}>;bindings:WeakMap<object,Binding>}
interface Binding {native:()=>void;localNative:()=>void;anchors:readonly {time:number;price:number}[];lines:readonly string[];settings:Readonly<TrendlineStatsPaintSettings>}

/** Original derived labels. Canonical settings never become native text or editable hit regions. */
export function installTrendlineStatistics(renderer:NativeRenderer,chart:Vela,host:TrendlineStatisticsPaintHost):TrendlineStatisticsInstallation{
 if(!(renderer instanceof NativeRenderer)||!chart)throw Error('Statistics renderer unavailable');
 const core=own(chart,'orchestrator');if(own(core,'renderer')!==renderer)throw Error('Statistics chart/renderer ownership differs');
 const document=own(host,'document') as LosslessDrawingDocument,capture=method(host,'captureSource'),bind=method(host,'captureNativeOwner'),report=method(host,'reportUnavailable'),toSourceSlot=Object.getOwnPropertyDescriptor(host,'rendererRowToSource'),toSource=toSourceSlot?own(host,'rendererRowToSource') as Function:undefined;if(toSource!==undefined&&typeof toSource!=='function')throw Error('Statistics renderer time map unavailable');
 /** The projected renderer row in source time (the row itself without a time map). */
 const sourceRow=(row:Readonly<SerializedDrawing>):Readonly<SerializedDrawing>=>{if(Object.getOwnPropertyDescriptor(host,'rendererRowToSource')?.value!==toSource)throw Error('Statistics host changed');if(!toSource)return row;const mapped=Reflect.apply(toSource,host,[row]) as Readonly<SerializedDrawing>;if(mapped!==row&&(!mapped||typeof mapped!=='object'||mapped.id!==row.id||mapped.type!==row.type))throw Error('Statistics renderer time map changed row identity');return mapped;};
 const pipSizeOf=():number|null=>{const field=Object.getOwnPropertyDescriptor(host,'pipSize');if(!field||typeof field.value!=='function')return null;try{const value=Reflect.apply(field.value,host,[]);return typeof value==='number'?value:null;}catch{return null;}};
 let live=true,index:Index|undefined,diagnostics:ChartDiagnostic[]=[],reporting=false,diagnosticProof:(()=>void)|undefined;
 const installed=()=>{if(!live||own(chart,'orchestrator')!==core||own(core,'renderer')!==renderer)throw Error('Statistics installation retired');registration.assertCurrent();if(own(host,'document')!==document||method(document,'captureReadOnlyOwner')!==readonlyCapture||method(host,'captureSource')!==capture||method(host,'captureNativeOwner')!==bind||method(host,'reportUnavailable')!==report)throw Error('Statistics host changed');};
 const registration=registerOwnedTrendlineStatistics(renderer,{begin(kind,assertFrame,frameToken){
  let source:TrendlineStatisticsSource|undefined,cache:Index|undefined,candidateOwner:OwnedDrawingEditAcceptance|undefined,active=true,layout:(()=>void)|undefined,frameParts:OwnedStatisticsFrameParts|undefined,localLayout:(()=>void)|undefined;
  const base=()=>{if(!live||!active)throw Error('Statistics pass retired');registration.assertCurrent();assertFrame();if(own(host,'document')!==document||method(host,'captureSource')!==capture||method(host,'captureNativeOwner')!==bind||method(host,'reportUnavailable')!==report)throw Error('Statistics host changed');};
  const sourceCurrent=()=>{base();source!.assertCurrent();base();};
  const bindingSource=()=>{installed();source!.assertCurrent();cache!.owner.assertCurrent();installed();};
  const statisticsSource=()=>source!.assertCurrent();
  const current=()=>{if(!active||!source||!cache||!frameParts||!localLayout)throw Error('Statistics pass retired');installed();frameParts.assertSource(statisticsSource);cache.canonical();localLayout();installed();};
  const note=(error:unknown)=>{if(reporting)return;try{const owner=cache?.owner??candidateOwner;sourceCurrent();owner?.assertCurrent();const message=('Trendline statistics unavailable: '+String(error)).slice(0,700);sourceCurrent();owner?.assertCurrent();if(diagnostics.some(row=>row.message===message))return;diagnostics=[...diagnostics.slice(-15),{code:'TRENDLINE_STATS_UNAVAILABLE',feature:'Trendline statistics',severity:'unavailable',message}];const captured=source!;diagnosticProof=()=>{installed();captured.assertCurrent();owner?.assertCurrent();installed();};reporting=true;try{Reflect.apply(report,host,[message]);}finally{reporting=false;}sourceCurrent();owner?.assertCurrent();}catch{/* Diagnostic callbacks do not quarantine or publish through another owner. */}};
  try{
   base();source=Reflect.apply(capture,host,[]);sourceCurrent();
   if(index){try{index.owner.assertCurrent();if(index.source!==source!.identity)index=undefined;}catch{index=undefined;}}
   if(!index){if(method(document,'captureReadOnlyOwner')!==readonlyCapture)throw Error('Statistics canonical owner capture changed');const owner=Reflect.apply(readonlyCapture,document,[]) as OwnedDrawingEditAcceptance;const canonicalMethod=own(owner,'assertCurrent'),canonical=()=>Reflect.apply(canonicalMethod,owner,[]);candidateOwner=owner;diagnostics=[];diagnosticProof=undefined;sourceCurrent();canonical();const rows=document.all();canonical();sourceCurrent();if(rows.length>10000)throw Error('Statistics canonical drawing capacity exceeded');const configured:Index['rows']=new Map();
    for(const row of rows){if(row.type!=='trendline')continue;const state=readTrendlineStats(row.props);if(state.state==='unavailable'){note(state.message);continue;}const extras=readTrendlineMarkers(row.props),distance=extras.state==='supported'&&extras.settings.distance,angle=extras.state==='supported'&&extras.settings.angle,pips=extras.state==='supported'&&extras.settings.pips===true,base=state.state==='supported'?state.settings:TRENDLINE_STATS_DEFAULTS;if([base.priceRange,base.percentChange,base.barsRange,base.dateTimeRange,distance,angle,pips].some(Boolean))configured.set(String(row.id),{record:row as unknown as SerializedDrawing,settings:{...base,distance,angle,pips}});}
    canonical();sourceCurrent();index={owner,canonical,source:source!.identity,rows:configured,bindings:new WeakMap()};
   }
   cache=index;if(!cache.rows.size)return undefined;
   if(!frameToken)throw Error('Statistics owned frame token unavailable');frameParts=resolveOwnedStatisticsFrame(renderer,registration,frameToken);layout=captureNativeInlineLayoutOwner(renderer,source!.pricePaneId,sourceCurrent);localLayout=resolveNativeInlineLayoutOwner(layout,renderer,source!.pricePaneId,sourceCurrent);current();
  }catch(error){note(error);return undefined;}
  const pass:OwnedTrendlineStatisticsPass={paint(target,context,projector,theme){
   let native:(()=>void)|undefined,localNative:(()=>void)|undefined,localTarget:(()=>void)|undefined;
   const check=()=>{current();localNative?.();localTarget!();};
   try{
    localTarget=resolveOwnedStatisticsTarget(renderer,registration,frameToken!,target);check();const configured=cache!.rows.get(target.id);if(!configured)return;const settings=configured.settings;
    if(target.paneId!==source!.pricePaneId){note('Statistics currently require the main price pane.');return;}
    // The stats box always paints on the top drawings canvas, above the series. A trend line inside the
    // series stack (vela starts new drawings just under the candles) gets its box from the top-canvas overlay pass, never its slice.
    if(target.layer==='slice'||!settings.alwaysShow&&!target.selected)return;
    let binding=cache!.bindings.get(target.identity);
    if(binding&&binding.anchors.some((point,index)=>!Object.is(point.time,target.anchors[index].time)||!Object.is(point.price,target.anchors[index].price)))binding=undefined;
    if(binding){native=binding.native;localNative=binding.localNative;check();}
    else{
     const projected=sourceRow(target.projected());check();native=Reflect.apply(bind,host,[configured.record,projected,cache!.owner,bindingSource]);if(typeof native!=='function')throw Error('Statistics native binding unavailable');check();localNative=resolveTrendlineStatisticsNativeOwner(native,cache!.owner,bindingSource);check();
     const requested=(['priceRange','percentChange','barsRange','dateTimeRange'] as const).filter(key=>settings[key]) as TrendlineStatisticName[];
     let grid:TrendlineStatisticsGridRead|undefined;if(settings.barsRange||settings.distance){check();grid=source!.readGrid();check();}
     const result=calculateTrendlineStatistics(target.anchors,{requested,...(typeof source!.timezone==='string'?{timezone:source!.timezone}:{}),...(grid?.state==='available'?{grid:grid.grid}:{})});check();
     const distance=settings.distance?calculateTrendlineDistance(target.anchors,{...(grid?.state==='available'?{grid:grid.grid}:{})}):undefined;check();binding={native,localNative,anchors:target.anchors,lines:linesFor(result,settings,distance,target.anchors,sourceElapsedMs(projected),settings.pips?calculateChangeInPips(target.anchors,pipSizeOf()):undefined),settings};cache!.bindings.set(target.identity,binding);check();
    }
    paintBlock(target,context,projector,theme,binding.lines,binding.settings.position,check,binding.settings.angle);
   }catch(error){note(error);}
  },dispose(){active=false;}};
  return Object.freeze(pass);
 }});
 return Object.freeze({invalidate(){if(!live||own(chart,'orchestrator')!==core||own(core,'renderer')!==renderer)throw Error('Statistics installation retired');registration.assertCurrent();index=undefined;registration.invalidate();},diagnostics(){try{diagnosticProof?.();return live?diagnostics.map(row=>({...row})):[];}catch{return[];}},dispose(){if(!live)return;live=false;index=undefined;registration.dispose();}});
}

/** Block placement (fillText x of the centered lines, top of the first line) for a stats position. above/below are the
 * earlier OpenCandle positions (above / below the midpoint, unchanged). Center sits below the midpoint; Left / Right sit beside the
 * left / right end point, vertically centered on it; Auto is Right when the block fits inside the viewport width, else Left, else Center. */
export function trendlineStatsPlacement(position:TrendlineStatsPosition,points:readonly {x:number;y:number}[],widest:number,lines:number,width:number):{x:number;lineTop:number}{
 const mid={x:points[0].x/2+points[1].x/2,y:points[0].y/2+points[1].y/2},block=lines*16;
 const [left,right]=points[1].x<points[0].x?[points[1],points[0]]:[points[0],points[1]];
 const beside=(point:{x:number;y:number},side:1|-1)=>({x:point.x+side*(14+widest/2),lineTop:point.y-block/2});
 if(position==='above')return{x:mid.x,lineTop:mid.y-6-block};
 if(position==='left')return beside(left,-1);
 if(position==='right')return beside(right,1);
 if(position==='auto'){if(right.x+18+widest<=width)return beside(right,1);if(left.x-18-widest>=0)return beside(left,-1);}
 return{x:mid.x,lineTop:mid.y+6};
}
function paintBlock(target:OwnedTrendlineStatisticsTarget,ctx:CanvasRenderingContext2D,projector:Readonly<Data>,theme:Readonly<Data>,baseLines:readonly string[],position:TrendlineStatsPosition,check:()=>void,showAngle=false){
 const call=(object:object,key:string,args:unknown[])=>{check();const fn=method(object,key);check();const result=Reflect.apply(fn,object,args);check();return result;};
 const read=(object:object,key:string)=>{check();const value=Reflect.get(object,key,object);check();return value;};
 const write=(key:string,value:unknown)=>{check();if(!Reflect.set(ctx,key,value,ctx))throw Error('Statistics canvas state unavailable');check();};
 check();const width=own(projector,'width'),height=own(projector,'height');if(![width,height].every(value=>typeof value==='number'&&Number.isFinite(value)&&value>0))throw Error('Statistics viewport unavailable');
 const rect=call(projector,'paneRect',[target.paneId]);if(!rect)return;const top=own(rect,'top'),paneHeight=own(rect,'height'),bottom=top+paneHeight;if(![top,paneHeight,bottom].every(Number.isFinite)||paneHeight<=0)return;
 const clipTop=Math.max(0,top),clipBottom=Math.min(height,bottom);if(clipBottom<=clipTop)return;
 const points=target.anchors.map(point=>({x:call(projector,'xOf',[point.time]),y:call(projector,'yOf',[point.price,target.paneId])}));if(points.some(point=>typeof point.x!=='number'||typeof point.y!=='number'||!Number.isFinite(point.x)||!Number.isFinite(point.y)))throw Error('Statistics projected anchors unavailable');
 // The angle is read from the projected screen points on every paint, so a viewport change recomputes it.
 let lines=baseLines;
 if(showAngle){const angle=calculateTrendlineAngle(points[0],points[1]);lines=Object.freeze([...baseLines,angle.state==='available'?'Angle: '+number(Number(angle.value.toFixed(2)))+' deg':'Angle: '+NA]);}
 // The bound applies to the final list, angle line included.
 if(lines.length>6||lines.reduce((count,line)=>count+line.length,0)>768)throw Error('Statistics label exceeds the six-line/768-unit display bound');
 const y=points[0].y/2+points[1].y/2;
 const family=own(theme,'fontFamily'),background=own(theme,'background'),color=own(theme,'textColor');if([family,background,color].some(value=>typeof value!=='string'||value.length>4096))throw Error('Statistics text theme unavailable');
 check();const restore=method(ctx,'restore');check();let saved=false,problem:unknown;
 try{
  check();const save=method(ctx,'save');check();saved=true;Reflect.apply(save,ctx,[]);check();write('font','12px '+family);write('textAlign','center');write('textBaseline','top');
  let widest=0;for(const line of lines){const metrics=call(ctx,'measureText',[line]),value=read(metrics,'width');if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error('Statistics measurement unavailable');widest=Math.max(widest,value);}
  const placed=trendlineStatsPlacement(position,points,widest,lines.length,width),lineTop=placed.lineTop;
  // The block stays inside the pane width (it ran past the price axis).
  const x=widest+8>=width?width/2:Math.min(Math.max(placed.x,widest/2+4),width-widest/2-4);
  const left=x-widest/2-4,boxTop=lineTop-4,boxWidth=widest+8,boxHeight=lines.length*16+8;if(![x,y,lineTop,left,boxTop,boxWidth,boxHeight].every(Number.isFinite))throw Error('Statistics block geometry is not finite');
  call(ctx,'beginPath',[]);call(ctx,'rect',[0,clipTop,width,clipBottom-clipTop]);call(ctx,'clip',[]);
  // A visible label box (translucent fill and a faint border) instead of an opaque patch in the chart colour.
  const alpha=read(ctx,'globalAlpha'),base=typeof alpha==='number'&&Number.isFinite(alpha)?alpha:1;
  write('globalAlpha',base*0.9);write('fillStyle',background);call(ctx,'fillRect',[left,boxTop,boxWidth,boxHeight]);
  write('globalAlpha',base*0.4);write('strokeStyle',color);write('lineWidth',1);call(ctx,'beginPath',[]);call(ctx,'rect',[Math.round(left)+0.5,Math.round(boxTop)+0.5,Math.round(boxWidth),Math.round(boxHeight)]);call(ctx,'stroke',[]);
  write('globalAlpha',base);write('fillStyle',color);
  for(let index=0;index<lines.length;index++)call(ctx,'fillText',[lines[index],x,lineTop+index*16]);
 }catch(error){problem=error;}
 finally{if(saved)try{Reflect.apply(restore,ctx,[]);}catch(cleanup){problem=problem===undefined?cleanup:new AggregateError([problem,cleanup],'Statistics paint and owned canvas cleanup failed');}}
 if(problem!==undefined)throw problem;check();
}
