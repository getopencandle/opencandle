import {createRequire} from 'node:module';
import {mkdtemp,readFile,rm,writeFile,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';

// (follow-up): the main-process bar cache admits a Coinbase namespace with the same rules
// (closed bars only, keyed namespace, overlap check on the renderer side). Throwaway temp folder, SYNTHETIC bars.
const require=createRequire(import.meta.url);
const {BarCache,CACHE_DIRECTORY,fileOf,PROVIDERS}=require('../../electron/bar-cache.cjs');
const CB={provider:'coinbase-public',symbol:'BTC-USD',interval:'5m',feed:'spot',adjustment:'raw',plan:'public'};
const ALPACA={provider:'alpaca-iex',symbol:'GME',interval:'5m',feed:'sip',adjustment:'split',plan:'free'};
const bars=(count:number,start=1_760_000_100,step=300,base=60000)=>Array.from({length:count},(_,i)=>{const p=base+(i%13);return {time:start+i*step,open:p,high:p+5,low:p-5,close:p+1,volume:0.5+i};});
let root='',dir='';
beforeEach(async()=>{root=await mkdtemp(path.join(tmpdir(),'lv-r26-cbcache-'));dir=path.join(root,CACHE_DIRECTORY);});
afterEach(async()=>{await rm(root,{recursive:true,force:true});});

describe('Coinbase namespace',()=>{
 it('is a known provider; a real run (the alpaca-iex namespace) also admits it; the record is not synthetic',async()=>{
  expect(PROVIDERS).toContain('coinbase-public');
  const cache=new BarCache({directory:dir,allowedProviders:['alpaca-iex']});
  expect(await cache.read({key:CB})).toBeNull();
  await cache.write({key:CB,bars:bars(20)});
  const hit=await cache.read({key:CB});
  expect(hit).toMatchObject({key:CB,synthetic:false});expect(hit.bars).toEqual(bars(20));
  expect(JSON.parse(await readFile(path.join(dir,fileOf(CB)),'utf8'))).toMatchObject({kind:'lv-bar-cache',synthetic:false,key:CB});
 });
 it('a SYNTHETIC stub run and a blocked run admit no Coinbase namespace',async()=>{
  for(const allowed of [['alpaca-stub'],[]]){
   const cache=new BarCache({directory:dir,allowedProviders:allowed});
   expect(()=>cache.read({key:CB})).toThrow(/not available/);
   expect(()=>cache.write({key:CB,bars:bars(5)})).toThrow(/not available/);
   expect(()=>cache.discard({provider:'coinbase-public',symbol:'BTC-USD'})).toThrow(/not available/);
  }
 });
 it('keys follow the provider: Coinbase needs a product id, the spot feed, raw prices and the public plan; Alpaca keys are unchanged',()=>{
  const cache=new BarCache({directory:dir});
  for(const key of [{...CB,symbol:'BTC'},{...CB,symbol:'btc-usd'},{...CB,symbol:'../BTC-USD'},{...CB,symbol:'GME'},{...CB,feed:'sip'},{...CB,adjustment:'split'},{...CB,plan:'free'},{...CB,extra:1},
   {...ALPACA,feed:'spot'},{...ALPACA,plan:'public'},{...ALPACA,symbol:'BTC-USD'}])
   expect(()=>cache.read({key}),JSON.stringify(key)).toThrow(/Invalid|Unexpected/);
  expect(()=>cache.discard({provider:'coinbase-public',symbol:'GME'})).toThrow(/Invalid/);
  expect(()=>cache.discard({provider:'alpaca-iex',symbol:'BTC-USD'})).toThrow(/Invalid/);
 });
 it('every key field separates records, and a Coinbase discard removes only that product',async()=>{
  const cache=new BarCache({directory:dir});
  await cache.write({key:CB,bars:bars(6)});await cache.write({key:{...CB,interval:'1m'},bars:bars(6,1_760_000_040,60)});
  await cache.write({key:{...CB,symbol:'ETH-USD'},bars:bars(6)});await cache.write({key:ALPACA,bars:bars(6,1_760_000_100,300,20)});
  for(const change of [{interval:'15m'},{symbol:'SOL-USD'}])expect(await cache.read({key:{...CB,...change}})).toBeNull();
  expect(await cache.discard({provider:'coinbase-public',symbol:'BTC-USD'})).toEqual({removed:2});
  expect(await cache.read({key:CB})).toBeNull();
  expect((await cache.read({key:{...CB,symbol:'ETH-USD'}})).bars).toHaveLength(6);
  expect((await cache.read({key:ALPACA})).bars).toHaveLength(6);
 });
 it('a lost index is rebuilt with the Coinbase record; a record claiming synthetic is corrupt and removed',async()=>{
  const cache=new BarCache({directory:dir});
  await cache.write({key:CB,bars:bars(6)});
  await unlink(path.join(dir,'index.json'));
  expect(await new BarCache({directory:dir}).status()).toMatchObject({entries:1});
  const file=path.join(dir,fileOf(CB)),record=JSON.parse(await readFile(file,'utf8'));
  await writeFile(file,JSON.stringify({...record,synthetic:true}));
  expect(await new BarCache({directory:dir}).read({key:CB})).toBeNull();
 });
});
