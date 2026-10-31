import {createRequire} from 'node:module';
import {mkdtemp,readdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';

// The main-process bar cache on a throwaway temp folder (never a real profile). SYNTHETIC bars.
const require=createRequire(import.meta.url);
const {BarCache,CACHE_DIRECTORY,DEFAULT_MAX_BYTES,MAX_RECORD_BARS,fileOf}=require('../../electron/bar-cache.cjs');

const KEY={provider:'alpaca-iex',symbol:'GME',interval:'5m',feed:'sip',adjustment:'split',plan:'free'};
const bars=(count:number,start=1_760_000_100,step=300,base=20)=>Array.from({length:count},(_,i)=>{const p=base+(i%13)/10;return {time:start+i*step,open:p,high:p+0.5,low:p-0.5,close:p+0.1,volume:1000+i};});
let root='',dir='';
beforeEach(async()=>{root=await mkdtemp(path.join(tmpdir(),'lv-r24-cache-'));dir=path.join(root,CACHE_DIRECTORY);});
afterEach(async()=>{await rm(root,{recursive:true,force:true});});
const records=async()=>(await readdir(dir).catch(()=>[] as string[])).filter(name=>/^[0-9a-f]{64}\.json$/.test(name));

describe('hit, miss and key isolation',()=>{
 it('a miss is null; a written key reads back the same bars; status counts it; the folder is the profile cache folder',async()=>{
  const cache=new BarCache({directory:dir});
  expect(CACHE_DIRECTORY).toBe('market-data-cache');expect(DEFAULT_MAX_BYTES).toBe(200*1024*1024);
  expect(await cache.read({key:KEY})).toBeNull();
  const status=await cache.write({key:KEY,bars:bars(40)});
  expect(status).toMatchObject({schemaVersion:1,entries:1,maxBytes:DEFAULT_MAX_BYTES});expect(status.bytes).toBeGreaterThan(0);
  const hit=await cache.read({key:KEY});
  expect(hit).toMatchObject({schemaVersion:1,key:KEY,synthetic:false});expect(hit.bars).toEqual(bars(40));
  // A fresh instance (the next launch) finds it on disk.
  expect((await new BarCache({directory:dir}).read({key:KEY})).bars).toEqual(bars(40));
  expect(await records()).toEqual([fileOf(KEY)]);
 });
 it('every key field separates records: interval, feed, adjustment, data plan, symbol and provider namespace',async()=>{
  const cache=new BarCache({directory:dir});
  await cache.write({key:KEY,bars:bars(10)});
  for(const change of [{interval:'15m'},{feed:'iex'},{adjustment:'split,dividend'},{adjustment:'raw'},{plan:'paid'},{symbol:'SPY'},{provider:'alpaca-stub'}])expect(await cache.read({key:{...KEY,...change}}),JSON.stringify(change)).toBeNull();
  await cache.write({key:{...KEY,adjustment:'split,dividend'},bars:bars(10,1_760_000_100,300,80)});
  expect((await cache.read({key:KEY})).bars[0].open).toBe(20);
  expect((await cache.read({key:{...KEY,adjustment:'split,dividend'}})).bars[0].open).toBe(80);
 });
 it('rejects malformed keys and bars: unknown fields, paths in fields, unsorted, duplicate or invalid bars, too many bars',async()=>{
  const cache=new BarCache({directory:dir});
  for(const key of [{...KEY,extra:1},{...KEY,symbol:'../GME'},{...KEY,symbol:'gme'},{...KEY,interval:'5m/../../x'},{...KEY,feed:'otc'},{...KEY,adjustment:'all'},{...KEY,plan:'pro'},{...KEY,provider:'coinbase-public'},{...KEY,provider:'C:\\x'}])
   expect(()=>cache.read({key})).toThrow(/Invalid|Unknown|Unexpected/);
  const good=bars(3);
  for(const input of [[],[good[1],good[0]],[good[0],good[0]],[{...good[0],high:1}],[{...good[0],open:-1}],[{...good[0],time:1.5}],[{...good[0],extra:1}],bars(MAX_RECORD_BARS+1)])
   expect(()=>cache.write({key:KEY,bars:input})).toThrow();
  expect(()=>cache.write({key:KEY,bars:good,path:'x'})).toThrow();
  expect(await records()).toEqual([]);
 });
});

describe('stub isolation',()=>{
 it('the SYNTHETIC stub namespace is flagged synthetic; a run admits only its own namespace',async()=>{
  const stubKey={...KEY,provider:'alpaca-stub'};
  const stubRun=new BarCache({directory:dir,allowedProviders:['alpaca-stub']}),realRun=new BarCache({directory:dir,allowedProviders:['alpaca-iex']}),blocked=new BarCache({directory:dir,allowedProviders:[]});
  await stubRun.write({key:stubKey,bars:bars(5)});
  expect((await stubRun.read({key:stubKey})).synthetic).toBe(true);
  // The stub run can neither read nor write the real namespace, and the real run cannot touch the stub's records.
  expect(()=>stubRun.write({key:KEY,bars:bars(5)})).toThrow(/not available/);
  expect(()=>stubRun.read({key:KEY})).toThrow(/not available/);
  expect(()=>realRun.read({key:stubKey})).toThrow(/not available/);
  expect(()=>blocked.read({key:KEY})).toThrow(/not available/);
  expect(()=>stubRun.discard({provider:'alpaca-iex',symbol:'GME'})).toThrow(/not available/);
  expect(await realRun.read({key:KEY})).toBeNull();
  const record=JSON.parse(await readFile(path.join(dir,fileOf(stubKey)),'utf8'));
  expect(record).toMatchObject({kind:'lv-bar-cache',synthetic:true,key:stubKey});
 });
 it('a record whose synthetic flag disagrees with its namespace is treated as corrupt and removed',async()=>{
  const cache=new BarCache({directory:dir});
  await cache.write({key:KEY,bars:bars(5)});
  const file=path.join(dir,fileOf(KEY)),record=JSON.parse(await readFile(file,'utf8'));
  await writeFile(file,JSON.stringify({...record,synthetic:true}));
  expect(await new BarCache({directory:dir}).read({key:KEY})).toBeNull();
  expect(await records()).toEqual([]);
 });
});

describe('eviction, clear and discard',()=>{
 it('caps the total and evicts the least recently used record first; a read counts as a use',async()=>{
  let clock=1000;const now=()=>clock;
  const probe=new BarCache({directory:path.join(root,'probe'),now});
  const one=(await probe.write({key:KEY,bars:bars(200)})).bytes;
  const cache=new BarCache({directory:dir,maxBytes:Math.floor(one*2.5),now});
  const key=(symbol:string)=>({...KEY,symbol});
  await cache.write({key:key('AAA'),bars:bars(200)});clock++;
  await cache.write({key:key('BBB'),bars:bars(200)});clock++;
  await cache.read({key:key('AAA')});clock++;            // AAA is now more recent than BBB
  const status=await cache.write({key:key('CCC'),bars:bars(200)});
  expect(status.entries).toBe(2);expect(status.bytes).toBeLessThanOrEqual(Math.floor(one*2.5));
  expect(await cache.read({key:key('BBB')})).toBeNull();
  expect(await cache.read({key:key('AAA')})).not.toBeNull();
  expect(await cache.read({key:key('CCC')})).not.toBeNull();
  expect((await records()).length).toBe(2);
  expect(()=>new BarCache({directory:dir,maxBytes:2048}).write({key:KEY,bars:bars(200)})).toThrow(/too large/);
 });
 it('clear removes every record and the index, leaves unrelated files, and reports an empty cache',async()=>{
  const cache=new BarCache({directory:dir});
  await cache.write({key:KEY,bars:bars(5)});await cache.write({key:{...KEY,symbol:'SPY'},bars:bars(5)});
  await writeFile(path.join(dir,'unrelated.txt'),'keep');
  expect(await cache.clear()).toEqual({schemaVersion:1,bytes:0,entries:0,maxBytes:DEFAULT_MAX_BYTES});
  expect((await readdir(dir)).sort()).toEqual(['unrelated.txt']);
  expect(await cache.read({key:KEY})).toBeNull();
  expect(await new BarCache({directory:dir}).status()).toMatchObject({bytes:0,entries:0});
 });
 it('discard removes every record of one symbol (all intervals and bases) and nothing else',async()=>{
  const cache=new BarCache({directory:dir});
  await cache.write({key:KEY,bars:bars(5)});await cache.write({key:{...KEY,interval:'1D'},bars:bars(5)});await cache.write({key:{...KEY,adjustment:'split,dividend'},bars:bars(5)});
  await cache.write({key:{...KEY,symbol:'SPY'},bars:bars(5)});
  expect(await cache.discard({provider:'alpaca-iex',symbol:'GME'})).toEqual({removed:3});
  expect(await records()).toEqual([fileOf({...KEY,symbol:'SPY'})]);
  expect(await cache.read({key:{...KEY,symbol:'SPY'}})).not.toBeNull();
 });
});

describe('corrupt-file recovery',()=>{
 it('a damaged record (truncated JSON, wrong key, invalid bars) reads as a miss, is deleted, and the key can be written again',async()=>{
  const cache=new BarCache({directory:dir});
  await cache.write({key:KEY,bars:bars(5)});
  const file=path.join(dir,fileOf(KEY)),text=await readFile(file,'utf8');
  for(const damaged of [text.slice(0,text.length/2),JSON.stringify({...JSON.parse(text),key:{...KEY,symbol:'SPY'}}),JSON.stringify({...JSON.parse(text),bars:[[1,2,3]]}),'\u0000\u0001'] as string[]){
   await writeFile(file,damaged);
   const fresh=new BarCache({directory:dir});
   expect(await fresh.read({key:KEY})).toBeNull();
   expect(await records()).toEqual([]);
   await fresh.write({key:KEY,bars:bars(5)});
   expect((await fresh.read({key:KEY})).bars).toHaveLength(5);
  }
 });
 it('a damaged or missing index is rebuilt from the records; damaged records and stray temporary files are removed',async()=>{
  const cache=new BarCache({directory:dir});
  await cache.write({key:KEY,bars:bars(5)});await cache.write({key:{...KEY,symbol:'SPY'},bars:bars(5)});
  await writeFile(path.join(dir,'index.json'),'{not json');
  await writeFile(path.join(dir,'f'.repeat(64)+'.json'),'garbage');
  await writeFile(path.join(dir,fileOf(KEY)+'.tmp-00000000-0000-4000-8000-000000000000'),'partial');
  const fresh=new BarCache({directory:dir});
  expect(await fresh.status()).toMatchObject({entries:2});
  expect(fresh.recovered).toBeGreaterThanOrEqual(2);
  expect((await readdir(dir)).sort()).toEqual([fileOf(KEY),fileOf({...KEY,symbol:'SPY'}),'index.json'].sort());
  // Discard works from the rebuilt index (it knows each record's symbol).
  expect(await fresh.discard({provider:'alpaca-iex',symbol:'SPY'})).toEqual({removed:1});
  expect((await stat(path.join(dir,'index.json'))).isFile()).toBe(true);
 });
 it('needs an absolute directory, so it can never write relative to the working folder',()=>{
  expect(()=>new BarCache({directory:'market-data-cache'})).toThrow(/absolute/);
 });
});
