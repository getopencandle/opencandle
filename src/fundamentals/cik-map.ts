/** Ticker to CIK map built from a file the user imports (SEC company_tickers.json or
 * company_tickers_exchange.json). Nothing is fetched here; the user downloads the file themselves.
 * The map only fills a form field. LV still never links a company to a chart symbol by itself. */
export interface CikEntry {ticker:string;cik:string;title:string}
export interface CikMap {schemaVersion:1;importedAt:string;entries:CikEntry[]}
export const MAX_CIK_FILE_BYTES=20*1024*1024,MAX_CIK_ENTRIES=100000;
/** Kept from the first release: two CIKs taken from SEC filing indexes (see docs/fundamentals.md). */
export const BUILTIN_CIKS:Readonly<Record<string,string>>={GME:'0001326380',SPY:'0000884394'};
const STORAGE_KEY='lv.fundamentals.cik-map.v1';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const cikText=(v:unknown):string|null=>{const text=typeof v==='number'&&Number.isSafeInteger(v)?String(v):typeof v==='string'?v.trim():'';return /^\d{1,10}$/.test(text)&&Number(text)>0?text.padStart(10,'0'):null;};
const normalize=(ticker:string)=>ticker.trim().toUpperCase();
/** Both SEC shapes: {"0":{cik_str,ticker,title}} and {fields:[...],data:[[cik,name,ticker,exchange]]}. Bad rows are counted, not guessed. */
export function parseTickerFile(text:string,importedAt:string=new Date().toISOString()):{map:CikMap;skipped:number}{
 if(new TextEncoder().encode(text).length>MAX_CIK_FILE_BYTES)throw new Error('The ticker file exceeds 20 MiB.');
 let json:unknown;try{json=JSON.parse(text);}catch{throw new Error('The ticker file is not valid JSON. Choose SEC company_tickers.json.');}
 const rows:{cik:unknown;ticker:unknown;title:unknown}[]=[],none={cik:null,ticker:null,title:''};
 if(object(json)&&Array.isArray(json.fields)&&Array.isArray(json.data)){
  const fields=json.fields as unknown[],c=fields.indexOf('cik'),t=fields.indexOf('ticker'),n=fields.indexOf('name');
  if(c<0||t<0)throw new Error('The ticker file has no cik and ticker columns.');
  for(const row of json.data as unknown[])rows.push(Array.isArray(row)?{cik:row[c],ticker:row[t],title:n>=0?row[n]:''}:none);
 }else if(object(json)){
  for(const row of Object.values(json))rows.push(object(row)?{cik:row.cik_str??row.cik,ticker:row.ticker,title:row.title??row.name}:none);
 }else throw new Error('Expected SEC company_tickers.json.');
 if(rows.length>MAX_CIK_ENTRIES)throw new Error('The ticker file has more than '+MAX_CIK_ENTRIES.toLocaleString()+' rows.');
 const seen=new Set<string>(),entries:CikEntry[]=[];let skipped=0;
 for(const row of rows){
  const cik=cikText(row.cik),ticker=typeof row.ticker==='string'?normalize(row.ticker):'';
  if(!cik||!/^[A-Z0-9][A-Z0-9.\-^/]{0,19}$/.test(ticker)||seen.has(ticker)){skipped++;continue;}
  seen.add(ticker);
  entries.push({ticker,cik,title:typeof row.title==='string'?row.title.slice(0,200):''});
 }
 if(!entries.length)throw new Error('The ticker file contains no usable ticker rows.');
 return {map:{schemaVersion:1,importedAt,entries},skipped};
}
export function restoreCikMap(input:unknown):CikMap{
 if(!object(input)||input.schemaVersion!==1||typeof input.importedAt!=='string'||!Array.isArray(input.entries)||input.entries.length>MAX_CIK_ENTRIES)throw new Error('Invalid saved ticker map.');
 const entries=input.entries.map((row:unknown)=>{
  if(!object(row)||typeof row.ticker!=='string'||typeof row.title!=='string'||cikText(row.cik)!==row.cik)throw new Error('Invalid saved ticker row.');
  return {ticker:row.ticker,cik:row.cik as string,title:row.title};
 });
 return {schemaVersion:1,importedAt:input.importedAt,entries};
}
const indexes=new WeakMap<CikMap,Map<string,CikEntry>>();
function index(map:CikMap){let found=indexes.get(map);if(!found){found=new Map(map.entries.map(row=>[row.ticker,row]));indexes.set(map,found);}return found;}
/** Chart symbols use "BRK.B" or "BRK-B" or "BRK/B"; SEC uses "BRK-B". All spellings are tried, the exact one first. */
export function lookupCik(map:CikMap|null,symbol:string):{cik:string;title:string;source:'ticker-file'|'built-in'}|null{
 const base=normalize(symbol);if(!base)return null;
 if(map){const found=index(map);for(const key of [base,base.replace(/[./]/g,'-'),base.replace(/[-/]/g,'.')]){const hit=found.get(key);if(hit)return {cik:hit.cik,title:hit.title,source:'ticker-file'};}}
 return Object.hasOwn(BUILTIN_CIKS,base)?{cik:BUILTIN_CIKS[base],title:'',source:'built-in'}:null;
}
function safeStorage():Storage|null{try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}}
/** Browser storage is a per-viewer convenience: every access is guarded and the dialog works without it. */
export function loadCikMap(storage:Pick<Storage,'getItem'>|null=safeStorage()):CikMap|null{
 try{const raw=storage?.getItem(STORAGE_KEY);return raw?restoreCikMap(JSON.parse(raw)):null;}catch{return null;}
}
export function saveCikMap(map:CikMap|null,storage:Pick<Storage,'setItem'|'removeItem'>|null=safeStorage()):boolean{
 try{if(!storage)return false;if(map===null)storage.removeItem(STORAGE_KEY);else storage.setItem(STORAGE_KEY,JSON.stringify(map));return true;}catch{return false;}
}
