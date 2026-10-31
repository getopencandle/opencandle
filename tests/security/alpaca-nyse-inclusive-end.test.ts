import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {inspectSeasonalityFrontierResponse,type SeasonalityFrontierSentRequest} from '../../src/domain/seasonality-frontier-response';
import {seasonalityIntradayFrontier} from '../../src/domain/seasonality-intraday-frontier';

const root=process.cwd(),sourceRoot=process.env.LV_NYSE_SCENARIO_SOURCE_ROOT??root,requireActual=createRequire(path.join(root,'electron/alpaca-stub.cjs'));
const {AlpacaMarketData}=requireActual('./public-alpaca.cjs'),NOW=Date.parse('2026-10-20T16:00:00Z'),FROM=Date.parse('2026-10-01T04:00:00Z')/1000,FIRST=Date.parse('2026-10-19T17:30:00Z')/1000;
const owned:Array<{close():void}>=[];
afterEach(()=>{const errors:unknown[]=[];for(const item of owned.splice(0).reverse())try{item.close();}catch(error){errors.push(error);}vi.unstubAllGlobals();if(errors.length)throw new AggregateError(errors,'SYNTHETIC inclusive endpoint cleanup failed.');});

/** Same explicit whole-CJS overlay seam as the unchanged scenario18. Only the
 * selected helper can be staged; public validators/builtins stay actual main.
 * This creates a synthetic transport, never provider/source/native permission. */
function fixture(){
 const net=vi.fn(()=>{throw Error('Real network forbidden.');}),socket=vi.fn(()=>{throw Error('Real socket forbidden.');});vi.stubGlobal('fetch',net);vi.stubGlobal('WebSocket',socket);
 const cache=new Map<string,{exports:any}>();
 const load=(name:string):any=>{const prior=cache.get(name);if(prior)return prior.exports;const logical='electron/'+name,staged=path.join(sourceRoot,logical),filename=existsSync(staged)?staged:path.join(root,logical),value={exports:{}};cache.set(name,value);const require=(id:string)=>id==='./alpaca-nyse-seasonality-stub.cjs'?load('alpaca-nyse-seasonality-stub.cjs'):requireActual(id);Function('require','module','exports',readFileSync(filename,'utf8'))(require,value,value.exports);return value.exports;};
 const api=load('alpaca-stub.cjs'),transport=api.alpacaStubTransport({env:{LV_ALPACA_STUB:'synthetic',LV_EXE_HARNESS:'alpaca-stub',LV_ALPACA_CLOCK:'regular',LV_ALPACA_SCENARIO:'nyse-seasonality-v1'},packaged:false,profile:path.join(os.tmpdir(),'lv-synthetic-inclusive-end'),tmpdir:os.tmpdir(),now:()=>NOW,elapsedNow:()=>0});expect(transport.mode).toBe('synthetic');expect(transport.scenario).toBe('nyse-seasonality-v1');
 const feed=new AlpacaMarketData({keys:transport.keys,fetchImpl:transport.fetch,WebSocketImpl:transport.WebSocket,now:()=>NOW,marketNow:()=>NOW,restMinIntervalMs:0,emit:()=>{}});owned.push(feed);
 return{feed,net,socket};
}

it.each([
 ['1Min','1m',60,4921,4920],['5Min','5m',300,985,984],['15Min','15m',900,329,328],
] as const)('historical %s query end includes the actual firstLoaded opening through real CJS validators and the time-only counter',async(timeframe,resolution,seconds,rows,prefix)=>{
 const f=fixture(),sent:SeasonalityFrontierSentRequest={symbol:'GME',timeframe,feed:'sip',adjustment:'split',start:FROM,end:FIRST},result=await f.feed.bars({requestId:'synthetic-inclusive-'+timeframe,...sent});expect(result.ok).toBe(true);
 const value=result.value;expect(value.bars).toHaveLength(rows);expect(value.bars[0].time).toBe(Date.parse('2026-10-01T13:30:00Z')/1000);expect(value.bars.at(-1).time).toBe(FIRST);expect(value.bars.at(-2).time).toBe(FIRST-seconds);expect(value.bars.some((row:{time:number})=>row.time>FIRST)).toBe(false);expect(value.nextPageToken).toBeNull();expect(new URL(value.provenance.sourceUrl).searchParams.get('end')).toBe('2026-10-19T17:30:00Z');
 const echo=inspectSeasonalityFrontierResponse(value,sent);expect(echo.rows).toBe(value.bars);expect(echo.through).toBe(FIRST);const counted=seasonalityIntradayFrontier({resolution,session:'regular',firstLoadedTime:FIRST,requestFrom:FROM,requestThrough:FIRST,pages:[echo]});expect(counted).toEqual({status:'ready',firstObservedTime:Date.parse('2026-10-01T13:30:00Z')/1000,firstLoadedTime:FIRST,prefixBars:prefix,sourceRows:rows,selectedBars:rows});expect(f.net).not.toHaveBeenCalled();expect(f.socket).not.toHaveBeenCalled();
});

it('keeps the original actual-NOW closed-only synthetic policy for every supported prefix interval',async()=>{
 const f=fixture(),start=Date.parse('2026-10-20T13:30:00Z')/1000;
 for(const [timeframe,seconds,count]of [['1Min',60,150],['5Min',300,30],['15Min',900,10]] as const){const response=await f.feed.bars({requestId:'synthetic-now-policy-'+timeframe,symbol:'GME',timeframe,feed:'iex',adjustment:'split',start,end:NOW/1000});expect(response.ok).toBe(true);expect(response.value.bars).toHaveLength(count);expect(response.value.bars.at(-1).time).toBe(NOW/1000-seconds);expect(response.value.bars.some((row:{time:number})=>row.time===NOW/1000)).toBe(false);expect(response.value.bars.every((row:{time:number})=>row.time+seconds<=NOW/1000+1)).toBe(true);}
 expect(f.net).not.toHaveBeenCalled();expect(f.socket).not.toHaveBeenCalled();
});
