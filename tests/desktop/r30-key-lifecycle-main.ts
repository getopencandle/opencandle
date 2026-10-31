import {vi} from 'vitest';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import path from 'node:path';
import os from 'node:os';

// test harness (not a test file): one launch of the desktop app's main process (electron/main.cjs in a VM
// with a mocked Electron) and the window.lv bridge from the real preload. The Alpaca modules, the stub, the bar cache and
// corporate actions are the real ones; everything else main loads is a no-op stand-in. SYNTHETIC only: no key, no network.
const require=createRequire(import.meta.url);
const mainSource=readFileSync('electron/main.cjs','utf8'),preloadSource=readFileSync('electron/preload.cjs','utf8');
const REAL_MODULES=new Set(['./validation.cjs','./public-alpaca.cjs','./alpaca-stub.cjs','./bar-cache.cjs','./public-alpaca-actions.cjs']);
const NODE_MODULES:Record<string,unknown>={'node:path':path,'node:os':os,'node:fs':require('node:fs'),'node:fs/promises':require('node:fs/promises'),'node:crypto':require('node:crypto')};
const flush=async(n=20)=>{for(let i=0;i<n;i++)await Promise.resolve();};
export type Booted={lv:any;app:EventEmitter;events:any[];invoked:string[];logged:string[];quit:()=>void};
/** One launch of the desktop app on `profile`: main.cjs with a mocked Electron, and window.lv from the real preload. */
export async function launchMain(profile:string,env:Record<string,string>={LV_ALPACA_STUB:'synthetic-lifecycle'}):Promise<Booted>{
 const handlers=new Map<string,(event:unknown,value?:unknown)=>Promise<any>>(),listeners=new Map<string,Set<(event:unknown,value:unknown)=>void>>(),events:any[]=[],invoked:string[]=[],logged:string[]=[];
 const app=Object.assign(new EventEmitter(),{isPackaged:false,requestSingleInstanceLock:()=>true,quit:vi.fn(),getPath:()=>profile,getAppPath:()=>'C:\\Synthetic\\app.asar',whenReady:()=>Promise.resolve(),commandLine:{appendSwitch:vi.fn()},setPath:vi.fn()});
 const frame={url:'lv://app/index.html'};
 const web=Object.assign(new EventEmitter(),{setWindowOpenHandler:vi.fn(),isLoading:()=>false,isDestroyed:()=>false,isCrashed:()=>false,mainFrame:frame,
  send:(channel:string,value:unknown)=>{if(channel==='lv:alpaca:event')events.push(value);for(const listener of listeners.get(channel)??[])listener({},value);}});
 let windows=0;
 class Window extends EventEmitter{constructor(..._args:unknown[]){super();windows++;}webContents=web;show=vi.fn();loadURL=vi.fn(async()=>{});isDestroyed=()=>false;close=vi.fn();}
 const electron={app,BrowserWindow:Window,Menu:{setApplicationMenu:vi.fn()},protocol:{registerSchemesAsPrivileged:vi.fn(),handle:vi.fn()},safeStorage:{isEncryptionAvailable:()=>false},
  session:{defaultSession:{setPermissionRequestHandler:vi.fn(),setPermissionCheckHandler:vi.fn(),on:vi.fn(),webRequest:{onBeforeRequest:vi.fn()}}},ipcMain:{handle:(name:string,fn:any)=>handlers.set(name,fn)},dialog:{showErrorBox:vi.fn()},utilityProcess:{}};
 const req=(name:string):any=>{
  if(name==='electron')return electron;if(Object.hasOwn(NODE_MODULES,name))return NODE_MODULES[name];
  if(REAL_MODULES.has(name))return require(path.resolve('electron',name));
  if(name==='./storage.cjs')return{WorkspaceStore:class{}};if(name==='./script-jobs.cjs')return{ScriptJobs:class{close(){}}};if(name==='./public-sec.cjs')return{SecCompanyFacts:class{close(){}}};
  if(name==='./import-data.cjs')return{titles:{},limits:{}};if(name==='./alert-webhook.cjs')return{postAlertWebhook:()=>({delivered:false,status:0,error:null}),alertWebhookInput:(v:any)=>v};if(name==='./alert-notify.cjs')return{showAlertNotification:()=>({shown:false}),alertNotificationInput:(v:any)=>v};
  if(name==='../build-identity.json')return{buildId:'synthetic'};if(name==='./startup-diagnostics.cjs')return{createStartupDiagnostics:()=>({record:()=>undefined}),safeCode:()=>null};
  throw Error('Unexpected dependency '+name);
 };
 runInNewContext(mainSource,{require:req,process:{argv:['--lv-profile='+profile],pid:1,env},__dirname:'C:\\Synthetic\\electron',console:{error:(text:string)=>logged.push(text)},setTimeout,clearTimeout,setInterval,clearInterval,Buffer,Response,URL,AbortController,TextDecoder});
 // main's whenReady chain awaits real file reads before it registers IPC and creates the window: wait for both (bounded).
 for(const end=Date.now()+10000;!(handlers.size&&windows);){if(Date.now()>end)throw Error('main did not finish starting');await flush(8);await new Promise(resolve=>setTimeout(resolve,10));}
 await flush(8);
 let lv:any;
 const ipcRenderer={invoke:(channel:string,value:unknown)=>{invoked.push(channel);const handler=handlers.get(channel);if(!handler)throw Error('No handler '+channel);return handler({sender:web,senderFrame:frame},value);},
  on:(channel:string,listener:any)=>{if(!listeners.has(channel))listeners.set(channel,new Set());listeners.get(channel)!.add(listener);},removeListener:(channel:string,listener:any)=>{listeners.get(channel)?.delete(listener);}};
 runInNewContext(preloadSource,{require:(name:string)=>{if(name==='electron')return{contextBridge:{exposeInMainWorld:(_n:string,api:any)=>{lv=api;}},ipcRenderer};throw Error('Unexpected dependency '+name);},Object,Promise,TypeError});
 return{lv,app,events,invoked,logged,quit:()=>app.emit('before-quit')};
}
