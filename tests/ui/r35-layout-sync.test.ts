import React from 'react';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {createMultiChartState,resizeMultiChartState,MultiChartGrid,type MultiChartState} from '../../src/ui/MultiChartGrid';
import {planSyncSwitch,planGroupJoin,SYNC_HINTS,SYNC_ITEMS} from '../../src/ui/layout-sync';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import type {BarDataset} from '../../src/domain/types';
import {transitionDrawingScope} from '../../src/ui/drawing-scopes';

// Turning Symbol or Interval sync on, or moving a chart into a link group, brings the linked charts to the
// active chart (reference-style catch-up) in one prepared grid state. SYNTHETIC fixture datasets only; pure planning plus a
// static render of the Layout setup items. Not executable UI evidence.
const atInterval=(data:BarDataset,interval:string):BarDataset=>({...data,resolution:interval,provenance:{...data.provenance,datasetId:data.provenance.datasetId+':'+interval}});
const gme=fixtureDataset('GME',5),spy=fixtureDataset('SPY',5),warrant=fixtureDataset('GME.WS',5);
const universe=[gme,spy,warrant,atInterval(gme,'1h'),atInterval(spy,'1h'),atInterval(warrant,'1h')];
const drawingDoc=(id:string)=>({version:1,drawings:[{id,type:'horizontal_line',paneId:'price',anchors:[{time:gme.bars[0].time,price:10}]}]});
/** Three charts: a GME 1D (active), b SPY 1h, c GME.WS 1D. */
function grid(groups:Record<string,string>={}):MultiChartState{
 let n=0;const state=resizeMultiChartState(createMultiChartState(gme,{appearance:defaultTheme.appearance}),'three-columns',()=>['b','c'][n++]);
 const [a]=state.layout.cells.map(row=>row.id),place=(id:string,data:BarDataset)=>{const row=state.layout.cells.find(cell=>cell.id===id)!;row.symbol=data.instrument.symbol;row.interval=data.resolution;row.group=groups[id]??'default';state.cells[id]=transitionDrawingScope({...state.cells[id],datasetId:data.provenance.datasetId},gme,data);};
 place(a,gme);place('b',atInterval(spy,'1h'));place('c',warrant);state.layout.activeCellId=a;
 state.cells.c={...state.cells.c,drawings:drawingDoc('warrant-line')};
 return state;
}
const row=(state:MultiChartState,id:string)=>state.layout.cells.find(cell=>cell.id===id)!;
describe(' catch-up planning',()=>{
 it('Symbol sync on: every chart in the active group takes the active symbol and keeps its own interval',()=>{
  const before=grid(),a=before.layout.activeCellId,snapshot=JSON.stringify(before),plan=planSyncSwitch(before,{symbol:true},universe)!;
  expect(plan.moved).toEqual(['b','c']);expect(plan.next.layout.sync.symbol).toBe(true);
  expect([row(plan.next,'b').symbol,row(plan.next,'b').interval]).toEqual(['GME','1h']);expect(plan.next.cells.b.datasetId).toBe(gme.provenance.datasetId+':1h');
  expect([row(plan.next,'c').symbol,row(plan.next,'c').interval]).toEqual(['GME','1D']);expect(plan.next.cells[a]).toBe(before.cells[a]);
  expect(JSON.stringify(before)).toBe(snapshot);
 });
 it('Symbol sync on with Interval sync already on also brings the active interval',()=>{
  const before=grid();before.layout.sync.interval=true;const plan=planSyncSwitch(before,{symbol:true},universe)!;
  expect([row(plan.next,'b').symbol,row(plan.next,'b').interval]).toEqual(['GME','1D']);expect(plan.next.cells.b.datasetId).toBe(gme.provenance.datasetId);
 });
 it('Interval sync on: the group takes the active interval and keeps its own symbols',()=>{
  const plan=planSyncSwitch(grid(),{interval:true},universe)!;
  expect(plan.moved).toEqual(['b']);expect([row(plan.next,'b').symbol,row(plan.next,'b').interval]).toEqual(['SPY','1D']);expect(plan.next.cells.b.datasetId).toBe(spy.provenance.datasetId);
 });
 it('only the active chart group follows; charts in other groups and Not linked charts keep their sources',()=>{
  const plan=planSyncSwitch(grid({b:'red',c:'none:c'}),{symbol:true,interval:true},universe);expect(plan).toBeNull();
  const mixed=planSyncSwitch(grid({c:'red'}),{symbol:true},universe)!;expect(mixed.moved).toEqual(['b']);expect(row(mixed.next,'c').symbol).toBe('GME.WS');
 });
 it('switches that bring nothing, and switches turned off, plan nothing (the layout switch alone is published)',()=>{
  const state=grid();expect(planSyncSwitch(state,{crosshair:true},universe)).toBeNull();
  state.layout.sync.symbol=true;expect(planSyncSwitch(state,{symbol:false},universe)).toBeNull();expect(planSyncSwitch(state,{symbol:true},universe)).toBeNull();
 });
 it('a missing linked interval refuses the whole switch with the supplied-history reason',()=>{
  expect(()=>planSyncSwitch(grid(),{interval:true},[gme,spy,warrant,atInterval(spy,'1h')].filter(data=>data!==spy))).toThrow(/No supplied 1D history for SPY/);
 });
 it('a symbol catch-up moves drawings to the new symbol scope, the prior state is untouched, and moving back restores them exactly',()=>{
  const before=grid(),original=structuredClone(before.cells.c.drawings),plan=planSyncSwitch(before,{symbol:true},universe)!;
  expect(plan.next.cells.c.drawings.drawings).toEqual([]);expect(before.cells.c.drawings).toEqual(original);
  const back=transitionDrawingScope(plan.next.cells.c,gme,warrant);expect(back.drawings).toEqual(original);
 });
});
describe(' link group join',()=>{
 it('a chart that joins a group with Symbol sync on takes the group symbol from the active chart',()=>{
  const before=grid({b:'red',c:'red'});before.layout.sync.symbol=true;const plan=planGroupJoin(before,'b','default',universe)!;
  expect(plan.moved).toEqual(['b']);expect(row(plan.next,'b').group).toBe('default');expect(row(plan.next,'b').symbol).toBe('GME');expect(row(plan.next,'b').interval).toBe('1h');
 });
 it('without an active member the first member in layout order leads; with sync off only the group changes',()=>{
  const before=grid({b:'red',c:'blue'});before.layout.sync.symbol=true;const plan=planGroupJoin(before,'b','blue',universe)!;expect(row(plan.next,'b').symbol).toBe('GME.WS');
  const quiet=grid({b:'red',c:'blue'});expect(planGroupJoin(quiet,'b','blue',universe)).toBeNull();expect(planGroupJoin(before,'b','none',universe)).toBeNull();
 });
});
describe(' Layout setup items',()=>{
 it('the six sync items are a labelled group in reference order, each with a hint',()=>{
  expect(SYNC_ITEMS).toEqual(['symbol','interval','crosshair','time','dateRange','drawings']);
  for(const name of SYNC_ITEMS)expect(SYNC_HINTS[name].length).toBeGreaterThan(10);
  expect(SYNC_HINTS.drawings).toMatch(/same symbol/);
  const state=grid(),markup=renderToStaticMarkup(React.createElement(MultiChartGrid,{state,datasets:universe,onChange:()=>{},onReady:()=>{},onActiveCell:()=>{}}));
  expect(markup).toContain('role="group" aria-label="Sync in layout"');for(const name of SYNC_ITEMS)expect(markup).toContain('title="'+SYNC_HINTS[name]+'"');
 });
 it('the grid routes every sync switch and link group change through the catch-up planners',()=>{
  const source=readFileSync('src/ui/MultiChartGrid.tsx','utf8');
  expect(source).toMatch(/planSyncSwitch\(/);expect(source).toMatch(/planGroupJoin\(/);expect(source).toMatch(/port\.alignViewports\(/);expect(source).toMatch(/onChange=\{e=>void syncChange\(name,e\.target\.checked\)\}/);
 });
});
