import {expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import path from 'node:path';

// Execute the actual main entry with controlled Electron events. This does not
// launch a process, observe a window or certify packaged startup.
const source=readFileSync('electron/main.cjs','utf8');
async function boot(options:{owns?:boolean;loadFails?:boolean;diagnosticFails?:boolean}={}){
 const records:Array<{event:string;details:any}>=[],writes=vi.fn(),showErrorBox=vi.fn();
 const app=Object.assign(new EventEmitter(),{
  requestSingleInstanceLock:()=>options.owns!==false,
  quit:vi.fn(),getPath:()=> 'C:\\Synthetic\\Profile',
  getAppPath:()=> 'C:\\Synthetic\\app.asar',whenReady:()=>Promise.resolve(),
  commandLine:{appendSwitch:vi.fn()},setPath:vi.fn()
 });
 const web=Object.assign(new EventEmitter(),{setWindowOpenHandler:vi.fn(),isLoading:()=>false,isDestroyed:()=>false,isCrashed:()=>false,send:vi.fn()});
 let window:any;
 class Window extends EventEmitter{
  webContents=web;show=vi.fn();focus=vi.fn();restore=vi.fn();isMinimized=()=>false;isDestroyed=()=>false;close=vi.fn();
  loadURL=vi.fn(async()=>{if(options.loadFails)throw Error('Synthetic private URL must not be recorded');});
  constructor(_options:unknown){super();window=this;}
 }
 class Store {constructor(_directory:string){}}
 class Jobs {close=vi.fn();}
 const diagnosticFactory=vi.fn((input:unknown)=>{if(options.diagnosticFails)throw Error('Synthetic unavailable diagnostics');writes(input);return{record:(event:string,details?:unknown)=>records.push({event,details})};});
 const electron={app,BrowserWindow:Window,Menu:{setApplicationMenu:vi.fn()},protocol:{registerSchemesAsPrivileged:vi.fn(),handle:vi.fn()},
  session:{defaultSession:{setPermissionRequestHandler:vi.fn(),setPermissionCheckHandler:vi.fn(),on:vi.fn(),webRequest:{onBeforeRequest:vi.fn()}}},
  ipcMain:{handle:vi.fn()},dialog:{showErrorBox},utilityProcess:{}};
 const require=(name:string):any=>{
  if(name==='electron')return electron;
  if(name==='node:path')return path;
  if(name==='node:fs/promises')return{};
  if(name==='./storage.cjs')return{WorkspaceStore:Store};
  if(name==='./script-jobs.cjs')return{ScriptJobs:Jobs};
  if(name==='./public-sec.cjs')return{SecCompanyFacts:Jobs};
  if(name==='./alert-webhook.cjs')return{postAlertWebhook:()=>({delivered:false,status:0,error:null}),alertWebhookInput:(v:any)=>v};if(name==='./alert-notify.cjs')return{showAlertNotification:vi.fn(),alertNotificationInput:(value:unknown)=>value};
  if(name==='./import-data.cjs')return{titles:{},limits:{}};
  if(name==='./validation.cjs')return{};
  if(name==='../build-identity.json')return{buildId:'20261015T152628354Z-4cb3f959a429'};
  if(name==='./startup-diagnostics.cjs')return{createStartupDiagnostics:diagnosticFactory,safeCode:(v:unknown)=>typeof v==='number'&&Number.isInteger(v)&&v>=-2147483648&&v<=4294967295?v:null};
  throw Error('Unexpected dependency '+name);
 };
 runInNewContext(source,{require,process:{argv:[]},__dirname:'C:\\Synthetic\\electron',console:{error:vi.fn()},setTimeout,clearTimeout,Buffer,Response});
 for(let i=0;i<8;i++)await Promise.resolve();
 return{app,web,window,records,diagnosticFactory,showErrorBox};
}

it('records owned startup stages without treating document load as observed workspace',async()=>{
 const b=await boot();expect(b.records.map(r=>r.event)).toEqual(['start','ready','window-created','load-finished']);
 expect(b.window.show).not.toHaveBeenCalled();b.window.emit('ready-to-show');
 expect(b.window.show).toHaveBeenCalledOnce();expect(b.records.at(-1)?.event).toBe('ready-to-show');
 expect(b.diagnosticFactory).toHaveBeenCalledWith({userDataPath:'C:\\Synthetic\\Profile',ownsProfile:true,buildId:'20261015T152628354Z-4cb3f959a429'});
});
it('secondary instance neither initializes diagnostics nor opens a new window',async()=>{
 const b=await boot({owns:false});expect(b.app.quit).toHaveBeenCalledOnce();
 expect(b.diagnosticFactory).not.toHaveBeenCalled();expect(b.records).toEqual([]);expect(b.window).toBeUndefined();
});
it('diagnostic initialization failure does not prevent normal startup',async()=>{
 const b=await boot({diagnosticFails:true});expect(b.diagnosticFactory).toHaveBeenCalledOnce();
 expect(b.records).toEqual([]);expect(b.showErrorBox).not.toHaveBeenCalled();
 expect(b.window.loadURL).toHaveBeenCalledWith('lv://app/index.html');
});
it('records failed local loading and reports a fixed code',async()=>{
 const b=await boot({loadFails:true});expect(b.records.map(r=>r.event)).toEqual(['start','ready','window-created','load-failed','startup-failed']);
 expect(b.showErrorBox).toHaveBeenCalledOnce();expect(b.showErrorBox.mock.calls[0][1]).toContain('LOCAL_RESOURCE_LOAD_FAILED');
 expect(JSON.stringify(b.records)).not.toContain('private URL');
});
it('records abnormal owned renderer exit and closes once; foreign renderer is ignored',async()=>{
 const b=await boot(),details={reason:'crashed',exitCode:3221225781};
 b.app.emit('render-process-gone',{}, {},details);expect(b.records.some(r=>r.event==='renderer-gone')).toBe(false);
 b.app.emit('render-process-gone',{},b.web,details);b.app.emit('render-process-gone',{},b.web,details);
 expect(b.records.filter(r=>r.event==='renderer-gone')).toHaveLength(2);
 expect(b.showErrorBox).toHaveBeenCalledOnce();expect(b.app.quit).toHaveBeenCalledOnce();
 expect(b.showErrorBox.mock.calls[0][1]).toContain('RENDER_PROCESS_3221225781');
});
it.each(['before-quit','window-close','clean-exit'])('does not report ordinary %s as a renderer crash',async kind=>{
 const b=await boot();if(kind==='before-quit')b.app.emit('before-quit');if(kind==='window-close')b.window.emit('close');
 b.app.emit('render-process-gone',{},b.web,{reason:kind==='clean-exit'?'clean-exit':'killed',exitCode:0});
 expect(b.showErrorBox).not.toHaveBeenCalled();expect(b.records.some(r=>r.event==='renderer-gone')).toBe(true);
});
it('records native child exit and preserves unknown numeric code without string coercion',async()=>{
 const b=await boot();let coercions=0;const code={toString(){coercions++;return 'private synthetic payload';}};
 b.app.emit('child-process-gone',{}, {type:'GPU',reason:'crashed',exitCode:code});
 expect(coercions).toBe(0);expect(b.records.some(r=>r.event==='child-gone')).toBe(true);
 expect(b.showErrorBox.mock.calls[0][1]).toContain('GRAPHICS_PROCESS_UNKNOWN');
});
