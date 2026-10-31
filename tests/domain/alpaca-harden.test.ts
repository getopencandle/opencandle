import {describe,expect,it,vi} from 'vitest';
import {AlpacaLiveProvider,ALPACA_RESOLUTIONS,alpacaStatusLabel,usMarketSession,type AlpacaBridge,type AlpacaEvent,type AlpacaStatus} from '../../src/domain/alpaca-live';
import {liveStatusLabel} from '../../src/domain/live-provider';
import {buildSymbolSearchCandidates,liveTypedCandidates,searchSymbols} from '../../src/ui/symbol-search';
import {describeStreamStatus} from '../../src/ui/LiveDataSettings';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {Bar} from '../../src/domain/types';

// Alpaca hardening: renderer behaviour over a synthetic bridge. No network, no real key.
const et=(y:number,m:number,d:number,h:number,min=0)=>Date.UTC(y,m-1,d,h+4,min); // EDT (UTC-4) in October
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const aStatus=(state:AlpacaStatus['state'],extra:Partial<AlpacaStatus>={}):AlpacaStatus=>({schemaVersion:1,state,symbols:['AAPL'],feed:'iex',attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{},...extra});
function bridgeOf(bars:(input:any)=>Bar[]){
  let listener:((e:AlpacaEvent)=>void)|null=null;
  const bridge={
    fetchAlpacaBars:vi.fn(async(input:any)=>({ok:true as const,value:{schemaVersion:1 as const,symbol:input.symbol,timeframe:input.timeframe,seconds:0,feed:input.feed,bars:bars(input),nextPageToken:null,provenance:{} as any}})),
    subscribeAlpaca:vi.fn(async()=>({ok:true as const,value:aStatus('ready')})),
    unsubscribeAlpaca:vi.fn(async()=>({ok:true as const,value:null})),
    onAlpacaEvent:vi.fn((fn:(e:AlpacaEvent)=>void)=>{listener=fn;return()=>{listener=null;};}),
  } as unknown as AlpacaBridge;
  return {bridge,emit:(e:AlpacaEvent)=>listener?.(e)};
}

describe('US market session (New York time, NYSE holidays)',()=>{
  it('knows regular, extended and closed sessions, weekends and holidays',()=>{
    expect(usMarketSession(et(2026,10,21,10))).toBe('regular');
    expect(usMarketSession(et(2026,10,21,9,29))).toBe('extended');
    expect(usMarketSession(et(2026,10,21,16,30))).toBe('extended');
    expect(usMarketSession(et(2026,10,21,20,5))).toBe('closed');
    expect(usMarketSession(et(2026,10,21,3,59))).toBe('closed');
    expect(usMarketSession(et(2026,10,24,12))).toBe('closed'); // Saturday
    expect(usMarketSession(Date.UTC(2026,10,26,16))).toBe('closed'); // Thanksgiving (EST)
    expect(usMarketSession(Date.UTC(2026,11,25,16))).toBe('closed'); // Christmas
    expect(usMarketSession(Date.UTC(2027,0,4,16))).toBe('regular');
  });
});

describe('Alpaca chart over closed markets and stream failures',()=>{
  it('1-minute backfill reaches back past a long holiday weekend so the last session is shown',async()=>{
    expect(ALPACA_RESOLUTIONS['1m'].window).toBeGreaterThanOrEqual(5*86400);
    const now=et(2026,9,8,8); // Tuesday after Labor Day, before the open
    const {bridge}=bridgeOf(()=>[]);
    const provider=new AlpacaLiveProvider(bridge,{now:()=>now});
    const handle=provider.open('AAPL','1m');await flush();
    const call=(bridge.fetchAlpacaBars as any).mock.calls[0][0];
    expect(call.start).toBeLessThanOrEqual(et(2026,9,4,9,30)/1000); // the previous Friday session
    handle.close();
  });
  it('labels a ready Alpaca chart "Market closed" outside US hours and "Live" in session; Coinbase unaffected',()=>{
    const p={state:'ready',delaySeconds:0};
    expect(alpacaStatusLabel(p,et(2026,10,24,12))).toBe('Market closed');
    expect(alpacaStatusLabel(p,et(2026,10,21,10))).toBe('Live');
    expect(alpacaStatusLabel({...p,state:'error'},et(2026,10,24,12))).toBe('Disconnected');
    expect(liveStatusLabel({state:'ready',delaySeconds:0})).toBe('Live'); // shared label unchanged (Coinbase)
  });
  it('a disconnected stream puts its plain reason on the chart, and clears it once connected again',async()=>{
    const {bridge,emit}=bridgeOf(()=>[{time:et(2026,10,21,9,30)/1000,open:1,high:2,low:0.5,close:1.5,volume:3}]);
    const provider=new AlpacaLiveProvider(bridge,{now:()=>et(2026,10,21,10)});
    const handle=provider.open('AAPL','1m');await flush();
    const reason='Alpaca allows one live connection on the free plan, and another app or OpenCandle window is already using it.';
    emit({schemaVersion:1,kind:'status',status:aStatus('disconnected',{lastError:reason})});
    expect(handle.dataset().provenance.notes.join(' ')).toContain(reason);
    emit({schemaVersion:1,kind:'status',status:aStatus('ready')});
    expect(handle.dataset().provenance.notes.join(' ')).not.toContain(reason);
    handle.close();
  });
});

describe('symbol search offers any typed US stock once a key is saved',()=>{
  const universe=buildSymbolSearchCandidates([fixtureDataset('AAPL',50)],[]);
  it('adds a live Alpaca row for a typed ticker, ranked above the synthetic demo',()=>{
    const extra=liveTypedCandidates('aapl',universe,true,'5m');
    expect(extra).toHaveLength(1);
    expect(extra[0]).toMatchObject({symbol:'AAPL',sourceKind:'live',providerId:'alpaca-iex',resolution:'5m',openable:true});
    expect(searchSymbols([...universe,...extra],'AAPL').rows[0].providerId).toBe('alpaca-iex');
    expect(liveTypedCandidates('BRK.B',universe,true,'1D')[0]).toMatchObject({symbol:'BRK.B',resolution:'1D'});
  });
  it('adds nothing without a key, for non-stock text, or when the symbol is already a live row',()=>{
    expect(liveTypedCandidates('AAPL',universe,false,'5m')).toEqual([]);
    expect(liveTypedCandidates('BTC-USD',universe,true,'5m')).toEqual([]);
    const once=liveTypedCandidates('MSFT',universe,true,'5m');
    expect(liveTypedCandidates('MSFT',[...universe,...once],true,'5m')).toEqual([]);
  });
});

describe('Data sources stream status in plain words',()=>{
  it('describes connected, market closed, connecting and failures with the real reason',()=>{
    expect(describeStreamStatus(null,et(2026,10,21,10))).toMatch(/not running/);
    expect(describeStreamStatus(aStatus('ready'),et(2026,10,21,10))).toMatch(/^Live stream connected/);
    expect(describeStreamStatus(aStatus('ready'),et(2026,10,24,12))).toMatch(/Market closed/);
    expect(describeStreamStatus(aStatus('connecting'),et(2026,10,21,10))).toMatch(/Connecting/);
    expect(describeStreamStatus(aStatus('auth-failed',{lastError:'Alpaca rejected the key.'}),et(2026,10,21,10))).toBe('Live stream stopped: Alpaca rejected the key.');
    expect(describeStreamStatus(aStatus('disconnected',{lastError:'Could not reach the Alpaca live stream.'}),et(2026,10,21,10))).toBe('Live stream reconnecting: Could not reach the Alpaca live stream.');
  });
});
