import {seasonalityShapes,seasonalityNativeSeries,type SeasonalityDisplay} from './seasonality-presentation';
import type {BuiltinNumericDraft} from './builtin-presentation-proof';
import {tradingSessionShapes} from './trading-sessions-presentation';
import {assertProfilePrimarySource,assertCurrentProfilePrimarySource,type ProfilePrimarySource} from './vp-visible-range-ltf';
import {sessionRequestSource} from './source-context';
import type {NativeIndicatorOutput,LineLikeSeries,PriceLine,Fill,DrawingLabel,DrawingLine,DrawingBox,Background,CandleSeries,CandleBarColor} from '@luxalgo/vela';
import type {Bar} from '../domain/types';
import {vwapAnchorKeys,vwapAnchorZone,type IndicatorResult} from '../domain/indicators';
import {twapPeriodKey} from '../domain/indicators-ext/ind1028-catalog';
import {assertIndicatorBatchBudget,validateIndicatorSettings,indicatorPlotIds,type IndicatorInstanceSettings,type IndicatorPlotStyle,pointPaletteColors} from './indicator-settings';
import {defaultPlotStyle,indicatorDisplayTime,renderIndicatorSeries} from './indicator-rendering';
import {indicatorColorOpacity} from './indicator-opacity';
import {parseInterval} from '../domain/intervals';
import {assertIndicatorRecord} from './indicator-settings';
import type {IndicatorDisplayPlot} from './indicator-display-source';
import type {IndicatorPrecision} from './indicator-number-format';
import {indicatorIntervalVisibility} from './indicator-visibility';
import {applyIndicatorVolumePalette} from './indicator-volume-palette';
import {catalogDefinition,catalogInputValue} from '../domain/indicator-catalog';
import {effectiveIndicatorVisible} from './indicator-hide-overlay';
import {pocExtensionLines,profileDetailNotice,profileFinerNotice,profilesBoxes,type VpBoxSettings,type VpRowColors} from './vp-visible-range-presentation';
import {VP_DETAIL_NOTICE_IDS} from '../domain/indicators-ext/vp-catalog';
import {VP_FILL_DEFAULTS,isVpFillId,type VpFillId} from './indicator-settings';
import {indicatorTimeframeOf} from './indicator-timeframe';
import {volumeDeltaCandleSeries,upDownDeltaLines} from './volume-delta-presentation';
import {isSwingMarkerKind,swingMarkerLabels,SWING_MARKER_POLICY} from './swing-marker-presentation';
import {PATTERN_MARKS_POLICY} from '../domain/indicators-ext/patterns-catalog';
import {RSI_ZONE_GUIDES,defaultIndicatorPresentation} from './indicator-settings';
import {RSI_DIVERGENCE_LABELS,RSI_DIVERGENCE_PLOT_OF,rsiDivergenceSettings,rsiDivergencePivotPrice,rsiDivergenceIsBullish} from '../domain/rsi-divergence';

/** Separate namespace from stableSeriesId's numerical plots; every reference stays instance-owned. */
export const indicatorDecorationId=(instance:string,role:string)=>`lv-decoration:${JSON.stringify([instance,role])}`;
export interface IndicatorNativePresentation {output:NativeIndicatorOutput;display:readonly IndicatorDisplayPlot[];precision:IndicatorPrecision;diagnostics:string[];policies:string[]}
/** hideOverlay: the toolbar Hide indicators overlay . It hides native output only; stored settings, calculations and alerts are untouched. */
/** calendar: the chart source's session calendar for period-based kinds (pivots); absent = unknown, the kind infers it from the bars. */
/** tickSize and instrument: the source instrument's tick size and id, for the profile kinds (Ticks Per Row, lower-timeframe bars). */
/** Renderer-only, exact per-model incarnation. Never serialized or used as data-source authority. */
export interface IndicatorPresentationOwner {readonly instanceOwner:object;readonly nativeId:string|null;readonly nativeIncarnation:object|null;assertCurrent():void}
export interface IndicatorPresentationContext {/** Absent is the legacy pure ordinary-axis contract; production always supplies a boolean or explicit unknown. */paneInverted?:boolean|null;requestSource?:import('./source-context').ChartSourceContext;profileSource?:ProfilePrimarySource;resolution:string|null;exchangeZone?:string;style?:string;hideOverlay?:boolean;calendar?:'us-equity'|'utc';tickSize?:number;instrument?:string;/** The chart dataset the profile finer-bar lookup starts from. */datasetId?:string}
/** The stroke color into the first point of a new period for segmented kinds (transparent, so periods do not join). */
export const SEGMENT_BREAK_COLOR='rgba(0,0,0,0)';
export const SEGMENT_POLICY='Each level is drawn as one horizontal segment per period: the stroke into the first bar of a new period is transparent. Every bar keeps its numerical value.';
export const TWO_COLOR_POLICY='The cloud segment from one bar to the next uses the first bar\'s state: the bullish background where Leading span A is above Leading span B, the bearish background otherwise. A hidden background leaves its bars unfilled.';
/** Projected plots (Ichimoku leading spans) continue past the last loaded bar on the chart only. */
export const PROJECTION_POLICY='Projected values are drawn in the empty slots past the last loaded bar, one bar apart at the latest bar spacing. They are chart display only: the data window, legend values, price scale labels and alerts use the loaded bars.';
/** Per-bar palette colors (display only). */
/** Bollinger Bands color by expansion: the contracting color (expanding bars keep the band's own Style color). */
export const BB_CONTRACTION_COLOR='#8a92a6';
export const BB_EXPANSION_POLICY='Color by expansion: the upper and lower bands keep their own color where the band width (upper - lower) is above its previous value and turn grey where it is not (equal widths and the first value after a gap are contracting). Chart display only.';
export const POINT_PALETTE_POLICY='Per-bar colors come from the calculated values and are chart display only. They use the plot opacity; a bar without a state keeps the plot color.';
/** The RSI-based MA two-color line. */
export const RSI_MA_PALETTE_POLICY='The RSI-based MA uses the rising color where it is above its previous value and the falling color otherwise (equal values and the first value after a gap are falling). Colors are chart display only.';
export const RSI_DIVERGENCE_DECORATION_POLICY='Divergence lines on the price pane join the two price pivots (wick, or candle body with Candle body only); a divergence background marks the later pivot bar. Both are chart display only and appear only once the divergence is confirmed.';
export const INDICATOR_TRACKING_POLICY='Tracking strokes use the exact latest supplied endpoint, independent of display offset. Automatic labels require the separately owned OpenCandle indicator display helper.';
export const ANCHOR_RESET_POLICY='The line breaks where the anchor period resets: no stroke joins the last value of one period to the first value of the next.';
/** Bar indices (above 0) where an anchored average starts a new period, or null when the kind has no calendar anchor. */
export function anchoredResets(settings:IndicatorInstanceSettings,bars:readonly Bar[],context?:IndicatorPresentationContext):number[]|null{
 if(settings.kind!=='vwap'&&settings.kind!=='twap'||bars.length<2)return null;
 let keys:string[];
 try{
  if(settings.kind==='twap')keys=bars.map(bar=>twapPeriodKey(bar.time,String(catalogInputValue(catalogDefinition('twap')!,settings.inputs,'anchor')),context?.calendar==='us-equity'?'America/New_York':'UTC'));
  else keys=vwapAnchorKeys(bars,String(settings.inputs.anchor??'Session'),vwapAnchorZone(settings.inputs.timezone,{exchangeZone:context?.exchangeZone,calendar:context?.calendar}),null);
 }catch{return null;}// Event anchors need corporate-action dates the display does not hold; the line stays joined.
 const out:number[]=[];for(let i=1;i<keys.length;i++)if(keys[i]!==keys[i-1])out.push(i);return out;
}
/** Pivot points: each visible level is named (P, R1, S1, ...) at the left end of every period segment, in its own color. */
export function pivotLevelLabels(instanceId:string,result:IndicatorResult,bars:readonly Bar[],plotStyle:(id:string)=>IndicatorPlotStyle):DrawingLabel[]{
 const labels:DrawingLabel[]=[];
 for(const plot of result.series){
  const style=plotStyle(plot.id);if(!style.visible)continue;const color=indicatorColorOpacity(style.color,style.opacity??100);
  for(let i=0;i<plot.values.length&&i<bars.length;i++){
   const value=plot.values[i];if(value===null||!Number.isFinite(value)||plot.values[i-1]===value)continue;
   labels.push({id:indicatorDecorationId(instanceId,`pivot:${plot.id}:${bars[i].time}`),paneId:'',xloc:'bar_time',x:bars[i].time*1000,y:value,yloc:'price',text:plot.label,style:'label_right',color:'rgba(0,0,0,0)',textColor:color,size:'small',textAlign:'right',tooltip:`${plot.label} ${value}`,fontFamily:'default',noFill:true} as DrawingLabel);
  }
 }
 return labels;
}
export function validateIndicatorPresentationContext(context:IndicatorPresentationContext|undefined):void{
 if(context!==undefined){assertIndicatorRecord(context);if(context.requestSource!==undefined){sessionRequestSource(context.requestSource);}if(context.profileSource!==undefined){assertProfilePrimarySource(context.profileSource);}if(Object.keys(context).some(key=>key!=='resolution'&&key!=='hideOverlay'&&key!=='calendar'&&key!=='tickSize'&&key!=='instrument'&&key!=='datasetId'&&key!=='requestSource'&&key!=='profileSource'&&key!=='exchangeZone'&&key!=='style'&&key!=='paneInverted')||context.paneInverted!==undefined&&context.paneInverted!==null&&typeof context.paneInverted!=='boolean'||context.exchangeZone!==undefined&&!(typeof context.exchangeZone==='string'&&context.exchangeZone.length>0&&context.exchangeZone.length<=80)||context.style!==undefined&&!(typeof context.style==='string'&&context.style.length>0&&context.style.length<=40)||context.datasetId!==undefined&&!(typeof context.datasetId==='string'&&context.datasetId.length>0&&context.datasetId.length<=4096)||context.tickSize!==undefined&&!(typeof context.tickSize==='number'&&Number.isFinite(context.tickSize)&&context.tickSize>0)||context.instrument!==undefined&&!(typeof context.instrument==='string'&&context.instrument.length>0&&context.instrument.length<=4096)||!Object.hasOwn(context,'resolution')||context.hideOverlay!==undefined&&typeof context.hideOverlay!=='boolean'||context.calendar!==undefined&&context.calendar!=='us-equity'&&context.calendar!=='utc'||context.resolution!==null&&(typeof context.resolution!=='string'||context.resolution.length>40))throw new Error('Indicator presentation requires an exact bounded declared resolution.');}
}
/** Shared bounded endpoint metadata; no historical scan or numerical mutation. */
export function appendIndicatorEndpointPresentation(instanceId:string,plot:{id:string;label:string},native:LineLikeSeries,style:IndicatorPlotStyle,endpoint:number|null|undefined,color:string,trackingColor:string,display:IndicatorDisplayPlot[],priceLines:PriceLine[]):void{
 if(style.visible&&style.priceScale&&endpoint!==null&&endpoint!==undefined&&Number.isFinite(endpoint))display.push(Object.freeze({id:plot.id,nativeId:native.id,value:endpoint,color}));
 if(style.visible&&style.trackPrice&&endpoint!==null&&endpoint!==undefined&&Number.isFinite(endpoint))priceLines.push({id:indicatorDecorationId(instanceId,`track:${plot.id}`),paneId:'',price:endpoint,color:trackingColor,width:style.width,lineStyle:style.lineStyle,title:`${plot.label}: latest supplied value`});
}
export function renderIndicatorPresentation(settings:IndicatorInstanceSettings,result:IndicatorResult,bars:readonly Bar[],context?:IndicatorPresentationContext,readout?:BuiltinNumericDraft):IndicatorNativePresentation{
 validateIndicatorSettings(settings);assertIndicatorBatchBudget([settings],bars.length);
 const diagnostics:string[]=[],policies:string[]=[];
 const presentation=settings.presentation,precision=presentation?.precision??'auto';
 validateIndicatorPresentationContext(context);
 if(!effectiveIndicatorVisible(settings.visible,context?.hideOverlay===true))return {output:{series:[],fills:[],priceLines:[]},display:[],precision,diagnostics,policies};
 const visibility=indicatorIntervalVisibility(presentation?.visibility,context?.resolution);
 if(presentation?.visibility)policies.push('Interval visibility uses only the committed declared resolution and hides native output. Calculations, numerical inspection and frozen alerts retain their underlying values.');
 if(!visibility.visible){if(visibility.diagnostic)diagnostics.push(visibility.diagnostic);return {output:{series:[],fills:[],priceLines:[]},display:[],precision,diagnostics,policies};}
 if(settings.kind==='vwap'&&presentation?.hideOnDaily){
  policies.push('Hide on daily and above uses the exact declared interval family. It hides native output only; numerical values and frozen alerts remain available.');
  try{if(context?.resolution===undefined||context.resolution===null)throw new Error('The committed source has no declared resolution.');const interval=parseInterval(context.resolution);if(interval.kind!=='time')throw new Error('Tick/range classification is unavailable for this hide rule.');if(['day','week','month'].includes(interval.unit))return {output:{series:[],fills:[],priceLines:[]},display:[],precision,diagnostics,policies};}
  catch(error){diagnostics.push('VWAP native output is withheld because Hide on daily and above cannot classify this source. '+(error instanceof Error?error.message:String(error)));return {output:{series:[],fills:[],priceLines:[]},display:[],precision,diagnostics,policies};}
 }
 if(catalogDefinition(settings.kind)?.profile&&context?.profileSource)assertCurrentProfilePrimarySource(context.profileSource);
 const series=catalogDefinition(settings.kind)?.seasonality?seasonalityNativeSeries(settings,result):renderIndicatorSeries(settings.id,settings.kind,result,bars,settings.plots,settings.offset,readout),fills:Fill[]=[],priceLines:PriceLine[]=[],display:IndicatorDisplayPlot[]=[];
 if(catalogDefinition(settings.kind)?.seasonality){
  if(!result.seasonality)return {output:{series:[],fills:[],priceLines:[]},display:[],precision,diagnostics:['Seasonality is waiting for its owned original source calculation.'],policies};
  const definition=catalogDefinition(settings.kind)!,get=(key:string)=>catalogInputValue(definition,settings.inputs,key);
  const shapes=seasonalityShapes(result.seasonality,{positiveColor:get('positiveColor'),negativeColor:get('negativeColor'),intensityCutoff:get('intensityCutoff'),tablePosition:get('tablePosition'),tableWidth:get('tableWidth'),tableHeight:get('tableHeight'),meanRow:get('meanRow'),deviationRow:get('deviationRow'),positiveFrequencyRow:get('positiveFrequencyRow'),projectionGeometry:get('projectionGeometry')} as SeasonalityDisplay,role=>indicatorDecorationId(settings.id,'seasonality:'+role));
  for(let index=0;index<series.length;index++){const style=settings.plots[result.series[index].id]??defaultPlotStyle(settings.kind,result.series[index].id,index);series[index].visible=false;series[index].display={pane:false,priceScale:false,legend:style.visible&&style.legend,dataWindow:style.visible&&style.dataWindow};}
  return {output:{series,fills,priceLines,...shapes},display:[],precision,diagnostics,policies};
 }
 const plotStyle=(id:string):IndicatorPlotStyle=>Object.hasOwn(settings.plots,id)?settings.plots[id]:defaultPlotStyle(settings.kind,id,indicatorPlotIds[settings.kind].indexOf(id));
 const patternKind=catalogDefinition(settings.kind)?.pattern!==undefined;
 for(let index=0;index<result.series.length;index++){
  const plot=result.series[index],style=plotStyle(plot.id),native=series[index];
  // A pattern kind's 0/1 signal plots are never stroked or scaled; the markers below draw them.
  if(patternKind&&!catalogDefinition(settings.kind)?.linePlots?.includes(plot.id)||catalogDefinition(settings.kind)?.tradingSessions){native.visible=false;native.display={pane:false,priceScale:false,legend:style.legend,dataWindow:style.dataWindow};continue;}
  // Swing points (fractals, pivot highs/lows) draw as labels beside the bar below; the sparse cross plot stays readable only.
  if(isSwingMarkerKind(settings.kind)){native.display={...native.display,pane:false,priceScale:false};continue;}
  // OHLC scalars remain in the legend/data window, while a native candle paints the path.
  if(catalogDefinition(settings.kind)?.volumeDelta||settings.kind==='updownvolume'&&plot.id==='delta'){native.display={...native.display,pane:false};}
  const directionalVolume=settings.kind==='volume'&&plot.id==='volume'&&presentation?.volumePalette!==undefined&&presentation.volumePalette.mode!=='uniform';
  if(directionalVolume){
   const colored=applyIndicatorVolumePalette(native.points,bars,presentation!.volumePalette!,style.opacity??100);
   if(colored.unavailable)diagnostics.push(`Volume direction color is unavailable for ${colored.unavailable} supplied point(s) because a required current or immediately preceding price is missing or nonfinite. Only those rendered Volume points are withheld; numerical Volume and MA values remain available.`);
   policies.push('Volume direction uses the exact supplied calculation prefix. Equality uses up; the first previous-close sample uses its own open/close. No earlier-price search or raw-price substitution is performed.');
  }
  if(plot.id==='histogram'&&presentation?.histogramPalette){
   const source=presentation.histogramPalette,palette={nonnegativeRising:indicatorColorOpacity(source.nonnegativeRising,style.opacity??100),nonnegativeFalling:indicatorColorOpacity(source.nonnegativeFalling,style.opacity??100),negativeRising:indicatorColorOpacity(source.negativeRising,style.opacity??100),negativeFalling:indicatorColorOpacity(source.negativeFalling,style.opacity??100)};let previous:number|null=null;
   native.points.forEach((point,ordinal)=>{const value=plot.values[ordinal];if(value===null){previous=null;return;}
    const rising=previous!==null&&value>previous,color=value>=0?(rising?palette.nonnegativeRising:palette.nonnegativeFalling):(rising?palette.negativeRising:palette.negativeFalling);
    point.color=color;previous=value;
   });
   policies.push('Histogram equality and the first value after a gap use the falling palette; zero is nonnegative.');
  }
  if(settings.kind==='bb'&&(plot.id==='upper'||plot.id==='lower')&&settings.inputs.colorByExpansion===true){
   const upper=result.series.find(row=>row.id==='upper')?.values??[],lower=result.series.find(row=>row.id==='lower')?.values??[],contracting=indicatorColorOpacity(BB_CONTRACTION_COLOR,style.opacity??100);
   const width=(i:number)=>{const a=upper[i],b=lower[i];return typeof a==='number'&&typeof b==='number'?a-b:null;};
   native.points.forEach((point,ordinal)=>{const now=width(ordinal),before=ordinal>0?width(ordinal-1):null;if(now===null)return;if(before===null||!(now>before))point.color=contracting;});
   if(plot.id==='upper')policies.push(BB_EXPANSION_POLICY);
  }
  // The RSI-based MA (smoothing line) colored by direction when the RSI carries a MA palette (new RSIs).
  if(settings.kind==='rsi'&&plot.id==='smooth'&&presentation?.maPalette){
   const rising=indicatorColorOpacity(presentation.maPalette.rising,style.opacity??100),falling=indicatorColorOpacity(presentation.maPalette.falling,style.opacity??100);let previous:number|null=null;
   native.points.forEach((point,ordinal)=>{const value=plot.values[ordinal];if(value===null||value===undefined){previous=null;return;}point.color=previous!==null&&value>previous?rising:falling;previous=value;});
   policies.push(RSI_MA_PALETTE_POLICY);
  }
  // Per-bar palette of one catalog plot (Woodies trend, Chop zone), from the drawn values.
  const palette=catalogDefinition(settings.kind)?.pointPalette;
  if(palette&&plot.id===palette.plot){
   const states=palette.state(id=>result.series.find(row=>row.id===id)?.values??[]),colors=pointPaletteColors(settings.kind,presentation);
   native.points.forEach((point,ordinal)=>{const state=states[ordinal];if(state!==null&&state!==undefined&&colors[state])point.color=indicatorColorOpacity(colors[state],style.opacity??100);});
   policies.push(POINT_PALETTE_POLICY);
  }
  const endpoint=directionalVolume?native.points.at(-1)?.value:plot.values.at(-1);
  appendIndicatorEndpointPresentation(settings.id,plot,native,style,endpoint,native.points.at(-1)?.color??native.style.color,directionalVolume?native.points.at(-1)?.color??native.style.color:indicatorColorOpacity(style.color,style.opacity??100),display,priceLines);
 }
 const definition=catalogDefinition(settings.kind);
 // Projected values continue each plot's points past the last bar, on the same extrapolated time grid.
 const projection=bars.length?result.projection:undefined,futureTime=(ordinal:number)=>indicatorDisplayTime(bars,ordinal+settings.offset)*1000;
 if(projection&&result.series.some(plot=>projection[plot.id]?.length)){
  result.series.forEach((plot,index)=>{const extra=projection[plot.id];if(extra)extra.forEach((value,k)=>series[index].points.push({time:futureTime(bars.length+k),value}));});
  policies.push(PROJECTION_POLICY);
 }
 // Segmented kinds (pivots): a value change starts a new period. The renderer strokes the segment into a point with
 // that point's color, so a transparent color there removes only the joining stroke; every bar keeps its value.
 if(definition?.segmented){
  // Continuous plots (developing levels) break only where a profile starts.
  const starts=new Set((result.profiles??[]).map(p=>p.from).filter(from=>from>0));
  result.series.forEach((plot,index)=>{const points=series[index].points;if(definition.continuousPlots?.includes(plot.id)){for(const i of starts)if(plot.values[i-1]!==null&&plot.values[i]!==null)points[i].color=SEGMENT_BREAK_COLOR;return;}for(let i=1;i<plot.values.length;i++){const a=plot.values[i-1],b=plot.values[i];if(a!==null&&b!==null&&a!==b)points[i].color=SEGMENT_BREAK_COLOR;}});
  policies.push(SEGMENT_POLICY);
 }
 // Anchored averages (VWAP, TWAP) restart at each anchor period: the stroke into a period's first bar is transparent, so
 // the line breaks at the reset instead of drawing a vertical connector from the old period's level to the new one.
 const resets=anchoredResets(settings,bars,context);
 if(resets){for(const native of series)for(const i of resets){const a=native.points[i-1],b=native.points[i];if(a&&b&&a.value!==null&&b.value!==null)b.color=SEGMENT_BREAK_COLOR;}policies.push(ANCHOR_RESET_POLICY);}
 const levelLabels=settings.kind==='pivots'?pivotLevelLabels(settings.id,result,bars,plotStyle):[];
 const zoneBoxes:DrawingBox[]=[];
 if(presentation){
  for(const [id,guide]of Object.entries(presentation.guides))if(guide!.visible)priceLines.push({id:indicatorDecorationId(settings.id,`guide:${id}`),paneId:'',price:guide!.value,color:guide!.color,width:guide!.width,lineStyle:guide!.lineStyle});
  // Two-color band (Ichimoku cloud): 'band' draws both colors; its 'bearish' companion only supplies the second style.
  const bearish=definition?.bearishFill?presentation.fills.bearish:undefined;
  for(const [id,fill]of Object.entries(presentation.fills)){
   if(isVpFillId(id))continue;// Histogram row colors, used by the profile boxes below
   if(definition?.bearishFill&&id==='bearish')continue;
   if(!fill!.visible&&!(id==='band'&&bearish?.visible))continue;
   // Smoothing bands exist only for SMA+BB. Keep their saved style for later use,
   // but an inactive add-on is not a missing-data error (matching the render budget).
   if(id==='smoothing'&&settings.inputs.smoothingType!=='SMA+BB')continue;
   let boundaries:Array<Array<number|null>>|null=null;
   if(id==='band'&&(['rsi','stochastic'].includes(settings.kind)||catalogDefinition(settings.kind)?.band==='guides')){const {upper,lower}=presentation.guides;if(upper&&lower)boundaries=[bars.map(()=>lower.value),bars.map(()=>upper.value)];}
   // A zone fill spans its two boundary guides (their values; a hidden guide line still bounds its zone).
   // A zone between two constant levels is one native box extended both ways (constant cost, no per-bar anchors).
   else if(settings.kind==='rsi'&&(id==='bullZone'||id==='bearZone')){const [a,b]=RSI_ZONE_GUIDES[id].map(guide=>presentation.guides[guide]??defaultIndicatorPresentation('rsi').guides[guide]!);if(bars.length)zoneBoxes.push(rsiZoneBox(indicatorDecorationId(settings.id,`fill:${id}`),bars,Math.max(a.value,b.value),Math.min(a.value,b.value),indicatorColorOpacity(fill!.color,fill!.opacity)));continue;}
   else{const names=id==='smoothing'?['smoothLower','smoothUpper']:/^band[123]$/.test(id)?['lower'+id.at(-1),'upper'+id.at(-1)]:['lower','upper'];const plots=names.map(name=>result.series.find(plot=>plot.id===name));if(settings.kind==='vwap'&&!plots.some(Boolean))continue;if(plots.every(Boolean)&&(settings.kind==='vwap'||!names.some(name=>result.plotDiagnostics?.[name]?.length))){const extra=plots.map(plot=>projection?.[plot!.id]??[]);const length=extra.every(values=>values.length===extra[0].length)?extra[0].length:0;boundaries=plots.map((plot,index)=>length?[...plot!.values,...extra[index]]:plot!.values);}}
   if(!boundaries){diagnostics.push(`${id} fill is unavailable because its required boundaries are absent or unavailable.`);continue;}
   // Use the identical numerical point-time mapper, including display offset and sparse gaps.
   const reference=series[0];if(!reference&&bars.length){diagnostics.push(`${id} fill is unavailable because no numerical time grid was emitted.`);continue;}
   const anchors=boundaries.map((values,index)=>({id:indicatorDecorationId(settings.id,`fill:${id}:${index}`),title:'',paneId:'',kind:'line',visible:true,
    display:{pane:true,priceScale:false,legend:false,dataWindow:false},points:values.map((value,ordinal)=>({time:ordinal<bars.length?reference.points[ordinal].time:futureTime(ordinal),value})),style:{color:'rgba(0,0,0,0)',width:1,lineStyle:'solid'}} as LineLikeSeries));
   series.push(...anchors);const band:Fill={id:indicatorDecorationId(settings.id,`fill:${id}`),paneId:'',fromSeriesId:anchors[0].id,toSeriesId:anchors[1].id,color:indicatorColorOpacity(fill!.color,fill!.opacity)};
   if(definition?.bearishFill&&id==='band'){
    // The segment from bar k to k + 1 takes bar k's state: bullish where upper (span A) is above lower (span B), bearish otherwise.
    const [lower,upper]=boundaries,bull=fill!.visible?band.color!:null,bear=bearish?.visible?indicatorColorOpacity(bearish.color,bearish.opacity):null;
    band.colors=upper.map((value,ordinal)=>{const other=lower[ordinal];return value===null||other===null?null:value>other?bull:bear;});
    policies.push(TWO_COLOR_POLICY);
   }
   fills.push(band);
  }
 }
 if(priceLines.some(line=>line.id.includes('track:')))policies.push(INDICATOR_TRACKING_POLICY);
 // Vela 0.8.4's actual Canvas/GL geometry and readout paths index dense points;
 // their time field alone does not shift them. Keep numerical results unchanged.
 if(settings.offset!==0&&bars.length){
  for(const plot of series)plot.points=settings.offset>0?[...Array.from({length:settings.offset},(_,index)=>({time:indicatorDisplayTime(bars,index)*1000,value:null})),...plot.points]:plot.points.slice(-settings.offset);
  // Per-bar fill colors index the same dense anchor points, so they shift with them.
  for(const fill of fills)if(fill.colors)fill.colors=settings.offset>0?[...Array.from({length:settings.offset},()=>null),...fill.colors]:fill.colors.slice(-settings.offset);
  diagnostics.push('Offset plots and fills are shifted by whole bars. A positive offset draws its latest values in the empty space past the last loaded bar.');
  policies.push('Native display offsets shift dense point ordinals only; numerical values and alert signals are unchanged.');
 }
 // Profile kinds add their histogram rows as native boxes. They follow the chart bars only, so an own timeframe or a display offset draws no histogram.
 if(definition?.profile&&result.profiles){
  if(indicatorTimeframeOf(presentation).interval!==null)diagnostics.push('The profile histogram draws on the chart timeframe only. Choose the Chart timeframe to see it.');
  else if(settings.offset!==0)diagnostics.push('The profile histogram is not drawn with a display offset. Set the offset to 0 to see it.');
  else{
   // Style tab row colors, row volume labels and Extend POC right.
   const rowColor=(id:VpFillId)=>{const style=presentation?.fills[id]??VP_FILL_DEFAULTS[id];return style.visible?indicatorColorOpacity(style.color,style.opacity):null;};
   const colors:VpRowColors={up:rowColor('vpUp'),down:rowColor('vpDown'),valueUp:rowColor('vpValueUp'),valueDown:rowColor('vpValueDown')};
   // Say when the histogram fell back to each bar's own range.
   const notice=profileFinerNotice(result.profiles)??((VP_DETAIL_NOTICE_IDS as readonly string[]).includes(settings.kind)?profileDetailNotice(result.profiles):null);if(notice)diagnostics.push(notice);
   const drawn=profilesBoxes(result.profiles,{volume:catalogInputValue(definition,settings.inputs,'volume'),placement:catalogInputValue(definition,settings.inputs,'placement'),widthPct:catalogInputValue(definition,settings.inputs,'widthPct'),colors,rowValues:catalogInputValue(definition,settings.inputs,'rowValues')===true} as VpBoxSettings,role=>indicatorDecorationId(settings.id,role));diagnostics.push(...drawn.diagnostics);
   const poc=plotStyle('poc'),lines=catalogInputValue(definition,settings.inputs,'extendPocRight')===true&&poc.visible?pocExtensionLines(result.profiles,bars,definition.viewport===true,{color:indicatorColorOpacity(poc.color,poc.opacity??100),width:poc.width,lineStyle:poc.lineStyle},role=>indicatorDecorationId(settings.id,role)):[];
   return {output:{series,fills,priceLines,boxes:drawn.boxes,...(drawn.labels.length?{labels:drawn.labels}:{}),...(lines.length?{lines}:{})},display:Object.freeze(display),precision,diagnostics,policies};
  }
 }
 if(definition?.tradingSessions){
  if(settings.offset!==0||indicatorTimeframeOf(presentation).interval!==null){diagnostics.push('Trading session decorations require the Chart timeframe and an offset of 0.');return {output:{series,fills,priceLines},display:Object.freeze(display),precision,diagnostics,policies};}
  if(context?.paneInverted===null)diagnostics.push('Trading session label placement is unavailable until its chart pane is ready.');
  const flag=(key:string)=>catalogInputValue(definition,settings.inputs,key)===true,drawn=tradingSessionShapes(result.sessions??[],{showNames:flag('showNames'),showOpenClose:flag('showOpenClose'),showRange:flag('showRange'),showAverage:flag('showAverage'),visible:window=>plotStyle(`session${window+1}`).visible,labelInverted:context?.paneInverted},role=>indicatorDecorationId(settings.id,role));
  return {output:{series,fills,priceLines,...drawn},display:Object.freeze(display),precision,diagnostics,policies};
 }
 if(settings.kind==='updownvolume')return {output:{series,fills,priceLines,lines:upDownDeltaLines(settings,result,bars)},display:Object.freeze(display),precision,diagnostics,policies};
 if(catalogDefinition(settings.kind)?.volumeDelta)return {output:{series:[...series,volumeDeltaCandleSeries(settings,result,bars)],fills,priceLines},display:Object.freeze(display),precision,diagnostics,policies};
 if(settings.kind==='rsi'){
  const labels=result.divergence?rsiDivergenceLabelsNative(settings,result,bars,plotStyle):[],lines=result.divergence?rsiDivergencePriceLinesNative(settings,result,bars,plotStyle):[],backgrounds=result.divergence?rsiDivergenceBackgroundsNative(settings,result,bars,plotStyle):[];
  if(lines.length||backgrounds.length)policies.push(RSI_DIVERGENCE_DECORATION_POLICY);
  if(result.divergence?.forming){const forming=rsiFormingDivergenceNative(settings,result,bars,plotStyle);lines.push(...forming.lines);labels.push(...forming.labels);if(forming.lines.length)policies.push(RSI_FORMING_DIVERGENCE_POLICY);}
  const headroom=rsiDivergenceLabelHeadroom(settings.id,labels,series[0]);if(headroom)series.push(headroom);
  if(zoneBoxes.length||labels.length||lines.length||backgrounds.length)return {output:{series,fills,priceLines,...(zoneBoxes.length?{boxes:zoneBoxes}:{}),...(backgrounds.length?{backgrounds}:{}),...(labels.length?{labels}:{}),...(lines.length?{lines}:{})},display:Object.freeze(display),precision,diagnostics,policies};
 }
 if(levelLabels.length&&settings.offset===0)return {output:{series,fills,priceLines,labels:levelLabels},display:Object.freeze(display),precision,diagnostics,policies};
 if(isSwingMarkerKind(settings.kind)&&settings.offset===0){const labels=swingMarkerLabels(settings.kind,result,bars,plotStyle,precision,role=>indicatorDecorationId(settings.id,role));policies.push(SWING_MARKER_POLICY);return {output:{series,fills,priceLines,...(labels.length?{labels}:{})},display:Object.freeze(display),precision,diagnostics,policies};}
 if(patternKind){const marks=patternMarksNative(settings.id,result,bars,plotStyle);if(result.marks)policies.push(PATTERN_MARKS_POLICY);return {output:{series:marks.candles?[...series,marks.candles]:series,fills,priceLines,...(marks.labels.length?{labels:marks.labels}:{}),...(marks.lines.length?{lines:marks.lines}:{}),...(marks.boxes.length?{boxes:marks.boxes}:{})},display:Object.freeze(display),precision,diagnostics,policies};}
 return {output:{series,fills,priceLines},display:Object.freeze(display),precision,diagnostics,policies};
}
/** One label per confirmed divergence on its later pivot, at the RSI value (bullish below, bearish above), in its
 *  plot's Style color. A hidden plot or the Divergence labels input off hides them. Labels stay on their own bar (no offset). */
export function rsiDivergenceLabelsNative(settings:IndicatorInstanceSettings,result:IndicatorResult,bars:readonly Bar[],plotStyle:(id:string)=>IndicatorPlotStyle):DrawingLabel[]{
 const labels:DrawingLabel[]=[];if(!result.divergence||!rsiDivergenceSettings(settings.inputs).labels)return labels;
 result.divergence.segments.forEach((row,ordinal)=>{
  const style=plotStyle(RSI_DIVERGENCE_PLOT_OF[row.kind]),at=bars[row.toIndex]?.time;if(!style.visible||at===undefined)return;const below=row.kind==='bullish'||row.kind==='hiddenBullish';
  labels.push({id:indicatorDecorationId(settings.id,`divergence:label:${ordinal}`),paneId:'',xloc:'bar_time',x:at*1000,y:row.toRsi,yloc:'price',text:RSI_DIVERGENCE_LABELS[row.kind],style:below?'label_up':'label_down',color:indicatorColorOpacity(style.color,style.opacity??100),textColor:'#ffffff',size:'small',textAlign:'center',fontFamily:'default'});
 });
 return labels;
}
export const RSI_FORMING_DIVERGENCE_POLICY='Forming divergences are dashed lines labelled forming between the last confirmed pivot and the latest unconfirmed extreme. They may change or disappear on later bars until confirmed and never trigger alerts.';
/** Show forming divergences on: one dashed line per forming divergence on the RSI pane between the two RSI points, in its
 *  kind's Style color, with a "forming" label at the unconfirmed end (when Divergence labels is on). A hidden plot hides it. */
export function rsiFormingDivergenceNative(settings:IndicatorInstanceSettings,result:IndicatorResult,bars:readonly Bar[],plotStyle:(id:string)=>IndicatorPlotStyle):{lines:DrawingLine[];labels:DrawingLabel[]}{
 const lines:DrawingLine[]=[],labels:DrawingLabel[]=[];const forming=result.divergence?.forming;if(!forming?.length)return {lines,labels};const options=rsiDivergenceSettings(settings.inputs);
 forming.forEach((row,ordinal)=>{
  const style=plotStyle(RSI_DIVERGENCE_PLOT_OF[row.kind]),from=bars[row.fromIndex],to=bars[row.toIndex];if(!style.visible||!from||!to)return;const color=indicatorColorOpacity(style.color,style.opacity??100),below=rsiDivergenceIsBullish(row.kind);
  lines.push({id:indicatorDecorationId(settings.id,`divergence:forming:${ordinal}`),paneId:'',xloc:'bar_time',x1:from.time*1000,y1:row.fromRsi,x2:to.time*1000,y2:row.toRsi,extend:'none',color,invisible:false,width:Math.max(1,Math.min(4,Math.round(style.width))),style:'dashed',arrowLeft:false,arrowRight:false});
  if(options.labels)labels.push({id:indicatorDecorationId(settings.id,`divergence:forming:label:${ordinal}`),paneId:'',xloc:'bar_time',x:to.time*1000,y:row.toRsi,yloc:'price',text:RSI_DIVERGENCE_LABELS[row.kind]+' forming',style:below?'label_up':'label_down',color:indicatorColorOpacity(style.color,Math.round((style.opacity??100)*0.6)),textColor:'#ffffff',size:'small',textAlign:'center',tooltip:'Forming divergence: not confirmed yet, may change',fontFamily:'default'});
 });
 return {lines,labels};
}
/** RSI points of headroom past each divergence label's pivot (about
 *  one small label's height on a typical RSI pane). */
export const RSI_DIVERGENCE_LABEL_HEADROOM=14;
/** A transparent, scale-only anchor series (no legend, data window or price label) holding each label's pivot RSI plus the
 *  headroom (above for Bear labels, below for Bull), so the pane's autoscale keeps the label bubbles inside the plot area
 *  instead of over the legend values or clipped by the pane top. Null when no label is drawn. */
export function rsiDivergenceLabelHeadroom(instanceId:string,labels:readonly DrawingLabel[],reference:LineLikeSeries|undefined):LineLikeSeries|null{
 if(!labels.length||!reference)return null;
 const want=new Map<number,number>();for(const label of labels){const up=label.style==='label_down',value=label.y+(up?RSI_DIVERGENCE_LABEL_HEADROOM:-RSI_DIVERGENCE_LABEL_HEADROOM);want.set(label.x,value);}
 return {id:indicatorDecorationId(instanceId,'divergence:headroom'),title:'',paneId:'',kind:'line',visible:true,display:{pane:true,priceScale:false,legend:false,dataWindow:false},
  points:reference.points.map(point=>({time:point.time,value:want.get(point.time)??null})),style:{color:'rgba(0,0,0,0)',width:1,lineStyle:'solid'}} as LineLikeSeries;
}
/** An RSI zone fill as one borderless box between two constant levels, extended both ways like a level-to-level fill. */
export function rsiZoneBox(id:string,bars:readonly Bar[],top:number,bottom:number,color:string):DrawingBox{
 return {id,paneId:'',xloc:'bar_time',left:bars[0].time*1000,top,right:bars.at(-1)!.time*1000,bottom,extend:'both',bgColor:color,borderWidth:0,borderStyle:'solid',textSize:'auto',hAlign:'center',vAlign:'center',wrap:false,fontFamily:'default',bold:false,italic:false};
}
/** With Price pane divergences on, one line per confirmed divergence on the PRICE pane (force overlay) between the two
 *  price pivots, in its plot's Style color, width and line style. A hidden plot hides its lines. No display offset. */
export function rsiDivergencePriceLinesNative(settings:IndicatorInstanceSettings,result:IndicatorResult,bars:readonly Bar[],plotStyle:(id:string)=>IndicatorPlotStyle):DrawingLine[]{
 const lines:DrawingLine[]=[];if(!result.divergence)return lines;const options=rsiDivergenceSettings(settings.inputs);if(!options.pricePane)return lines;
 result.divergence.segments.forEach((row,ordinal)=>{
  const style=plotStyle(RSI_DIVERGENCE_PLOT_OF[row.kind]),from=bars[row.fromIndex],to=bars[row.toIndex];if(!style.visible||!from||!to)return;const low=rsiDivergenceIsBullish(row.kind);
  const y1=rsiDivergencePivotPrice(from,low,options.bodyOnly),y2=rsiDivergencePivotPrice(to,low,options.bodyOnly);if(!Number.isFinite(y1)||!Number.isFinite(y2))return;
  lines.push({id:indicatorDecorationId(settings.id,`divergence:price:${ordinal}`),paneId:'',overlay:true,xloc:'bar_time',x1:from.time*1000,y1,x2:to.time*1000,y2,extend:'none',color:indicatorColorOpacity(style.color,style.opacity??100),invisible:false,width:Math.max(1,Math.min(4,Math.round(style.width))),style:style.lineStyle,arrowLeft:false,arrowRight:false});
 });
 return lines;
}
/** With Background divergences on, the later pivot bar of each confirmed divergence is shaded on the RSI pane in its
 *  plot's Style color at 15% of the plot opacity. A hidden plot hides its background. No display offset. */
export function rsiDivergenceBackgroundsNative(settings:IndicatorInstanceSettings,result:IndicatorResult,bars:readonly Bar[],plotStyle:(id:string)=>IndicatorPlotStyle):Background[]{
 const rows:Background[]=[];if(!result.divergence||!rsiDivergenceSettings(settings.inputs).background)return rows;
 result.divergence.segments.forEach((row,ordinal)=>{
  const style=plotStyle(RSI_DIVERGENCE_PLOT_OF[row.kind]),at=bars[row.toIndex];if(!style.visible||!at)return;
  rows.push({id:indicatorDecorationId(settings.id,`divergence:background:${ordinal}`),paneId:'',from:at.time*1000,to:indicatorDisplayTime(bars,row.toIndex+1)*1000,color:indicatorColorOpacity(style.color,Math.round((style.opacity??100)*0.15))});
 });
 return rows;
}
/** Pattern markers as bar-anchored labels (bullish below the bar, bearish and neutral above) and chart pattern
 *  boundaries as lines, colored by their direction plot's Style row. A hidden plot hides its markers and lines. Markers stay
 *  on their own bar (no display offset).
 *  Any catalog kind with `pattern` set uses this path. A marker may name its shape and position (above, below, or
 *  at a price), boxes are price zones (border in the plot color, fill at 20% of the plot opacity), and candles
 *  are one native candle series over the bars' own OHLC in their plot's color (hollow = transparent body). */
export const PATTERN_BOX_FILL_SHARE=0.2;
export function patternMarksNative(instanceId:string,result:IndicatorResult,bars:readonly Bar[],plotStyle:(id:string)=>IndicatorPlotStyle):{labels:DrawingLabel[];lines:DrawingLine[];boxes:DrawingBox[];candles:CandleSeries|null}{
 const labels:DrawingLabel[]=[],lines:DrawingLine[]=[],boxes:DrawingBox[]=[];const marks=result.marks;if(!marks)return {labels,lines,boxes,candles:null};
 const time=(index:number)=>bars[index]?.time;
 const colorOf=(style:IndicatorPlotStyle)=>indicatorColorOpacity(style.color,style.opacity??100);
 // Readable markers: markers of one bar and side share one label (texts stacked) and bare counts (Sequential 1-8) are small
 // plain text rather than bubbles. Every bubble stays anchored at its own bar here; overlapping bubbles are moved apart in
 // pixels at paint time (indicator-pattern-layout.ts), so they never cover one another or the legend at any zoom and never
 // widen the price scale.
 const merged=new Map<string,{ordinal:number;row:typeof marks.markers[number];texts:string[];tips:string[];color:string;below:boolean}>();
 marks.markers.forEach((row,ordinal)=>{
  const style=plotStyle(row.plot),at=time(row.index);if(!style.visible||at===undefined)return;const position=row.position??(row.plot==='bullish'?'below':'above'),below=position==='below'||position==='price'&&row.direction==='up',color=colorOf(style);
  const key=position==='price'||row.shape?`solo:${ordinal}`:`${row.index}:${position}`,hit=merged.get(key);
  if(hit&&hit.color===color){if(row.text)hit.texts.push(row.text);if(row.tooltip)hit.tips.push(row.tooltip);return;}
  merged.set(hit?`${key}:${ordinal}`:key,{ordinal,row,texts:row.text?[row.text]:[],tips:row.tooltip?[row.tooltip]:[],color,below});
 });
 for(const {ordinal,row,texts,tips,color,below} of [...merged.values()].sort((a,b)=>a.row.index-b.row.index||a.ordinal-b.ordinal)){
  const at=time(row.index)!,position=row.position??(row.plot==='bullish'?'below':'above'),text=texts.join('\n'),count=!row.shape&&/^\d{1,2}$/.test(text)&&text!=='13';// a 13 (countdown completion) keeps its bubble
  const yloc:'price'|'abovebar'|'belowbar'=position==='price'?'price':below?'belowbar':'abovebar',y=position==='price'?row.price!:below?bars[row.index].low:bars[row.index].high;
  labels.push({id:indicatorDecorationId(instanceId,`pattern:marker:${ordinal}`),paneId:'',xloc:'bar_time',x:at*1000,y,yloc,text,style:row.shape??(count?'none':below?'label_up':'label_down'),color,textColor:row.shape||count?color:'#ffffff',size:row.shape||count?'tiny':'small',textAlign:'center',tooltip:tips.join('\n')||undefined,fontFamily:'default'});
 }
 marks.lines.forEach((row,ordinal)=>{
  const style=plotStyle(row.plot),from=time(row.from.index),to=time(row.to.index);if(!style.visible||from===undefined||to===undefined)return;
  lines.push({id:indicatorDecorationId(instanceId,`pattern:line:${ordinal}`),paneId:'',xloc:'bar_time',x1:from*1000,y1:row.from.price,x2:to*1000,y2:row.to.price,extend:row.extendRight?'right':'none',color:colorOf(style),invisible:false,width:Math.max(1,Math.min(4,Math.round(style.width))),style:style.lineStyle,arrowLeft:false,arrowRight:false});
 });
 (marks.boxes??[]).forEach((row,ordinal)=>{
  const style=plotStyle(row.plot),from=time(row.from.index),to=time(row.to.index);if(!style.visible||from===undefined||to===undefined)return;
  boxes.push({id:indicatorDecorationId(instanceId,`pattern:box:${ordinal}`),paneId:'',xloc:'bar_time',left:from*1000,top:Math.max(row.from.price,row.to.price),right:to*1000,bottom:Math.min(row.from.price,row.to.price),extend:row.extendRight?'right':'none',bgColor:indicatorColorOpacity(style.color,Math.round((style.opacity??100)*PATTERN_BOX_FILL_SHARE)),borderColor:colorOf(style),borderWidth:Math.max(1,Math.min(4,Math.round(style.width))),borderStyle:style.lineStyle,textSize:'auto',hAlign:'center',vAlign:'center',wrap:false,fontFamily:'default',bold:false,italic:false});
 });
 let candles:CandleSeries|null=null;
 if(marks.candles?.length){
  // One row per chart bar: the renderer reads candle series by bar index, so a skipped bar keeps a NaN placeholder
  // (never painted, read out or scaled) instead of shifting every later candle left.
  const rows:CandleSeries['bars']=bars.map(bar=>({time:bar.time*1000,open:NaN,high:NaN,low:NaN,close:NaN})),colors:CandleBarColor[]=bars.map(()=>({color:'rgba(0,0,0,0)',wickColor:'rgba(0,0,0,0)',borderColor:'rgba(0,0,0,0)'}));let known=0;
  for(const row of marks.candles){const style=plotStyle(row.plot),bar=bars[row.index];if(!style.visible||!bar||![bar.open,bar.high,bar.low,bar.close].every(Number.isFinite))continue;const color=colorOf(style);
   rows[row.index]={time:bar.time*1000,open:bar.open,high:bar.high,low:bar.low,close:bar.close};colors[row.index]={color:row.hollow?'rgba(0,0,0,0)':color,wickColor:color,borderColor:color};known++;}
  if(known){const first=colors.find((_,index)=>Number.isFinite(rows[index].close))!.borderColor!;candles={id:`lv-pattern-candles:${JSON.stringify(instanceId)}`,title:'Candles',paneId:'',kind:'candle',visible:true,display:{pane:true,priceScale:false,legend:false,dataWindow:false},bars:rows,barColors:colors,style:{up:first,down:first,wickUp:first,wickDown:first,borderUp:first,borderDown:first}};}
 }
 return {labels,lines,boxes,candles};
}
