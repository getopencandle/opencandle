import {describe,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import path from 'node:path';
const nodeRequire=createRequire(import.meta.url);
// Source checks for Wick mode (the same conditions scripts/security-package.mjs applies to a packaged build
// whose manifest lists electron/wick.cjs), then the real main entry and preload under controlled Electron objects. No
// process, window or screen is used.
const mainText=readFileSync('electron/main.cjs','utf8'),preloadText=readFileSync('electron/preload.cjs','utf8'),wickText=readFileSync('electron/wick.cjs','utf8'),packageCheck=readFileSync('scripts/security-package.mjs','utf8');
const validation=nodeRequire('../../electron/validation.cjs');
const HARDENED={preload:path.join('C:\\Synthetic\\electron','preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,allowRunningInsecureContent:false,devTools:false,backgroundThrottling:false,v8CacheOptions:'bypassHeatCheck'};

describe('Wick mode security (source)',()=>{
 it('the controller needs only ./validation.cjs and has no network, process, shell or window-creation access',()=>{
  expect([...wickText.matchAll(/require\(\s*['"`]([^'"`]*)['"`]\s*\)/g)].map(match=>match[1])).toEqual(['./validation.cjs']);
  expect(wickText).not.toMatch(/\bimport\s*\(/);
  expect(wickText).not.toMatch(/globalThis\.fetch|fetch\(|WebSocket|https?:\/\/|wss?:\/\/|child_process|openExternal|require\(\s*['"`]electron['"`]\s*\)|new BrowserWindow/);
 });
 it('main loads it once, lazily, still builds every window in one place, and keeps the pinned trust line for the main table',()=>{
  expect(mainText.match(/require\(['"]\.\/wick\.cjs['"]\)/g)).toHaveLength(1);
  expect(mainText).toMatch(/function wick\(\)\{\s*if\(!wickMode\)\{\s*const \{createWickMode,WICK_STATE_FILE\}=require\('\.\/wick\.cjs'\);/);
  expect(mainText.match(/new BrowserWindow\(/g)).toHaveLength(1);
  expect(mainText).toContain('createWindow:options=>{const window=hardenWindow(createAppWindow({...options,');
  expect(mainText).toContain("if (!trusted(event)) { if (!windowRegistry?.trustedSecondary(event, channel)) throw new validation.BoundaryError('DENIED', 'Untrusted sender.'); }");
  expect(mainText).toContain("try { if (!wickMode?.trustedStrip(event, channel)) throw new validation.BoundaryError('DENIED', 'Untrusted sender.');");
  const {SECONDARY_CHANNELS}=nodeRequire('../../electron/windows.cjs');expect(SECONDARY_CHANNELS.some((channel:string)=>channel.startsWith('lv:wick:'))).toBe(false);
 });
 it('the package security check covers Wick mode when the manifest lists electron/wick.cjs',()=>{
  expect(packageCheck).toContain("if(Object.hasOwn(manifest.sourceHashes,'electron/wick.cjs')){");
  for(const name of ['Wick mode controller matches the manifest source hash','Wick mode controller requires only ./validation.cjs','Wick mode controller has no network, process, shell or window-creation access','main.cjs loads the Wick mode controller once, lazily','the Wick mode strip window is built by createAppWindow and hardenWindow','the strip window is trusted only for its own channels, by sender, main frame and app origin','the strip window channels are exactly ready, restore, select-tab and menu','layout windows cannot use Wick mode channels'])expect(packageCheck).toContain(name);
 });
});

async function boot(){
 const handlers=new Map<string,(event:unknown,value?:unknown)=>Promise<any>>(),windows:any[]=[],menus:any[]=[];
 const app=Object.assign(new EventEmitter(),{requestSingleInstanceLock:()=>true,quit:vi.fn(),getPath:()=> 'C:\\Synthetic\\Profile',getAppPath:()=> 'C:\\Synthetic\\app.asar',whenReady:()=>Promise.resolve(),commandLine:{appendSwitch:vi.fn()},setPath:vi.fn()});
 class Contents extends EventEmitter{mainFrame={url:'lv://app/index.html'};setWindowOpenHandler=vi.fn();isLoading=()=>false;isDestroyed=()=>false;isCrashed=()=>false;send=vi.fn();}
 class Window extends EventEmitter{
  webContents=new Contents();visible=false;destroyed=false;bounds:any;
  constructor(public options:any){super();this.bounds={x:options.x??100,y:options.y??100,width:options.width,height:options.height};windows.push(this);}
  show=vi.fn(()=>{this.visible=true;this.emit('show');});showInactive=vi.fn(()=>{this.visible=true;});hide=vi.fn(()=>{this.visible=false;});focus=vi.fn();
  loadURL=vi.fn(async(url:string)=>{this.webContents.mainFrame.url=url;});isDestroyed=()=>this.destroyed;close=vi.fn();destroy=vi.fn(()=>{this.destroyed=true;});
  isVisible=()=>this.visible;isMinimized=()=>false;isMaximized=()=>false;isFullScreen=()=>false;isEnabled=()=>true;isFocused=()=>false;setFullScreen=vi.fn();
  getBounds=()=>({...this.bounds});getNormalBounds=()=>({...this.bounds});setBounds=vi.fn((b:any)=>{this.bounds={...b};});setAlwaysOnTop=vi.fn();setSkipTaskbar=vi.fn();
 }
 const screen=Object.assign(new EventEmitter(),{getAllDisplays:()=>[{id:1,workArea:{x:0,y:0,width:1920,height:1040}}],getPrimaryDisplay:()=>({id:1,workArea:{x:0,y:0,width:1920,height:1040}}),getDisplayMatching:()=>({id:1,workArea:{x:0,y:0,width:1920,height:1040}})});
 const electron={app,BrowserWindow:Window,screen,Menu:{setApplicationMenu:vi.fn(),buildFromTemplate:(template:any[])=>{const menu={template,popup:vi.fn()};menus.push(menu);return menu;}},protocol:{registerSchemesAsPrivileged:vi.fn(),handle:vi.fn()},clipboard:{},ClipboardItem:class{},nativeImage:{},
  session:{defaultSession:{setPermissionRequestHandler:vi.fn(),setPermissionCheckHandler:vi.fn(),on:vi.fn(),webRequest:{onBeforeRequest:vi.fn()}}},
  ipcMain:{handle:(name:string,fn:any)=>handlers.set(name,fn)},dialog:{showErrorBox:vi.fn()},utilityProcess:{}};
 const files=new Map<string,string>();
 const require=(name:string):any=>{
  if(name==='electron')return electron;
  if(name==='node:path')return path;
  if(name==='node:fs/promises')return{writeFile:vi.fn(async(file:string,text:string)=>{files.set(file,text);}),readFile:vi.fn(async(file:string)=>{if(!files.has(file))throw new Error('none');return files.get(file);})};
  if(name==='./wick.cjs')return nodeRequire('../../electron/wick.cjs');
  if(name==='./storage.cjs')return{WorkspaceStore:class{}};
  if(name==='./script-jobs.cjs')return{ScriptJobs:class{close(){}}};
  if(name==='./public-sec.cjs')return{SecCompanyFacts:class{close(){}}};
  if(name==='./import-data.cjs')return{titles:{},limits:{}};
  if(name==='./alert-webhook.cjs')return{postAlertWebhook:()=>({}),alertWebhookInput:(v:any)=>v};if(name==='./alert-notify.cjs')return{showAlertNotification:()=>({shown:false}),alertNotificationInput:(v:any)=>v};
  if(name==='./validation.cjs')return validation;
  if(name==='../build-identity.json')return{buildId:'synthetic'};
  if(name==='./startup-diagnostics.cjs')return{createStartupDiagnostics:()=>({record:()=>undefined}),safeCode:()=>null};
  throw Error('Unexpected dependency '+name);
 };
 runInNewContext(mainSource(),{require,process:{argv:[],pid:1},__dirname:'C:\\Synthetic\\electron',console:{error:vi.fn()},setTimeout,clearTimeout,Buffer,Response,Blob,URL});
 for(let i=0;i<10;i++)await Promise.resolve();
 const main=windows[0],trusted={sender:main.webContents,senderFrame:main.webContents.mainFrame};
 const call=(channel:string,event:unknown,value?:unknown)=>handlers.get(channel)!(event,value);
 return{handlers,windows,main,trusted,call,menus,app,files};
}
const mainSource=()=>mainText;

describe('Wick mode in the main process',()=>{
 it('does not load the controller at startup',async()=>{
  const b=await boot();expect(b.windows).toHaveLength(1);
  for(const channel of ['lv:wick:enter','lv:wick:exit','lv:wick:configure','lv:wick:publish','lv:wick:ready','lv:wick:restore','lv:wick:select-tab','lv:wick:menu'])expect(b.handlers.has(channel),channel).toBe(true);
 });
 it('the main window channels refuse other senders and bad input',async()=>{
  const b=await boot(),stranger={sender:new EventEmitter(),senderFrame:{url:'lv://app/index.html'}};
  for(const channel of ['lv:wick:enter','lv:wick:exit','lv:wick:configure','lv:wick:publish'])expect(await b.call(channel,stranger,undefined),channel).toMatchObject({ok:false,error:{code:'DENIED'}});
  expect(await b.call('lv:wick:enter',b.trusted,{now:true})).toMatchObject({ok:false,error:{code:'INVALID_ARGUMENT'}});
  expect(await b.call('lv:wick:configure',b.trusted,{alwaysOnTop:true})).toMatchObject({ok:false,error:{code:'INVALID_ARGUMENT'}});
  expect(await b.call('lv:wick:configure',b.trusted,{alwaysOnTop:false,collapseOnBlur:true})).toEqual({ok:true,value:{active:false,alwaysOnTop:false,collapseOnBlur:true,supported:true}});
 });
 it('enter builds the strip window with the main window\'s hardened preferences and navigation denial, and hides the main window',async()=>{
  const b=await boot();
  expect(await b.call('lv:wick:enter',b.trusted)).toEqual({ok:true,value:{active:true}});
  const strip=b.windows[1];expect(b.windows).toHaveLength(2);
  expect(strip.options.webPreferences).toEqual(HARDENED);expect(b.main.options.webPreferences).toEqual(HARDENED);
  expect(strip.options).toMatchObject({frame:false,alwaysOnTop:true,skipTaskbar:true,show:false,maximizable:false,fullscreenable:false});
  expect(strip.webContents.setWindowOpenHandler).toHaveBeenCalled();expect(strip.webContents.listenerCount('will-navigate')).toBeGreaterThan(0);expect(strip.webContents.listenerCount('will-attach-webview')).toBeGreaterThan(0);
  expect(strip.show).toHaveBeenCalledOnce();expect(b.main.hide).toHaveBeenCalledOnce();expect(b.main.close).not.toHaveBeenCalled();
  await Promise.resolve();expect(strip.loadURL).toHaveBeenCalledWith('lv://app/index.html?window=wick');
 });
 it('the strip window is trusted only for its four channels; the main table refuses it',async()=>{
  const b=await boot();await b.call('lv:wick:enter',b.trusted);await Promise.resolve();
  const strip=b.windows[1],own={sender:strip.webContents,senderFrame:strip.webContents.mainFrame};
  for(const channel of ['lv:workspace:load','lv:workspace:save','lv:alpaca:subscribe','lv:app:quit','lv:wick:enter','lv:wick:publish','lv:window:fullscreen','lv:close'])expect(await b.call(channel,own,undefined),channel).toMatchObject({ok:false,error:{code:'DENIED'}});
  for(const channel of ['lv:wick:ready','lv:wick:restore','lv:wick:select-tab','lv:wick:menu'])expect(await b.call(channel,b.trusted,undefined),'main window: '+channel).toMatchObject({ok:false,error:{code:'DENIED'}});
  expect(await b.call('lv:wick:ready',own)).toEqual({ok:true,value:null});
  const snapshot={tabs:[{id:'a',symbol:'GME',name:'Main',active:true,price:'23.82',change:'-0.75%',tone:'down'},{id:'b',symbol:'SPY',name:'Index',active:false}],theme:{'--lv-bg-raised':'#1f1f1f'}};
  expect(await b.call('lv:wick:publish',b.trusted,snapshot)).toEqual({ok:true,value:{accepted:true}});
  expect(strip.webContents.send).toHaveBeenLastCalledWith('lv:wick:snapshot',snapshot);
  expect(await b.call('lv:wick:select-tab',own,{id:'b',extra:1})).toMatchObject({ok:false,error:{code:'INVALID_ARGUMENT'}});
  expect(await b.call('lv:wick:select-tab',own,{id:'b'})).toEqual({ok:true,value:{restored:false}});
  expect(b.main.webContents.send).toHaveBeenLastCalledWith('lv:wick:tab-request',{id:'b'});
  expect(await b.call('lv:wick:menu',own)).toEqual({ok:true,value:{shown:true}});
  expect(await b.call('lv:wick:restore',own,{now:1})).toMatchObject({ok:false,error:{code:'INVALID_ARGUMENT'}});
  expect(await b.call('lv:wick:restore',own)).toEqual({ok:true,value:{active:false}});expect(b.main.show).toHaveBeenCalled();
 });
 it('Ctrl+Shift+M in the main window enters Wick mode; other chords reach the page',async()=>{
  const b=await boot(),key=(input:Record<string,unknown>)=>{const event={preventDefault:vi.fn()};b.main.webContents.emit('before-input-event',event,{type:'keyDown',control:false,alt:false,meta:false,shift:false,isAutoRepeat:false,...input});return event.preventDefault.mock.calls.length>0;};
  expect(key({key:'m',control:true})).toBe(false);expect(key({key:'M',shift:true})).toBe(false);expect(key({key:'M',control:true,shift:true,isAutoRepeat:true})).toBe(false);
  expect(key({key:'M',control:true,shift:true})).toBe(true);
  for(let i=0;i<10;i++)await Promise.resolve();
  expect(b.windows).toHaveLength(2);expect(b.main.hide).toHaveBeenCalledOnce();
 });
 it('a real close of the main window destroys the strip, so the last window can close and the app quits',async()=>{
  const b=await boot();await b.call('lv:wick:enter',b.trusted);await b.call('lv:wick:exit',b.trusted);
  b.main.emit('closed');expect(b.windows[1].destroy).toHaveBeenCalledOnce();
 });
});

describe('Wick mode preload',()=>{
 it('exposes fixed channels only; the no-input calls pass no renderer argument',()=>{
  let exposed:any=null;const invoke=vi.fn(async()=>({ok:true,value:null})),on=vi.fn(),removeListener=vi.fn();
  runInNewContext(preloadText,{require:(name:string)=>{if(name==='electron')return{contextBridge:{exposeInMainWorld:(_key:string,value:unknown)=>{exposed=value;}},ipcRenderer:{invoke,on,removeListener}};throw Error(name);}});
  exposed.enterWickMode('x');exposed.exitWickMode('x');exposed.wickStripReady('x');exposed.wickRestore('x');exposed.wickMenu('x');
  exposed.configureWickMode({alwaysOnTop:true,collapseOnBlur:false});exposed.publishWickStrip({tabs:[],theme:{}});exposed.wickSelectTab({id:'a'});
  expect(invoke.mock.calls).toEqual([['lv:wick:enter',undefined],['lv:wick:exit',undefined],['lv:wick:ready',undefined],['lv:wick:restore',undefined],['lv:wick:menu',undefined],['lv:wick:configure',{alwaysOnTop:true,collapseOnBlur:false}],['lv:wick:publish',{tabs:[],theme:{}}],['lv:wick:select-tab',{id:'a'}]]);
  const off=exposed.onWickSnapshot(()=>{});exposed.onWickState(()=>{});exposed.onWickTabRequest(()=>{});
  expect(on.mock.calls.map((call:any[])=>call[0])).toEqual(['lv:workspace:flush-request','lv:window:layout-save-request','lv:window:paper-request','lv:wick:snapshot','lv:wick:state','lv:wick:tab-request']);
  off();expect(removeListener).toHaveBeenCalledWith('lv:wick:snapshot',expect.any(Function));
  expect(()=>exposed.onWickSnapshot('nope')).toThrow(/handler function/);
 });
});
