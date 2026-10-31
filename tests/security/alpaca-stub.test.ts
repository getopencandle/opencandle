import {afterEach,describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import path from 'node:path';
import os from 'node:os';
import {AlpacaLiveProvider,type AlpacaBridge,type AlpacaEvent} from '../../src/domain/alpaca-live';
import {LIVE_NO_MORE_DATA} from '../../src/domain/live-history';
const require=createRequire(import.meta.url);
const stubModule=require('../../electron/alpaca-stub.cjs');
const {alpacaStubTransport:rawTransport,stubDecision:rawDecision,profileUnderTemp,STUB_EARLIEST,newYorkMidnight}=stubModule;
// Every stub use needs a throwaway profile inside the OS temp folder; these helpers supply one unless a test overrides it.
const TMP=os.tmpdir(),PROFILE=path.join(TMP,'lv-synthetic-profile');
const stubDecision=(options:any)=>rawDecision({profile:PROFILE,tmpdir:TMP,...options}),alpacaStubTransport=(options:any)=>rawTransport({profile:PROFILE,tmpdir:TMP,...options});
const {AlpacaMarketData,WS_URL}=require('../../electron/public-alpaca.cjs');

// The keyless synthetic Alpaca stub. No key, no network: the global fetch and WebSocket are replaced by
// throwing spies for every test, so any attempt to reach a real endpoint fails the test.
const guards=()=>{const fetch=vi.fn(()=>{throw new Error('network used');}),Socket=vi.fn(()=>{throw new Error('socket used');});vi.stubGlobal('fetch',fetch);vi.stubGlobal('WebSocket',Socket);return {fetch,Socket};};
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
const flush=async(n=20)=>{for(let i=0;i<n;i++)await Promise.resolve();};
function market(transport:any,now=()=>Date.now()){const events:any[]=[];const feed=new AlpacaMarketData({keys:transport.keys,fetchImpl:transport.fetch,WebSocketImpl:transport.WebSocket,restMinIntervalMs:0,now,emit:(event:any)=>events.push(event)});return {feed,events};}

describe('stub selection',()=>{
 it('is off without the flag, synthetic in development, refused in a packaged run unless the harness flag is set',()=>{
  expect(stubDecision({env:{},packaged:false}).mode).toBe('off');
  expect(alpacaStubTransport({env:{},packaged:true})).toBeNull();
  expect(stubDecision({env:{LV_ALPACA_STUB:'synthetic'},packaged:false}).mode).toBe('synthetic');
  expect(stubDecision({env:{LV_ALPACA_STUB:'synthetic'},packaged:true})).toMatchObject({mode:'blocked',reason:expect.stringContaining('LV_EXE_HARNESS=alpaca-stub')});
  expect(stubDecision({env:{LV_ALPACA_STUB:'synthetic',LV_EXE_HARNESS:'yes'},packaged:true}).mode).toBe('blocked');
  expect(stubDecision({env:{LV_ALPACA_STUB:'synthetic',LV_EXE_HARNESS:'alpaca-stub'},packaged:true}).mode).toBe('synthetic');
  expect(stubDecision({env:{LV_ALPACA_STUB:'1'},packaged:false})).toMatchObject({mode:'blocked',reason:expect.stringContaining('"synthetic"')});
 });
 it('needs --lv-profile strictly inside the OS temp folder: no profile, the default profile, the demo profile or the temp root itself are refused',()=>{
  const env={LV_ALPACA_STUB:'synthetic',LV_EXE_HARNESS:'alpaca-stub'},refused=expect.stringContaining('throwaway profile');
  for(const profile of [null,'',path.join(os.homedir(),'AppData','Roaming','LarryVision'),String.raw`C:\work\OpenCandle\local-data\demo-profile`,TMP,TMP+path.sep,path.join(TMP,'..','escape'),path.join(TMP,'x','..','..','escape')])
   expect(rawDecision({env,packaged:true,profile,tmpdir:TMP})).toMatchObject({mode:'blocked',reason:refused});
  expect(rawDecision({env,packaged:true,profile:PROFILE,tmpdir:null})).toMatchObject({mode:'blocked',reason:refused});
  expect(rawDecision({env,packaged:true,profile:PROFILE,tmpdir:TMP}).mode).toBe('synthetic');
  expect(profileUnderTemp(String.raw`C:\Users\Me\AppData\Local\Temp\lv-abc`,'c:/users/me/appdata/local/temp')).toBe(true);
  expect(profileUnderTemp(String.raw`C:\Users\Me\AppData\Local\TempX\lv-abc`,String.raw`C:\Users\Me\AppData\Local\Temp`)).toBe(false);
  expect(profileUnderTemp('/tmp/lv-abc','/tmp')).toBe(true);expect(profileUnderTemp('/tmp','/tmp')).toBe(false);
  // Without a profile even a refused request blocks Alpaca (no key, no request).
  expect(rawTransport({env,packaged:false}).mode).toBe('blocked');
 });
 it('a refused stub blocks Alpaca: no key, no request, no socket',async()=>{
  const net=guards(),blocked=alpacaStubTransport({env:{LV_ALPACA_STUB:'synthetic'},packaged:true});
  expect(blocked.mode).toBe('blocked');
  expect(await blocked.keys.status()).toEqual({configured:false,keyIdHint:null,encryption:true});
  await expect(blocked.keys.save({keyId:'X',secret:'Y'})).rejects.toMatchObject({code:'KEY_STORAGE_UNAVAILABLE'});
  await expect(blocked.fetch('https://example.invalid/')).rejects.toThrow(/blocked/);
  expect(()=>new blocked.WebSocket(WS_URL)).toThrow(/blocked/);
  const {feed}=market(blocked);
  expect(await feed.bars({requestId:'b1',symbol:'GME',timeframe:'1Day',feed:'iex',start:Math.floor(Date.now()/1000)-86400*5,end:Math.floor(Date.now()/1000)})).toMatchObject({ok:false,error:{code:'KEY_REQUIRED'}});
  expect(await feed.subscribe({symbols:['GME']})).toMatchObject({ok:false,error:{code:'KEY_REQUIRED'}});
  expect(net.fetch).not.toHaveBeenCalled();expect(net.Socket).not.toHaveBeenCalled();
 });
});

describe('synthetic REST bars through the real main-process client',()=>{
 it('serves aligned, validated, paged bars for GME, SPY and GME.WS; nothing before the synthetic start; never the network',async()=>{
  const net=guards(),stub=alpacaStubTransport({env:{LV_ALPACA_STUB:'synthetic'},packaged:false}),{feed}=market(stub),now=Math.floor(Date.now()/1000);
  expect(await stub.keys.status()).toEqual({configured:true,keyIdHint:'****STUB',encryption:true,synthetic:true});
  await expect(stub.keys.save({keyId:'X',secret:'Y'})).rejects.toMatchObject({code:'KEY_STORAGE_UNAVAILABLE'});
  for(const symbol of ['GME','SPY','GME.WS']){
   const daily=await feed.bars({requestId:'d-'+symbol.replace('.','-'),symbol,timeframe:'1Day',feed:'iex',start:now-450*86400,end:now});
   expect(daily.ok).toBe(true);expect(daily.value.symbol).toBe(symbol);expect(daily.value.bars.length).toBeGreaterThan(440);expect(daily.value.nextPageToken).toBeNull();
   for(const bar of daily.value.bars){expect(bar.time).toBe(newYorkMidnight(bar.time));expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open,bar.close));expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open,bar.close));}
  }
  const first=await feed.bars({requestId:'m1',symbol:'GME',timeframe:'1Min',feed:'iex',start:now-7*86400,end:now});
  expect(first.ok).toBe(true);expect(first.value.bars).toHaveLength(10000);expect(first.value.nextPageToken).toMatch(/^\d+$/);
  expect(first.value.bars.every((bar:any)=>bar.time%60===0&&bar.time+60<=now+1)).toBe(true);
  const second=await feed.bars({requestId:'m2',symbol:'GME',timeframe:'1Min',feed:'iex',start:now-7*86400,end:now,pageToken:first.value.nextPageToken});
  expect(second.ok).toBe(true);expect(second.value.bars[0].time).toBe(first.value.bars.at(-1).time+60);expect(second.value.nextPageToken).toBeNull();
  const old=await feed.bars({requestId:'o1',symbol:'SPY',timeframe:'1Day',feed:'iex',start:STUB_EARLIEST-400*86400,end:STUB_EARLIEST-86400});
  expect(old).toMatchObject({ok:true,value:{bars:[],nextPageToken:null}});
  const listed=await feed.searchAssets({query:'GME'});
  expect(listed.ok).toBe(true);expect(listed.value.assets.map((row:any)=>row.symbol)).toEqual(['GME','GME.WS']);expect(listed.value.assets[0].name).toMatch(/SYNTHETIC/);
  await expect(stub.fetch('https://example.invalid/v2/stocks/GME/bars')).rejects.toThrow(/never contacts the network/);
  expect(net.fetch).not.toHaveBeenCalled();expect(net.Socket).not.toHaveBeenCalled();
 });
});

describe('synthetic IEX stream through the real main-process client',()=>{
 it('authenticates with the stub credential only, streams trades each tick and closed minute and daily bars at the minute',async()=>{
  const net=guards();vi.useFakeTimers({toFake:['setTimeout','setInterval','clearTimeout','clearInterval','Date']});vi.setSystemTime(Date.UTC(2026,9,21,14,0,30));
  const stub=alpacaStubTransport({env:{LV_ALPACA_STUB:'synthetic'},packaged:false,tickMs:1000}),{feed,events}=market(stub);
  expect(await feed.subscribe({symbols:['GME','SPY','GME.WS']})).toMatchObject({ok:true});
  await vi.advanceTimersByTimeAsync(50);
  expect(events.filter(e=>e.kind==='status').map(e=>e.status.state)).toEqual(['connecting','authenticating','ready']);
  await vi.advanceTimersByTimeAsync(3000);
  const batches=events.filter(e=>e.kind==='batch');
  expect(batches.length).toBeGreaterThan(0);
  expect(new Set(batches.flatMap(b=>b.trades.map((t:any)=>t.symbol)))).toEqual(new Set(['GME','SPY','GME.WS']));
  await vi.advanceTimersByTimeAsync(30000);
  const bars=events.filter(e=>e.kind==='batch').flatMap(b=>b.bars);
  expect(bars.some((b:any)=>b.kind==='minute'&&b.symbol==='GME'&&b.time===Date.UTC(2026,9,21,14,0,0)/1000)).toBe(true);
  expect(bars.some((b:any)=>b.kind==='daily'&&b.symbol==='SPY'&&b.time===newYorkMidnight(Date.UTC(2026,9,21,14)/1000))).toBe(true);
  expect(feed.status().counters.rejected).toBe(0);
  feed.close();expect(net.fetch).not.toHaveBeenCalled();expect(net.Socket).not.toHaveBeenCalled();
 });
 it('a wrong credential is refused like the real service (auth failed, no retry)',async()=>{
  guards();vi.useFakeTimers({toFake:['setTimeout','setInterval','clearTimeout','clearInterval']});
  const stub=alpacaStubTransport({env:{LV_ALPACA_STUB:'synthetic'},packaged:false});
  const {feed,events}=market({...stub,keys:{load:async()=>({keyId:'SYNTHETICKEY0000ABCD',secret:'SyntheticSecretNotARealKey0000000000000000'})}});
  await feed.subscribe({symbols:['GME']});await vi.advanceTimersByTimeAsync(50);
  expect(events.filter(e=>e.kind==='status').at(-1).status.state).toBe('auth-failed');feed.close();
 });
});

describe('renderer provider on the stub (backfill, stream, paging back to "No more data")',()=>{
 it('a GME.WS daily chart backfills, updates from the stream and pages back to the synthetic start',async()=>{
  guards();
  const stub=alpacaStubTransport({env:{LV_ALPACA_STUB:'synthetic'},packaged:false,tickMs:20});let skew=0;
  const listeners=new Set<(event:AlpacaEvent)=>void>(),feed=new AlpacaMarketData({keys:stub.keys,fetchImpl:stub.fetch,WebSocketImpl:stub.WebSocket,restMinIntervalMs:0,emit:(event:AlpacaEvent)=>{for(const listener of listeners)listener(event);}});
  // The same calls preload.cjs forwards over the trusted lv:alpaca:* channels.
  const bridge:AlpacaBridge={alpacaKeyStatus:async()=>({ok:true,value:await stub.keys.status()}),saveAlpacaKey:async()=>({ok:false,error:{code:'X',message:'x'}}),clearAlpacaKey:async()=>({ok:true,value:await stub.keys.status()}),testAlpacaConnection:()=>feed.test(),
   fetchAlpacaBars:input=>feed.bars(input),subscribeAlpaca:input=>feed.subscribe(input),unsubscribeAlpaca:async()=>feed.unsubscribe(),onAlpacaEvent:handler=>{listeners.add(handler);return()=>listeners.delete(handler);}};
  const provider=new AlpacaLiveProvider(bridge,{now:()=>Date.now()+skew}),handle=provider.open('GME.WS','1D');
  await vi.waitFor(()=>expect(handle.dataset().bars.length).toBe(300),{timeout:5000});
  await vi.waitFor(()=>expect(handle.dataset().provenance.state).toBe('ready'),{timeout:5000});
  const before=handle.dataset();
  await vi.waitFor(()=>expect(handle.dataset()).not.toBe(before),{timeout:5000});
  let pages=0,state=handle.historyState!();
  while(state.status!=='exhausted'&&pages<20){skew+=2000;state=await handle.loadOlder!();pages++;}
  expect(state).toEqual({status:'exhausted',message:LIVE_NO_MORE_DATA});
  const bars=handle.dataset().bars;
  expect(bars[0].time).toBe(STUB_EARLIEST);expect(newYorkMidnight(STUB_EARLIEST)).toBe(STUB_EARLIEST);
  expect(bars.every((bar,index)=>index===0||bar.time>bars[index-1].time)).toBe(true);
  handle.close();provider.dispose();feed.close();
 },15000);
});

describe('main.cjs selects the transport from the environment',()=>{
 const mainSource=readFileSync('electron/main.cjs','utf8');
 const {BoundaryError}=require('../../electron/validation.cjs');
 async function boot(env:Record<string,string>|undefined,packaged:boolean,argv:string[]=['--lv-profile='+PROFILE]){
  const handlers=new Map<string,(event:unknown,value?:unknown)=>Promise<any>>(),created:any={},loaded:string[]=[],logged:string[]=[];
  const app=Object.assign(new EventEmitter(),{isPackaged:packaged,requestSingleInstanceLock:()=>true,quit:vi.fn(),getPath:()=> 'C:\\Synthetic\\Profile',getAppPath:()=> 'C:\\Synthetic\\app.asar',whenReady:()=>Promise.resolve(),commandLine:{appendSwitch:vi.fn()},setPath:vi.fn()});
  const frame={url:'lv://app/index.html'},web=Object.assign(new EventEmitter(),{setWindowOpenHandler:vi.fn(),isLoading:()=>false,isDestroyed:()=>false,isCrashed:()=>false,mainFrame:frame,send:vi.fn()});
  class Window extends EventEmitter{webContents=web;show=vi.fn();loadURL=vi.fn(async()=>{});isDestroyed=()=>false;close=vi.fn();}
  const electron={app,BrowserWindow:Window,Menu:{setApplicationMenu:vi.fn()},protocol:{registerSchemesAsPrivileged:vi.fn(),handle:vi.fn()},safeStorage:{isEncryptionAvailable:()=>true},
   session:{defaultSession:{setPermissionRequestHandler:vi.fn(),setPermissionCheckHandler:vi.fn(),on:vi.fn(),webRequest:{onBeforeRequest:vi.fn()}}},ipcMain:{handle:(name:string,fn:any)=>handlers.set(name,fn)},dialog:{showErrorBox:vi.fn()},utilityProcess:{}};
  class AlpacaMarketData{constructor(public options:any){created.AlpacaMarketData=this;}bars=vi.fn(async()=>({ok:true,value:{bars:[]}}));forget=vi.fn();close=vi.fn();unsubscribe=vi.fn(()=>({ok:true,value:null}));}
  class AlpacaKeyStore{constructor(public options:any){created.AlpacaKeyStore=this;}status=vi.fn(async()=>({configured:false,keyIdHint:null,encryption:true}));}
  const req=(name:string):any=>{
   if(name==='electron')return electron;if(name==='node:path')return path;if(name==='node:os'){loaded.push(name);return os;}if(name==='node:fs'){loaded.push(name);return require('node:fs');}if(name==='node:fs/promises')return{};
   if(name==='./storage.cjs')return{WorkspaceStore:class{}};if(name==='./script-jobs.cjs')return{ScriptJobs:class{close(){}}};if(name==='./public-sec.cjs')return{SecCompanyFacts:class{close(){}}};
   if(name==='./public-alpaca.cjs'){loaded.push(name);return{AlpacaMarketData,AlpacaKeyStore};}
   if(name==='./alpaca-stub.cjs'){loaded.push(name);return stubModule;}
   if(name==='./import-data.cjs')return{titles:{},limits:{}};if(name==='./alert-webhook.cjs')return{postAlertWebhook:()=>({delivered:false,status:0,error:null}),alertWebhookInput:(v:any)=>v};if(name==='./alert-notify.cjs')return{showAlertNotification:()=>({shown:false}),alertNotificationInput:(v:any)=>v};
   if(name==='./validation.cjs')return{BoundaryError,isAppURL:(url:string)=>url.startsWith('lv://app/'),exactKeys:()=>undefined,cancelInput:(v:any)=>v.requestId};
   if(name==='../build-identity.json')return{buildId:'synthetic'};if(name==='./startup-diagnostics.cjs')return{createStartupDiagnostics:()=>({record:()=>undefined}),safeCode:()=>null};
   throw Error('Unexpected dependency '+name);
  };
  runInNewContext(mainSource,{require:req,process:{argv,pid:1,...(env?{env}:{})},__dirname:'C:\\Synthetic\\electron',console:{error:(text:string)=>logged.push(text)},setTimeout,clearTimeout,Buffer,Response});
  for(let i=0;i<8;i++)await Promise.resolve();
  return{handlers,created,loaded,logged,trusted:{sender:web,senderFrame:frame}};
 }
 it('no flag (or no process.env at all): the real key store and transport, the stub module never loads',async()=>{
  for(const env of [undefined,{}]){
   const b=await boot(env,true);
   await b.handlers.get('lv:alpaca:bars')!(b.trusted,{requestId:'r'});
   expect([...new Set(b.loaded)]).toEqual(['./public-alpaca.cjs']);expect(b.logged).toEqual([]);expect(b.created.AlpacaKeyStore).toBeDefined();
   expect(b.created.AlpacaMarketData.options.fetchImpl).toBeUndefined();expect(b.created.AlpacaMarketData.options.WebSocketImpl).toBeUndefined();
  }
 });
 it('development with LV_ALPACA_STUB=synthetic: the stub keys and transport, no key file is read',async()=>{
  const b=await boot({LV_ALPACA_STUB:'synthetic'},false);
  // Decided and logged once at startup, before any Alpaca request.
  expect(b.logged).toEqual(['OpenCandle: Alpaca uses the synthetic stub (no network).']);expect(b.loaded).toContain('./alpaca-stub.cjs');
  expect(await b.handlers.get('lv:alpaca:key-status')!(b.trusted)).toEqual({ok:true,value:{configured:true,keyIdHint:'****STUB',encryption:true,synthetic:true}});
  await b.handlers.get('lv:alpaca:bars')!(b.trusted,{requestId:'r'});
  expect(b.created.AlpacaKeyStore).toBeUndefined();
  expect(typeof b.created.AlpacaMarketData.options.fetchImpl).toBe('function');expect(typeof b.created.AlpacaMarketData.options.WebSocketImpl).toBe('function');
  expect(await b.handlers.get('lv:alpaca:key-save')!(b.trusted,{keyId:'SYNTHETICKEY0000ABCD',secret:'SyntheticSecretNotARealKey0000000000000000'})).toMatchObject({ok:false,error:{code:'KEY_STORAGE_UNAVAILABLE'}});
  expect(b.logged.join('\n')).toMatch(/synthetic stub/);
 });
 it('packaged: refused (Alpaca blocked) without the harness flag, synthetic with it',async()=>{
  const refused=await boot({LV_ALPACA_STUB:'synthetic'},true);
  expect(await refused.handlers.get('lv:alpaca:key-status')!(refused.trusted)).toEqual({ok:true,value:{configured:false,keyIdHint:null,encryption:true}});
  await refused.handlers.get('lv:alpaca:bars')!(refused.trusted,{requestId:'r'});
  expect(refused.created.AlpacaKeyStore).toBeUndefined();
  await expect(refused.created.AlpacaMarketData.options.fetchImpl('https://example.invalid/')).rejects.toThrow(/blocked/);
  expect(refused.logged.join('\n')).toMatch(/blocked/);
  const harness=await boot({LV_ALPACA_STUB:'synthetic',LV_EXE_HARNESS:'alpaca-stub'},true);
  expect(await harness.handlers.get('lv:alpaca:key-status')!(harness.trusted)).toMatchObject({ok:true,value:{configured:true,keyIdHint:'****STUB',synthetic:true}});
 });
 it('refuses (Alpaca blocked) without a throwaway --lv-profile inside the OS temp folder, even with the harness flag',async()=>{
  for(const argv of [[],['--lv-profile='+path.join(os.homedir(),'LarryVision-profile')],['--lv-profile='+TMP]]){
   const b=await boot({LV_ALPACA_STUB:'synthetic',LV_EXE_HARNESS:'alpaca-stub'},true,argv);
   expect(b.logged.join(' ')).toMatch(/blocked: .*throwaway profile/);
   expect(await b.handlers.get('lv:alpaca:key-status')!(b.trusted)).toEqual({ok:true,value:{configured:false,keyIdHint:null,encryption:true}});
   await b.handlers.get('lv:alpaca:bars')!(b.trusted,{requestId:'r'});
   expect(b.created.AlpacaKeyStore).toBeUndefined();
   await expect(b.created.AlpacaMarketData.options.fetchImpl('https://example.invalid/')).rejects.toThrow(/blocked/);
  }
 });
});
