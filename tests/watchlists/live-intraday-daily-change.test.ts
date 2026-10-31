import {expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {coinbaseInstrument,COINBASE_PROVIDER_ID} from '../../src/domain/coinbase-live';
import {ALPACA_IEX_PROVIDER_ID} from '../../src/domain/alpaca-live';
import type {Bar,BarDataset} from '../../src/domain/types';
import {watchQuote,liveIntradayPreviousClose} from '../../src/watchlists/quotes';
import {referenceFromDataset} from '../../src/watchlists/model';
import {layoutTabQuote} from '../../src/ui/layout-tab-quote';

// Owner report (0.8.1): a live SOL-USD tab showed no daily % change while its daily feed was not open. SYNTHETIC bars only:
// no network. The user-visible outcome is the tab quote's changePercent (the header Chg%) and the watchlist quote's Chg%.
const bar=(time:number,close:number):Bar=>({time,open:close,high:close,low:close,close,volume:1});
const UTC=(d:number,h:number,m=0)=>Date.UTC(2026,9,d,h,m)/1000;
const ET=(d:number,h:number,m=0)=>Date.UTC(2026,9,d,h+4,m)/1000; // EDT, October 2026
function coinbase(resolution:string,bars:Bar[]):BarDataset{
 const base=fixtureDataset('GME',2);
 return{...base,resolution,bars,instrument:coinbaseInstrument('SOL-USD'),provenance:{...base.provenance,providerId:COINBASE_PROVIDER_ID,providerName:'SYNTHETIC Coinbase feed',datasetId:`live:${COINBASE_PROVIDER_ID}:SOL-USD:${resolution}`,fixture:false,session:'all',timezone:'UTC',adjustment:'raw',state:'ready',delaySeconds:0,asOf:bars.at(-1)?.time??0}};
}
function stock(resolution:string,bars:Bar[]):BarDataset{
 const base=fixtureDataset('GME',2);
 return{...base,resolution,bars,instrument:{...base.instrument,id:'US:AAPL',symbol:'AAPL',name:'SYNTHETIC AAPL',exchange:'US',assetClass:'stock',timezone:'America/New_York',currency:'USD'},provenance:{...base.provenance,providerId:ALPACA_IEX_PROVIDER_ID,providerName:'SYNTHETIC live feed',datasetId:`live:${ALPACA_IEX_PROVIDER_ID}:AAPL:${resolution}`,fixture:false,session:'extended',state:'ready',delaySeconds:0,asOf:bars.at(-1)?.time??0}};
}

it('crypto with no daily feed open: Chg% compares Last with the close at 00:00 UTC (the UTC daily open), in the tab and the watchlist',()=>{
 // 23:50 and 23:55 UTC on the 29th, then the UTC day of the 30th. The 23:55 bar closes at 00:00 UTC: 200.
 const sol=coinbase('5m',[bar(UTC(29,23,50),190),bar(UTC(29,23,55),200),bar(UTC(30,0,0),205),bar(UTC(30,14,5),210)]);
 expect(liveIntradayPreviousClose(sol)).toBe(200);
 const tab=layoutTabQuote(sol,[sol],null);
 expect(tab).toMatchObject({symbol:'SOL-USD',last:210});
 expect(tab!.changePercent).toBeCloseTo(5,10);
 const quote=watchQuote(referenceFromDataset(sol),[sol]);
 expect(quote).toMatchObject({last:210,change:10,changePercentState:'value'});
 expect(quote.reason).toContain('00:00 UTC');
 // New York's date would put 20:00 to 24:00 New York in the next day; the UTC day is the crypto convention.
 const evening=coinbase('5m',[bar(UTC(30,3,55),180),bar(UTC(30,4,5),181),bar(UTC(30,14,5),182)]);
 expect(liveIntradayPreviousClose(evening)).toBeNull();
 expect(layoutTabQuote(evening,[evening],null)!.changePercent).toBeNull();
});
it('crypto with its live daily companion open keeps using the previous live daily close',()=>{
 const sol=coinbase('5m',[bar(UTC(29,23,55),200),bar(UTC(30,14,5),210)]),daily=coinbase('1D',[bar(UTC(28,0),150),bar(UTC(29,0),168),bar(UTC(30,0),200)]);
 const tab=layoutTabQuote(sol,[sol,daily],null);
 expect(tab!.changePercent).toBeCloseTo(25,10);// 210 against the 29th's daily close 168
});
it('a stock with no daily feed open: Chg% compares Last with the previous regular-session close, never a pre- or post-market bar',()=>{
 const aapl=stock('5m',[bar(ET(29,15,55),100),bar(ET(29,19,55),104),bar(ET(30,4,0),99),bar(ET(30,10,0),102)]);
 expect(liveIntradayPreviousClose(aapl)).toBe(100);
 expect(layoutTabQuote(aapl,[aapl],null)!.changePercent).toBeCloseTo(2,10);
 expect(watchQuote(referenceFromDataset(aapl),[aapl]).reason).toContain('previous regular-session close');
 // Only today's bars loaded: no reference, so no change is invented.
 const today=stock('5m',[bar(ET(30,9,30),101),bar(ET(30,10,0),102)]);
 expect(layoutTabQuote(today,[today],null)!.changePercent).toBeNull();
});
it('imported and daily sources are unchanged: no daily feed means no daily change',()=>{
 const sol=coinbase('5m',[bar(UTC(29,23,55),200),bar(UTC(30,14,5),210)]);
 const imported={...sol,provenance:{...sol.provenance,datasetId:'import:SOL-USD:5m'}};
 expect(liveIntradayPreviousClose(imported)).toBeNull();
 expect(liveIntradayPreviousClose(coinbase('1D',[bar(UTC(29,0),168),bar(UTC(30,0),200)]))).toBeNull();
});
