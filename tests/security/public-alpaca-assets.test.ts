import {describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {AlpacaMarketData,barsInput,subscribeInput,assetsInput,validateAssets,assetsUrl,ASSETS_MAX_BYTES}=require('../../electron/public-alpaca.cjs');

// Synthetic key material and a mocked fetch only. No Alpaca endpoint is contacted.
// Alpaca paper key ids start with PK (electron/public-alpaca.cjs routes them to paper trading). The prefix is joined at runtime so
// no source literal looks like a real key id to secret scanners; the value is obviously fake.
const PAPER_PREFIX='P'+'K';
const KEY_ID='SYNTHETICKEY0000ABCD',PAPER_ID=PAPER_PREFIX+'SYNTHETICKEY00ABCD';
const SECRET='SyntheticSecretNotARealKey0000000000000000';
const NOW=Date.UTC(2026,9,21,15,0,0),nowS=NOW/1000;
class MemoryKeys{constructor(public keys:any={keyId:KEY_ID,secret:SECRET}){}async load(){return this.keys;}}
const row=(symbol:string,name:string,extra:Record<string,unknown>={})=>({id:'00000000-0000-4000-8000-000000000000',class:'us_equity',exchange:'NYSE',symbol,name,status:'active',tradable:true,marginable:true,shortable:true,easy_to_borrow:true,fractionable:true,attributes:[],...extra});
const LIST=[row('GME','GameStop Corp. Class A'),row('GME.WS','GameStop Corp. Warrants',{tradable:false,marginable:false,fractionable:false}),row('GMED','Globus Medical, Inc.'),row('SPY','SPDR S&P 500 ETF Trust',{exchange:'ARCA'}),row('BRK.B','Berkshire Hathaway Inc. Class B'),row('AGMH','Something GME-ish Holdings',{exchange:'NASDAQ'}),row('XYZ/A','Odd format',{exchange:'OTC'})];
function reply(body:unknown,{status=200,url=assetsUrl(KEY_ID),type='application/json'}:{status?:number;url?:string;type?:string}={}){const r=new Response(typeof body==='string'?body:JSON.stringify(body),{status,headers:{'content-type':type}});Object.defineProperty(r,'url',{value:url});return r;}

describe('symbol validation in the main process',()=>{
 it('accepts dotted class and warrant symbols for bars and the stream, and nothing looser',()=>{
  const input={requestId:'synthetic',symbol:'GME.WS',timeframe:'1Min',feed:'iex',start:nowS-3600,end:nowS};
  expect(barsInput(input,nowS).symbol).toBe('GME.WS');
  expect(barsInput({...input,symbol:'XYZ.WS.A'},nowS).symbol).toBe('XYZ.WS.A');
  expect(subscribeInput({symbols:['SPY','GME.WS','GME','BRK.B']})).toEqual(['BRK.B','GME','GME.WS','SPY']);
  for(const bad of ['gme.ws','GME WS','GME/WS','GME..WS','GME.WSXX','ABCDEF','A.B.C.D','GME.WS/../v2/account'])expect(()=>barsInput({...input,symbol:bad},nowS),bad).toThrow();
 });
});

describe('asset search input and validation',()=>{
 it('takes a short query and nothing else',()=>{
  expect(assetsInput({query:'  gme '})).toEqual({query:'GME'});
  expect(assetsInput({query:'GameStop'})).toEqual({query:'GAMESTOP'});
  for(const bad of [{},{query:''},{query:'   '},{query:'x'.repeat(41)},{query:'GME',url:'https://x/'},{query:'a\u0000b'},{query:5},null])expect(()=>assetsInput(bad),JSON.stringify(bad)).toThrow();
 });
 it('keeps only well-formed rows, cleans text, and marks warrants and chartable symbols',()=>{
  const rows=validateAssets([...LIST,{symbol:5},null,row('BAD\u0007','Control char'),row('LONGSYMBOLNAMEOVER20X','Too long')]);
  expect(rows.map((r:any)=>r.symbol)).toEqual(['GME','GME.WS','GMED','SPY','BRK.B','AGMH','XYZ/A']);
  expect(rows[1]).toEqual({symbol:'GME.WS',name:'GameStop Corp. Warrants',exchange:'NYSE',tradable:false,status:'active',chartable:true,warrant:true});
  expect(rows.find((r:any)=>r.symbol==='XYZ/A').chartable).toBe(false);
  expect(()=>validateAssets({assets:[]})).toThrow();
 });
});

describe('Alpaca asset lookup (owner key, main process, cached for the day)',()=>{
 it('lists GME and its warrant under their real Alpaca symbols, exact first, with only documented headers',async()=>{
  const fetchImpl=vi.fn(async(_u:string,_o:RequestInit)=>reply(LIST));
  const client=new AlpacaMarketData({keys:new MemoryKeys(),fetchImpl,now:()=>NOW,restMinIntervalMs:0});
  const result=await client.searchAssets({query:'gme'});
  expect(result.ok).toBe(true);
  expect(result.value.assets.map((r:any)=>r.symbol)).toEqual(['GME','GME.WS','GMED','AGMH']);
  expect(result.value.assets[1]).toMatchObject({symbol:'GME.WS',warrant:true,tradable:false});
  const [target,options]=fetchImpl.mock.calls[0];
  expect(target).toBe('https://api.alpaca.markets/v2/assets?status=active&asset_class=us_equity');
  expect(target).not.toContain(SECRET);expect(target).not.toContain(KEY_ID);
  expect(options).toMatchObject({method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',headers:{'APCA-API-KEY-ID':KEY_ID,'APCA-API-SECRET-KEY':SECRET}});
  expect(JSON.stringify(result)).not.toContain(SECRET);
  client.close();
 });
 it('finds by company name too, and caps the result list',async()=>{
  const many=Array.from({length:60},(_,i)=>row('GM'+String.fromCharCode(65+i%26)+String.fromCharCode(65+Math.floor(i/26)),'Filler '+i));
  const client=new AlpacaMarketData({keys:new MemoryKeys(),fetchImpl:async()=>reply([...LIST,...many]),now:()=>NOW,restMinIntervalMs:0});
  expect((await client.searchAssets({query:'gamestop'})).value.assets.map((r:any)=>r.symbol)).toEqual(['GME','GME.WS']);
  const wide=await client.searchAssets({query:'GM'});
  expect(wide.value.assets.length).toBe(25);expect(wide.value.total).toBeGreaterThan(25);
  client.close();
 });
 it('uses the paper trading host for a paper key',async()=>{
  const fetchImpl=vi.fn(async()=>reply(LIST,{url:assetsUrl(PAPER_ID)}));
  const client=new AlpacaMarketData({keys:new MemoryKeys({keyId:PAPER_ID,secret:SECRET}),fetchImpl,now:()=>NOW,restMinIntervalMs:0});
  expect((await client.searchAssets({query:'SPY'})).ok).toBe(true);
  expect((fetchImpl.mock.calls[0] as any)[0]).toBe('https://paper-api.alpaca.markets/v2/assets?status=active&asset_class=us_equity');
  client.close();
 });
 it('fetches the list once per New York day and again after the key changes',async()=>{
  let now=NOW;const keys=new MemoryKeys();
  const fetchImpl=vi.fn(async()=>reply(LIST,{url:assetsUrl(keys.keys.keyId)}));
  const client=new AlpacaMarketData({keys,fetchImpl,now:()=>now,restMinIntervalMs:0});
  const [a,b]=await Promise.all([client.searchAssets({query:'GME'}),client.searchAssets({query:'SPY'})]);
  expect(a.ok&&b.ok).toBe(true);expect(fetchImpl).toHaveBeenCalledTimes(1);
  now=NOW+6*3600*1000;await client.searchAssets({query:'GME'});expect(fetchImpl).toHaveBeenCalledTimes(1); // 17:00 New York, same day
  now=NOW+14*3600*1000;await client.searchAssets({query:'GME'});expect(fetchImpl).toHaveBeenCalledTimes(2); // 01:00 New York, next day
  client.forget();await client.searchAssets({query:'GME'});expect(fetchImpl).toHaveBeenCalledTimes(3);
  client.close();
 });
 it('does not cache failures and reports them in plain words',async()=>{
  const replies=[reply({message:'forbidden'},{status:403}),reply('<html>portal</html>',{type:'text/html'}),reply(LIST,{status:302}),reply({not:'a list'}),reply(LIST,{url:'https://evil.example/v2/assets'}),reply(LIST)];
  const fetchImpl=vi.fn(async()=>replies.shift()!);
  const client=new AlpacaMarketData({keys:new MemoryKeys(),fetchImpl,now:()=>NOW,restMinIntervalMs:0});
  expect(await client.searchAssets({query:'GME'})).toMatchObject({ok:false,error:{code:'AUTH_FAILED'}});
  expect(await client.searchAssets({query:'GME'})).toMatchObject({ok:false,error:{code:'ALPACA_FORMAT_INVALID'}});
  expect(await client.searchAssets({query:'GME'})).toMatchObject({ok:false,error:{code:'REDIRECT_DENIED'}});
  expect(await client.searchAssets({query:'GME'})).toMatchObject({ok:false,error:{code:'ALPACA_SCHEMA_INVALID'}});
  expect(await client.searchAssets({query:'GME'})).toMatchObject({ok:false,error:{code:'ALPACA_ORIGIN_DENIED'}});
  expect((await client.searchAssets({query:'GME'})).ok).toBe(true);
  expect(fetchImpl).toHaveBeenCalledTimes(6);
  client.close();
 });
 it('refuses an oversized list, needs a saved key, and rejects bad input before any request',async()=>{
  const big=new Response('[]',{status:200,headers:{'content-type':'application/json','content-length':String(ASSETS_MAX_BYTES+1)}});Object.defineProperty(big,'url',{value:assetsUrl(KEY_ID)});
  const client=new AlpacaMarketData({keys:new MemoryKeys(),fetchImpl:async()=>big,now:()=>NOW,restMinIntervalMs:0});
  expect(await client.searchAssets({query:'GME'})).toMatchObject({ok:false,error:{code:'ALPACA_TOO_LARGE'}});
  client.close();
  const fetchImpl=vi.fn();
  const none=new AlpacaMarketData({keys:new MemoryKeys(null),fetchImpl,now:()=>NOW});
  expect(await none.searchAssets({query:'GME'})).toMatchObject({ok:false,error:{code:'KEY_REQUIRED'}});
  expect(await none.searchAssets({query:'GME',host:'x'})).toMatchObject({ok:false,error:{code:'INVALID_ARGUMENT'}});
  expect(fetchImpl).not.toHaveBeenCalled();
  none.close();
 });
});
