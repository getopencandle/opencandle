// Factory defaults of NEW Fibonacci drawings. Values are transcribed fact defaults;
// tests/chart/drawing-factory-defaults.test.ts compares every constant here with its fact. Saved drawings never read this module: only a drawing
// created fresh (no retained record, no carried props) is seeded, so older documents keep the
// interpretation they were saved with (legacy members stay legacy).
//
// Fact ids:
//   tool.LineToolFibRetracement.levels, tool.LineToolFibRetracement.defaults,
//   tool.LineToolTrendBasedFibTime.defaults

export interface FibFactoryLevel{readonly ratio:number;readonly color:string;readonly enabled:boolean}

/** tool.LineToolFibRetracement.levels: level1..level24 in reference order (11 visible, 13 hidden). */
export const FIB_RETRACEMENT_FACTORY_LEVELS:readonly FibFactoryLevel[]=Object.freeze([
 [0,'#808080',true],[0.236,'#F23645',true],[0.382,'#FF9800',true],[0.5,'#4caf50',true],[0.618,'#089981',true],[0.786,'#00bcd4',true],
 [1,'#808080',true],[1.618,'#2962FF',true],[2.618,'#F23645',true],[3.618,'#9c27b0',true],[4.236,'#e91e63',true],
 [1.272,'#FF9800',false],[1.414,'#F23645',false],[2.272,'#FF9800',false],[2.414,'#4caf50',false],[2,'#089981',false],[3,'#00bcd4',false],
 [3.272,'#808080',false],[3.414,'#2962FF',false],[4,'#F23645',false],[4.272,'#9c27b0',false],[4.414,'#e91e63',false],[4.618,'#FF9800',false],[4.764,'#089981',false],
].map(([ratio,color,enabled])=>Object.freeze({ratio:ratio as number,color:color as string,enabled:enabled as boolean})));

/** tool.LineToolTrendBasedFibTime.defaults levels (11 rows, only the 0.5 level hidden). */
export const TREND_BASED_FIB_TIME_FACTORY_LEVELS:readonly FibFactoryLevel[]=Object.freeze([
 [0,'#808080',true],[0.382,'#F23645',true],[0.5,'#81c784',false],[0.618,'#4caf50',true],[1,'#089981',true],[1.382,'#00bcd4',true],
 [1.618,'#808080',true],[2,'#2962FF',true],[2.382,'#e91e63',true],[2.618,'#9c27b0',true],[3,'#673ab7',true],
].map(([ratio,color,enabled])=>Object.freeze({ratio:ratio as number,color:color as string,enabled:enabled as boolean})));

/** Fib retracement presentation of a new drawing, in OpenCandle's own members.
 *  trendline {visible:true,linewidth:2,linestyle:2 (dashed),color:#808080} -> lvFibTrendLine;
 *  fillBackground:true with transparency 80 -> lvFibBackground opacity 20 (percent opaque = 100 - transparency);
 *  levelsStyle {linewidth:2,linestyle:0 (solid)} -> style width and line style. */
export const FIB_RETRACEMENT_FACTORY_PRESENTATION=Object.freeze({
 trendLine:Object.freeze({schemaVersion:1 as const,enabled:true,color:'#808080',width:2,style:'dashed' as const}),
 background:Object.freeze({schemaVersion:1 as const,opacity:20}),
 levelsLineWidth:2,
 levelsLineStyle:'solid' as const,
});

/** A fresh copy that no later mutation of a drawing can alias back into these tables. */
export const cloneFibFactoryLevels=(levels:readonly FibFactoryLevel[]):{ratio:number;color:string;enabled:boolean}[]=>levels.map(level=>({ratio:level.ratio,color:level.color,enabled:level.enabled}));
