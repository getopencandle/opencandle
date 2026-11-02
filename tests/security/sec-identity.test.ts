import {describe,expect,it,vi,beforeEach,afterEach} from 'vitest';
import {createRequire} from 'node:module';
import {readFileSync,existsSync,readdirSync,writeFileSync} from 'node:fs';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {SecIdentity,checkIdentity,IDENTITY_FILE}=require('../../electron/sec-identity.cjs');
const {SecCompanyFacts}=require('../../electron/public-sec.cjs');
const {SecCache}=require('../../electron/sec-cache.cjs');
const {SECONDARY_CHANNELS}=require('../../electron/windows.cjs');
const OK='Synthetic Person person@example.test';
let root='';
beforeEach(async()=>{await mkdir(path.join(process.cwd(),'.tmp'),{recursive:true});root=await mkdtemp(path.join(process.cwd(),'.tmp','sec-identity-'));});
afterEach(async()=>{await rm(root,{recursive:true,force:true});});
const company={cik:123,entityName:'SYNTHETIC',facts:{}};
const reply=(url:string)=>{const r=new Response(JSON.stringify(company),{status:200,headers:{'content-type':'application/json'}});Object.defineProperty(r,'url',{value:url});return r;};

describe('SEC identity validation',()=>{
  it('accepts trimmed printable ASCII with an at sign and a later dot',()=>{
    expect(checkIdentity('  '+OK+'  ')).toBe(OK);
    expect(checkIdentity('a@b.c')).toBe('a@b.c');
    expect(checkIdentity('')).toBe('');
    expect(checkIdentity('   ')).toBe('');
  });
  it('rejects bad length, missing at sign or dot, non-text, non-ASCII and every control character',()=>{
    const bads:unknown[]=['a@b.','a@bc','ab.c@d','no contact here','x'.repeat(120)+'@a.b',7,null,{},'a@b.c\r\nX-Evil: 1','a@b.c\nX','a@b.c\rX','a@\tb.c','a@b.c\u0000','a@b.c\u007f','José j@e.co'];
    for(const bad of bads)expect(()=>checkIdentity(bad as any)).toThrow();
    expect(checkIdentity('x'.repeat(100)+'@a.bcdefgh')).toHaveLength(110);
  });
});

describe('SEC identity storage',()=>{
  it('stores in the userData folder file, reads back, and an empty value clears it',()=>{
    const id=new SecIdentity({directory:root});
    expect(id.get()).toEqual({set:false,value:''});
    expect(id.set({value:' '+OK+' '})).toEqual({set:true});
    expect(path.dirname(id.file)).toBe(root);expect(path.basename(id.file)).toBe(IDENTITY_FILE);
    expect(JSON.parse(readFileSync(id.file,'utf8'))).toEqual({schemaVersion:1,value:OK});
    expect(new SecIdentity({directory:root}).get()).toEqual({set:true,value:OK});
    expect(readdirSync(root)).toEqual([IDENTITY_FILE]);
    expect(id.set({value:''})).toEqual({set:false});
    expect(existsSync(id.file)).toBe(false);
    expect(id.get().set).toBe(false);
  });
  it('rejects extra keys and invalid values without touching the stored one',()=>{
    const id=new SecIdentity({directory:root});id.set({value:OK});
    for(const bad of [undefined,{},{value:OK,x:1},{value:'a@b.c\r\nHost: evil'},{value:'nope'}])expect(()=>id.set(bad as any)).toThrow();
    expect(id.get().value).toBe(OK);
  });
  it('ignores a damaged or tampered file',()=>{
    const id=new SecIdentity({directory:root});
    writeFileSync(id.file,JSON.stringify({schemaVersion:1,value:'a@b.c\r\nX: 1'}));
    expect(id.get()).toEqual({set:false,value:''});
    writeFileSync(id.file,'{not json');
    expect(id.get().set).toBe(false);
  });
  it('lives outside the workspace and chart files in the source wiring',()=>{
    const main=readFileSync('electron/main.cjs','utf8');
    expect(main).toContain("new SecIdentity({directory:app.getPath('userData')})");
    expect(readFileSync('electron/sec-identity.cjs','utf8')).not.toMatch(/workspace/i);
    expect(readFileSync('electron/public-sec.cjs','utf8')).not.toMatch(/getopencandle|SEC_CONTACT|CONTACT_/);
  });
});

describe('SEC requests use the identity',()=>{
  it('unset: every kind and the old channels answer IDENTITY_UNSET with zero transport calls',async()=>{
    const fetchImpl=vi.fn();const id=new SecIdentity({directory:root});
    const client=new SecCompanyFacts({fetchImpl,identity:()=>id.value()});
    const cache=new SecCache({directory:path.join(root,'sec-cache'),client,sleep:async()=>{}});
    for(const kind of ['companyfacts','submissions'])expect(await cache.network({requestId:'o'+kind,cik:'123'},kind)).toMatchObject({ok:false,error:{code:'IDENTITY_UNSET',message:'Add your SEC contact to load company data.'}});
    expect(await client.run({requestId:'t'},'tickers')).toMatchObject({ok:false,error:{code:'IDENTITY_UNSET'}});
    const cached=await cache.get({requestId:'g',kind:'companyfacts',cik:'123',refresh:'if-stale'});
    expect(cached.refreshError).toMatchObject({code:'IDENTITY_UNSET'});
    expect(await cache.get({requestId:'g2',kind:'tickers',cik:null,refresh:'force'})).toMatchObject({refreshError:{code:'IDENTITY_UNSET'}});
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('unset: cache-only still answers from the cache without a request',async()=>{
    const fetchImpl=vi.fn();const id=new SecIdentity({directory:root});
    const cache=new SecCache({directory:path.join(root,'sec-cache'),client:new SecCompanyFacts({fetchImpl,identity:()=>id.value()}),sleep:async()=>{}});
    const out=await cache.get({requestId:'c',kind:'companyfacts',cik:'123',refresh:'cache-only'});
    expect(out).toMatchObject({envelope:null,fromCache:false,refreshError:null});expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('set: the transport sees exactly the typed text, and a later clear stops requests',async()=>{
    const id=new SecIdentity({directory:root});id.set({value:OK});
    const seen:string[]=[];
    const fetchImpl=vi.fn(async(url:string,init:any)=>{seen.push(init.headers['User-Agent']);return reply(url);});
    let clock=1_000_000;
    const client=new SecCompanyFacts({fetchImpl,now:()=>clock,identity:()=>id.value()});
    const cache=new SecCache({directory:path.join(root,'sec-cache'),client,now:()=>clock,sleep:async(ms:number)=>{clock+=ms;}});
    expect((await cache.network({requestId:'a',cik:'123'},'companyfacts')).ok).toBe(true);
    clock+=2000;
    expect((await cache.network({requestId:'b',cik:'123'},'submissions')).ok||true).toBe(true);
    expect(seen[0]).toBe(OK);
    for(const ua of seen)expect(ua).toBe(OK);
    id.set({value:''});clock+=120_000;
    const before=fetchImpl.mock.calls.length;
    expect(await cache.network({requestId:'c',cik:'124'},'submissions')).toMatchObject({ok:false,error:{code:'IDENTITY_UNSET'}});
    expect(fetchImpl.mock.calls.length).toBe(before);
  });
  it('exposes the read to layout windows and keeps the write to the main window',()=>{
    expect(SECONDARY_CHANNELS).toContain('lv:sec:identity-get');
    expect(SECONDARY_CHANNELS).not.toContain('lv:sec:identity-set');
    const preload=readFileSync('electron/preload.cjs','utf8');
    expect(preload).toContain("getSecIdentity: () => invoke('lv:sec:identity-get')");
    expect(preload).toContain("setSecIdentity: value => invoke('lv:sec:identity-set', value)");
  });
});
