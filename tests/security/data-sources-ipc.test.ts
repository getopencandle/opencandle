import {expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import path from 'node:path';

// The actual main entry and preload under controlled Electron objects. No process, window, dialog or network.
const mainSource=readFileSync('electron/main.cjs','utf8'),preloadSource=readFileSync('electron/preload.cjs','utf8'),windowsSource=readFileSync('electron/windows.cjs','utf8');
const realRequire=createRequire(path.resolve('electron/main.cjs'));
const validation=realRequire('./validation.cjs');
const CHANNELS=['lv:datasources:info','lv:datasources:open-folder','lv:datasources:export','lv:datasources:import'];
async function boot({userData='C:\\Users\\Someone\\AppData\\Roaming\\OpenCandle',appPath='C:\\Program Files\\OpenCandle\\resources\\app.asar',openFile='C:\\Users\\Someone\\Downloads\\OpenCandle-data-sources.json',fileText=''}={}){
  const handlers=new Map<string,(event:unknown,value?:unknown)=>Promise<any>>();
  const loaded:string[]=[];
  const app=Object.assign(new EventEmitter(),{requestSingleInstanceLock:()=>true,quit:vi.fn(),getPath:()=>userData,getAppPath:()=>appPath,isPackaged:false,whenReady:()=>Promise.resolve(),commandLine:{appendSwitch:vi.fn()},setPath:vi.fn(),setAppUserModelId:vi.fn()});
  const frame={url:'lv://app/index.html'};
  const web=Object.assign(new EventEmitter(),{setWindowOpenHandler:vi.fn(),isLoading:()=>false,isDestroyed:()=>false,isCrashed:()=>false,mainFrame:frame,send:vi.fn()});
  class Window extends EventEmitter{webContents=web;show=vi.fn();loadURL=vi.fn(async()=>{});isDestroyed=()=>false;close=vi.fn();focus=vi.fn();}
  const shell={openPath:vi.fn(async()=>'')};
  const dialog={showErrorBox:vi.fn(),showSaveDialog:vi.fn(async()=>({canceled:false,filePath:'C:\\Users\\Someone\\Documents\\OpenCandle-data-sources.json'})),showOpenDialog:vi.fn(async()=>({canceled:false,filePaths:[openFile]}))};
  const fs={mkdir:vi.fn(async()=>undefined),writeFile:vi.fn(async()=>undefined)};
  const electron={app,BrowserWindow:Window,Menu:{setApplicationMenu:vi.fn()},protocol:{registerSchemesAsPrivileged:vi.fn(),handle:vi.fn()},safeStorage:{isEncryptionAvailable:()=>true},shell,
    session:{defaultSession:{setPermissionRequestHandler:vi.fn(),setPermissionCheckHandler:vi.fn(),on:vi.fn(),webRequest:{onBeforeRequest:vi.fn()}}},
    ipcMain:{handle:(name:string,fn:any)=>handlers.set(name,fn)},dialog,utilityProcess:{}};
  class AlpacaKeyStore{status=vi.fn(async()=>({configured:true,keyIdHint:'****ABCD',encryption:true}));}
  const readLocalText=vi.fn(async(file:string)=>({fileName:path.win32.basename(file),format:'json',text:fileText,bytes:fileText.length}));
  const require=(name:string):any=>{
    if(name==='electron')return electron;
    if(name==='node:path')return path.win32;
    if(name==='node:fs/promises')return fs;
    if(name==='./storage.cjs')return{WorkspaceStore:class{}};
    if(name==='./script-jobs.cjs')return{ScriptJobs:class{close(){}}};
    if(name==='./public-sec.cjs')return{SecCompanyFacts:class{close(){}}};
    if(name==='./public-alpaca.cjs'){loaded.push(name);return{AlpacaKeyStore,AlpacaMarketData:class{}};}
    if(name==='./data-sources.cjs'){loaded.push(name);return realRequire('./data-sources.cjs');}
    if(name==='./import-data.cjs')return{titles:{},limits:{},readLocalText};
    if(name==='./alert-webhook.cjs')return{postAlertWebhook:()=>null,alertWebhookInput:(v:any)=>v};if(name==='./alert-notify.cjs')return{showAlertNotification:()=>null,alertNotificationInput:(v:any)=>v};
    if(name==='./validation.cjs')return validation;
    if(name==='../build-identity.json')return{buildId:'synthetic'};
    if(name==='./startup-diagnostics.cjs')return{createStartupDiagnostics:()=>({record:()=>undefined}),safeCode:()=>null};
    if(name==='./profile-migration.cjs')return{migrateProfile:()=>'none'};
    throw Error('Unexpected dependency '+name);
  };
  runInNewContext(mainSource,{require,process:{argv:[],pid:1,execPath:'C:\\Program Files\\OpenCandle\\OpenCandle.exe',platform:'win32'},__dirname:'C:\\Program Files\\OpenCandle\\resources\\app.asar\\electron',console:{error:vi.fn()},setTimeout,clearTimeout,Buffer,Response});
  for(let i=0;i<8;i++)await Promise.resolve();
  return{app,handlers,loaded,shell,dialog,fs,readLocalText,trusted:{sender:web,senderFrame:frame}};
}
const SETTINGS={coinbase:true,alpacaSymbols:['AAPL','BRK.B'],alpacaPlan:'paid',fred:false};

it('registers the four fixed channels, loads nothing until asked, and denies untrusted senders and layout windows',async()=>{
  const b=await boot();
  for(const channel of CHANNELS)expect(b.handlers.has(channel)).toBe(true);
  expect(b.loaded).toEqual([]);
  const other={sender:new EventEmitter(),senderFrame:{url:'https://evil.example/'}};
  for(const channel of CHANNELS)expect(await b.handlers.get(channel)!(other,undefined)).toMatchObject({ok:false,error:{code:'DENIED'}});
  expect(b.loaded).toEqual([]);expect(b.shell.openPath).not.toHaveBeenCalled();
  const secondary=windowsSource.match(/const SECONDARY_CHANNELS = Object\.freeze\(\[([\s\S]*?)\]\);/)![1];
  for(const channel of CHANNELS)expect(secondary).not.toContain(channel);
});
it('info names the profile folder (app data, not the program folder) and never a key',async()=>{
  const b=await boot();
  const info=await b.handlers.get('lv:datasources:info')!(b.trusted);
  expect(info).toEqual({ok:true,value:{directory:'C:\\Users\\Someone\\AppData\\Roaming\\OpenCandle',insideAppFolder:false,encryption:true,keySaved:true}});
  expect(await b.handlers.get('lv:datasources:info')!(b.trusted,{path:'C:\\'})).toMatchObject({ok:false,error:{code:'INVALID_ARGUMENT'}});
  // A profile inside the checkout (the old development launcher) is flagged so the page can warn.
  const inside=await boot({userData:'C:\\work\\OpenCandle\\local-data\\owner-preview',appPath:'C:\\work\\OpenCandle'});
  expect((await inside.handlers.get('lv:datasources:info')!(inside.trusted)).value.insideAppFolder).toBe(true);
});
it('Open folder opens exactly the profile folder and takes no input',async()=>{
  const b=await boot();
  expect(await b.handlers.get('lv:datasources:open-folder')!(b.trusted)).toEqual({ok:true,value:{opened:true}});
  expect(b.shell.openPath).toHaveBeenCalledWith('C:\\Users\\Someone\\AppData\\Roaming\\OpenCandle');
  expect(await b.handlers.get('lv:datasources:open-folder')!(b.trusted,{directory:'C:\\Windows'})).toMatchObject({ok:false,error:{code:'INVALID_ARGUMENT'}});
  expect(b.shell.openPath).toHaveBeenCalledTimes(1);
  b.shell.openPath.mockResolvedValueOnce('Access denied');
  expect(await b.handlers.get('lv:datasources:open-folder')!(b.trusted)).toMatchObject({ok:false,error:{code:'OPEN_FAILED'}});
});
it('Export writes only the non-secret choices through the save dialog and refuses a key field',async()=>{
  const b=await boot();
  expect(await b.handlers.get('lv:datasources:export')!(b.trusted,{settings:SETTINGS})).toEqual({ok:true,value:{fileName:'OpenCandle-data-sources.json',bytes:expect.any(Number)}});
  expect((b.dialog.showSaveDialog.mock.calls[0] as unknown[])[1]).toMatchObject({defaultPath:'OpenCandle-data-sources.json'});
  const written=JSON.parse(String((b.fs.writeFile.mock.calls[0] as unknown[])[1]));
  expect(written).toMatchObject({kind:'lv-data-sources',schemaVersion:1,settings:SETTINGS});
  expect(written.note).toMatch(/never written to this file/);
  for(const bad of [{settings:{...SETTINGS,secret:'SyntheticSecretNotARealKey0000000000000000'}},{settings:SETTINGS,keyId:'SYNTHETICKEY0000ABCD'},{settings:{...SETTINGS,alpacaSymbols:['$$$']}}])
    expect(await b.handlers.get('lv:datasources:export')!(b.trusted,bad)).toMatchObject({ok:false,error:{code:'INVALID_ARGUMENT'}});
  expect(b.fs.writeFile).toHaveBeenCalledTimes(1);
});
it('Import reads one picked JSON file and answers validated choices; key fields and other files are refused',async()=>{
  const sources=realRequire('./data-sources.cjs');
  const good=await boot({fileText:sources.serializeSettings(SETTINGS)});
  expect(await good.handlers.get('lv:datasources:import')!(good.trusted)).toEqual({ok:true,value:{fileName:'OpenCandle-data-sources.json',settings:SETTINGS}});
  expect(good.readLocalText.mock.calls[0].slice(1)).toEqual([['.json'],64*1024]);
  const keyed=await boot({fileText:JSON.stringify({kind:'lv-data-sources',schemaVersion:1,settings:{...SETTINGS,secret:'x'}})});
  expect(await keyed.handlers.get('lv:datasources:import')!(keyed.trusted)).toMatchObject({ok:false,error:{code:'INVALID_FORMAT',message:expect.stringMatching(/never imports keys/)}});
  const workspace=await boot({fileText:JSON.stringify({schemaVersion:1,data:{}})});
  expect(await workspace.handlers.get('lv:datasources:import')!(workspace.trusted)).toMatchObject({ok:false,error:{code:'INVALID_FORMAT'}});
  const cancelled=await boot();cancelled.dialog.showOpenDialog.mockResolvedValueOnce({canceled:true,filePaths:[]});
  expect(await cancelled.handlers.get('lv:datasources:import')!(cancelled.trusted)).toMatchObject({ok:false,error:{code:'CANCELLED'}});
});
it('preload exposes the four calls as fixed channels; Open folder and Import send nothing',()=>{
  const invoke=vi.fn(async()=>({ok:true}));let exposed:any;
  const electron={contextBridge:{exposeInMainWorld:(_n:string,api:any)=>{exposed=api;}},ipcRenderer:{invoke,on:vi.fn(),removeListener:vi.fn()}};
  runInNewContext(preloadSource,{require:(name:string)=>{if(name==='electron')return electron;throw Error('Unexpected dependency '+name);},Object,Promise,TypeError});
  exposed.dataSourcesInfo();exposed.openDataFolder('C:\\Windows');exposed.exportDataSourceSettings({settings:SETTINGS});exposed.importDataSourceSettings('C:\\x.json');
  expect(invoke.mock.calls).toEqual([['lv:datasources:info',undefined],['lv:datasources:open-folder',undefined],['lv:datasources:export',{settings:SETTINGS}],['lv:datasources:import',undefined]]);
});
