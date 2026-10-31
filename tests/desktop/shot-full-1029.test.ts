import {expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import path from 'node:path';
import {toggleAppFullScreen,FULLSCREEN_UNAVAILABLE} from '../../src/ui/window-fullscreen';
import {snapshotMenuRows} from '../../src/ui/top-toolbar-model';

// The toolbar Fullscreen button did nothing in the desktop app (HTML requestFullscreen is refused by main's
// deny-all permission handler, which stays). It now toggles the asking window's full screen over one fixed no-input channel;
// Esc leaves full screen like F11 does. Harness pattern of r23-chart-copy-main: the real main entry and preload under
// controlled Electron objects. No process, window or screen.
const mainSource=readFileSync('electron/main.cjs','utf8'),preloadSource=readFileSync('electron/preload.cjs','utf8');
const nodeRequire=createRequire(import.meta.url),validation=nodeRequire('../../electron/validation.cjs');
async function boot(){
 const handlers=new Map<string,(event:unknown,value?:unknown)=>Promise<any>>();
 const app=Object.assign(new EventEmitter(),{requestSingleInstanceLock:()=>true,quit:vi.fn(),getPath:()=> 'C:\\Synthetic\\Profile',getAppPath:()=> 'C:\\Synthetic\\app.asar',whenReady:()=>Promise.resolve(),commandLine:{appendSwitch:vi.fn()},setPath:vi.fn()});
 const frame={url:'lv://app/index.html'};
 const web=Object.assign(new EventEmitter(),{setWindowOpenHandler:vi.fn(),isLoading:()=>false,isDestroyed:()=>false,isCrashed:()=>false,mainFrame:frame,send:vi.fn()});
 const windows:any[]=[];
 class Window extends EventEmitter{webContents=web;full=false;show=vi.fn();loadURL=vi.fn(async()=>{});isDestroyed=()=>false;close=vi.fn();setFullScreen=vi.fn((on:boolean)=>{this.full=!!on;});isFullScreen=()=>this.full;constructor(){super();windows.push(this);}}
 const permission=vi.fn();
 const electron={app,BrowserWindow:Window,Menu:{setApplicationMenu:vi.fn()},protocol:{registerSchemesAsPrivileged:vi.fn(),handle:vi.fn()},safeStorage:{isEncryptionAvailable:()=>true},clipboard:{},ClipboardItem:class{},nativeImage:{},
  session:{defaultSession:{setPermissionRequestHandler:permission,setPermissionCheckHandler:vi.fn(),on:vi.fn(),webRequest:{onBeforeRequest:vi.fn()}}},
  ipcMain:{handle:(name:string,fn:any)=>handlers.set(name,fn)},dialog:{showErrorBox:vi.fn(),showSaveDialog:vi.fn()},utilityProcess:{}};
 const require=(name:string):any=>{
  if(name==='electron')return electron;
  if(name==='node:path')return path;
  if(name==='node:fs/promises')return{writeFile:vi.fn(),readFile:vi.fn(async()=>{throw new Error('none');})};
  if(name==='./storage.cjs')return{WorkspaceStore:class{}};
  if(name==='./script-jobs.cjs')return{ScriptJobs:class{close(){}}};
  if(name==='./public-sec.cjs')return{SecCompanyFacts:class{close(){}}};
  if(name==='./import-data.cjs')return{titles:{},limits:{}};
  if(name==='./alert-webhook.cjs')return{postAlertWebhook:()=>({delivered:false,status:0,error:null}),alertWebhookInput:(v:any)=>v};if(name==='./alert-notify.cjs')return{showAlertNotification:()=>({shown:false}),alertNotificationInput:(v:any)=>v};
  if(name==='./validation.cjs')return validation;
  if(name==='../build-identity.json')return{buildId:'synthetic'};
  if(name==='./startup-diagnostics.cjs')return{createStartupDiagnostics:()=>({record:()=>undefined}),safeCode:()=>null};
  throw Error('Unexpected dependency '+name);
 };
 runInNewContext(mainSource,{require,process:{argv:[],pid:1},__dirname:'C:\\Synthetic\\electron',console:{error:vi.fn()},setTimeout,clearTimeout,Buffer,Response,Blob});
 for(let i=0;i<8;i++)await Promise.resolve();
 const key=(input:Record<string,unknown>)=>{const event={preventDefault:vi.fn()};web.emit('before-input-event',event,{type:'keyDown',control:false,alt:false,meta:false,shift:false,isAutoRepeat:false,...input});return event.preventDefault.mock.calls.length>0;};
 return{handlers,windows,web,key,permission,trusted:{sender:web,senderFrame:frame}};
}

it('the fullscreen channel toggles the sender window, takes no input and refuses an untrusted sender',async()=>{
 const b=await boot(),toggle=b.handlers.get('lv:window:fullscreen')!,win=b.windows[0];
 expect(toggle).toBeTypeOf('function');
 expect(await toggle({sender:new EventEmitter(),senderFrame:{url:'https://evil.example/'}})).toMatchObject({ok:false,error:{code:'DENIED'}});
 expect(win.setFullScreen).not.toHaveBeenCalled();
 for(const value of [{action:'toggle'},'toggle',1,{fullScreen:true}])expect(await toggle(b.trusted,value)).toMatchObject({ok:false,error:{code:'INVALID_ARGUMENT'}});
 expect(win.setFullScreen).not.toHaveBeenCalled();
 expect(await toggle(b.trusted)).toEqual({ok:true,value:{fullScreen:true}});
 expect(await toggle(b.trusted)).toEqual({ok:true,value:{fullScreen:false}});
 expect(win.setFullScreen.mock.calls).toEqual([[true],[false]]);
});
it('Esc leaves full screen and is kept from the page only then; F11 still toggles',async()=>{
 const b=await boot(),win=b.windows[0];
 expect(b.key({key:'Escape'}),'outside full screen Esc reaches the page').toBe(false);
 expect(win.setFullScreen).not.toHaveBeenCalled();
 expect(b.key({key:'F11'})).toBe(true);expect(win.isFullScreen()).toBe(true);
 expect(b.key({key:'Escape',shift:true}),'a modified Esc is the page\'s').toBe(false);expect(win.isFullScreen()).toBe(true);
 expect(b.key({key:'Escape',isAutoRepeat:true})).toBe(false);expect(win.isFullScreen()).toBe(true);
 expect(b.key({key:'Escape'})).toBe(true);expect(win.isFullScreen()).toBe(false);
 await b.handlers.get('lv:window:fullscreen')!(b.trusted);expect(win.isFullScreen()).toBe(true);
 expect(b.key({key:'F11'})).toBe(true);expect(win.isFullScreen()).toBe(false);
});
it('the deny-all web permission handler is unchanged (fullscreen included)',async()=>{
 const b=await boot(),[handler]=b.permission.mock.calls[0],callback=vi.fn();
 handler(b.web,'fullscreen',callback);expect(callback).toHaveBeenCalledWith(false);
});
it('preload exposes a fixed no-input call; layout windows may toggle only their own window',()=>{
 let exposed:any;const invoke=vi.fn(async()=>({ok:true,value:{fullScreen:true}}));
 const electron={contextBridge:{exposeInMainWorld:(_n:string,api:any)=>{exposed=api;}},ipcRenderer:{invoke,on:vi.fn(),removeListener:vi.fn()}};
 runInNewContext(preloadSource,{require:(name:string)=>{if(name==='electron')return electron;throw Error('Unexpected dependency '+name);},Object,Promise,TypeError});
 void exposed.toggleFullScreen('ignored',{x:1});
 expect(invoke.mock.calls).toEqual([['lv:window:fullscreen',undefined]]);
 expect(preloadSource).toContain("toggleFullScreen: () => invoke('lv:window:fullscreen'),");
 expect(nodeRequire('../../electron/windows.cjs').SECONDARY_CHANNELS).toContain('lv:window:fullscreen');
 expect(mainSource).toContain("'lv:window:fullscreen': async (value,event) => { noInput(value); const window = (event && windowRegistry?.windowOf(event)) || mainWindow;");
});

it('toggleAppFullScreen uses the bridge in the desktop app and reports a refusal',async()=>{
 const report=vi.fn(),doc={fullscreenElement:null,documentElement:{requestFullscreen:vi.fn(async()=>{})}};
 expect(await toggleAppFullScreen({bridge:{toggleFullScreen:async()=>({ok:true,value:{fullScreen:true}})},doc,report})).toBe('entered');
 expect(await toggleAppFullScreen({bridge:{toggleFullScreen:async()=>({ok:true,value:{fullScreen:false}})},doc,report})).toBe('exited');
 expect(doc.documentElement.requestFullscreen,'the desktop app never asks for HTML fullscreen').not.toHaveBeenCalled();
 expect(report).not.toHaveBeenCalled();
 expect(await toggleAppFullScreen({bridge:{toggleFullScreen:async()=>({ok:false,error:{code:'UNAVAILABLE',message:'No window.'}})},doc,report})).toBe('unavailable');
 expect(await toggleAppFullScreen({bridge:{toggleFullScreen:async()=>{throw new Error('gone');}},doc,report})).toBe('unavailable');
 expect(report.mock.calls).toEqual([[FULLSCREEN_UNAVAILABLE+': No window.'],[FULLSCREEN_UNAVAILABLE+': gone']]);
});
it('toggleAppFullScreen falls back to HTML fullscreen without a bridge (browser preview)',async()=>{
 const report=vi.fn(),exitFullscreen=vi.fn(async()=>{}),requestFullscreen=vi.fn(async()=>{});
 expect(await toggleAppFullScreen({bridge:undefined,doc:{fullscreenElement:null,exitFullscreen,documentElement:{requestFullscreen}},report})).toBe('entered');
 expect(await toggleAppFullScreen({bridge:{},doc:{fullscreenElement:{},exitFullscreen,documentElement:{requestFullscreen}},report})).toBe('exited');
 expect(await toggleAppFullScreen({bridge:null,doc:{fullscreenElement:null,documentElement:{requestFullscreen:async()=>{throw new Error('Permissions check failed');}}},report})).toBe('unavailable');
 expect(report).toHaveBeenCalledWith(FULLSCREEN_UNAVAILABLE+': Permissions check failed');
});
it('a refused snapshot (live data) disables both rows with the reason; otherwise the rows are unchanged',()=>{
 const notice='Live market data is for personal display only and cannot be exported or shared.';
 expect(snapshotMenuRows({hasChart:true,blocked:notice}).map(row=>[row.id,row.enabled,row.reason])).toEqual([['download-image',false,notice],['copy-image',false,notice]]);
 expect(snapshotMenuRows({hasChart:true}).map(row=>row.enabled)).toEqual([true,true]);
 expect(snapshotMenuRows({hasChart:true,blocked:null,busy:true}).map(row=>row.enabled)).toEqual([false,true]);
 expect(snapshotMenuRows({hasChart:false,blocked:notice}).map(row=>row.reason)).toEqual(['Open a chart first.','Open a chart first.']);
 const menu=readFileSync('src/ui/SnapshotMenu.tsx','utf8');
 expect(menu).toContain('snapshotMenuRows({hasChart:!disabled,busy,blocked})');
 expect(menu).toContain('className="lv-snapshot-menu-note" role="note"');
});
