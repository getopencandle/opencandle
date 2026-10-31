import {describe,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import path from 'node:path';
import {HARNESS_IMAGE_MAX_BYTES,harnessImageFile,loadHarnessImage,resetHarnessImage,validHarnessImage} from '../../src/ui/image-harness';

// (exe sweep, Image tool): the exe-harness image is reachable only in a gated harness run. The real main entry and
// preload run under controlled Electron objects (no window, file or network); the decision and the PNG are checked directly.
const nodeRequire=createRequire(import.meta.url);
const harness=nodeRequire('../../electron/image-harness.cjs');
const mainSource=readFileSync('electron/main.cjs','utf8'),preloadSource=readFileSync('electron/preload.cjs','utf8'),harnessSource=readFileSync('electron/image-harness.cjs','utf8');
const TEMP='C:\\Synthetic\\Temp',THROWAWAY=TEMP+'\\lv-profile';
const ON={LV_IMAGE_HARNESS:'synthetic-png'};

describe('the harness gate',()=>{
 const decide=(env:Record<string,string>,packaged=false,profile:string|null=THROWAWAY)=>harness.imageHarnessDecision({env,packaged,profile,tmpdir:TEMP});
 it('is off without the flag and blocked for any other value, a non-temp profile or a packaged run without LV_EXE_HARNESS=image-inject',()=>{
  expect(decide({})).toEqual({mode:'off',reason:null});
  expect(decide({LV_IMAGE_HARNESS:'yes'}).mode).toBe('blocked');
  expect(decide(ON,false,null).mode).toBe('blocked');
  expect(decide(ON,false,'C:\\Users\\Someone\\AppData\\Roaming\\LarryVision').mode).toBe('blocked');
  expect(decide(ON,false,TEMP).mode).toBe('blocked');
  expect(decide(ON,false,TEMP+'\\..\\x').mode).toBe('blocked');
  expect(decide(ON,true).mode).toBe('blocked');
  expect(decide({...ON,LV_EXE_HARNESS:'alpaca-stub'},true).mode).toBe('blocked');
  expect(decide(ON)).toEqual({mode:'synthetic',reason:null});
  expect(decide({...ON,LV_EXE_HARNESS:'image-inject'},true)).toEqual({mode:'synthetic',reason:null});
 });
 it('only an enabled decision yields the image: a small PNG labelled SYNTHETIC, a fresh copy each call',()=>{
  for(const mode of ['off','blocked'])expect(harness.harnessImage({mode})).toBeNull();
  expect(harness.harnessImage(null)).toBeNull();
  const a=harness.harnessImage({mode:'synthetic'}),b=harness.harnessImage({mode:'synthetic'});
  expect(a).toMatchObject({schemaVersion:1,synthetic:true,name:'LV-SYNTHETIC-harness-image.png'});
  expect(validHarnessImage(a)).toBe(true);expect(a.bytes).not.toBe(b.bytes);
  const view=new DataView(a.bytes.buffer,a.bytes.byteOffset);
  expect([view.getUint32(16),view.getUint32(20)]).toEqual([24,16]);
 });
 it('the module requires nothing and has no network, process or shell access',()=>{
  expect(harnessSource).not.toMatch(/require\(|\bimport\s*\(/);
  expect(harnessSource).not.toMatch(/fetch\(|WebSocket|https?:\/\/|wss?:\/\/|child_process|openExternal|process\./);
 });
});

class BoundaryError extends Error{constructor(public code:string,message:string){super(message);}}
async function boot(env:Record<string,string>,options:{packaged?:boolean;profile?:string|null}={}){
  const handlers=new Map<string,(event:unknown,value?:unknown)=>Promise<any>>();
  const loaded:string[]=[];
  const app=Object.assign(new EventEmitter(),{requestSingleInstanceLock:()=>true,quit:vi.fn(),getPath:()=> 'C:\\Synthetic\\Profile',getAppPath:()=> 'C:\\Synthetic\\app.asar',whenReady:()=>Promise.resolve(),commandLine:{appendSwitch:vi.fn()},setPath:vi.fn(),isPackaged:options.packaged===true});
  const frame={url:'lv://app/index.html'};
  const web=Object.assign(new EventEmitter(),{setWindowOpenHandler:vi.fn(),isLoading:()=>false,isDestroyed:()=>false,isCrashed:()=>false,mainFrame:frame,send:vi.fn()});
  class Window extends EventEmitter{webContents=web;show=vi.fn();loadURL=vi.fn(async()=>{});isDestroyed=()=>false;close=vi.fn();}
  const electron={app,BrowserWindow:Window,Menu:{setApplicationMenu:vi.fn()},protocol:{registerSchemesAsPrivileged:vi.fn(),handle:vi.fn()},safeStorage:{isEncryptionAvailable:()=>true},
    session:{defaultSession:{setPermissionRequestHandler:vi.fn(),setPermissionCheckHandler:vi.fn(),on:vi.fn(),webRequest:{onBeforeRequest:vi.fn()}}},
    ipcMain:{handle:(name:string,fn:any)=>handlers.set(name,fn)},dialog:{showErrorBox:vi.fn()},utilityProcess:{}};
  const require=(name:string):any=>{
    if(name==='electron')return electron;
    if(name==='node:path')return path.win32;
    if(name==='node:fs/promises')return{};
    if(name==='node:os')return{tmpdir:()=>TEMP};
    if(name==='node:fs')return{realpathSync:{native:(value:string)=>value}};
    if(name==='./storage.cjs')return{WorkspaceStore:class{}};
    if(name==='./script-jobs.cjs')return{ScriptJobs:class{close(){}}};
    if(name==='./public-sec.cjs')return{SecCompanyFacts:class{close(){}}};
    if(name==='./image-harness.cjs'){loaded.push(name);return harness;}
    if(name==='./import-data.cjs')return{titles:{},limits:{}};
    if(name==='./alert-webhook.cjs')return{postAlertWebhook:()=>({delivered:false,status:0,error:null}),alertWebhookInput:(v:any)=>v};if(name==='./alert-notify.cjs')return{showAlertNotification:()=>({shown:false}),alertNotificationInput:(v:any)=>v};
    if(name==='./validation.cjs')return{BoundaryError,isAppURL:(url:string)=>url.startsWith('lv://app/'),exactKeys:(value:any,keys:string[])=>{if(!value||typeof value!=='object'||Object.keys(value).some(k=>!keys.includes(k)))throw new BoundaryError('INVALID_ARGUMENT','Unexpected or missing fields.');},cancelInput:(v:any)=>v.requestId};
    if(name==='../build-identity.json')return{buildId:'synthetic'};
    if(name==='./startup-diagnostics.cjs')return{createStartupDiagnostics:()=>({record:()=>undefined}),safeCode:()=>null};
    throw Error('Unexpected dependency '+name);
  };
  const profile=options.profile===undefined?THROWAWAY:options.profile;
  const argv=profile?['--lv-profile='+profile]:[];
  runInNewContext(mainSource,{require,process:{argv,pid:1,env},__dirname:'C:\\Synthetic\\electron',console:{error:vi.fn()},setTimeout,clearTimeout,Buffer,Response});
  for(let i=0;i<8;i++)await Promise.resolve();
  return{handlers,loaded,web,trusted:{sender:web,senderFrame:frame}};
}

describe('main: lv:harness:image',()=>{
 it('a normal run answers null and never loads the module; untrusted senders and any input are refused',async()=>{
  const b=await boot({},{profile:null});
  expect(await b.handlers.get('lv:harness:image')!(b.trusted)).toEqual({ok:true,value:null});
  expect(await b.handlers.get('lv:harness:image')!({sender:b.web,senderFrame:{url:'https://evil.example/'}})).toMatchObject({ok:false,error:{code:'DENIED'}});
  expect(await b.handlers.get('lv:harness:image')!(b.trusted,{path:'C:\\x.png'})).toMatchObject({ok:false,error:{code:'INVALID_ARGUMENT'}});
  expect(b.loaded).toEqual([]);
 });
 it('a gated harness run answers the SYNTHETIC image; a packaged run needs LV_EXE_HARNESS=image-inject; a real profile never gets it',async()=>{
  const dev=await boot(ON);
  const answer=await dev.handlers.get('lv:harness:image')!(dev.trusted);
  expect(answer.ok).toBe(true);expect(validHarnessImage(answer.value)).toBe(true);
  expect((await (await boot(ON,{packaged:true})).handlers.get('lv:harness:image')!(dev.trusted)).value??null).toBeNull();
  const packaged=await boot({...ON,LV_EXE_HARNESS:'image-inject'},{packaged:true});
  expect(validHarnessImage((await packaged.handlers.get('lv:harness:image')!(packaged.trusted)).value)).toBe(true);
  const real=await boot({...ON,LV_EXE_HARNESS:'image-inject'},{packaged:true,profile:'C:\\Users\\Someone\\AppData\\Roaming\\LarryVision'});
  expect((await real.handlers.get('lv:harness:image')!(real.trusted)).value).toBeNull();
 });
 it('preload exposes one fixed, input-free call; neither preload nor renderer source names the gate',()=>{
  const invoke=vi.fn(async()=>({ok:true,value:null}));let exposed:any;
  const electron={contextBridge:{exposeInMainWorld:(_n:string,api:any)=>{exposed=api;}},ipcRenderer:{invoke,on:vi.fn(),removeListener:vi.fn()}};
  runInNewContext(preloadSource,{require:(name:string)=>{if(name==='electron')return electron;throw Error('Unexpected dependency '+name);},Object,Promise,TypeError});
  exposed.harnessImage({path:'C:\\x.png'});
  expect(invoke.mock.calls).toEqual([['lv:harness:image',undefined]]);
  for(const source of [preloadSource,readFileSync('src/ui/image-harness.ts','utf8'),readFileSync('src/ui/App.tsx','utf8')])expect(source).not.toMatch(/LV_IMAGE_HARNESS|LV_EXE_HARNESS|image-inject|synthetic-png/);
 });
});

describe('renderer: the harness image is used only when main supplied a valid one',()=>{
 const good=harness.harnessImage({mode:'synthetic'});
 it('null, a refusal, a throw, a missing call or a malformed image leave the file chooser',async()=>{
  for(const bridge of [null,{},{harnessImage:async()=>({ok:true,value:null})},{harnessImage:async()=>({ok:false,error:{}})},{harnessImage:async()=>{throw Error('x');}},
   {harnessImage:async()=>({ok:true,value:{...good,synthetic:false}})},{harnessImage:async()=>({ok:true,value:{...good,name:'C:\\x.png'}})},
   {harnessImage:async()=>({ok:true,value:{...good,bytes:new Uint8Array(HARNESS_IMAGE_MAX_BYTES+1)}})},{harnessImage:async()=>({ok:true,value:{...good,bytes:new Uint8Array(20)}})}]){
   resetHarnessImage();expect(await loadHarnessImage(bridge)).toBe(false);expect(harnessImageFile()).toBeNull();
  }
 });
 it('a valid image becomes a PNG file, and App arms Image with it instead of the chooser',async()=>{
  expect(await loadHarnessImage({harnessImage:async()=>({ok:true,value:good})})).toBe(true);
  const file=harnessImageFile()!;expect(file.type).toBe('image/png');expect(new Uint8Array(await file.arrayBuffer())).toEqual(good.bytes);
  const app=readFileSync('src/ui/App.tsx','utf8');
  expect(app).toContain('disarmTool();const injected=harnessImageFile();if(injected)void addImageFile(injected);else imageInput.current?.click();');
  expect(app).toContain('useEffect(()=>{void loadHarnessImage(window.lv);},[]);');
  resetHarnessImage();
 });
});
