import {describe,expect,it} from 'vitest';
import {calendarDemoAnchor,createSyntheticCalendarDemo} from '../../src/domain/calendar';
import {DEMO_SYMBOLS,fixtureDataset} from '../../src/domain/fixtures';
import {sourceOptionLabel} from '../../src/domain/data-setup';

describe('RI2-C demo calendar aligns with the demo charts',()=>{
 it('places events around the last demo bar with demo symbols',()=>{
  const anchor=calendarDemoAnchor(),bars=fixtureDataset('GME').bars,last=bars[bars.length-1]!.time;
  expect(anchor.lastBarTime).toBe(last);
  const demo=createSyntheticCalendarDemo(Date.parse('2026-10-28T12:00:00Z')/1000,anchor);
  const lastDate=new Date(last*1000).toISOString().slice(0,10);
  const symbols=demo.events.filter(e=>e.symbol).map(e=>e.symbol!);
  expect(symbols.length).toBeGreaterThan(0);
  for(const s of symbols)expect(DEMO_SYMBOLS).toContain(s);
  expect(demo.events.some(e=>e.symbol&&e.date<=lastDate)).toBe(true);
  expect(demo.events.some(e=>e.symbol&&e.date>lastDate)).toBe(true);
  for(const e of demo.events)if(e.symbol)expect(e.date>='2025-01-01'&&e.date<='2026-01-31').toBe(true);
  expect(JSON.stringify(demo.events)).not.toContain('SYNTH1');
 });
 it('keeps the unanchored demo unchanged',()=>{
  expect(createSyntheticCalendarDemo(1790000000).events.some(e=>e.symbol==='SYNTH1')).toBe(true);
 });
 it('names the demo source plainly in the pane source list',()=>{
  const label=sourceOptionLabel(fixtureDataset('MSFT'));
  expect(label).toContain('Example data');expect(label).not.toContain('SYNTHETIC');
 });
});
