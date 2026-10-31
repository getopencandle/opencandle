import type {BarDataset} from '../domain/types';
import {FLAG_COLORS,WATCH_COLUMNS,WATCH_DEFAULT_WIDTHS,WATCH_LIMITS,activeWatchList,marketKey,resolveWatchSource,watchColumnWidth,type FlagColor,type WatchBook,type WatchColumn,type WatchReference} from './model';
import {watchFlagIndex,watchListChoices,watchMemberKey} from './membership';
import {ALPACA_STUB_PROVIDER_ID} from '../domain/alpaca-live';
import {SYMBOL_MATH_PROVIDER_ID} from '../domain/symbol-math-live';

/**
 * Pure menu models for the watchlist panel. Each item is enabled or carries the reason it is unavailable,
 * so the UI never shows an inert control. Item IDs are dispatched by WatchlistPanel.
 */
export interface WatchMenuItem {id:string;label:string;ariaLabel?:string;role?:'menuitem'|'menuitemradio'|'menuitemcheckbox';checked?:boolean;disabled?:string|null;shortcut?:string;danger?:boolean}
export interface WatchMenuGroup {label:string|null;items:WatchMenuItem[]}
export const WATCH_COLUMN_LABELS:Record<WatchColumn,string>={symbol:'Symbol',last:'Last',change:'Daily change',changePercent:'Daily change %',volume:'Daily volume',extended:'Extended last',extendedChange:'Extended change',extendedChangePercent:'Extended change %',relativeVolume:'Relative volume',open:'Open',high:'High',low:'Low',previousClose:'Prev close',dayRange:'Day range',bid:'Bid',ask:'Ask'};
export const FLAG_LABELS:Record<FlagColor,string>={red:'Red',orange:'Orange',green:'Green',blue:'Blue',purple:'Purple',cyan:'Cyan',pink:'Pink'};
const item=(id:string,label:string,extra:Partial<WatchMenuItem>={}):WatchMenuItem=>({id,label,role:'menuitem',disabled:null,...extra});
const plural=(count:number,word:string)=>count+' '+word+(count===1?'':'s');
export function enabledMenuIds(groups:readonly WatchMenuGroup[]):string[]{return groups.flatMap(group=>group.items.filter(entry=>!entry.disabled).map(entry=>entry.id));}
/** Roving focus over enabled items. Returns the next active ID, wrapping at either end. */
export function stepWatchMenu(ids:readonly string[],active:string|null,key:string):string|null{
 if(!ids.length)return null;const index=active===null?-1:ids.indexOf(active);
 if(key==='Home')return ids[0];if(key==='End')return ids.at(-1)!;
 if(key==='ArrowDown')return ids[index<0?0:(index+1)%ids.length];if(key==='ArrowUp')return ids[index<0?ids.length-1:(index-1+ids.length)%ids.length];
 return active;
}
/** symbolAlert: show "Add alert on SYMBOL..." for the focused row. */
export interface RowMenuContext {book:WatchBook;selected:readonly string[];datasets:readonly BarDataset[];notes:boolean;symbolAlert?:boolean}
/** Linear in rows + selection + flags: selection, flags and target-list members are indexed once. */
export function watchRowMenu(context:RowMenuContext):WatchMenuGroup[]{
 const {book}=context,list=activeWatchList(book),custom=!list.id.startsWith('flag:'),chosen=new Set(context.selected),rows=list.rows.filter(row=>chosen.has(row.id)),focus=list.rows.find(row=>row.id===context.selected[0]);
 if(!focus)return[{label:null,items:[item('none','No row is selected',{disabled:'Select a row first.'})]}];
 const single=rows.length===1?null:'Select one row for this action.';
 if(focus.kind==='section'){const members=(()=>{const start=list.rows.indexOf(focus);let end=start+1;while(end<list.rows.length&&list.rows[end].kind!=='section')end++;return end-start-1;})();
  return[{label:'Section: '+focus.name,items:[item('section-rename','Rename section...'),item('section-toggle',focus.collapsed?'Expand section':'Collapse section'),item('move-up','Move section up',{shortcut:'Alt+Up'}),item('move-down','Move section down',{shortcut:'Alt+Down'})]},
   {label:null,items:[item('section-remove-heading','Remove heading, keep symbols'),item('section-remove-all','Remove section and '+plural(members,'symbol')+'...',{danger:true})]}];}
 const symbols=rows.flatMap(row=>row.kind==='symbol'?[row.reference]:[]),count=symbols.length,source=resolveWatchSource(focus.reference,context.datasets);
 const noSource=source?null:'No data source for '+focus.reference.symbol+'. Choose a source first.';
 const flagIndex=watchFlagIndex(book),colors=new Set(symbols.map(reference=>flagIndex.get(marketKey(reference))??null));
 const others=book.lists.filter(row=>row.id!==list.id),symbolKeys=symbols.map(watchMemberKey),targets=new Map<string,{fresh:number;room:number}>(),targetInfo=(id:string)=>{let info=targets.get(id);if(!info){const target=book.lists.find(row=>row.id===id)!,keys=new Set(target.rows.flatMap(row=>row.kind==='symbol'?[watchMemberKey(row.reference)]:[]));info={fresh:new Set(symbolKeys.filter(key=>!keys.has(key))).size,room:WATCH_LIMITS.rowsPerList-target.rows.length};targets.set(id,info);}return info;};
 const target=(prefix:'copy'|'move',id:string,name:string)=>{const {fresh,room}=targetInfo(id);return item(prefix+':'+id,name,{disabled:prefix==='copy'&&!fresh?'Every selected source is already in this list.':fresh>room?'This list has room for '+room+' more rows.':null});};
 const groups:WatchMenuGroup[]=[
  {label:count>1?plural(count,'symbol')+' selected; focus '+focus.reference.symbol:focus.reference.symbol,items:[item('open','Open in active chart',{shortcut:'Enter',disabled:noSource}),item('open-all','Open on all charts',{shortcut:'Double-click',disabled:noSource}),...context.symbolAlert?[item('symbol-alert','Add alert on '+focus.reference.symbol+'...',{disabled:single??noSource})]:[],...context.notes?[item('note','Add note...',{disabled:single})]:[],item('source','Choose source...',{disabled:single})]},
  {label:'Flag',items:[...FLAG_COLORS.map(color=>item('flag:'+color,FLAG_LABELS[color],{role:'menuitemradio',checked:colors.size===1&&colors.has(color),shortcut:color===book.lastFlag?'Alt+Enter':undefined})),item('unflag','Remove flag',{disabled:[...colors].some(Boolean)?null:'No selected symbol is flagged.'})]},
  // With no other list, Copy and Move share one disabled row instead of repeating it.
  others.length?{label:'Copy to list',items:others.map(row=>target('copy',row.id,row.name))}:{label:custom?'Copy or move to list':'Copy to list',items:[item('copy:none','No other custom list',{disabled:'Create another list first.'})]},
 ];
 if(custom&&others.length)groups.push({label:'Move to list',items:others.map(row=>target('move',row.id,row.name))});
 groups.push({label:null,items:[...custom?[item('section-above','Add section above'),item('move-up','Move up',{shortcut:'Alt+Up',disabled:single}),item('move-down','Move down',{shortcut:'Alt+Down',disabled:single})]:[],item('select-all','Select all visible symbols',{shortcut:'Ctrl+A'}),item('remove',custom?'Remove '+plural(count,'symbol'):'Unflag '+plural(count,'symbol'),{shortcut:'Delete',danger:true})]});
 return groups;
}
export interface WatchColumnMenuOptions {advanced?:boolean;notes?:boolean}
export function watchColumnMenu(book:WatchBook,column:WatchColumn|null,options:WatchColumnMenuOptions={}):WatchMenuGroup[]{
 const list=activeWatchList(book),groups:WatchMenuGroup[]=[];
 if(column){const label=WATCH_COLUMN_LABELS[column],sort=list.sort?.column===column?list.sort.direction:null;groups.push({label,items:[item('sort-asc','Sort ascending',{role:'menuitemradio',checked:sort==='asc'}),item('sort-desc','Sort descending',{role:'menuitemradio',checked:sort==='desc'}),item('hide','Hide column',{disabled:column==='symbol'?'The Symbol column is required.':null}),item('reset-width','Reset width',{disabled:watchColumnWidth(book,column)===WATCH_DEFAULT_WIDTHS[column]?'Already at the default width.':null})]});}
 groups.push({label:'Sorting',items:[item('restore','Restore manual order',{disabled:list.sort?null:'This list already shows its manual order.'})]});
 groups.push({label:'Columns',items:WATCH_COLUMNS.map(entry=>item('column:'+entry,WATCH_COLUMN_LABELS[entry],{role:'menuitemcheckbox',checked:book.display.columns.includes(entry),disabled:entry==='symbol'?'The Symbol column is required.':null}))});
 groups.push({label:null,items:[item('display','Display settings...'),...column===null?[...options.advanced?[item('advanced','Advanced View')]:[],...options.notes?[item('notes','Notes...')]:[],item('import-export','Import and export...')]:[]]});
 return groups;
}
/** listAlert: null enables the row, a string disables it with that reason, omitted means list alerts are not connected to this view. */
export interface WatchListMenuOptions {listAlert?:string|null;/** True when the view can open the Markets hotlists (gainers, losers, most active among loaded symbols). */hotlists?:boolean}
export function watchListMenu(book:WatchBook,options:WatchListMenuOptions={}):WatchMenuGroup[]{
 const list=activeWatchList(book),custom=!list.id.startsWith('flag:'),color=custom?null:list.id.slice(5) as FlagColor,flagOnly='Not available for a flagged list.',favorites=watchListChoices(book).filter(row=>row.favorite);
 const groups:WatchMenuGroup[]=[
  {label:list.name,items:[item('open-list','Open list...',{shortcut:'Shift+W'}),item('new','Create new list...'),item('copy','Make a copy...',{disabled:book.lists.length>=WATCH_LIMITS.lists?'The book already holds 100 lists.':null}),item('rename',custom?'Rename...':'Rename flagged list...'),item('favorite',custom&&list.favorite?'Remove from favorites':'Add to favorites',{disabled:custom?null:flagOnly}),item('add-section','Add section',{disabled:custom?null:flagOnly})]},
 ];
 if(color)groups.push({label:'Change flag color',items:FLAG_COLORS.filter(entry=>entry!==color).map(entry=>item('recolor:'+entry,FLAG_LABELS[entry],{disabled:list.rows.length?null:'This flagged list is empty.'}))});
 groups.push({label:null,items:[item('clear','Clear list...',{ariaLabel:'Clear active list',danger:true,disabled:list.rows.length?null:'This list is already empty.'}),item('delete','Delete list...',{ariaLabel:'Delete active list',danger:true,disabled:custom?null:'A flagged list disappears when its flags are cleared. Use Clear list.'}),item('export','Export list as TXT...',{disabled:list.rows.length?null:'This list is empty.'}),item('import','Import or export...')]});
 groups.push({label:'Alerts',items:[item('alert','Add alert on list...',{disabled:options.listAlert===undefined?'List alerts are not connected to this view.':options.listAlert})]});
 groups.push({label:null,items:[item('hotlists',options.hotlists?'Hotlists (loaded symbols)...':'Hotlists',{disabled:options.hotlists?null:'Market-wide hotlists are not available in OpenCandle.'})]});
 if(favorites.length)groups.push({label:'Favorite lists',items:favorites.map(row=>item('switch:'+row.id,row.name,{role:'menuitemradio',checked:row.active}))});
 return groups;
}
/** UI policy for list names: trimmed, nonblank, at most 200 characters, no control characters, unique among custom lists. */
/** Name for an imported list: the requested name, or the first free "name (n)" so imports never create duplicates. */
export function uniqueWatchListName(book:WatchBook,name:string):string{const base=(typeof name==='string'?name.trim():'').slice(0,WATCH_LIMITS.name-8)||'Imported list',taken=new Set(book.lists.map(list=>list.name.trim().toLowerCase()));if(!taken.has(base.toLowerCase()))return base;for(let n=2;;n++){const next=base+' ('+n+')';if(!taken.has(next.toLowerCase()))return next;}}
export function validateWatchListName(book:WatchBook,name:string,exceptId:string|null=null):string{
 const value=typeof name==='string'?name.trim():'';if(!value)throw new Error('Enter a list name.');if(value.length>WATCH_LIMITS.name)throw new Error('List names hold at most 200 characters.');if(/[\u0000-\u001f]/.test(value))throw new Error('List names cannot contain control characters.');
 if(exceptId!==null&&book.lists.find(list=>list.id===exceptId)?.name===value)return value;if(book.lists.some(list=>list.id!==exceptId&&list.name.trim().toLowerCase()===value.toLowerCase()))throw new Error('Another list already uses this name.');return value;
}
export function validateSectionName(name:string):string{const value=typeof name==='string'?name.trim():'';if(!value)throw new Error('Enter a section name.');if(value.length>WATCH_LIMITS.name||/[\u0000-\u001f]/.test(value))throw new Error('Section names hold at most 200 plain characters.');return value;}
/** Label for a row's source when the same market appears more than once, or its binding is missing. */
export function watchSourceBadge(reference:WatchReference,resolved:BarDataset|null,duplicateMarket:boolean):{text:string;title:string;quiet?:boolean}|null{
 if(reference.datasetId===null)return{text:'UNRESOLVED',title:'No data source for this symbol yet.'};
 // A row bound to a live feed has no dataset until the feed's first snapshot arrives. Show a quiet loading dash, not an error.
 if(!resolved&&reference.datasetId.startsWith('live:'))return{text:'-',title:'Loading '+reference.symbol+'. The price appears when the live feed sends it.',quiet:true};
 if(!resolved)return{text:'SOURCE MISSING',title:'The bound source for '+reference.symbol+' is not loaded or is ambiguous. Values stay unavailable.'};
 // The keyless Alpaca test stub is always labelled; its prices are invented.
 // UI audit 1028 #11: one quiet DEMO marking per row; the tooltip carries the explanation.
 if(resolved.provenance.providerId===ALPACA_STUB_PROVIDER_ID)return{text:'DEMO',title:resolved.provenance.providerName+': invented prices from the keyless test stub, not market data.'};
 // A derived row whose feed uses a synthetic component (the keyless stub, a synthetic demo) is labelled too.
 if(resolved.provenance.providerId===SYMBOL_MATH_PROVIDER_ID&&resolved.provenance.fixture)return{text:'DEMO',title:resolved.provenance.providerName+': computed from synthetic component data, not market data.'};
 return duplicateMarket?{text:resolved.resolution+' / '+resolved.provenance.providerName,title:resolved.provenance.providerName+', '+resolved.resolution+', '+resolved.provenance.adjustment+' adjustment'}:null;
}
