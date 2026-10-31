import {describe,expect,it} from 'vitest';
import {createLayoutPort,createLayoutSnapshot,LV_LAYOUTS} from '../../src/chart/layout-port';
import type {ChartController} from '../../src/chart/adapter';
// WSX phase 2: the three layout propagations that had no test (crosshair, time, date range), plus group scope,
// maximize, and the layout counts. layout-port.ts is read only here. Model/port level; no executable UI evidence.
type Range={from:number;to:number};
function fake(initial:Range){
 let range={...initial};const viewport:(()=>void)[]=[],cross:((event:{time:number;price:number})=>void)[]=[];const external:{time:number;price:number|undefined}[]=[];let resizes=0;
 const controller={chart:{on:(name:string,fn:()=>void)=>{if(name==='viewport:changed')viewport.push(fn);return()=>{};},getVisibleRange:()=>({...range}),setVisibleRange:(next:Range)=>{range={...next};},renderer:{onCrosshairMove:(fn:(event:{time:number;price:number})=>void)=>{cross.push(fn);return()=>{};},setExternalCrosshair:(time:number,price:number|undefined)=>{external.push({time,price});}}},onDrawingsChanged:()=>()=>{},saveDrawings:()=>({drawings:[]}),loadDrawings:()=>{},resize:()=>{resizes++;}} as unknown as ChartController;
 return{controller,get range(){return range;},set range(value:Range){range=value;},scroll(next:Range){range={...next};for(const fn of viewport)fn();},hover(event:{time:number;price:number}){for(const fn of cross)fn(event);},external,get resizes(){return resizes;}};
}
function make(sync:Partial<ReturnType<typeof createLayoutSnapshot>['sync']>,groups:Record<string,string>={}){
 const layout=createLayoutSnapshot(3,{cellIds:['a','b','c'],symbol:'GME'});Object.assign(layout.sync,sync);for(const cell of layout.cells)cell.group=groups[cell.id]??'default';
 const port=createLayoutPort(layout);const a=fake({from:0,to:100}),b=fake({from:20,to:60}),c=fake({from:5,to:15});port.mount('a',a.controller);port.mount('b',b.controller);port.mount('c',c.controller);return{port,a,b,c,layout};
}
describe('WSX layout sync propagation',()=>{
 it('date range sync copies the visible range to every same-group chart (SYNC_DATE_RANGE)',()=>{
  const {port,a,b,c}=make({dateRange:true});a.scroll({from:40,to:90});
  expect(b.range).toEqual({from:40,to:90});expect(c.range).toEqual({from:40,to:90});port.dispose();
 });
 it('time sync keeps each target span and aligns the right edge (SYNC_TIME)',()=>{
  const {port,a,b,c}=make({time:true});a.scroll({from:50,to:120});
  expect(b.range).toEqual({from:120-40,to:120});expect(c.range).toEqual({from:120-10,to:120});expect(a.range).toEqual({from:50,to:120});port.dispose();
 });
 it('date range wins over time when both are on, and neither moves a chart with both off',()=>{
  const both=make({dateRange:true,time:true});both.a.scroll({from:10,to:30});expect(both.b.range).toEqual({from:10,to:30});both.port.dispose();
  const off=make({});off.a.scroll({from:10,to:30});expect(off.b.range).toEqual({from:20,to:60});expect(off.c.range).toEqual({from:5,to:15});off.port.dispose();
 });
 it('crosshair sync shares time and price for the same symbol and time only for a different symbol (SYNC_CROSSHAIR)',()=>{
  const {port,a,b,c,layout}=make({crosshair:true});
  // cells share the symbol GME at creation; give c another symbol through a fresh layout
  a.hover({time:1000,price:12.5});expect(b.external).toEqual([{time:1000,price:12.5}]);expect(c.external).toEqual([{time:1000,price:12.5}]);port.dispose();
  const mixed=createLayoutSnapshot(2,{cellIds:['x','y'],symbol:'GME'});mixed.cells[1].symbol='SPY';mixed.sync.crosshair=true;
  const mixedPort=createLayoutPort(mixed),x=fake({from:0,to:10}),y=fake({from:0,to:10});mixedPort.mount('x',x.controller);mixedPort.mount('y',y.controller);
  x.hover({time:2000,price:99});expect(y.external).toEqual([{time:2000,price:undefined}]);
  y.hover({time:3000,price:7});expect(x.external).toEqual([{time:3000,price:undefined}]);mixedPort.dispose();expect(layout.sync.crosshair).toBe(true);
 });
 it('crosshair sync off sends nothing',()=>{
  const {port,a,b}=make({});a.hover({time:5,price:1});expect(b.external).toEqual([]);port.dispose();
 });
 it('propagation stays inside the cell group (scope is the group)',()=>{
  const {port,a,b,c}=make({dateRange:true,crosshair:true},{a:'one',b:'one',c:'two'});
  a.scroll({from:40,to:90});expect(b.range).toEqual({from:40,to:90});expect(c.range).toEqual({from:5,to:15});
  a.hover({time:9,price:2});expect(b.external).toHaveLength(1);expect(c.external).toHaveLength(0);port.dispose();
 });
 it('a propagated range is applied to the other chart exactly once per move',()=>{
  const {port,a,b}=make({dateRange:true});let echoes=0;const original=b.controller.chart.setVisibleRange.bind(b.controller.chart);
  b.controller.chart.setVisibleRange=((range:Range)=>{echoes++;return original(range);}) as never;a.scroll({from:1,to:2});expect(echoes).toBe(1);port.dispose();
 });
 it('symbol and interval sync switches are plain booleans and unknown switches are refused (SYNC_SYMBOL, SYNC_INTERVAL)',()=>{
  const {port}=make({});port.sync({symbol:true,interval:true});expect(port.snapshot().sync).toMatchObject({symbol:true,interval:true,crosshair:false});
  expect(()=>port.sync({symbol:'yes'} as never)).toThrow('Sync switches must be boolean');expect(()=>port.sync({bogus:true} as never)).toThrow('Unknown sync setting');port.dispose();
 });
 it('maximize and restore flip the persisted cell and resize every mounted chart (MAXIMIZE_ACTIVE_CHART)',()=>{
  const {port,a,b}=make({});port.maximize('b');expect(port.snapshot().maximizedCellId).toBe('b');expect(a.resizes+b.resizes).toBeGreaterThanOrEqual(2);
  port.maximize(null);expect(port.snapshot().maximizedCellId).toBeNull();expect(()=>port.maximize('missing')).toThrow('Unknown cell');port.dispose();
 });
 it('the layout presets map the ten count leaves to OpenCandle geometries',()=>{
  const by=Object.fromEntries(LV_LAYOUTS.map(row=>[row.id,row]));
  const expected={single:[1,1,1],'two-columns':[2,1,2],'two-rows':[1,2,2],'three-columns':[3,1,3],'three-rows':[1,3,3],four:[2,2,4],six:[3,2,6],eight:[4,2,8],ten:[5,2,10],twelve:[4,3,12],sixteen:[4,4,16]} as const;
  for(const [id,[columns,rows,count]] of Object.entries(expected)){expect(by[id]).toMatchObject({columns,rows,count});expect(columns*rows).toBe(count);}
  for(const row of LV_LAYOUTS)expect(createLayoutSnapshot(row.count).cells).toHaveLength(row.count);
 });
});
