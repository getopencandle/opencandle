'use strict';
// A local cache of CLOSED market-data bars, so a launch shows each live chart at once and
// downloads only the bars since the last cached one. Main process only: the renderer reaches it through five fixed trusted
// IPC channels (electron/main.cjs, lv:barcache:*), never through a path, URL or file name. It lives in the app profile
// (userData)/market-data-cache, apart from the workspace JSON, and never touches the network.
//
// One record per cache key (provider namespace, symbol, interval, feed, adjustment, data plan), named by a SHA-256 of the
// key, so no renderer text becomes a path. Each record is checked when read: a damaged or foreign file is deleted and
// treated as a miss. The total is capped (200 MB by default); the least recently used records go first. The keyless
// SYNTHETIC Alpaca stub has its own namespace ('alpaca-stub'), and main admits only the namespace of the current run,
// so synthetic bars can never land under a real provider key. Market data is not encrypted (not a secret).
// Coinbase public candles have their own namespace ('coinbase-public': product id, the 'spot' feed, raw prices,
// the 'public' plan). It has no stub, so only a real run admits it: a run that admits 'alpaca-iex' admits it too, and a
// SYNTHETIC stub run or a blocked run never does (main.cjs passes the same allowedProviders as before).
const fsDefault=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {BoundaryError,exactKeys}=require('./validation.cjs');

const CACHE_DIRECTORY='market-data-cache';
const DEFAULT_MAX_BYTES=200*1024*1024;
const MAX_RECORD_BARS=20000;
const MAX_RECORD_BYTES=16*1024*1024;
const PROVIDERS=Object.freeze(['alpaca-iex','alpaca-stub','coinbase-public']);
const SYNTHETIC_PROVIDERS=Object.freeze(['alpaca-stub']);
/** Namespaces a run admits along with a real one: Coinbase public data is real in every run that admits real Alpaca data. */
const REAL_COMPANIONS=Object.freeze({'alpaca-iex':Object.freeze(['coinbase-public'])});
const SYMBOL=/^[A-Z]{1,5}(?:\.[A-Z]{1,3}){0,2}$/;
const COINBASE_PRODUCT=/^[A-Z0-9]{2,10}-[A-Z]{3,4}$/;
const INTERVAL=/^[1-9][0-9]{0,5}[A-Za-z]{0,2}$/;
const FEEDS=Object.freeze(['sip','iex']),ADJUSTMENTS=Object.freeze(['raw','split','split,dividend']),PLANS=Object.freeze(['free','paid']);
const COINBASE_FEEDS=Object.freeze(['spot']),COINBASE_ADJUSTMENTS=Object.freeze(['raw']),COINBASE_PLANS=Object.freeze(['public']);
const isCoinbase=provider=>provider==='coinbase-public';
const symbolOk=(provider,symbol)=>typeof symbol==='string'&&(isCoinbase(provider)?COINBASE_PRODUCT:SYMBOL).test(symbol);
const RECORD_FILE=/^[0-9a-f]{64}\.json$/,TEMP_FILE=/\.tmp-[0-9a-f-]{36}$/,INDEX_FILE='index.json';
const KEY_FIELDS=Object.freeze(['provider','symbol','interval','feed','adjustment','plan']);
const renameDelays=[20,40,80,160,320];

function fail(message){throw new BoundaryError('INVALID_ARGUMENT',message);}
function cacheKey(value){
  exactKeys(value,KEY_FIELDS);
  if(!PROVIDERS.includes(value.provider))fail('Unknown market-data cache provider.');
  const coinbase=isCoinbase(value.provider);
  if(!symbolOk(value.provider,value.symbol))fail('Invalid cache symbol.');
  if(typeof value.interval!=='string'||!INTERVAL.test(value.interval))fail('Invalid cache interval.');
  if(!(coinbase?COINBASE_FEEDS:FEEDS).includes(value.feed))fail('Invalid cache feed.');
  if(!(coinbase?COINBASE_ADJUSTMENTS:ADJUSTMENTS).includes(value.adjustment))fail('Invalid cache adjustment.');
  if(!(coinbase?COINBASE_PLANS:PLANS).includes(value.plan))fail('Invalid cache data plan.');
  return {provider:value.provider,symbol:value.symbol,interval:value.interval,feed:value.feed,adjustment:value.adjustment,plan:value.plan};
}
const keyText=key=>KEY_FIELDS.map(field=>key[field]).join('|');
const fileOf=key=>crypto.createHash('sha256').update('lv-bar-cache-v1|'+keyText(key)).digest('hex')+'.json';
const finite=value=>typeof value==='number'&&Number.isFinite(value);
/** One OHLCV row [time, open, high, low, close, volume]: whole-second time, positive prices, a consistent range. */
function validRow(row){
  if(!Array.isArray(row)||row.length!==6||!row.every(finite))return false;
  const [time,open,high,low,close,volume]=row;
  return Number.isSafeInteger(time)&&time>0&&open>0&&high>0&&low>0&&close>0&&volume>=0&&high>=Math.max(open,close,low)&&low<=Math.min(open,close,high);
}
function validRows(rows){
  if(!Array.isArray(rows)||!rows.length||rows.length>MAX_RECORD_BARS)return false;
  for(let i=0;i<rows.length;i++)if(!validRow(rows[i])||(i&&rows[i][0]<=rows[i-1][0]))return false;
  return true;
}
/** Renderer bars ({time,open,high,low,close,volume}, strictly ascending) to compact rows. */
function barRows(value){
  if(!Array.isArray(value)||!value.length)fail('Expected at least one bar.');
  if(value.length>MAX_RECORD_BARS)fail('At most '+MAX_RECORD_BARS+' bars are cached per chart.');
  const rows=value.map(bar=>{exactKeys(bar,['time','open','high','low','close','volume']);return [bar.time,bar.open,bar.high,bar.low,bar.close,bar.volume];});
  if(!validRows(rows))fail('Cached bars must be valid, in time order and without duplicates.');
  return rows;
}
const sameKey=(a,b)=>!!a&&typeof a==='object'&&KEY_FIELDS.every(field=>a[field]===b[field])&&Object.keys(a).length===KEY_FIELDS.length;
function recordOf(text,key){
  const record=JSON.parse(text);
  if(!record||record.schemaVersion!==1||record.kind!=='lv-bar-cache'||!sameKey(record.key,key)||record.synthetic!==SYNTHETIC_PROVIDERS.includes(key.provider)||typeof record.savedAt!=='string'||!validRows(record.bars))throw new Error('Invalid cache record.');
  return record;
}
async function renameWithRetry(fs,temporary,target){
  for(let attempt=0;;attempt++){
    try{return await fs.rename(temporary,target);}
    catch(error){if(process.platform!=='win32'||!['EPERM','EBUSY'].includes(error?.code)||attempt>=renameDelays.length)throw error;await new Promise(resolve=>setTimeout(resolve,renameDelays[attempt]));}
  }
}

class BarCache{
  /** `allowedProviders`: the namespaces this run may read or write (main: the stub namespace only in a stub run). */
  constructor({directory,maxBytes=DEFAULT_MAX_BYTES,allowedProviders=PROVIDERS,fs=fsDefault,now=()=>Date.now()}={}){
    if(typeof directory!=='string'||!path.isAbsolute(directory))throw new TypeError('The market-data cache needs an absolute directory.');
    if(!Number.isSafeInteger(maxBytes)||maxBytes<1024)throw new TypeError('Invalid market-data cache size.');
    this.directory=directory;this.maxBytes=maxBytes;this.allowed=Object.freeze([...new Set([...allowedProviders].flatMap(id=>[id,...(REAL_COMPANIONS[id]??[])]))].filter(id=>PROVIDERS.includes(id)));this.fs=fs;this.now=now;
    this.index=null;this.queue=Promise.resolve();this.recovered=0;
  }
  run(operation){const next=this.queue.then(operation);this.queue=next.catch(()=>{});return next;}
  admit(key){if(!this.allowed.includes(key.provider))throw new BoundaryError('DENIED','This market-data cache namespace is not available in this run.');return key;}
  file(name){return path.join(this.directory,name);}
  async writeAtomic(name,text){
    await this.fs.mkdir(this.directory,{recursive:true});
    const target=this.file(name),temporary=target+'.tmp-'+crypto.randomUUID();
    try{await this.fs.writeFile(temporary,text,{encoding:'utf8',mode:0o600});await renameWithRetry(this.fs,temporary,target);}
    finally{await this.fs.unlink(temporary).catch(()=>{});}
  }
  async persistIndex(){await this.writeAtomic(INDEX_FILE,JSON.stringify({schemaVersion:1,kind:'lv-bar-cache-index',entries:this.index}));}
  async loadIndex(){
    if(this.index)return this.index;
    try{
      const parsed=JSON.parse(await this.fs.readFile(this.file(INDEX_FILE),'utf8'));
      if(!parsed||parsed.schemaVersion!==1||parsed.kind!=='lv-bar-cache-index'||!parsed.entries||typeof parsed.entries!=='object'||Array.isArray(parsed.entries))throw new Error('Invalid cache index.');
      const entries=Object.create(null);
      for(const [name,meta] of Object.entries(parsed.entries)){
        if(!RECORD_FILE.test(name)||!meta||!Number.isSafeInteger(meta.bytes)||meta.bytes<0||!finite(meta.lastUsed)||!PROVIDERS.includes(meta.provider)||!symbolOk(meta.provider,meta.symbol))throw new Error('Invalid cache index entry.');
        entries[name]={bytes:meta.bytes,lastUsed:meta.lastUsed,provider:meta.provider,symbol:meta.symbol};
      }
      this.index=entries;
    }catch(error){
      if(error?.code!=='ENOENT')this.recovered++;
      await this.rebuildIndex();
    }
    return this.index;
  }
  /** A missing or damaged index is rebuilt from the records on disk; damaged records and stray temporary files are removed. */
  async rebuildIndex(){
    const entries=Object.create(null);let names=[];
    try{names=await this.fs.readdir(this.directory);}catch(error){if(error?.code!=='ENOENT')throw error;}
    for(const name of names){
      if(TEMP_FILE.test(name)){await this.fs.unlink(this.file(name)).catch(()=>{});continue;}
      if(!RECORD_FILE.test(name))continue;
      try{
        const text=await this.fs.readFile(this.file(name),'utf8'),parsed=JSON.parse(text),key=cacheKey(parsed?.key);
        if(fileOf(key)!==name)throw new Error('Misnamed cache record.');
        recordOf(text,key);
        const stat=await this.fs.stat(this.file(name));
        entries[name]={bytes:stat.size,lastUsed:stat.mtimeMs,provider:key.provider,symbol:key.symbol};
      }catch{this.recovered++;await this.fs.unlink(this.file(name)).catch(()=>{});}
    }
    this.index=entries;
    if(names.length)await this.persistIndex();
  }
  async drop(name){delete this.index[name];await this.fs.unlink(this.file(name)).catch(()=>{});}
  totals(){let bytes=0,entries=0;for(const meta of Object.values(this.index??{})){bytes+=meta.bytes;entries++;}return {bytes,entries};}
  statusValue(){return {schemaVersion:1,...this.totals(),maxBytes:this.maxBytes};}
  /** {key} to the cached closed bars, or null on a miss. A damaged record is deleted and reads as a miss. */
  read(input){
    exactKeys(input,['key']);const key=this.admit(cacheKey(input.key));
    return this.run(async()=>{
      const index=await this.loadIndex(),name=fileOf(key);
      let text;
      try{text=await this.fs.readFile(this.file(name),'utf8');}
      catch(error){if(error?.code!=='ENOENT')throw error;if(index[name]){delete index[name];await this.persistIndex();}return null;}
      let record;
      try{record=recordOf(text,key);}
      catch{this.recovered++;await this.drop(name);await this.persistIndex();return null;}
      index[name]={bytes:Buffer.byteLength(text),lastUsed:this.now(),provider:key.provider,symbol:key.symbol};
      await this.persistIndex();
      return {schemaVersion:1,key,savedAt:record.savedAt,synthetic:record.synthetic,bars:record.bars.map(([time,open,high,low,close,volume])=>({time,open,high,low,close,volume}))};
    });
  }
  /** {key, bars}: replaces that key's record, then evicts least recently used records over the cap. */
  write(input){
    exactKeys(input,['key','bars']);const key=this.admit(cacheKey(input.key)),rows=barRows(input.bars);
    const text=JSON.stringify({schemaVersion:1,kind:'lv-bar-cache',key,synthetic:SYNTHETIC_PROVIDERS.includes(key.provider),savedAt:new Date(this.now()).toISOString(),bars:rows}),bytes=Buffer.byteLength(text);
    if(bytes>MAX_RECORD_BYTES||bytes>this.maxBytes)fail('These bars are too large to cache.');
    return this.run(async()=>{
      const index=await this.loadIndex(),name=fileOf(key);
      await this.writeAtomic(name,text);
      index[name]={bytes,lastUsed:this.now(),provider:key.provider,symbol:key.symbol};
      let total=this.totals().bytes;
      const order=Object.entries(index).filter(([file])=>file!==name).sort((a,b)=>a[1].lastUsed-b[1].lastUsed);
      for(const [file,meta] of order){if(total<=this.maxBytes)break;total-=meta.bytes;await this.drop(file);}
      await this.persistIndex();
      return this.statusValue();
    });
  }
  /** {provider, symbol}: removes every record of one symbol (all intervals, feeds, adjustments and plans). */
  discard(input){
    exactKeys(input,['provider','symbol']);
    if(!PROVIDERS.includes(input.provider)||!symbolOk(input.provider,input.symbol))fail('Invalid cache provider or symbol.');
    this.admit({provider:input.provider});
    return this.run(async()=>{
      const index=await this.loadIndex();let removed=0;
      for(const [name,meta] of Object.entries(index))if(meta.provider===input.provider&&meta.symbol===input.symbol){await this.drop(name);removed++;}
      if(removed)await this.persistIndex();
      return {removed};
    });
  }
  status(){return this.run(async()=>{await this.loadIndex();return this.statusValue();});}
  /** Removes every cache record, the index and stray temporary files. Other files in the folder are left alone. */
  clear(){
    return this.run(async()=>{
      let names=[];
      try{names=await this.fs.readdir(this.directory);}catch(error){if(error?.code!=='ENOENT')throw error;}
      for(const name of names)if(RECORD_FILE.test(name)||TEMP_FILE.test(name)||name===INDEX_FILE)await this.fs.unlink(this.file(name)).catch(()=>{});
      this.index=Object.create(null);
      return this.statusValue();
    });
  }
}
module.exports={BarCache,CACHE_DIRECTORY,DEFAULT_MAX_BYTES,MAX_RECORD_BARS,PROVIDERS,SYNTHETIC_PROVIDERS,cacheKey,fileOf};
