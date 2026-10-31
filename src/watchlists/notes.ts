import {isMarketSymbol} from '../domain/symbol-math';
export interface NoteMarket {exchange:string;symbol:string;synthetic:boolean}
export interface WatchNote {id:string;market:NoteMarket|null;text:string;createdAt:number;updatedAt:number;revision:number}
export const NOTE_TEXT_BYTES=64*1024;
const encoder=new TextEncoder();
/** Inspect descriptors before any serialization. Imported JSON and internal callers share this boundary. */
export function assertWatchPlainData(value:unknown,maxBytes=2*1024*1024):void{
 const active=new Set<object>();let nodes=0,textBytes=0;
 function walk(item:unknown,depth:number):void{
  if(++nodes>500000||depth>16)throw new Error('Watchlist data exceeds structural limits.');
  if(item===null||typeof item==='boolean')return;
  if(typeof item==='string'){if(item.length>maxBytes||((textBytes+=encoder.encode(item).length)>maxBytes))throw new Error('Watchlist data exceeds the 2 MiB document limit.');return;}
  if(typeof item==='number'){if(!Number.isFinite(item))throw new Error('Watchlist numbers must be finite.');return;}
  if(!item||typeof item!=='object')throw new Error('Watchlist requires plain data values.');
  const array=Array.isArray(item),prototype=Object.getPrototypeOf(item);
  if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)throw new Error('Custom watchlist data prototypes are unsupported.');
  if(active.has(item))throw new Error('Watchlist data cannot contain cycles.');active.add(item);
  const keys=Reflect.ownKeys(item);if(nodes+keys.length>500000)throw new Error('Watchlist data exceeds structural limits.');let count=0;
  for(const key of keys){if(typeof key!=='string')throw new Error('Watchlist symbol properties are unsupported.');const descriptor=Object.getOwnPropertyDescriptor(item,key)!;
   if(!Object.hasOwn(descriptor,'value'))throw new Error('Watchlist accessors are unsupported.');
   if(array&&key==='length')continue;if(!descriptor.enumerable||['__proto__','constructor','prototype'].includes(key))throw new Error('Watchlist contains unsupported data fields.');
   if(array&&(!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=(item as unknown[]).length))throw new Error('Watchlist arrays cannot contain additional fields.');
   if(key.length>maxBytes||((textBytes+=encoder.encode(key).length)>maxBytes))throw new Error('Watchlist data exceeds the 2 MiB document limit.');count++;walk(descriptor.value,depth+1);
  }
  if(array&&count!==(item as unknown[]).length)throw new Error('Watchlist arrays cannot contain missing entries.');active.delete(item);
 }
 walk(value,0);
}
function exact(value:unknown,keys:string[]):Record<string,any>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))throw new Error('Invalid note fields.');return value as Record<string,any>;
}
export function restoreNoteMarket(value:unknown):NoteMarket|null{
 if(value===null)return null;assertWatchPlainData(value);const input=exact(value,['exchange','symbol','synthetic']);
 if(typeof input.exchange!=='string'||!/^[A-Z0-9._-]{1,80}$/.test(input.exchange)||!isMarketSymbol(input.symbol,input.exchange)||typeof input.synthetic!=='boolean')throw new Error('Invalid note market identity.');
 return{exchange:input.exchange,symbol:input.symbol,synthetic:input.synthetic};
}
export function noteMarketKey(market:NoteMarket|null):string{return market===null?'unassociated':JSON.stringify([market.exchange,market.symbol,market.synthetic]);}
function timestamp(value:unknown){if(!Number.isSafeInteger(value)||Number(value)<0||Number(value)>253402300799)throw new Error('Note time must be Unix seconds in the supported range.');return value as number;}
function noteText(value:unknown){if(typeof value!=='string'||!value.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new Error('Enter nonblank plain note text.');if(value.length>NOTE_TEXT_BYTES||encoder.encode(value).length>NOTE_TEXT_BYTES)throw new Error('Note text exceeds 64 KiB UTF-8.');return value;}
export function restoreWatchNotes(value:unknown):WatchNote[]{
 if(!Array.isArray(value)||value.length>1000)throw new Error('Notes must be a collection of at most 1,000 records.');assertWatchPlainData(value);const ids=new Set<string>();
 return value.map(item=>{const note=exact(item,['id','market','text','createdAt','updatedAt','revision']);
  if(typeof note.id!=='string'||!note.id.trim()||note.id.length>200||/[\u0000-\u001f]/.test(note.id))throw new Error('Invalid note identity.');if(ids.has(note.id))throw new Error('Duplicate note identity.');ids.add(note.id);
  if(!Number.isSafeInteger(note.revision)||note.revision<1)throw new Error('Invalid note revision.');const createdAt=timestamp(note.createdAt),updatedAt=timestamp(note.updatedAt);if(updatedAt<createdAt)throw new Error('Note update time precedes creation time.');
  return{id:note.id,market:restoreNoteMarket(note.market),text:noteText(note.text),createdAt,updatedAt,revision:note.revision};
 });
}
export function notesForMarket(notes:readonly WatchNote[],market:NoteMarket|null):WatchNote[]{const key=noteMarketKey(market);return notes.filter(note=>noteMarketKey(note.market)===key).slice().sort((a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id));}
export function addWatchNote(notes:readonly WatchNote[],id:string,market:NoteMarket|null,text:string,now:number):WatchNote[]{return restoreWatchNotes([...notes,{id,market,text:noteText(text),createdAt:timestamp(now),updatedAt:now,revision:1}]);}
function ownedNote(notes:readonly WatchNote[],id:string,revision:number):WatchNote{const note=notes.find(item=>item.id===id);if(!note||note.revision!==revision)throw new Error('This note changed or was removed. Reopen the current note.');return note;}
export function editWatchNote(notes:readonly WatchNote[],id:string,revision:number,text:string,now:number):WatchNote[]{const note=ownedNote(notes,id,revision);if(note.revision===Number.MAX_SAFE_INTEGER)throw new Error('Note revision limit reached. Export or create a new note.');timestamp(now);if(now<note.updatedAt)throw new Error('Note update time precedes its accepted revision.');return restoreWatchNotes(notes.map(item=>item.id===id?{...item,text:noteText(text),updatedAt:now,revision:note.revision+1}:item));}
export function deleteWatchNote(notes:readonly WatchNote[],id:string,revision:number):WatchNote[]{ownedNote(notes,id,revision);return restoreWatchNotes(notes.filter(item=>item.id!==id));}
/** What notesTargetForContext needs from a chart menu snapshot. Root maps the real snapshot to this shape (App note action). */
export interface NotesContextSnapshot {instrument:{exchange:string;symbol:string};fixture:boolean;comparisons:readonly {id:string;exchange:string;symbol:string;synthetic:boolean}[]}
export type NotesContextTarget={kind:'series';owner:'main'|{kind:'built'|'script'|'comparison';id:string}}|{kind:'chart'|'time-axis'|'corner'|'price-axis'|'drawing'};
/**
 * The market a chart "Add note" action targets. A comparison series targets that series' own market; the main series, an
 * indicator, a drawing and every other target use the main instrument. A comparison with missing or ambiguous market data
 * throws instead of falling back to the main instrument (target ownership: never guess).
 */
export function notesTargetForContext(target:NotesContextTarget,snapshot:NotesContextSnapshot):NoteMarket{
 if(target.kind==='series'&&target.owner!=='main'&&target.owner.kind==='comparison'){
  const owner=target.owner,matches=snapshot.comparisons.filter(row=>row.id===owner.id);
  if(matches.length!==1)throw new Error('The comparison series market is not available for notes.');
  return restoreNoteMarket({exchange:matches[0].exchange,symbol:matches[0].symbol,synthetic:matches[0].synthetic})!;
 }
 return restoreNoteMarket({exchange:snapshot.instrument.exchange,symbol:snapshot.instrument.symbol,synthetic:snapshot.fixture})!;
}
