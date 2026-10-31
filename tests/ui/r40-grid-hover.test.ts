import {describe,expect,it,vi} from 'vitest';
import {cellCrosshairWatch,createCellCrosshairWatch,createGridHoverStore,createHoverFeedCache,gridHoverStore,hoveredInspection,legendGhostTime,nextGridHover,syncedLegendInspection,type DataWindowFeed,type GridHover,type HoverChart,type HoverGrid} from '../../src/ui/grid-hover';
import {buildDataWindow} from '../../src/ui/data-window-model';
import {dataWindowView} from '../../src/ui/DataWindowPanel';
import {sourceContextForInput} from '../../src/chart/adapter';
import type {Bar,BarDataset} from '../../src/domain/types';
import type {Inspection} from '../../src/ui/DataWindow';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';

// The Data window follows the hovered chart of a layout; the legend follows a synced crosshair.
// SYNTHETIC fixtures only: two invented symbols (AAA, BBB) with three daily bars each; values are hand-worked literals.
const day=86400,start=1782864000;
const aBars:Bar[]=[{time:start,open:10,high:11,low:9,close:10.5,volume:100},{time:start+day,open:10.5,high:12,low:10,close:11.5,volume:200},{time:start+2*day,open:11.5,high:13,low:11,close:12.5,volume:300}];
const bBars:Bar[]=[{time:start,open:50,high:52,low:49,close:51,volume:1000},{time:start+day,open:51,high:55,low:50,close:54,volume:2000},{time:start+2*day,open:54,high:56,low:53,close:55,volume:3000}];
// Use complete synthetic provenance so source-basis validation exercises the same boundary as real controllers.
const dataset=(symbol:string,bars:Bar[]):BarDataset=>{const base=fixtureDataset('GME',3);return{...base,instrument:{...base.instrument,id:'synthetic-'+symbol,symbol,name:symbol+' synthetic',timezone:'America/New_York'},resolution:'1D',bars,provenance:{...base.provenance,datasetId:'synthetic-'+symbol,revision:'1',fixture:true}};};
const datasets=[dataset('AAA',aBars),dataset('BBB',bBars)];
function inspectionFor(bars:Bar[],hovered:number|null,datasetId:string):Inspection{
 const index=hovered===null?bars.length-1:bars.findIndex(bar=>bar.time===hovered),bar=index>=0?{...bars[index]}:null,flag=hovered!==null&&index>=0;
 return {pending:false,source:sourceContextForDataset(datasets.find(row=>row.provenance.datasetId===datasetId)!,bars),series:{count:bars.length,firstTime:bars[0].time,lastTime:bars.at(-1)!.time,style:'candles'},readout:null,crosshair:null,standard:{index,bar,hovered:flag},displayed:{index,bar,hovered:flag}} as unknown as Inspection;
}
function fakeChart(bars:Bar[],datasetId:string){
 const crosshair=new Set<(event:{time:number|null})=>void>(),indicatorSubscribers=new Set<()=>void>();
 let hovered:number|null=null,views:unknown[]=[],pending=false;
 const chart={
  reads:{bars:0,views:0},
  getDataWindow:()=>({...inspectionFor(bars,hovered,datasetId),pending}),
  getSourceBars:()=>{chart.reads.bars++;return structuredClone(bars);},
  getCalculationBars:()=>structuredClone(bars),
  getStyle:()=>'candles',
  onCrosshair:(fn:(event:{time:number|null})=>void)=>{crosshair.add(fn);return()=>crosshair.delete(fn);},
  indicators:{list:()=>{chart.reads.views++;return views;},subscribe:(fn:()=>void)=>{indicatorSubscribers.add(fn);return()=>indicatorSubscribers.delete(fn);},values:()=>null},
  move(time:number|null){hovered=time;for(const fn of [...crosshair])fn({time});},
  setViews(next:unknown[]){views=next;for(const fn of [...indicatorSubscribers])fn();},
  replaceBars(next:Bar[]){bars=next;},
  setPending(value:boolean){pending=value;},
  listeners:()=>crosshair.size,indicatorListeners:()=>indicatorSubscribers.size,
 };
 return chart;
}
const grid=(sync=false,groups:[string,string]=['default','default'],maximized:string|null=null):HoverGrid=>({layout:{activeCellId:'a',maximizedCellId:maximized,cells:[{id:'a',symbol:'AAA',interval:'1D',group:groups[0]},{id:'b',symbol:'BBB',interval:'1D',group:groups[1]}],sync:{symbol:false,interval:false,crosshair:sync,time:false,dateRange:false,drawings:false}},cells:{a:{datasetId:'synthetic-AAA',chartOptions:{timezone:'UTC'}},b:{datasetId:'synthetic-BBB',chartOptions:{timezone:'America/New_York'}}}});
const activeFeed=():DataWindowFeed=>({chart:null,dataset:datasets[0],bars:aBars,sourceBars:aBars,inspection:inspectionFor(aBars,null,'synthetic-AAA'),indicators:[],timezone:'UTC',timeHours:'24',dateFormat:'yyyy-MM-dd'});
const hoverOn=(chart:ReturnType<typeof fakeChart>,time:number,cellId='b'):GridHover=>{chart.move(time);return nextGridHover(null,cellId,chart as unknown as HoverChart,time)!;};
const rowsOf=(feed:DataWindowFeed)=>{const view=dataWindowView(feed,new Set());return view?.sections[0].rows.map(row=>[row.label,row.value])??null;};

describe('the Data window follows the hovered cell',()=>{
 it('shows the hovered chart: its symbol, bar, timezone and values, not the active chart',()=>{
  const b=fakeChart(bBars,'synthetic-BBB'),cache=createHoverFeedCache();
  const feed=cache.feed(activeFeed(),hoverOn(b,start+day),grid(),datasets,null);
  expect(feed.chart).toBe(b);expect(feed.dataset?.instrument.symbol).toBe('BBB');expect(feed.timezone).toBe('America/New_York');
  expect(feed.inspection?.displayed.bar?.close).toBe(54);
  const rows=rowsOf(feed)!;expect(rows).toContainEqual(['Close','54.00']);expect(rows).toContainEqual(['Open','51.00']);
  expect(buildDataWindow).toBeTypeOf('function');
 });
 it('falls back to the active chart when the pointer is on it, has left, or the hovered cell is gone or hidden',()=>{
  const b=fakeChart(bBars,'synthetic-BBB'),cache=createHoverFeedCache(),active=activeFeed(),hover=hoverOn(b,start+day);
  expect(cache.feed(active,null,grid(),datasets)).toBe(active);
  expect(cache.feed(active,{...hover,cellId:'a'},grid(),datasets)).toBe(active);
  expect(cache.feed(active,{...hover,cellId:'gone'},grid(),datasets)).toBe(active);
  expect(cache.feed(active,hover,grid(false,['default','default'],'a'),datasets)).toBe(active);
  expect(cache.feed(active,hover,grid(),[datasets[0]])).toBe(active);
 });
 it('a pending or mismatched hovered inspection shows the last bar, never another chart\'s bar',()=>{
  const b=fakeChart(bBars,'synthetic-BBB'),cache=createHoverFeedCache(),hover=hoverOn(b,start+day);
  b.setPending(true);const pending=cache.feed(activeFeed(),hover,grid(),datasets);
  expect(pending.chart).toBe(b);expect(pending.inspection).toBeNull();expect(rowsOf(pending)).toContainEqual(['Close','55.00']);
  const shown=hover.inspection;expect(hoveredInspection(shown,bBars,bBars,'candles')).toBe(shown);
  expect(hoveredInspection(shown,bBars,bBars,'line')).toBeNull();
  expect(hoveredInspection(shown,bBars.slice(0,2),bBars.slice(0,2),'candles')).toBeNull();
  expect(hoveredInspection(shown,bBars,[bBars[0],{...bBars[1],time:bBars[1].time+1},bBars[2]],'candles')).toBeNull();
 });
 it('reads bars once per change and indicator views once per notification, not per crosshair frame',()=>{
  const b=fakeChart(bBars,'synthetic-BBB'),cache=createHoverFeedCache();
  for(const time of [start,start+day,start+2*day,start+day])cache.feed(activeFeed(),hoverOn(b,time),grid(),datasets);
  expect(b.reads).toEqual({bars:1,views:1});
  b.setViews([]);cache.feed(activeFeed(),hoverOn(b,start),grid(),datasets);expect(b.reads.views).toBe(2);
 });
 it('re-reads after a restore or undo replaces the bars, and drops a replaced controller with its subscription',()=>{
  const b=fakeChart(bBars,'synthetic-BBB'),cache=createHoverFeedCache();
  cache.feed(activeFeed(),hoverOn(b,start),grid(),datasets);
  const restored=bBars.map(bar=>({...bar,close:bar.close+1}));b.replaceBars(restored);
  const feed=cache.feed(activeFeed(),hoverOn(b,start+day),grid(),datasets);expect(b.reads.bars).toBe(2);expect(rowsOf(feed)).toContainEqual(['Close','55.00']);
  const next=fakeChart(bBars,'synthetic-BBB');cache.feed(activeFeed(),hoverOn(next,start),grid(),datasets);
  expect(b.indicatorListeners()).toBe(0);expect(next.indicatorListeners()).toBe(1);expect(cache.cachedChart()).toBe(next);
  cache.dispose();expect(next.indicatorListeners()).toBe(0);
 });
 it('a hovered chart that throws falls back to the active chart',()=>{
  const b=fakeChart(bBars,'synthetic-BBB'),cache=createHoverFeedCache(),hover=hoverOn(b,start);
  (b as {getSourceBars:()=>Bar[]}).getSourceBars=()=>{throw new Error('retired');};
  const active=activeFeed();expect(cache.feed(active,hover,grid(),datasets)).toBe(active);
 });
});

describe('hover reports',()=>{
 it('a leave clears only the cell that left; an enter reads that chart',()=>{
  const a=fakeChart(aBars,'synthetic-AAA'),b=fakeChart(bBars,'synthetic-BBB');
  const onB=nextGridHover(null,'b',b as unknown as HoverChart,start);expect(onB?.cellId).toBe('b');
  expect(nextGridHover(onB,'a',null,null)).toBe(onB);expect(nextGridHover(onB,'b',b as unknown as HoverChart,null)).toBeNull();
  expect(nextGridHover(onB,'a',a as unknown as HoverChart,start)?.cellId).toBe('a');
 });
 it('one crosshair subscription per cell; a retired, replaced or removed chart reports a leave and stops reporting',()=>{
  const emit=vi.fn(),watch=createCellCrosshairWatch(emit),a=fakeChart(aBars,'synthetic-AAA'),b=fakeChart(bBars,'synthetic-BBB');
  watch.attach('a',a as unknown as HoverChart);watch.attach('a',a as unknown as HoverChart);watch.attach('b',b as unknown as HoverChart);
  expect(a.listeners()).toBe(1);b.move(start);expect(emit).toHaveBeenLastCalledWith('b',b,start);
  watch.attach('b',null);expect(b.listeners()).toBe(0);expect(emit).toHaveBeenLastCalledWith('b',null,null);
  const replacement=fakeChart(aBars,'synthetic-AAA');watch.attach('a',replacement as unknown as HoverChart);expect(a.listeners()).toBe(0);
  emit.mockClear();a.move(start);expect(emit).not.toHaveBeenCalled();
  watch.retain([]);expect(replacement.listeners()).toBe(0);expect(emit).toHaveBeenLastCalledWith('a',null,null);expect(watch.watching()).toEqual([]);
  watch.attach('a',a as unknown as HoverChart);watch.dispose();expect(a.listeners()).toBe(0);
  watch.attach('a',{} as unknown as HoverChart);expect(watch.watching()).toEqual([]);
  const owner={};expect(cellCrosshairWatch(owner,emit)).toBe(cellCrosshairWatch(owner,()=>{}));expect(cellCrosshairWatch({},emit)).not.toBe(cellCrosshairWatch(owner,emit));
 });
});

describe('the App hover store',()=>{
 it('applies reports once per frame in arrival order, notifies only on change, and never during the report',()=>{
  const queued:Array<()=>void>=[],store=createGridHoverStore({request:fn=>queued.push(fn),cancel:()=>{}}),notified=vi.fn();store.subscribe(notified);
  const a=fakeChart(aBars,'synthetic-AAA'),b=fakeChart(bBars,'synthetic-BBB');
  store.onCellCrosshair('b',b as unknown as HoverChart,start);store.onCellCrosshair('b',b as unknown as HoverChart,start+day);expect(store.hover).toBeNull();expect(queued).toHaveLength(1);
  queued.shift()!();expect(store.hover?.cellId).toBe('b');expect(store.hover?.time).toBe(start+day);expect(notified).toHaveBeenCalledTimes(1);
  // One frame: B left, then A entered. Both land.
  store.onCellCrosshair('b',null,null);store.onCellCrosshair('a',a as unknown as HoverChart,start);queued.shift()!();expect(store.hover?.cellId).toBe('a');
  // One frame: A entered again, then B (not hovered) left. A stays hovered.
  store.onCellCrosshair('a',a as unknown as HoverChart,start+day);store.onCellCrosshair('b',null,null);queued.shift()!();expect(store.hover?.cellId).toBe('a');expect(store.hover?.time).toBe(start+day);
  store.onCellCrosshair('a',a as unknown as HoverChart,null);queued.shift()!();expect(store.hover).toBeNull();
  const count=notified.mock.calls.length;store.onCellCrosshair('b',null,null);queued.shift()!();expect(notified).toHaveBeenCalledTimes(count);
 });
 it('feeds the Data window from the hovered cell and disposes its frame and cache',()=>{
  const queued:Array<()=>void>=[],cancel=vi.fn(),store=createGridHoverStore({request:fn=>{queued.push(fn);return 7;},cancel}),b=fakeChart(bBars,'synthetic-BBB');
  b.move(start);store.onCellCrosshair('b',b as unknown as HoverChart,start);queued.shift()!();
  expect(store.feed(activeFeed(),grid(),datasets).dataset?.instrument.symbol).toBe('BBB');expect(b.indicatorListeners()).toBe(1);
  store.onCellCrosshair('b',null,null);store.dispose();expect(cancel).toHaveBeenCalledWith(7);expect(b.indicatorListeners()).toBe(0);
 });
 it('one store per App owner object',()=>{const owner={},other={};expect(gridHoverStore(owner)).toBe(gridHoverStore(owner));expect(gridHoverStore(other)).not.toBe(gridHoverStore(owner));});
});

describe('the legend follows a synced crosshair',()=>{
 const b=fakeChart(bBars,'synthetic-BBB');
 it('only with crosshair sync on, in one link group, with no maximized chart',()=>{
  const hover=hoverOn(b,start+day);
  expect(legendGhostTime(grid(true),hover)).toBe(start+day);
  expect(legendGhostTime(grid(false),hover)).toBeNull();
  expect(legendGhostTime(grid(true,['default','red']),hover)).toBeNull();
  expect(legendGhostTime(grid(true,['default','default'],'a'),hover)).toBeNull();
  expect(legendGhostTime(grid(true),{...hover,cellId:'a'})).toBeNull();
  expect(legendGhostTime(undefined,hover)).toBeNull();
 });
 it('the active legend shows the bar containing the synced time (floor, as the ghost crosshair snaps)',()=>{
  const last=inspectionFor(aBars,null,'synthetic-AAA');
  const synced=syncedLegendInspection(last,aBars,aBars,'candles',start+day+3600)!;
  expect(synced.displayed).toEqual({index:1,bar:aBars[1],hovered:true});expect(synced.standard).toEqual({index:1,bar:aBars[1],hovered:true});
  expect(synced.source).toBe(last.source);
 });
 it('unchanged without a ghost, before the first bar, on a derived chart type, with its own crosshair, or when refused',()=>{
  const last=inspectionFor(aBars,null,'synthetic-AAA'),own=inspectionFor(aBars,start,'synthetic-AAA');
  expect(syncedLegendInspection(last,aBars,aBars,'candles',null)).toBe(last);
  expect(syncedLegendInspection(last,aBars,aBars,'candles',start-1)).toBe(last);
  expect(syncedLegendInspection(last,aBars,aBars,'renko',start+day)).toBe(last);
  expect(syncedLegendInspection(own,aBars,aBars,'candles',start+day)).toBe(own);
  expect(syncedLegendInspection(null,aBars,aBars,'candles',start+day)).toBeNull();
 });
});
