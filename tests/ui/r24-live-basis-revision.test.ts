import {afterEach,expect,it,vi} from 'vitest';
import {AlpacaLiveProvider,ALPACA_HYBRID_COVERAGE,ALPACA_IEX_COVERAGE,type AlpacaBridge,type AlpacaStatus} from '../../src/domain/alpaca-live';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {liveLineageOf} from '../../src/chart/bar-input-identity';
import {stableDatasetUniverse} from '../../src/ui/workspace-grid';
import {requireTechnicalChart} from '../../src/ui/technical-alert-catalog';
import {newYorkWallTime} from '../../src/domain/us-market-hours';
import type {Bar,BarDataset} from '../../src/domain/types';

// live-alpaca receipts 20261022T210856031Z (r22) and 20261022T232358700Z (r23), step price-alert-on-gme-ws-fires: the top-bar
// Create alert on a live Alpaca chart never saved ("The chart source or information prefix is changing. Technical alerts are
// waiting." then "This chart has no eligible local alert source."). made the free-plan coverage depend on
// entry.hybrid, which is false until the first all-exchange backfill and true after it, on the SAME live revision. Coverage is
// part of the chart basis identity, while App's universe (liveSourcesKey: id|revision, stableDatasetUniverse) keeps the
// pre-backfill dataset object for that revision, so the chart cell's source (IEX coverage) never matched App's active dataset
// (hybrid coverage) and every observation tick refused. A basis change now starts a new live revision. SYNTHETIC bridge
// and bars, no network, no key.
const ET=(h:number,m=0)=>newYorkWallTime('2026-10-21',h*60+m);
function minutes(start:number,end:number):Bar[]{const out:Bar[]=[];for(let t=Math.ceil(start/60)*60;t+60<=end;t+=60){const c=3+((t/60)%7)/100;out.push({time:t,open:c,high:c+0.02,low:c-0.02,close:c,volume:100});}return out;}
afterEach(()=>{vi.restoreAllMocks();});
async function openFree(failSip=false){
 const clock=ET(19,20);vi.spyOn(Date,'now').mockImplementation(()=>clock*1000);
 const status={schemaVersion:1,state:'ready',symbols:['GME.WS'],feed:'iex',attempt:0,lastMessageAt:null,liveMessages:true,lastError:null,counters:{}} as unknown as AlpacaStatus;
 const bridge={alpacaKeyStatus:vi.fn(),saveAlpacaKey:vi.fn(),clearAlpacaKey:vi.fn(),testAlpacaConnection:vi.fn(),
  fetchAlpacaBars:vi.fn(async(input:any)=>failSip&&input.feed==='sip'?{ok:false as const,error:{code:'FORBIDDEN',message:'SYNTHETIC: all-exchange history is not available'}}:({ok:true as const,value:{schemaVersion:1 as const,symbol:input.symbol,timeframe:input.timeframe,seconds:60,feed:input.feed,bars:minutes(input.start,input.end),nextPageToken:null,provenance:{} as any}})),
  subscribeAlpaca:vi.fn(async()=>({ok:true as const,value:status})),unsubscribeAlpaca:vi.fn(async()=>({ok:true as const,value:null})),
  onAlpacaEvent:vi.fn(()=>()=>{})} as unknown as AlpacaBridge;
 const provider=new AlpacaLiveProvider(bridge,{now:()=>clock*1000,plan:'free'}),handle=provider.open('GME.WS','1m');
 const opened=handle.dataset();for(let i=0;i<60;i++)await Promise.resolve();
 return{opened,loaded:handle.dataset(),done:()=>{handle.close();provider.dispose();}};
}
/** The chart cell's committed source: the universe's dataset object for the cell plus the newest live bars (MultiChartGrid GridCell). */
const cellChart=(universe:BarDataset,bars:readonly Bar[])=>{const source=sourceContextForDataset(universe,bars);return{getAnalysisUnavailable:()=>'',getSourceContext:()=>source,getStyle:()=>'candles',getDataWindow:()=>({pending:false,series:{count:bars.length,firstTime:bars[0]?.time??null,lastTime:bars.at(-1)?.time??null,style:'candles'}})} as any;};

it('the first hybrid backfill changes the coverage, so it starts a new live revision and lineage (fail-first: same revision)',async()=>{
 const ui=await openFree();
 expect(ui.opened.provenance.coverage).toContain(ALPACA_IEX_COVERAGE);expect(ui.loaded.provenance.coverage).toContain(ALPACA_HYBRID_COVERAGE);
 expect(ui.loaded.bars.length).toBeGreaterThan(0);
 expect(ui.loaded.provenance.revision,'a basis change is a new source').not.toBe(ui.opened.provenance.revision);
 expect(liveLineageOf(ui.loaded.bars)?.key).not.toBe(liveLineageOf(ui.opened.bars)?.key);
 ui.done();
});
it('App keeps no stale pre-backfill dataset, and a technical alert capture on the loaded chart is not left waiting',async()=>{
 const ui=await openFree();
 const universe=stableDatasetUniverse([ui.opened],[ui.loaded]);
 expect(universe[0],'the universe takes the loaded snapshot').toBe(ui.loaded);
 expect(()=>requireTechnicalChart(cellChart(universe[0],ui.loaded.bars),ui.loaded,ui.loaded.bars)).not.toThrow();
 ui.done();
});
it('an IEX-only feed (all-exchange history refused) keeps one basis and one revision from open to backfill',async()=>{
 const ui=await openFree(true);
 expect(ui.loaded.provenance.coverage).toContain(ALPACA_IEX_COVERAGE);
 expect(ui.loaded.provenance.revision).toBe(ui.opened.provenance.revision);
 expect(()=>requireTechnicalChart(cellChart(stableDatasetUniverse([ui.opened],[ui.loaded])[0],ui.loaded.bars),ui.loaded,ui.loaded.bars)).not.toThrow();
 ui.done();
});
