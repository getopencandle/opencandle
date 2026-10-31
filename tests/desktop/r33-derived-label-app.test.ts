import {afterEach,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {readFileSync,mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {App} from '../../src/ui/App';
import {SymbolSearchDialog} from '../../src/ui/SymbolSearchDialog';
import {HeaderSymbolButton} from '../../src/ui/HeaderSymbolButton';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {clearLiveDatasets} from '../../src/ui/live-registry';
import {switchRequest} from '../../src/ui/symbol-search';
import {selectAlpacaSyntheticStub} from '../../src/domain/alpaca-live';
import {SYMBOL_MATH_PROVIDER_ID} from '../../src/domain/symbol-math-live';

// The packaged r29 build opened stub GME/SPY with the heading title "Synthetic fixture · 300 bars ·
// split-adjusted adjustment; unknown session · No live connection": no source named, and "No live connection" while two
// live stub feeds drive it. Same keyless path as and, in one process, no network, no key
// the real electron/main.cjs (Electron mocked, LV_ALPACA_STUB=synthetic, throwaway profile in the OS temp folder), the real
// preload and the real alpaca-stub. The real App (under controlled hooks) opens the Derived row from Symbol search, and the
// test reads the chart heading element App renders.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return {...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}}};
});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test)??(node.props.dataSources?find(node.props.dataSources,test):null);}return null;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

const mainFile=path.resolve('electron/main.cjs');
async function boot(){
  const profileDir=mkdtempSync(path.join(realpathSync.native(os.tmpdir()),'lv-r33-label-'));
  const handlers=new Map<string,(event:unknown,value?:unknown)=>Promise<any>>();
  const app=Object.assign(new EventEmitter(),{isPackaged:false,requestSingleInstanceLock:()=>true,quit:vi.fn(),getPath:()=>profileDir,getAppPath:()=>profileDir,whenReady:()=>Promise.resolve(),commandLine:{appendSwitch:vi.fn()},setPath:vi.fn()});
  const frame={url:'lv://app/index.html'};
  const listeners=new Map<string,Set<(event:unknown,value:unknown)=>void>>();
  const web=Object.assign(new EventEmitter(),{setWindowOpenHandler:vi.fn(),isLoading:()=>false,isDestroyed:()=>false,isCrashed:()=>false,mainFrame:frame,send:(channel:string,value:unknown)=>{for(const fn of listeners.get(channel)??[])fn({},value);}});
  class Window extends EventEmitter{webContents=web;show=vi.fn();loadURL=vi.fn(async()=>{});isDestroyed=()=>false;close=vi.fn();}
  const electron={app,BrowserWindow:Window,Menu:{setApplicationMenu:vi.fn()},protocol:{registerSchemesAsPrivileged:vi.fn(),handle:vi.fn()},safeStorage:{isEncryptionAvailable:()=>true},
    session:{defaultSession:{setPermissionRequestHandler:vi.fn(),setPermissionCheckHandler:vi.fn(),on:vi.fn(),webRequest:{onBeforeRequest:vi.fn()}}},
    ipcMain:{handle:(name:string,fn:any)=>handlers.set(name,fn)},dialog:{showErrorBox:vi.fn()},utilityProcess:{}};
  const real=createRequire(mainFile);
  const require=(name:string):any=>{
    if(name==='electron')return electron;
    if(name==='./storage.cjs')return{WorkspaceStore:class{}};
    if(name==='./script-jobs.cjs')return{ScriptJobs:class{close(){}}};
    if(name==='./public-sec.cjs')return{SecCompanyFacts:class{close(){}}};
    if(name==='./import-data.cjs')return{titles:{},limits:{}};
    if(name==='./alert-webhook.cjs')return{postAlertWebhook:()=>({delivered:false,status:0,error:null}),alertWebhookInput:(v:any)=>v};if(name==='./alert-notify.cjs')return{showAlertNotification:()=>({shown:false}),alertNotificationInput:(v:any)=>v};
    if(name==='../build-identity.json')return{buildId:'synthetic'};
    if(name==='./startup-diagnostics.cjs')return{createStartupDiagnostics:()=>({record:()=>undefined}),safeCode:()=>null};
    return real(name);
  };
  const errors:unknown[][]=[];
  runInNewContext(readFileSync(mainFile,'utf8'),{require,process:{argv:['--lv-profile='+profileDir],pid:1,env:{LV_ALPACA_STUB:'synthetic'}},__dirname:path.dirname(mainFile),console:{error:(...args:unknown[])=>errors.push(args)},setTimeout,clearTimeout,Buffer,Response,URL});
  for(let i=0;i<8;i++)await Promise.resolve();
  const invoke=(channel:string,value?:unknown)=>handlers.get(channel)!({sender:web,senderFrame:frame},value);
  let lv:any;
  const preload={contextBridge:{exposeInMainWorld:(_name:string,api:any)=>{lv=api;}},ipcRenderer:{invoke,on:(channel:string,fn:any)=>{if(!listeners.has(channel))listeners.set(channel,new Set());listeners.get(channel)!.add(fn);},removeListener:(channel:string,fn:any)=>listeners.get(channel)?.delete(fn)}};
  runInNewContext(readFileSync('electron/preload.cjs','utf8'),{require:(name:string)=>{if(name==='electron')return preload;throw Error('Unexpected dependency '+name);},Object,Promise,TypeError,String,Number,Array,Error});
  return{lv,errors,close:async()=>{try{await invoke('lv:alpaca:unsubscribe');}catch{/* closed */}rmSync(profileDir,{recursive:true,force:true});}};
}
afterEach(()=>{vi.unstubAllGlobals();clearLiveDatasets();selectAlpacaSyntheticStub(false);hooks.cells=[];hooks.effects=[];});

it('the heading of stub GME/SPY opened from Symbol search names GME and SPY, the SYNTHETIC stub, and the live state',async()=>{
  const main=await boot();
  try{
    expect(main.errors.flat().join(' ')).toContain('synthetic stub');
    const data=prepareWorkspaceJSON({...createInitialWorkspace(),paper:createPaperAccount({initialBalance:500}),alerts:[]});
    const bridge={...main.lv,loadWorkspace:async()=>({ok:true,value:{schemaVersion:1,revision:1,savedAt:'2026-10-22T00:00:00Z',data,storage:{directory:'Synthetic profile',backend:'json-atomic'}}}),saveWorkspace:async()=>({ok:true,value:{revision:2,savedAt:'2026-10-22T00:00:01Z'}})};
    vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});
    hooks.cells=[];hooks.effects=[];
    const render=()=>{hooks.cursor=0;return App();};render();const mounted=hooks.effects;hooks.effects=[];mounted[0]();await flush();
    find(render(),node=>node.type===WorkspaceChartHost)?.props.onTransactionReady({suspend:vi.fn(()=>({isCurrent:()=>true,resume:vi.fn()}))});render();
    for(const effect of mounted.slice(1))try{effect();}catch{/* effects for absent DOM ports */}
    const effects=async()=>{for(let i=0;i<3;i++){await pause(30);await flush();render();for(const effect of hooks.effects.splice(0))try{effect();}catch{/* absent DOM ports */}}};
    await effects();
    // Symbol search, typed GME/SPY: the Derived row, chosen as the flow does.
    find(render(),node=>node.type===HeaderSymbolButton).props.onOpen('','toolbar');await effects();
    const search=find(render(),node=>node.type===SymbolSearchDialog).props;
    const row=search.typedCandidates('GME/SPY',search.candidates).find((item:any)=>item.providerId===SYMBOL_MATH_PROVIDER_ID);
    expect(row,'a Derived GME/SPY row').toBeTruthy();
    expect(search.onSelect(switchRequest(row,'toolbar'))).toBe(true);
    let heading:any=null;
    for(let i=0;i<40;i++){await effects();heading=find(render(),node=>node.props?.className==='chart-heading');if(/[1-9]\d\d bars/.test(String(heading?.props.title)))break;}
    const title=String(heading.props.title),badge=text(find(heading,node=>node.type==='b'&&node.props.className==='synthetic-badge'));
    // It names the expression and every component's source, says SYNTHETIC, and never "No live connection".
    expect(title).toMatch(/^SYNTHETIC Derived \(symbol math\) GME\/SPY · from GME and SPY: SYNTHETIC Alpaca stub \(invented prices\) · [1-9]\d\d bars · /);
    expect(title).not.toContain('No live connection');
    expect(title).not.toContain('Synthetic fixture');
    expect(title).toMatch(/ · Synthetic (Live|Market closed|Connecting|Delayed)$/);
    expect(badge).toMatch(/^SYNTHETIC DERIVED · (LIVE|MARKET CLOSED|CONNECTING|DELAYED)$/);
  }finally{await main.close();}
},60000);
