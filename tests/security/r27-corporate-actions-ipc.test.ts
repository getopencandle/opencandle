import {expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import path from 'node:path';

// The actual main entry and preload under controlled Electron objects (harness copied from live-ipc-main.test.ts).
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
  class AlpacaCorporateActions{calls:any[]=[];constructor(public options:any){created.AlpacaCorporateActions=this;}load(v:any){this.calls.push(v);return Promise.resolve({ok:true,value:{events:[]}});}}
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
    if(name==='./public-alpaca-actions.cjs'){loaded.push(name);return{AlpacaCorporateActions,ACTIONS_CACHE_DIRECTORY:'corporate-actions-cache'};}
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

it('corporate actions is a fixed trusted channel; the module loads only on a trusted call and gets the shared queue, the key store and a profile cache folder',async()=>{
  const b=await boot();
  expect(b.handlers.has('lv:alpaca:corporate-actions')).toBe(true);
  const other=new EventEmitter();
  expect(await b.handlers.get('lv:alpaca:corporate-actions')!({sender:other,senderFrame:{url:'https://evil.example/'}},{requestId:'a',symbol:'GME'})).toMatchObject({ok:false,error:{code:'DENIED'}});
  expect(b.loaded).toEqual([]);
  expect(await b.handlers.get('lv:alpaca:corporate-actions')!(b.trusted,{requestId:'a',symbol:'GME'})).toEqual({ok:true,value:{events:[]}});
  expect(b.loaded).toContain('./public-alpaca-actions.cjs');
  const actions=b.created.AlpacaCorporateActions;
  expect(actions.calls).toEqual([{requestId:'a',symbol:'GME'}]);
  expect(actions.options.directory).toBe(path.join('C:\\Synthetic\\Profile','corporate-actions-cache'));
  expect(actions.options.namespace).toBe('alpaca');expect(actions.options.fetchImpl).toBeUndefined();
  expect(actions.options.keys).toBe(b.created.AlpacaKeyStore);expect(typeof actions.options.queue).toBe('function');
  for(const source of [mainSource,preloadSource])expect(source).not.toMatch(/alpaca\.markets|\/v1\/corporate-actions/);
});
it('preload exposes a data-only corporate actions call on the fixed channel',()=>{
  const invoke=vi.fn(async()=>({ok:true}));let exposed:any;
  const electron={contextBridge:{exposeInMainWorld:(_n:string,api:any)=>{exposed=api;}},ipcRenderer:{invoke,on:vi.fn(),removeListener:vi.fn()}};
  runInNewContext(preloadSource,{require:(name:string)=>{if(name==='electron')return electron;throw Error('Unexpected dependency '+name);},Object,Promise,TypeError});
  exposed.fetchAlpacaCorporateActions({requestId:'a',symbol:'GME'});
  expect(invoke.mock.calls).toEqual([['lv:alpaca:corporate-actions',{requestId:'a',symbol:'GME'}]]);
});
