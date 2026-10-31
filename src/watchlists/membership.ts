import type {BarDataset} from '../domain/types';
import {FLAG_COLORS,WATCH_LIMITS,activeWatchList,marketKey,referenceFromDataset,restoreWatchBook,restoreWatchReference,watchMemberKey,type FlagColor,type WatchBook,type WatchList,type WatchReference} from './model';

/**
 * Stable watchlist membership API for other analysis tools (screener universe, Add to watchlist, Flag).
 * Every write is atomic: it returns a complete validated book or throws without a partial result.
 * Contract for callers: ANY thrown error means nothing changed. Typed errors: WatchCapacityError (limits),
 * WatchStaleError (list deleted or changed), WatchReferenceError (an invalid market/source reference).
 * Source-aware identity = exchange + ticker + bound dataset ID. Flag identity = exchange + ticker.
 */
export class WatchCapacityError extends Error {readonly code='capacity';constructor(message:string){super(message);this.name='WatchCapacityError';}}
export class WatchStaleError extends Error {readonly code='stale';constructor(message:string){super(message);this.name='WatchStaleError';}}
export class WatchReferenceError extends Error {readonly code='reference';constructor(message:string){super(message);this.name='WatchReferenceError';}}
function validReference(input:unknown):WatchReference{try{return restoreWatchReference(input);}catch(cause){throw new WatchReferenceError((cause instanceof Error?cause.message:String(cause))+' Exchange and ticker must be uppercase A-Z, 0-9 and . ^ _ - (ticker up to 24 characters). Nothing was changed.');}}
export interface WatchListChoice {id:string;name:string;kind:'custom'|'flag';color:FlagColor|null;favorite:boolean;active:boolean;symbols:number;sections:number;revision:string}
export interface WatchAddResult {book:WatchBook;listId:string;added:WatchReference[];skipped:WatchReference[]}
/** sectionId (custom lists only): append after the last row of that section instead of at the bottom of the list. */
export interface WatchWriteOptions {expectedRevision?:string;sectionId?:string}
export {watchMemberKey};
export const watchMarketKey=(reference:Pick<WatchReference,'exchange'|'symbol'>)=>marketKey(reference as WatchReference);

/** Resolve any custom or flagged list by ID without changing the active list. */
export function watchListById(book:WatchBook,listId:string):WatchList{
 if(typeof listId!=='string')throw new WatchStaleError('Choose a watchlist.');
 if(listId.startsWith('flag:')){const color=listId.slice(5) as FlagColor;if(!FLAG_COLORS.includes(color))throw new WatchStaleError('The selected flagged list does not exist.');return activeWatchList({...book,activeId:listId});}
 const list=book.lists.find(row=>row.id===listId);if(!list)throw new WatchStaleError('The selected watchlist was deleted or replaced. Choose a current list.');return list;
}
/** Content fingerprint of one list. Compare before a write to reject actions against a list that changed. */
export function watchListRevision(book:WatchBook,listId:string):string{const list=watchListById(book,listId);return JSON.stringify([list.id,list.name,list.rows]);}
function assertRevision(book:WatchBook,listId:string,options?:WatchWriteOptions){if(options?.expectedRevision!==undefined&&watchListRevision(book,listId)!==options.expectedRevision)throw new WatchStaleError('This watchlist changed after it was chosen. Review the current list and try again.');}
/** Lists for pickers: custom lists in book order (favorites first), then red and every non-empty flag color. */
export function watchListChoices(book:WatchBook):WatchListChoice[]{
 const custom=book.lists.map(list=>({id:list.id,name:list.name,kind:'custom' as const,color:null,favorite:list.favorite,active:book.activeId===list.id,symbols:list.rows.filter(row=>row.kind==='symbol').length,sections:list.rows.filter(row=>row.kind==='section').length,revision:watchListRevision(book,list.id)}));
 const flagged=FLAG_COLORS.filter(color=>color==='red'||book.flags.some(row=>row.color===color)).map(color=>{const id='flag:'+color,list=watchListById(book,id);return{id,name:list.name,kind:'flag' as const,color,favorite:false,active:book.activeId===id,symbols:list.rows.length,sections:0,revision:watchListRevision(book,id)};});
 return [...custom.filter(row=>row.favorite),...custom.filter(row=>!row.favorite),...flagged];
}
/** Symbol members of a list in manual order (sections excluded). Use as the screener "universe = watchlist" input. */
export function watchListMembers(book:WatchBook,listId:string):WatchReference[]{return watchListById(book,listId).rows.flatMap(row=>row.kind==='symbol'?[structuredClone(row.reference)]:[]);}
export function watchMembership(book:WatchBook,listId:string):{sources:Set<string>;markets:Set<string>}{const members=watchListMembers(book,listId);return{sources:new Set(members.map(watchMemberKey)),markets:new Set(members.map(watchMarketKey))};}
/** 'source' matches exchange, ticker and exact dataset; 'market' matches exchange and ticker across sources. */
export function isWatchMember(book:WatchBook,listId:string,reference:WatchReference,match:'source'|'market'='source'):boolean{const set=watchMembership(book,listId);return match==='source'?set.sources.has(watchMemberKey(reference)):set.markets.has(watchMarketKey(reference));}
/** Exact source-bound reference for a supplied dataset. Synthetic fixtures stay explicitly synthetic. */
export function watchReferenceForDataset(dataset:BarDataset):WatchReference{return validReference(referenceFromDataset(dataset));}
const flagIndexes=new WeakMap<object,ReadonlyMap<string,FlagColor>>();
/** Market key to flag color, built once per flags array (books are replaced, never mutated, on change). */
export function watchFlagIndex(book:WatchBook):ReadonlyMap<string,FlagColor>{let index=flagIndexes.get(book.flags);if(!index){index=new Map(book.flags.map(row=>[marketKey(row.reference),row.color]));flagIndexes.set(book.flags,index);}return index;}
export function watchFlagOf(book:WatchBook,reference:Pick<WatchReference,'exchange'|'symbol'>):FlagColor|null{return watchFlagIndex(book).get(watchMarketKey(reference))??null;}
function capacity(book:WatchBook,list:WatchList|null,adding:number){
 if(list&&list.rows.length+adding>WATCH_LIMITS.rowsPerList)throw new WatchCapacityError(`"${list.name}" would hold ${list.rows.length+adding} rows; one list holds at most 5,000. Nothing was added.`);
 const total=book.lists.reduce((sum,row)=>sum+row.rows.length,0);if(list&&total+adding>WATCH_LIMITS.rows)throw new WatchCapacityError(`Local watchlists would hold ${total+adding} rows; the book holds at most 20,000. Nothing was added.`);
}
/** One validated publication for a whole batch; mirrors setWatchFlag's active-list and last-color rules. */
function applyFlags(book:WatchBook,references:readonly WatchReference[],color:FlagColor|null):WatchBook{const keys=new Set(references.map(watchMarketKey)),flags=book.flags.filter(row=>!keys.has(marketKey(row.reference)));if(color)for(const reference of references)flags.push({reference:structuredClone(reference),color});const activeId=book.activeId.startsWith('flag:')&&book.activeId!=='flag:red'&&!flags.some(row=>'flag:'+row.color===book.activeId)?'flag:red':book.activeId;return restoreWatchBook(withinBytes({...book,flags,activeId,lastFlag:color??book.lastFlag}));}
function withinBytes(candidate:WatchBook):WatchBook{const bytes=new TextEncoder().encode(JSON.stringify(candidate)).length;if(bytes>WATCH_LIMITS.bytes)throw new WatchCapacityError('The local watchlist book would reach '+bytes+' bytes; it holds at most 2 MiB. Nothing was changed.');return candidate;}
function validated(build:()=>WatchBook):WatchBook{try{return build();}catch(cause){const message=cause instanceof Error?cause.message:String(cause);if(/limit|2 MiB/i.test(message))throw new WatchCapacityError(message+' Nothing was changed.');throw cause;}}
/**
 * Append references to a custom list, or flag them for a flagged list ID. Members already present by
 * source-aware identity (flagged lists: market identity) are skipped and reported, never duplicated.
 * Capacity or validation failure throws and returns no partial book.
 */
export function addWatchMembers(book:WatchBook,listId:string,references:readonly WatchReference[],makeId:()=>string,options?:WatchWriteOptions):WatchAddResult{
 const list=watchListById(book,listId);assertRevision(book,listId,options);if(!Array.isArray(references)||references.length>WATCH_LIMITS.rowsPerList)throw new WatchCapacityError('Add 0 to 5,000 symbols at a time.');
 const flagged=listId.startsWith('flag:'),seen=new Set(list.rows.flatMap(row=>row.kind==='symbol'?[flagged?watchMarketKey(row.reference):watchMemberKey(row.reference)]:[])),added:WatchReference[]=[],skipped:WatchReference[]=[];
 for(const input of references){const reference=validReference(input),key=flagged?watchMarketKey(reference):watchMemberKey(reference);if(seen.has(key)){skipped.push(reference);continue;}seen.add(key);added.push(reference);}
 if(!added.length)return{book,listId,added,skipped};
 if(flagged){const color=listId.slice(5) as FlagColor,after=new Set([...book.flags.map(row=>marketKey(row.reference)),...added.map(watchMarketKey)]);if(after.size>WATCH_LIMITS.flags)throw new WatchCapacityError(`Flags would cover ${after.size} markets; at most 5,000 are allowed. Nothing was flagged.`);return{book:validated(()=>applyFlags(book,added,color)),listId,added,skipped};}
 capacity(book,list,added.length);
 let at=list.rows.length;if(options?.sectionId!==undefined){const start=list.rows.findIndex(row=>row.id===options.sectionId&&row.kind==='section');if(start<0)throw new WatchStaleError('The selected section was removed. Choose a current section.');at=start+1;while(at<list.rows.length&&list.rows[at].kind!=='section')at++;}
 const next=validated(()=>restoreWatchBook(withinBytes({...book,lists:book.lists.map(row=>row.id===listId?{...row,sort:null,rows:[...row.rows.slice(0,at),...added.map(reference=>({id:makeId(),kind:'symbol' as const,reference})),...row.rows.slice(at)]}:row)})));
 return{book:next,listId,added,skipped};
}
/** Set or clear one global flag color for several markets at once. Unflagging never removes custom-list membership. */
export function setWatchFlags(book:WatchBook,references:readonly WatchReference[],color:FlagColor|null):WatchBook{
 if(color!==null&&!FLAG_COLORS.includes(color))throw new WatchReferenceError('Unknown flag color. Nothing was changed.');if(!Array.isArray(references)||references.length>WATCH_LIMITS.flags)throw new WatchCapacityError('Flag 0 to 5,000 symbols at a time.');
 const unique=new Map<string,WatchReference>();for(const input of references){const reference=validReference(input);unique.set(watchMarketKey(reference),reference);}
 if(color){const after=new Set([...book.flags.map(row=>marketKey(row.reference)),...unique.keys()]);if(after.size>WATCH_LIMITS.flags)throw new WatchCapacityError(`Flags would cover ${after.size} markets; at most 5,000 are allowed. Nothing was flagged.`);}
 return validated(()=>applyFlags(book,[...unique.values()],color));
}
