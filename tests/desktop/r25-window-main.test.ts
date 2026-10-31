import {afterEach,describe,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import path from 'node:path';
const nodeRequire=createRequire(import.meta.url);
// The actual main entry with the real electron/windows.cjs and validation.cjs under controlled Electron objects.
// It does not launch a process or show a window. SYNTHETIC symbols and layout ids only; no key, no network.
const mainSource=readFileSync('electron/main.cjs','utf8');
const realAlpaca=nodeRequire('../../electron/public-alpaca.cjs'),realCoinbase=nodeRequire('../../electron/public-coinbase.cjs');
const PROFILE='C:\\Synthetic\\Profile',STATE=path.join(PROFILE,'window-state.json');
// approved 2026-10-29: cache compiled code on first launch (v8CacheOptions bypassHeatCheck).
const HARDENED={preload:path.join('C:\\Synthetic\\electron','preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,allowRunningInsecureContent:false,devTools:false,backgroundThrottling:false,v8CacheOptions:'bypassHeatCheck'};

async function boot(options:{state?:string;displays?:Array<{x:number;y:number;width:number;height:number}>}={}){
 const handlers=new Map<string,(event:unknown,value?:unknown)=>Promise<any>>(),files=new Map<string,string>(),windows:any[]=[],feeds:any={};
 if(options.state)files.set(STATE,options.state);
 const app=Object.assign(new EventEmitter(),{requestSingleInstanceLock:()=>true,quit:vi.fn(),getPath:()=>PROFILE,getAppPath:()=> 'C:\\Synthetic\\app.asar',whenReady:()=>Promise.resolve(),commandLine:{appendSwitch:vi.fn()},setPath:vi.fn()});
 const lifecycle={windowAllClosed:0,quitCompleted:0};let quittingNow=false;
 app.quit=vi.fn(()=>{app.emit('before-quit',{preventDefault(){}});quittingNow=true;try{for(const window of [...windows].reverse()){if(window.destroyed)continue;const event={prevented:false,preventDefault(){event.prevented=true;}};window.emit('close',event);if(event.prevented)return;window.destroy();}}finally{quittingNow=false;}lifecycle.quitCompleted++;app.emit('will-quit',{});});
 class Web extends EventEmitter{mainFrame={url:'lv://app/index.html'};send=vi.fn();setWindowOpenHandler=vi.fn();isLoading=()=>false;isDestroyed=()=>false;isCrashed=()=>false;}
 class Window extends EventEmitter{
  webContents=new Web();destroyed=false;visible=false;bounds:any;maximized=false;
  show=vi.fn(()=>{this.visible=true;});hide=vi.fn(()=>{this.visible=false;});focus=vi.fn();restore=vi.fn();maximize=vi.fn(()=>{this.maximized=true;});isMinimized=()=>false;isMaximized=()=>this.maximized;isDestroyed=()=>this.destroyed;
  getNormalBounds=()=>this.bounds;getBounds=()=>this.bounds;
  loadURL=vi.fn(async(url:string)=>{this.webContents.mainFrame.url=url;});
  destroy(){if(this.destroyed)return;this.destroyed=true;this.emit('closed');if(!quittingNow&&windows.every(window=>window.destroyed)){lifecycle.windowAllClosed++;app.emit('window-all-closed');}}
  close=vi.fn(()=>{const event={prevented:false,preventDefault(){event.prevented=true;}};this.emit('close',event);if(!event.prevented)this.destroy();});
  constructor(public options:any){super();this.bounds={x:options.x??100,y:options.y??100,width:options.width,height:options.height};windows.push(this);}
 }
 class Feed{calls:any[]=[];emit:any;symbols:string[]=[];state='idle';constructor(o:any){this.emit=o.emit;feeds[this.constructor.name]=this;}
  subscribe(v:any){this.calls.push(['subscribe',v]);this.symbols=v.symbols??v.productIds;this.state='ready';return Promise.resolve({ok:true,value:this.status()});}
  unsubscribe(){this.calls.push(['unsubscribe']);this.symbols=[];this.state='idle';return{ok:true,value:this.status()};}
  status(){return{schemaVersion:1,state:this.state,symbols:[...this.symbols],productIds:[...this.symbols]};}cancel(){return false;}close(){}forget(){}}
 class AlpacaMarketData extends Feed{}
 class CoinbasePublicFeed extends Feed{subscribe(v:any){this.calls.push(['subscribe',v]);this.symbols=v.productIds;this.state='ready';return{ok:true,value:this.status()} as any;}}
 const electron:any={app,BrowserWindow:Window,Menu:{setApplicationMenu:vi.fn()},protocol:{registerSchemesAsPrivileged:vi.fn(),handle:vi.fn()},
  session:{defaultSession:{setPermissionRequestHandler:vi.fn(),setPermissionCheckHandler:vi.fn(),on:vi.fn(),webRequest:{onBeforeRequest:vi.fn()}}},
  ipcMain:{handle:(name:string,fn:any)=>handlers.set(name,fn)},dialog:{showErrorBox:vi.fn()},utilityProcess:{},
  screen:{getAllDisplays:()=>(options.displays??[{x:0,y:0,width:1920,height:1040}]).map(workArea=>({workArea}))},safeStorage:{}};
 const fsPromises={readFile:vi.fn(async(file:string)=>{if(!files.has(file))throw Object.assign(Error('missing'),{code:'ENOENT'});return files.get(file);}),writeFile:vi.fn(async(file:string,text:string)=>{files.set(file,text);}),mkdir:vi.fn()};
 const required:string[]=[];
 const require=(name:string):any=>{
  required.push(name);
  if(name==='electron')return electron;
  if(name==='node:path')return path;
  if(name==='node:fs/promises')return fsPromises;
  if(name==='./windows.cjs')return nodeRequire('../../electron/windows.cjs');
  if(name==='./validation.cjs')return nodeRequire('../../electron/validation.cjs');
  if(name==='./public-alpaca.cjs')return{AlpacaMarketData,AlpacaKeyStore:class{status(){return{configured:true};}},subscribeInput:realAlpaca.subscribeInput,subscribeFeedInput:realAlpaca.subscribeFeedInput};
  if(name==='./public-coinbase.cjs')return{CoinbasePublicFeed,subscribeInput:realCoinbase.subscribeInput};
  if(name==='./storage.cjs')return{WorkspaceStore:class{load(){return{revision:3,data:null};}save(){return{revision:4};}}};
  if(name==='./script-jobs.cjs'||name==='./public-sec.cjs')return{ScriptJobs:class{close(){}},SecCompanyFacts:class{close(){}}};
  if(name==='./alert-webhook.cjs')return{postAlertWebhook:()=>({delivered:false,status:0,error:null}),alertWebhookInput:(v:any)=>v};if(name==='./alert-notify.cjs')return{showAlertNotification:vi.fn(()=>({shown:true})),alertNotificationInput:(value:unknown)=>value};
  if(name==='./import-data.cjs')return{titles:{},limits:{}};
  if(name==='../build-identity.json')return{buildId:'synthetic'};
  if(name==='./startup-diagnostics.cjs')return{createStartupDiagnostics:()=>({record:()=>undefined}),safeCode:()=>null};
  throw Error('Unexpected dependency '+name);
 };
 runInNewContext(mainSource,{require,process:{argv:[],env:{}},__dirname:'C:\\Synthetic\\electron',console:{error:vi.fn()},setTimeout,clearTimeout,Buffer,Response,Promise});
 for(let i=0;i<40;i++)await Promise.resolve();
 const primary=windows[0],as=(window:any)=>({sender:window.webContents,senderFrame:window.webContents.mainFrame});
 const call=(window:any,channel:string,value?:unknown)=>handlers.get(channel)!(as(window),value);
 const sent=(window:any,channel:string)=>window.webContents.send.mock.calls.filter((row:any[])=>row[0]===channel).map((row:any[])=>row[1]);
 const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
 return{app,windows,primary,handlers,files,feeds,required,lifecycle,call,sent,settle,as};
}
afterEach(()=>{vi.useRealTimers();});

describe(' main process: Open layout in new window',()=>{
 it('does not load the window registry until a layout window is needed',async()=>{
  const b=await boot();expect(b.required).not.toContain('./windows.cjs');expect(b.windows).toHaveLength(1);
  expect(b.primary.options.webPreferences).toEqual(HARDENED);
  expect(await b.call(b.primary,'lv:window:list')).toEqual({ok:true,value:{layoutIds:[]}});
 });
 it('opens a hardened layout window for exactly {layoutId} and focuses it instead of opening it twice',async()=>{
  const b=await boot();
  for(const bad of [undefined,{},{layoutId:''},{layoutId:'a b'},{layoutId:'L1',extra:1}])expect((await b.call(b.primary,'lv:window:open-layout',bad)).ok).toBe(false);
  expect(await b.call(b.primary,'lv:window:open-layout',{layoutId:'layout-2'})).toEqual({ok:true,value:{windowId:1,focused:false}});
  await b.settle();
  const second=b.windows[1];expect(b.windows).toHaveLength(2);
  expect(second.options.webPreferences).toEqual(HARDENED);
  expect(second.options).toMatchObject({minWidth:960,minHeight:640,show:false,autoHideMenuBar:true});
  expect(second.webContents.setWindowOpenHandler).toHaveBeenCalledOnce();expect(second.webContents.setWindowOpenHandler.mock.calls[0][0]()).toEqual({action:'deny'});
  const navigate={preventDefault:vi.fn()};second.webContents.emit('will-navigate',navigate);expect(navigate.preventDefault).toHaveBeenCalled();
  const webview={preventDefault:vi.fn()};second.webContents.emit('will-attach-webview',webview);expect(webview.preventDefault).toHaveBeenCalled();
  expect(second.loadURL).toHaveBeenCalledWith('lv://app/index.html?window=1&layout=layout-2');
  expect(b.sent(b.primary,'lv:window:layouts').at(-1)).toEqual({layoutIds:['layout-2']});
  expect(await b.call(b.primary,'lv:window:open-layout',{layoutId:'layout-2'})).toEqual({ok:true,value:{windowId:1,focused:true}});
  expect(b.windows).toHaveLength(2);expect(second.focus).toHaveBeenCalled();
  expect(JSON.parse(b.files.get(STATE)!)).toEqual({schemaVersion:1,windows:[{layoutId:'layout-2',bounds:{x:100,y:100,width:1280,height:860},maximized:false}]});
 });
 it('a layout window uses only its fixed channel subset: it reads the workspace and relays its layout, but never writes, resets, notifies or opens windows',async()=>{
  const b=await boot();await b.call(b.primary,'lv:window:open-layout',{layoutId:'layout-2'});await b.settle();const second=b.windows[1];
  expect(await b.call(second,'lv:workspace:load')).toEqual({ok:true,value:{revision:3,data:null}});
  for(const channel of ['lv:workspace:save','lv:workspace:reset','lv:workspace:export','lv:data:import','lv:bars:import','lv:alert:notify','lv:tray:set','lv:app:quit','lv:alpaca:key-save','lv:alpaca:key-clear','lv:alpaca:test','lv:barcache:clear','lv:window:open-layout','lv:window:list','lv:window:layout-saved','lv:startup:open-symbol','lv:startup:open-symbols'])
   expect(await b.call(second,channel,{})).toMatchObject({ok:false,error:{code:'DENIED'}});
  // A frame of the layout window that is not its main frame, or a page off the app origin, is refused.
  expect(await b.handlers.get('lv:workspace:load')!({sender:second.webContents,senderFrame:{url:'lv://app/index.html'}})).toMatchObject({ok:false,error:{code:'DENIED'}});
  second.webContents.mainFrame.url='https://example.invalid/';
  expect(await b.call(second,'lv:workspace:load')).toMatchObject({ok:false,error:{code:'DENIED'}});
  // The main window is not a layout window: it cannot relay.
  expect(await b.call(b.primary,'lv:window:layout-save',{layoutId:'layout-2',grid:{}})).toMatchObject({ok:false,error:{code:'DENIED'}});
 });
 it('relays a layout save to the main window, the single writer, and returns its revision',async()=>{
  const b=await boot();await b.call(b.primary,'lv:window:open-layout',{layoutId:'layout-2'});await b.settle();const second=b.windows[1];
  const grid={schemaVersion:1,layout:{id:'layout-2',name:'Swing'},cells:{}};
  expect(await b.call(second,'lv:window:layout-save',{layoutId:'layout-1',grid})).toMatchObject({ok:false,error:{code:'DENIED'}});
  const pending=b.call(second,'lv:window:layout-save',{layoutId:'layout-2',grid});await b.settle();
  const [request]=b.sent(b.primary,'lv:window:layout-save-request');expect(request).toEqual({requestId:'relay-1',layoutId:'layout-2',grid});
  expect(await b.call(b.primary,'lv:window:layout-saved',{requestId:'relay-1',ok:true,revision:9})).toEqual({ok:true,value:{accepted:true}});
  expect(await pending).toMatchObject({ok:true,value:{revision:9}});
  expect(await b.call(b.primary,'lv:window:layout-saved',{requestId:'relay-1',ok:true,revision:9})).toEqual({ok:true,value:{accepted:false}});
  const refused=b.call(second,'lv:window:layout-save',{layoutId:'layout-2',grid});await b.settle();
  await b.call(b.primary,'lv:window:layout-saved',{requestId:'relay-2',ok:false,message:'The main window is busy.'});
  expect(await refused).toEqual({ok:false,error:{code:'SAVE_REFUSED',message:'The main window is busy.'}});
  expect(b.primary.webContents.send).not.toHaveBeenCalledWith('lv:workspace:flush-request',expect.anything());
 });
 it('closing a layout window holds for its save flush, then closes it alone and forgets it',async()=>{
  const b=await boot();await b.call(b.primary,'lv:window:open-layout',{layoutId:'layout-2'});await b.settle();const second=b.windows[1];
  second.close();expect(second.destroyed).toBe(false);
  const [token]=b.sent(second,'lv:workspace:flush-request');expect(token).toBe('close-1');
  expect(b.sent(b.primary,'lv:workspace:flush-request')).toHaveLength(0);
  expect(await b.call(second,'lv:workspace:flushed',token)).toEqual({ok:true,value:{accepted:true}});
  await b.settle();
  expect(second.destroyed).toBe(true);expect(b.primary.destroyed).toBe(false);expect(b.app.quit).not.toHaveBeenCalled();expect(b.lifecycle.windowAllClosed).toBe(0);
  expect(JSON.parse(b.files.get(STATE)!).windows).toEqual([]);
  expect(b.sent(b.primary,'lv:window:layouts').at(-1)).toEqual({layoutIds:[]});
 });
 it('a real close of the main window closes the layout windows first (their saves reach it), then flushes and quits; they are restored next start',async()=>{
  const b=await boot();await b.call(b.primary,'lv:window:open-layout',{layoutId:'layout-2'});await b.settle();const second=b.windows[1];second.bounds={x:1930,y:20,width:1200,height:800};second.emit('move');
  const event={prevented:false,preventDefault(){event.prevented=true;}};b.primary.emit('close',event);
  expect(event.prevented).toBe(true);expect(b.sent(b.primary,'lv:workspace:flush-request')).toHaveLength(0);
  const [token]=b.sent(second,'lv:workspace:flush-request');await b.call(second,'lv:workspace:flushed',token);await b.settle();
  expect(second.destroyed).toBe(true);
  const [primaryToken]=b.sent(b.primary,'lv:workspace:flush-request');expect(primaryToken).toMatch(/^close-/);
  await b.call(b.primary,'lv:workspace:flushed',primaryToken);await b.settle();
  expect(b.primary.destroyed).toBe(true);expect(b.lifecycle.windowAllClosed).toBe(1);
  const saved=b.files.get(STATE)!;expect(JSON.parse(saved).windows).toEqual([{layoutId:'layout-2',bounds:{x:1930,y:20,width:1200,height:800},maximized:false}]);
  // Next start: the layout window comes back on the second monitor; on a computer without it, at the default place.
  const two=await boot({state:saved,displays:[{x:0,y:0,width:1920,height:1040},{x:1920,y:0,width:1920,height:1040}]});
  expect(two.windows).toHaveLength(2);expect(two.windows[1].options).toMatchObject({x:1930,y:20,width:1200,height:800});
  expect(two.windows[1].loadURL).toHaveBeenCalledWith('lv://app/index.html?window=1&layout=layout-2');
  const one=await boot({state:saved});expect(one.windows[1].options).toMatchObject({width:1280,height:860});expect(one.windows[1].options.x).toBeUndefined();
 });
 it('an app quit with a layout window open flushes both windows before quitting',async()=>{
  const b=await boot();await b.call(b.primary,'lv:window:open-layout',{layoutId:'layout-2'});await b.settle();const second=b.windows[1];
  b.app.quit();expect(b.lifecycle.quitCompleted).toBe(0);
  const [token]=b.sent(second,'lv:workspace:flush-request');await b.call(second,'lv:workspace:flushed',token);await b.settle();
  const [primaryToken]=b.sent(b.primary,'lv:workspace:flush-request');await b.call(b.primary,'lv:workspace:flushed',primaryToken);await b.settle();
  expect(b.lifecycle.quitCompleted).toBe(1);expect(second.destroyed).toBe(true);expect(b.primary.destroyed).toBe(true);
  expect(JSON.parse(b.files.get(STATE)!).windows.map((row:any)=>row.layoutId)).toEqual(['layout-2']);
 });
 it('shares one Alpaca stream: the 30-symbol cap counts every window, each window gets only its symbols, and a closed window releases them',async()=>{
  const b=await boot();
  expect((await b.call(b.primary,'lv:alpaca:subscribe',{symbols:['GME','SPY']})).ok).toBe(true);
  await b.call(b.primary,'lv:window:open-layout',{layoutId:'layout-2'});await b.settle();const second=b.windows[1];
  expect(await b.call(second,'lv:alpaca:subscribe',{symbols:['AAPL','GME']})).toMatchObject({ok:true,value:{symbols:['AAPL','GME']}});
  const feed=b.feeds.AlpacaMarketData;expect(feed.calls.at(-1)).toEqual(['subscribe',{symbols:['AAPL','GME','SPY']}]);
  expect(await b.call(b.primary,'lv:alpaca:status')).toMatchObject({ok:true,value:{symbols:['GME','SPY']}});
  const many=Array.from({length:29},(_,i)=>'S'+String.fromCharCode(65+Math.floor(i/26))+String.fromCharCode(65+i%26));
  expect(await b.call(second,'lv:alpaca:subscribe',{symbols:many})).toMatchObject({ok:false,error:{code:'SYMBOL_CAP'}});
  expect(feed.calls.at(-1)).toEqual(['subscribe',{symbols:['AAPL','GME','SPY']}]);
  b.primary.webContents.send.mockClear();second.webContents.send.mockClear();
  feed.emit({schemaVersion:1,kind:'batch',bars:[{symbol:'GME'},{symbol:'AAPL'},{symbol:'SPY'}],trades:[{symbol:'AAPL'}],receivedAt:'2026-10-22T00:00:00Z'});
  expect(b.sent(b.primary,'lv:alpaca:event')[0]).toMatchObject({bars:[{symbol:'GME'},{symbol:'SPY'}],trades:[]});
  expect(b.sent(second,'lv:alpaca:event')[0]).toMatchObject({bars:[{symbol:'GME'},{symbol:'AAPL'}],trades:[{symbol:'AAPL'}]});
  feed.emit({schemaVersion:1,kind:'status',status:{state:'ready',symbols:['AAPL','GME','SPY']}});
  expect(b.sent(second,'lv:alpaca:event').at(-1)).toMatchObject({kind:'status',status:{symbols:['AAPL','GME']}});
  second.close();await b.call(second,'lv:workspace:flushed',b.sent(second,'lv:workspace:flush-request')[0]);await b.settle();
  expect(feed.calls.at(-1)).toEqual(['subscribe',{symbols:['GME','SPY']}]);
  expect((await b.call(b.primary,'lv:alpaca:unsubscribe')).ok).toBe(true);expect(feed.calls.at(-1)).toEqual(['unsubscribe']);
 });
 it('lv:close from a layout window closes that window, not the main window',async()=>{
  vi.useFakeTimers();const b=await boot();await b.call(b.primary,'lv:window:open-layout',{layoutId:'layout-2'});for(let i=0;i<20;i++)await Promise.resolve();const second=b.windows[1];
  expect(await b.call(second,'lv:close')).toEqual({ok:true,value:null});vi.advanceTimersByTime(60);
  expect(second.close).toHaveBeenCalled();expect(b.primary.close).not.toHaveBeenCalled();
 });
});
