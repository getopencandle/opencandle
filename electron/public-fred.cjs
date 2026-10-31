'use strict';
// Economic data series from FRED (St. Louis Fed) through its keyless public CSV endpoint. Main process only.
// ON DEMAND: one series per request, fetched when the user opens or compares that symbol; no lists, no prefetch, no polling.
// A cached series younger than one day is returned without a request (refresh at most once a day on reopen).
// Cache: <userData>/fred-cache, one small JSON per series (named by a hash, so no renderer text becomes a path), hard total
// cap 5 MB, least recently used removed first. Never part of the workspace and never exported.
const fsDefault=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {BoundaryError,exactKeys}=require('./validation.cjs');

const CACHE_DIRECTORY='fred-cache';
const MAX_CACHE_BYTES=5*1024*1024;
const MAX_RESPONSE_BYTES=4*1024*1024;
const REFRESH_MS=24*60*60*1000;
const TIMEOUT_MS=15000;
const SERIES_ID=/^[A-Z0-9_]{1,25}$/;
const RECORD_FILE=/^[0-9a-f]{64}\.json$/;
const TEMP_FILE=/^[0-9a-f]{64}\.json\.tmp-[0-9a-f-]{36}$/;
const USER_AGENT='OpenCandle/0.8.1 (getopencandle.com; optional public FRED data reader)';
const urlOf=series=>'https://fred.stlouisfed.org/graph/fredgraph.csv?id='+series;

function seriesInput(value){
  exactKeys(value,['series']);
  const trimmed=typeof value.series==='string'?value.series.trim():'';
  // Checked BEFORE upper-casing: toUpperCase() maps some non-ASCII letters (for example the German sharp s) onto ASCII.
  const id=/^[A-Za-z0-9_]{1,25}$/.test(trimmed)?trimmed.toUpperCase():'';
  if(!SERIES_ID.test(id))throw new BoundaryError('INVALID_ARGUMENT','A FRED series id has letters, digits and underscores only (for example DGS10).');
  return id;
}
/** FRED CSV to ascending [unixSeconds, value] rows. "." (and any non-number) is a missing value and is skipped. */
function parseFredCsv(text,series){
  if(typeof text!=='string')throw new BoundaryError('FRED_FORMAT_INVALID','FRED returned an unreadable answer.');
  const lines=text.replace(/^﻿/,'').split(/\r?\n/);
  const header=(lines.shift()||'').split(',').map(cell=>cell.trim().replace(/^"|"$/g,''));
  if(header.length!==2||!/^(date|observation_date)$/i.test(header[0])||header[1].toUpperCase()!==series)throw new BoundaryError('FRED_FORMAT_INVALID','FRED did not return a data table for '+series+'.');
  const byTime=new Map();
  for(const line of lines){
    if(!line.trim())continue;
    const cells=line.split(',');
    if(cells.length!==2)throw new BoundaryError('FRED_FORMAT_INVALID','A FRED row was malformed.');
    const date=cells[0].trim().replace(/^"|"$/g,''),raw=cells[1].trim().replace(/^"|"$/g,'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new BoundaryError('FRED_FORMAT_INVALID','A FRED row had an invalid date.');
    if(raw==='.'||raw==='')continue;
    const value=Number(raw);
    if(!Number.isFinite(value))continue;
    const ms=Date.parse(date+'T00:00:00Z');
    if(!Number.isFinite(ms))throw new BoundaryError('FRED_FORMAT_INVALID','A FRED row had an invalid date.');
    byTime.set(ms/1000,value);
  }
  return [...byTime.entries()].sort((a,b)=>a[0]-b[0]);
}
const rowsValid=rows=>Array.isArray(rows)&&rows.length>0&&rows.length<=200000&&rows.every((row,i)=>Array.isArray(row)&&row.length===2&&Number.isSafeInteger(row[0])&&Number.isFinite(row[1])&&(i===0||row[0]>rows[i-1][0]));

class FredSeries {
  constructor({fetchImpl=globalThis.fetch,directory,now=Date.now,maxBytes=MAX_CACHE_BYTES,timeoutMs=TIMEOUT_MS,fs=fsDefault}={}){
    this.fetch=fetchImpl;this.directory=directory;this.now=now;this.maxBytes=maxBytes;this.timeoutMs=timeoutMs;this.fs=fs;this.chain=Promise.resolve();this.closed=false;
  }
  _serial(task){const run=this.chain.then(task,task);this.chain=run.catch(()=>undefined);return run;}
  _file(series){return path.join(this.directory,crypto.createHash('sha256').update('lv-fred-v1|'+series).digest('hex')+'.json');}
  async _readRecord(series){
    const file=this._file(series);
    // A read error (missing file, or a transient Windows lock such as EBUSY/EPERM/EACCES) never deletes the
    // file; only a copy that reads but does not parse, or has the wrong shape, is removed.
    let text;try{text=await this.fs.readFile(file,'utf8');}catch{return null;}
    try{
      const record=JSON.parse(text);
      if(!record||record.schemaVersion!==1||record.series!==series||!Number.isFinite(record.fetchedAt)||!rowsValid(record.rows))throw new Error('bad');
      const stamp=new Date(this.now());void this.fs.utimes(file,stamp,stamp).catch(()=>undefined);
      return record;
    }catch{await this.fs.rm(file,{force:true}).catch(()=>undefined);return null;}
  }
  async _entries(){
    let names;try{names=await this.fs.readdir(this.directory);}catch{return[];}
    const entries=[];
    for(const name of names){if(!RECORD_FILE.test(name))continue;try{const stat=await this.fs.stat(path.join(this.directory,name));entries.push({name,size:stat.size,used:stat.mtimeMs});}catch{/* gone */}}
    return entries;
  }
  /** Leftover temp files from a crash between write and rename (older than a minute, so a live write is never touched). */
  async _sweepTemp(){
    let names;try{names=await this.fs.readdir(this.directory);}catch{return;}
    for(const name of names){
      if(!TEMP_FILE.test(name))continue;
      try{const stat=await this.fs.stat(path.join(this.directory,name));if(this.now()-stat.mtimeMs>60000||stat.mtimeMs>this.now()+60000)await this.fs.rm(path.join(this.directory,name),{force:true});}catch{/* gone */}
    }
  }
  async _evict(keep){
    await this._sweepTemp();
    const entries=await this._entries();let total=entries.reduce((sum,e)=>sum+e.size,0);
    for(const e of entries.filter(x=>x.name!==keep).sort((a,b)=>a.used-b.used)){if(total<=this.maxBytes)break;await this.fs.rm(path.join(this.directory,e.name),{force:true}).catch(()=>undefined);total-=e.size;}
  }
  async _write(series,rows){
    const text=JSON.stringify({schemaVersion:1,series,fetchedAt:this.now(),rows});
    if(Buffer.byteLength(text)>this.maxBytes)return false;
    await this.fs.mkdir(this.directory,{recursive:true});
    const file=this._file(series),temp=file+'.tmp-'+crypto.randomUUID();
    try{await this.fs.writeFile(temp,text,{mode:0o600});await this.fs.rename(temp,file);}
    catch(error){await this.fs.rm(temp,{force:true}).catch(()=>undefined);throw error;}
    await this._evict(path.basename(file));
    return true;
  }
  /** Reads the body with a hard byte cap (counted as it streams, so a huge body is never held whole) under the request timeout. */
  async _body(response,controller){
    const cap=()=>new BoundaryError('FRED_TOO_LARGE','That FRED series is too large.');
    const interrupted=()=>new BoundaryError('FRED_OFFLINE','The FRED download was interrupted.');
    const read=async()=>{
      if(response.body&&typeof response.body.getReader==='function'){
        const reader=response.body.getReader(),chunks=[];let total=0;
        for(;;){
          let step;try{step=await reader.read();}catch{throw interrupted();}
          if(step.done)break;
          total+=step.value.byteLength;
          if(total>MAX_RESPONSE_BYTES){try{await reader.cancel();}catch{/* closing */}throw cap();}
          chunks.push(Buffer.from(step.value));
        }
        return Buffer.concat(chunks,total);
      }
      let buffer;try{buffer=Buffer.from(await response.arrayBuffer());}catch{throw interrupted();}
      if(buffer.byteLength>MAX_RESPONSE_BYTES)throw cap();
      return buffer;
    };
    let onAbort;
    const aborted=new Promise((_,reject)=>{onAbort=()=>reject(interrupted());if(controller.signal.aborted)onAbort();else controller.signal.addEventListener('abort',onAbort,{once:true});});
    try{return await Promise.race([read(),aborted]);}finally{controller.signal.removeEventListener('abort',onAbort);aborted.catch(()=>undefined);}
  }
  async _download(series){
    const url=urlOf(series),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try{
      let response;
      try{response=await Promise.race([this.fetch(url,{method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal,headers:{'User-Agent':USER_AGENT,'Accept':'text/csv','Accept-Encoding':'identity'}}),new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(new Error('timeout')),{once:true}))]);}
      catch{throw new BoundaryError('FRED_OFFLINE','FRED could not be reached. Check your internet connection and try again.');}
      if(response.status===404||response.status===400)throw new BoundaryError('FRED_NOT_FOUND','FRED has no series named '+series+'.');
      if(response.status===429)throw new BoundaryError('RATE_LIMITED','FRED asked for fewer requests. Try again later.');
      if(response.status>=300&&response.status<400)throw new BoundaryError('REDIRECT_DENIED','FRED redirect was denied.');
      if(response.status!==200)throw new BoundaryError('FRED_HTTP_ERROR','FRED returned an unsuccessful answer ('+response.status+').');
      const type=response.headers&&response.headers.get?response.headers.get('content-type')||'':'';
      if(/html/i.test(type))throw new BoundaryError('FRED_NOT_FOUND','FRED has no series named '+series+'.');
      const declared=Number(response.headers&&response.headers.get?response.headers.get('content-length'):NaN);
      if(Number.isFinite(declared)&&declared>MAX_RESPONSE_BYTES)throw new BoundaryError('FRED_TOO_LARGE','That FRED series is too large.');
      const buffer=await this._body(response,controller);
      let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{throw new BoundaryError('FRED_FORMAT_INVALID','FRED returned invalid text.');}
      // An unknown id can come back as an HTML page with a 200 status; say so plainly instead of a format error.
      if(/^\s*(<!doctype|<html|<\?xml|<head|<body)/i.test(text.slice(0,512)))throw new BoundaryError('FRED_NOT_FOUND','FRED has no series named '+series+'.');
      const rows=parseFredCsv(text,series);
      if(!rows.length)throw new BoundaryError('FRED_NO_DATA','FRED has no values for '+series+'.');
      return rows;
    }finally{clearTimeout(timer);}
  }
  /** One series. Cached under a day: no request. Older: refresh; if the refresh fails, the old copy is returned marked stale. */
  get(raw){
    return this._serial(async()=>{
      if(this.closed)throw new BoundaryError('CLOSED','Public data capability is closed.');
      const series=seriesInput(raw),cached=await this._readRecord(series);
      const provenance={provider:'FRED, Federal Reserve Bank of St. Louis',kind:'public-unauthenticated',sourceUrl:urlOf(series)};
      if(cached&&this.now()-cached.fetchedAt<REFRESH_MS&&this.now()>=cached.fetchedAt)return{schemaVersion:1,series,rows:cached.rows,fetchedAt:cached.fetchedAt,cached:true,stale:false,provenance};
      try{
        const rows=await this._download(series);
        const stored=await this._write(series,rows).catch(()=>false);
        return{schemaVersion:1,series,rows,fetchedAt:this.now(),cached:false,stale:false,cacheStored:stored,provenance};
      }catch(error){
        // Any refresh failure (offline, rate limit, HTTP error, redirect, HTML or malformed answer, oversize
        // body) falls back to a valid saved copy. Only reach failures keep their own words; the rest say the update was unusable,
        // never "no series named", since the saved copy shows the series exists.
        const reach=error&&(error.code==='FRED_OFFLINE'||error.code==='RATE_LIMITED'||error.code==='FRED_HTTP_ERROR');
        if(cached&&!this.closed)return{schemaVersion:1,series,rows:cached.rows,fetchedAt:cached.fetchedAt,cached:true,stale:true,notice:reach?error.message:'FRED did not send a usable update this time.',provenance};
        throw error;
      }
    });
  }
  _status(){return this._entries().then(entries=>({schemaVersion:1,bytes:entries.reduce((s,e)=>s+e.size,0),entries:entries.length,maxBytes:this.maxBytes}));}
  status(){return this._serial(()=>this._status());}
  clear(){return this._serial(async()=>{for(const e of await this._entries())await this.fs.rm(path.join(this.directory,e.name),{force:true}).catch(()=>undefined);return this._status();});}
  close(){this.closed=true;}
}
module.exports={FredSeries,parseFredCsv,seriesInput,urlOf,CACHE_DIRECTORY,MAX_CACHE_BYTES,SERIES_ID};
