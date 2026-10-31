import {afterAll,afterEach,describe,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {AlpacaLiveProvider,selectAlpacaSyntheticStub,type AlpacaBridge} from '../../src/domain/alpaca-live';
import type {BarCacheBridge} from '../../src/domain/live-cache';
import {launchMain} from './r30-key-lifecycle-main';

// The packaged key-lifecycle flow (r29 build 20261023T064341134Z) timed out on "GME ticks (legend
// changes)" right after GME 1m opened on LV_ALPACA_STUB=synthetic-lifecycle. This reproduces that start in the VM harness
// (main.cjs with a mocked Electron, the real preload, stub, AlpacaMarketData and renderer provider) for both stub modes, at the
// failing hour (03:10 New York, market closed) and in the regular session: the stream must open with the key "configured" at
// startup, authenticate with the stub key, and move GME's forming 1m bar every tick. SYNTHETIC only; fetch and WebSocket throw.
const profiles:string[]=[];
afterAll(()=>{for(const dir of profiles)rmSync(dir,{recursive:true,force:true});});
afterEach(()=>{vi.unstubAllGlobals();selectAlpacaSyntheticStub(false);});

async function startAndTick(mode:'synthetic'|'synthetic-lifecycle'){
 const fetch=vi.fn(()=>{throw new Error('network used');}),Socket=vi.fn(()=>{throw new Error('socket used');});vi.stubGlobal('fetch',fetch);vi.stubGlobal('WebSocket',Socket);
 const profile=mkdtempSync(path.join(os.tmpdir(),'lv-r33-ticks-'));profiles.push(profile);
 const main=await launchMain(profile,{LV_ALPACA_STUB:mode});
 const status=await main.lv.alpacaKeyStatus();
 expect(status).toMatchObject({ok:true,value:{configured:true,keyIdHint:'****STUB',synthetic:true}});
 selectAlpacaSyntheticStub(true);
 const provider=new AlpacaLiveProvider(main.lv as AlpacaBridge&BarCacheBridge),gme=provider.open('GME','1m');
 await vi.waitFor(()=>{expect(gme.dataset().provenance.state).toBe('ready');expect(gme.dataset().bars.length).toBeGreaterThan(100);},{timeout:10000,interval:50});
 const states=main.events.filter(e=>e.kind==='status').map(e=>e.status.state);
 // The stream opened by itself with the startup key (no save, no reconnect): connecting, authenticating, ready.
 expect(states.filter(s=>s==='connecting')).toHaveLength(1);expect(states).toContain('ready');expect(states).not.toContain('auth-failed');
 // The forming (last) 1m bar follows the trades: over 4 s (four stub ticks) its close takes at least two values.
 const closes=new Set<string>();const end=Date.now()+4000;
 while(Date.now()<end){const last=gme.dataset().bars.at(-1)!;closes.add(last.time+':'+last.close);await new Promise(resolve=>setTimeout(resolve,250));}
 const trades=main.events.filter(e=>e.kind==='batch').flatMap(e=>e.trades).filter((row:any)=>row.symbol==='GME');
 gme.close();provider.dispose();main.quit();
 expect(fetch).not.toHaveBeenCalled();expect(Socket).not.toHaveBeenCalled();
 return{closes:closes.size,trades:trades.length};
}

describe('the lifecycle stub streams GME 1m from startup, like the plain stub',()=>{
 for(const hour of [{label:'03:10 New York (market closed, the failing run)',at:Date.UTC(2026,9,23,7,10,24)},{label:'11:00 New York (regular session)',at:Date.UTC(2026,9,22,15,0,0)}])
  for(const mode of ['synthetic','synthetic-lifecycle'] as const)
   it(mode+' at '+hour.label+': the stream opens with the startup key and the forming 1m bar moves',async()=>{
    vi.useFakeTimers({toFake:['Date'],now:hour.at,shouldAdvanceTime:true});
    try{
     const seen=await startAndTick(mode);
     expect(seen.trades,'GME trades reached the renderer').toBeGreaterThanOrEqual(3);
     expect(seen.closes,'the forming bar changed with the ticks').toBeGreaterThanOrEqual(2);
    }finally{vi.useRealTimers();}
   },30000);
});
