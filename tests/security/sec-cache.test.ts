import {describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {mkdtemp,mkdir,readdir,readFile,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {SecCache,cachedInput,MAX_QUEUE}=require('../../electron/sec-cache.cjs');
const {SecCompanyFacts,validateTickers,TICKERS_URL}=require('../../electron/public-sec.cjs');
const {SECONDARY_CHANNELS}=require('../../electron/windows.cjs');

// Synthetic data and fake transports only: no test here makes a real network request.
const envelopeOf=(cik:string)=>({schemaVersion:1,cik,entityName:'SYNTHETIC company',data:{cik:Number(cik),entityName:'SYNTHETIC company',facts:{}},provenance:{provider:'SEC EDGAR',kind:'public-unauthenticated',sourceUrl:'synthetic',retrievedAt:'2026-01-01T00:00:00.000Z',sha256:'0',bytes:1,coverage:'synthetic'}});
const tickersEnvelope=()=>({schemaVersion:1,cik:null,entityName:'SEC company tickers',data:{'0':{cik_str:123,ticker:'SYN',title:'Synthetic'}},provenance:{provider:'SEC EDGAR',kind:'public-unauthenticated',sourceUrl:'synthetic',retrievedAt:'2026-01-01T00:00:00.000Z',sha256:'0',bytes:1,coverage:'synthetic'}});
function fakeClient(options:{answer?:(raw:any,kind:string)=>any;now?:()=>number}={}){
  const calls:{raw:any,kind:string,at:number}[]=[];
  return{calls,
    run:vi.fn(async(raw:any,kind:string)=>{calls.push({raw,kind,at:options.now?options.now():0});return options.answer?options.answer(raw,kind):{ok:true,value:kind==='tickers'?tickersEnvelope():envelopeOf(raw.cik)};}),
    cancel:vi.fn(()=>false),close:vi.fn()};
}
async function make(extra:Record<string,unknown>={},clientOptions:Parameters<typeof fakeClient>[0]={}){
  await mkdir(path.join(process.cwd(),'.tmp'),{recursive:true});
  const dir=await mkdtemp(path.join(process.cwd(),'.tmp','sec-cache-'));
  const clock={t:Date.parse('2026-03-10T15:00:00Z')};
  const client=fakeClient({now:()=>clock.t,...clientOptions});
  const cache=new SecCache({directory:path.join(dir,'sec-cache'),client,now:()=>clock.t,sleep:async(ms:number)=>{clock.t+=ms;},...extra});
  return{dir,cache,client,clock,done:()=>rm(dir,{recursive:true,force:true})};
}
const request=(id:string,cik:string|null,kind='companyfacts',refresh='if-stale')=>({requestId:id,kind,cik,refresh});

describe('cached read input',()=>{
  it('accepts exactly {requestId,kind,cik,refresh} and pads the CIK',()=>{
    expect(cachedInput(request('r1','123'))).toEqual({requestId:'r1',kind:'companyfacts',cik:'0000000123',refresh:'if-stale'});
    expect(cachedInput(request('r1',null,'tickers','cache-only')).cik).toBeNull();
    for(const bad of [undefined,{},{...request('r','1'),extra:1},request('r','1','prices'),request('r','1','companyfacts','always'),request('r','0'),request('r','12/../'),request('r',null),request('r','1','tickers'),request('r',null,'tickers','x')])expect(()=>cachedInput(bad)).toThrow();
  });
});

describe('queue',()=>{
  it('starts three queued requests at least one second apart and never answers BUSY',async()=>{
    const t=await make();
    try{
      const results=await Promise.all(['1','2','3'].map(cik=>t.cache.network({requestId:'q'+cik,cik},'companyfacts')));
      expect(results.every((r:any)=>r.ok)).toBe(true);
      const starts=t.client.calls.map(c=>c.at);
      expect(starts).toHaveLength(3);
      expect(starts[1]-starts[0]).toBeGreaterThanOrEqual(1000);expect(starts[2]-starts[1]).toBeGreaterThanOrEqual(1000);
    }finally{await t.done();}
  });
  it('shares one request between callers asking for the same kind and CIK',async()=>{
    const t=await make();
    try{
      const [a,b]=await Promise.all([t.cache.network({requestId:'a',cik:'5'},'companyfacts'),t.cache.network({requestId:'b',cik:'5'},'companyfacts')]);
      expect(a).toBe(b);expect(t.client.calls).toHaveLength(1);
      await t.cache.network({requestId:'c',cik:'5'},'submissions');
      expect(t.client.calls).toHaveLength(2);
    }finally{await t.done();}
  });
  it('holds at most sixteen waiting requests',async()=>{
    const t=await make({sleep:()=>new Promise(()=>{})});
    try{
      const pending=Array.from({length:MAX_QUEUE+1},(_,i)=>t.cache.network({requestId:'w'+i,cik:String(i+1)},'companyfacts'));
      await new Promise(r=>setTimeout(r,5));
      // the first request is taken off the queue to start; the rest wait behind the one-second gap
      const over=await t.cache.network({requestId:'extra1',cik:'900'},'companyfacts');
      const over2=await t.cache.network({requestId:'extra2',cik:'901'},'companyfacts');
      expect([over,over2].some((r:any)=>!r.ok&&r.error.code==='QUEUE_FULL')).toBe(true);
      void pending;
    }finally{await t.done();}
  });
  it('cancels a waiting request before it starts',async()=>{
    let release!:()=>void;
    const t=await make({sleep:()=>new Promise<void>(r=>{release=r;})});
    try{
      const first=t.cache.network({requestId:'f',cik:'1'},'companyfacts');
      await first;
      const second=t.cache.network({requestId:'s',cik:'2'},'companyfacts');
      expect(t.cache.cancel('s')).toBe(true);
      expect(await second).toMatchObject({ok:false,error:{code:'CANCELLED'}});
      release?.();
      expect(t.client.calls).toHaveLength(1);
    }finally{await t.done();}
  });
  it('backs off ten minutes after a 403 or 429, failing queued and new requests with a resume time',async()=>{
    let n=0;
    const t=await make({},{answer:(raw:any)=>++n===1?{ok:false,error:{code:'RATE_LIMITED',message:'limited'}}:{ok:true,value:envelopeOf(raw.cik)}});
    try{
      const [first,queued]=await Promise.all([t.cache.network({requestId:'a',cik:'1'},'companyfacts'),t.cache.network({requestId:'b',cik:'2'},'companyfacts')]);
      expect(first).toMatchObject({ok:false,error:{code:'RATE_LIMITED'}});
      expect(queued).toMatchObject({ok:false,error:{code:'RATE_LIMITED'}});
      const resumeAt=Date.parse((first as any).resumeAt);
      expect(resumeAt-t.clock.t).toBeGreaterThan(9*60*1000);
      expect(await t.cache.network({requestId:'c',cik:'3'},'companyfacts')).toMatchObject({ok:false,error:{code:'RATE_LIMITED'},resumeAt:(first as any).resumeAt});
      expect(t.client.calls).toHaveLength(1);
      t.clock.t=resumeAt+1;
      expect((await t.cache.network({requestId:'d',cik:'3'},'companyfacts')).ok).toBe(true);
    }finally{await t.done();}
  });
});

describe('cache modes',()=>{
  it('cache-only never touches the network, with or without a record',async()=>{
    const t=await make();
    try{
      expect(await t.cache.get(request('c1','7','companyfacts','cache-only'))).toEqual({envelope:null,cachedAt:null,fromCache:false,refreshError:null,resumeAt:null});
      await t.cache.get(request('c2','7'));
      expect(t.client.calls).toHaveLength(1);
      const hit=await t.cache.get(request('c3','7','companyfacts','cache-only'));
      expect(hit.fromCache).toBe(true);expect(hit.envelope.cik).toBe('0000000007');
      expect(t.client.calls).toHaveLength(1);
    }finally{await t.done();}
  });
  it('if-stale fetches when missing or retrieved before today in New York, and not otherwise',async()=>{
    const t=await make();
    try{
      expect((await t.cache.get(request('s1','9'))).fromCache).toBe(false);
      expect((await t.cache.get(request('s2','9'))).fromCache).toBe(true);
      expect(t.client.calls).toHaveLength(1);
      t.clock.t+=5*60*60*1000;// still the same New York date
      await t.cache.get(request('s3','9'));
      expect(t.client.calls).toHaveLength(1);
      t.clock.t+=24*60*60*1000;
      expect((await t.cache.get(request('s4','9'))).fromCache).toBe(false);
      expect(t.client.calls).toHaveLength(2);
    }finally{await t.done();}
  });
  it('treats the ticker file as stale after seven days',async()=>{
    const t=await make();
    try{
      await t.cache.get(request('t1',null,'tickers'));
      t.clock.t+=6*24*60*60*1000;
      await t.cache.get(request('t2',null,'tickers'));
      expect(t.client.calls).toHaveLength(1);
      t.clock.t+=2*24*60*60*1000;
      await t.cache.get(request('t3',null,'tickers'));
      expect(t.client.calls).toHaveLength(2);
      expect(t.client.calls[0].raw).toEqual({requestId:'t1'});
    }finally{await t.done();}
  });
  it('force refreshes at most once a minute per CIK and otherwise serves the cache',async()=>{
    const t=await make();
    try{
      await t.cache.get(request('f1','4','companyfacts','force'));
      await t.cache.get(request('f2','4','companyfacts','force'));
      expect(t.client.calls).toHaveLength(1);
      t.clock.t+=61*1000;
      await t.cache.get(request('f3','4','companyfacts','force'));
      expect(t.client.calls).toHaveLength(2);
      await t.cache.get(request('f4','5','companyfacts','force'));
      expect(t.client.calls).toHaveLength(3);
    }finally{await t.done();}
  });
  it('returns the cached copy with the error when a refresh fails',async()=>{
    let fail=false;
    const t=await make({},{answer:(raw:any)=>fail?{ok:false,error:{code:'SEC_NETWORK_ERROR',message:'down'}}:{ok:true,value:envelopeOf(raw.cik)}});
    try{
      await t.cache.get(request('e1','8'));
      fail=true;t.clock.t+=24*60*60*1000;
      const result=await t.cache.get(request('e2','8'));
      expect(result).toMatchObject({fromCache:true,refreshError:{code:'SEC_NETWORK_ERROR'}});
      expect(result.envelope.cik).toBe('0000000008');
      const none=await t.cache.get(request('e3','99'));
      expect(none).toMatchObject({envelope:null,fromCache:false,refreshError:{code:'SEC_NETWORK_ERROR'}});
    }finally{await t.done();}
  });
  it('refuses every network mode in a blocked run and sends nothing',async()=>{
    const t=await make({blocked:()=>true});
    try{
      for(const mode of ['if-stale','force']){
        expect(await t.cache.get(request('b'+mode,'3','companyfacts',mode))).toMatchObject({envelope:null,refreshError:{code:'SEC_DISABLED_RUN'}});
      }
      expect(await t.cache.network({requestId:'n',cik:'3'},'companyfacts')).toMatchObject({ok:false,error:{code:'SEC_DISABLED_RUN'}});
      expect(await t.cache.get(request('bt',null,'tickers'))).toMatchObject({refreshError:{code:'SEC_DISABLED_RUN'}});
      expect(t.client.run).not.toHaveBeenCalled();
    }finally{await t.done();}
  });
  it('sends nothing on construction and for cache-only reads',async()=>{
    const t=await make();
    try{await t.cache.get(request('x','1','companyfacts','cache-only'));expect(t.client.run).not.toHaveBeenCalled();}finally{await t.done();}
  });
});

describe('disk records',()=>{
  it('writes atomically named records and revalidates them, deleting a bad one',async()=>{
    const t=await make();
    try{
      await t.cache.get(request('d1','11'));
      const dir=path.join(t.dir,'sec-cache');
      const files=await readdir(dir);
      expect(files).toHaveLength(1);expect(files[0]).toMatch(/^[0-9a-f]{64}\.json$/);
      const record=JSON.parse(await readFile(path.join(dir,files[0]),'utf8'));
      expect(record).toMatchObject({schemaVersion:1,kind:'companyfacts',cik:'0000000011',bytes:expect.any(Number)});
      record.envelope.entityName='TAMPERED';
      await writeFile(path.join(dir,files[0]),JSON.stringify(record));
      expect(await t.cache.get(request('d2','11','companyfacts','cache-only'))).toMatchObject({envelope:null,fromCache:false});
      expect(await readdir(dir)).toEqual([]);
      await writeFile(path.join(dir,files[0]),'{not json');
      expect((await t.cache.get(request('d3','11','companyfacts','cache-only'))).envelope).toBeNull();
    }finally{await t.done();}
  });
  it('keeps the folder under its cap, dropping the least recently used record first',async()=>{
    const t=await make({maxBytes:3000});
    try{
      for(const cik of ['1','2','3','4','5','6']){await t.cache.get(request('p'+cik,cik));t.clock.t+=1;await new Promise(r=>setTimeout(r,15));}
      const dir=path.join(t.dir,'sec-cache');
      const sizes=await Promise.all((await readdir(dir)).map(async f=>(await readFile(path.join(dir,f))).length));
      expect(sizes.reduce((a,b)=>a+b,0)).toBeLessThanOrEqual(3000+Math.max(...sizes));
      expect((await readdir(dir)).length).toBeLessThan(6);
      expect((await t.cache.get(request('p-last','6','companyfacts','cache-only'))).fromCache).toBe(true);
    }finally{await t.done();}
  });
  it('clear deletes the folder and forgets forced refreshes',async()=>{
    const t=await make();
    try{
      await t.cache.get(request('k1','2','companyfacts','force'));
      await t.cache.clear();
      expect(await readdir(t.dir)).toEqual([]);
      await t.cache.get(request('k2','2','companyfacts','force'));
      expect(t.client.calls).toHaveLength(2);
    }finally{await t.done();}
  });
});

describe('real client behind the queue (fake transport)',()=>{
  const tickerBody=JSON.stringify({'0':{cik_str:123,ticker:'SYN',title:'Synthetic Co'}});
  const reply=(body:string)=>new Response(body,{status:200,headers:{'content-type':'application/json'}});
  it('makes zero fetches for any kind while no SEC contact is set',async()=>{
    const fetchImpl=vi.fn(async()=>reply(tickerBody));
    const client=new SecCompanyFacts({fetchImpl});
    expect(await client.run({requestId:'t'},'tickers')).toMatchObject({ok:false,error:{code:'IDENTITY_UNSET',message:'Add your SEC contact to load company data.'}});
    expect(await client.run({requestId:'c',cik:'1'},'companyfacts')).toMatchObject({ok:false,error:{code:'IDENTITY_UNSET'}});
    expect(await client.run({requestId:'s',cik:'1'},'submissions')).toMatchObject({ok:false,error:{code:'IDENTITY_UNSET'}});
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('fetches the fixed ticker URL with exactly the user contact as User-Agent',async()=>{
    const fetchImpl=vi.fn(async(_url:string,_init:any)=>{const r=reply(tickerBody);Object.defineProperty(r,'url',{value:TICKERS_URL});return r;});
    const client=new SecCompanyFacts({fetchImpl,identity:()=>'Synthetic Person person@example.test'});
    const result=await client.run({requestId:'t'},'tickers');
    expect(result.ok).toBe(true);
    const [url,init]=fetchImpl.mock.calls[0];
    expect(url).toBe('https://www.sec.gov/files/company_tickers.json');
    expect(init.headers['User-Agent']).toBe('Synthetic Person person@example.test');
    expect(init).toMatchObject({redirect:'manual',credentials:'omit'});
    expect(result.value.data['0'].ticker).toBe('SYN');
  });
  it('rejects malformed ticker rows and extra input',async()=>{
    expect(()=>validateTickers({'0':{cik_str:'x',ticker:'A',title:'B'}})).toThrow();
    expect(()=>validateTickers([])).toThrow();
    expect(()=>validateTickers({})).toThrow();
    const client=new SecCompanyFacts({fetchImpl:vi.fn(),identity:()=>'a@b.co'});
    expect(await client.run({requestId:'t',cik:'1'},'tickers')).toMatchObject({ok:false});
  });
  it('routes the old channels through the queue with network-only semantics (no BUSY, nothing cached)',async()=>{
    const company={cik:123,entityName:'SYNTHETIC',facts:{}};
    const fetchImpl=vi.fn(async(url:string)=>{const r=reply(JSON.stringify(company));Object.defineProperty(r,'url',{value:url});return r;});
    await mkdir(path.join(process.cwd(),'.tmp'),{recursive:true});
    const dir=await mkdtemp(path.join(process.cwd(),'.tmp','sec-cache-'));
    try{
      let clock=1_000_000;
      const queued=new SecCache({directory:path.join(dir,'sec-cache'),client:new SecCompanyFacts({fetchImpl,now:()=>clock,identity:()=>'a@b.co'}),sleep:async(ms:number)=>{clock+=ms;},now:()=>clock});
      const results=await Promise.all([queued.network({requestId:'a',cik:'123'},'companyfacts'),queued.network({requestId:'b',cik:'124'},'companyfacts')]);
      expect(results.map((r:any)=>r.ok||r.error.code)).not.toContain('BUSY');
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(await readdir(dir)).toEqual([]);
    }finally{await rm(dir,{recursive:true,force:true});}
  });
});

describe('main process wiring and packaging',()=>{
  const main=readFileSync('electron/main.cjs','utf8'),pack=readFileSync('scripts/security-package.mjs','utf8'),windows=readFileSync('electron/windows.cjs','utf8');
  it('registers the new channels, loads the module lazily and keeps the contact out of the source',()=>{
    for(const channel of ['lv:sec:cached','lv:sec:open-filing','lv:sec:companyfacts','lv:sec:submissions','lv:sec:cancel'])expect(main).toContain("'"+channel+"': async");
    expect((main.match(/require\('\.\/sec-cache\.cjs'\)/g)??[]).length).toBe(1);
    expect(main).not.toMatch(/^const \{[^}]*\} = require\('\.\/public-sec\.cjs'\)/m);
    expect(main).not.toContain('SEC_CONTACT');
    expect(main).toContain("'lv:sec:identity-get': async");expect(main).toContain("'lv:sec:identity-set': async");
  });
  it('lets a layout window read cached SEC data but never open a filing',()=>{
    expect(SECONDARY_CHANNELS).toContain('lv:sec:cached');
    expect(SECONDARY_CHANNELS).not.toContain('lv:sec:open-filing');
  });
  it('builds the filing address only from a numeric CIK and a well-formed accession',()=>{
    expect(main).toContain("'https://www.sec.gov/Archives/edgar/data/'+Number(value.cik)+'/'+value.accession.replace(/-/g,'')+'/'+value.accession+'-index.htm'");
    expect(main).toContain('/^\\d{10}-\\d{2}-\\d{6}$/');
  });
  it('deletes the cache on a workspace reset',()=>{
    expect(main).toMatch(/const reset=await store\.reset\(value\);await secClearCache\(\);return reset;/);
  });
  it('is covered by the package security check',()=>{
    expect(pack).toContain("if(Object.hasOwn(manifest.sourceHashes,'electron/sec-cache.cjs')){");
    for(const text of ['SEC cache module matches the manifest source hash','SEC cache module has no network, process or shell access','SEC cache writes are atomic','main.cjs loads the SEC cache once, lazily','layout windows may read cached SEC data but never open a filing'])expect(pack).toContain(text);
  });
  it('honours the rules the package check applies to the module',()=>{
    const text=readFileSync('electron/sec-cache.cjs','utf8');
    expect([...text.matchAll(/require\(\s*['"`]([^'"`]*)['"`]\s*\)/g)].map(m=>m[1]).sort()).toEqual(['./public-sec.cjs','./validation.cjs','node:crypto','node:fs/promises','node:path']);
    expect(text).not.toMatch(/globalThis\.fetch|fetch\(|WebSocket|https?:\/\/|wss?:\/\/|child_process|openExternal/);
    expect(text).toContain('fs.rename(temp,file)');
    expect(windows).toContain("'lv:sec:cached'");
  });
});
