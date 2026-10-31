import {EventEmitter} from 'node:events';
import {existsSync,readFileSync,mkdtempSync,realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {vi} from 'vitest';

const root=process.cwd(),home=path.join(root,'.tmp/codex-r43-synthetic-clock'),mainFile=path.join(root,'electron/main.cjs'),realRequire=createRequire(mainFile);
const file=(name:string)=>{const staged=path.join(home,process.env.LV_CLOCK_BASE==='1'?'base':'lane',name);return existsSync(staged)?staged:path.join(root,name);};
export const REGULAR_EPOCH=Date.UTC(2026,9,20,16),CLOSED_EPOCH=Date.UTC(2026,9,21,2);
export const flush=async()=>{for(let turn=0;turn<16;turn++)await Promise.resolve();};
export const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
export function clockCjs(name:string):any{
 // Production CJS and validation must share Node's plain-object realm. Electron main/preload remain isolated mocked VMs below.
 const Module=realRequire('node:module'),logical=path.join(root,name),module=new Module(logical);
 module.filename=logical;module.paths=Module._nodeModulePaths(path.dirname(logical));module._compile(readFileSync(file(name),'utf8'),logical);return module.exports;
}
export const clockStubModule=()=>clockCjs('electron/alpaca-stub.cjs');

/** Real main/preload, real keyless transport and real market client. Only Electron and the monotonic timer are fixtures. */
export async function bootSyntheticClock(scenario:'regular'|'closed'|undefined,receiptNow:()=>number=Date.now){
 const profile=mkdtempSync(path.join(realpathSync.native(os.tmpdir()),'lv-r43-clock-'));
 const handlers=new Map<string,(event:unknown,value?:unknown)=>Promise<any>>(),listeners=new Map<string,Set<(event:unknown,value:unknown)=>void>>();
 const app=Object.assign(new EventEmitter(),{isPackaged:true,requestSingleInstanceLock:()=>true,quit:vi.fn(),getPath:()=>profile,getAppPath:()=>profile,whenReady:()=>Promise.resolve(),commandLine:{appendSwitch:vi.fn()},setPath:vi.fn()});
 const frame={url:'lv://app/index.html'},web=Object.assign(new EventEmitter(),{setWindowOpenHandler:vi.fn(),isLoading:()=>false,isDestroyed:()=>false,isCrashed:()=>false,mainFrame:frame,send:(channel:string,value:unknown)=>{for(const listener of listeners.get(channel)??[])listener({},value);}});
 class Window extends EventEmitter{webContents=web;show=vi.fn();loadURL=vi.fn(async()=>{});isDestroyed=()=>false;close=vi.fn();}
 const electron={app,BrowserWindow:Window,Menu:{setApplicationMenu:vi.fn()},protocol:{registerSchemesAsPrivileged:vi.fn(),handle:vi.fn()},safeStorage:{isEncryptionAvailable:()=>true},session:{defaultSession:{setPermissionRequestHandler:vi.fn(),setPermissionCheckHandler:vi.fn(),on:vi.fn(),webRequest:{onBeforeRequest:vi.fn()}}},ipcMain:{handle:(name:string,fn:any)=>handlers.set(name,fn)},dialog:{showErrorBox:vi.fn()},utilityProcess:{}};
 const elapsed={ms:50},sockets:any[]=[],feeds:any[]=[],actions:any[]=[],transports:any[]=[],wire:any[]=[];
 const stubModule=clockStubModule(),alpacaModule=clockCjs('electron/public-alpaca.cjs'),actionsModule=clockCjs('electron/public-alpaca-actions.cjs');
 const stub={...stubModule,alpacaStubTransport:(options:any)=>{
  // The old supported `now` injection lets the baseline keep a regular stub transport while main's business clock is closed.
  const transport=stubModule.alpacaStubTransport({...options,now:()=>REGULAR_EPOCH,elapsedNow:()=>elapsed.ms,tickMs:3600000});transports.push(transport);
  if(transport?.mode==='synthetic'){const Socket=transport.WebSocket;transport.WebSocket=class extends Socket{constructor(url:string){super(url);sockets.push(this);}deliver(items:any[]){wire.push(...items);super.deliver(items);}};}
  return transport;
 }};
 const alpaca={...alpacaModule,AlpacaMarketData:class extends alpacaModule.AlpacaMarketData{constructor(options:any){super({...options,now:options.now??receiptNow});feeds.push(this);}}};
 const corporate={...actionsModule,AlpacaCorporateActions:class extends actionsModule.AlpacaCorporateActions{constructor(options:any){super({...options,now:options.now??receiptNow});actions.push(this);}}};
 const require=(name:string):any=>{
  if(name==='electron')return electron;if(name==='./alpaca-stub.cjs')return stub;if(name==='./public-alpaca.cjs')return alpaca;if(name==='./public-alpaca-actions.cjs')return corporate;
  if(name==='./storage.cjs')return{WorkspaceStore:class{}};
  if(name==='./script-jobs.cjs')return{ScriptJobs:class{close(){}}};
  if(name==='./public-sec.cjs')return{SecCompanyFacts:class{close(){}}};
  if(name==='./import-data.cjs')return{titles:{},limits:{}};
  if(name==='./alert-webhook.cjs')return{postAlertWebhook:()=>({delivered:false,status:0,error:null}),alertWebhookInput:(v:any)=>v};if(name==='./alert-notify.cjs')return{showAlertNotification:()=>({shown:false}),alertNotificationInput:(v:any)=>v};
  if(name==='../build-identity.json')return{buildId:'synthetic'};
  if(name==='./startup-diagnostics.cjs')return{createStartupDiagnostics:()=>({record:()=>undefined}),safeCode:()=>null};
  return realRequire(name);
 };
 const errors:unknown[][]=[],env={LV_ALPACA_STUB:'synthetic',LV_EXE_HARNESS:'alpaca-stub',...(scenario?{LV_ALPACA_CLOCK:scenario}:{})};
 runInNewContext(readFileSync(file('electron/main.cjs'),'utf8'),{require,process:{argv:['--lv-profile='+profile],pid:1,env},__dirname:path.dirname(mainFile),console:{error:(...args:unknown[])=>errors.push(args)},setTimeout,clearTimeout,Buffer,Response,URL});
 await flush();
 const invoke=(channel:string,value?:unknown)=>{const handler=handlers.get(channel);if(!handler)throw Error('Missing handler '+channel);return handler({sender:web,senderFrame:frame},value);};
 let lv:any;
 const preload={contextBridge:{exposeInMainWorld:(_name:string,api:any)=>{lv=api;}},ipcRenderer:{invoke,on:(channel:string,fn:any)=>{if(!listeners.has(channel))listeners.set(channel,new Set());listeners.get(channel)!.add(fn);},removeListener:(channel:string,fn:any)=>listeners.get(channel)?.delete(fn)}};
 runInNewContext(readFileSync(path.join(root,'electron/preload.cjs'),'utf8'),{require:(name:string)=>{if(name==='electron')return preload;throw Error('Unexpected preload dependency '+name);},Object,Promise,TypeError,String,Number,Array,Error});
 const step=async(seconds:number)=>{elapsed.ms+=seconds*1000;wire.length=0;for(const socket of sockets)if(!socket.closed)socket.tick();await pause(5);for(const feed of feeds)feed.flush();await flush();return[...wire];};
 return{lv,invoke,elapsed,sockets,feeds,actions,transports,errors,step,close:async()=>{try{await invoke('lv:alpaca:unsubscribe');}finally{for(const feed of feeds)feed.close();for(const action of actions)action.close?.();await pause(10);}}};
}
