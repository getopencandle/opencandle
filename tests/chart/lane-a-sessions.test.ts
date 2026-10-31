// Extended hours and pane geometry for the per-pane legend.
// SYNTHETIC bars only, hand-placed on New York wall-clock minutes.
import {describe,expect,it} from 'vitest';
import {newYorkTime} from '../../src/chart/axis-labels';
import {barIntervalMs,barSessionPhase,regularSessionBars,sessionZonesFor,sessionsApply} from '../../src/chart/session-zones';
import {paneGeometryOf} from '../../src/chart/pane-geometry';
import {readFileSync} from 'node:fs';

const at=(h:number,m:number)=>newYorkTime(2026,10,20,h*60+m)/1000; // seconds, as ChartController bars carry them
const bar=(time:number)=>({time,open:1,high:1,low:1,close:1,volume:1});

describe('gap 9: pre and post market sessions',()=>{
 it('classifies a bar open by the New York wall clock (04:00, 09:30, 16:00, 20:00 edges)',()=>{
  expect([at(3,59),at(4,0),at(9,29),at(9,30),at(15,59),at(16,0),at(19,59),at(20,0)].map(t=>barSessionPhase(t*1000))).toEqual(['overnight','pre','pre','regular','regular','post','post','overnight']);
 });
 it('applies to US equity intraday only',()=>{
  expect(sessionsApply('stock','America/New_York',60_000)).toBe(true);
  expect(sessionsApply('etf','America/New_York',300_000)).toBe(true);
  expect(sessionsApply('stock','America/New_York',86_400_000)).toBe(false);
  expect(sessionsApply('crypto','UTC',60_000)).toBe(false);
 });
 it('zones cover each contiguous pre or post run, from the first open to the last bar end, in ms',()=>{
  const bars=[at(9,0),at(9,15),at(9,30),at(9,45),at(15,45),at(16,0),at(16,15)].map(bar);
  expect(sessionZonesFor(bars,15*60_000)).toEqual({pre:[[at(9,0)*1000,at(9,30)*1000]],post:[[at(16,0)*1000,at(16,30)*1000]],extended:[]});
  expect(sessionZonesFor([at(10,0)].map(bar),60_000)).toEqual({pre:[],post:[],extended:[]});
  expect([barIntervalMs(bars),barIntervalMs([])]).toEqual([15*60_000,0]);
 });
 it('regular-only data keeps 09:30 to 16:00 bars',()=>{
  const bars=[at(9,0),at(9,30),at(15,59),at(16,0)].map(bar);
  expect(regularSessionBars(bars).map(row=>row.time)).toEqual([at(9,30),at(15,59)]);
 });
 it('pane geometry lists each pane top and height in pane order, collapsed panes included',()=>{
  const scene={orderedPanes:()=>[{id:'price',bounds:{top:0,height:300},collapsed:false},{id:'pane-2',bounds:{top:300,height:100},collapsed:true}]};
  expect(paneGeometryOf(scene)).toEqual([{id:'price',top:0,height:300,collapsed:false},{id:'pane-2',top:300,height:100,collapsed:true}]);
  expect(paneGeometryOf({})).toEqual([]);
 });
 it('the controller exposes session mode and pane geometry',()=>{
  const source=readFileSync('src/chart/adapter.ts','utf8');
  expect(source).toMatch(/setSessionMode:\(mode:SessionMode\)=>/);
  expect(source).toMatch(/paneGeometry:\(\)=>/);
 });
});
