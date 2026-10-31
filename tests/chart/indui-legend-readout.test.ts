import {describe,expect,it} from 'vitest';
import {encodeIndicatorSource} from '../../src/domain/indicator-source';
import {indicatorLegendArguments,indicatorLegendReadout} from '../../src/chart/indicator-display';

// legend title and argument readout.
// SYNTHETIC inputs; no GUI claim.
describe('indicatorLegendArguments',()=>{
 it('lists the leading non-boolean inputs, using saved values over defaults, such as 14 close for RSI',()=>{
  expect(indicatorLegendArguments('rsi',{})).toEqual(['14','close']);
  expect(indicatorLegendArguments('rsi',{length:21,source:'hl2'})).toEqual(['21','hl2']);
 });
 it('caps the list at three inputs plus the source and skips smoothing, band, timezone and kernel inputs',()=>{
  const args=indicatorLegendArguments('bb',{});
  expect(args.length).toBeLessThanOrEqual(4);expect(args.length).toBeGreaterThan(0);
  // RCI ribbon lists all three lengths, and its leading source reads after them.
  expect(indicatorLegendArguments('rciribbon' as never,{})).toEqual(['10','30','50','close']);
  expect(args.join(' ')).not.toMatch(/undefined|NaN/);
 });
 it('shows a non-finite number as a question mark and resolves an indicator source through the supplied label function',()=>{
  expect(indicatorLegendArguments('rsi',{length:Number.NaN})[0]).toBe('?');
  const ref=encodeIndicatorSource('sma-2','plot');expect(indicatorLegendArguments('rsi',{source:ref},instance=>instance==='sma-2'?'SMA:plot':null)).toContain('SMA:plot');
  expect(indicatorLegendArguments('rsi',{source:ref},()=>null)).toContain('missing source');
 });
});

describe('indicatorLegendReadout',()=>{
 const row={acronym:'RSI',arguments:['14','close']};
 it('joins title and arguments when both toggles are on',()=>{
  expect(indicatorLegendReadout(row,{titles:true,inputs:true})).toEqual({title:'RSI',arguments:'14 close',text:'RSI 14 close'});
 });
 it('each toggle removes only its own part',()=>{
  expect(indicatorLegendReadout(row,{titles:false,inputs:true})).toEqual({title:'',arguments:'14 close',text:'14 close'});
  expect(indicatorLegendReadout(row,{titles:true,inputs:false})).toEqual({title:'RSI',arguments:'',text:'RSI'});
  expect(indicatorLegendReadout(row,{titles:false,inputs:false})).toEqual({title:'',arguments:'',text:''});
 });
});
