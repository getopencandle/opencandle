import type {CatalogContext,CatalogDefinition,CatalogInput} from '../indicator-catalog';
import {tradingSessions,validateTradingWindow,type TradingWindow} from './trading-sessions';
export const TRADING_SESSION_IDS=['tradingsessions'] as const;
export type TradingSessionId=typeof TRADING_SESSION_IDS[number];
const FAMILIES=['Tokyo','London','New York'],COLORS=['#2962ff','#ff6d00','#089981'];
export const TRADING_SESSION_PLOTS=['session1','session2','session3'] as const;
const inputs:CatalogInput[]=FAMILIES.flatMap((name,index)=>{const prefix='session'+(index+1);return[
 {key:prefix+'Enabled',title:name+' enabled',type:'bool' as const,defval:false},
 {key:prefix+'Name',title:name+' name',type:'string' as const,defval:name},
 {key:prefix+'Start',title:name+' start (HH:mm)',type:'string' as const,defval:''},
 {key:prefix+'End',title:name+' end (HH:mm)',type:'string' as const,defval:''},
 {key:prefix+'Zone',title:name+' time zone (blank uses exchange)',type:'string' as const,defval:''},
 {key:prefix+'Color',title:name+' color (hex)',type:'string' as const,defval:COLORS[index]},
 ];});
inputs.push(...[{key:'showNames',title:'Session names'},{key:'showOpenClose',title:'Open and close guides'},{key:'showRange',title:'Range in ticks'},{key:'showAverage',title:'Average close'}].map(item=>({...item,type:'bool' as const,defval:true})));
export function tradingWindows(value:(key:string)=>unknown):TradingWindow[]{return FAMILIES.map((_,index)=>{const prefix='session'+(index+1);return{enabled:value(prefix+'Enabled') as boolean,name:value(prefix+'Name') as string,start:value(prefix+'Start') as string,end:value(prefix+'End') as string,zone:value(prefix+'Zone') as string,color:value(prefix+'Color') as string};});}
/** Input validation checks syntax; the calculation independently requires the actual exchange zone for a blank field. */
export function validateTradingSessionInputs(value:(key:string)=>unknown):void{tradingWindows(value).forEach(window=>validateTradingWindow(window,'UTC'));}
const calculate=(ctx:CatalogContext)=>{
 const windows=tradingWindows(key=>key.endsWith('Enabled')?ctx.bool(key):ctx.str(key));
 const result=tradingSessions(ctx.bars,windows,{resolution:ctx.chart?.resolution??null,exchangeZone:ctx.chart?.exchangeZone,style:ctx.chart?.style,tickSize:ctx.chart?.tickSize});
 result.diagnostics.forEach(message=>ctx.diagnostic?.(message));ctx.sessions?.(result.sessions);
 return Object.fromEntries(TRADING_SESSION_PLOTS.map((plot,index)=>[plot,result.series[index]]));
};
export const TRADING_SESSION_DEFINITIONS:readonly CatalogDefinition[]=Object.freeze([{
 id:'tradingsessions',name:'Trading sessions',acronym:'TS',overlay:true,tradingSessions:true,inputs:Object.freeze(inputs),
 plots:TRADING_SESSION_PLOTS.map((id,index)=>({id,label:`${index+1}. Session average`,color:COLORS[index],width:1})),
 provenance:[{url:'public-indicator-definition:trading-sessions',facts:'Configurable intraday windows, boxes, names, open/close, tick range and close average.'}],
 unknownDefaults:['Exact reference clock, color and toggle defaults are unresolved. OpenCandle starts with three disabled windows and blank clocks; names, palette, enabled display toggles, widget styling and geometry styling are explicit OpenCandle choices.'],
 policies:['Configure times before enabling a window. Clock membership is start-inclusive/end-exclusive; equal times mean a full local day. Included supplied bars contribute their whole OHLC.','Geometry describes observed historical sessions; average scalar values use only their observed prefix. Missing observations are never manufactured and an invalid price makes its session decoration unavailable.','This is a chart-only visual study. Background alert capture refuses it. Typed time and zone fields are functional controls; quarter-hour picker styling and exact default/pixel comparisons remain unresolved.'],
 calculate,warmup:()=>1,work:count=>count*120,
}]);
