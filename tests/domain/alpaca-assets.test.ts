import {describe,expect,it} from 'vitest';
import {ALPACA_SYMBOL,AlpacaLiveProvider,alpacaAssetNotice,alpacaNoIexDataMessage,matchAlpacaAsset,type AlpacaAsset,type AlpacaBridge} from '../../src/domain/alpaca-live';

// Synthetic asset rows and a mocked bridge only. No Alpaca endpoint is contacted.
const asset=(symbol:string,extra:Partial<AlpacaAsset>={}):AlpacaAsset=>({symbol,name:symbol+' synthetic listing',exchange:'NYSE',tradable:true,status:'active',chartable:ALPACA_SYMBOL.test(symbol),warrant:false,...extra});

describe('Alpaca symbol format',()=>{
 it('accepts dotted class, warrant, unit and preferred symbols',()=>{
  for(const ok of ['GME','SPY','BRK.B','GME.WS','XYZ.WS.A','ABC.U','ABC.PRA','ABCDE.WS']) expect(ALPACA_SYMBOL.test(ok),ok).toBe(true);
 });
 it('stays tight: no lower case, spaces, slashes, empty segments or long roots',()=>{
  for(const bad of ['','gme','GME WS','GME/WS','GME.','.WS','GME..WS','ABCDEF','GME.WSXX','A.B.C.D','GME.W1','GME-WS','GME.WS.A.B']) expect(ALPACA_SYMBOL.test(bad),bad).toBe(false);
 });
});

describe('matching a requested symbol to Alpaca assets',()=>{
 const list=[asset('GME'),asset('GME.WS',{name:'GameStop Corp. Warrants',warrant:true}),asset('GMED')];
 it('prefers the exact symbol',()=>{expect(matchAlpacaAsset('GME',list)?.symbol).toBe('GME');expect(matchAlpacaAsset('GME.WS',list)?.symbol).toBe('GME.WS');});
 it('maps other spellings of the warrant to the real Alpaca symbol',()=>{
  for(const typed of ['GME-WS','GMEWS','gme.ws','GME WS','GME/WS']) expect(matchAlpacaAsset(typed,list)?.symbol,typed).toBe('GME.WS');
 });
 it('returns null when nothing matches, or when a loose spelling is ambiguous',()=>{
  expect(matchAlpacaAsset('AMC',list)).toBeNull();
  expect(matchAlpacaAsset('AB-C',[asset('AB.C'),asset('ABC')])?.symbol).toBe('AB.C');
  expect(matchAlpacaAsset('ABCD',[asset('AB.CD'),asset('ABC.D')])).toBeNull();
 });
});

describe('plain-words asset notices',()=>{
 it('says nothing for an ordinary tradable listing',()=>expect(alpacaAssetNotice(asset('GME'))).toBeNull());
 it('explains a listing Alpaca marks not tradable',()=>{
  const text=alpacaAssetNotice(asset('GME.WS',{tradable:false,warrant:true}))!;
  expect(text).toContain('not tradable');expect(text).toContain('GME.WS');expect(text).toMatch(/IEX/);
 });
 it('explains OTC listings and inactive ones',()=>{
  expect(alpacaAssetNotice(asset('ABCDF',{exchange:'OTC'}))).toMatch(/OTC.*IEX/);
  expect(alpacaAssetNotice(asset('OLD',{status:'inactive'}))).toMatch(/no longer active/);
 });
 it('explains symbols OpenCandle cannot chart',()=>expect(alpacaAssetNotice(asset('AB/C',{chartable:false}))).toMatch(/cannot chart/));
});

describe('a live chart with no IEX data says so',()=>{
 it('adds a plain note once the backfill comes back empty',async()=>{
  const bridge:AlpacaBridge={
   alpacaKeyStatus:async()=>({ok:true,value:{configured:true,keyIdHint:'****ABCD',encryption:true}}),saveAlpacaKey:async()=>({ok:false,error:{code:'X',message:'x'}}),clearAlpacaKey:async()=>({ok:false,error:{code:'X',message:'x'}}),testAlpacaConnection:async()=>({ok:false,error:{code:'X',message:'x'}}),
   fetchAlpacaBars:async input=>({ok:true,value:{schemaVersion:1,symbol:input.symbol,timeframe:input.timeframe,seconds:60,feed:input.feed,bars:[],nextPageToken:null,provenance:{provider:'test',kind:'owner-key',feed:input.feed,delaySeconds:0,sourceUrl:'https://example.invalid/',retrievedAt:'2026-10-21T00:00:00Z',bytes:2,license:'test'}}}),
   subscribeAlpaca:async input=>({ok:true,value:{schemaVersion:1,state:'connecting',attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{},symbols:input.symbols,feed:'iex'}}),
   unsubscribeAlpaca:async()=>({ok:true,value:null}),onAlpacaEvent:()=>()=>{},
  };
  const provider=new AlpacaLiveProvider(bridge,{now:()=>Date.UTC(2026,9,21,15,0,0)}),handle=provider.open('GME.WS','1m');
  expect(handle.dataset().provenance.notes).not.toContain(alpacaNoIexDataMessage('GME.WS'));
  for(let i=0;i<10;i++)await Promise.resolve();
  expect(handle.dataset().bars).toEqual([]);
  expect(handle.dataset().provenance.notes).toContain(alpacaNoIexDataMessage('GME.WS'));
  expect(alpacaNoIexDataMessage('GME.WS')).toMatch(/^IEX has no recent trades for GME\.WS/);
  handle.close();provider.dispose();
 });
});
