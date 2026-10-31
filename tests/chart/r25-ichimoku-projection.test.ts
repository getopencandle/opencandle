import {describe,expect,it} from 'vitest';
import type {Vela} from '@luxalgo/vela';
import {nativeHost} from '../ui/indicator-real-port-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {PROJECTION_POLICY,renderIndicatorPresentation,type IndicatorPresentationContext} from '../../src/chart/indicator-presentation';
import {calculateIndicator,validProjection} from '../../src/domain/indicators';
import {defaultIndicatorPresentation} from '../../src/chart/indicator-settings';

// Ichimoku leading spans and cloud project past the last loaded bar (chart display only), through the REAL
// calculation, port and presentation (minimal in-memory native host). SYNTHETIC daily bars only.
const bar=(time:number,o:number,h:number,l:number,c:number)=>({time,open:o,high:h,low:l,close:c,volume:100});
const closes=[10,12,14,16,15,13,11,9,8,10,13,16,18];
const D=closes.map((close,i)=>bar(1704067200+i*86400,close,close+1,close-1,close));
const inputs={conversionLength:1,baseLength:2,spanBLength:4,displacement:3};
function rig(domain:readonly ReturnType<typeof bar>[],context:IndicatorPresentationContext={resolution:'1D'}){const host=nativeHost(domain.map(row=>({...row,time:row.time*1000}))),port=createIndicatorPort(host.chart as unknown as Vela,undefined,undefined,undefined,undefined,()=>context);
 const emitted=(id:string)=>host.live.get(port.list().find(row=>row.id===id)!.rendererId).emitted;return {host,port,emitted};}

describe('Ichimoku projection: calculation',()=>{
 it('returns the latest Displacement - 1 leading-span values past the last bar (hand-computed oracle)',()=>{
  // shift 2, n 13. Slot 13 uses bar 11, slot 14 uses bar 12.
  // A: conversion(1) = (h + l) / 2 = close; base(2) over bars 10-11 = (17 + 12) / 2 = 14.5, over 11-12 = (19 + 15) / 2 = 17.
  //    slot 13 = (16 + 14.5) / 2 = 15.25; slot 14 = (18 + 17) / 2 = 17.5.
  // B: midpoint(4) over bars 8-11 = (17 + 7) / 2 = 12; over bars 9-12 = (19 + 9) / 2 = 14.
  const result=calculateIndicator('ichimoku',D,inputs);
  expect(result.diagnostics).toEqual([]);
  expect(result.projection).toEqual({upper:[15.25,17.5],lower:[12,14]});
  expect(Object.isFrozen(result.projection)).toBe(true);
  for(const series of result.series)expect(series.values).toHaveLength(D.length);
 });
 it('defaults project 25 values; Displacement 1 and non-projecting kinds have none',()=>{
  const many=Array.from({length:120},(_,i)=>bar(1704067200+i*86400,100+Math.sin(i/5)*10,112+Math.sin(i/5)*10,90+Math.sin(i/5)*10,101+Math.sin(i/5)*10));
  const result=calculateIndicator('ichimoku',many,{});
  expect(result.projection!.upper).toHaveLength(25);expect(result.projection!.lower).toHaveLength(25);
  expect(result.projection!.upper.every(value=>typeof value==='number')).toBe(true);
  expect(calculateIndicator('ichimoku',D,{...inputs,displacement:1}).projection).toBeUndefined();
  expect(calculateIndicator('sma',D,{length:3}).projection).toBeUndefined();
  expect(calculateIndicator('ichimoku',[],inputs).projection).toBeUndefined();
 });
 it('refuses a projection for an unknown plot or with a nonfinite value',()=>{
  expect(()=>validProjection(['upper'],{other:[1]})).toThrow('The indicator projection is invalid.');
  expect(()=>validProjection(['upper'],{upper:[Number.NaN]})).toThrow('The indicator projection is invalid.');
  expect(validProjection(['upper'],{upper:[1,null]})).toEqual({upper:[1,null]});
 });
});

describe('Ichimoku projection: native presentation',()=>{
 const DAY=86400_000,last=D.at(-1)!.time*1000;
 it('leading spans carry two more points one day apart; other plots keep one point per bar',()=>{
  const {port,emitted}=rig(D),id=port.add('ichimoku',inputs),out=emitted(id);
  const plots=out.series.filter((row:any)=>!row.id.startsWith('lv-decoration:'));
  const byLength=new Map(plots.map((row:any)=>[row.title,row.points.length]));
  expect(byLength.get('Leading span A')).toBe(D.length+2);expect(byLength.get('Leading span B')).toBe(D.length+2);
  expect(byLength.get('Conversion line')).toBe(D.length);expect(byLength.get('Base line')).toBe(D.length);expect(byLength.get('Lagging span')).toBe(D.length);
  const a=plots.find((row:any)=>row.title==='Leading span A');
  expect(a.points.slice(-2)).toEqual([{time:last+DAY,value:15.25},{time:last+2*DAY,value:17.5}]);
 });
 it('the cloud anchors and per-bar colors extend over the projected slots',()=>{
  const {port,emitted}=rig(D),id=port.add('ichimoku',inputs),out=emitted(id),fill=out.fills[0];
  const from=out.series.find((row:any)=>row.id===fill.fromSeriesId),to=out.series.find((row:any)=>row.id===fill.toSeriesId);
  expect(from.points).toHaveLength(D.length+2);expect(to.points).toHaveLength(D.length+2);expect(fill.colors).toHaveLength(D.length+2);
  expect(from.points.slice(-2).map((p:any)=>p.time)).toEqual([last+DAY,last+2*DAY]);
  // upper (span A) above lower (span B) in both projected slots: bullish color.
  expect(fill.colors!.slice(-2)).toEqual([fill.color,fill.color]);
 });
 it('a display offset shifts the projected points with the rest; the data window keeps the latest loaded value',()=>{
  const {port,emitted}=rig(D),id=port.add('ichimoku',inputs);port.update(id,{offset:2});
  const a=emitted(id).series.find((row:any)=>row.title==='Leading span A');
  expect(a.points).toHaveLength(D.length+4);expect(a.points.at(-1)).toEqual({time:last+4*DAY,value:17.5});
  const result=calculateIndicator('ichimoku',D,inputs);
  const presentation=renderIndicatorPresentation({id:'i1',kind:'ichimoku',inputs,plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation('ichimoku')},result,D,{resolution:'1D'});
  expect(presentation.policies).toContain(PROJECTION_POLICY);
  const upper=result.series.find(row=>row.id==='upper')!.values.at(-1);
  expect(presentation.display.find(row=>row.id==='upper')?.value).toBe(upper);
  expect(upper).not.toBe(17.5);
 });
});
