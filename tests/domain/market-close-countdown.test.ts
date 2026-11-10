import {describe,expect,it} from 'vitest';
import {marketCloseCountdown} from '../../src/domain/market-close-countdown';

// 2026-11-09 is a Monday (EST, UTC-5): the regular session closes at 21:00 UTC. 2026-11-27 is an NYSE 13:00 early close.
const at=(iso:string)=>Date.parse(iso);
describe('market close countdown',()=>{
 it('counts minutes from 10 down, then seconds from 60',()=>{
  expect(marketCloseCountdown(at('2026-11-09T20:49:59Z'))).toBeNull();
  expect(marketCloseCountdown(at('2026-11-09T20:50:00Z'))?.text).toBe('10 min to close');
  expect(marketCloseCountdown(at('2026-11-09T20:51:00Z'))?.text).toBe('9 min to close');
  expect(marketCloseCountdown(at('2026-11-09T20:51:01Z'))?.text).toBe('9 min to close');
  expect(marketCloseCountdown(at('2026-11-09T20:58:30Z'))?.text).toBe('2 min to close');
  expect(marketCloseCountdown(at('2026-11-09T20:59:00Z'))).toEqual({seconds:60,final:true,text:'60s to close'});
  expect(marketCloseCountdown(at('2026-11-09T20:59:01Z'))?.text).toBe('59s to close');
  expect(marketCloseCountdown(at('2026-11-09T20:59:59Z'))?.text).toBe('1s to close');
  expect(marketCloseCountdown(at('2026-11-09T21:00:00Z'))).toBeNull();
 });
 it('follows an early close and shows nothing on weekends and holidays',()=>{
  expect(marketCloseCountdown(at('2026-11-27T17:55:00Z'))?.text).toBe('5 min to close');
  expect(marketCloseCountdown(at('2026-11-27T20:55:00Z'))).toBeNull();
  expect(marketCloseCountdown(at('2026-11-07T20:55:00Z'))).toBeNull();
  expect(marketCloseCountdown(at('2026-11-26T20:55:00Z'))).toBeNull();
 });
});
