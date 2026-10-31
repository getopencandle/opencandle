import {NEWS_FIELDS,emptyNewsQuery,type NewsDocument,type NewsField,type NewsQuery} from './news';
// Pure view-model helpers for the News dialog: list navigation, draft comparison,
// filter value menus and coverage disclosure. No DOM, no network, no persistence.
/** LV policy: PageUp/PageDown/Space move by ten headlines; the reference distance is unpublished. */
export const NEWS_PAGE_STEP=10;
/**
 * Next highlighted headline index for a list navigation key, or null for keys the list does not own.
 * With no highlight, every navigation key highlights the first headline except End (last).
 */
export function moveNewsSelection(current:number,count:number,key:string,shift=false,page=NEWS_PAGE_STEP):number|null{
 const nav=['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '];if(!nav.includes(key))return null;if(count<=0)return null;
 if(current<0||current>=count)return key==='End'?count-1:0;
 const delta=key==='ArrowDown'?1:key==='ArrowUp'?-1:key==='PageDown'?page:key==='PageUp'?-page:key===' '?(shift?-page:page):key==='Home'?-Infinity:Infinity;
 return Math.max(0,Math.min(count-1,current+delta));
}
/** Semantic equality of two flow queries. Value order within a field is not significant; control order is. */
export function sameNewsQuery(a:NewsQuery,b:NewsQuery):boolean{
 if(a.search!==b.search||a.from!==b.from||a.to!==b.to||a.order!==b.order||a.watchlist!==b.watchlist||a.visible.length!==b.visible.length||a.visible.some((v,i)=>v!==b.visible[i]))return false;
 return NEWS_FIELDS.every(key=>{const x=a.values[key],y=b.values[key];return x.length===y.length&&x.every(v=>y.includes(v));});
}
/** Clears every predicate (field values, watchlist, search, dates) and restores newest-first order. Field controls stay. */
export function resetNewsView(query:NewsQuery):NewsQuery{return {...query,search:'',from:'',to:'',order:'newest',watchlist:false,visible:[...query.visible],values:emptyNewsQuery().values};}
/** Shows the Instrument control and selects exactly the given chart symbol. Other fields are unchanged. */
export function focusSymbolQuery(query:NewsQuery,symbol:string):NewsQuery{const value=symbol.trim();if(!value||value.length>100)throw new Error('The chart symbol is unavailable for a news filter.');return {...query,visible:query.visible.includes('instruments')?[...query.visible]:[...query.visible,'instruments'],values:{...query.values,instruments:[value]}};}
export type NewsOptionIndex=Record<NewsField,Map<string,number>>;
/** Counts how many supplied items carry each value, per field. Missing metadata contributes nothing. */
export function newsOptionIndex(documents:readonly NewsDocument[]):NewsOptionIndex{
 const index=Object.fromEntries(NEWS_FIELDS.map(key=>[key,new Map<string,number>()])) as NewsOptionIndex;
 for(const doc of documents)for(const item of doc.items)for(const key of NEWS_FIELDS)for(const value of key==='provider'?[item.provider]:item[key]??[])index[key].set(value,(index[key].get(value)??0)+1);
 return index;
}
export interface NewsOption {value:string;count:number;supplied:boolean;selected:boolean;}
/**
 * Values offered in a filter menu: every supplied value plus any selected value no longer supplied
 * (so a saved flow's stale selection stays visible and removable). Sorted by code unit; optional search.
 */
export function newsFieldOptions(index:NewsOptionIndex,field:NewsField,selected:readonly string[],search=''):NewsOption[]{
 const counts=index[field],values=[...new Set([...counts.keys(),...selected])].sort(),term=search.trim().toLocaleLowerCase();
 return values.filter(v=>!term||v.toLocaleLowerCase().includes(term)).map(value=>({value,count:counts.get(value)??0,supplied:counts.has(value),selected:selected.includes(value)}));
}
export interface NewsCoverage {items:number;first:string|null;last:string|null;providers:number;}
/** Publication-time span and provider count actually present in one imported document. */
export function documentCoverage(doc:NewsDocument):NewsCoverage{
 let first:string|null=null,last:string|null=null;const providers=new Set<string>();
 for(const item of doc.items){providers.add(item.provider);if(first===null||item.publishedAt<first)first=item.publishedAt;if(last===null||item.publishedAt>last)last=item.publishedAt;}
 return {items:doc.items.length,first,last,providers:providers.size};
}
/** Formats a normalized ISO UTC timestamp for display without changing its value or zone. */
export function formatUtc(iso:string):string{const m=/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?Z$/.exec(iso);return m?m[1]+' '+m[2]+' UTC':iso;}
/** The comparison form of a headline. Tags, case, punctuation and spacing are ignored. */
export function duplicateStoryKey(title:string):string{return title.replace(/<[^>]*>/g,' ').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
/** Stories with the same comparison headline published within this window of the kept story count as duplicates. */
export const DUPLICATE_WINDOW_SECONDS=72*3600;
/**
 * Duplicate collapsing: in the current order, the first story of each comparison headline is kept and later
 * stories with the same headline, from any provider, published within 72 hours of it are folded into it. `similar` maps
 * the kept row key to the folded count. Empty comparison headlines are never folded. Nothing is removed from storage.
 */
export function collapseDuplicateStories<T extends {title:string;publishedAt:string}>(rows:readonly T[],keyOf:(row:T)=>string):{rows:T[];similar:Map<string,number>;folded:number}{
 const kept:T[]=[],similar=new Map<string,number>(),groups=new Map<string,{key:string;at:number}[]>();let folded=0;
 for(const row of rows){const title=duplicateStoryKey(row.title),at=Date.parse(row.publishedAt)/1000;
  const group=title?groups.get(title):undefined,hit=group?.find(g=>Math.abs(g.at-at)<=DUPLICATE_WINDOW_SECONDS);
  if(hit){similar.set(hit.key,(similar.get(hit.key)??0)+1);folded++;continue;}
  kept.push(row);if(title){const key=keyOf(row);if(group)group.push({key,at});else groups.set(title,[{key,at}]);}}
 return {rows:kept,similar,folded};
}
/** Lower-cased primary language subtag ("en" for "en-GB"). */
export const newsLanguagePrimary=(tag:string)=>tag.toLowerCase().split('-')[0];
/**
 * Keeps stories whose supplied language tag equals the chosen tag or
 * shares its primary subtag. Untagged stories are left out while a language is chosen. When nothing matches but other
 * stories do, every story is shown and `fellBack` is true so the view can say so. An empty choice means all languages.
 */
export function filterNewsLanguage<T extends {language?:string}>(rows:readonly T[],language:string):{rows:T[];fellBack:boolean}{
 if(!language)return {rows:[...rows],fellBack:false};
 const primary=newsLanguagePrimary(language),match=rows.filter(r=>!!r.language&&(r.language.toLowerCase()===language.toLowerCase()||newsLanguagePrimary(r.language)===primary));
 return match.length||!rows.length?{rows:match,fellBack:false}:{rows:[...rows],fellBack:true};
}
/** Distinct supplied language tags across documents, sorted. */
export function newsLanguages(documents:readonly NewsDocument[]):string[]{const out=new Set<string>();for(const d of documents)for(const item of d.items)if(item.language)out.add(item.language);return [...out].sort();}
