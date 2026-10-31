import {describe,expect,it,vi} from 'vitest';
import {createGridHoverStore,createHoverFeedCache,legendGhostTime,nextGridHover,type DataWindowFeed,type HoverChart,type HoverGrid} from '../../src/ui/grid-hover';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import type {Bar,BarDataset} from '../../src/domain/types';
import type {Inspection} from '../../src/ui/DataWindow';

// Synthetic controller transitions without any new crosshair report: the pointer remains still through each edit.
const original=fixtureDataset('GME',3),other=fixtureDataset('SPY',3),time=original.bars[1].time;
const replacement=(close:number):BarDataset=>({...original,bars:original.bars.map((bar,index)=>index===1?{...bar,close,high:Math.max(bar.high,close),low:Math.min(bar.low,close)}:bar)});
function controller(initial=original){
 let data=initial,views:any[]=[],hovered=true;const market=new Set<()=>void>(),indicators=new Set<()=>void>();
 const chart={reads:0,getDataWindow:()=>{const index=hovered?1:data.bars.length-1,bar=data.bars[index];return{pending:false,source:sourceContextForDataset(data),series:{count:data.bars.length,firstTime:data.bars[0].time,lastTime:data.bars.at(-1)!.time,style:'candles'},readout:null,crosshair:null,standard:{index,bar:{...bar},hovered},displayed:{index,bar:{...bar},hovered}} as unknown as Inspection;},
  getSourceBars:()=>{chart.reads++;return structuredClone(data.bars);},getCalculationBars:()=>structuredClone(data.bars),getStyle:()=>'candles',onCrosshair:()=>()=>{},onMarketApplied:(fn:()=>void)=>{market.add(fn);return()=>market.delete(fn);},
  indicators:{list:()=>views,subscribe:(fn:()=>void)=>{indicators.add(fn);return()=>indicators.delete(fn);}},
  replace(next:BarDataset,emit=false){data=next;if(emit)for(const fn of [...market])fn();},setViews(next:any[]){views=next;for(const fn of [...indicators])fn();},leave(){hovered=false;},listeners:()=>market.size+indicators.size};
 return chart;
}
const grid=(data=original):HoverGrid=>({layout:{activeCellId:'a',maximizedCellId:null,cells:[{id:'a',symbol:'SPY',interval:'1D',group:'default'},{id:'b',symbol:data.instrument.symbol,interval:'1D',group:'default'}],sync:{symbol:false,interval:false,crosshair:false,time:false,dateRange:false,drawings:false}},cells:{a:{datasetId:other.provenance.datasetId},b:{datasetId:data.provenance.datasetId}}});
const active:DataWindowFeed={chart:null,dataset:other,bars:other.bars,sourceBars:other.bars,inspection:null,indicators:[],timezone:'UTC',timeHours:'24',dateFormat:'yyyy-MM-dd'};
describe(' hovered feed lifecycle while the pointer is stationary',()=>{
 for(const action of ['undo','redo','layout restore'])it('reads current bars after '+action+' without a new hover report',()=>{
  const chart=controller(),cache=createHoverFeedCache(),hover=nextGridHover(null,'b',chart as unknown as HoverChart,time)!;
  cache.feed(active,hover,grid(),[original,other]);const restored=replacement(original.bars[1].close+3);chart.replace(restored);
  const result=cache.feed(active,hover,grid(restored),[restored,other]);expect(result.inspection?.displayed.bar?.close).toBe(restored.bars[1].close);expect(result.bars?.[1].close).toBe(restored.bars[1].close);expect(chart.reads).toBe(2);
  cache.feed(active,hover,grid(restored),[restored,other]);expect(chart.reads).toBe(2);cache.dispose();expect(chart.listeners()).toBe(0);
 });
 it('refuses old bars labeled with a restored symbol and follows the replacement once it commits',()=>{
  const chart=controller(),cache=createHoverFeedCache(),hover=nextGridHover(null,'b',chart as unknown as HoverChart,time)!;
  cache.feed(active,hover,grid(),[original,other]);expect(cache.feed(active,hover,grid(other),[original,other])).toBe(active);
  chart.replace(other);const result=cache.feed(active,hover,grid(other),[original,other]);expect(result.dataset).toBe(other);expect(result.sourceBars).toEqual(other.bars);cache.dispose();
 });
 it('checks the full source basis even when dataset id, count and end times are unchanged',()=>{
  const chart=controller(),cache=createHoverFeedCache(),hover=nextGridHover(null,'b',chart as unknown as HoverChart,time)!;
  const restored={...original,instrument:{...original.instrument,tickSize:original.instrument.tickSize*2}};
  expect(cache.feed(active,hover,grid(restored),[restored,other])).toBe(active);chart.replace(restored);expect(cache.feed(active,hover,grid(restored),[restored,other]).chart).toBe(chart);cache.dispose();
 });
 it('clears an old synced legend timestamp after a stationary source restore or native crosshair reset',()=>{
  const chart=controller(),hover=nextGridHover(null,'b',chart as unknown as HoverChart,time)!,linked=grid();linked.layout.sync.crosshair=true;
  expect(legendGhostTime(linked,hover)).toBe(time);
  chart.replace(other);expect(legendGhostTime(linked,hover)).toBeNull();
  // The hovered cell can still supply its current data after the source commit, without preserving the old ghost.
  const cache=createHoverFeedCache();expect(cache.feed(active,hover,grid(other),[original,other]).dataset).toBe(other);cache.dispose();
  chart.replace(original);chart.leave();expect(legendGhostTime(linked,hover)).toBeNull();
 });
 it('queues market and indicator refreshes once per frame and retires all subscriptions',()=>{
  const frames:Array<()=>void>=[],store=createGridHoverStore({request:fn=>{frames.push(fn);return 1;},cancel:()=>{}}),chart=controller(),notify=vi.fn();store.subscribe(notify);
  store.onCellCrosshair('b',chart as unknown as HoverChart,time);frames.shift()!();store.feed(active,grid(),[original,other]);expect(chart.listeners()).toBe(2);const before=notify.mock.calls.length;
  const restored=replacement(original.bars[1].close+4);chart.replace(restored,true);chart.setViews([{id:'synthetic-view'}]);expect(notify).toHaveBeenCalledTimes(before);expect(frames).toHaveLength(1);frames.shift()!();expect(notify).toHaveBeenCalledTimes(before+1);
  const feed=store.feed(active,grid(restored),[restored,other]);expect(feed.bars?.[1].close).toBe(restored.bars[1].close);expect(feed.indicators).toEqual([{id:'synthetic-view'}]);store.dispose();expect(store.hover).toBeNull();expect(chart.listeners()).toBe(0);
  chart.replace(original,true);chart.setViews([]);expect(frames).toHaveLength(0);
 });
});
