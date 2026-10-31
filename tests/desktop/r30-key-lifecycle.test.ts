import {afterAll,afterEach,describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,readdirSync,rmSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {AlpacaLiveProvider,selectAlpacaSyntheticStub,type AlpacaBridge} from '../../src/domain/alpaca-live';
import {LIVE_CACHED_NOTE,type BarCacheBridge} from '../../src/domain/live-cache';
import {describeStreamStatus,streamStatusAttributes} from '../../src/ui/LiveDataSettings';
import {launchMain,type Booted} from './r30-key-lifecycle-main';

// (risk 1): the Alpaca key lifecycle on the keyless stub, end to end through
// the real main process (electron/main.cjs in a VM with a mocked Electron), the real preload bridge, the real stub
// (LV_ALPACA_STUB=synthetic-lifecycle), the real AlpacaMarketData, corporate actions and bar cache, and the real renderer
// provider. Every credential here is SYNTHETIC: the stub's own STUB_KEYS and an invented wrong pair. The global fetch and
// WebSocket throw for the whole file, so nothing can reach a real endpoint. The profile is a fresh folder in the OS temp folder.
const require=createRequire(import.meta.url);
const stubModule=require('../../electron/alpaca-stub.cjs');
const {STUB_KEYS,LIFECYCLE_STATE_FILE}=stubModule;
const {AlpacaMarketData}=require('../../electron/public-alpaca.cjs');
const {AlpacaCorporateActions}=require('../../electron/public-alpaca-actions.cjs');
const mainSource=readFileSync('electron/main.cjs','utf8');
const WRONG=Object.freeze({keyId:'LVSYNTHETICWRONG0000',secret:'lv-synthetic-wrong-not-a-key-000000000'});
const KEY_REJECTED='Alpaca rejected the key.';

const profiles:string[]=[];
afterAll(()=>{for(const dir of profiles)rmSync(dir,{recursive:true,force:true});});
afterEach(()=>{vi.unstubAllGlobals();selectAlpacaSyntheticStub(false);});
const guards=()=>{const fetch=vi.fn(()=>{throw new Error('network used');}),Socket=vi.fn(()=>{throw new Error('socket used');});vi.stubGlobal('fetch',fetch);vi.stubGlobal('WebSocket',Socket);return{fetch,Socket};};
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const newProfile=()=>{const dir=mkdtempSync(path.join(os.tmpdir(),'lv-r30-keylife-'));profiles.push(dir);return dir;};

const bridgeOf=(lv:any)=>lv as AlpacaBridge&BarCacheBridge;
const stateFile=(profile:string)=>path.join(profile,LIFECYCLE_STATE_FILE);
const actionsFile=(profile:string,namespace:string,symbol:string)=>path.join(profile,'corporate-actions-cache',createHash('sha256').update('lv-corporate-actions-v1|'+namespace+'|'+symbol).digest('hex')+'.json');
/** Providers of every bar cache record on disk (the record key names its namespace). */
const cachedProviders=(profile:string)=>{const dir=path.join(profile,'market-data-cache');if(!existsSync(dir))return[];return readdirSync(dir).filter(name=>name!=='index.json'&&name.endsWith('.json')).map(name=>JSON.parse(readFileSync(path.join(dir,name),'utf8')).key.provider);};
/** Every file under the profile that could hold a credential, read as text. */
const profileText=(profile:string)=>{const out:string[]=[];const walk=(dir:string)=>{for(const entry of readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else out.push(readFileSync(file,'latin1'));}};walk(profile);return out.join('\n');};
const lastStatus=(b:Booted)=>b.events.filter(e=>e.kind==='status').at(-1)?.status;
const connects=(b:Booted)=>b.events.filter(e=>e.kind==='status'&&e.status.state==='connecting').length;

describe('stub selection',()=>{
 const TMP=os.tmpdir(),PROFILE=path.join(TMP,'lv-synthetic-profile');
 it('synthetic-lifecycle keeps every gate of the plain stub: throwaway profile, and the exe harness switch in a packaged build',()=>{
  const decide=(env:any,packaged:boolean,profile:string|null=PROFILE)=>stubModule.stubDecision({env,packaged,profile,tmpdir:TMP});
  expect(decide({LV_ALPACA_STUB:'synthetic-lifecycle'},false)).toEqual({mode:'synthetic',reason:null,lifecycle:true});
  expect(decide({LV_ALPACA_STUB:'synthetic-lifecycle'},true)).toMatchObject({mode:'blocked',reason:expect.stringContaining('LV_EXE_HARNESS=alpaca-stub')});
  expect(decide({LV_ALPACA_STUB:'synthetic-lifecycle',LV_EXE_HARNESS:'yes'},true).mode).toBe('blocked');
  expect(decide({LV_ALPACA_STUB:'synthetic-lifecycle',LV_EXE_HARNESS:'alpaca-stub'},true)).toEqual({mode:'synthetic',reason:null,lifecycle:true});
  for(const profile of [null,TMP,path.join(os.homedir(),'AppData','Roaming','LarryVision'),String.raw`C:\work\OpenCandle\local-data\demo-profile`])
   expect(decide({LV_ALPACA_STUB:'synthetic-lifecycle',LV_EXE_HARNESS:'alpaca-stub'},true,profile)).toMatchObject({mode:'blocked',reason:expect.stringContaining('throwaway profile')});
  // The plain stub is unchanged: no lifecycle flag, saves still refused.
  expect(decide({LV_ALPACA_STUB:'synthetic'},false)).toEqual({mode:'synthetic',reason:null});
  for(const value of ['lifecycle','synthetic-lifecycle ','SYNTHETIC-LIFECYCLE'])expect(decide({LV_ALPACA_STUB:value},false).mode).toBe('blocked');
 });
 it('a blocked lifecycle request blocks Alpaca like the plain stub: no key, saves refused, no request',async()=>{
  const blocked=stubModule.alpacaStubTransport({env:{LV_ALPACA_STUB:'synthetic-lifecycle'},packaged:true,profile:PROFILE,tmpdir:TMP});
  expect(blocked.mode).toBe('blocked');expect(blocked.lifecycle).toBeUndefined();
  expect(await blocked.keys.status()).toEqual({configured:false,keyIdHint:null,encryption:true});
  await expect(blocked.keys.save({...STUB_KEYS})).rejects.toMatchObject({code:'KEY_STORAGE_UNAVAILABLE'});
 });
 it('the lifecycle key store toggles configured, validates input with the real messages, and writes only "stub" or "none"',async()=>{
  const written:string[]=[];let file:string|null=null;
  const state={read:async()=>{if(file===null)throw Object.assign(Error('missing'),{code:'ENOENT'});return file;},write:async(text:string)=>{written.push(text);file=text;}};
  const stub=stubModule.alpacaStubTransport({env:{LV_ALPACA_STUB:'synthetic-lifecycle'},packaged:false,profile:PROFILE,tmpdir:TMP,state});
  expect(stub).toMatchObject({mode:'synthetic',lifecycle:true});
  expect(await stub.keys.status()).toEqual({configured:true,keyIdHint:'****STUB',encryption:true,synthetic:true});
  expect(await stub.keys.clear()).toEqual({configured:false,keyIdHint:null,encryption:true,synthetic:true});
  expect(await stub.keys.load()).toBeNull();
  await expect(stub.keys.save({keyId:'short',secret:'x'})).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
  expect(await stub.keys.save({...WRONG})).toEqual({configured:true,keyIdHint:'****0000',encryption:true,synthetic:true});
  expect(await stub.keys.load()).toEqual(WRONG);
  expect(await stub.keys.save({keyId:' '+STUB_KEYS.keyId+'\n',secret:'"'+STUB_KEYS.secret+'"'})).toEqual({configured:true,keyIdHint:'****STUB',encryption:true,synthetic:true});
  expect(written).toEqual(['{"v":1,"key":"none"}','{"v":1,"key":"none"}','{"v":1,"key":"stub"}']);
  for(const text of written){expect(text).not.toContain(WRONG.keyId);expect(text).not.toContain(WRONG.secret);expect(text).not.toContain(STUB_KEYS.secret);}
  // A relaunch reads the state file: "none" is no key, anything unreadable is the stub key.
  for(const [text,configured] of [['{"v":1,"key":"none"}',false],['{"v":1,"key":"stub"}',true],['not json',true],['{"v":2,"key":"none"}',true]] as const){
   file=text;const again=stubModule.alpacaStubTransport({env:{LV_ALPACA_STUB:'synthetic-lifecycle'},packaged:false,profile:PROFILE,tmpdir:TMP,state});
   expect((await again.keys.status()).configured).toBe(configured);
  }
 });
 it('only the stub credential gets REST data; any other gets 401 and the client shows the rejected-key text',async()=>{
  guards();
  let keys:any={...STUB_KEYS};
  const stub=stubModule.alpacaStubTransport({env:{LV_ALPACA_STUB:'synthetic-lifecycle'},packaged:false,profile:PROFILE,tmpdir:TMP,state:{read:async()=>'{"v":1,"key":"stub"}',write:async()=>{}}});
  const feed=new AlpacaMarketData({keys:{load:async()=>keys},fetchImpl:stub.fetch,WebSocketImpl:stub.WebSocket,restMinIntervalMs:0});
  const now=Math.floor(Date.now()/1000),input=(id:string)=>({requestId:id,symbol:'GME',timeframe:'1Day',feed:'iex',start:now-10*86400,end:now});
  expect((await feed.bars(input('ok'))).ok).toBe(true);
  keys={...WRONG};
  const refused=await feed.bars(input('wrong'));
  expect(refused).toMatchObject({ok:false,error:{code:'AUTH_FAILED',message:expect.stringContaining(KEY_REJECTED)}});
  expect(await feed.searchAssets({query:'GME'})).toMatchObject({ok:false,error:{code:'AUTH_FAILED'}});
  const actions=new AlpacaCorporateActions({keys:{load:async()=>keys},queue:(id:string,task:any)=>feed.queue(id,task),fetchImpl:stub.fetch,namespace:'alpaca-stub'});
  expect(await actions.load({requestId:'ca',symbol:'GME'})).toMatchObject({ok:false,error:{code:'AUTH_FAILED'}});
  feed.close();
 });
});

describe('corporate actions 429 starts the shared 60 s REST back-off',()=>{
 it('a 429 on corporate actions refuses the next bars request for 60 s without calling Alpaca, then lets it through',async()=>{
  let now=Date.UTC(2026,9,22,15);
  const calls:string[]=[];
  const json=(url:string,value:unknown,status=200)=>{const response=new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});Object.defineProperty(response,'url',{value:url});return response;};
  const fetchImpl=vi.fn(async(url:string)=>{calls.push(new URL(url).pathname);if(url.includes('/v1/corporate-actions'))return json(url,{message:'too many requests'},429);return json(url,{bars:[],symbol:'GME',next_page_token:null});});
  const keys={load:async()=>({...STUB_KEYS})};
  const feed=new AlpacaMarketData({keys,fetchImpl,restMinIntervalMs:0,now:()=>now});
  const actions=new AlpacaCorporateActions({keys,queue:(id:string,task:any)=>feed.queue(id,task),onRateLimit:()=>feed.holdRest(),fetchImpl,now:()=>now,namespace:'alpaca'});
  expect(await actions.load({requestId:'ca',symbol:'GME'})).toMatchObject({ok:false,error:{code:'RATE_LIMITED'}});
  const seconds=()=>Math.floor(now/1000),bars=(id:string)=>feed.bars({requestId:id,symbol:'GME',timeframe:'1Day',feed:'iex',start:seconds()-10*86400,end:seconds()});
  expect(await bars('b1')).toMatchObject({ok:false,error:{code:'RATE_LIMITED'}});
  expect(await actions.load({requestId:'ca2',symbol:'SPY'})).toMatchObject({ok:false,error:{code:'RATE_LIMITED'}});
  expect(calls).toEqual(['/v1/corporate-actions']);
  now+=59_000;expect(await bars('b2')).toMatchObject({ok:false,error:{code:'RATE_LIMITED'}});expect(calls).toHaveLength(1);
  now+=1_000;expect(await bars('b3')).toMatchObject({ok:true});expect(calls).toEqual(['/v1/corporate-actions','/v2/stocks/GME/bars']);
  feed.close();
 });
 it('main.cjs wires the corporate actions 429 to the bars back-off',()=>{
  expect(mainSource).toContain('queue:(requestId,task)=>alpacaFeed().queue(requestId,task),onRateLimit:()=>alpacaFeed().holdRest(),');
 });
});

describe('clear, wrong key, stub key, relaunch (main + preload + renderer provider)',()=>{
 it('walks the whole lifecycle with the stub namespaces only, no retry loop on the rejected key, and the key state kept across a relaunch',async()=>{
  const net=guards(),profile=newProfile();
  // ---- Launch 1: the stub key is saved (first launch). GME opens and ticks.
  let b=await launchMain(profile);
  expect(b.logged).toEqual(['OpenCandle: Alpaca uses the synthetic stub in key lifecycle mode (no network).']);
  const first=await b.lv.alpacaKeyStatus();
  expect(first).toEqual({ok:true,value:{configured:true,keyIdHint:'****STUB',encryption:true,synthetic:true}});
  selectAlpacaSyntheticStub(first.value.synthetic===true);
  let provider=new AlpacaLiveProvider(bridgeOf(b.lv));
  let gme=provider.open('GME','1m');
  expect(gme.datasetId).toBe('live:alpaca-stub:GME:1m');
  await vi.waitFor(()=>{expect(gme.dataset().bars.length).toBeGreaterThan(0);expect(gme.dataset().provenance.state).toBe('ready');},{timeout:8000,interval:50});
  let seen=gme.dataset();await vi.waitFor(()=>expect(gme.dataset()).not.toBe(seen),{timeout:5000,interval:50});
  const actions1=await b.lv.fetchAlpacaCorporateActions({requestId:'ca-1',symbol:'GME'});
  expect(actions1).toMatchObject({ok:true,value:{synthetic:true,cached:false,stale:false}});
  expect(actions1.value.events.length).toBeGreaterThan(0);expect(actions1.value.events.every((event:any)=>event.id.startsWith('SYNTHETIC'))).toBe(true);
  expect(existsSync(actionsFile(profile,'alpaca-stub','GME'))).toBe(true);
  await provider.flushBarCache();
  expect(cachedProviders(profile)).toEqual(['alpaca-stub']);

  // ---- Clear key: configured goes false (the renderer then closes GME to its Disconnected stand-in).
  expect(await b.lv.clearAlpacaKey()).toEqual({ok:true,value:{configured:false,keyIdHint:null,encryption:true,synthetic:true}});
  expect(JSON.parse(readFileSync(stateFile(profile),'utf8'))).toEqual({v:1,key:'none'});
  gme.close();
  await vi.waitFor(()=>expect(lastStatus(b)?.state).toBe('idle'),{timeout:4000,interval:50});
  const now=Math.floor(Date.now()/1000);
  expect(await b.lv.fetchAlpacaBars({requestId:'kr-1',symbol:'GME',timeframe:'1Min',feed:'iex',start:now-3600,end:now})).toMatchObject({ok:false,error:{code:'KEY_REQUIRED'}});
  expect(await b.lv.subscribeAlpaca({symbols:['GME']})).toMatchObject({ok:false,error:{code:'KEY_REQUIRED'}});
  // Today's stub corporate actions stay readable from the stub namespace; a symbol never read needs the key.
  expect(await b.lv.fetchAlpacaCorporateActions({requestId:'ca-2',symbol:'GME'})).toMatchObject({ok:true,value:{synthetic:true,cached:true}});
  expect(await b.lv.fetchAlpacaCorporateActions({requestId:'ca-3',symbol:'SPY'})).toMatchObject({ok:false,error:{code:'KEY_REQUIRED'}});
  expect(cachedProviders(profile)).toEqual(['alpaca-stub']);

  // ---- Save a wrong (SYNTHETIC) key: configured again, the reopened GME is refused with the rejected-key text, no retry loop.
  expect(await b.lv.saveAlpacaKey({...WRONG})).toEqual({ok:true,value:{configured:true,keyIdHint:'****0000',encryption:true,synthetic:true}});
  expect(JSON.parse(readFileSync(stateFile(profile),'utf8'))).toEqual({v:1,key:'none'});
  const connectsBefore=connects(b);
  gme=provider.open('GME','1m');
  await vi.waitFor(()=>expect(lastStatus(b)?.state).toBe('auth-failed'),{timeout:5000,interval:50});
  const rejected=lastStatus(b);
  expect(rejected.lastError).toContain(KEY_REJECTED);expect(rejected.lastError).toContain('(Alpaca code 402: auth failed)');
  // The Data sources line under the key.
  expect(describeStreamStatus(rejected)).toBe('Live stream stopped: '+rejected.lastError);
  expect((await b.lv.alpacaStatus()).value.state).toBe('auth-failed');
  await vi.waitFor(()=>expect(gme.dataset().provenance.notes.join(' ')).toContain(KEY_REJECTED),{timeout:5000,interval:50});
  // The bars cached under the stub namespace stay on screen, labelled cached and never ready (no ticket or alert uses them).
  expect(gme.dataset().provenance.state).toBe('error');expect(gme.dataset().provenance.notes).toContain(LIVE_CACHED_NOTE);
  const barsCalls=b.invoked.filter(channel=>channel==='lv:alpaca:bars').length;
  await pause(4500);// past the 2 s rekey pause and the 2 s first reconnect back-off
  expect(connects(b)-connectsBefore,'one stream attempt with the rejected key, never retried').toBe(1);
  expect(b.invoked.filter(channel=>channel==='lv:alpaca:bars').length,'no REST retry with the rejected key').toBe(barsCalls);
  expect(lastStatus(b).state).toBe('auth-failed');
  // The Data sources line's DOM hooks (what the exe flow reads): still stopped, the reconnect count unchanged.
  expect(streamStatusAttributes(lastStatus(b))).toMatchObject({'data-stream-state':'auth-failed','data-reconnects':String(rejected.counters.reconnects)});
  expect(await b.lv.fetchAlpacaCorporateActions({requestId:'ca-4',symbol:'SPY'})).toMatchObject({ok:false,error:{code:'AUTH_FAILED'}});
  expect(existsSync(actionsFile(profile,'alpaca-stub','SPY'))).toBe(false);
  expect(cachedProviders(profile)).toEqual(['alpaca-stub']);

  // ---- Save the stub key: the same GME feed (configured stays true, so the renderer does not reopen it) loads and ticks.
  expect(await b.lv.saveAlpacaKey({...STUB_KEYS})).toEqual({ok:true,value:{configured:true,keyIdHint:'****STUB',encryption:true,synthetic:true}});
  expect(JSON.parse(readFileSync(stateFile(profile),'utf8'))).toEqual({v:1,key:'stub'});
  await vi.waitFor(()=>expect(lastStatus(b)?.state).toBe('ready'),{timeout:6000,interval:50});
  await vi.waitFor(()=>{expect(gme.dataset().bars.length).toBeGreaterThan(0);expect(gme.dataset().provenance.state).toBe('ready');},{timeout:8000,interval:50});
  expect(gme.dataset().provenance.notes.join(' ')).not.toContain(KEY_REJECTED);
  seen=gme.dataset();await vi.waitFor(()=>expect(gme.dataset()).not.toBe(seen),{timeout:5000,interval:50});
  expect(await b.lv.fetchAlpacaCorporateActions({requestId:'ca-5',symbol:'SPY'})).toMatchObject({ok:true,value:{synthetic:true,cached:false}});
  await provider.flushBarCache();
  expect(new Set(cachedProviders(profile))).toEqual(new Set(['alpaca-stub']));
  gme.close();provider.dispose();b.quit();

  // ---- Relaunch on the same profile: still connected; GME reads the stub bar cache, then goes live.
  b=await launchMain(profile);
  const again=await b.lv.alpacaKeyStatus();
  expect(again).toEqual({ok:true,value:{configured:true,keyIdHint:'****STUB',encryption:true,synthetic:true}});
  provider=new AlpacaLiveProvider(bridgeOf(b.lv));gme=provider.open('GME','1m');
  await vi.waitFor(()=>{expect(gme.dataset().bars.length).toBeGreaterThan(0);expect(gme.dataset().provenance.state).toBe('ready');},{timeout:8000,interval:50});
  seen=gme.dataset();await vi.waitFor(()=>expect(gme.dataset()).not.toBe(seen),{timeout:5000,interval:50});
  expect(await b.lv.fetchAlpacaCorporateActions({requestId:'ca-6',symbol:'GME'})).toMatchObject({ok:true,value:{synthetic:true,cached:true}});
  gme.close();provider.dispose();b.quit();

  // Nothing under the real namespaces, no key text in the profile, never the network.
  expect(existsSync(actionsFile(profile,'alpaca','GME'))).toBe(false);expect(existsSync(actionsFile(profile,'alpaca','SPY'))).toBe(false);
  expect(cachedProviders(profile).every(provider=>provider==='alpaca-stub')).toBe(true);
  const text=profileText(profile);for(const secret of [WRONG.keyId,WRONG.secret,STUB_KEYS.keyId,STUB_KEYS.secret])expect(text).not.toContain(secret);
  expect(net.fetch).not.toHaveBeenCalled();expect(net.Socket).not.toHaveBeenCalled();
 },60000);
 it('a relaunch after Clear key starts with no key (still the stub namespace), and the plain stub still refuses saves',async()=>{
  guards();const profile=newProfile();
  let b=await launchMain(profile);
  expect((await b.lv.clearAlpacaKey()).value.configured).toBe(false);b.quit();
  b=await launchMain(profile);
  expect(await b.lv.alpacaKeyStatus()).toEqual({ok:true,value:{configured:false,keyIdHint:null,encryption:true,synthetic:true}});b.quit();
  const plain=await launchMain(newProfile(),{LV_ALPACA_STUB:'synthetic'});
  expect(plain.logged).toEqual(['OpenCandle: Alpaca uses the synthetic stub (no network).']);
  expect(await plain.lv.saveAlpacaKey({...STUB_KEYS})).toMatchObject({ok:false,error:{code:'KEY_STORAGE_UNAVAILABLE'}});
  expect(await plain.lv.clearAlpacaKey()).toMatchObject({ok:true,value:{configured:true}});plain.quit();
 });
});
