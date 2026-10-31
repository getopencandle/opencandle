import {describe,expect,it} from 'vitest';
import type {Vela} from '@luxalgo/vela';
import {nativeHost} from '../ui/indicator-real-port-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {SEGMENT_BREAK_COLOR,validateIndicatorPresentationContext,type IndicatorPresentationContext} from '../../src/chart/indicator-presentation';
import {defaultIndicatorPresentation,indicatorFillIds} from '../../src/chart/indicator-settings';
import {indicatorColorOpacity} from '../../src/chart/indicator-opacity';
import {calculateIndicator} from '../../src/domain/indicators';

// follow-ups through the REAL port and presentation (minimal in-memory native host). SYNTHETIC bars only.
const at=(day:number,hour:number,minute:number)=>Date.UTC(2026,2,day,hour,minute)/1000;// 2026-03, EST until 03-08
const bar=(time:number,o:number,h:number,l:number,c:number)=>({time,open:o,high:h,low:l,close:c,volume:100});
/** Three New York trading days: pre-market, regular and after-hours bars (see tests/domain/r23-indicator-oracles.test.ts). */
const NY=[bar(at(2,13,0),50,200,1,50),bar(at(2,14,30),10,12,9,11),bar(at(2,15,0),11,13,10,12),bar(at(2,21,30),50,300,0.5,60),bar(at(3,13,0),12.5,14,12,13),bar(at(3,14,30),12,14,11,13),bar(at(4,14,30),13,15,12,14),bar(at(4,15,0),14,15,13,14.5)];
function rig(domain:readonly ReturnType<typeof bar>[],context:IndicatorPresentationContext){const host=nativeHost(domain.map(row=>({...row,time:row.time*1000}))),port=createIndicatorPort(host.chart as unknown as Vela,undefined,undefined,undefined,undefined,()=>context);
 const emitted=(id:string)=>host.live.get(port.list().find(row=>row.id===id)!.rendererId).emitted;return {host,port,emitted};}

describe('pivots: chart facts reach the calculation, and each period is its own segment',()=>{
 it('the port passes the declared interval and calendar: Auto on 5m is 1D, on 30m is 1W',()=>{
  const five=rig(NY,{resolution:'5m',calendar:'us-equity'}),id=five.port.add('pivots');
  const want=calculateIndicator('pivots',NY,{type:'Traditional',timeframe:'Auto',pivotsBack:15},{resolution:'5m',calendar:'us-equity'});
  expect(five.port.values(id).series.map(row=>row.values)).toEqual(want.series.map(row=>row.values));
  expect(five.port.values(id).series[0].values).toEqual([null,null,null,null,34/3,34/3,38/3,38/3]);
  const thirty=rig(NY,{resolution:'30m',calendar:'us-equity'}),other=thirty.port.add('pivots');
  expect(thirty.port.values(other).series[0].values).toEqual(Array(NY.length).fill(null));// one New York week
  const crypto=rig(NY,{resolution:'5m',calendar:'utc'}),utc=crypto.port.add('pivots');
  expect(crypto.port.values(utc).series[0].values.slice(4,6)).toEqual([360.5/3,360.5/3]);// UTC day 1 includes the extended bars
 });
 it('the stroke into the first bar of a new period is transparent; values and the scale label keep their color',()=>{
  const {port,emitted}=rig(NY,{resolution:'5m',calendar:'us-equity'}),id=port.add('pivots');
  const out=emitted(id),p=out.series.find((row:any)=>row.title==='P');
  expect(p.points.map((point:any)=>point.value)).toEqual([null,null,null,null,34/3,34/3,38/3,38/3]);
  expect(p.points.map((point:any)=>point.color??null)).toEqual([null,null,null,null,null,null,SEGMENT_BREAK_COLOR,null]);
  expect(p.style.color).toBe('#ff6d00');
  const r1=out.series.find((row:any)=>row.title==='R1');expect(r1.points[6].color).toBe(SEGMENT_BREAK_COLOR);expect(r1.points[7].color).toBeUndefined();
  const offset=port.add('pivots',undefined,undefined);port.update(offset,{offset:2});const shifted=emitted(offset).series.find((row:any)=>row.title==='P');
  expect(shifted.points[8].color).toBe(SEGMENT_BREAK_COLOR);// display offset moves the break with its point
 });
 it('the presentation context accepts a declared calendar and refuses anything else',()=>{
  expect(()=>validateIndicatorPresentationContext({resolution:'5m',calendar:'us-equity'})).not.toThrow();
  expect(()=>validateIndicatorPresentationContext({resolution:'5m',calendar:'utc'})).not.toThrow();
  expect(()=>validateIndicatorPresentationContext({resolution:'5m',calendar:'nyse'} as any)).toThrow();
 });
});

describe('Ichimoku: two-color cloud',()=>{
 // Small lengths so the synthetic fixture crosses: spans A and B swap sides.
 const closes=[10,12,14,16,15,13,11,9,8,10,13,16,18];
 const D=closes.map((close,i)=>bar(1704067200+i*86400,close,close+1,close-1,close));
 const inputs={conversionLength:1,baseLength:2,spanBLength:4,displacement:2};
 // The cloud continues over the projected slots past the last bar, so the expected colors include them.
 const spans=calculateIndicator('ichimoku',D,inputs),A=[...spans.series.find(row=>row.id==='upper')!.values,...spans.projection?.upper??[]],B=[...spans.series.find(row=>row.id==='lower')!.values,...spans.projection?.lower??[]];
 const defaults=defaultIndicatorPresentation('ichimoku'),bull=indicatorColorOpacity(defaults.fills.band!.color,defaults.fills.band!.opacity),bear=indicatorColorOpacity(defaults.fills.bearish!.color,defaults.fills.bearish!.opacity);
 const expected=(showBull:boolean,showBear:boolean)=>A.map((a,i)=>{const b=B[i];return a===null||b===null?null:a>b?(showBull?bull:null):(showBear?bear:null);});
 it('Band fill (bullish) and Bearish fill are separate styles; the default colors differ',()=>{
  expect(indicatorFillIds('ichimoku')).toEqual(['band','bearish']);expect(bull).not.toBe(bear);
  expect(A.some((a,i)=>a!==null&&B[i]!==null&&a>B[i]!)).toBe(true);expect(A.some((a,i)=>a!==null&&B[i]!==null&&a<=B[i]!)).toBe(true);// the fixture crosses
 });
 it('one fill with per-bar colors: bullish where span A is above span B, bearish otherwise',()=>{
  const {port,emitted}=rig(D,{resolution:'1D'}),id=port.add('ichimoku',inputs);
  const fills=emitted(id).fills;expect(fills).toHaveLength(1);expect(fills[0].colors).toEqual(expected(true,true));
  const anchor=emitted(id).series.find((row:any)=>row.id===fills[0].fromSeriesId);expect(fills[0].colors).toHaveLength(anchor.points.length);
 });
 it('hiding one background leaves only the other color; hiding both removes the fill',()=>{
  const {port,emitted}=rig(D,{resolution:'1D'}),id=port.add('ichimoku',inputs),row=()=>port.list().find(item=>item.id===id)!;
  const set=(band:boolean,bearish:boolean)=>port.update(id,{presentation:{...row().presentation!,fills:{band:{...row().presentation!.fills.band!,visible:band},bearish:{...row().presentation!.fills.bearish!,visible:bearish}}}});
  set(true,false);expect(emitted(id).fills[0].colors).toEqual(expected(true,false));
  set(false,true);expect(emitted(id).fills[0].colors).toEqual(expected(false,true));
  set(false,false);expect(emitted(id).fills).toEqual([]);
 });
 it('a display offset shifts the per-bar colors with the anchor points',()=>{
  const {port,emitted}=rig(D,{resolution:'1D'}),id=port.add('ichimoku',inputs);port.update(id,{offset:3});
  const fill=emitted(id).fills[0],anchor=emitted(id).series.find((row:any)=>row.id===fill.fromSeriesId);
  expect(fill.colors).toEqual([null,null,null,...expected(true,true)]);expect(fill.colors).toHaveLength(anchor.points.length);
 });
});
