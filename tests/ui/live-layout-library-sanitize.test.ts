import {afterEach,expect,it} from 'vitest';
import {CoinbaseLiveProvider,type CoinbaseBridge} from '../../src/domain/coinbase-live';
import {clearLiveDatasets,registerLiveDataset} from '../../src/ui/live-registry';
import {persistableWorkspace} from '../../src/ui/live-workspace';
import {patchWorkspace} from '../../src/ui/workspace-grid';
import {createInitialWorkspace} from '../../src/ui/workspace-state';

// Turning Coinbase off with a live chart open ran persistableWorkspace over the saved-layout library.
// A library entry still named a live feed that was no longer registered (an earlier live interval), so the drawing-scope
// transition threw "Exact drawing source is missing or ambiguous" inside an effect; React handed that to the recovery
// boundary, which removed the open Settings dialog. Synthetic bridge, no network.
const t0=1_700_000_000;
function bridge():CoinbaseBridge{
 const status={schemaVersion:1 as const,state:'ready' as const,attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{},productIds:['BTC-USD']};
 return{fetchCoinbaseCandles:async input=>({ok:true,value:{schemaVersion:1,productId:input.productId,granularity:input.granularity,seconds:300,bars:[{time:t0,open:100,high:101,low:99,close:100.5,volume:2}],provenance:{provider:'test',kind:'public-unauthenticated',sourceUrl:'https://example.invalid/',retrievedAt:'2026-10-20T00:00:00Z',bytes:1,license:'test'}}}),
  subscribeCoinbase:async()=>({ok:true,value:status}),unsubscribeCoinbase:async()=>({ok:true,value:status}),onCoinbaseEvent:()=>()=>{}};
}
afterEach(()=>clearLiveDatasets());
it('a saved layout naming a live feed that is no longer open still sanitizes',async()=>{
 const provider=new CoinbaseLiveProvider(bridge()),handle=provider.open('BTC-USD','5m');
 await Promise.resolve();await new Promise(resolve=>setTimeout(resolve,0));registerLiveDataset(handle.dataset());
 const base=createInitialWorkspace(),opened=patchWorkspace(base,{symbol:'BTC-USD',sourceId:handle.datasetId});
 expect(opened.layoutLibrary).toBeTruthy();
 const library=opened.layoutLibrary!,withLive={...opened,layoutLibrary:{...library,entries:library.entries.map((entry,index)=>index===0?{...entry,grid:structuredClone(opened.grid)}:entry)}};
 // The feed closes (interval change or Coinbase off) while the library entry still names it.
 const back=patchWorkspace({...withLive},{symbol:'GME',sourceId:null});
 handle.close();provider.dispose();clearLiveDatasets();
 let safe:any;expect(()=>{safe=persistableWorkspace(back);}).not.toThrow();
 expect(JSON.stringify(safe.layoutLibrary)).not.toContain('live:');
 expect(safe.liveCharts).toBeTruthy();
});
