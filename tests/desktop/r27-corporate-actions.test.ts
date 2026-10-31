import {createRequire} from 'node:module';
import {mkdtemp,readdir,readFile,rm,writeFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

// The main-process corporate actions reader on a mocked fetch and a throwaway temp cache folder. No key, no network:
// the key store and every response are SYNTHETIC.
const require=createRequire(import.meta.url);
const {AlpacaCorporateActions,ACTIONS_CACHE_DIRECTORY,actionsInput,actionsUrl,validateActions}=require('../../electron/public-alpaca-actions.cjs');
const {alpacaStubTransport,STUB_SPLIT_DAY}=require('../../electron/alpaca-stub.cjs');

const KEYS={keyId:'SYNTHETICKEY0000ABCD',secret:'SyntheticSecretNotARealKey0000000000000000'};
const keys={load:async()=>({...KEYS})};
const NOW=Date.parse('2026-10-22T16:00:00Z');
const json=(url:string,value:unknown,status=200)=>{const response=new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});Object.defineProperty(response,'url',{value:url});return response;};
const page1={corporate_actions:{forward_splits:[{id:'SYN-S1',symbol:'GME',new_rate:4,old_rate:1,ex_date:'2022-07-22',record_date:'2022-07-18',payable_date:'2022-07-21',process_date:'2022-07-22'}],
 cash_dividends:[{id:'SYN-D2',symbol:'GME',rate:0.38,currency:'USD',special:false,foreign:false,ex_date:'2019-02-28',record_date:'2019-03-01',payable_date:'2019-03-15'},{id:'SYN-BAD',symbol:'GME',rate:-1,ex_date:'2019-05-30'},{id:'SYN-OTHER',symbol:'AMC',rate:1,ex_date:'2019-05-30'}]},next_page_token:'T2'};
const page2={corporate_actions:{reverse_splits:[{id:'SYN-R3',symbol:'GME',new_rate:1,old_rate:10,ex_date:'2016-01-04'}]},next_page_token:null};
let root='',dir='';
beforeEach(async()=>{root=await mkdtemp(path.join(tmpdir(),'lv-r27-actions-'));dir=path.join(root,ACTIONS_CACHE_DIRECTORY);});
afterEach(async()=>{await rm(root,{recursive:true,force:true});});
function reader(fetchImpl:(url:string,init:any)=>Promise<Response>,now=()=>NOW,namespace='alpaca'){
 const queue=vi.fn((_id:string,task:(entry:unknown,isCancelled:()=>boolean)=>Promise<unknown>)=>task({},()=>false));
 return {queue,actions:new AlpacaCorporateActions({keys,queue,fetchImpl,now,directory:dir,namespace})};
}

describe('input and request',()=>{
 it('takes exactly {requestId, symbol}; the URL carries the documented parameters and never the key',()=>{
  expect(actionsInput({requestId:'lv-actions-GME-1',symbol:'GME'})).toEqual({requestId:'lv-actions-GME-1',symbol:'GME'});
  for(const bad of [{requestId:'a',symbol:'gme'},{requestId:'a',symbol:'GME',start:'2020-01-01'},{requestId:'a b',symbol:'GME'},{symbol:'GME'}])expect(()=>actionsInput(bad)).toThrow();
  const url=new URL(actionsUrl('BRK.B','2015-01-01','2026-10-22','T2'));
  expect(url.origin+url.pathname).toBe('https://data.alpaca.markets/v1/corporate-actions');
  expect(Object.fromEntries(url.searchParams)).toEqual({symbols:'BRK.B',types:'forward_split,reverse_split,cash_dividend',start:'2015-01-01',end:'2026-10-22',limit:'1000',sort:'asc',page_token:'T2'});
  expect(url.href).not.toMatch(/SYNTHETIC|Secret/i);
 });
 it('validation keeps only well-formed rows of the asked symbol and refuses other shapes',()=>{
  const out=validateActions(page1,'GME');
  expect(out.events.map((e:any)=>e.id)).toEqual(['SYN-S1','SYN-D2']);expect(out.skipped).toBe(2);expect(out.nextPageToken).toBe('T2');
  expect(out.events[1]).toMatchObject({kind:'cash-dividend',exDate:'2019-02-28',amount:0.38,currency:'USD',payableDate:'2019-03-15'});
  for(const bad of [null,[],{corporate_actions:[]},{corporate_actions:{cash_dividends:{}}},{corporate_actions:{},next_page_token:'bad token'}])expect(()=>validateActions(bad,'GME')).toThrow();
  expect(validateActions({corporate_actions:{cash_dividends:[{id:'x',symbol:'GME',rate:1,ex_date:'2019-02-30'}]}},'GME').events).toEqual([]);
 });
});

describe('load, pages and cache',()=>{
 it('reads every page through the shared queue with the key in headers only, sorts the events and caches them for the New York day',async()=>{
  const calls:any[]=[];
  const fetchImpl=vi.fn(async(url:string,init:any)=>{calls.push({url,init});return json(url,new URL(url).searchParams.get('page_token')?page2:page1);});
  const {queue,actions}=reader(fetchImpl);
  const first=await actions.load({requestId:'r1',symbol:'GME'});
  expect(first.ok).toBe(true);
  expect(first.value.events.map((e:any)=>[e.kind,e.exDate])).toEqual([['reverse-split','2016-01-04'],['cash-dividend','2019-02-28'],['forward-split','2022-07-22']]);
  expect(first.value).toMatchObject({schemaVersion:1,symbol:'GME',cached:false,stale:false,synthetic:false,provenance:{provider:'Alpaca Market Data',kind:'owner-key',source:'corporate-actions'}});
  expect(queue.mock.calls.map(call=>call[0])).toEqual(['r1:0','r1:1']);
  expect(calls[0].init).toMatchObject({redirect:'manual',credentials:'omit',headers:{'APCA-API-KEY-ID':KEYS.keyId,'APCA-API-SECRET-KEY':KEYS.secret}});
  expect(new URL(calls[0].url).searchParams.get('end')).toBe('2026-10-22');
  expect(JSON.stringify(first)).not.toContain(KEYS.secret);
  const files=await readdir(dir);expect(files).toHaveLength(1);
  expect(await readFile(path.join(dir,files[0]),'utf8')).not.toContain(KEYS.secret);
  const again=await actions.load({requestId:'r2',symbol:'GME'});
  expect(again.value.cached).toBe(true);expect(again.value.events).toEqual(first.value.events);expect(fetchImpl).toHaveBeenCalledTimes(2);
 });
 it('a new New York day reads again; a failed refresh keeps the last good copy marked stale; a first failure is reported',async()=>{
  let now=NOW,status=200;
  const fetchImpl=vi.fn(async(url:string)=>status===200?json(url,{corporate_actions:{cash_dividends:[page1.corporate_actions.cash_dividends[0]]}}):json(url,{message:'forbidden for plan'},status));
  const {actions}=reader(fetchImpl,()=>now);
  expect((await actions.load({requestId:'a',symbol:'GME'})).value.events).toHaveLength(1);
  now+=86400000;status=403;
  const stale=await actions.load({requestId:'b',symbol:'GME'});
  expect(stale).toMatchObject({ok:true,value:{cached:true,stale:true,error:{code:'ALPACA_FORBIDDEN'}}});expect(stale.value.events).toHaveLength(1);
  expect(await actions.load({requestId:'c',symbol:'AMC'})).toMatchObject({ok:false,error:{code:'ALPACA_FORBIDDEN'}});
  expect(fetchImpl).toHaveBeenCalledTimes(3);
 });
 it('a damaged cache file is removed and read again; redirects and non-JSON answers are refused; no key means no request',async()=>{
  const fetchImpl=vi.fn(async(url:string)=>json(url,page2));
  const {actions}=reader(fetchImpl);
  await actions.load({requestId:'a',symbol:'GME'});
  const [file]=await readdir(dir);await writeFile(path.join(dir,file),'{"schemaVersion":1,"kind":"lv-corporate-actions","events":[{"kind":"x"}]}');
  expect((await actions.load({requestId:'b',symbol:'GME'})).value.cached).toBe(false);
  const redirect=reader(async url=>{const r=new Response(null,{status:302});Object.defineProperty(r,'url',{value:url});return r;}).actions;
  expect(await redirect.load({requestId:'a',symbol:'SPY'})).toMatchObject({ok:false,error:{code:'REDIRECT_DENIED'}});
  const html=reader(async url=>{const r=new Response('<html>',{status:200,headers:{'content-type':'text/html'}});Object.defineProperty(r,'url',{value:url});return r;}).actions;
  expect(await html.load({requestId:'a',symbol:'SPY'})).toMatchObject({ok:false,error:{code:'ALPACA_FORMAT_INVALID'}});
  const none=vi.fn();
  const keyless=new AlpacaCorporateActions({keys:{load:async()=>null},queue:vi.fn(),fetchImpl:none,now:()=>NOW,directory:dir});
  expect(await keyless.load({requestId:'a',symbol:'SPY'})).toMatchObject({ok:false,error:{code:'KEY_REQUIRED'}});expect(none).not.toHaveBeenCalled();
 });
});

describe('SYNTHETIC stub',()=>{
 it('the stub answers /v1/corporate-actions with SYNTHETIC rows; the reader labels them synthetic and caches them apart',async()=>{
  const stub=alpacaStubTransport({env:{LV_ALPACA_STUB:'synthetic'},packaged:false,profile:path.join(root,'profile'),tmpdir:root,now:()=>NOW});
  expect(stub.mode).toBe('synthetic');
  const queue=(_id:string,task:any)=>task({},()=>false);
  const stubbed=new AlpacaCorporateActions({keys:stub.keys,queue,fetchImpl:stub.fetch,now:()=>NOW,directory:dir,namespace:'alpaca-stub'});
  const result=await stubbed.load({requestId:'s',symbol:'GME'});
  expect(result.ok).toBe(true);
  expect(result.value.synthetic).toBe(true);expect(result.value.provenance.provider).toMatch(/^SYNTHETIC/);
  expect(result.value.events.length).toBeGreaterThan(8);
  expect(result.value.events.every((e:any)=>e.id.startsWith('SYNTHETIC-'))).toBe(true);
  expect(result.value.events.find((e:any)=>e.kind==='forward-split')).toMatchObject({exDate:STUB_SPLIT_DAY,newRate:2,oldRate:1});
  const real=new AlpacaCorporateActions({keys,queue,fetchImpl:vi.fn(async(url:string)=>json(url,{corporate_actions:{}})),now:()=>NOW,directory:dir,namespace:'alpaca'});
  expect((await real.load({requestId:'r',symbol:'GME'})).value).toMatchObject({cached:false,synthetic:false,events:[]});
  const paged=await stub.fetch('https://data.alpaca.markets/v1/corporate-actions?symbols=GME&types=cash_dividend&start=2024-01-01&end=2026-10-22&limit=2');
  const body=await paged.json();expect(body.corporate_actions.cash_dividends).toHaveLength(2);expect(body.next_page_token).toBe('2');
 });
 it('App mounts the markers on the active chart with the Events settings (source wiring)',()=>{
  const app=readFileSync('src/ui/App.tsx','utf8');
  expect(app).toMatch(/<ChartEventMarkers(?: snapshot=\{snapshotBinding\?\?undefined\})? symbol=\{chartEventSymbol\(dataset\.provenance\.providerId,dataset\.instrument\.symbol\)\}[^\n]*settings=\{\{dividends:shownSettings\.events\.dividends,splits:shownSettings\.events\.splits\}\}/);/* App passes the live-previewed settings (shownSettings; the saved ones unless Chart settings is open) */
 });
});
