// Symbol watermark (Chart settings > Canvas > Watermark). Pure model: which text lines a chart shows, in which color and size.
// Items Ticker, Interval, Description, Replay mode (default Replay mode only, color rgba(80,83,94,0.3)); line font metrics
// line0 80/80, line1 36/44.
// Not in the facts:
// - line0 holds the ticker and the interval joined by ", " and line1 the description;
// - "Replay mode" shows the ticker and interval line while Bar Replay runs on that chart, even when Ticker and Interval are off;
// - the text is centered over the chart cell and drawn above the bars (a DOM layer; the reference draws it under the series),
//   and it shrinks to fit narrow cells.
import type {ChartSettingsDocument} from './chart-settings-document';
// The interval reads as the toolbar shows it (240m is 4h).
import {shortIntervalText} from '../ui/interval-display';

export type WatermarkSettings=ChartSettingsDocument['canvas']['watermark'];
export interface WatermarkSubject {symbol:string;interval:string;description?:string|null;replay:boolean}
export interface WatermarkLine {id:'line0'|'line1';text:string;fontSize:number;lineHeight:number}
export interface WatermarkView {color:string;lines:WatermarkLine[]}
/** Watermark line font metrics (px). */
export const WATERMARK_LINE_METRICS=Object.freeze({line0:Object.freeze({fontSize:80,lineHeight:80}),line1:Object.freeze({fontSize:36,lineHeight:44})});

/** The watermark of one chart, or null when nothing is shown. */
export function watermarkView(settings:WatermarkSettings,subject:WatermarkSubject):WatermarkView|null{
 const replay=settings.replay&&subject.replay,lines:WatermarkLine[]=[];
 const head=[settings.ticker||replay?subject.symbol.trim():'',settings.interval||replay?shortIntervalText(subject.interval.trim()):''].filter(Boolean).join(', ');
 if(head)lines.push({id:'line0',text:head,...WATERMARK_LINE_METRICS.line0});
 const description=settings.description?subject.description?.trim()??'':'';
 if(description)lines.push({id:'line1',text:description,...WATERMARK_LINE_METRICS.line1});
 return lines.length?{color:settings.color,lines}:null;
}
