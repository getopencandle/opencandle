import {afterEach,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {readFileSync,mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {AlpacaLiveProvider,preferAlpacaDailySession,selectAlpacaSyntheticStub} from '../../src/domain/alpaca-live';
import {SymbolMathProvider} from '../../src/domain/symbol-math-live';
import type {Bar} from '../../src/domain/types';
import {clearLiveDatasets} from '../../src/ui/live-registry';

// on the real keyless path, on a controlled clock: the real electron/main.cjs (Electron mocked
// LV_ALPACA_STUB=synthetic, a throwaway profile in the OS temp folder), the real preload, the real alpaca-stub (REST and
// socket) and the real public-alpaca stream client, the real AlpacaLiveProvider and SymbolMathProvider (the / derived
// harness). Only the clock is injected, through the `now` and `tickMs` options those modules already take; the test calls
// the stub socket's own tick and the stream client's own flush. SYNTHETIC data, no key, no network.
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const mainFile=path.resolve('electron/main.cjs');
const realRequire=createRequire(mainFile);
async function boot(clock:{ms:number}){
  const profileDir=mkdtempSync(path.join(realpathSync.native(os.tmpdir()),'lv-r37-derived-'));
  const handlers=new Map<string,(event:unknown,value?:unknown)=>Promise<any>>();
  const app=Object.assign(new EventEmitter(),{isPackaged:false,requestSingleInstanceLock:()=>true,quit:vi.fn(),getPath:()=>profileDir,getAppPath:()=>profileDir,whenReady:()=>Promise.resolve(),commandLine:{appendSwitch:vi.fn()},setPath:vi.fn()});
  const frame={url:'lv://app/index.html'};
  const listeners=new Map<string,Set<(event:unknown,value:unknown)=>void>>();
  const web=Object.assign(new EventEmitter(),{setWindowOpenHandler:vi.fn(),isLoading:()=>false,isDestroyed:()=>false,isCrashed:()=>false,mainFrame:frame,send:(channel:string,value:unknown)=>{for(const fn of listeners.get(channel)??[])fn({},value);}});
  class Window extends EventEmitter{webContents=web;show=vi.fn();loadURL=vi.fn(async()=>{});isDestroyed=()=>false;close=vi.fn();}
  const electron={app,BrowserWindow:Window,Menu:{setApplicationMenu:vi.fn()},protocol:{registerSchemesAsPrivileged:vi.fn(),handle:vi.fn()},safeStorage:{isEncryptionAvailable:()=>true},
    session:{defaultSession:{setPermissionRequestHandler:vi.fn(),setPermissionCheckHandler:vi.fn(),on:vi.fn(),webRequest:{onBeforeRequest:vi.fn()}}},
    ipcMain:{handle:(name:string,fn:any)=>handlers.set(name,fn)},dialog:{showErrorBox:vi.fn()},utilityProcess:{}};
  const now=()=>clock.ms,sockets:any[]=[],feeds:any[]=[],wire:any[]=[];
  // The real modules, with the controlled clock passed through their own options.
  const stubModule=realRequire('./alpaca-stub.cjs'),alpacaModule=realRequire('./public-alpaca.cjs');
  const stub={...stubModule,alpacaStubTransport:(options:any)=>{
    const transport=stubModule.alpacaStubTransport({...options,now,tickMs:3600000});
    if(transport?.mode==='synthetic'){const Socket=transport.WebSocket;transport.WebSocket=class extends Socket{constructor(url:string){super(url);sockets.push(this);}deliver(items:any[]){wire.push(...items);super.deliver(items);}};}
    return transport;
  }};
  const alpaca={...alpacaModule,AlpacaMarketData:class extends alpacaModule.AlpacaMarketData{constructor(options:any){super({...options,now});feeds.push(this);}}};
  const require=(name:string):any=>{
    if(name==='electron')return electron;
    if(name==='./alpaca-stub.cjs')return stub;
    if(name==='./public-alpaca.cjs')return alpaca;
    if(name==='./storage.cjs')return{WorkspaceStore:class{}};
    if(name==='./script-jobs.cjs')return{ScriptJobs:class{close(){}}};
    if(name==='./public-sec.cjs')return{SecCompanyFacts:class{close(){}}};
    if(name==='./import-data.cjs')return{titles:{},limits:{}};
    if(name==='./alert-webhook.cjs')return{postAlertWebhook:()=>({delivered:false,status:0,error:null}),alertWebhookInput:(v:any)=>v};if(name==='./alert-notify.cjs')return{showAlertNotification:()=>({shown:false}),alertNotificationInput:(v:any)=>v};
    if(name==='../build-identity.json')return{buildId:'synthetic'};
    if(name==='./startup-diagnostics.cjs')return{createStartupDiagnostics:()=>({record:()=>undefined}),safeCode:()=>null};
    return realRequire(name);
  };
  const errors:unknown[][]=[];
  runInNewContext(readFileSync(mainFile,'utf8'),{require,process:{argv:['--lv-profile='+profileDir],pid:1,env:{LV_ALPACA_STUB:'synthetic'}},__dirname:path.dirname(mainFile),console:{error:(...args:unknown[])=>errors.push(args)},setTimeout,clearTimeout,Buffer,Response,URL});
  for(let i=0;i<8;i++)await Promise.resolve();
  const invoke=(channel:string,value?:unknown)=>handlers.get(channel)!({sender:web,senderFrame:frame},value);
  let lv:any;
  const preload={contextBridge:{exposeInMainWorld:(_name:string,api:any)=>{lv=api;}},ipcRenderer:{invoke,on:(channel:string,fn:any)=>{if(!listeners.has(channel))listeners.set(channel,new Set());listeners.get(channel)!.add(fn);},removeListener:(channel:string,fn:any)=>listeners.get(channel)?.delete(fn)}};
  runInNewContext(readFileSync('electron/preload.cjs','utf8'),{require:(name:string)=>{if(name==='electron')return preload;throw Error('Unexpected dependency '+name);},Object,Promise,TypeError,String,Number,Array,Error});
  /** One stub socket tick `seconds` later: the trades of that second (and, at a minute boundary, the minute and daily bars), flushed to the renderer. */
  const step=async(seconds:number)=>{
    clock.ms+=seconds*1000;wire.length=0;
    for(const socket of sockets)if(!socket.closed)socket.tick();
    await pause(5);for(const feed of feeds)feed.flush();await flush();
    return [...wire];
  };
  return{lv,errors,sockets,feeds,step,close:async()=>{try{await invoke('lv:alpaca:unsubscribe');}catch{/* closed */}await pause(50);rmSync(profileDir,{recursive:true,force:true,maxRetries:3});}};
}
async function ready(main:{sockets:any[]},datasets:Array<()=>{bars:Bar[]}>){
  for(let i=0;i<200&&(!main.sockets.some(socket=>socket.authenticated&&socket.symbols.size)||datasets.some(read=>!read().bars.length));i++){await pause(10);await flush();}
  for(const read of datasets)expect(read().bars.length).toBeGreaterThan(0);
}
const lastOf=(bars:readonly Bar[])=>({...bars.at(-1)!});
afterEach(()=>{clearLiveDatasets();selectAlpacaSyntheticStub(false);preferAlpacaDailySession('extended');});

it('1D GME moves on each stub trade tick, and the minute boundary does not count volume twice (real stub path, controlled clock)',async()=>{
  // Thursday 2026-10-22 10:30:10 New York (regular session).
  const clock={ms:Date.UTC(2026,9,22,14,30,10)},main=await boot(clock);
  try{
    selectAlpacaSyntheticStub(true);
    const alpaca=new AlpacaLiveProvider(main.lv,{now:()=>clock.ms});
    const handle=alpaca.open('GME','1D');
    try{
      await ready(main,[handle.dataset]);
      let previous=lastOf(handle.dataset().bars);
      const day=previous.time;
      let changes=0;const off=handle.onChange(()=>changes++);
      for(let k=0;k<5;k++){
        const items=await main.step(1),t=items.find(item=>item.T==='t'&&item.S==='GME');
        expect(t).toBeTruthy();
        const now=lastOf(handle.dataset().bars);
        // The forming daily bar takes the trade itself: its price as the close, its size added once.
        expect(now.time).toBe(day);
        expect(now.close).toBe(t.p);
        expect(now.volume).toBe(previous.volume+t.s);
        expect(now.high).toBe(Math.max(previous.high,t.p));expect(now.low).toBe(Math.min(previous.low,t.p));
        previous=now;
      }
      expect(changes).toBe(5);
      // 10:31:00: the stub sends the trade of that second, the closed 10:30 minute bar and the published daily bar.
      const items=await main.step(45),t=items.find(item=>item.T==='t'&&item.S==='GME'),b=items.find(item=>item.T==='b'&&item.S==='GME'),d=items.find(item=>item.T==='d'&&item.S==='GME');
      expect(t&&b&&d).toBeTruthy();
      const after=lastOf(handle.dataset().bars);
      // The published bar replaces everything before 10:31 (the ticks and the 10:30 minute); the 10:31:00 trade stays on top, once.
      expect(after.volume).toBe(d.v+t.s);
      expect(after.volume).not.toBe(d.v+t.s+b.v);
      expect(after.close).toBe(t.p);
      expect(after.open).toBe(d.o);
      // And the next tick in the new minute adds only its own size.
      const next=await main.step(1),t2=next.find(item=>item.T==='t'&&item.S==='GME');
      expect(lastOf(handle.dataset().bars).volume).toBe(d.v+t.s+t2.s);
      off();
    }finally{await alpaca.flushBarCache();handle.close();alpaca.dispose();}
  }finally{await main.close();}
},60000);

it('extended-hours trades follow the session setting on 1D, and a derived 1D chart moves with its components (real stub path)',async()=>{
  // Thursday 2026-10-22 08:00:10 New York (pre-market).
  const clock={ms:Date.UTC(2026,9,22,12,0,10)},main=await boot(clock);
  try{
    selectAlpacaSyntheticStub(true);
    const alpaca=new AlpacaLiveProvider(main.lv,{now:()=>clock.ms});
    const handle=alpaca.open('GME','1D');
    const derived=new SymbolMathProvider((symbol,resolution)=>alpaca.open(symbol,resolution)).open('gme / spy','1D'),spyHandle=alpaca.open('SPY','1D');
    try{
      await ready(main,[handle.dataset,derived.dataset]);
      const published=lastOf(handle.dataset().bars);
      // Extended trading hours on (the default): a pre-market trade moves the daily bar.
      const first=(await main.step(1)).find(item=>item.T==='t'&&item.S==='GME');
      expect(lastOf(handle.dataset().bars)).toMatchObject({close:first.p,volume:published.volume+first.s});
      const g=handle.dataset().bars.at(-1)!,ratio=derived.dataset().bars.at(-1)!;
      expect(ratio.time).toBe(g.time);
      const spy=spyHandle.dataset().bars.at(-1)!;
      expect(ratio.close).toBeCloseTo(g.close/spy.close,12);
      // Off: the same pre-market trade no longer counts, and the next one leaves the bar alone.
      preferAlpacaDailySession('regular');
      expect(lastOf(handle.dataset().bars)).toMatchObject({close:published.close,volume:published.volume,high:published.high,low:published.low});
      const second=(await main.step(1)).find(item=>item.T==='t'&&item.S==='GME');
      expect(second).toBeTruthy();
      expect(lastOf(handle.dataset().bars)).toMatchObject({close:published.close,volume:published.volume});
      // On again: both pre-market trades fold back in, each once.
      preferAlpacaDailySession('extended');
      expect(lastOf(handle.dataset().bars)).toMatchObject({close:second.p,volume:published.volume+first.s+second.s});
    }finally{await alpaca.flushBarCache();handle.close();derived.close();spyHandle.close();alpaca.dispose();}
  }finally{await main.close();}
},60000);
