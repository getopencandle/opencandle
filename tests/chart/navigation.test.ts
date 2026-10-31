import { it,expect } from 'vitest';
import {rangeStart,validateChartOptions} from '../../src/chart/navigation';
it('named range aliases and leap-aware year boundaries use declared UTC policy',()=>{
  const last=Date.UTC(2024,9,14,12)/1000;
  expect(rangeStart(last,'All')).toBeNull();expect(rangeStart(last,'ALL')).toBeNull();
  expect(rangeStart(last,'5D')).toBe(Date.UTC(2024,9,9,12)/1000);
  expect(rangeStart(last,'5Y')).toBe(Date.UTC(2019,9,14,12)/1000);
  expect(rangeStart(last,'YTD')).toBe(Date.UTC(2024,0,1)/1000);
});
it('rejects invalid timezone/source rather than silently accepting controls',()=>{
  expect(()=>validateChartOptions({source:'close',scale:'linear',invert:false,auto:true,timezone:'Not/AZone'})).toThrow();
});
