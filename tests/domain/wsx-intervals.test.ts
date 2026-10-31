import {describe,expect,it} from 'vitest';
import {intervalEntrySeed,parseInterval,parseIntervalEntry,submitIntervalEntry} from '../../src/domain/intervals';
// WSX interval typing helpers. Pure; the entry box itself is covered by the packaged flow once root wires it.
describe('WSX interval entry helpers',()=>{
 it('seeds the entry from a digit or a comma and nothing else',()=>{
  for(const digit of '0123456789')expect(intervalEntrySeed(digit)).toBe(digit);
  expect(intervalEntrySeed(',')).toBe('');
  for(const other of ['a','.','/','Enter','Escape',' ','Shift'])expect(intervalEntrySeed(other)).toBeNull();
 });
 it('accepts exactly what the interval grammar accepts and returns the canonical id and a readable label',()=>{
  expect(parseIntervalEntry('5')).toEqual({ok:true,interval:'5m',label:'5 minutes'});
  expect(parseIntervalEntry('60')).toEqual({ok:true,interval:'60m',label:'1 hour'});
  expect(parseIntervalEntry('1D')).toEqual({ok:true,interval:'1D',label:'1 day'});
  expect(parseIntervalEntry('2W')).toMatchObject({ok:true,interval:'2W'});
  expect(parseIntervalEntry('3M')).toMatchObject({ok:true,interval:'3M'});
  expect(parseIntervalEntry('15s')).toMatchObject({ok:true,interval:'15s'});
  for(const text of ['5','150m','2.5h','1D','1W','3M','10T'])expect(parseIntervalEntry(text)).toMatchObject({ok:true,interval:parseInterval(text).id});
 });
 it('returns the parser\'s own message, never a new one, for text it refuses',()=>{
  for(const text of ['','abc','0','1441','7s','2.5','9'.repeat(41)]){
   const result=parseIntervalEntry(text);expect(result.ok,text).toBe(false);
   let expected='';try{parseInterval(text);}catch(cause){expected=(cause as Error).message;}
   if(!result.ok)expect(result.message).toBe(expected);
  }
 });
 it('submit calls the apply handler once with the canonical interval and never for refused text',()=>{
  const seen:string[]=[];const apply=(interval:string)=>{seen.push(interval);return{ok:true};};
  expect(submitIntervalEntry('15',apply)).toEqual({ok:true,interval:'15m',message:null});
  expect(submitIntervalEntry('x',apply).ok).toBe(false);expect(seen).toEqual(['15m']);
  expect(submitIntervalEntry('3',()=>({ok:false})).message).toBe('The interval could not be applied.');
 });
});
