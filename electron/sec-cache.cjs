'use strict';
const {createHash,randomBytes}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const {BoundaryError,exactKeys,cancelInput}=require('./validation.cjs');
const {secInput,validateCompanyFacts,validateSubmissions,validateTickers}=require('./public-sec.cjs');
// One queue, one disk cache and one refresh policy for every SEC request the app makes. The module has no network code of its
// own: main hands it the single SecCompanyFacts client. Records live in <userData>/sec-cache, one file per kind and CIK.
const CACHE_DIRECTORY='sec-cache';
const MAX_CACHE_BYTES=256*1024*1024;
const MAX_QUEUE=16;
const START_SPACING_MS=1000;
const BACKOFF_MS=10*60*1000;
const FORCE_INTERVAL_MS=60*1000;
const TICKERS_MAX_AGE_MS=7*24*60*60*1000;
const KINDS=Object.freeze(['companyfacts','submissions','tickers']);
const MODES=Object.freeze(['cache-only','if-stale','force']);
const nyDate=ms=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
const fail=(code,message,extra={})=>({ok:false,error:{code,message},...extra});
function cachedInput(value){
  exactKeys(value,['requestId','kind','cik','refresh']);
  cancelInput({requestId:value.requestId});
  if(!KINDS.includes(value.kind))throw new BoundaryError('INVALID_ARGUMENT','Unsupported SEC data kind.');
  if(!MODES.includes(value.refresh))throw new BoundaryError('INVALID_ARGUMENT','Unsupported SEC refresh mode.');
  if(value.kind==='tickers'){
    if(value.cik!==null)throw new BoundaryError('INVALID_ARGUMENT','The ticker file has no CIK.');
    return{requestId:value.requestId,kind:'tickers',cik:null,refresh:value.refresh};
  }
  const checked=secInput({requestId:value.requestId,cik:value.cik});
  return{requestId:value.requestId,kind:value.kind,cik:checked.cik,refresh:value.refresh};
}
class SecCache {
  constructor({directory,client,now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),blocked=()=>false,maxBytes=MAX_CACHE_BYTES}){
    this.directory=directory;this.client=client;this.now=now;this.sleep=sleep;this.blocked=blocked;this.maxBytes=maxBytes;
    this.queue=[];this.inflight=new Map();this.running=false;this.lastStart=-Infinity;this.backoffUntil=0;this.lastForce=new Map();this.closed=false;
  }
  keyOf(kind,cik){return kind+':'+(cik??'');}
  fileOf(kind,cik){return path.join(this.directory,createHash('sha256').update(this.keyOf(kind,cik)).digest('hex')+'.json');}
  // ---- queue ----
  enqueue(kind,cik,requestId){
    if(this.closed)return Promise.resolve(fail('CLOSED','Public data capability is closed.'));
    if(this.blocked())return Promise.resolve(fail('SEC_DISABLED_RUN','SEC requests are off in demo and automated runs.'));
    if(this.now()<this.backoffUntil)return Promise.resolve(this.backoffFailure());
    const key=this.keyOf(kind,cik),existing=this.inflight.get(key);
    if(existing)return existing.promise;
    if(this.queue.length>=MAX_QUEUE)return Promise.resolve(fail('QUEUE_FULL','Too many SEC requests are waiting.'));
    const job={key,kind,cik,requestId,state:'queued',resolve:null,promise:null};
    job.promise=new Promise(resolve=>{job.resolve=resolve;});
    this.inflight.set(key,job);this.queue.push(job);
    void this.pump();
    return job.promise;
  }
  backoffFailure(){return fail('RATE_LIMITED','SEC paused requests.',{resumeAt:new Date(this.backoffUntil).toISOString()});}
  settle(job,result){this.inflight.delete(job.key);job.resolve(result);}
  failQueued(result){for(const job of this.queue.splice(0))this.settle(job,result);}
  async pump(){
    if(this.running)return;
    this.running=true;
    try{
      while(this.queue.length&&!this.closed){
        const job=this.queue[0];
        if(this.now()<this.backoffUntil){this.queue.shift();this.settle(job,this.backoffFailure());continue;}
        const wait=this.lastStart+START_SPACING_MS-this.now();
        if(wait>0)await this.sleep(wait);
        if(this.queue[0]!==job)continue;
        this.queue.shift();
        if(this.closed){this.settle(job,fail('CLOSED','Public data capability is closed.'));continue;}
        if(this.now()<this.backoffUntil){this.settle(job,this.backoffFailure());continue;}
        job.state='active';this.lastStart=this.now();
        let result;
        try{result=await this.client.run(job.kind==='tickers'?{requestId:job.requestId}:{requestId:job.requestId,cik:job.cik},job.kind);}
        catch{result=fail('SEC_NETWORK_ERROR','Public SEC request failed. No retry was made.');}
        if(!result.ok&&(result.error.code==='SEC_ACCESS_DENIED'||result.error.code==='RATE_LIMITED')){
          this.backoffUntil=this.now()+BACKOFF_MS;
          result={...result,resumeAt:new Date(this.backoffUntil).toISOString()};
          this.failQueued(this.backoffFailure());
        }
        this.settle(job,result);
      }
    }finally{this.running=false;}
  }
  cancel(requestId){
    const index=this.queue.findIndex(job=>job.requestId===requestId);
    if(index>=0){const [job]=this.queue.splice(index,1);this.settle(job,fail('CANCELLED','SEC request cancelled before data commit.'));return true;}
    return this.client.cancel(requestId);
  }
  // Network only, as the older channels always behaved: nothing is read from or written to the cache.
  network(raw,kind){
    if(kind!=='companyfacts'&&kind!=='submissions')return Promise.resolve(fail('INVALID_ARGUMENT','Unsupported fixed SEC capability.'));
    let input;try{input=secInput(raw);}catch(error){return Promise.resolve(fail(error.code||'INVALID_ARGUMENT',error.message));}
    return this.enqueue(kind,input.cik,input.requestId);
  }
  // ---- disk records ----
  async readRecord(kind,cik){
    const file=this.fileOf(kind,cik);
    let text;try{text=await fs.readFile(file,'utf8');}catch{return null;}
    try{
      const record=JSON.parse(text);
      if(!record||record.schemaVersion!==1||record.kind!==kind||record.cik!==cik||typeof record.retrievedAt!=='string'||!Number.isFinite(Date.parse(record.retrievedAt))||!record.envelope||typeof record.envelope!=='object')throw new Error('shape');
      const body=JSON.stringify(record.envelope);
      if(record.sha256!==createHash('sha256').update(body).digest('hex')||record.bytes!==Buffer.byteLength(body))throw new Error('hash');
      if(record.envelope.cik!==cik||record.envelope.schemaVersion!==1)throw new Error('identity');
      if(kind==='companyfacts')validateCompanyFacts(record.envelope.data,cik);else if(kind==='submissions')validateSubmissions(record.envelope.data,cik);else validateTickers(record.envelope.data);
      const stamp=new Date();void fs.utimes(file,stamp,stamp).catch(()=>{});
      return record;
    }catch{
      await fs.rm(file,{force:true}).catch(()=>{});
      return null;
    }
  }
  async writeRecord(kind,cik,envelope){
    const body=JSON.stringify(envelope);
    const record={schemaVersion:1,kind,cik,retrievedAt:new Date(this.now()).toISOString(),sha256:createHash('sha256').update(body).digest('hex'),bytes:Buffer.byteLength(body),envelope};
    const file=this.fileOf(kind,cik),temp=file+'.'+randomBytes(6).toString('hex')+'.tmp';
    await fs.mkdir(this.directory,{recursive:true});
    try{await fs.writeFile(temp,JSON.stringify(record),{mode:0o600});await fs.rename(temp,file);}
    catch(error){await fs.rm(temp,{force:true}).catch(()=>{});throw error;}
    await this.prune().catch(()=>{});
    return record;
  }
  async prune(){
    const names=await fs.readdir(this.directory).catch(()=>[]),rows=[];let total=0;
    for(const name of names){
      const file=path.join(this.directory,name);
      if(!/\.(?:json|tmp)$/.test(name))continue;
      const info=await fs.stat(file).catch(()=>null);
      if(!info||!info.isFile())continue;
      if(name.endsWith('.tmp')){if(this.now()-info.mtimeMs>60*60*1000)await fs.rm(file,{force:true}).catch(()=>{});continue;}
      rows.push({file,size:info.size,time:info.mtimeMs});total+=info.size;
    }
    rows.sort((a,b)=>a.time-b.time);
    while(total>this.maxBytes&&rows.length>1){const row=rows.shift();await fs.rm(row.file,{force:true}).catch(()=>{});total-=row.size;}
  }
  stale(kind,record){
    const retrieved=Date.parse(record.retrievedAt),now=this.now();
    if(kind==='tickers')return now-retrieved>TICKERS_MAX_AGE_MS;
    return nyDate(retrieved)<nyDate(now);
  }
  // ---- lv:sec:cached ----
  async get(raw){
    const input=cachedInput(raw);
    const {kind,cik,refresh,requestId}=input,key=this.keyOf(kind,cik);
    const record=await this.readRecord(kind,cik);
    const served=(error,resumeAt)=>({envelope:record?record.envelope:null,cachedAt:record?record.retrievedAt:null,fromCache:record!==null,refreshError:error,resumeAt:resumeAt??null});
    if(refresh==='cache-only')return served(null);
    let need;
    if(refresh==='force'){const last=this.lastForce.get(key);need=!record||last===undefined||this.now()-last>=FORCE_INTERVAL_MS;}
    else need=!record||this.stale(kind,record);
    if(!need)return served(null);
    if(refresh==='force')this.lastForce.set(key,this.now());
    const result=await this.enqueue(kind,cik,requestId);
    if(!result.ok)return served({code:result.error.code,message:result.error.message},result.resumeAt);
    let saved=null;
    try{saved=await this.writeRecord(kind,cik,result.value);}catch{saved=null;}
    return{envelope:result.value,cachedAt:saved?saved.retrievedAt:result.value.provenance.retrievedAt,fromCache:false,refreshError:null,resumeAt:null};
  }
  async clear(){
    this.lastForce.clear();
    await fs.rm(this.directory,{recursive:true,force:true}).catch(()=>{});
  }
  close(){
    this.closed=true;
    this.failQueued(fail('CLOSED','Public data capability is closed.'));
    this.client.close();
  }
}
module.exports={SecCache,cachedInput,CACHE_DIRECTORY,MAX_CACHE_BYTES,MAX_QUEUE,START_SPACING_MS,BACKOFF_MS,FORCE_INTERVAL_MS,TICKERS_MAX_AGE_MS,KINDS,MODES};
