'use strict';
const {createHash}=require('node:crypto');
const {BoundaryError,exactKeys,jsonData,cancelInput}=require('./validation.cjs');
const MAX_BYTES=32*1024*1024;
const TIMEOUT_MS=10000;
const MIN_REQUEST_INTERVAL_MS=1000;
const USER_AGENT='OpenCandle/0.8.2 (getopencandle.com; optional public SEC data reader)';
const coverage='SEC non-custom entity-wide XBRL concepts only; filing periods, units and restatements require explicit normalization. Not quotes or complete fundamentals.';
function secInput(value){
  exactKeys(value,['requestId','cik']);
  cancelInput({requestId:value.requestId});
  if(typeof value.cik!=='string'||!/^\d{1,10}$/.test(value.cik)||Number(value.cik)===0)throw new BoundaryError('INVALID_ARGUMENT','Enter a positive CIK containing at most ten digits.');
  return{requestId:value.requestId,cik:value.cik.padStart(10,'0')};
}
function validateCompanyFacts(value,cik){
  const data=jsonData(value);
  if(!Number.isSafeInteger(data.cik)||data.cik<1||data.cik!==Number(cik)||typeof data.entityName!=='string'||data.entityName.length<1||data.entityName.length>1000||!data.facts||typeof data.facts!=='object'||Array.isArray(data.facts))throw new BoundaryError('SEC_SCHEMA_INVALID','SEC company-facts identity or facts schema is invalid.');
  for(const taxonomy of Object.values(data.facts)){
    if(!taxonomy||typeof taxonomy!=='object'||Array.isArray(taxonomy))throw new BoundaryError('SEC_SCHEMA_INVALID','SEC taxonomy schema is invalid.');
    for(const concept of Object.values(taxonomy)){
      if(!concept||typeof concept!=='object'||Array.isArray(concept)||(concept.label!==undefined&&concept.label!==null&&typeof concept.label!=='string')||!concept.units||typeof concept.units!=='object'||Array.isArray(concept.units))throw new BoundaryError('SEC_SCHEMA_INVALID','SEC concept schema is invalid.');
      for(const observations of Object.values(concept.units)){
        if(!Array.isArray(observations))throw new BoundaryError('SEC_SCHEMA_INVALID','SEC unit observations must be arrays.');
        for(const fact of observations){
          if(!fact||typeof fact!=='object'||Array.isArray(fact)||!(typeof fact.val==='string'||typeof fact.val==='number')||typeof fact.end!=='string'||typeof fact.accn!=='string'||typeof fact.form!=='string'||typeof fact.filed!=='string')throw new BoundaryError('SEC_SCHEMA_INVALID','SEC filing observation schema is invalid.');
        }
      }
    }
  }
  return data;
}
function validateSubmissions(value,cik){
  const data=jsonData(value);
  if(!/^\d{1,10}$/.test(String(data.cik))||Number(data.cik)!==Number(cik)||typeof data.name!=='string'||!data.name||data.name.length>1000||!data.filings||typeof data.filings!=='object'||Array.isArray(data.filings))throw new BoundaryError('SEC_SCHEMA_INVALID','SEC submissions identity or filing schema is invalid.');
  const recent=data.filings.recent;
  if(!recent||typeof recent!=='object'||Array.isArray(recent)||!Array.isArray(recent.accessionNumber)||recent.accessionNumber.length>100000)throw new BoundaryError('SEC_SCHEMA_INVALID','SEC recent filings must be bounded parallel arrays.');
  const count=recent.accessionNumber.length;
  for(const key of ['accessionNumber','filingDate','form','primaryDocument'])if(!Array.isArray(recent[key])||recent[key].some(item=>typeof item!=='string'))throw new BoundaryError('SEC_SCHEMA_INVALID','Required SEC filing columns are invalid.');
  for(const column of Object.values(recent))if(!Array.isArray(column)||column.length!==count||column.some(item=>item!==null&&typeof item!=='string'&&typeof item!=='number'&&typeof item!=='boolean'))throw new BoundaryError('SEC_SCHEMA_INVALID','SEC recent filing columns differ in length or contain unsupported values.');
  const history=data.filings.files;
  if(!Array.isArray(history)||history.length>1000)throw new BoundaryError('SEC_SCHEMA_INVALID','SEC history file list is invalid.');
  for(const file of history)if(!file||typeof file!=='object'||Array.isArray(file)||typeof file.name!=='string'||!new RegExp('^CIK'+cik+'-submissions-\\d{3,6}\\.json$').test(file.name)||!Number.isSafeInteger(file.filingCount)||file.filingCount<0||typeof file.filingFrom!=='string'||typeof file.filingTo!=='string')throw new BoundaryError('SEC_SCHEMA_INVALID','SEC history file metadata is invalid.');
  return data;
}
class SecCompanyFacts {
  constructor({fetchImpl=globalThis.fetch,now=Date.now,timeoutMs=TIMEOUT_MS}={}){this.fetch=fetchImpl;this.now=now;this.timeoutMs=timeoutMs;this.active=new Map();this.nextAllowedAt=0;this.closed=false;}
  run(raw,kind='companyfacts'){
    if(!['companyfacts','submissions'].includes(kind))return Promise.resolve({ok:false,error:{code:'INVALID_ARGUMENT',message:'Unsupported fixed SEC capability.'}});
    let input;try{input=secInput(raw);}catch(error){return Promise.resolve({ok:false,error:{code:error.code||'INVALID_ARGUMENT',message:error.message}});}
    if(this.closed)return Promise.resolve({ok:false,error:{code:'CLOSED',message:'Public data capability is closed.'}});
    if(this.active.size)return Promise.resolve({ok:false,error:{code:'BUSY',message:'A public SEC request is already active.'}});
    if(this.now()<this.nextAllowedAt)return Promise.resolve({ok:false,error:{code:'RATE_LIMITED',message:'SEC requests are locally limited. Wait before requesting again.'}});
    this.nextAllowedAt=this.now()+MIN_REQUEST_INTERVAL_MS;
    const sourceUrl=kind==='companyfacts'?'https://data.sec.gov/api/xbrl/companyfacts/CIK'+input.cik+'.json':'https://data.sec.gov/submissions/CIK'+input.cik+'.json';
    return new Promise(resolve=>{
      let finished=false;
      let reader;
      const controller=new AbortController();
      const finish=result=>{if(finished)return;finished=true;clearTimeout(timer);this.active.delete(input.requestId);controller.abort();void reader?.cancel().catch(()=>{});resolve(result);};
      const timer=setTimeout(()=>finish({ok:false,error:{code:'TIMEOUT',message:'SEC request exceeded ten seconds.'}}),this.timeoutMs);
      this.active.set(input.requestId,{cancel:()=>finish({ok:false,error:{code:'CANCELLED',message:'SEC request cancelled before data commit.'}})});
      void(async()=>{
        try{
          const response=await this.fetch(sourceUrl,{method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal,headers:{'User-Agent':USER_AGENT,'Accept':'application/json','Accept-Encoding':'identity'}});
          if(finished){await response.body?.cancel().catch(()=>{});return;}
          if(response.status===403||response.status===429){this.nextAllowedAt=this.now()+10*60*1000;throw new BoundaryError(response.status===403?'SEC_ACCESS_DENIED':'RATE_LIMITED','SEC denied or limited this public request. No retry was made.');}
          if(response.status>=300&&response.status<400)throw new BoundaryError('REDIRECT_DENIED','SEC redirect was denied.');
          if(response.status===404)throw new BoundaryError('SEC_NOT_FOUND','No SEC response was found for that CIK and capability.');
          if(response.status!==200)throw new BoundaryError('SEC_HTTP_ERROR','SEC returned an unsuccessful public-data response.');
          if(response.url!==sourceUrl)throw new BoundaryError('SEC_ORIGIN_DENIED','Unexpected public-data response URL.');
          const type=response.headers.get('content-type')||'';
          if(!/^application\/json(?:\s*;|$)/i.test(type))throw new BoundaryError('SEC_FORMAT_INVALID','Expected a SEC JSON response.');
          const declared=Number(response.headers.get('content-length'));
          if(Number.isFinite(declared)&&declared>MAX_BYTES)throw new BoundaryError('SEC_TOO_LARGE','SEC response exceeds the 32 MiB limit.');
          if(!response.body)throw new BoundaryError('SEC_FORMAT_INVALID','SEC response body is absent.');
          reader=response.body.getReader();const chunks=[];let bytes=0;
          try{
            while(true){const item=await reader.read();if(finished)return;if(item.done)break;bytes+=item.value.byteLength;if(bytes>MAX_BYTES)throw new BoundaryError('SEC_TOO_LARGE','SEC response exceeds the 32 MiB limit.');chunks.push(Buffer.from(item.value));}
          }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
          if(finished)return;
          const buffer=Buffer.concat(chunks,bytes);
          let raw;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));}catch{throw new BoundaryError('SEC_FORMAT_INVALID','SEC returned invalid UTF-8 JSON.');}
          const data=kind==='companyfacts'?validateCompanyFacts(raw,input.cik):validateSubmissions(raw,input.cik);
          if(finished)return;
          const additional=kind==='submissions'?{recentCount:data.filings.recent.accessionNumber.length,historyFiles:data.filings.files,historyFetched:false}:{};
          finish({ok:true,value:{schemaVersion:1,cik:input.cik,entityName:kind==='companyfacts'?data.entityName:data.name,data,...additional,provenance:{provider:'SEC EDGAR',kind:'public-unauthenticated',sourceUrl,retrievedAt:new Date(this.now()).toISOString(),sha256:createHash('sha256').update(buffer).digest('hex'),bytes,coverage:kind==='companyfacts'?coverage:'SEC recent filing columns only. Referenced history files are not fetched; not complete filing history or a general news feed.'}}});
        }catch(error){if(!finished)finish({ok:false,error:{code:error instanceof BoundaryError?error.code:'SEC_NETWORK_ERROR',message:error instanceof BoundaryError?error.message:'Public SEC request failed. No retry was made.'}});}
      })();
    });
  }
  cancel(requestId){const request=this.active.get(requestId);if(!request)return false;request.cancel();return true;}
  close(){this.closed=true;for(const request of Array.from(this.active.values()))request.cancel();}
}
module.exports={SecCompanyFacts,secInput,validateCompanyFacts,validateSubmissions,MAX_BYTES,USER_AGENT};
