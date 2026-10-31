import {describe,expect,it} from 'vitest';
import {chartDateTimeInputValue,chartTimeFormatter,chartTimeZone,chartZoneName,chartZoneOffsetText,formatChartDateTime,parseChartDateTimeInput} from '../../src/ui/chart-time-text';
import {isoMinute} from '../../src/ui/AlertsDock';

// The shared chart-time formatter. Every instant below is SYNTHETIC. US DST in 2026 starts Sunday 2026-03-08
// (02:00 becomes 03:00) and ends Sunday 2026-11-01 (02:00 becomes 01:00), in New York and Denver alike.
const s=(y:number,mo:number,d:number,h:number,mi:number,se=0)=>Date.UTC(y,mo-1,d,h,mi,se)/1000;

describe(' chart time text',()=>{
 it('resolves the zone: the chart timezone first, then the app Default chart timezone, then UTC',()=>{
  expect(chartTimeZone('America/Denver',{defaultChoice:'exchange',instrument:{assetClass:'stock',timezone:'America/New_York'}})).toBe('America/Denver');
  expect(chartTimeZone(undefined,{defaultChoice:'exchange',instrument:{assetClass:'stock',timezone:'America/New_York'}})).toBe('America/New_York');
  expect(chartTimeZone('Not/AZone',{defaultChoice:'exchange',instrument:{assetClass:'crypto',timezone:'America/New_York'}})).toBe('UTC');
  expect(chartTimeZone(null,{defaultChoice:'Asia/Tokyo'})).toBe('Asia/Tokyo');
  expect(chartTimeZone(null)).toBe('UTC');
 });
 it('names the zone by its city and its offset at that instant',()=>{
  expect([chartZoneName('UTC'),chartZoneName('America/New_York'),chartZoneName('America/Denver'),chartZoneName('Etc/GMT+3')]).toEqual(['UTC','New York','Denver','Etc/GMT+3']);
  expect(chartZoneOffsetText(s(2026,1,15,12,0),'America/New_York')).toBe('UTC-5');
  expect(chartZoneOffsetText(s(2026,7,15,12,0),'America/New_York')).toBe('UTC-4');
  expect(chartZoneOffsetText(s(2026,7,15,12,0),'Asia/Kolkata')).toBe('UTC+5:30');
 });
 it('UTC text is byte-identical to the old alert log text',()=>{
  for(const at of [0,s(2026,10,23,13,30),s(2024,2,29,23,59,59)])expect(formatChartDateTime(at,'UTC')).toBe(isoMinute(at));
  expect(formatChartDateTime(s(2026,10,23,13,30),'UTC')).toBe('2026-10-23 13:30 UTC');
 });
 it('DST boundary, America/New_York: the wall clock and the offset jump together',()=>{
  expect(formatChartDateTime(s(2026,3,8,6,59),'America/New_York')).toBe('2026-03-08 01:59 UTC-5');
  expect(formatChartDateTime(s(2026,3,8,7,0),'America/New_York')).toBe('2026-03-08 03:00 UTC-4');
  expect(formatChartDateTime(s(2026,11,1,5,30),'America/New_York')).toBe('2026-11-01 01:30 UTC-4');
  expect(formatChartDateTime(s(2026,11,1,6,30),'America/New_York')).toBe('2026-11-01 01:30 UTC-5');
  expect(formatChartDateTime(s(2026,3,8,7,0),'America/New_York',{hours:'12'})).toBe('2026-03-08 3:00 AM UTC-4');
  expect(formatChartDateTime(s(2026,10,23,17,5,9),'America/New_York',{hours:'12',seconds:true,zone:false})).toBe('2026-10-23 1:05:09 PM');
  expect(formatChartDateTime(s(2026,10,23,4,0),'America/New_York',{hours:'12'})).toBe('2026-10-23 12:00 AM UTC-4');
 });
 it('DST boundary, America/Denver',()=>{
  expect(formatChartDateTime(s(2026,3,8,8,59),'America/Denver')).toBe('2026-03-08 01:59 UTC-7');
  expect(formatChartDateTime(s(2026,3,8,9,0),'America/Denver')).toBe('2026-03-08 03:00 UTC-6');
  expect(formatChartDateTime(s(2026,11,1,7,30),'America/Denver',{seconds:true})).toBe('2026-11-01 01:30:00 UTC-6');
  expect(formatChartDateTime(s(2026,11,1,8,30),'America/Denver',{seconds:true})).toBe('2026-11-01 01:30:00 UTC-7');
 });
 it('reads a date and time typed in the chart timezone, across both DST changes',()=>{
  expect(parseChartDateTimeInput('2026-03-08T01:30','America/New_York')).toBe(s(2026,3,8,6,30));
  expect(parseChartDateTimeInput('2026-03-08T03:30','America/New_York')).toBe(s(2026,3,8,7,30));
  expect(()=>parseChartDateTimeInput('2026-03-08T02:30','America/New_York')).toThrow('That time does not exist in New York');
  expect(parseChartDateTimeInput('2026-11-01T01:30','America/New_York')).toBe(s(2026,11,1,5,30)); // the earlier of the two 01:30s
  expect(parseChartDateTimeInput('2026-11-01T02:00','America/New_York')).toBe(s(2026,11,1,7,0));
  expect(parseChartDateTimeInput('2026-03-08T01:30','America/Denver')).toBe(s(2026,3,8,8,30));
  expect(parseChartDateTimeInput('2026-03-08T03:30','America/Denver')).toBe(s(2026,3,8,9,30));
  expect(()=>parseChartDateTimeInput('2026-03-08T02:00','America/Denver')).toThrow('That time does not exist in Denver');
  expect(parseChartDateTimeInput('2026-11-01T01:30','America/Denver')).toBe(s(2026,11,1,7,30));
  expect(parseChartDateTimeInput('2024-02-29T12:30','UTC')).toBe(1709209800);
  expect(()=>parseChartDateTimeInput('2025-02-29T12:30','America/New_York')).toThrow('exist');
  expect(()=>parseChartDateTimeInput('2024-01-01T24:00','UTC')).toThrow('exist');
  expect(()=>parseChartDateTimeInput('not-a-date','UTC')).toThrow('valid');
 });
 it('the input value is the chart wall clock and reads back to the same minute',()=>{
  expect(chartDateTimeInputValue(s(2026,10,23,13,30,45),'America/New_York')).toBe('2026-10-23T09:30');
  expect(chartDateTimeInputValue(s(2026,10,23,13,30),'UTC')).toBe('2026-10-23T13:30');
  for(const zone of ['America/New_York','America/Denver','UTC','Asia/Kolkata'])for(const at of [s(2026,3,8,6,30),s(2026,3,8,7,30),s(2026,11,1,5,30),s(2026,11,1,9,15),s(2026,6,1,0,0)]){
   const value=chartDateTimeInputValue(at,zone),back=parseChartDateTimeInput(value,zone);
   expect(chartDateTimeInputValue(back,zone),zone+' '+value).toBe(value);
   expect(back,zone+' '+value).toBe(at);
  }
  expect(chartDateTimeInputValue(Number.NaN,'UTC')).toBe('');
 });
 it('a formatter closes over one zone and hour cycle; an unknown zone falls back to UTC text',()=>{
  const format=chartTimeFormatter('America/Denver',{hours:'12'});
  expect(format(s(2026,10,23,15,0))).toBe('2026-10-23 9:00 AM UTC-6');
  expect(formatChartDateTime(s(2026,10,23,13,30),'Not/AZone')).toBe('2026-10-23 13:30 UTC');
  expect(formatChartDateTime(Number.NaN,'UTC')).toBe('NaN');
 });
});
