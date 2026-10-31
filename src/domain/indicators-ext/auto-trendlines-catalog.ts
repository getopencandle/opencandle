import type {NumericSeries} from '../types';
import type {CatalogDefinition} from '../indicator-catalog';
import type {PatternLine,PatternMarker} from './patterns-catalog';
import {AUTO_TREND_REFERENCE} from './auto-trendlines-scene';
import {AUTO_TREND_PIVOT_RULES,calculateAutoTrendlinesPivot} from './auto-trendlines-pivot';

/**
 * The Auto trendlines catalog entry (Indicators tab). Visual-only: lines and pivot marks go through the
 * drawing-like marks path shared with the chart patterns (IndicatorResult.marks -> patternMarksNative). Its two plots carry
 * no values (every point unavailable), so nothing numeric reaches alerts, Source pickers or the data window.
 *
 * Inputs: "Bars to breakout" initial 3 is the public fact (AUTO_TREND_REFERENCE). The 1-100 edit bound, the Line size
 * initial "Both" and the Show pivots initial false are our own choice (the public prose names the controls only). Colors are
 * our own choice and reuse the pattern bullish/bearish palette.
 */
export const AUTO_TRENDLINES_ID='autotrendlines' as const;
const LINE_SIZES=['Small','Large','Both'] as const;
const FAMILY_TEXT={small:'Small',large:'Large'} as const;

export const AUTO_TRENDLINES_DEFINITION:CatalogDefinition={id:AUTO_TRENDLINES_ID,name:'Auto trendlines',acronym:'Auto trendlines',overlay:true,pattern:'chart',
 inputs:[
  {key:'lineSize',title:'Line size',type:'string',defval:'Both',options:LINE_SIZES},
  {key:'barsToBreakout',title:'Bars to breakout',type:'int',defval:3,min:1,max:100,step:1},
  {key:'showPivots',title:'Show pivots',type:'bool',defval:false},
 ],
 plots:[{id:'bullish',label:'Support',color:'#089981',width:1},{id:'bearish',label:'Resistance',color:'#f23645',width:1}],
 provenance:[
  {url:AUTO_TREND_REFERENCE,facts:'Trendlines connect swing pivots of a Small and a Large size (Line size: Small, Large, Both); a line breaks after a configurable count of consecutive closes beyond it (initial 3); pivots used by the lines can be shown.'},
  {url:'lv-defined:auto-trendlines-pivot',facts:`Pivot radius ${AUTO_TREND_PIVOT_RULES.radius.small}/${AUTO_TREND_PIVOT_RULES.radius.large} bars, Zig Zag reversal ${AUTO_TREND_PIVOT_RULES.deviation.small}/${AUTO_TREND_PIVOT_RULES.deviation.large} x ATR(${AUTO_TREND_PIVOT_RULES.atrLength}), newest ${AUTO_TREND_PIVOT_RULES.seedsPerSide} pivots per side as anchors, at most ${AUTO_TREND_PIVOT_RULES.linesPerSide} lines per size and side.`},
 ],
 unknownDefaults:['Line size initial "Both", Show pivots initial off, the 1-100 Bars to breakout bound, colors and every detection constant are OpenCandle-defined.'],
 policies:[
  'OpenCandle-defined detection from confirmed pivots only: a pivot needs its full right side, so a line never uses an unfinished swing. Only the newest 5000 bars are searched.',
  'Each line extends right to the newest bar, or ends on the bar that completes the breakout (strictly beyond the line for the set number of consecutive closes; an equal close resets the count).',
  'Auto trendlines is visual-only: no plot values, alerts or strategy signals. Unavailable or invalid bars draw no lines at all (no partial scene).',
 ],
 calculate(ctx){
  const n=ctx.bars.length,empty=():NumericSeries=>new Array(n).fill(null),lineSize=ctx.str('lineSize') as typeof LINE_SIZES[number];
  const result=calculateAutoTrendlinesPivot(ctx.bars,{sourceKey:'chart',lineSize,barsToBreakout:ctx.num('barsToBreakout'),showPivots:ctx.bool('showPivots')});
  if(result.status!=='ready'){ctx.diagnostic?.(result.diagnostic);ctx.marks?.({markers:[],lines:[]});return {bullish:empty(),bearish:empty()};}
  const plot=(side:'support'|'resistance')=>side==='support'?'bullish' as const:'bearish' as const;
  const lines:PatternLine[]=result.scene.lines.map(line=>({plot:plot(line.side),from:{index:line.from.index,price:line.from.price},to:{index:line.endIndex,price:line.endPrice}}));
  const markers:PatternMarker[]=result.scene.pivots.map(pivot=>({index:pivot.index,plot:plot(pivot.side),text:pivot.family==='large'?'L':'S',tooltip:`${FAMILY_TEXT[pivot.family]} ${pivot.side} pivot`}));
  ctx.marks?.({markers,lines});
  return {bullish:empty(),bearish:empty()};
 },
 warmup:()=>2*AUTO_TREND_PIVOT_RULES.radius.large+AUTO_TREND_PIVOT_RULES.atrLength,
 work:count=>count*16+Math.min(count,5000)*4*AUTO_TREND_PIVOT_RULES.seedsPerSide*AUTO_TREND_PIVOT_RULES.seedsPerSide,
};
