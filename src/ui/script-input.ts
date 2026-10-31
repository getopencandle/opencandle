import type {Bar} from '../domain/types';
import type {ChartSourceContext} from '../chart/source-context';
export function scriptExecutionIdentity(source:ChartSourceContext,style:string,run:string):string{return JSON.stringify([source.datasetId,source.revision,source.resolution??null,source.fixture,source.basisIdentity??null,source.label,style,run]);}
/**
 * A run hashed every bar again (one SHA-256 per bar, about 300 ms for 20,000 bars), although a live tick or a
 * rerun changes only the newest bars. Each ID is a pure function of its hashed text, so finished IDs are remembered per
 * source identity, keyed by the rest of that exact text (index and OHLCV). A hit returns the same string the digest would.
 * Bounded by one row budget across all sources, SCRIPT_BAR_ID_CACHE_ROWS rows in total
 * (about 420 bytes each retained, so about 40 MB), least recently used source first. A source that alone outgrows the
 * budget starts over (its rows are cleared), as before. At most SCRIPT_BAR_ID_CACHE_IDENTITIES sources are kept.
 */
export const SCRIPT_BAR_ID_CACHE_ROWS=96000;
export const SCRIPT_BAR_ID_CACHE_IDENTITIES=8;
const idCache=new Map<string,Map<string,string>>();
let cachedRows=0;
function identityCache(identity:string):Map<string,string>{
 let rows=idCache.get(identity);
 if(rows)idCache.delete(identity);else rows=new Map();
 idCache.set(identity,rows);
 while(idCache.size>SCRIPT_BAR_ID_CACHE_IDENTITIES)evictOldest(rows);
 return rows;
}
/** Drops the least recently used source other than `keep`; false when `keep` is the only one. */
function evictOldest(keep:Map<string,string>):boolean{
 for(const [identity,rows] of idCache){if(rows===keep)continue;idCache.delete(identity);cachedRows-=rows.size;return true;}
 return false;
}
/** Remembers one ID under the row budget (the current source is never evicted for its own row). */
function remember(rows:Map<string,string>,key:string,id:string):void{
 if(idCache.get(identityKeyOf(rows))!==rows)return;/* an evicted source: the ID is still returned, not kept */
 if(rows.has(key)){rows.set(key,id);return;}
 while(cachedRows>=SCRIPT_BAR_ID_CACHE_ROWS&&evictOldest(rows));
 if(cachedRows>=SCRIPT_BAR_ID_CACHE_ROWS){cachedRows-=rows.size;rows.clear();}
 rows.set(key,id);cachedRows++;
}
const identityKeys=new WeakMap<Map<string,string>,string>();
function identityKeyOf(rows:Map<string,string>):string{return identityKeys.get(rows)??'';}
/** Test support: forget remembered IDs. */
export function clearScriptBarIdCache():void{idCache.clear();cachedRows=0;}
/** Test support: rows remembered across every source. */
export function scriptBarIdCacheRows():number{return cachedRows;}
/** Bytes of the SHA-256 digest a script bar ID keeps (128 bits, 32 hex characters). */
export const SCRIPT_BAR_ID_BYTES=16;
/** Source identity includes revision, transform and replay run. Each ID also binds exact OHLCV. */
export async function scriptBarIds(identity:string,bars:readonly Bar[]):Promise<string[]>{
 const encoder=new TextEncoder(),rows=identityCache(identity),prefix='['+JSON.stringify(identity)+',';identityKeys.set(rows,identity);
 // The hashed text is JSON of [identity,index,time,open,high,low,close,volume]. For one identity the rest of that array fixes
 // it, so the rest is the cache key and the text is rebuilt from it (an array serializes as its elements joined by commas).
 const ids:string[]=new Array(bars.length),misses:Array<Promise<void>>=[];
 bars.forEach((bar,index)=>{
  const key=JSON.stringify([index,bar.time,bar.open,bar.high,bar.low,bar.close,bar.volume]),known=rows.get(key);
  if(known!==undefined){ids[index]=known;return;}
  misses.push(crypto.subtle.digest('SHA-256',encoder.encode(prefix+key.slice(1))).then(digest=>{
   // The first 128 bits of the digest. The script snapshot keeps one ID per processed bar inside the 512 KiB
   // output budget, and the full 64-character digest alone took about half of it on a 3,900-bar chart.
   const id='b:'+Array.from(new Uint8Array(digest,0,SCRIPT_BAR_ID_BYTES),value=>value.toString(16).padStart(2,'0')).join('');
   remember(rows,key,id);ids[index]=id;
  }));
 });
 await Promise.all(misses);
 // A hole in the input stays undefined in the result, as Promise.all over the mapped holes returned it.
 for(let index=0;index<ids.length;index++)if(!(index in ids))ids[index]=undefined as unknown as string;
 return ids;
}
