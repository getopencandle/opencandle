import {afterEach,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import path from 'node:path';

// F2 (iface2): the actual main entry and preload with controlled Electron events. A window close is
// held until the renderer acknowledges its pending workspace save, bounded by a timeout. This does not
// launch a process, observe a window or certify packaged shutdown.
const mainSource=readFileSync('electron/main.cjs','utf8'),preloadSource=readFileSync('electron/preload.cjs','utf8');
class BoundaryError extends Error{constructor(public code:string,message:string){super(message);}}
async function boot(options:{loading?:boolean;loadFails?:boolean;electronQuit?:boolean}={}){
 const handlers=new Map<string,(event:unknown,value?:unknown)=>Promise<any>>(),showErrorBox=vi.fn();
 const app=Object.assign(new EventEmitter(),{requestSingleInstanceLock:()=>true,quit:vi.fn(),getPath:()=> 'C:\\Synthetic\\Profile',getAppPath:()=> 'C:\\Synthetic\\app.asar',whenReady:()=>Promise.resolve(),commandLine:{appendSwitch:vi.fn()},setPath:vi.fn()});
 // electronQuit: Electron's documented app.quit() and last-window semantics, modeled (not executed).
 // app.quit() emits a cancellable 'before-quit', then closes every window; a window whose 'close' is prevented
 // cancels the quit. When every window closed during a quit, 'will-quit' and 'quit' follow and 'window-all-closed'
 // is NOT emitted. A window closed outside a quit emits 'window-all-closed' (the app decides whether to quit).
 const lifecycle={quitCompleted:0,windowAllClosed:0,quitCancelled:0};let quittingNow=false;
 let windowClosed=()=>{};
 if(options.electronQuit){
  windowClosed=()=>{if(!quittingNow){lifecycle.windowAllClosed++;app.emit('window-all-closed');}};
  app.quit=vi.fn(()=>{const before={prevented:false,preventDefault(){before.prevented=true;}};app.emit('before-quit',before);if(before.prevented){lifecycle.quitCancelled++;return;}
   quittingNow=true;try{if(window&&!window.destroyed){const event={prevented:false,preventDefault(){event.prevented=true;}};window.emit('close',event);if(event.prevented){lifecycle.quitCancelled++;return;}window.destroyed=true;}}finally{quittingNow=false;}
   lifecycle.quitCompleted++;app.emit('will-quit',{});app.emit('quit',{},0);});
 }
 const frame={url:'lv://app/index.html'};
 const web=Object.assign(new EventEmitter(),{setWindowOpenHandler:vi.fn(),isLoading:()=>!!options.loading,isDestroyed:()=>false,isCrashed:()=>false,mainFrame:frame,send:vi.fn()});
 let window:any;
 class Window extends EventEmitter{
  webContents=web;show=vi.fn();focus=vi.fn();restore=vi.fn();isMinimized=()=>false;destroyed=false;isDestroyed=()=>this.destroyed;
  loadURL=vi.fn(async()=>{if(options.loadFails)throw Error('Synthetic load failure');});
  closeEvents:Array<{prevented:boolean}>=[];
  close=vi.fn(()=>{const event={prevented:false,preventDefault(){event.prevented=true;}};this.emit('close',event);this.closeEvents.push(event);if(!event.prevented){this.destroyed=true;windowClosed();}});
  constructor(_options:unknown){super();window=this;}
 }
 class Jobs {close=vi.fn();}
 const electron={app,BrowserWindow:Window,Menu:{setApplicationMenu:vi.fn()},protocol:{registerSchemesAsPrivileged:vi.fn(),handle:vi.fn()},
  session:{defaultSession:{setPermissionRequestHandler:vi.fn(),setPermissionCheckHandler:vi.fn(),on:vi.fn(),webRequest:{onBeforeRequest:vi.fn()}}},
  ipcMain:{handle:(name:string,fn:any)=>handlers.set(name,fn)},dialog:{showErrorBox},utilityProcess:{}};
 const require=(name:string):any=>{
  if(name==='electron')return electron;
  if(name==='node:path')return path;
  if(name==='node:fs/promises')return{};
  if(name==='./storage.cjs')return{WorkspaceStore:class{}};
  if(name==='./script-jobs.cjs')return{ScriptJobs:Jobs};
  if(name==='./public-sec.cjs')return{SecCompanyFacts:Jobs};
  if(name==='./alert-webhook.cjs')return{postAlertWebhook:()=>({delivered:false,status:0,error:null}),alertWebhookInput:(v:any)=>v};if(name==='./alert-notify.cjs')return{showAlertNotification:vi.fn(),alertNotificationInput:(value:unknown)=>value};
  if(name==='./import-data.cjs')return{titles:{},limits:{}};
  if(name==='./validation.cjs')return{BoundaryError,isAppURL:(url:string)=>url.startsWith('lv://app/'),exactKeys:()=>undefined};
  if(name==='../build-identity.json')return{buildId:'synthetic'};
  if(name==='./startup-diagnostics.cjs')return{createStartupDiagnostics:()=>({record:()=>undefined}),safeCode:()=>null};
  throw Error('Unexpected dependency '+name);
 };
 runInNewContext(mainSource,{require,process:{argv:[]},__dirname:'C:\\Synthetic\\electron',console:{error:vi.fn()},setTimeout,clearTimeout,Buffer,Response});
 for(let i=0;i<8;i++)await Promise.resolve();
 const trusted={sender:web,senderFrame:frame},ack=(token:unknown,event:unknown=trusted)=>handlers.get('lv:workspace:flushed')!(event,token);
 // A title-bar close (WM_CLOSE): the same 'close' event Electron emits before destroying the window.
 const userClose=()=>{const event={prevented:false,preventDefault:vi.fn(()=>{event.prevented=true;})};window.emit('close',event);return event;};
 return{app,web,window,handlers,ack,userClose,showErrorBox,lifecycle,requests:()=>web.send.mock.calls.filter((call:any[])=>call[0]==='lv:workspace:flush-request')};
}
afterEach(()=>{vi.useRealTimers();});

it('holds a window close until the renderer acknowledges its pending workspace flush',async()=>{
 const b=await boot(),event=b.userClose();
 expect(event.preventDefault).toHaveBeenCalledOnce();expect(b.requests()).toHaveLength(1);expect(b.window.close).not.toHaveBeenCalled();
 const token=b.requests()[0][1];expect(typeof token).toBe('string');
 expect(await b.ack(token)).toEqual({ok:true,value:{accepted:true}});
 expect(b.window.close).toHaveBeenCalledOnce();expect(b.window.closeEvents[0].prevented).toBe(false);expect(b.window.destroyed).toBe(true);
 expect(b.requests()).toHaveLength(1);
});
it('repeated close requests while flushing send one request and keep the window open',async()=>{
 const b=await boot(),first=b.userClose(),second=b.userClose();
 expect(first.prevented&&second.prevented).toBe(true);expect(b.requests()).toHaveLength(1);expect(b.window.close).not.toHaveBeenCalled();
 await b.ack(b.requests()[0][1]);expect(b.window.close).toHaveBeenCalledOnce();
});
it('a hung renderer cannot block quitting: the close proceeds after the bounded flush timeout',async()=>{
 vi.useFakeTimers();const b=await boot();b.userClose();
 vi.advanceTimersByTime(2999);expect(b.window.close).not.toHaveBeenCalled();
 vi.advanceTimersByTime(1);expect(b.window.close).toHaveBeenCalledOnce();expect(b.window.destroyed).toBe(true);
 expect(await b.ack(b.requests()[0][1])).toEqual({ok:true,value:{accepted:false}});expect(b.window.close).toHaveBeenCalledOnce();
});
it('a stale or forged acknowledgement cannot release the close',async()=>{
 const b=await boot();b.userClose();const token=b.requests()[0][1];
 expect(await b.ack('close-999')).toEqual({ok:true,value:{accepted:false}});
 expect((await b.ack(token,{sender:{},senderFrame:{url:'lv://app/index.html'}})).ok).toBe(false);
 expect((await b.ack({token})).ok).toBe(false);
 expect(b.window.close).not.toHaveBeenCalled();
 await b.ack(token);expect(b.window.close).toHaveBeenCalledOnce();
});
it('a renderer that exits during the flush closes the window at once without a crash report',async()=>{
 const b=await boot();b.userClose();
 b.app.emit('render-process-gone',{},b.web,{reason:'crashed',exitCode:3});
 expect(b.window.close).toHaveBeenCalledOnce();expect(b.window.destroyed).toBe(true);expect(b.showErrorBox).not.toHaveBeenCalled();
});
it('a window whose page is still loading, or a failed startup, closes without waiting',async()=>{
 const loading=await boot({loading:true}),event=loading.userClose();
 expect(event.preventDefault).not.toHaveBeenCalled();expect(loading.requests()).toHaveLength(0);
 const failed=await boot({loadFails:true}),closing=failed.userClose();
 expect(failed.app.quit).toHaveBeenCalled();expect(closing.preventDefault).not.toHaveBeenCalled();expect(failed.requests()).toHaveLength(0);
});
// A quit driven by app.quit() (not a title-bar close). The held close cancels Electron's quit; the flush
// must then resume that quit itself rather than depend on the window-all-closed handler.
it('BFABC-R4: app.quit() is held for the same single flush and then completes as a quit after the acknowledgement',async()=>{
 const b=await boot({electronQuit:true});b.app.quit();
 expect(b.requests()).toHaveLength(1);expect(b.lifecycle.quitCancelled).toBe(1);expect(b.lifecycle.quitCompleted).toBe(0);expect(b.window.destroyed).toBe(false);
 expect(await b.ack(b.requests()[0][1])).toEqual({ok:true,value:{accepted:true}});
 expect(b.lifecycle.quitCompleted).toBe(1);expect(b.window.destroyed).toBe(true);expect(b.requests()).toHaveLength(1);
 expect(b.lifecycle.windowAllClosed).toBe(0);
});
it('BFABC-R4: the resumed quit does not rely on the window-all-closed handler',async()=>{
 const b=await boot({electronQuit:true});b.app.removeAllListeners('window-all-closed');b.app.quit();
 await b.ack(b.requests()[0][1]);
 expect(b.lifecycle.quitCompleted).toBe(1);expect(b.window.destroyed).toBe(true);
});
it('BFABC-R4: a hung renderer cannot block app.quit(): the quit completes after the bounded flush timeout',async()=>{
 vi.useFakeTimers();const b=await boot({electronQuit:true});b.app.removeAllListeners('window-all-closed');b.app.quit();
 vi.advanceTimersByTime(2999);expect(b.lifecycle.quitCompleted).toBe(0);
 vi.advanceTimersByTime(1);expect(b.lifecycle.quitCompleted).toBe(1);expect(b.window.destroyed).toBe(true);
 expect(await b.ack(b.requests()[0][1])).toEqual({ok:true,value:{accepted:false}});expect(b.lifecycle.quitCompleted).toBe(1);
});
it('BFABC-R4: a renderer that exits while app.quit() is held completes the quit without a crash report',async()=>{
 const b=await boot({electronQuit:true});b.app.removeAllListeners('window-all-closed');b.app.quit();
 b.app.emit('render-process-gone',{},b.web,{reason:'crashed',exitCode:3});
 expect(b.lifecycle.quitCompleted).toBe(1);expect(b.showErrorBox).not.toHaveBeenCalled();expect(b.requests()).toHaveLength(1);
});
it('BFABC-R4: a title-bar close still closes the window after the flush and quits through window-all-closed',async()=>{
 const b=await boot({electronQuit:true}),event=b.userClose();expect(event.prevented).toBe(true);
 await b.ack(b.requests()[0][1]);
 expect(b.window.close).toHaveBeenCalledOnce();expect(b.lifecycle.windowAllClosed).toBe(1);expect(b.lifecycle.quitCompleted).toBe(1);expect(b.requests()).toHaveLength(1);
});

function preload(){
 const listeners=new Map<string,(...args:any[])=>unknown>(),invoke=vi.fn(async(_channel:string,_value?:unknown)=>({ok:true,value:null}));let api:any;
 const electron={contextBridge:{exposeInMainWorld:(_name:string,value:unknown)=>{api=value;}},ipcRenderer:{invoke,on:(channel:string,fn:any)=>listeners.set(channel,fn)}};
 runInNewContext(preloadSource,{require:(name:string)=>{if(name==='electron')return electron;throw Error('Unexpected dependency '+name);},Object,Promise,TypeError});
 const request=async(token:string)=>{await listeners.get('lv:workspace:flush-request')!({},token);};
 return{api,invoke,request,acks:()=>invoke.mock.calls.filter(call=>call[0]==='lv:workspace:flushed').map(call=>call[1])};
}
it('preload acknowledges a flush request only after the registered renderer flush settles',async()=>{
 const p=preload();let finish!:()=>void;const handler=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
 const off=p.api.onFlushRequest(handler);const pending=p.request('close-1');await Promise.resolve();
 expect(handler).toHaveBeenCalledOnce();expect(p.acks()).toEqual([]);finish();await pending;expect(p.acks()).toEqual(['close-1']);
 off();await p.request('close-2');expect(handler).toHaveBeenCalledOnce();expect(p.acks()).toEqual(['close-1','close-2']);
});
it('preload still acknowledges when the renderer flush fails, and rejects a non-function handler',async()=>{
 const p=preload();p.api.onFlushRequest(async()=>{throw Error('Synthetic save failure');});await p.request('close-3');expect(p.acks()).toEqual(['close-3']);
 expect(()=>p.api.onFlushRequest('not a function')).toThrow(TypeError);
});
