import {expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {readFileSync,mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {App} from '../../src/ui/App';
import {ChartEventMarkers} from '../../src/ui/ChartEventMarkers';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {clearLiveDatasets,registerLiveDataset} from '../../src/ui/live-registry';
import {persistableWorkspace} from '../../src/ui/live-workspace';
import {patchWorkspace} from '../../src/ui/workspace-grid';
import {alpacaSearchDatasets,selectAlpacaSyntheticStub,ALPACA_STUB_PROVIDER_ID} from '../../src/domain/alpaca-live';
import {newYorkDate} from '../../src/domain/chart-events';

// The whole keyless SYNTHETIC path in one process, with no network and no key. The real electron/main.cjs
// (mocked Electron objects, LV_ALPACA_STUB=synthetic, a throwaway profile in the OS temp folder) and the real preload give
// the renderer its window.lv; the real alpaca-stub, public-alpaca and public-alpaca-actions modules answer. The App (under
// controlled hooks) restores a stub GME 1D chart from a saved workspace, and its ChartEventMarkers element is rendered with
// the props App gave it and the default loader, so the markers come from main's /v1/corporate-actions answer.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return {...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}}};
});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test)??(node.props.dataSources?find(node.props.dataSources,test):null);}return null;}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

const mainFile=path.resolve('electron/main.cjs');
/** The real main entry on the synthetic stub, and the real preload bridge wired to its handlers as the trusted main window. */
async function boot(){
  const profileDir=mkdtempSync(path.join(realpathSync.native(os.tmpdir()),'lv-r28-events-'));
  const handlers=new Map<string,(event:unknown,value?:unknown)=>Promise<any>>();
  const app=Object.assign(new EventEmitter(),{isPackaged:false,requestSingleInstanceLock:()=>true,quit:vi.fn(),getPath:()=>profileDir,getAppPath:()=>profileDir,whenReady:()=>Promise.resolve(),commandLine:{appendSwitch:vi.fn()},setPath:vi.fn()});
  const frame={url:'lv://app/index.html'};
  const listeners=new Map<string,Set<(event:unknown,value:unknown)=>void>>();
  const web=Object.assign(new EventEmitter(),{setWindowOpenHandler:vi.fn(),isLoading:()=>false,isDestroyed:()=>false,isCrashed:()=>false,mainFrame:frame,send:(channel:string,value:unknown)=>{for(const fn of listeners.get(channel)??[])fn({},value);}});
  class Window extends EventEmitter{webContents=web;show=vi.fn();loadURL=vi.fn(async()=>{});isDestroyed=()=>false;close=vi.fn();}
  const electron={app,BrowserWindow:Window,Menu:{setApplicationMenu:vi.fn()},protocol:{registerSchemesAsPrivileged:vi.fn(),handle:vi.fn()},safeStorage:{isEncryptionAvailable:()=>true},
    session:{defaultSession:{setPermissionRequestHandler:vi.fn(),setPermissionCheckHandler:vi.fn(),on:vi.fn(),webRequest:{onBeforeRequest:vi.fn()}}},
    ipcMain:{handle:(name:string,fn:any)=>handlers.set(name,fn)},dialog:{showErrorBox:vi.fn()},utilityProcess:{}};
  const real=createRequire(mainFile),loaded:string[]=[];
  const require=(name:string):any=>{
    if(name==='electron')return electron;
    if(name==='./storage.cjs')return{WorkspaceStore:class{}};
    if(name==='./script-jobs.cjs')return{ScriptJobs:class{close(){}}};
    if(name==='./public-sec.cjs')return{SecCompanyFacts:class{close(){}}};
    if(name==='./import-data.cjs')return{titles:{},limits:{}};
    if(name==='./alert-webhook.cjs')return{postAlertWebhook:()=>({delivered:false,status:0,error:null}),alertWebhookInput:(v:any)=>v};if(name==='./alert-notify.cjs')return{showAlertNotification:()=>({shown:false}),alertNotificationInput:(v:any)=>v};
    if(name==='../build-identity.json')return{buildId:'synthetic'};
    if(name==='./startup-diagnostics.cjs')return{createStartupDiagnostics:()=>({record:()=>undefined}),safeCode:()=>null};
    loaded.push(name);return real(name);
  };
  const errors:unknown[][]=[];
  runInNewContext(readFileSync(mainFile,'utf8'),{require,process:{argv:['--lv-profile='+profileDir],pid:1,env:{LV_ALPACA_STUB:'synthetic'}},__dirname:path.dirname(mainFile),console:{error:(...args:unknown[])=>errors.push(args)},setTimeout,clearTimeout,Buffer,Response,URL});
  for(let i=0;i<8;i++)await Promise.resolve();
  const calls:Array<{channel:string;value:unknown}>=[];
  const invoke=(channel:string,value?:unknown)=>{calls.push({channel,value});return handlers.get(channel)!({sender:web,senderFrame:frame},value);};
  let lv:any;
  const preload={contextBridge:{exposeInMainWorld:(_name:string,api:any)=>{lv=api;}},ipcRenderer:{invoke,on:(channel:string,fn:any)=>{if(!listeners.has(channel))listeners.set(channel,new Set());listeners.get(channel)!.add(fn);},removeListener:(channel:string,fn:any)=>listeners.get(channel)?.delete(fn)}};
  runInNewContext(readFileSync('electron/preload.cjs','utf8'),{require:(name:string)=>{if(name==='electron')return preload;throw Error('Unexpected dependency '+name);},Object,Promise,TypeError,String,Number,Array,Error});
  return{lv,calls,loaded,errors,profileDir,close:async()=>{try{await invoke('lv:alpaca:unsubscribe');}catch{/* closed */}rmSync(profileDir,{recursive:true,force:true});}};
}

it('on the keyless stub, App mounts the markers for stub GME 1D and they render the SYNTHETIC dividends main sends',async()=>{
  const main=await boot();
  try{
    expect(main.errors.flat().join(' ')).toContain('synthetic stub');
    // A saved workspace with a stub GME 1D chart; the key status (synthetic) arrives from main after it is installed.
    selectAlpacaSyntheticStub(true);
    const shell=alpacaSearchDatasets(true,['GME'],'1D').find(row=>row.instrument.symbol==='GME')!;
    registerLiveDataset({...shell,bars:[]} as any);
    const safe=persistableWorkspace(patchWorkspace(createInitialWorkspace(),{symbol:'GME',sourceId:shell.provenance.datasetId})) as any;
    clearLiveDatasets();selectAlpacaSyntheticStub(false);
    const data=prepareWorkspaceJSON({...safe,paper:createPaperAccount({initialBalance:500}),alerts:[]});
    const bridge={...main.lv,loadWorkspace:async()=>({ok:true,value:{schemaVersion:1,revision:1,savedAt:'2026-10-22T00:00:00Z',data,storage:{directory:'Synthetic profile',backend:'json-atomic'}}}),saveWorkspace:async()=>({ok:true,value:{revision:2,savedAt:'2026-10-22T00:00:01Z'}})};
    vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});
    const render=()=>{hooks.cursor=0;return App();};render();const mounted=hooks.effects;hooks.effects=[];mounted[0]();await flush();
    find(render(),node=>node.type===WorkspaceChartHost)?.props.onTransactionReady({suspend:vi.fn(()=>({isCurrent:()=>true,resume:vi.fn()}))});render();
    for(const effect of mounted.slice(1))try{effect();}catch{/* effects for absent DOM ports */}
    const effects=async()=>{for(let i=0;i<3;i++){await pause(60);await flush();render();for(const effect of hooks.effects.splice(0))try{effect();}catch{/* absent DOM ports */}}};
    let node:any=null;
    for(let i=0;i<20&&!(node?.props.bars.length>=100);i++){await effects();node=find(render(),row=>row.type===ChartEventMarkers);}
    // App's mount condition: the stub chart is an Alpaca US stock, so it asks for GME's events, labelled SYNTHETIC.
    expect(node,'ChartEventMarkers is mounted on the active chart').toBeTruthy();
    expect(node.props.symbol).toBe('GME');
    expect(node.props.synthetic).toBe(true);
    expect(node.props.settings).toEqual({dividends:true,splits:true});
    expect(node.props.sourceKey).toBe('live:'+ALPACA_STUB_PROVIDER_ID+':GME:1D');
    expect(typeof node.props.onDiagnostic).toBe('function');
    expect(node.props.bars.length).toBe(300);
    const props={...node.props,projection:()=>({left:0,top:0,width:4000,height:400}),timeToX:(seconds:number)=>(seconds-node.props.bars[0].time)/86400*12};
    // The layer itself, on the default loader (window.lv -> preload -> main -> stub).
    hooks.cells=[];hooks.effects=[];
    vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
    const layer=()=>{hooks.cursor=0;return ChartEventMarkers(props) as any;};
    let element=layer();
    expect(element.props['data-lv-chart-events-state']).toBe('loading');
    for(let i=0;i<40&&element?.props['data-lv-chart-events-state']==='loading';i++){for(const effect of hooks.effects.splice(0))effect();await pause(50);await flush();element=layer();}
    for(const effect of hooks.effects.splice(0))effect();element=layer();
    const asked=main.calls.filter(row=>row.channel==='lv:alpaca:corporate-actions');
    expect(asked).toHaveLength(1);
    expect(Object.keys(asked[0].value as object).sort()).toEqual(['requestId','symbol']);
    expect((asked[0].value as {symbol:string}).symbol).toBe('GME');
    expect(main.loaded).toContain('./public-alpaca-actions.cjs');
    expect(element.props['data-lv-chart-events-state'],element.props.title).toBe('ok');
    expect(element.props['aria-label']).toBe('SYNTHETIC splits and dividends');
    const badges=element.props.children[0] as any[];
    // 300 stub days always hold at least two quarterly dividends; each badge sits on a loaded bar of its ex-date.
    expect(badges.length).toBeGreaterThanOrEqual(2);
    expect(element.props['data-lv-chart-events']).toBe(badges.length);
    const times=new Set(node.props.bars.map((bar:{time:number})=>bar.time));
    for(const badge of badges){
      expect(badge.props['aria-label']).toMatch(/^SYNTHETIC (Dividend|Split|Reverse split)\. /);
      expect(badge.props['aria-label']).toContain('Invented by the synthetic stub; not market data.');
      expect(times.has(badge.props['data-bar-time'])).toBe(true);
      const exDate=/Ex-date: ([A-Z][a-z]{2} \d+, \d{4})/.exec(badge.props['aria-label'])![1];
      expect(new Date(exDate+' 12:00 UTC').toISOString().slice(0,10)).toBe(newYorkDate(badge.props['data-bar-time']));
    }
    expect(badges.filter(badge=>badge.props['data-lv-chart-event']==='dividend').length).toBeGreaterThanOrEqual(2);
  }finally{vi.unstubAllGlobals();await main.close();}
},60000);
