import {describe,expect,it} from 'vitest';
import {createLayoutPort,createLayoutSnapshot} from '../../src/chart/layout-port';
import type {ChartController} from '../../src/chart/adapter';
// Ghost crosshair hygiene, the viewport catch-up seam and the quiet sync switch of the layout port.
// SYNTHETIC controllers only (no renderer). Model/port level; not executable UI evidence.
type Range={from:number;to:number};
type Cross={time:number|null;price:number|null;paneKind?:'price'|'study'|null};
function fake(initial:Range){
 let range={...initial};const viewport:(()=>void)[]=[],cross:((event:Cross)=>void)[]=[];const external:{time:number|null;price:number|null|undefined}[]=[];
 const controller={chart:{on:(name:string,fn:()=>void)=>{if(name==='viewport:changed')viewport.push(fn);return()=>{};},getVisibleRange:()=>({...range}),setVisibleRange:(next:Range)=>{range={...next};for(const fn of viewport)fn();},renderer:{onCrosshairMove:(fn:(event:Cross)=>void)=>{cross.push(fn);return()=>{};},setExternalCrosshair:(time:number|null,price?:number|null)=>{external.push({time,price});}}},onDrawingsChanged:()=>()=>{},saveDrawings:()=>({drawings:[]}),loadDrawings:()=>{},resize:()=>{}} as unknown as ChartController;
 return{controller,get range(){return range;},hover(event:Cross){for(const fn of cross)fn(event);},external};
}
function make(sync:Partial<ReturnType<typeof createLayoutSnapshot>['sync']>,groups:Record<string,string>={},symbols:Record<string,string>={}){
 const layout=createLayoutSnapshot(3,{cellIds:['a','b','c'],symbol:'GME'});Object.assign(layout.sync,sync);for(const cell of layout.cells){cell.group=groups[cell.id]??'default';cell.symbol=symbols[cell.id]??cell.symbol;}
 const port=createLayoutPort(layout),a=fake({from:0,to:100}),b=fake({from:20,to:60}),c=fake({from:5,to:15});
 const off={a:port.mount('a',a.controller),b:port.mount('b',b.controller),c:port.mount('c',c.controller)};return{port,a,b,c,off};
}
describe(' crosshair ghost',()=>{
 it('the cursor leaving the source clears the ghost on every target',()=>{
  const {port,a,b,c}=make({crosshair:true});a.hover({time:1000,price:12,paneKind:'price'});a.hover({time:null,price:null,paneKind:null});
  expect(b.external.at(-1)).toEqual({time:null,price:undefined});expect(c.external.at(-1)).toEqual({time:null,price:undefined});port.dispose();
 });
 it('a study-pane cursor shares the time only, never the study value as a price',()=>{
  const {port,a,b}=make({crosshair:true});a.hover({time:2000,price:55,paneKind:'study'});expect(b.external).toEqual([{time:2000,price:undefined}]);
  a.hover({time:2100,price:12.5,paneKind:'price'});expect(b.external.at(-1)).toEqual({time:2100,price:12.5});port.dispose();
 });
 it('turning crosshair sync off removes a ghost that is showing',()=>{
  const {port,a,b,c}=make({crosshair:true});a.hover({time:1000,price:12});const shown=b.external.length;
  port.sync({crosshair:false});expect(b.external.slice(shown)).toEqual([{time:null,price:undefined}]);expect(c.external.at(-1)).toEqual({time:null,price:undefined});
  a.hover({time:1100,price:13});expect(b.external).toHaveLength(shown+1);port.dispose();
 });
 it('retiring the layout owner or the source chart clears its ghosts, and only the charts that show one are touched',()=>{
  const first=make({crosshair:true});first.a.hover({time:5,price:1});first.port.dispose();expect(first.b.external.at(-1)).toEqual({time:null,price:undefined});expect(first.a.external).toEqual([]);
  const second=make({crosshair:true});second.a.hover({time:5,price:1});second.off.a();expect(second.c.external.at(-1)).toEqual({time:null,price:undefined});
  const idle=make({crosshair:true});idle.port.dispose();expect(idle.b.external).toEqual([]);second.port.dispose();
 });
 it('a different symbol gets the time only; a chart outside the group is never given a ghost',()=>{
  const {port,a,b,c}=make({crosshair:true},{c:'red'},{b:'SPY'});a.hover({time:9,price:3});expect(b.external).toEqual([{time:9,price:undefined}]);expect(c.external).toEqual([]);port.dispose();
 });
});
describe(' viewport catch-up',()=>{
 it('alignViewports applies the time rule to the group from the source and does not echo further',()=>{
  const {port,a,b,c}=make({},{c:'red'});const ids=port.alignViewports('a',{...port.snapshot().sync,time:true});
  expect(ids).toEqual(['b']);expect(b.range).toEqual({from:100-40,to:100});expect(c.range).toEqual({from:5,to:15});expect(a.range).toEqual({from:0,to:100});port.dispose();
 });
 it('alignViewports applies the date range rule, which wins over time',()=>{
  const {port,b,c}=make({});const ids=port.alignViewports('a',{...port.snapshot().sync,time:true,dateRange:true});
  expect(ids).toEqual(['b','c']);expect(b.range).toEqual({from:0,to:100});expect(c.range).toEqual({from:0,to:100});port.dispose();
 });
 it('alignViewports with both switches off moves nothing',()=>{
  const {port,b}=make({});expect(port.alignViewports('a',port.snapshot().sync)).toEqual([]);expect(b.range).toEqual({from:20,to:60});port.dispose();
 });
 it('a quiet sync switch changes the port state without notifying subscribers; the default still notifies',()=>{
  const {port}=make({});let calls=0;port.subscribe(()=>{calls++;});port.sync({time:true},{notify:false});expect(port.snapshot().sync.time).toBe(true);expect(calls).toBe(0);
  port.sync({dateRange:true});expect(calls).toBe(1);port.dispose();
 });
});
