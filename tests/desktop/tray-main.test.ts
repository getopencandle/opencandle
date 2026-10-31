import {afterEach,describe,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import path from 'node:path';
const nodeRequire=createRequire(import.meta.url);
// The actual main entry and preload with controlled Electron objects (Tray, Menu, nativeImage mocked) and the
// real electron/tray.cjs. This does not launch a process, show a tray icon or observe a window.
const mainSource=readFileSync('electron/main.cjs','utf8'),preloadSource=readFileSync('electron/preload.cjs','utf8');
class BoundaryError extends Error{constructor(public code:string,message:string){super(message);}}
async function boot(options:{withTray?:boolean;state?:string|null;argv?:string[]}={}){
 const withTray=options.withTray!==false;
 const handlers=new Map<string,(event:unknown,value?:unknown)=>Promise<any>>(),files=new Map<string,string>(),trays:any[]=[],windows:any[]=[];
 if(options.state)files.set(path.join('C:\\Synthetic\\Profile','tray-state.json'),options.state);
 const app=Object.assign(new EventEmitter(),{requestSingleInstanceLock:()=>true,quit:vi.fn(),getPath:()=> 'C:\\Synthetic\\Profile',getAppPath:()=> 'C:\\Synthetic\\app.asar',whenReady:()=>Promise.resolve(),commandLine:{appendSwitch:vi.fn()},setPath:vi.fn()});
 // Electron's app.quit(), modeled as in close-flush-main.test.ts: before-quit, then each window's cancellable close.
 const lifecycle={quitCompleted:0,windowAllClosed:0,quitCancelled:0};let quittingNow=false;
 const windowClosed=()=>{if(!quittingNow){lifecycle.windowAllClosed++;app.emit('window-all-closed');}};
 app.quit=vi.fn(()=>{app.emit('before-quit',{preventDefault(){}});quittingNow=true;try{const window=windows[0];if(window&&!window.destroyed){const event={prevented:false,preventDefault(){event.prevented=true;}};window.emit('close',event);if(event.prevented){lifecycle.quitCancelled++;return;}window.destroyed=true;}}finally{quittingNow=false;}lifecycle.quitCompleted++;app.emit('will-quit',{});app.emit('quit',{},0);});
 const frame={url:'lv://app/index.html'};
 const web=Object.assign(new EventEmitter(),{setWindowOpenHandler:vi.fn(),isLoading:()=>false,isDestroyed:()=>false,isCrashed:()=>false,mainFrame:frame,send:vi.fn()});
 class Window extends EventEmitter{
  webContents=web;destroyed=false;visible=true;minimized=false;
  show=vi.fn(()=>{this.visible=true;});hide=vi.fn(()=>{this.visible=false;});focus=vi.fn();restore=vi.fn();isMinimized=()=>this.minimized;isDestroyed=()=>this.destroyed;
  loadURL=vi.fn(async()=>{});
  close=vi.fn(()=>{const event={prevented:false,preventDefault(){event.prevented=true;}};this.emit('close',event);if(!event.prevented){this.destroyed=true;windowClosed();}});
  constructor(public options:any){super();windows.push(this);}
 }
 class Tray extends EventEmitter{setToolTip=vi.fn();menu:any=null;setContextMenu=vi.fn((menu:any)=>{this.menu=menu;});displayBalloon=vi.fn();destroy=vi.fn();constructor(public image:unknown){super();trays.push(this);}}
 const nativeImage={createFromPath:()=>({isEmpty:()=>false,toPNG:()=>Buffer.from('file'),resize:({width}:{width:number})=>({toPNG:()=>Buffer.from(String(width))})}),createEmpty:()=>({addRepresentation:vi.fn()})};
 class Jobs {close=vi.fn();}
 const electron:any={app,BrowserWindow:Window,Menu:{setApplicationMenu:vi.fn(),buildFromTemplate:(template:any[])=>({template})},protocol:{registerSchemesAsPrivileged:vi.fn(),handle:vi.fn()},
  session:{defaultSession:{setPermissionRequestHandler:vi.fn(),setPermissionCheckHandler:vi.fn(),on:vi.fn(),webRequest:{onBeforeRequest:vi.fn()}}},
  ipcMain:{handle:(name:string,fn:any)=>handlers.set(name,fn)},dialog:{showErrorBox:vi.fn()},utilityProcess:{},Notification:class{static isSupported(){return true;}show(){}}};
 if(withTray)Object.assign(electron,{Tray,nativeImage});
 const required:string[]=[],notify=vi.fn(()=>({shown:true}));
 const fsPromises={readFile:vi.fn(async(file:string)=>{if(!files.has(file))throw Object.assign(Error('missing'),{code:'ENOENT'});return files.get(file);}),writeFile:vi.fn(async(file:string,text:string)=>{files.set(file,text);})};
 const require=(name:string):any=>{
  required.push(name);
  if(name==='electron')return electron;
  if(name==='node:path')return path;
  if(name==='node:fs/promises')return fsPromises;
  if(name==='./tray.cjs')return nodeRequire('../../electron/tray.cjs');
  if(name==='./storage.cjs')return{WorkspaceStore:class{}};
  if(name==='./script-jobs.cjs')return{ScriptJobs:Jobs};
  if(name==='./public-sec.cjs')return{SecCompanyFacts:Jobs};
  if(name==='./alert-webhook.cjs')return{postAlertWebhook:()=>({delivered:false,status:0,error:null}),alertWebhookInput:(v:any)=>v};if(name==='./alert-notify.cjs')return{showAlertNotification:notify,alertNotificationInput:(value:unknown)=>value};
  if(name==='./import-data.cjs')return{titles:{},limits:{}};
  if(name==='./validation.cjs')return{BoundaryError,isAppURL:(url:string)=>url.startsWith('lv://app/'),exactKeys:(value:any,keys:string[])=>{if(value===undefined&&!keys.length)return;if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k)))throw new BoundaryError('INVALID_ARGUMENT','Unexpected or missing fields.');}};
  if(name==='../build-identity.json')return{buildId:'synthetic'};
  if(name==='./startup-diagnostics.cjs')return{createStartupDiagnostics:()=>({record:()=>undefined}),safeCode:()=>null};
  throw Error('Unexpected dependency '+name);
 };
 runInNewContext(mainSource,{require,process:{argv:options.argv??[]},__dirname:'C:\\Synthetic\\electron',console:{error:vi.fn()},setTimeout,clearTimeout,Buffer,Response});
 for(let i=0;i<12;i++)await Promise.resolve();
 const window=windows[0],trusted={sender:web,senderFrame:frame};
 const userClose=()=>{const event={prevented:false,preventDefault:vi.fn(()=>{event.prevented=true;})};window.emit('close',event);return event;};
 const flushRequests=()=>web.send.mock.calls.filter((call:any[])=>call[0]==='lv:workspace:flush-request');
 return{app,web,window,handlers,trusted,trays,files,required,lifecycle,userClose,flushRequests,fsPromises,notify};
}
afterEach(()=>{vi.useRealTimers();});

describe('main process: notification-area mode',()=>{
 it('the window keeps its renderer running while hidden: backgroundThrottling is off and the hardened preferences are unchanged',async()=>{
  const b=await boot();
  // approved 2026-10-29: cache compiled code on first launch (v8CacheOptions bypassHeatCheck).
  expect(b.window.options.webPreferences).toEqual({preload:path.join('C:\\Synthetic\\electron','preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,allowRunningInsecureContent:false,devTools:false,backgroundThrottling:false,v8CacheOptions:'bypassHeatCheck'});
 });
 it('a title-bar close hides to the tray: no flush, no destroy, no window-all-closed, and the app keeps running',async()=>{
  const b=await boot(),event=b.userClose();
  expect(event.preventDefault).toHaveBeenCalledOnce();expect(b.window.hide).toHaveBeenCalledOnce();expect(b.window.destroyed).toBe(false);
  expect(b.flushRequests()).toHaveLength(0);expect(b.lifecycle.windowAllClosed).toBe(0);expect(b.app.quit).not.toHaveBeenCalled();
  expect(b.trays).toHaveLength(1);expect(b.trays[0].menu.template.map((row:any)=>row.type??row.label)).toEqual(['Open OpenCandle','separator','Quit OpenCandle']);
  expect(b.trays[0].displayBalloon).toHaveBeenCalledOnce();
  await Promise.resolve();expect(JSON.parse(b.files.get(path.join('C:\\Synthetic\\Profile','tray-state.json'))!)).toEqual({schemaVersion:1,keepRunning:true,noticeShown:true});
 });
 it('the hidden window is still the trusted sender: its alert notifications still reach the OS and its IPC still works',async()=>{
  const b=await boot();b.userClose();
  const input={title:'Alert: GME',body:'Synthetic crossing',tag:'alert-1'};
  expect((await b.handlers.get('lv:alert:notify')!(b.trusted,input)).ok).toBe(true);
  expect(b.notify).toHaveBeenCalledWith(expect.anything(),input);
  expect(await b.handlers.get('lv:startup:open-symbol')!(b.trusted)).toEqual({ok:true,value:null});
 });
 it('Quit OpenCandle from the tray is a full quit that keeps the workspace save flush',async()=>{
  const b=await boot();b.userClose();
  b.trays[0].menu.template.find((row:any)=>row.label==='Quit OpenCandle').click();
  expect(b.app.quit).toHaveBeenCalledOnce();expect(b.flushRequests()).toHaveLength(1);expect(b.lifecycle.quitCancelled).toBe(1);
  const token=b.flushRequests()[0][1];expect(await b.handlers.get('lv:workspace:flushed')!(b.trusted,token)).toEqual({ok:true,value:{accepted:true}});
  expect(b.lifecycle.quitCompleted).toBe(1);expect(b.window.destroyed).toBe(true);expect(b.trays[0].destroy).toHaveBeenCalledOnce();
 });
 it('Quit OpenCandle from the app menu (lv:app:quit) quits through the same flush; it takes no input and only trusted senders',async()=>{
  vi.useFakeTimers();const b=await boot();
  expect((await b.handlers.get('lv:app:quit')!({sender:{},senderFrame:{url:'lv://app/index.html'}})).ok).toBe(false);
  expect((await b.handlers.get('lv:app:quit')!(b.trusted,{now:true})).ok).toBe(false);
  vi.advanceTimersByTime(100);expect(b.app.quit).not.toHaveBeenCalled();
  expect(await b.handlers.get('lv:app:quit')!(b.trusted)).toEqual({ok:true,value:null});
  vi.advanceTimersByTime(50);expect(b.app.quit).toHaveBeenCalledOnce();expect(b.flushRequests()).toHaveLength(1);
 });
 it('lv:tray:set takes exactly {keepRunning:boolean} from the trusted window; off makes a close quit as before',async()=>{
  const b=await boot();
  expect(await b.handlers.get('lv:tray:set')!({sender:{},senderFrame:{url:'https://evil.example/'}},{keepRunning:false})).toMatchObject({ok:false,error:{code:'DENIED'}});
  for(const bad of [undefined,{},{keepRunning:'no'},{keepRunning:false,extra:1}])expect((await b.handlers.get('lv:tray:set')!(b.trusted,bad)).ok).toBe(false);
  expect(await b.handlers.get('lv:tray:set')!(b.trusted,{keepRunning:false})).toEqual({ok:true,value:{keepRunning:false,supported:true}});
  const event=b.userClose();expect(b.window.hide).not.toHaveBeenCalled();expect(b.flushRequests()).toHaveLength(1);expect(event.prevented).toBe(true);
  await b.handlers.get('lv:workspace:flushed')!(b.trusted,b.flushRequests()[0][1]);
  expect(b.window.destroyed).toBe(true);expect(b.lifecycle.windowAllClosed).toBe(1);expect(b.trays).toHaveLength(0);
 });
 it('a saved "off" applies from the first close, before the renderer reports its setting',async()=>{
  const b=await boot({state:'{"schemaVersion":1,"keepRunning":false,"noticeShown":true}'});b.userClose();
  expect(b.window.hide).not.toHaveBeenCalled();expect(b.flushRequests()).toHaveLength(1);
 });
 it('a second launch brings the hidden window back (single-instance lock kept)',async()=>{
  const b=await boot();b.userClose();expect(b.window.visible).toBe(false);
  b.app.emit('second-instance');expect(b.window.show).toHaveBeenCalled();expect(b.window.focus).toHaveBeenCalled();expect(b.window.visible).toBe(true);
  expect(mainSource).toMatch(/const ownsProfile=profileMigration\?\.result!=='refused'&&app\.requestSingleInstanceLock\(\);\r?\nif\(!ownsProfile\)app\.quit\(\);/);
 });
 it('without an Electron Tray the tray module is never loaded, a close quits as before, and lv:tray:set reports no support',async()=>{
  const b=await boot({withTray:false});expect(b.required).not.toContain('./tray.cjs');
  b.userClose();expect(b.window.hide).not.toHaveBeenCalled();expect(b.flushRequests()).toHaveLength(1);
  expect(await b.handlers.get('lv:tray:set')!(b.trusted,{keepRunning:true})).toEqual({ok:true,value:{keepRunning:false,supported:false}});
  expect((await b.handlers.get('lv:tray:set')!(b.trusted,{keepRunning:1})).ok).toBe(false);
 });
 it('an automation session (exe harness: --remote-debugging-port, ends with WM_CLOSE) keeps close-quits and never loads the tray',async()=>{
  const b=await boot({argv:['OpenCandle.exe','--lv-profile=C:\\Temp\\p','--remote-debugging-port=9333']});expect(b.required).not.toContain('./tray.cjs');
  b.userClose();expect(b.window.hide).not.toHaveBeenCalled();expect(b.flushRequests()).toHaveLength(1);
  await b.handlers.get('lv:workspace:flushed')!(b.trusted,b.flushRequests()[0][1]);expect(b.window.destroyed).toBe(true);expect(b.lifecycle.windowAllClosed).toBe(1);
 });
});

describe('preload: the tray bridge is data-only',()=>{
 it('exposes setTrayKeepRunning and quitApp on fixed channels, with no URL or host',()=>{
  const invoke=vi.fn(async()=>({ok:true}));let exposed:any;
  const electron={contextBridge:{exposeInMainWorld:(_n:string,api:any)=>{exposed=api;}},ipcRenderer:{invoke,on:vi.fn(),removeListener:vi.fn()}};
  runInNewContext(preloadSource,{require:(name:string)=>{if(name==='electron')return electron;throw Error('Unexpected dependency '+name);},Object,Promise,TypeError});
  exposed.setTrayKeepRunning({keepRunning:true});exposed.quitApp();
  expect(invoke.mock.calls).toEqual([['lv:tray:set',{keepRunning:true}],['lv:app:quit',undefined]]);
  expect(readFileSync('electron/tray.cjs','utf8')).not.toMatch(/require\(\s*['"`](?:node:)?(?:http|https|net|tls|dgram|child_process)['"`]|fetch\(|WebSocket|https?:\/\//);
 });
});

// Background throttling proof, part 2: the renderer code that evaluates alerts, runs background alert feeds and fills paper
// orders has no visibility, focus or animation-frame gate, so a hidden but unthrottled renderer keeps doing all of it.
describe('hidden-window evaluation has no visibility gate',()=>{
 it('alert, background-feed and paper modules never read visibility, focus or requestAnimationFrame',()=>{
  const files=['src/ui/WorkspaceAlerts.tsx','src/ui/workspace-alert-observer.ts','src/ui/technical-alert-observer.ts','src/ui/background-watch-feeds.ts','src/ui/background-alert-plan.ts','src/ui/alert-delivery-host.tsx','src/domain/alert-observation.ts','src/domain/watchlist-alerts.ts','src/domain/paper.ts','src/domain/paper-expiry.ts','src/domain/paper-bracket-runtime.ts'];
  for(const file of files)expect(readFileSync(file,'utf8'),file).not.toMatch(/visibilityState|document\.hidden|visibilitychange|hasFocus\(|requestAnimationFrame/);
 });
});
