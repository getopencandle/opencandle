import {describe,expect,it} from 'vitest';
import {filterScreenerQuickSearch,matchesScreenerQuickSearch,screenerQuickTokens,screenerSnapshotStale,screenerSymbolsText,screenerUpdatedLabel} from '../../src/domain/screener-quick';
import {calendarDayCounts,calendarDayLabel,filterCalendarDay,filterCalendarImportance,groupCalendarRowsByDay,toggleCalendarImportance} from '../../src/domain/calendar-days';
import type {CalendarRow} from '../../src/domain/calendar';

// Domain evidence: screener quick search / copy / refresh snapshot, calendar day strip / groups / importance levels.
const row=(key:string,displayDate:string,importance:'low'|'medium'|'high'|null)=>({key,displayDate,event:{importance}} as unknown as CalendarRow);

describe('screener quick search',()=>{
 it('needs every token somewhere, case-insensitive; empty matches all',()=>{
  expect(screenerQuickTokens('  aa  Nasdaq ')).toEqual(['aa','nasdaq']);
  expect(matchesScreenerQuickSearch(['AAPL','NASDAQ','Apple Inc'],'apple nasdaq')).toBe(true);
  expect(matchesScreenerQuickSearch(['AAPL','NASDAQ'],'apple')).toBe(false);
  expect(matchesScreenerQuickSearch([null,undefined],'')).toBe(true);
  const rows=[{s:'AAA'},{s:'BBB'},{s:'AAB'}];
  expect(filterScreenerQuickSearch(rows,'aa',r=>[r.s]).map(r=>r.s)).toEqual(['AAA','AAB']);
  expect(filterScreenerQuickSearch(rows,' ',r=>[r.s])).toEqual(rows);
 });
 it('copies unique markets comma-separated, the watchlist import shape',()=>{
  expect(screenerSymbolsText(['NASDAQ:AAA',' NASDAQ:BBB ','NASDAQ:AAA',''])).toBe('NASDAQ:AAA,NASDAQ:BBB');
  expect(screenerSymbolsText([])).toBe('');
 });
 it('detects newer local data against a paused snapshot by identity',()=>{
  const a={},b={},doc={};
  const snap={datasets:[a,b],calendar:[doc],takenAt:1};
  expect(screenerSnapshotStale(snap,[a,b],[doc])).toBe(false);
  expect(screenerSnapshotStale(snap,[a,{}],[doc])).toBe(true);
  expect(screenerSnapshotStale(snap,[a],[doc])).toBe(true);
  expect(screenerSnapshotStale(snap,[a,b],undefined)).toBe(true);
  expect(screenerUpdatedLabel(0)).toBe('Update time unknown');
  expect(screenerUpdatedLabel(1_700_000_000)).toMatch(/^Updated \d\d:\d\d:\d\d$/);
 });
});

describe('calendar day strip, groups and importance levels',()=>{
 const rows=[row('a','2026-06-10','high'),row('b','2026-06-10',null),row('c','2026-06-11','low'),row('d','2026-06-09','medium')];
 it('counts days in date order and labels relative days',()=>{
  expect(calendarDayCounts(rows)).toEqual([{date:'2026-06-09',count:1},{date:'2026-06-10',count:2},{date:'2026-06-11',count:1}]);
  expect(calendarDayLabel('2026-06-10','2026-06-10')).toBe('Today, Wed, Jun 10');
  expect(calendarDayLabel('2026-06-11','2026-06-10')).toBe('Tomorrow, Thu, Jun 11');
  expect(calendarDayLabel('2026-06-09','2026-06-10')).toBe('Yesterday, Tue, Jun 9');
  expect(calendarDayLabel('2026-06-20',null)).toBe('Sat, Jun 20');
  expect(calendarDayLabel('bad','2026-06-10')).toBe('bad');
 });
 it('groups consecutive rows and narrows to one day',()=>{
  expect(groupCalendarRowsByDay(rows).map(g=>[g.date,g.rows.length])).toEqual([['2026-06-10',2],['2026-06-11',1],['2026-06-09',1]]);
  expect(filterCalendarDay(rows,'2026-06-10').map(r=>r.key)).toEqual(['a','b']);
  expect(filterCalendarDay(rows,null)).toHaveLength(4);
 });
 it('filters by importance level and never turns every level off',()=>{
  expect(filterCalendarImportance(rows,['low','medium','high'])).toHaveLength(4);
  expect(filterCalendarImportance(rows,['high']).map(r=>r.key)).toEqual(['a']);
  expect(filterCalendarImportance(rows,['low','medium']).map(r=>r.key)).toEqual(['c','d']);
  expect(toggleCalendarImportance(['low','medium','high'],'medium')).toEqual(['low','high']);
  expect(toggleCalendarImportance(['high'],'high')).toEqual(['high']);
  expect(toggleCalendarImportance(['high'],'low')).toEqual(['low','high']);
 });
});
