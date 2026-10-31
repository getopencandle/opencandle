// Watchlist Last price tick flash (pure change detection).
import {describe,expect,it} from 'vitest';
import {watchTickChanges} from '../../src/ui/watchlist-tick-flash';

describe('watchTickChanges', ()=>{
 it('flags rows whose last price moved, with the direction', ()=>{
  const before=new Map<string,number|null>([['a',10],['b',20],['c',30],['d',null]]);
  const after=new Map<string,number|null>([['a',10.5],['b',19],['c',30],['d',5],['e',1]]);
  expect([...watchTickChanges(before,after)]).toEqual([['a','up'],['b','down']]);
 });
 it('a value that becomes unavailable never flashes', ()=>{
  expect(watchTickChanges(new Map([['a',1]]),new Map([['a',null]])).size).toBe(0);
 });
});
