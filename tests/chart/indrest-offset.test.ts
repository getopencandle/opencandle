import {describe,expect,it} from 'vitest';
import {indicatorOffsetBounds,assertIndicatorEditOffset,assertIndicatorNewOffset,indicatorOffsetOutOfReference,validateIndicatorSettings,INDICATOR_MAX_OFFSET,defaultIndicatorPresentation} from '../../src/chart/indicator-settings';
import {renderIndicatorSeries} from '../../src/chart/indicator-rendering';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {calculateIndicator} from '../../src/domain/indicators';
import {captureIndicatorAlertSource} from '../../src/domain/technical-alerts';
import type {IndicatorId} from '../../src/domain/indicators';

// display offsets for SMA, EMA, BB and WMA follow the recorded facts
// (integer, default 0, -500..500). The SMA/EMA/BB facts come from the legacy reference descriptors (MASimple,
// MAExp, BB; is_hidden_study, superseded by STD;SMA); equality with the current built-in is inferred, not live-verified.
// A plot shifted past the last loaded bar is withheld (the fact does not say what is drawn there).
// SYNTHETIC bars.
const bars=Array.from({length:40},(_,i)=>{const close=50+4*Math.sin(i/3)+(i%5);return {time:1700000000+i*60,open:close-0.4,high:close+1,low:close-1,close,volume:100+i};});
const FACT_KINDS:IndicatorId[]=['sma','ema','bb','wma'];

describe('offset bounds follow the facts',()=>{
 it.each(FACT_KINDS)('%s: -500..500, 501 and -501 refused on edit, +-500 accepted',kind=>{
  expect(indicatorOffsetBounds(kind)).toEqual({min:-500,max:500});
  expect(()=>assertIndicatorEditOffset(kind,501)).toThrow('Offset must be an integer from -500 through 500 bars.');
  expect(()=>assertIndicatorEditOffset(kind,-501)).toThrow(/-500 through 500/);
  expect(()=>assertIndicatorEditOffset(kind,500)).not.toThrow();expect(()=>assertIndicatorEditOffset(kind,-500)).not.toThrow();
  expect(()=>assertIndicatorEditOffset(kind,1.5)).toThrow();expect(()=>assertIndicatorEditOffset(kind,Number.NaN)).toThrow();
 });
 it('kinds without an offset fact keep the shared range',()=>{
  for(const kind of ['rsi','macd','vwap','atr','obv','volume','dc','kc'] as IndicatorId[])expect(indicatorOffsetBounds(kind)).toEqual({min:-INDICATOR_MAX_OFFSET,max:INDICATOR_MAX_OFFSET});
 });
 it('a stored offset beyond the fact range still loads, is flagged out-of-reference, and an unchanged value is not new input',()=>{
  const row=(kind:IndicatorId,offset:number)=>({id:'i-'+kind,kind,inputs:{},plots:{},offset,visible:true});
  for(const kind of FACT_KINDS){
   expect(()=>validateIndicatorSettings(row(kind,1000))).not.toThrow();
   expect(indicatorOffsetOutOfReference(kind,1000)).toBe(true);expect(indicatorOffsetOutOfReference(kind,-501)).toBe(true);
   expect(indicatorOffsetOutOfReference(kind,500)).toBe(false);expect(indicatorOffsetOutOfReference(kind,0)).toBe(false);
   expect(()=>assertIndicatorNewOffset(kind,1000,[1000])).not.toThrow();// restored state keeps the stored range
   expect(()=>assertIndicatorNewOffset(kind,1001,[1000])).toThrow(/-500 through 500/);// anything else is new input
  }
  expect(indicatorOffsetOutOfReference('rsi',99999)).toBe(false);
 });
});

describe('offset is display only',()=>{
 it.each(FACT_KINDS)('%s: offset 0/+3/-3 leave the computed numbers identical; only display time moves',kind=>{
  const result=calculateIndicator(kind,bars,{}),snapshot=structuredClone(result);
  const at=(offset:number)=>renderIndicatorSeries('inst',kind,result,bars,{},offset);
  const zero=at(0),plus=at(3),minus=at(-3);
  for(let s=0;s<zero.length;s++){
   const values=(series:any)=>series.points.map((p:any)=>p.value);
   expect(values(plus[s])).toEqual(values(zero[s]));expect(values(minus[s])).toEqual(values(zero[s]));
   expect(plus[s].points[0].time-zero[s].points[0].time).toBe(3*60000);expect(minus[s].points[0].time-zero[s].points[0].time).toBe(-3*60000);
  }
  expect(result).toEqual(snapshot);// the calculation result is untouched
  expect(result.policies.join(' ')).toContain('Offsets belong to rendering and never change signal values.');
 });
 it('the presentation withholds shifted values past the last bar with the existing diagnostic, and the result is unchanged',()=>{
  const result=calculateIndicator('sma',bars,{length:3}),before=structuredClone(result);
  const settings=(offset:number)=>({id:'inst',kind:'sma' as IndicatorId,inputs:{length:3,source:'close'},plots:{},offset,visible:true,presentation:defaultIndicatorPresentation('sma')});
  const shifted=renderIndicatorPresentation(settings(3),result,bars),plain=renderIndicatorPresentation(settings(0),result,bars);
  expect(shifted.diagnostics).toContain('Offset plots and fills are shifted by whole bars. A positive offset draws its latest values in the empty space past the last loaded bar.');
  expect(plain.diagnostics).toEqual([]);
  const points=(shifted.output.series![0] as any).points as any[];
  expect(points.slice(0,3).every(p=>p.value===null)).toBe(true);// first bars have no shifted value
  const inGrid=points.slice(0,bars.length).map(p=>p.value),source=result.series[0].values;
  expect(inGrid.slice(3)).toEqual(source.slice(0,bars.length-3));// values land 3 bars later inside the loaded grid
  // The approximation as it stands today: the native output keeps the shifted tail as extra dense points (the budget counts
  // them) with the diagnostic above; the renderer's dense-point model places no bar there. Recorded as observed, not changed.
  expect(points).toHaveLength(bars.length+3);
  expect(points.slice(bars.length).map(p=>p.value)).toEqual(source.slice(bars.length-3));
  expect(result).toEqual(before);
 });
 it('alert capture ignores the display offset (frozen definitions read the unshifted series)',()=>{
  const settings=(offset:number)=>({id:'inst',kind:'sma' as IndicatorId,inputs:{length:3,source:'close'},plots:{},offset,visible:true});
  expect(captureIndicatorAlertSource(settings(3),'sma','standard','snap')).toEqual(captureIndicatorAlertSource(settings(0),'sma','standard','snap'));
 });
});
