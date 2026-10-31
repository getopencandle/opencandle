import {expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import path from 'node:path';

// The real main entry and preload under controlled Electron objects (no process, window, file or network). The
// bar cache is reached only through fixed trusted channels, loads lazily, lives in the profile folder, and admits only the
// namespace of the run (the SYNTHETIC stub namespace in a stub run).
const mainSource=readFileSync('electron/main.cjs','utf8'),preloadSource=readFileSync('electron/preload.cjs','utf8'),cacheSource=readFileSync('electron/bar-cache.cjs','utf8');
const CHANNELS=['lv:barcache:read','lv:barcache:write','lv:barcache:discard','lv:barcache:status','lv:barcache:clear'];
class BoundaryError extends Error{constructor(public code:string,message:string){super(message);}}
async function boot(options:{stub?:'synthetic'|'blocked'}={}){
  const handlers=new Map<string,(event:unknown,value?:unknown)=>Promise<any>>();
  const loaded:string[]=[];const caches:any[]=[];
  const app=Object.assign(new EventEmitter(),{requestSingleInstanceLock:()=>true,quit:vi.fn(),getPath:()=> 'C:\\Synthetic\\Profile',getAppPath:()=> 'C:\\Synthetic\\app.asar',whenReady:()=>Promise.resolve(),commandLine:{appendSwitch:vi.fn()},setPath:vi.fn(),isPackaged:false});
  const frame={url:'lv://app/index.html'};
  const web=Object.assign(new EventEmitter(),{setWindowOpenHandler:vi.fn(),isLoading:()=>false,isDestroyed:()=>false,isCrashed:()=>false,mainFrame:frame,send:vi.fn()});
  class Window extends EventEmitter{webContents=web;show=vi.fn();loadURL=vi.fn(async()=>{});isDestroyed=()=>false;close=vi.fn();}
  const electron={app,BrowserWindow:Window,Menu:{setApplicationMenu:vi.fn()},protocol:{registerSchemesAsPrivileged:vi.fn(),handle:vi.fn()},safeStorage:{isEncryptionAvailable:()=>true},
    session:{defaultSession:{setPermissionRequestHandler:vi.fn(),setPermissionCheckHandler:vi.fn(),on:vi.fn(),webRequest:{onBeforeRequest:vi.fn()}}},
    ipcMain:{handle:(name:string,fn:any)=>handlers.set(name,fn)},dialog:{showErrorBox:vi.fn()},utilityProcess:{}};
  class BarCache{
    calls:any[]=[];
    constructor(public options:any){caches.push(this);}
    read(v:any){this.calls.push(['read',v]);return Promise.resolve(null);}
    write(v:any){this.calls.push(['write',v]);return Promise.resolve({schemaVersion:1,bytes:10,entries:1,maxBytes:200});}
    discard(v:any){this.calls.push(['discard',v]);return Promise.resolve({removed:0});}
    status(){this.calls.push(['status']);return Promise.resolve({schemaVersion:1,bytes:0,entries:0,maxBytes:200});}
    clear(){this.calls.push(['clear']);return Promise.resolve({schemaVersion:1,bytes:0,entries:0,maxBytes:200});}
  }
  const require=(name:string):any=>{
    if(name==='electron')return electron;
    if(name==='node:path')return path;
    if(name==='node:fs/promises')return{};
    if(name==='node:os')return{tmpdir:()=> 'C:\\Synthetic\\Temp'};
    if(name==='node:fs')return{realpathSync:{native:(value:string)=>value}};
    if(name==='./storage.cjs')return{WorkspaceStore:class{}};
    if(name==='./script-jobs.cjs')return{ScriptJobs:class{close(){}}};
    if(name==='./public-sec.cjs')return{SecCompanyFacts:class{close(){}}};
    if(name==='./bar-cache.cjs'){loaded.push(name);return{BarCache,CACHE_DIRECTORY:'market-data-cache'};}
    if(name==='./alpaca-stub.cjs')return{alpacaStubTransport:()=>options.stub==='synthetic'?{mode:'synthetic',keys:{},fetch:vi.fn(),WebSocket:class{}}:{mode:'blocked',reason:'synthetic refusal'}};
    if(name==='./public-alpaca.cjs'){loaded.push(name);return{AlpacaMarketData:class{},AlpacaKeyStore:class{}};}
    if(name==='./public-coinbase.cjs'){loaded.push(name);return{CoinbasePublicFeed:class{}};}
    if(name==='./import-data.cjs')return{titles:{},limits:{}};
    if(name==='./alert-webhook.cjs')return{postAlertWebhook:()=>({delivered:false,status:0,error:null}),alertWebhookInput:(v:any)=>v};if(name==='./alert-notify.cjs')return{showAlertNotification:()=>({shown:false}),alertNotificationInput:(v:any)=>v};
    if(name==='./validation.cjs')return{BoundaryError,isAppURL:(url:string)=>url.startsWith('lv://app/'),exactKeys:(value:any,keys:string[])=>{if(!value||typeof value!=='object'||Object.keys(value).some(k=>!keys.includes(k)))throw new BoundaryError('INVALID_ARGUMENT','Unexpected or missing fields.');},cancelInput:(v:any)=>v.requestId};
    if(name==='../build-identity.json')return{buildId:'synthetic'};
    if(name==='./startup-diagnostics.cjs')return{createStartupDiagnostics:()=>({record:()=>undefined}),safeCode:()=>null};
    throw Error('Unexpected dependency '+name);
  };
  const argv=options.stub?['--lv-profile=C:\\Synthetic\\Temp\\lv-profile']:[];
  const env=options.stub?{LV_ALPACA_STUB:'synthetic'}:{};
  runInNewContext(mainSource,{require,process:{argv,pid:1,env},__dirname:'C:\\Synthetic\\electron',console:{error:vi.fn()},setTimeout,clearTimeout,Buffer,Response});
  for(let i=0;i<8;i++)await Promise.resolve();
  return{handlers,loaded,caches,web,trusted:{sender:web,senderFrame:frame}};
}

it('registers the five cache channels in the trusted table, denies untrusted senders, and loads the module only on first trusted use',async()=>{
  const b=await boot();
  for(const channel of CHANNELS)expect(b.handlers.has(channel),channel).toBe(true);
  expect(b.loaded).toEqual([]);
  const other=new EventEmitter();
  for(const channel of CHANNELS)expect(await b.handlers.get(channel)!({sender:other,senderFrame:{url:'https://evil.example/'}},{})).toMatchObject({ok:false,error:{code:'DENIED'}});
  expect(await b.handlers.get('lv:barcache:status')!({sender:b.web,senderFrame:{url:'https://evil.example/'}})).toMatchObject({ok:false,error:{code:'DENIED'}});
  expect(b.loaded).toEqual([]);
  expect(await b.handlers.get('lv:barcache:status')!(b.trusted)).toEqual({ok:true,value:{schemaVersion:1,bytes:0,entries:0,maxBytes:200}});
  expect(b.loaded).toEqual(['./bar-cache.cjs']);
  // The cache lives in the app profile (userData), in its own folder, never in the workspace store.
  expect(b.caches).toHaveLength(1);
  expect(b.caches[0].options).toEqual({directory:path.join('C:\\Synthetic\\Profile','market-data-cache'),allowedProviders:['alpaca-iex']});
});
it('trusted calls pass data straight to the main-process cache; status and clear take no input; nothing loads the Alpaca feed',async()=>{
  const b=await boot();
  const key={provider:'alpaca-iex',symbol:'GME',interval:'5m',feed:'sip',adjustment:'split',plan:'free'};
  expect(await b.handlers.get('lv:barcache:read')!(b.trusted,{key})).toEqual({ok:true,value:null});
  expect(await b.handlers.get('lv:barcache:write')!(b.trusted,{key,bars:[]})).toMatchObject({ok:true});
  expect(await b.handlers.get('lv:barcache:discard')!(b.trusted,{provider:'alpaca-iex',symbol:'GME'})).toEqual({ok:true,value:{removed:0}});
  expect(await b.handlers.get('lv:barcache:clear')!(b.trusted)).toMatchObject({ok:true,value:{entries:0}});
  expect(b.caches[0].calls).toEqual([['read',{key}],['write',{key,bars:[]}],['discard',{provider:'alpaca-iex',symbol:'GME'}],['clear']]);
  for(const channel of ['lv:barcache:status','lv:barcache:clear'])expect(await b.handlers.get(channel)!(b.trusted,{path:'C:\\x'})).toMatchObject({ok:false,error:{code:'INVALID_ARGUMENT'}});
  expect(b.loaded).toEqual(['./bar-cache.cjs']);
});
it('a synthetic stub run admits only the alpaca-stub namespace; a blocked stub run admits none',async()=>{
  const stub=await boot({stub:'synthetic'});
  await stub.handlers.get('lv:barcache:status')!(stub.trusted);
  expect(stub.caches[0].options.allowedProviders).toEqual(['alpaca-stub']);
  const blocked=await boot({stub:'blocked'});
  await blocked.handlers.get('lv:barcache:status')!(blocked.trusted);
  expect(blocked.caches[0].options.allowedProviders).toEqual([]);
});
it('preload exposes fixed data-only cache calls; no path, URL or file name crosses the bridge',()=>{
  const invoke=vi.fn(async()=>({ok:true}));let exposed:any;
  const electron={contextBridge:{exposeInMainWorld:(_n:string,api:any)=>{exposed=api;}},ipcRenderer:{invoke,on:vi.fn(),removeListener:vi.fn()}};
  runInNewContext(preloadSource,{require:(name:string)=>{if(name==='electron')return electron;throw Error('Unexpected dependency '+name);},Object,Promise,TypeError});
  exposed.readBarCache({key:{symbol:'GME'}});exposed.writeBarCache({key:{symbol:'GME'},bars:[]});exposed.discardBarCache({provider:'alpaca-iex',symbol:'GME'});exposed.barCacheStatus();exposed.clearBarCache();
  expect(invoke.mock.calls).toEqual([['lv:barcache:read',{key:{symbol:'GME'}}],['lv:barcache:write',{key:{symbol:'GME'},bars:[]}],['lv:barcache:discard',{provider:'alpaca-iex',symbol:'GME'}],['lv:barcache:status',undefined],['lv:barcache:clear',undefined]]);
  expect(Object.keys(exposed).filter(k=>/cache/i.test(k)).sort()).toEqual(['barCacheStatus','clearBarCache','discardBarCache','readBarCache','writeBarCache']);
  expect(Object.keys(exposed).filter(k=>/url|path|file|dir/i.test(k)&&/cache/i.test(k))).toEqual([]);
});
it('the cache module has no network, process, shell or Electron access and requires only fs, path, crypto and validation',()=>{
  const requires=[...cacheSource.matchAll(/require\(\s*['"`]([^'"`]*)['"`]\s*\)/g)].map(match=>match[1]).sort();
  expect(requires).toEqual(['./validation.cjs','node:crypto','node:fs/promises','node:path']);
  expect(cacheSource).not.toMatch(/globalThis\.fetch|fetch\(|WebSocket|https?:\/\/|wss?:\/\/|child_process|openExternal|\bimport\s*\(/);
  // main.cjs and preload.cjs still carry no endpoint host and the renderer CSP still blocks every connection.
  expect(mainSource).toContain("connect-src 'none'");
  for(const source of [mainSource,preloadSource])expect(source).not.toMatch(/alpaca\.markets|coinbase\.com|new WebSocket|fetch\(/);
  expect((mainSource.match(/require\(['"]\.\/bar-cache\.cjs['"]\)/g)??[]).length).toBe(1);
});
