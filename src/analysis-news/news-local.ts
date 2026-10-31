import {newsItemKey,queryNews,type NewsDocument,type NewsFlow,type NewsItem} from './news';
import type {FilingsDocument} from './filings';
import type {CikMap} from '../fundamentals/cik-map';
/** Local-only News companions: SEC filings mapped to news items, per-item read state and flow alerts.
 * Kept in browser storage beside (not inside) the workspace, so alerts never touch src/domain/alert*.ts
 * and no workspace schema changes. Every storage access is guarded; the dialog works without it. */
export const NEWS_LOCAL_KEY='lv.news.local.v1';
export const READ_LIMIT=20000,KNOWN_LIMIT=30000,PENDING_LIMIT=500;
export interface PendingAlert {key:string;flowId:string}
export interface NewsLocal {schemaVersion:1;showFilings:boolean;alertFlowIds:string[];read:string[];/** Every item key seen by the last alert pass; null until the first pass (no alert flood for existing items). */known:string[]|null;pending:PendingAlert[]}
export const emptyNewsLocal=():NewsLocal=>({schemaVersion:1,showFilings:false,alertFlowIds:[],read:[],known:null,pending:[]});
const strings=(v:unknown,max:number):string[]|null=>Array.isArray(v)&&v.length<=max&&v.every(x=>typeof x==='string'&&x.length<=500)?v as string[]:null;
export function restoreNewsLocal(value:unknown):NewsLocal{
 const v=value as Record<string,unknown>|null;if(!v||typeof v!=='object'||v.schemaVersion!==1)return emptyNewsLocal();
 const read=strings(v.read,READ_LIMIT),flows=strings(v.alertFlowIds,100),known=v.known===null?null:strings(v.known,KNOWN_LIMIT);
 const pending=Array.isArray(v.pending)&&v.pending.length<=PENDING_LIMIT&&v.pending.every((p:any)=>p&&typeof p.key==='string'&&typeof p.flowId==='string')?(v.pending as PendingAlert[]).map(p=>({key:p.key,flowId:p.flowId})):[];
 return {schemaVersion:1,showFilings:v.showFilings===true,alertFlowIds:flows??[],read:read??[],known:known===undefined?null:known,pending};
}
function safeStorage():Storage|null{try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}}
export function loadNewsLocal(storage:Pick<Storage,'getItem'>|null=safeStorage()):NewsLocal{try{const raw=storage?.getItem(NEWS_LOCAL_KEY);return raw?restoreNewsLocal(JSON.parse(raw)):emptyNewsLocal();}catch{return emptyNewsLocal();}}
export function saveNewsLocal(local:NewsLocal,storage:Pick<Storage,'setItem'>|null=safeStorage()):boolean{try{if(!storage)return false;storage.setItem(NEWS_LOCAL_KEY,JSON.stringify(local));return true;}catch{return false;}}
export function filingsDocumentId(doc:FilingsDocument){return 'sec:'+doc.id;}
/** Submissions rows become news items: provider SEC, format Filing. The instrument is a ticker only when the imported
 * ticker file maps this CIK; otherwise it stays unknown (never guessed from the entity name). Dates have day precision. */
export function filingsToNewsDocuments(filings:readonly FilingsDocument[],map:CikMap|null):NewsDocument[]{
 const tickers=new Map<string,string>();if(map)for(const e of map.entries)if(!tickers.has(e.cik))tickers.set(e.cik,e.ticker);
 return filings.map(doc=>{
  const ticker=tickers.get(doc.cik)??null,origin=doc.source.kind==='sec-public'?'public SEC retrieval':'local file, unverified';
  const items=doc.rows.map((r):NewsItem=>({
   id:r.accession,title:r.form+' filing · '+doc.entityName,
   summary:[r.description??r.primaryDocument,'Filed '+r.filed+' (day precision)',r.reportDate?'Report date '+r.reportDate:'Report date unavailable',r.acceptanceReported?'Acceptance as reported: '+r.acceptanceReported:'Acceptance time unavailable','Accession '+r.accession,'Source: '+origin+'.'].join('\n'),
   provider:'SEC',publishedAt:r.filed+'T00:00:00.000Z',sourceUrl:r.url,instruments:ticker?[ticker]:null,markets:null,sectors:null,corporateActivity:null,economics:null,countries:null,formats:['Filing']}));
  return {id:filingsDocumentId(doc),schemaVersion:1,label:'SEC filings · '+doc.entityName.slice(0,150),importedAt:doc.source.retrievedAt,kind:'local-import',items};
 });
}
const capTail=<T,>(rows:T[],limit:number)=>rows.length>limit?rows.slice(rows.length-limit):rows;
export const readSet=(local:NewsLocal)=>new Set(local.read);
export function markRead(local:NewsLocal,keys:readonly string[]):NewsLocal{
 if(!keys.length)return local;const have=new Set(local.read),add=keys.filter(k=>!have.has(k)),gone=new Set(keys);
 const pending=local.pending.filter(p=>!gone.has(p.key));
 if(!add.length&&pending.length===local.pending.length)return local;
 return {...local,read:capTail([...local.read,...add],READ_LIMIT),pending};
}
export function markUnread(local:NewsLocal,key:string):NewsLocal{return local.read.includes(key)?{...local,read:local.read.filter(k=>k!==key)}:local;}
export function setFlowAlert(local:NewsLocal,flowId:string,on:boolean):NewsLocal{
 const has=local.alertFlowIds.includes(flowId);if(has===on)return local;
 return {...local,alertFlowIds:on?[...local.alertFlowIds,flowId]:local.alertFlowIds.filter(id=>id!==flowId),pending:on?local.pending:local.pending.filter(p=>p.flowId!==flowId)};
}
/** One alert pass after documents or flows change. Items whose key was not in `known` and that match a saved flow with
 * alerts enabled (its saved query, not an unsaved draft) become pending. The first pass only records what exists. */
export function evaluateFlowAlerts(local:NewsLocal,documents:readonly NewsDocument[],flows:readonly NewsFlow[],watchlist:readonly string[]):{local:NewsLocal;added:PendingAlert[]}{
 const keys:string[]=[];for(const d of documents)for(const item of d.items)keys.push(newsItemKey(d.id,item.id));
 const flowIds=new Set(flows.map(f=>f.id));
 let pending=local.pending.filter(p=>flowIds.has(p.flowId)&&local.alertFlowIds.includes(p.flowId));
 const added:PendingAlert[]=[];
 if(local.known!==null){
  const known=new Set(local.known),fresh=new Set(keys.filter(k=>!known.has(k)));
  if(fresh.size)for(const flow of flows){if(!local.alertFlowIds.includes(flow.id))continue;
   let rows;try{rows=queryNews(documents,flow.query,watchlist).rows;}catch{continue;}
   for(const row of rows){const key=newsItemKey(row.documentId,row.id);if(fresh.has(key)&&!pending.some(p=>p.key===key&&p.flowId===flow.id)&&!local.read.includes(key))added.push({key,flowId:flow.id});}}
 }
 const knownNext=keys.length>KNOWN_LIMIT?keys.slice(keys.length-KNOWN_LIMIT):keys;
 pending=capTail([...pending,...added],PENDING_LIMIT);
 const same=local.known!==null&&local.known.length===knownNext.length&&local.known.every((k,i)=>k===knownNext[i])&&pending.length===local.pending.length&&!added.length;
 return same?{local,added}:{local:{...local,known:knownNext,pending},added};
}
