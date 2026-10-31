import {describe,it,expect} from 'vitest';
import {tradingSessions,sessionMinute,sessionZone} from '../../src/domain/indicators-ext/trading-sessions';
import {bars,windows,syntheticSource,observed,stamp} from '../fixtures/r42-trading-sessions';
describe(' original observed trading windows on SYNTHETIC data',()=>{
 it('includes opening boundary, excludes closing boundary, and uses literal OHLC statistics',()=>{
  const result=tradingSessions(bars,windows({}),syntheticSource),record=result.sessions[0];
  expect(result.series).toEqual([[null,10,12,null],[null,null,null,null],[null,null,null,null]]);
  expect(record).toMatchObject({first:1,last:2,count:2,from:stamp('2024-06-03T13:00:00Z'),to:stamp('2024-06-03T13:02:00Z'),open:10,close:14,high:15,low:9,average:12,rangeTicks:6,available:true});
 });
 it('includes a whole overlapping bar by its open without clipping its OHLC or duration',()=>{
  const result=tradingSessions([observed('2024-06-03T13:55:00Z',20)],windows({}),{...syntheticSource,resolution:'30m'});
  expect(result.sessions[0]).toMatchObject({from:stamp('2024-06-03T13:55:00Z'),to:stamp('2024-06-03T14:25:00Z'),high:21,low:19});
 });
 it('groups overnight observations under their starting local date without filling absent rows',()=>{
  const rows=['2024-06-03T21:59:00Z','2024-06-03T22:00:00Z','2024-06-03T23:30:00Z','2024-06-04T00:00:00Z','2024-06-04T01:59:00Z','2024-06-04T02:00:00Z'].map((time,index)=>observed(time,index*10));
  const result=tradingSessions(rows,windows({start:'22:00',end:'02:00'}),syntheticSource);
  expect(result.series[0]).toEqual([null,10,15,20,25,null]);expect(result.sessions).toHaveLength(1);expect(result.sessions[0]).toMatchObject({day:stamp('2024-06-03T00:00:00Z')/86400,count:4,average:25,rangeTicks:32});
 });
 it('equal clocks mean one local day anchored at that clock, not an empty window',()=>{
  const rows=[observed('2024-06-03T17:00:00Z',10),observed('2024-06-03T18:00:00Z',20),observed('2024-06-04T17:00:00Z',30)];
  const result=tradingSessions(rows,windows({start:'18:00',end:'18:00'}),syntheticSource);expect(result.sessions.map(row=>[row.count,row.average])).toEqual([[1,10],[2,25]]);expect(result.series[0]).toEqual([10,20,25]);
 });
 it('New York spring gap never manufactures 02:00 observations and applies the end boundary after DST',()=>{
  const rows=[observed('2024-03-10T06:30:00Z',10),observed('2024-03-10T07:00:00Z',20),observed('2024-03-10T07:30:00Z',30)];
  const result=tradingSessions(rows,windows({start:'01:00',end:'03:00',zone:'America/New_York'}),syntheticSource);expect(result.series[0]).toEqual([10,null,null]);expect(result.sessions[0].count).toBe(1);
 });
 it('both New York fold occurrences participate in the same session using their real openings',()=>{
  const rows=[observed('2024-11-03T05:15:00Z',10),observed('2024-11-03T05:45:00Z',20),observed('2024-11-03T06:15:00Z',30)];
  const result=tradingSessions(rows,windows({start:'01:00',end:'01:30',zone:'America/New_York'}),syntheticSource);expect(result.series[0]).toEqual([10,null,20]);expect(result.sessions).toHaveLength(1);expect(result.sessions[0]).toMatchObject({count:2,average:20,high:31,low:9});
 });
 it('handles Lord Howe half-hour gap within a UTC hour',()=>{
  const rows=[observed('2024-10-05T15:15:00Z',10),observed('2024-10-05T15:30:00Z',20),observed('2024-10-05T16:00:00Z',30)];
  const result=tradingSessions(rows,windows({start:'02:00',end:'03:00',zone:'Australia/Lord_Howe'}),syntheticSource);expect(result.series[0]).toEqual([null,20,null]);expect(result.sessions[0].count).toBe(1);
 });
 it('handles both Lord Howe half-hour fold occurrences without duplicating a supplied row',()=>{
  const rows=[observed('2024-04-06T14:45:00Z',10),observed('2024-04-06T15:15:00Z',30)];
  const result=tradingSessions(rows,windows({start:'01:30',end:'02:00',zone:'Australia/Lord_Howe'}),syntheticSource);expect(result.series[0]).toEqual([10,20]);expect(result.sessions).toHaveLength(1);expect(result.sessions[0].count).toBe(2);
 });
 it('uses a fixed minute offset without DST work and blank zones require actual exchange metadata',()=>{
  const rows=[observed('2024-06-03T00:00:00Z',10),observed('2024-06-03T00:30:00Z',20)],configuration=windows({start:'05:30',end:'06:00',zone:'UTC+05:30'});
  const result=tradingSessions(rows,configuration,syntheticSource);expect(result.series[0]).toEqual([10,null]);expect(result.timezoneReads).toBe(0);
  expect(tradingSessions(rows,windows({start:'05:30',end:'06:00',zone:''}),{...syntheticSource,exchangeZone:'Asia/Kolkata'}).series[0]).toEqual([10,null]);
  expect(()=>tradingSessions(rows,windows({zone:''}),{...syntheticSource,exchangeZone:null})).toThrow('exchange time zone');
 });
 it('validates enabled clocks and zones before traversing any history',()=>{
  expect(sessionMinute('23:59')).toBe(1439);for(const time of ['24:00','9:30','09:60','09:30:00',''])expect(()=>sessionMinute(time)).toThrow('HH:mm');
  expect(sessionZone('UTC-14:00').offset).toBe(-50400);expect(()=>sessionZone('UTC+14:01')).toThrow('UTC-14:00');expect(()=>sessionZone('SYNTHETIC/Unknown')).toThrow('supported IANA');
  expect(()=>tradingSessions(bars,windows({start:''}),syntheticSource)).toThrow('HH:mm');
 });
 it('disabled blank windows and empty history stay empty without invented clock defaults',()=>{
  const result=tradingSessions([],windows(),syntheticSource);expect(result.series).toEqual([[],[],[]]);expect(result.sessions).toEqual([]);expect(result.diagnostics).toContain('Configure and enable a trading session window to draw its observations.');
 });
 it('future changes never alter earlier prefix values and returned records are immutable',()=>{
  const prefix=tradingSessions(bars.slice(0,2),windows({}),syntheticSource),full=tradingSessions(bars,windows({}),syntheticSource);
  expect(full.series[0].slice(0,2)).toEqual(prefix.series[0]);expect(prefix.sessions[0].average).toBe(10);expect(full.sessions[0].average).toBe(12);
  expect(Object.isFrozen(full.sessions)).toBe(true);expect(Object.isFrozen(full.sessions[0])).toBe(true);expect(Object.isFrozen(full.series[0])).toBe(true);
 });
 it('an invalid price makes only its observed session unavailable without changing an earlier prefix',()=>{
  const rows=[...bars.slice(1,3),observed('2024-06-04T13:00:00Z',50)];rows[1]={...rows[1],high:NaN};const result=tradingSessions(rows,windows({}),syntheticSource);
  expect(result.series[0]).toEqual([10,null,50]);expect(result.sessions.map(row=>row.available)).toEqual([false,true]);expect(result.diagnostics.join(' ')).toContain('invalid supplied prices');
 });
 it('refuses ambiguous time ordering, event/daily sources and derived-price styles',()=>{
  for(const rows of [[bars[1],bars[1]],[bars[2],bars[1]]])expect(()=>tradingSessions(rows,windows({}),syntheticSource)).toThrow('strictly increasing');
  for(const resolution of ['1D','1W','1M','10R'])expect(()=>tradingSessions(bars,windows({}),{...syntheticSource,resolution})).toThrow('intraday');
  for(const style of ['renko','heikinashi',null])expect(()=>tradingSessions(bars,windows({}),{...syntheticSource,style})).toThrow('supported time-based');
 });
 it('shares a zone clock between three windows and bounds formatting by UTC hours, not observations',()=>{
  const rows=Array.from({length:5000},(_,index)=>({...bars[1],time:bars[1].time+index*60}));
  const result=tradingSessions(rows,windows({zone:'America/New_York',start:'00:00',end:'00:00'},{zone:'America/New_York',start:'00:00',end:'00:00'},{zone:'America/New_York',start:'00:00',end:'00:00'}),syntheticSource);
  expect(result.timezoneReads).toBeLessThanOrEqual(2*(Math.ceil(rows.length/60)+1));expect(result.series[0]).toEqual(result.series[1]);expect(result.sessions.every(row=>row.count>0)).toBe(true);
 });
});
