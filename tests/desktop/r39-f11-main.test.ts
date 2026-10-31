import {afterEach,describe,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import path from 'node:path';
const nodeRequire=createRequire(import.meta.url);
// F11 toggles the window's full screen in the main process (the application menu that
// carried the key is removed). The actual main entry under controlled Electron objects (the harness); it does not
// launch a process or show a window. SYNTHETIC profile only; no key, no network.
const mainSource=readFileSync('electron/main.cjs','utf8');
const realAlpaca=nodeRequire('../../electron/public-alpaca.cjs'),realCoinbase=nodeRequire('../../electron/public-coinbase.cjs');
const PROFILE='C:\\Synthetic\\Profile',STATE=path.join(PROFILE,'window-state.json');

async function boot(options:{state?:string;displays?:Array<{x:number;y:number;width:number;height:number}>}={}){
 const handlers=new Map<string,(event:unknown,value?:unknown)=>Promise<any>>(),files=new Map<string,string>(),windows:any[]=[],feeds:any={};
 if(options.state)files.set(STATE,options.state);
 const app=Object.assign(new EventEmitter(),{requestSingleInstanceLock:()=>true,quit:vi.fn(),getPath:()=>PROFILE,getAppPath:()=> 'C:\\Synthetic\\app.asar',whenReady:()=>Promise.resolve(),commandLine:{appendSwitch:vi.fn()},setPath:vi.fn()});
 const lifecycle={windowAllClosed:0,quitCompleted:0};let quittingNow=false;
 app.quit=vi.fn(()=>{app.emit('before-quit',{preventDefault(){}});quittingNow=true;try{for(const window of [...windows].reverse()){if(window.destroyed)continue;const event={prevented:false,preventDefault(){event.prevented=true;}};window.emit('close',event);if(event.prevented)return;window.destroy();}}finally{quittingNow=false;}lifecycle.quitCompleted++;app.emit('will-quit',{});});
 class Web extends EventEmitter{mainFrame={url:'lv://app/index.html'};send=vi.fn();setWindowOpenHandler=vi.fn();isLoading=()=>false;isDestroyed=()=>false;isCrashed=()=>false;}
 class Window extends EventEmitter{
  webContents=new Web();destroyed=false;visible=false;bounds:any;maximized=false;
  show=vi.fn(()=>{this.visible=true;});hide=vi.fn(()=>{this.visible=false;});focus=vi.fn();restore=vi.fn();maximize=vi.fn(()=>{this.maximized=true;});isMinimized=()=>false;isMaximized=()=>this.maximized;isDestroyed=()=>this.destroyed;fullScreen=false;setFullScreen=vi.fn((value:boolean)=>{this.fullScreen=value;});isFullScreen=()=>this.fullScreen;
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
const key=(over:Record<string,unknown>={})=>({type:'keyDown',key:'F11',control:false,alt:false,meta:false,shift:false,isAutoRepeat:false,...over});
describe(' F11 full screen',()=>{
 it('toggles the main window full screen and consumes the key',async()=>{
  const b=await boot(),event={preventDefault:vi.fn()};
  b.primary.webContents.emit('before-input-event',event,key());
  expect(event.preventDefault).toHaveBeenCalledOnce();expect(b.primary.setFullScreen).toHaveBeenLastCalledWith(true);
  b.primary.webContents.emit('before-input-event',{preventDefault:vi.fn()},key());expect(b.primary.setFullScreen).toHaveBeenLastCalledWith(false);
 });
 it('leaves other keys, modified F11, key up and auto-repeat to the page',async()=>{
  const b=await boot();
  for(const over of [{key:'F10'},{type:'keyUp'},{control:true},{alt:true},{shift:true},{meta:true},{isAutoRepeat:true}]){const event={preventDefault:vi.fn()};b.primary.webContents.emit('before-input-event',event,key(over));expect(event.preventDefault,JSON.stringify(over)).not.toHaveBeenCalled();}
  expect(b.primary.setFullScreen).not.toHaveBeenCalled();
 });
 it('a layout window toggles its own full screen only',async()=>{
  const b=await boot();expect((await b.call(b.primary,'lv:window:open-layout',{layoutId:'layout-2'})).ok).toBe(true);await b.settle();
  const second=b.windows[1];second.webContents.emit('before-input-event',{preventDefault:vi.fn()},key());
  expect(second.setFullScreen).toHaveBeenCalledWith(true);expect(b.primary.setFullScreen).not.toHaveBeenCalled();
 });
 // The toolbar Fullscreen button's channel, from a layout window, toggles that window only.
 it('the fullscreen channel from a layout window toggles that window only',async()=>{
  const b=await boot();expect((await b.call(b.primary,'lv:window:open-layout',{layoutId:'layout-2'})).ok).toBe(true);await b.settle();
  const second=b.windows[1];
  expect((await b.call(second,'lv:window:fullscreen')).ok).toBe(true);
  expect(second.setFullScreen).toHaveBeenCalledWith(true);expect(b.primary.setFullScreen).not.toHaveBeenCalled();
 });
});
