import {afterEach,describe,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import path from 'node:path';
const nodeRequire=createRequire(import.meta.url);
// on the harness: the actual main entry with the real electron/windows.cjs and validation.cjs under controlled Electron objects.
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
 class Web extends EventEmitter{mainFrame={url:'lv://app/index.html'};send=vi.fn();reload=vi.fn();setWindowOpenHandler=vi.fn();isLoading=()=>false;isDestroyed=()=>false;isCrashed=()=>false;}
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
  ipcMain:{handle:(name:string,fn:any)=>handlers.set(name,fn)},dialog:{showErrorBox:vi.fn(),showSaveDialog:vi.fn(async()=>({canceled:false,filePath:'C:\Synthetic\out.png'}))},utilityProcess:{},
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
 return{app,windows,primary,handlers,files,feeds,required,lifecycle,call,sent,settle,as,electron,fsPromises};
}
afterEach(()=>{vi.useRealTimers();});

const PNG='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,0,0]).toString('base64');
const instrument={id:'SYNTHETIC:R29',symbol:'R29',name:'Synthetic window',exchange:'SYNTHETIC',currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'UTC'};
const paper={side:'buy',instrument,quote:{instrumentId:'SYNTHETIC:R29',bid:99.5,ask:100.5,fixture:true},quoteSource:{key:'synthetic:R29',state:'ready'},now:60};
async function withLayoutWindow(){const b=await boot();await b.call(b.primary,'lv:window:open-layout',{layoutId:'layout-2'});await b.settle();return{...b,second:b.windows[1]};}

describe(' main process: layout windows are first-class',()=>{
 it('relays the workspace-wide fields a layout window changed with its layout save, and refuses any other field',async()=>{
  const b=await withLayoutWindow(),grid={schemaVersion:1,layout:{id:'layout-2',name:'Swing'},cells:{}},shared={drawingFavorites:['trendline'],chartSettings:{templates:[]}};
  const pending=b.call(b.second,'lv:window:layout-save',{layoutId:'layout-2',grid,shared});await b.settle();
  expect(b.sent(b.primary,'lv:window:layout-save-request').at(-1)).toEqual({requestId:'relay-1',layoutId:'layout-2',grid,shared});
  await b.call(b.primary,'lv:window:layout-saved',{requestId:'relay-1',ok:true,revision:5});expect(await pending).toMatchObject({ok:true,value:{revision:5}});
  for(const bad of [{watchBook:{}},{layoutLibrary:{}},[],'x'])expect(await b.call(b.second,'lv:window:layout-save',{layoutId:'layout-2',grid,shared:bad})).toMatchObject({ok:false,error:{code:'INVALID_ARGUMENT'}});
  expect(b.sent(b.primary,'lv:window:layout-save-request')).toHaveLength(1);
 });
 it('a layout window that asks to save first stays open on its own close, and still closes on a quit',async()=>{
  const b=await withLayoutWindow();
  b.second.close();const [token]=b.sent(b.second,'lv:workspace:flush-request');
  expect(await b.call(b.second,'lv:workspace:flushed',{token,keepOpen:true})).toEqual({ok:true,value:{accepted:true,keptOpen:true}});
  await b.settle();expect(b.second.destroyed).toBe(false);
  expect(JSON.parse(b.files.get(STATE)!).windows.map((row:any)=>row.layoutId)).toEqual(['layout-2']);
  for(const bad of [{token,keepOpen:false},{token},{token,keepOpen:true,extra:1}])expect((await b.call(b.second,'lv:workspace:flushed',bad)).ok).toBe(false);
  // After the user answers (saved or discarded), lv:close closes it through the ordinary flush.
  b.second.close();const [again]=b.sent(b.second,'lv:workspace:flush-request').slice(1);expect(again).toMatch(/^close-/);
  expect(await b.call(b.second,'lv:workspace:flushed',again)).toEqual({ok:true,value:{accepted:true}});await b.settle();expect(b.second.destroyed).toBe(true);
  // A quit does not wait for the question.
  const q=await withLayoutWindow();q.app.quit();const [quitToken]=q.sent(q.second,'lv:workspace:flush-request');
  expect(await q.call(q.second,'lv:workspace:flushed',{token:quitToken,keepOpen:true})).toMatchObject({ok:true,value:{keptOpen:false}});await q.settle();
  expect(q.second.destroyed).toBe(true);
 });
 it('EXPORT-FIX: a second export while a save dialog is open is refused as BUSY, not stacked',async()=>{
  const b=await boot(),dialog=b.electron.dialog;let finish:(value:unknown)=>void=()=>{};
  dialog.showSaveDialog.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const first=b.call(b.primary,'lv:chart:export',{pngDataUrl:PNG,suggestedName:'GME_2026-10-27_09-05-07.png'});await b.settle();
  expect(await b.call(b.primary,'lv:chart:export',{pngDataUrl:PNG})).toMatchObject({ok:false,error:{code:'BUSY'}});
  expect(dialog.showSaveDialog).toHaveBeenCalledTimes(1);expect(b.primary.focus).toHaveBeenCalled();
  finish({canceled:true});expect(await first).toMatchObject({ok:false,error:{code:'CANCELLED'}});
  expect(await b.call(b.primary,'lv:chart:export',{pngDataUrl:PNG})).toMatchObject({ok:true});
 });
 it('FIX-RI8: while a save dialog is open, keys sent to the page are dropped and the page is told',async()=>{
  const b=await boot(),dialog=b.electron.dialog,win:any=b.primary;let finish:(value:unknown)=>void=()=>{};win.setEnabled=vi.fn();
  dialog.showSaveDialog.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=b.call(b.primary,'lv:chart:export',{pngDataUrl:PNG,suggestedName:'GME.png'});await b.settle();
  expect(win.setEnabled).toHaveBeenLastCalledWith(false);expect(b.sent(b.primary,'lv:native-dialog').at(-1)).toEqual({open:true});
  const key={preventDefault:vi.fn()};win.webContents.emit('before-input-event',key,{type:'keyDown',key:'x'});expect(key.preventDefault).toHaveBeenCalled();
  finish({canceled:true});expect(await pending).toMatchObject({ok:false,error:{code:'CANCELLED'}});
  expect(win.setEnabled).toHaveBeenLastCalledWith(true);expect(b.sent(b.primary,'lv:native-dialog').at(-1)).toEqual({open:false});
  await new Promise(resolve=>setTimeout(resolve,200));
  const later={preventDefault:vi.fn()};win.webContents.emit('before-input-event',later,{type:'keyDown',key:'x'});expect(later.preventDefault).not.toHaveBeenCalled();
 });
 it('export dialogs open over the window that asked',async()=>{
  const b=await withLayoutWindow(),dialog=b.electron.dialog;
  expect(await b.call(b.second,'lv:chart:export',{pngDataUrl:PNG,suggestedName:'R29.png'})).toMatchObject({ok:true});
  expect(dialog.showSaveDialog.mock.calls.at(-1)[0]).toBe(b.second);
  // A plain title per use (was "Export locally").
  expect(dialog.showSaveDialog.mock.calls.at(-1)[1].title).toBe('Save image');
  expect(await b.call(b.second,'lv:data:export',{text:'a,b\n1,2\n',suggestedName:'R29.csv',format:'csv'})).toMatchObject({ok:true});
  expect(dialog.showSaveDialog.mock.calls.at(-1)[0]).toBe(b.second);expect(dialog.showSaveDialog.mock.calls.at(-1)[1].title).toBe('Save file');
  expect(await b.call(b.primary,'lv:chart:export',{pngDataUrl:PNG})).toMatchObject({ok:true});
  expect(dialog.showSaveDialog.mock.calls.at(-1)[0]).toBe(b.primary);
  // The one-argument binary (xlsx) handler finds its sender through the IPC loop, per call.
  const xlsx=()=>{const data=new Uint8Array(8);data.set([0x50,0x4b,0x03,0x04]);return{data,suggestedName:'R29.xlsx',format:'xlsx'};};
  expect(await b.call(b.second,'lv:data:export-binary',xlsx())).toMatchObject({ok:true});
  expect(dialog.showSaveDialog.mock.calls.at(-1)[0]).toBe(b.second);
  expect(await b.call(b.primary,'lv:data:export-binary',xlsx())).toMatchObject({ok:true});
  expect(dialog.showSaveDialog.mock.calls.at(-1)[0]).toBe(b.primary);
 });
 it('relays Shift+B / Shift+S to the main window, which answers; a ticket answer brings the main window forward',async()=>{
  const b=await withLayoutWindow();
  expect(await b.call(b.primary,'lv:window:paper-action',paper)).toMatchObject({ok:false,error:{code:'DENIED'}});
  for(const bad of [{...paper,side:'short'},{...paper,extra:1},{...paper,instrument:[]},{...paper,now:-1},{...paper,instrument:{...instrument,name:'x'.repeat(20000)}}])expect((await b.call(b.second,'lv:window:paper-action',bad)).ok).toBe(false);
  const placed=b.call(b.second,'lv:window:paper-action',paper);await b.settle();
  const [request]=b.sent(b.primary,'lv:window:paper-request');expect(request).toEqual({requestId:'relay-1',layoutId:'layout-2',...paper});
  expect(await b.call(b.second,'lv:window:paper-done',{requestId:'relay-1',ok:true,message:'x'})).toMatchObject({ok:false,error:{code:'DENIED'}});
  expect(await b.call(b.primary,'lv:window:paper-done',{requestId:'relay-1',ok:true,message:'Virtual buy order for R29 sent to the main window.'})).toEqual({ok:true,value:{accepted:true}});
  expect(await placed).toEqual({ok:true,value:{ok:true,message:'Virtual buy order for R29 sent to the main window.'}});
  expect(b.primary.focus).not.toHaveBeenCalled();
  // A relayed layout-save answer cannot settle a paper request, or the reverse.
  const ticket=b.call(b.second,'lv:window:paper-action',{...paper,side:'sell'});await b.settle();
  expect(await b.call(b.primary,'lv:window:layout-saved',{requestId:'relay-2',ok:true,revision:1})).toEqual({ok:true,value:{accepted:false}});
  await b.call(b.primary,'lv:window:paper-done',{requestId:'relay-2',ok:true,message:'The R29 order ticket opened in the main window.',focus:true});
  expect(await ticket).toMatchObject({ok:true,value:{ok:true}});expect(b.primary.show).toHaveBeenCalled();expect(b.primary.focus).toHaveBeenCalled();
 });
 it('after a reset or restore, the main window reloads every layout window; a layout window cannot ask for it',async()=>{
  const b=await boot();expect(await b.call(b.primary,'lv:window:refresh')).toEqual({ok:true,value:{refreshed:0}});
  await b.call(b.primary,'lv:window:open-layout',{layoutId:'layout-2'});await b.call(b.primary,'lv:window:open-layout',{layoutId:'layout-3'});await b.settle();
  expect(await b.call(b.windows[1],'lv:window:refresh')).toMatchObject({ok:false,error:{code:'DENIED'}});
  expect(await b.call(b.primary,'lv:window:refresh')).toEqual({ok:true,value:{refreshed:2}});
  expect(b.windows[1].webContents.reload).toHaveBeenCalledOnce();expect(b.windows[2].webContents.reload).toHaveBeenCalledOnce();expect(b.primary.webContents.reload).not.toHaveBeenCalled();
  expect((await b.call(b.primary,'lv:window:refresh',{x:1})).ok).toBe(false);
 });
});
