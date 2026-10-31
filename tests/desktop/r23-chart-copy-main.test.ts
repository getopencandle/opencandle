import {expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import path from 'node:path';

// The actual main entry and preload under controlled Electron objects (the harness
// pattern of tests/security/live-ipc-main.test.ts, with the real validation module). No process, window, screen or clipboard.
// The clipboard mock has exactly the members Electron 44 declares (electron.d.ts Clipboard: clear, has,
// read, readText, write(ClipboardItem[]) and writeText), so a call to a removed member such as writeImage fails here too.
// tests/desktop/r24-electron-api-guard.test.ts checks the same against the installed declaration file.
class SyntheticClipboardItem{readonly types:string[];constructor(readonly items:Record<string,unknown>){this.types=Object.keys(items);}async getType(type:string){return this.items[type];}}
const mainSource=readFileSync('electron/main.cjs','utf8'),preloadSource=readFileSync('electron/preload.cjs','utf8');
const validation=createRequire(import.meta.url)('../../electron/validation.cjs');
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
async function boot(image:{empty?:boolean}={}){
 const handlers=new Map<string,(event:unknown,value?:unknown)=>Promise<any>>();
 const app=Object.assign(new EventEmitter(),{requestSingleInstanceLock:()=>true,quit:vi.fn(),getPath:()=> 'C:\\Synthetic\\Profile',getAppPath:()=> 'C:\\Synthetic\\app.asar',whenReady:()=>Promise.resolve(),commandLine:{appendSwitch:vi.fn()},setPath:vi.fn()});
 const frame={url:'lv://app/index.html'};
 const web=Object.assign(new EventEmitter(),{setWindowOpenHandler:vi.fn(),isLoading:()=>false,isDestroyed:()=>false,isCrashed:()=>false,mainFrame:frame,send:vi.fn()});
 class Window extends EventEmitter{webContents=web;show=vi.fn();loadURL=vi.fn(async()=>{});isDestroyed=()=>false;close=vi.fn();}
 const decoded:Buffer[]=[];
 const clipboard={clear:vi.fn(),has:vi.fn(async()=>false),read:vi.fn(async()=>[]),readText:vi.fn(async()=>''),write:vi.fn(async(_items:SyntheticClipboardItem[])=>{}),writeText:vi.fn(async()=>{})};
 const nativeImage={createFromBuffer:vi.fn((bytes:Buffer)=>{decoded.push(bytes);return{isEmpty:()=>!!image.empty,getSize:()=>({width:1,height:1})};})};
 const electron={app,BrowserWindow:Window,Menu:{setApplicationMenu:vi.fn()},protocol:{registerSchemesAsPrivileged:vi.fn(),handle:vi.fn()},safeStorage:{isEncryptionAvailable:()=>true},clipboard,ClipboardItem:SyntheticClipboardItem,nativeImage,
  session:{defaultSession:{setPermissionRequestHandler:vi.fn(),setPermissionCheckHandler:vi.fn(),on:vi.fn(),webRequest:{onBeforeRequest:vi.fn()}}},
  ipcMain:{handle:(name:string,fn:any)=>handlers.set(name,fn)},dialog:{showErrorBox:vi.fn(),showSaveDialog:vi.fn()},utilityProcess:{}};
 const require=(name:string):any=>{
  if(name==='electron')return electron;
  if(name==='node:path')return path;
  if(name==='node:fs/promises')return{writeFile:vi.fn()};
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
 return{handlers,clipboard,nativeImage,decoded,dialog:electron.dialog,web,trusted:{sender:web,senderFrame:frame}};
}

it('writes a validated PNG to the clipboard for the app window only, and saves nothing',async()=>{
 const b=await boot(),copy=b.handlers.get('lv:chart:copy')!;
 expect(copy).toBeTypeOf('function');
 expect(await copy({sender:new EventEmitter(),senderFrame:{url:'https://evil.example/'}},{pngDataUrl:PNG})).toMatchObject({ok:false,error:{code:'DENIED'}});
 expect(b.clipboard.write).not.toHaveBeenCalled();
 const result=await copy(b.trusted,{pngDataUrl:PNG});
 expect(result).toEqual({ok:true,value:{bytes:b.decoded[0].length,width:1,height:1}});
 expect([...b.decoded[0].subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
 expect(b.clipboard.write).toHaveBeenCalledTimes(1);
 const [items]=b.clipboard.write.mock.calls[0];expect(items).toHaveLength(1);expect(items[0]).toBeInstanceOf(SyntheticClipboardItem);expect(items[0].types).toEqual(['image/png']);
 const blob=await items[0].getType('image/png') as Blob;expect(blob).toBeInstanceOf(Blob);expect(blob.type).toBe('image/png');
 expect(Buffer.from(await blob.arrayBuffer()).equals(b.decoded[0]),'the clipboard carries exactly the validated, decoded PNG bytes').toBe(true);
 expect(b.clipboard.writeText).not.toHaveBeenCalled();
 expect(b.dialog.showSaveDialog).not.toHaveBeenCalled();
});
it('rejects anything but a bounded PNG data URL, and an image the OS cannot decode, without touching the clipboard',async()=>{
 const b=await boot(),copy=b.handlers.get('lv:chart:copy')!;
 for(const value of [undefined,{},{pngDataUrl:PNG,suggestedName:'x.png'},{pngDataUrl:'data:image/jpeg;base64,AAAA'},{pngDataUrl:'data:image/png;base64,AAAAAAAAAAAAAAAA'},{pngDataUrl:'https://example.invalid/a.png'}])
  expect(await copy(b.trusted,value)).toMatchObject({ok:false,error:{code:'INVALID_ARGUMENT'}});
 const empty=await boot({empty:true});
 expect(await empty.handlers.get('lv:chart:copy')!(empty.trusted,{pngDataUrl:PNG})).toMatchObject({ok:false,error:{code:'INVALID_ARGUMENT',message:'The chart image could not be read.'}});
 expect(b.clipboard.write).not.toHaveBeenCalled();expect(empty.clipboard.write).not.toHaveBeenCalled();
});
it('a refused clipboard write is reported, not claimed as copied',async()=>{
 const b=await boot();b.clipboard.write.mockRejectedValueOnce(new Error('Synthetic clipboard refusal'));
 const result=await b.handlers.get('lv:chart:copy')!(b.trusted,{pngDataUrl:PNG});
 expect(result.ok).toBe(false);
});
it('preload exposes a data-only copy call on the fixed channel',async()=>{
 let exposed:any;const invoke=vi.fn(async()=>({ok:true}));
 const electron={contextBridge:{exposeInMainWorld:(_n:string,api:any)=>{exposed=api;}},ipcRenderer:{invoke,on:vi.fn(),removeListener:vi.fn()}};
 runInNewContext(preloadSource,{require:(name:string)=>{if(name==='electron')return electron;throw Error('Unexpected dependency '+name);},Object,Promise,TypeError});
 await exposed.copyChartImage({pngDataUrl:PNG});
 expect(invoke.mock.calls).toEqual([['lv:chart:copy',{pngDataUrl:PNG}]]);
});

it('the bridge, preload and main process carry only PNG data on a fixed trusted channel; the renderer stays connect-src none',()=>{
 const preload=readFileSync('electron/preload.cjs','utf8'),main=readFileSync('electron/main.cjs','utf8'),types=readFileSync('electron/bridge.d.ts','utf8');
 expect(preload).toMatch(/copyChartImage:\s*value\s*=>\s*invoke\('lv:chart:copy',\s*value\)/);
 expect(types).toMatch(/copyChartImage\?\(input:\{pngDataUrl:string\}\)/);
 expect(main).toMatch(/'lv:chart:copy':/);
 expect(main).toMatch(/connect-src 'none'/);
});
