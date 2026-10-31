import {it,expect} from 'vitest';
import {sessionFixture,sessionGrid} from '../fixtures/r41-session-fixture';
import {cellSessionDataset} from '../../src/chart/cell-session';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {createHoverFeedCache,nextGridHover,legendGhostTime,type DataWindowFeed,type HoverChart} from '../../src/ui/grid-hover';
import type {BarDataset} from '../../src/domain/types';
import type {Inspection} from '../../src/ui/DataWindow';
function controller(initial:BarDataset){let data=initial;return{replace(next:BarDataset){data=next;},getDataWindow:()=>({pending:false,source:sourceContextForDataset(data),series:{count:data.bars.length,firstTime:data.bars[0]?.time??null,lastTime:data.bars.at(-1)?.time??null,style:'candles'},crosshair:null,displayed:{index:0,bar:data.bars[0],hovered:true},standard:{index:0,bar:data.bars[0],hovered:true}} as Inspection),getSourceBars:()=>data.bars,getCalculationBars:()=>data.bars,getStyle:()=>'candles',onCrosshair:()=>()=>{},indicators:{list:()=>[],subscribe:()=>()=>{}}};}
it('a stationary pointer follows the hovered SPY RTH cell beside active GME ETH and refreshes restored overrides',()=>{
 const raw=sessionFixture(),spy=sessionFixture('SPY'),grid=sessionGrid(raw,spy),rth=cellSessionDataset(spy,{session:'regular'}),eth=cellSessionDataset(raw,{session:'extended'}),chart=controller(rth),cache=createHoverFeedCache();
 const active:DataWindowFeed={chart:null,dataset:eth,bars:eth.bars,sourceBars:eth.bars,inspection:null,indicators:[],timezone:'UTC',timeHours:'24',dateFormat:'yyyy-MM-dd'},hover=nextGridHover(null,'spy',chart as unknown as HoverChart,rth.bars[0].time)!;
 expect(cache.feed(active,hover,grid,[raw,spy]).sourceBars).toBe(rth.bars);expect((cache.feed(active,hover,grid,[raw,spy]).dataset as BarDataset).provenance.session).toBe('regular');
 const restored=structuredClone(grid);restored.cells.spy.session='extended';expect(cache.feed(active,hover,restored,[raw,spy])).toBe(active);
 const next=cellSessionDataset(spy,{session:'extended'});chart.replace(next);const refreshed=cache.feed(active,hover,restored,[raw,spy]);expect(refreshed.sourceBars).toBe(spy.bars);expect((refreshed.dataset as BarDataset).provenance.session).toBe('extended');
 restored.layout.sync.crosshair=true;expect(legendGhostTime(restored,hover)).toBeNull();cache.dispose();
});
