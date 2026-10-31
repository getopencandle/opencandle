// The Quick search (Ctrl+K) model. One index of everything the palette can find, built
// from the catalogs the rest of the app already uses, never from a second list:
// - commands: command-registry.ts (also the main menu), with hotkeys read from the generated Keyboard shortcuts list;
// - indicators: the chart's own indicator catalog, named by indicator-dialog-model;
// - drawing tools: DRAWING_TOOL_CATALOG (the drawing toolbar);
// - intervals: the interval menu entries; chart types: the toolbar chart type list; layouts: the layout library;
// - settings: the Chart settings tabs and their controls (chart-settings-facts);
// - symbols: searchSymbols over the symbol search candidates.
// Grouping, ranking, labels and the recent list are our own choice.
import {APP_COMMANDS,type AppCommandId,type CommandRuns} from './command-registry';
import type {ShortcutRow} from './keyboard-shortcuts';
import {searchSymbols,sourceLabel,type SymbolSearchCandidate} from './symbol-search';
import type {DrawingToolGroup,DrawingMode} from './drawing-tool-catalog';
import {ALL_TABS,TAB_FACTS,type ChartSettingsTabId} from '../chart/chart-settings-facts';
import {intervalLabel} from '../domain/intervals';
import {catalogDefinition} from '../domain/indicator-catalog';
import {shortIntervalText} from './interval-display';

export type QuickSearchCategory='Symbols'|'Actions'|'Indicators'|'Drawings'|'Intervals'|'Chart types'|'Layouts'|'Settings';
export const QUICK_SEARCH_CATEGORIES:readonly QuickSearchCategory[]=Object.freeze(['Symbols','Actions','Indicators','Drawings','Intervals','Chart types','Layouts','Settings']);
export type QuickSearchFilter='All'|QuickSearchCategory;
export const QUICK_SEARCH_FILTERS:readonly QuickSearchFilter[]=Object.freeze(['All',...QUICK_SEARCH_CATEGORIES]);

export type QuickSearchRun=
 |{kind:'command';id:AppCommandId}
 |{kind:'symbol';candidate:SymbolSearchCandidate}
 |{kind:'symbol-search';query:string}
 |{kind:'indicator';id:string;name:string}
 |{kind:'drawing';tool:string}
 |{kind:'drawing-mode';mode:DrawingMode}
 |{kind:'interval';id:string}
 |{kind:'chart-type';id:string}
 |{kind:'layout';id:string}
 |{kind:'settings';tab:ChartSettingsTabId};
export interface QuickSearchItem{
 /** Unique in one result list. */
 readonly id:string;
 /** What the recent list stores (the symbol text for symbol rows, else the id). */
 readonly recentKey:string;
 readonly category:QuickSearchCategory;readonly label:string;readonly detail?:string;readonly hotkey?:string;
 readonly keywords:readonly string[];readonly run:QuickSearchRun;
}
export interface QuickSearchSources{
 /** Commands this window can run (App's runners); disabled ones are left out. */
 runs:CommandRuns;
 shortcuts:readonly ShortcutRow[];
 indicators:readonly {id:string;name:string;acronym?:string}[];
 drawings:readonly DrawingToolGroup[];
 intervals:readonly string[];currentInterval?:string|null;
 chartTypes:readonly {value:string;label:string}[];currentChartType?:string|null;
 layouts:readonly {id:string;name:string;active:boolean}[];
}
const item=(row:Omit<QuickSearchItem,'recentKey'|'keywords'>&{recentKey?:string;keywords?:readonly string[]}):QuickSearchItem=>Object.freeze({...row,recentKey:row.recentKey??row.id,keywords:Object.freeze([...(row.keywords??[])])});

/** Every non-symbol row the palette can show, in category order. */
export function quickSearchIndex(sources:QuickSearchSources):QuickSearchItem[]{
 const out:QuickSearchItem[]=[];
 const keysOf=(action:string|undefined)=>action?sources.shortcuts.find(row=>row.action===action)?.keys.join(', '):undefined;
 for(const command of APP_COMMANDS){const run=sources.runs[command.id];if(!run||run.disabled)continue;const hotkey=keysOf(command.shortcut);out.push(item({id:'command:'+command.id,category:'Actions',label:command.label,detail:command.group,...(hotkey?{hotkey}:{}),keywords:command.keywords,run:{kind:'command',id:command.id}}));}
 const seenIndicators=new Set<string>();
 for(const row of sources.indicators){if(seenIndicators.has(row.id))continue;seenIndicators.add(row.id);out.push(item({id:'indicator:'+row.id,category:'Indicators',label:row.name,detail:'Add indicator',keywords:[row.acronym??'',row.id,...(catalogDefinition(row.id)?.keywords??[])].filter(Boolean),run:{kind:'indicator',id:row.id,name:row.name}}));}
 const seenTools=new Set<string>();
 for(const group of sources.drawings)for(const section of group.sections)for(const leaf of section.leaves){
  const target=leaf.target,key=target.kind==='tool'?'tool:'+target.type:target.kind==='mode'?'mode:'+target.mode:null;
  if(!key||seenTools.has(key))continue;seenTools.add(key);
  const hotkey=leaf.hotkey?.bound?leaf.hotkey.keys:undefined;
  out.push(item({id:'drawing:'+key,category:'Drawings',label:leaf.label,detail:group.label,...(hotkey?{hotkey}:{}),keywords:[...(leaf.aliases??[]),section.label],run:target.kind==='tool'?{kind:'drawing',tool:target.type}:{kind:'drawing-mode',mode:(target as {mode:DrawingMode}).mode}}));
 }
 for(const id of sources.intervals){let label:string;try{label=intervalLabel(id);}catch{continue;}out.push(item({id:'interval:'+id,category:'Intervals',label,detail:id===sources.currentInterval?'Current interval':'Interval',keywords:[shortIntervalText(id),id,'timeframe'],run:{kind:'interval',id}}));}
 for(const row of sources.chartTypes)out.push(item({id:'chart-type:'+row.value,category:'Chart types',label:row.label,detail:row.value===sources.currentChartType?'Current chart type':'Chart type',keywords:['chart type','style',row.value],run:{kind:'chart-type',id:row.value}}));
 for(const row of sources.layouts)out.push(item({id:'layout:'+row.id,category:'Layouts',label:row.name,detail:row.active?'Current layout':'Open layout',keywords:['layout'],run:{kind:'layout',id:row.id}}));
 for(const tab of ALL_TABS){
  out.push(item({id:'settings:tab:'+tab.id,category:'Settings',label:'Chart settings: '+tab.label,detail:'Settings tab',keywords:['settings','preferences'],run:{kind:'settings',tab:tab.id}}));
  const facts=(TAB_FACTS as Readonly<Record<string,readonly {kind:string;factId:string;label:string;group?:string}[]>>)[tab.id]??[],seen=new Set<string>();
  const groups=new Map(facts.filter(fact=>fact.kind==='group').map(fact=>[fact.factId,String(fact.label??'').trim()]));
  for(const fact of facts){
   const label=String(fact.label??'').trim(),group=fact.group?groups.get(fact.group)??'':'',key=(group+'|'+label).toLowerCase();
   if(fact.kind!=='control'||label.length<2||seen.has(key))continue;seen.add(key);
   out.push(item({id:'settings:'+fact.factId,category:'Settings',label,detail:['Chart settings',tab.label,group].filter(Boolean).join(' · '),keywords:['settings',tab.label,group].filter(Boolean),run:{kind:'settings',tab:tab.id}}));
  }
 }
 return out;
}

const normalize=(text:string)=>text.toLowerCase().replace(/[^\p{L}\p{N}.+/]+/gu,' ').trim();
/** 0 when the row does not match; otherwise larger is better. Every query word must match the label, a keyword or the detail. */
export function quickSearchScore(row:Pick<QuickSearchItem,'label'|'keywords'|'detail'>,query:string):number{
 const q=normalize(query);if(!q)return 1;
 const label=normalize(row.label),words=label.split(' '),extra=[...row.keywords,row.detail??''].map(normalize);
 let score=label===q?1000:label.startsWith(q)?600:0;
 for(const token of q.split(' ')){
  if(words.some(word=>word.startsWith(token)))score+=30;
  else if(label.includes(token))score+=15;
  else if(extra.some(text=>text.split(' ').some(word=>word.startsWith(token))))score+=8;
  else if(extra.some(text=>text.includes(token)))score+=4;
  else return 0;
 }
 return score-Math.min(label.length,60)/100;
}

export interface QuickSearchSection{title:string;items:QuickSearchItem[]}
export interface QuickSearchView{sections:QuickSearchSection[];items:QuickSearchItem[];empty:''|'no-match'|'no-recent'}
export const QUICK_SEARCH_GROUP_LIMIT=8,QUICK_SEARCH_CATEGORY_LIMIT=200,QUICK_SEARCH_SYMBOL_LIMIT=8;

/** Matching symbol rows (search order), then a row that opens Symbol search with the text. A source that cannot be opened
 * here also goes to Symbol search, which says why. */
function symbolItems(candidates:readonly SymbolSearchCandidate[],query:string,limit:number):QuickSearchItem[]{
 const text=query.trim();if(!text)return[];
 const rows=searchSymbols(candidates,text,{assetClass:'all',source:'all'},limit).rows.map(row=>item({id:'symbol:'+row.key,recentKey:'symbol:'+row.symbol,category:'Symbols',label:row.symbol,detail:[row.name,row.exchange,row.resolution,row.openable?sourceLabel(row):row.unavailableReason??'Not available'].filter(Boolean).join(' · '),keywords:[row.name],run:row.openable?{kind:'symbol',candidate:row}:{kind:'symbol-search',query:row.symbol}}));
 return[...rows,item({id:'symbol-search:'+text.toUpperCase(),recentKey:'symbol-search',category:'Symbols',label:'Search symbols for "'+text+'"',detail:'Symbol search',keywords:[],run:{kind:'symbol-search',query:text}})];
}
/** A recent key back to a row of the current index or candidates; gone rows are skipped. */
function recentItems(index:readonly QuickSearchItem[],candidates:readonly SymbolSearchCandidate[],recent:readonly string[]):QuickSearchItem[]{
 const out:QuickSearchItem[]=[];
 for(const key of recent){
  if(key.startsWith('symbol:')){const symbol=key.slice(7);const row=candidates.find(candidate=>candidate.symbol===symbol&&candidate.openable&&candidate.sourceKind!=='derived')??candidates.find(candidate=>candidate.symbol===symbol&&candidate.openable);if(row)out.push(item({id:'symbol:'+row.key,recentKey:key,category:'Symbols',label:row.symbol,detail:[row.name,row.exchange,row.resolution,sourceLabel(row)].filter(Boolean).join(' · '),run:{kind:'symbol',candidate:row}}));continue;}
  const row=index.find(entry=>entry.recentKey===key);if(row)out.push(row);
 }
 return out;
}

/** The palette view. Empty query: Recent, then every command (or every row of the chosen category). Typed: matches grouped by
 * category, best first, at most QUICK_SEARCH_GROUP_LIMIT per group under All; the groups are ordered by their best match
 * (ties keep QUICK_SEARCH_CATEGORIES order), so "rsi" leads with the indicator and "gme" with the symbol. The Symbol search
 * row alone never outranks a real match. */
export function quickSearchView(index:readonly QuickSearchItem[],input:{query:string;filter:QuickSearchFilter;recent:readonly string[];candidates:readonly SymbolSearchCandidate[]}):QuickSearchView{
 const query=input.query.trim(),filter=input.filter;
 const sections:QuickSearchSection[]=[];
 const push=(title:string,items:QuickSearchItem[])=>{const seen=new Set(sections.flatMap(section=>section.items.map(row=>row.id)));const kept=items.filter(row=>!seen.has(row.id));if(kept.length)sections.push({title,items:kept});};
 if(!query){
  const recent=recentItems(index,input.candidates,input.recent).filter(row=>filter==='All'||row.category===filter);
  push('Recent',recent);
  if(filter==='All')push('Actions',index.filter(row=>row.category==='Actions'));
  else if(filter!=='Symbols')push(filter,index.filter(row=>row.category===filter).slice(0,QUICK_SEARCH_CATEGORY_LIMIT));
  const items=sections.flatMap(section=>section.items);
  return{sections,items,empty:items.length?'':filter==='Symbols'?'no-recent':'no-match'};
 }
 const limit=filter==='All'?QUICK_SEARCH_GROUP_LIMIT:QUICK_SEARCH_CATEGORY_LIMIT,groups:{title:string;best:number;items:QuickSearchItem[]}[]=[];
 for(const category of QUICK_SEARCH_CATEGORIES){
  if(filter!=='All'&&filter!==category)continue;
  if(category==='Symbols'){const rows=symbolItems(input.candidates,query,filter==='All'?QUICK_SEARCH_SYMBOL_LIMIT:QUICK_SEARCH_CATEGORY_LIMIT);groups.push({title:'Symbols',best:Math.max(0.5,...rows.filter(row=>row.run.kind!=='symbol-search'||row.label!=='Search symbols for "'+query+'"').map(row=>quickSearchScore({label:row.label,keywords:[],detail:''},query))),items:rows});continue;}
  const ranked=index.filter(row=>row.category===category).map(row=>({row,score:quickSearchScore(row,query)})).filter(entry=>entry.score>0).sort((a,b)=>b.score-a.score);
  if(ranked.length)groups.push({title:category,best:ranked[0]!.score,items:ranked.slice(0,limit).map(entry=>entry.row)});
 }
 for(const group of groups.map((group,order)=>({group,order})).sort((a,b)=>b.group.best-a.group.best||a.order-b.order))push(group.group.title,group.group.items);
 const items=sections.flatMap(section=>section.items);
 return{sections,items,empty:items.length?'':'no-match'};
}

/** The highlighted row after a navigation key; null when there are no rows. */
export function stepQuickSearch(count:number,active:number,key:string):number|null{
 if(count<=0)return null;
 if(key==='Home')return 0;if(key==='End')return count-1;
 if(key==='ArrowDown')return active<0?0:(active+1)%count;
 if(key==='ArrowUp')return active<0?count-1:(active-1+count)%count;
 if(key==='PageDown')return Math.min(count-1,Math.max(0,active)+8);
 if(key==='PageUp')return Math.max(0,active-8);
 return active<0?0:Math.min(active,count-1);
}

/** Recent rows, a per-computer convenience in local storage (never part of the workspace). Newest first, unique, at most
 * QUICK_SEARCH_RECENT_LIMIT. Unreadable or blocked storage reads as empty and never throws. */
export const QUICK_SEARCH_RECENT_KEY='lv.quickSearch.recent',QUICK_SEARCH_RECENT_LIMIT=8;
const RECENT_KEY_TEXT=/^[a-z][a-z-]*:[\x20-\x7e]{1,200}$|^symbol-search$/;
export interface QuickSearchStorage{getItem(key:string):string|null;setItem(key:string,value:string):void}
export function readQuickSearchRecent(storage:QuickSearchStorage|null|undefined):string[]{
 try{const raw=storage?.getItem(QUICK_SEARCH_RECENT_KEY);if(!raw)return[];const value:unknown=JSON.parse(raw);if(!Array.isArray(value))return[];return[...new Set(value.filter((entry):entry is string=>typeof entry==='string'&&RECENT_KEY_TEXT.test(entry)&&entry!=='symbol-search'))].slice(0,QUICK_SEARCH_RECENT_LIMIT);}catch{return[];}
}
export function rememberQuickSearch(storage:QuickSearchStorage|null|undefined,row:Pick<QuickSearchItem,'recentKey'>):string[]{
 const key=row.recentKey;if(!RECENT_KEY_TEXT.test(key)||key==='symbol-search')return readQuickSearchRecent(storage);
 const next=[key,...readQuickSearchRecent(storage).filter(entry=>entry!==key)].slice(0,QUICK_SEARCH_RECENT_LIMIT);
 try{storage?.setItem(QUICK_SEARCH_RECENT_KEY,JSON.stringify(next));}catch{/* blocked storage: recents are a convenience only */}
 return next;
}
