import type {NumericSeries} from '../types';
import type {CatalogDefinition,CatalogInput,CatalogPlot,CatalogContext} from '../indicator-catalog';
import {CANDLE_FAMILIES,CANDLE_THRESHOLDS,CandleMetrics,PATTERN_TYPES,TREND_RULES,candleFamily,detectCandleFamily,trendStates,type CandleHit,type PatternType,type TrendRule} from './patterns-candles';
import {BREAKOUT_PATTERNS,CHART_PATTERNS,detectChartPatterns,type ChartPatternId} from './patterns-chart';

/**
 * The Indicators dialog Patterns tab.
 *
 * Entries are listed in two sections. Candlestick names use the "Name (direction)" form; names after "Falling three
 * methods (bearish)" are our own choice and listed in unknownDefaults. Inputs, defaults, colors, marker text and every detection
 * rule are our own choice (patterns-candles.ts and patterns-chart.ts). Calculations are original code.
 *
 * Every pattern indicator is an overlay with one 0/1 signal plot per direction it can report ('bullish', 'bearish',
 * 'neutral'): 1 on the bar that completes a pattern, else 0. The signal plots are not drawn as lines; the chart draws a
 * labelled marker instead (below the bar for bullish, above for bearish and neutral), and chart patterns add their
 * boundary lines. An alert on a signal plot "Greater than 0" fires when the pattern appears.
 */
export type PatternDirectionPlot='bullish'|'bearish'|'neutral';
/** Marker shapes a catalog kind may ask for (the native label styles). Absent = a text label bubble. */
export const PATTERN_MARK_SHAPES=['circle','square','diamond','triangleup','triangledown','arrowup','arrowdown','cross','xcross','flag'] as const;
export type PatternMarkShape=typeof PATTERN_MARK_SHAPES[number];
/** `plot` is the id of one of the kind's plots (its Style row colors the mark; a hidden plot hides it). Pattern kinds use
 *  bullish/bearish/neutral. `position` 'above'/'below' the bar or 'price' (at `price`); absent = below for
 *  bullish, above otherwise. */
export interface PatternMarker {index:number;plot:string;text:string;tooltip:string;position?:'above'|'below'|'price';price?:number;shape?:PatternMarkShape}
/** A line between two bars. `extendRight` makes it a ray through both points (an unbroken trendline), so only its two
 *  anchor prices reach the pane autoscale, never the projection. */
export interface PatternLine {plot:string;from:{index:number;price:number};to:{index:number;price:number};extendRight?:boolean}
/** A price zone between two bars (Gaps). `extendRight` continues it past `to` (an open zone). */
export interface PatternBox {plot:string;from:{index:number;price:number};to:{index:number;price:number};extendRight?:boolean}
/** A candle over the bar's own OHLC in its plot's color; hollow = border only (Bollinger bars). */
export interface PatternCandle {index:number;plot:string;hollow?:boolean}
export interface PatternMarks {markers:readonly PatternMarker[];lines:readonly PatternLine[];boxes?:readonly PatternBox[];candles?:readonly PatternCandle[]}
/** Bound on drawn marks per instance; the newest are kept. Signal plots are never truncated. */
export const PATTERN_MARK_LIMIT=5000;
export const PATTERN_MARKS_POLICY=`Pattern markers and lines are drawn for the newest ${PATTERN_MARK_LIMIT} detections. Markers stay on their bar with a display offset. The signal plots (1 on the completing bar, else 0) are what alerts, the legend and the data window read.`;

const FACT='indicator-list:patterns';
const LV='lv-defined:';
const CAPTURED_POLICY='Name from the captured Patterns tab list.';
const UNCAPTURED='The name is OpenCandle-defined: the captured Patterns tab list is virtualized and stops at "Falling three methods (bearish)".';
const RULE_UNKNOWN='Inputs, defaults, colors, marker text and the detection rule are OpenCandle-defined.';
const PLOTS:Record<PatternDirectionPlot,CatalogPlot>={
 bullish:{id:'bullish',label:'Bullish',color:'#089981',width:1},
 bearish:{id:'bearish',label:'Bearish',color:'#f23645',width:1},
 neutral:{id:'neutral',label:'Neutral',color:'#787b86',width:1},
};
/** Bars before the SMA200 of the 'SMA50, SMA200' trend rule has a value (index 199 is its first). */
const TREND_WARMUP=200;
const TREND_INPUT:CatalogInput={key:'trendRule',title:'Detect trend based on',type:'string',defval:'SMA50',options:TREND_RULES};
const typeInput=(defval:PatternType):CatalogInput=>({key:'patternType',title:'Pattern type',type:'string',defval,options:PATTERN_TYPES});

/** Captured candlestick names (fact order is alphabetical; the capture ends at the last one). */
const CAPTURED_NAMES=new Set(['Abandoned baby (bearish)','Abandoned baby (bullish)','All candlestick patterns','Dark cloud cover (bearish)','Doji (neutral)','Doji star (bearish)','Doji star (bullish)','Downside Tasuki gap (bearish)','Dragonfly Doji (bullish)','Engulfing (bearish)','Engulfing (bullish)','Evening Doji star (bearish)','Evening star (bearish)','Falling three methods (bearish)',
 'All chart patterns','Bearish flag chart pattern','Bullish flag chart pattern','Cup and handle chart pattern','Inverted cup and handle chart pattern','Bearish pennant chart pattern','Bullish pennant chart pattern','Double bottom chart pattern','Double top chart pattern','Head and shoulders chart pattern','Inverted head and shoulders chart pattern','Rectangle chart pattern','Triangle chart pattern','Triple bottom chart pattern','Triple top chart pattern','Falling wedge chart pattern','Rising wedge chart pattern']);

/** One candlestick entry: [id, name, family, direction named by the entry, acronym]. */
const CANDLE_ENTRIES=[
 ['cdlabandonedbabybear','Abandoned baby (bearish)','abandoned','bearish','AB bear'],
 ['cdlabandonedbabybull','Abandoned baby (bullish)','abandoned','bullish','AB bull'],
 ['cdldarkcloud','Dark cloud cover (bearish)','piercing','bearish','DC'],
 ['cdldoji','Doji (neutral)','doji','neutral','Doji'],
 ['cdldojistarbear','Doji star (bearish)','dojistar','bearish','DS bear'],
 ['cdldojistarbull','Doji star (bullish)','dojistar','bullish','DS bull'],
 ['cdldowntasuki','Downside Tasuki gap (bearish)','tasuki','bearish','DTG'],
 ['cdldragonfly','Dragonfly Doji (bullish)','dojiwings','bullish','DD'],
 ['cdlengulfingbear','Engulfing (bearish)','engulfing','bearish','EG bear'],
 ['cdlengulfingbull','Engulfing (bullish)','engulfing','bullish','EG bull'],
 ['cdleveningdojistar','Evening Doji star (bearish)','dojistar3','bearish','EDS'],
 ['cdleveningstar','Evening star (bearish)','star','bearish','ES'],
 ['cdlfallingthree','Falling three methods (bearish)','threemethods','bearish','F3M'],
 ['cdlfallingwindow','Falling window (bearish)','window','bearish','FW'],
 ['cdlgravestone','Gravestone Doji (bearish)','dojiwings','bearish','GD'],
 ['cdlhammer','Hammer (bullish)','hammer','bullish','H'],
 ['cdlhangingman','Hanging man (bearish)','hammer','bearish','HM'],
 ['cdlharamibear','Harami (bearish)','harami','bearish','HR bear'],
 ['cdlharamibull','Harami (bullish)','harami','bullish','HR bull'],
 ['cdlharamicrossbear','Harami cross (bearish)','haramicross','bearish','HC bear'],
 ['cdlharamicrossbull','Harami cross (bullish)','haramicross','bullish','HC bull'],
 ['cdlinvertedhammer','Inverted hammer (bullish)','invhammer','bullish','IH'],
 ['cdlkickingbear','Kicking (bearish)','kicking','bearish','K bear'],
 ['cdlkickingbull','Kicking (bullish)','kicking','bullish','K bull'],
 ['cdllonglowershadow','Long lower shadow (bullish)','shadow','bullish','LLS'],
 ['cdllonguppershadow','Long upper shadow (bearish)','shadow','bearish','LUS'],
 ['cdlmarubozublack','Marubozu black (bearish)','marubozu','bearish','MB'],
 ['cdlmarubozuwhite','Marubozu white (bullish)','marubozu','bullish','MW'],
 ['cdlmorningdojistar','Morning Doji star (bullish)','dojistar3','bullish','MDS'],
 ['cdlmorningstar','Morning star (bullish)','star','bullish','MS'],
 ['cdlonneck','On neck (bearish)','onneck','bearish','ON'],
 ['cdlpiercing','Piercing (bullish)','piercing','bullish','PL'],
 ['cdlrisingthree','Rising three methods (bullish)','threemethods','bullish','R3M'],
 ['cdlrisingwindow','Rising window (bullish)','window','bullish','RW'],
 ['cdlshootingstar','Shooting star (bearish)','invhammer','bearish','SS'],
 ['cdlspinningtopblack','Spinning top black (neutral)','spinblack','neutral','STB'],
 ['cdlspinningtopwhite','Spinning top white (neutral)','spinwhite','neutral','STW'],
 ['cdlthreeblackcrows','Three black crows (bearish)','soldiers','bearish','3BC'],
 ['cdlthreewhitesoldiers','Three white soldiers (bullish)','soldiers','bullish','3WS'],
 ['cdltristarbear','Tri-Star (bearish)','tristar','bearish','TS bear'],
 ['cdltristarbull','Tri-Star (bullish)','tristar','bullish','TS bull'],
 ['cdltweezerbottom','Tweezer bottom (bullish)','tweezer','bullish','TB'],
 ['cdltweezertop','Tweezer top (bearish)','tweezer','bearish','TT'],
 ['cdluptasuki','Upside Tasuki gap (bullish)','tasuki','bullish','UTG'],
] as const;
/** Chart entries in list order (entries OpenCandle does not detect, such as Elliott wave and Auto trend detector, are
 *  left out). */
const CHART_ENTRIES=[
 ['chpbearflag','Bearish flag chart pattern','bearflag','BeF'],
 ['chpbullflag','Bullish flag chart pattern','bullflag','BuF'],
 ['chpcuphandle','Cup and handle chart pattern','cuphandle','CH'],
 ['chpinvcuphandle','Inverted cup and handle chart pattern','invcuphandle','ICH'],
 ['chpdoublebottom','Double bottom chart pattern','doublebottom','DB'],
 ['chpdoubletop','Double top chart pattern','doubletop','DT'],
 ['chpheadshoulders','Head and shoulders chart pattern','headshoulders','HS'],
 ['chpinvheadshoulders','Inverted head and shoulders chart pattern','invheadshoulders','IHS'],
 ['chpbearpennant','Bearish pennant chart pattern','bearpennant','BeP'],
 ['chpbullpennant','Bullish pennant chart pattern','bullpennant','BuP'],
 ['chprectangle','Rectangle chart pattern','rectangle','Rect'],
 ['chptriangle','Triangle chart pattern','triangle','Tri'],
 ['chptriplebottom','Triple bottom chart pattern','triplebottom','TrB'],
 ['chptripletop','Triple top chart pattern','tripletop','TrT'],
 ['chpfallingwedge','Falling wedge chart pattern','fallingwedge','FWdg'],
 ['chprisingwedge','Rising wedge chart pattern','risingwedge','RWdg'],
] as const;

const zeros=(n:number):number[]=>new Array(n).fill(0);
const directionsOf=(family:string):PatternDirectionPlot[]=>{const row=candleFamily(family);return (['bullish','bearish','neutral'] as const).filter(d=>row[d]!==undefined);};

/** Signals and marks from candlestick hits. Hits on one bar and direction share one marker (codes on separate lines). */
function candleOutput(ctx:CatalogContext,hits:readonly CandleHit[],plots:readonly PatternDirectionPlot[]):Record<string,NumericSeries>{
 const n=ctx.bars.length,signals:Record<string,number[]>={};for(const plot of plots)signals[plot]=zeros(n);
 const grouped=new Map<string,{index:number;plot:PatternDirectionPlot;codes:string[];names:string[]}>();
 for(const hit of hits){
  signals[hit.direction][hit.index]=1;const key=hit.index+':'+hit.direction;let row=grouped.get(key);
  if(!row){row={index:hit.index,plot:hit.direction,codes:[],names:[]};grouped.set(key,row);}row.codes.push(hit.code);row.names.push(hit.name);
 }
 const markers=[...grouped.values()].sort((a,b)=>a.index-b.index||plots.indexOf(a.plot)-plots.indexOf(b.plot)).slice(-PATTERN_MARK_LIMIT).map(row=>({index:row.index,plot:row.plot,text:row.codes.join('\n'),tooltip:row.names.join(', ')}));
 ctx.marks?.({markers,lines:[]});
 return signals;
}

function candleEntry([id,name,familyId,direction,acronym]:readonly [string,string,string,PatternDirectionPlot,string]):CatalogDefinition{
 const family=candleFamily(familyId),plots=directionsOf(familyId),trend=family.role!=='none',typed=plots.includes('bullish')&&plots.includes('bearish');
 const inputs:CatalogInput[]=[...(trend?[TREND_INPUT]:[]),...(typed?[typeInput(direction==='bullish'?'Bullish':'Bearish')]:[])];
 const captured=CAPTURED_NAMES.has(name);
 // Kicking was trend-gated before 0.8.1; a stored trendRule is accepted and ignored.
 const retired=familyId==='kicking'?{retiredInputs:[TREND_INPUT]}:{};
 return {id:id as never,name,acronym,overlay:true,pattern:'candlestick',inputs,...retired,plots:plots.map(plot=>PLOTS[plot]),
  provenance:[{url:FACT,facts:captured?`Entry "${name}" in the Candlestick patterns section.`:'The Candlestick patterns section exists; this entry was not in the rendered rows.'},{url:LV+'candlestick-'+family.id,facts:family.definition+' Trend role: '+family.role+'.'}],
  unknownDefaults:[...(captured?[]:[UNCAPTURED]),RULE_UNKNOWN],
  policies:[captured?CAPTURED_POLICY:UNCAPTURED,`OpenCandle-defined rule: ${family.definition}`,...(trend?['A reversal pattern needs the opposite trend and a continuation pattern the same trend, read on the bar before the pattern\'s first bar; "No detection" accepts every bar.']:[]),...(typed?['Pattern type chooses which direction of this pattern family is reported.']:[]),PATTERN_MARKS_POLICY],
  calculate(ctx){
   const k=new CandleMetrics(ctx.bars),rule:TrendRule=trend?ctx.str('trendRule') as TrendRule:'No detection',type=typed?ctx.str('patternType') as PatternType:'Both';
   const states=trendStates(ctx.bars,rule,ctx.tk.sma);
   return candleOutput(ctx,detectCandleFamily(k,family,states,{bullish:type!=='Bearish',bearish:type!=='Bullish'},rule==='No detection'),plots);
  },
  // A trend-gated side needs the trend on the bar before the pattern: SMA50, SMA50 > SMA200 for the second rule. The warm-up
  // callback sees numeric inputs only, so a trend family counts the longest rule (SMA200) whatever rule is chosen.
  warmup:()=>Math.max(CANDLE_THRESHOLDS.averageBodyLength,trend?TREND_WARMUP:0)+family.size,work:count=>count*(trend?40:20)};
}

const ALL_CANDLES:CatalogDefinition={id:'cdlall' as never,name:'All candlestick patterns',acronym:'All CDL',overlay:true,pattern:'candlestick',
 inputs:[TREND_INPUT,typeInput('Both')],plots:[PLOTS.bullish,PLOTS.bearish,PLOTS.neutral],
 provenance:[{url:FACT,facts:'Entry "All candlestick patterns" in the Candlestick patterns section.'},{url:LV+'candlestick-all',facts:'Runs every OpenCandle candlestick family; markers on one bar and direction are combined.'}],
 unknownDefaults:[RULE_UNKNOWN],
 policies:[CAPTURED_POLICY,'Every candlestick family runs with the same trend rule. Pattern type Bullish or Bearish shows that direction only; Both also shows the neutral patterns (Doji, Spinning tops).',PATTERN_MARKS_POLICY],
 calculate(ctx){
  const k=new CandleMetrics(ctx.bars),rule=ctx.str('trendRule') as TrendRule,type=ctx.str('patternType') as PatternType,states=trendStates(ctx.bars,rule,ctx.tk.sma);
  const types={bullish:type!=='Bearish',bearish:type!=='Bullish'};
  const hits=CANDLE_FAMILIES.flatMap(family=>detectCandleFamily(k,family,states,types,rule==='No detection')).filter(hit=>hit.direction!=='neutral'||type==='Both');
  return candleOutput(ctx,hits,['bullish','bearish','neutral']);
 },
 warmup:()=>TREND_WARMUP+Math.max(...CANDLE_FAMILIES.map(family=>family.size)),work:count=>count*12*CANDLE_FAMILIES.length};

const CHART_INPUTS:readonly CatalogInput[]=[{key:'pivotLength',title:'Pivot length',type:'int',defval:5,min:2,max:50,step:1},{key:'tolerance',title:'Tolerance %',type:'float',defval:2,min:0.1,max:50,step:0.1}];
/** Added in 0.8.1: new instances wait for the breakout close; saved instances without the key keep the old last-pivot report. */
const BREAKOUT_INPUT:CatalogInput={key:'breakout',title:'Require breakout confirmation',type:'bool',defval:true,legacyOmit:true,legacyDefval:false};
const BREAKOUT_INPUTS:readonly CatalogInput[]=[...CHART_INPUTS,BREAKOUT_INPUT];
function chartOutput(ctx:CatalogContext,ids:readonly ChartPatternId[],plots:readonly PatternDirectionPlot[]):Record<string,NumericSeries>{
 const n=ctx.bars.length,signals:Record<string,number[]>={};for(const plot of plots)signals[plot]=zeros(n);
 // Signals come from every hit (alerts, legend and data window read them, and an earlier bar never changes as bars are
 // added); only the drawn markers and lines are bounded to the newest PATTERN_MARK_LIMIT.
 const breakout=ids.some(id=>BREAKOUT_PATTERNS.has(id))&&ctx.bool('breakout');
 const hits=detectChartPatterns(ctx.bars,ids,ctx.num('pivotLength'),ctx.num('tolerance'),{breakout});
 const grouped=new Map<string,{index:number;plot:PatternDirectionPlot;names:string[]}>(),lines:PatternLine[]=[];
 for(const hit of hits){
  signals[hit.direction][hit.confirmedAt]=1;const at=hit.pivots.at(-1)!.index,key=at+':'+hit.direction;let row=grouped.get(key);
  if(!row){row={index:at,plot:hit.direction,names:[]};grouped.set(key,row);}if(!row.names.includes(hit.name))row.names.push(hit.name);
  for(const line of hit.lines)lines.push({plot:hit.direction,from:line.from,to:line.to});
 }
 ctx.marks?.({markers:[...grouped.values()].sort((a,b)=>a.index-b.index).slice(-PATTERN_MARK_LIMIT).map(row=>({index:row.index,plot:row.plot,text:row.names.join('\n'),tooltip:row.names.join(', ')})),lines:lines.slice(-PATTERN_MARK_LIMIT)});
 return signals;
}
const CHART_POLICY='OpenCandle-defined detection from confirmed pivots (patterns-chart.ts): a pattern is reported on the bar that confirms its last pivot (or, with breakout confirmation, on its later breakout bar), never earlier, and is not repainted. The marker is drawn on that last pivot. Tolerance is the percent within which two levels are equal.';
const BREAKOUT_POLICY="Require breakout confirmation (on for new instances; off for instances saved before it existed): double and triple tops and bottoms and head and shoulders are reported only on the first close through the valley, peak or neckline (Bulkowski's confirmation), within as many bars after the last pivot as the pattern spans, and only when no earlier close went past the pattern's extreme. The signal is on that breakout bar. Off: the shape is reported unconfirmed, on the bar that confirms its last pivot. Other chart patterns are always reported on their last pivot, unconfirmed.";
/** Common alternative names (search only; the fuller keyword content is a later task). */
const CHART_KEYWORDS:Partial<Record<ChartPatternId,readonly string[]>>={doubletop:['M pattern'],doublebottom:['W pattern'],headshoulders:['H&S','reversal'],invheadshoulders:['inverse H&S','reversal']};
function chartEntry([id,name,pattern,acronym]:readonly [string,string,ChartPatternId,string]):CatalogDefinition{
 const info=CHART_PATTERNS.find(row=>row.id===pattern)!,breakout=BREAKOUT_PATTERNS.has(pattern),keywords=CHART_KEYWORDS[pattern];
 return {id:id as never,name,acronym,overlay:true,pattern:'chart',...(keywords?{keywords}:{}),inputs:breakout?BREAKOUT_INPUTS:CHART_INPUTS,plots:[PLOTS[info.direction]],
  provenance:[{url:FACT,facts:`Entry "${name}" in the Chart patterns section.`},{url:LV+'chart-'+pattern,facts:info.rule}],
  unknownDefaults:[RULE_UNKNOWN],policies:[CAPTURED_POLICY,CHART_POLICY,...(breakout?[BREAKOUT_POLICY]:[]),`OpenCandle-defined rule: ${info.rule}`,PATTERN_MARKS_POLICY],
  calculate(ctx){return chartOutput(ctx,[pattern],[info.direction]);},
  warmup:value=>2*value('pivotLength')+1,work:(count,value)=>count*(value('pivotLength')*4+40)};
}
const ALL_CHART:CatalogDefinition={id:'chpall' as never,name:'All chart patterns',acronym:'All CP',overlay:true,pattern:'chart',inputs:BREAKOUT_INPUTS,plots:[PLOTS.bullish,PLOTS.bearish,PLOTS.neutral],
 provenance:[{url:FACT,facts:'Entry "All chart patterns" in the Chart patterns section.'},{url:LV+'chart-all',facts:'Runs every OpenCandle chart pattern detector on one zigzag.'}],
 unknownDefaults:[RULE_UNKNOWN],policies:[CAPTURED_POLICY,CHART_POLICY,BREAKOUT_POLICY,PATTERN_MARKS_POLICY],
 calculate(ctx){return chartOutput(ctx,CHART_PATTERNS.map(row=>row.id),['bullish','bearish','neutral']);},
 warmup:value=>2*value('pivotLength')+1,work:(count,value)=>count*(value('pivotLength')*4+40*CHART_PATTERNS.length)};

export const CHART_PATTERN_INDICATORS:readonly CatalogDefinition[]=Object.freeze([ALL_CHART,...CHART_ENTRIES.map(chartEntry)]);
export const CANDLE_PATTERN_INDICATORS:readonly CatalogDefinition[]=Object.freeze([ALL_CANDLES,...CANDLE_ENTRIES.map(candleEntry)]);
export const PATTERN_INDICATORS:readonly CatalogDefinition[]=Object.freeze([...CHART_PATTERN_INDICATORS,...CANDLE_PATTERN_INDICATORS]);
export type PatternIndicatorId='chpall'|typeof CHART_ENTRIES[number][0]|'cdlall'|typeof CANDLE_ENTRIES[number][0];
export const PATTERN_INDICATOR_IDS:readonly PatternIndicatorId[]=Object.freeze(['chpall',...CHART_ENTRIES.map(row=>row[0]),'cdlall',...CANDLE_ENTRIES.map(row=>row[0])] as PatternIndicatorId[]);
export const CHART_PATTERN_INDICATOR_IDS:readonly string[]=Object.freeze(CHART_PATTERN_INDICATORS.map(row=>row.id as string));
export const CANDLE_PATTERN_INDICATOR_IDS:readonly string[]=Object.freeze(CANDLE_PATTERN_INDICATORS.map(row=>row.id as string));
export const isPatternIndicator=(id:string)=>CHART_PATTERN_INDICATOR_IDS.includes(id)||CANDLE_PATTERN_INDICATOR_IDS.includes(id);
/** The two Patterns tab sections (rendered uppercase via CSS; LV casing). */
export const PATTERN_SECTIONS=Object.freeze([{id:'chart',label:'Chart patterns'},{id:'candlestick',label:'Candlestick patterns'}] as const);

/** Bounded validation of the marks a calculation hands over (display geometry only). */
export function validPatternMarks(value:PatternMarks,bars:number,plots:readonly string[]):PatternMarks{
 const ok=(index:unknown)=>Number.isSafeInteger(index)&&(index as number)>=0&&(index as number)<bars;
 const point=(row:{index:number;price:number})=>row&&ok(row.index)&&Number.isFinite(row.price);
 const bad=()=>{throw new Error('The pattern marks are invalid.');};
 const boxes=value?.boxes??[],candles=value?.candles??[];
 if(!value||!Array.isArray(value.markers)||!Array.isArray(value.lines)||!Array.isArray(boxes)||!Array.isArray(candles)||value.markers.length>PATTERN_MARK_LIMIT||value.lines.length>PATTERN_MARK_LIMIT||boxes.length>PATTERN_MARK_LIMIT||candles.length>bars)bad();
 for(const row of value.markers){
  if(!ok(row.index)||!plots.includes(row.plot)||typeof row.text!=='string'||row.text.length>400||typeof row.tooltip!=='string'||row.tooltip.length>2000)bad();
  if(row.position!==undefined&&!['above','below','price'].includes(row.position)||row.position==='price'&&!Number.isFinite(row.price)||row.shape!==undefined&&!(PATTERN_MARK_SHAPES as readonly string[]).includes(row.shape))bad();
 }
 for(const row of value.lines)if(!plots.includes(row.plot)||![row.from,row.to].every(point))bad();
 for(const row of boxes)if(!plots.includes(row.plot)||!point(row.from)||!point(row.to)||row.to.index<row.from.index)bad();
 for(const row of candles)if(!ok(row.index)||!plots.includes(row.plot))bad();
 const marker=(row:PatternMarker):PatternMarker=>Object.freeze({index:row.index,plot:row.plot,text:row.text,tooltip:row.tooltip,...(row.position!==undefined?{position:row.position}:{}),...(row.position==='price'?{price:row.price}:{}),...(row.shape!==undefined?{shape:row.shape}:{})});
 return Object.freeze({markers:Object.freeze(value.markers.map(marker)),lines:Object.freeze(value.lines.map(row=>Object.freeze({plot:row.plot,from:{...row.from},to:{...row.to},...(row.extendRight?{extendRight:true}:{})}))),
  ...(value.boxes?{boxes:Object.freeze(boxes.map(row=>Object.freeze({plot:row.plot,from:{...row.from},to:{...row.to},...(row.extendRight?{extendRight:true}:{})})))}:{}),
  ...(value.candles?{candles:Object.freeze(candles.map(row=>Object.freeze({index:row.index,plot:row.plot,...(row.hollow?{hollow:true}:{})})))}:{})});
}
