import {expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import path from 'node:path';

// The actual main entry and preload under controlled Electron objects. No process, window or network.
const mainSource=readFileSync('electron/main.cjs','utf8'),preloadSource=readFileSync('electron/preload.cjs','utf8');
class BoundaryError extends Error{constructor(public code:string,message:string){super(message);}}
async function boot(){
  const handlers=new Map<string,(event:unknown,value?:unknown)=>Promise<any>>();
  const loaded:string[]=[];const created:any={};
  const app=Object.assign(new EventEmitter(),{requestSingleInstanceLock:()=>true,quit:vi.fn(),getPath:()=> 'C:\\Synthetic\\Profile',getAppPath:()=> 'C:\\Synthetic\\app.asar',whenReady:()=>Promise.resolve(),commandLine:{appendSwitch:vi.fn()},setPath:vi.fn()});
  const frame={url:'lv://app/index.html'};
  const web=Object.assign(new EventEmitter(),{setWindowOpenHandler:vi.fn(),isLoading:()=>false,isDestroyed:()=>false,isCrashed:()=>false,mainFrame:frame,send:vi.fn()});
  class Window extends EventEmitter{webContents=web;show=vi.fn();loadURL=vi.fn(async()=>{});isDestroyed=()=>false;close=vi.fn();}
  let filter:any;
  const safeStorage={isEncryptionAvailable:()=>true};
  const electron={app,BrowserWindow:Window,Menu:{setApplicationMenu:vi.fn()},protocol:{registerSchemesAsPrivileged:vi.fn(),handle:vi.fn()},safeStorage,
    session:{defaultSession:{setPermissionRequestHandler:vi.fn(),setPermissionCheckHandler:vi.fn(),on:vi.fn(),webRequest:{onBeforeRequest:(fn:any)=>{filter=fn;}}}},
    ipcMain:{handle:(name:string,fn:any)=>handlers.set(name,fn)},dialog:{showErrorBox:vi.fn()},utilityProcess:{}};
  class Feed{
    calls:any[]=[];emit:any;keys:any;
    constructor(options:any){this.emit=options.emit;this.keys=options.keys;created[this.constructor.name]=this;}
    candles(v:any){this.calls.push(['candles',v]);return Promise.resolve({ok:true,value:{bars:[]}});}
    subscribe(v:any){this.calls.push(['subscribe',v]);return {ok:true,value:{state:'connecting'}};}
    unsubscribe(){this.calls.push(['unsubscribe']);return {ok:true,value:{state:'idle'}};}
    status(){return {state:'idle'};}cancel(){return false;}close=vi.fn();forget=vi.fn();
    test(){return Promise.resolve({ok:true,value:{connected:true}});}bars(v:any){this.calls.push(['bars',v]);return Promise.resolve({ok:true,value:{bars:[]}});}
    searchAssets(v:any){this.calls.push(['searchAssets',v]);return Promise.resolve({ok:true,value:{assets:[{symbol:'GME'}]}});}
  }
  class CoinbasePublicFeed extends Feed{}
  class AlpacaMarketData extends Feed{}
  class AlpacaKeyStore{constructor(public options:any){created.AlpacaKeyStore=this;}status=vi.fn(async()=>({configured:false,keyIdHint:null,encryption:true}));save=vi.fn(async()=>({configured:true,keyIdHint:'****ABCD',encryption:true}));clear=vi.fn(async()=>({configured:false,keyIdHint:null,encryption:true}));}
  const require=(name:string):any=>{
    if(name==='electron')return electron;
    if(name==='node:path')return path;
    if(name==='node:fs/promises')return{};
    if(name==='./storage.cjs')return{WorkspaceStore:class{}};
    if(name==='./script-jobs.cjs')return{ScriptJobs:class{close(){}}};
    if(name==='./public-sec.cjs')return{SecCompanyFacts:class{close(){}}};
    if(name==='./public-coinbase.cjs'){loaded.push(name);return{CoinbasePublicFeed};}
    if(name==='./public-alpaca.cjs'){loaded.push(name);return{AlpacaMarketData,AlpacaKeyStore};}
    if(name==='./import-data.cjs')return{titles:{},limits:{}};
    if(name==='./alert-webhook.cjs')return{postAlertWebhook:()=>({delivered:false,status:0,error:null}),alertWebhookInput:(v:any)=>v};if(name==='./alert-notify.cjs')return{showAlertNotification:()=>({shown:false}),alertNotificationInput:(v:any)=>v};
    if(name==='./validation.cjs')return{BoundaryError,isAppURL:(url:string)=>url.startsWith('lv://app/'),exactKeys:(value:any,keys:string[])=>{if(!value||typeof value!=='object'||Object.keys(value).some(k=>!keys.includes(k)))throw new BoundaryError('INVALID_ARGUMENT','Unexpected or missing fields.');},cancelInput:(v:any)=>v.requestId};
    if(name==='../build-identity.json')return{buildId:'synthetic'};
    if(name==='./startup-diagnostics.cjs')return{createStartupDiagnostics:()=>({record:()=>undefined}),safeCode:()=>null};
    throw Error('Unexpected dependency '+name);
  };
  runInNewContext(mainSource,{require,process:{argv:[],pid:1},__dirname:'C:\\Synthetic\\electron',console:{error:vi.fn()},setTimeout,clearTimeout,Buffer,Response});
  for(let i=0;i<8;i++)await Promise.resolve();
  return{app,web,handlers,loaded,created,filter,trusted:{sender:web,senderFrame:frame}};
}

it('registers fixed live channels, loads live modules lazily, and denies untrusted senders before loading anything',async()=>{
  const b=await boot();
  for(const channel of ['lv:coinbase:candles','lv:coinbase:subscribe','lv:coinbase:unsubscribe','lv:coinbase:status','lv:coinbase:cancel','lv:alpaca:key-status','lv:alpaca:key-save','lv:alpaca:key-clear','lv:alpaca:test','lv:alpaca:bars','lv:alpaca:subscribe','lv:alpaca:unsubscribe','lv:alpaca:status','lv:alpaca:cancel'])expect(b.handlers.has(channel)).toBe(true);
  expect(b.loaded).toEqual([]);
  const other=new EventEmitter();
  for(const channel of ['lv:coinbase:subscribe','lv:alpaca:key-save','lv:alpaca:subscribe'])expect(await b.handlers.get(channel)!({sender:other,senderFrame:{url:'https://evil.example/'}},{productIds:['BTC-USD']})).toMatchObject({ok:false,error:{code:'DENIED'}});
  expect(await b.handlers.get('lv:coinbase:subscribe')!({sender:b.web,senderFrame:{url:'lv://app/index.html'}},{})).toMatchObject({ok:false,error:{code:'DENIED'}});
  expect(b.loaded).toEqual([]);
  expect(await b.handlers.get('lv:coinbase:status')!(b.trusted)).toEqual({ok:true,value:null});
  expect(b.loaded).toEqual([]);
});
it('trusted calls reach the feed; pushes go only to the main window; quit and renderer loss stop streams',async()=>{
  const b=await boot();
  expect(await b.handlers.get('lv:coinbase:subscribe')!(b.trusted,{productIds:['BTC-USD']})).toEqual({ok:true,value:{state:'connecting'}});
  expect(b.loaded).toEqual(['./public-coinbase.cjs']);
  const feed=b.created.CoinbasePublicFeed;feed.emit({kind:'batch'});
  expect(b.web.send).toHaveBeenCalledWith('lv:coinbase:event',{kind:'batch'});
  expect(await b.handlers.get('lv:coinbase:unsubscribe')!(b.trusted,{extra:1})).toMatchObject({ok:false,error:{code:'INVALID_ARGUMENT'}});
  b.app.emit('render-process-gone',{},b.web,{reason:'clean-exit',exitCode:0});
  expect(feed.calls.at(-1)).toEqual(['unsubscribe']);
  b.app.emit('before-quit');expect(feed.close).toHaveBeenCalled();
});
it('Alpaca key save is encrypted by the main-process store, never echoed, and drops any authenticated stream',async()=>{
  const b=await boot();
  await b.handlers.get('lv:alpaca:subscribe')!(b.trusted,{symbols:['AAPL']});
  const saved=await b.handlers.get('lv:alpaca:key-save')!(b.trusted,{keyId:'SYNTHETICKEY0000ABCD',secret:'SyntheticSecretNotARealKey0000000000000000'});
  expect(saved).toEqual({ok:true,value:{configured:true,keyIdHint:'****ABCD',encryption:true}});
  expect(JSON.stringify(saved)).not.toContain('SyntheticSecret');
  expect(b.created.AlpacaKeyStore.options).toMatchObject({directory:'C:\\Synthetic\\Profile'});
  expect(b.created.AlpacaKeyStore.options.safeStorage.isEncryptionAvailable()).toBe(true);
  expect(b.created.AlpacaMarketData.forget).toHaveBeenCalled();
  await b.handlers.get('lv:alpaca:key-clear')!(b.trusted);expect(b.created.AlpacaMarketData.forget).toHaveBeenCalledTimes(2);
});
it('renderer network stays closed: CSP connect-src none and the request filter still cancel https and wss',async()=>{
  const b=await boot();
  expect(mainSource).toContain("connect-src 'none'");
  for(const url of ['https://api.coinbase.com/api/v3/brokerage/market/products/BTC-USD/candles','wss://advanced-trade-ws.coinbase.com','wss://stream.data.alpaca.markets/v2/iex','https://data.alpaca.markets/v2/stocks/AAPL/bars']){const callback=vi.fn();b.filter({url},callback);expect(callback).toHaveBeenCalledWith({cancel:true});}
  const ok=vi.fn();b.filter({url:'lv://app/index.html'},ok);expect(ok).toHaveBeenCalledWith({cancel:false});
  // Only the two live modules hold endpoint hosts; main.cjs and preload.cjs carry none.
  for(const source of [mainSource,preloadSource])expect(source).not.toMatch(/coinbase\.com|alpaca\.markets|new WebSocket|fetch\(/);
});
it('preload exposes fixed live functions that take data only and never a URL, host or header',()=>{
  const invoke=vi.fn(async()=>({ok:true})),on=vi.fn(),removeListener=vi.fn();let exposed:any;
  const electron={contextBridge:{exposeInMainWorld:(_n:string,api:any)=>{exposed=api;}},ipcRenderer:{invoke,on,removeListener}};
  runInNewContext(preloadSource,{require:(name:string)=>{if(name==='electron')return electron;throw Error('Unexpected dependency '+name);},Object,Promise,TypeError});
  exposed.subscribeCoinbase({productIds:['BTC-USD']});exposed.fetchAlpacaBars({symbol:'AAPL'});exposed.saveAlpacaKey({keyId:'x',secret:'y'});
  expect(invoke.mock.calls.map((c:any[])=>c[0])).toEqual(['lv:coinbase:subscribe','lv:alpaca:bars','lv:alpaca:key-save']);
  const handler=vi.fn(),off=exposed.onCoinbaseEvent(handler);
  expect(on).toHaveBeenCalledWith('lv:coinbase:event',expect.any(Function));
  const live=on.mock.calls.find((c:any[])=>c[0]==='lv:coinbase:event')![1];live({},{kind:'batch'});expect(handler).toHaveBeenCalledWith({kind:'batch'});
  off();expect(removeListener).toHaveBeenCalledWith('lv:coinbase:event',live);
  expect(()=>exposed.onAlpacaEvent('not a function')).toThrow(TypeError);
  expect(Object.keys(exposed).filter(k=>/url|proxy|fetchUrl|connect$/i.test(k))).toEqual([]);
  expect(Object.keys(exposed)).not.toContain('getAlpacaSecret');
});
it('ALPACA-ASSETS: asset search is a fixed trusted channel that reaches only the main-process feed; preload exposes data-only calls',async()=>{
  const b=await boot();
  for(const channel of ['lv:alpaca:search-assets','lv:startup:open-symbols'])expect(b.handlers.has(channel)).toBe(true);
  const other=new EventEmitter();
  expect(await b.handlers.get('lv:alpaca:search-assets')!({sender:other,senderFrame:{url:'https://evil.example/'}},{query:'GME'})).toMatchObject({ok:false,error:{code:'DENIED'}});
  expect(b.loaded).toEqual([]);
  expect(await b.handlers.get('lv:alpaca:search-assets')!(b.trusted,{query:'GME'})).toEqual({ok:true,value:{assets:[{symbol:'GME'}]}});
  expect(b.created.AlpacaMarketData.calls.at(-1)).toEqual(['searchAssets',{query:'GME'}]);
  expect(await b.handlers.get('lv:startup:open-symbols')!(b.trusted)).toEqual({ok:true,value:null});
  const invoke=vi.fn(async()=>({ok:true}));let exposed:any;
  const electron={contextBridge:{exposeInMainWorld:(_n:string,api:any)=>{exposed=api;}},ipcRenderer:{invoke,on:vi.fn(),removeListener:vi.fn()}};
  runInNewContext(preloadSource,{require:(name:string)=>{if(name==='electron')return electron;throw Error('Unexpected dependency '+name);},Object,Promise,TypeError});
  exposed.searchAlpacaAssets({query:'GME'});exposed.startupOpenSymbols();
  expect(invoke.mock.calls).toEqual([['lv:alpaca:search-assets',{query:'GME'}],['lv:startup:open-symbols',undefined]]);
});
