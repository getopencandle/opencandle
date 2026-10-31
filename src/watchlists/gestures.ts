import {activeWatchList,resolveWatchSource,restoreWatchBook,watchColumnWidth,type WatchBook,type WatchColumn,type WatchReference} from './model';
import type {BarDataset} from '../domain/types';
import {orderedWatchRows,visibleWatchRows,watchQuote} from './quotes';
/** A single click opens the chart at once (the reference switches on click). Kept as a named 0 so callers that
 * advance timers by it stay valid. A later double-click still adds the all-charts request. */
export const WATCH_CLICK_DELAY_MS=0;
interface ClickOwner {book:WatchBook;datasets:readonly BarDataset[];blocked:boolean}
/** A single click dispatches synchronously. A Windows double-click delivered after it cannot undo the accepted single click; it adds the all-charts request. */
export function createWatchClicks(port:{read:()=>ClickOwner;open:(reference:WatchReference,all:boolean)=>void;error:(message:string)=>void}){
 let timer:ReturnType<typeof setTimeout>|null=null,active=true;
 const cancel=()=>{if(timer!==null)clearTimeout(timer);timer=null;};
 const row=(owner:ClickOwner,id:string)=>activeWatchList(owner.book).rows.find(item=>item.id===id&&item.kind==='symbol');
 function dispatch(owner:ClickOwner,id:string,all:boolean){if(!active||owner.blocked)return;const selected=row(owner,id);if(!selected||selected.kind!=='symbol')return;try{port.open(selected.reference,all);}catch(cause){port.error(cause instanceof Error?cause.message:String(cause));}}
 return{click(id:string,modified=false,detail=1){cancel();if(!active||modified||detail!==1)return;dispatch(port.read(),id,false);},doubleClick(id:string,modified=false){cancel();if(active&&!modified){const owner=port.read();dispatch(owner,id,true);}},cancel,enable(){active=true;},dispose(){active=false;cancel();}};
}
export interface ColumnPreview {column:WatchColumn;width:number}
export function createWatchColumnResize(port:{read:()=>WatchBook;publish:(next:WatchBook,expected:WatchBook)=>void;preview:(next:ColumnPreview|null)=>void}){
 let enabled=true,opening:{book:WatchBook;column:WatchColumn;pointer:number;x:number;width:number;next:number}|null=null;
 const bounded=(value:number)=>Math.max(48,Math.min(400,Math.round(value)));
 const cancel=(pointer?:number)=>{if(!enabled||pointer!==undefined&&opening?.pointer!==pointer)return;opening=null;port.preview(null);};
 function publish(book:WatchBook,column:WatchColumn,width:number){if(port.read()!==book)throw new Error('Watchlist columns changed during resizing.');if(width===watchColumnWidth(book,column))return;const next=restoreWatchBook({...book,display:{...book.display,widths:{...book.display.widths,[column]:width}}});port.publish(next,book);}
 return{begin(column:WatchColumn,pointer:number,x:number){if(!enabled)return;cancel();const book=port.read();if(!book.display.columns.includes(column)||!Number.isSafeInteger(pointer)||pointer<0||!Number.isFinite(x))throw new Error('Invalid column resize target.');opening={book,column,pointer,x,width:watchColumnWidth(book,column),next:watchColumnWidth(book,column)};},move(pointer:number,x:number){if(!enabled||!opening||opening.pointer!==pointer)return;if(!Number.isFinite(x))throw new Error('Invalid column pointer coordinate.');if(port.read()!==opening.book){cancel();throw new Error('Watchlist columns changed during resizing.');}opening.next=bounded(opening.width+x-opening.x);port.preview({column:opening.column,width:opening.next});},finish(pointer:number){if(!enabled||!opening||opening.pointer!==pointer)return;const captured=opening;opening=null;try{publish(captured.book,captured.column,captured.next);}finally{port.preview(null);}},cancel,isEnabled:()=>enabled,active:()=>enabled&&opening!==null,enable(){enabled=true;},dispose(){if(!enabled)return;enabled=false;opening=null;port.preview(null);},key(column:WatchColumn,key:string,large=false){if(!enabled)return false;cancel();const book=port.read(),width=book.display.widths[column],next=key==='Home'?48:key==='End'?400:key==='ArrowLeft'?bounded(width-(large?10:1)):key==='ArrowRight'?bounded(width+(large?10:1)):null;if(next===null)return false;publish(book,column,next);return true;}};
}
/** Space / Shift+Space from the chart. The symbol row after (delta 1) or before (-1) the chart's symbol in the
 * active list's shown order (sort and collapsed sections as the panel shows them), wrapping at the ends. A chart symbol not in
 * the list starts at the first row (or the last, going back). Rows without an exact supplied source are skipped. */
export function stepWatchSymbol(book:WatchBook,datasets:readonly BarDataset[],current:{symbol:string;exchange:string},delta:1|-1):BarDataset|null{
 const list=activeWatchList(book),quotes=new Map(list.rows.flatMap(row=>row.kind==='symbol'?[[row.id,watchQuote(row.reference,datasets)] as const]:[]));
 const rows=visibleWatchRows(orderedWatchRows(list,quotes)).flatMap(row=>row.kind==='symbol'?[row]:[]);
 if(!rows.length)return null;
 const exact=rows.findIndex(row=>row.reference.symbol===current.symbol&&row.reference.exchange===current.exchange),index=exact>=0?exact:rows.findIndex(row=>row.reference.symbol===current.symbol);
 for(let step=1;step<=rows.length;step++){
  const at=index<0?(delta===1?step-1:rows.length-step):((index+delta*step)%rows.length+rows.length)%rows.length;
  if(index>=0&&at===index)break;
  const source=resolveWatchSource(rows[at].reference,datasets);if(source)return source;
 }
 return null;
}
