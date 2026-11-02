// Indicator selector model: sidebar groups, Technicals and Fundamentals tabs, entries and empty states.
// Entries are the local OpenCandle catalog, LVScript library and SEC statement
// metrics; wording of empty states is OpenCandle's own. Community scripts are omitted
// (they need a hosted catalog; there are no accounts). Pure data: no dialog state, no chart access.
import {UNAVAILABLE_METRICS} from '../fundamentals/statements';
import {PIT_METRICS} from '../fundamentals/pit-metrics';
import type {PitMetricKey} from '../fundamentals/pit-types';
import {isFundamentalsIndicator,fundamentalPlotKind} from './indicators-ext/fundamentals-catalog';
import {VP_INDICATOR_IDS} from './indicators-ext/vp-catalog';
import {STRUCTURE_PROFILE_IDS} from './indicators-ext/structure-catalog';
import {catalogKeywords} from './indicator-catalog';
import {CHART_PATTERN_INDICATOR_IDS,PATTERN_SECTIONS,isPatternIndicator} from './indicators-ext/patterns-catalog';

export const SELECTOR_SHELL=Object.freeze({width:840,height:638,radius:12});
export const SELECTOR_SEARCH_PLACEHOLDER='Search';

export type SelectorItemId='my-scripts'|'purchased'|'built-ins'|'fundamentals';
export interface SelectorSidebarItem {id:SelectorItemId;label:string;qaId:string;defaultSelected?:boolean}
export interface SelectorSidebarGroup {label:string;items:readonly SelectorSidebarItem[]}
/** Sidebar groups and items in display order, with their qa ids. Group titles render uppercase via CSS. */
export const SELECTOR_SIDEBAR:readonly SelectorSidebarGroup[]=Object.freeze([
 {label:'Personal',items:[
  {id:'my-scripts',label:'My scripts',qaId:'indicator-sidebar-item-my-scripts'},
  {id:'purchased',label:'Purchased',qaId:'indicator-sidebar-item-purchased'},
 ]},
 {label:'Built-In',items:[
  {id:'built-ins',label:'Technicals',qaId:'indicator-sidebar-item-built-ins',defaultSelected:true},
  {id:'fundamentals',label:'Fundamentals',qaId:'indicator-sidebar-item-fundamentals'},
 ]},
]);

/** OpenCandle has nothing to purchase, so the Purchased entry is not shown for now. The item, its empty state and
 *  its view stay in the catalog; only the dialog's sidebar leaves it out. */
export const SELECTOR_HIDDEN_ITEMS:ReadonlySet<SelectorItemId>=new Set<SelectorItemId>(['purchased']);
/** The sidebar as the dialog shows it (hidden items left out, empty groups dropped). */
export const shownSelectorSidebar=():SelectorSidebarGroup[]=>SELECTOR_SIDEBAR.map(group=>({...group,items:group.items.filter(item=>!SELECTOR_HIDDEN_ITEMS.has(item.id))})).filter(group=>group.items.length>0);

export type TechnicalsTabId='indicators'|'strategies'|'profiles'|'patterns'|'options';
export type FundamentalsTabId='income'|'balance'|'cashflow'|'statistics'|'forecasts';
/** Technicals tabs (Indicators is the default). */
export const TECHNICALS_TABS:readonly {id:TechnicalsTabId;label:string}[]=Object.freeze([
 {id:'indicators',label:'Indicators'},{id:'strategies',label:'Strategies'},{id:'profiles',label:'Profiles'},{id:'patterns',label:'Patterns'},{id:'options',label:'Options'},
]);
/** Fundamentals tabs, without an overflow disclosure. */
export const FUNDAMENTALS_TABS:readonly {id:FundamentalsTabId;label:string}[]=Object.freeze([
 {id:'income',label:'Income statement'},{id:'balance',label:'Balance sheet'},{id:'cashflow',label:'Cash flow'},{id:'statistics',label:'Statistics'},{id:'forecasts',label:'Forecasts'},
]);

export type SelectorCategory='indicators'|'profiles'|'patterns'|'options'|'fundamentals';
/** The volume profile built-ins belong to the Profiles tab (with
 *  Periodic and Visible range volume profile), not the Indicators tab. */
export const PROFILE_INDICATOR_IDS:readonly string[]=Object.freeze([...VP_INDICATOR_IDS,...STRUCTURE_PROFILE_IDS]);
export const isProfileIndicator=(id:string)=>PROFILE_INDICATOR_IDS.includes(id);
/** The chart and candlestick pattern built-ins belong to the Patterns tab. */
export {isPatternIndicator};
/** The tab an entry is listed in: its declared category, else Profiles for the profile built-ins, Patterns for the pattern
 *  built-ins, else Indicators. */
export const selectorCategoryOf=(row:{id:string;category?:SelectorCategory}):SelectorCategory=>row.category??(isProfileIndicator(row.id)?'profiles':isPatternIndicator(row.id)?'patterns':isFundamentalsIndicator(row.id)?'fundamentals':'indicators');
/** The fundamentals built-ins are added from the Fundamentals rows (each row is a preset), never listed under Technicals. */
export {isFundamentalsIndicator};
/** One Fundamentals sidebar row: the kind it adds, its inputs and the plot style that differs from the kind default. */
export interface FundamentalsPreset {id:string;label:string;kind:'fundamental'|'pebands';inputs:Record<string,string|number|boolean>;plotKind?:'step'|'line'}
const metricPreset=(key:PitMetricKey):FundamentalsPreset=>({id:'fundamental:'+key,label:PIT_METRICS.find(row=>row.key===key)!.label,kind:'fundamental',inputs:{metric:key,period:'ttm',display:'value',revisions:'first'},plotKind:fundamentalPlotKind(key)});
/** The rows of each Fundamentals tab, in display order. Statement lines outside these stay in the Fundamentals view. */
export const FUNDAMENTALS_PRESETS:Readonly<Record<Exclude<FundamentalsTabId,'forecasts'>,readonly FundamentalsPreset[]>>=Object.freeze({
 income:(['revenue','net_income','eps','dps'] as const).map(metricPreset),
 balance:(['shares','current_ratio','liab_equity'] as const).map(metricPreset),
 cashflow:(['ocf','capex','fcf','fcf_ps'] as const).map(metricPreset),
 statistics:[...(['gross_margin','op_margin','net_margin','fcf_margin','pe','ey','ps','pb','pfcf','fcfy','mcap','dy'] as const).map(metricPreset),{id:'pebands',label:'P/E bands',kind:'pebands' as const,inputs:{}}],
});
/** The preset a Fundamentals row id adds, or null for any other id. */
export function fundamentalsPreset(id:string):FundamentalsPreset|null{for(const rows of Object.values(FUNDAMENTALS_PRESETS))for(const row of rows)if(row.id===id)return row;return null;}
export interface SelectorIndicator {id:string;name:string;acronym:string;category?:SelectorCategory}
export interface SelectorScript {id:string;name:string;kind:'indicator'|'strategy'}
/** `strategies` are the built-in strategies, listed first in the
 *  Strategies tab in their catalog order, before the saved LVScript strategies. */
export interface SelectorSource {indicators:readonly SelectorIndicator[];scripts:readonly SelectorScript[];strategies?:readonly {id:string;name:string}[]}
/** section: the Patterns tab section title the entry is listed under (Chart patterns, Candlestick patterns). */
export interface SelectorEntry {id:string;label:string;kind:'indicator'|'script'|'metric'|'strategy';section?:string}
export type SelectorEmpty={kind:'no-match'}|{kind:'empty';text:string};
export interface SelectorSelection {item:SelectorItemId;tab?:string;query:string}
export interface SelectorView {item:SelectorItemId;tab:string|null;columnHeaders:string[];entries:SelectorEntry[];empty:SelectorEmpty|null}

export function defaultSelectorSelection():{item:'built-ins';tab:'indicators'}{return{item:'built-ins',tab:'indicators'};}

const EMPTY={
 strategies:'No strategies yet. Save an CandleScript strategy and it appears here.',
 profiles:'No profile indicators are available.',
 patterns:'OpenCandle has no pattern indicators yet.',
 options:'OpenCandle has no options indicators yet.',
 myScripts:'No scripts yet. Create an indicator or strategy in the script editor and it appears here.',
 purchased:'OpenCandle has no store, so nothing is purchased here.',
 forecasts:'Estimates come from vendor data, and OpenCandle has no permitted estimate source connected.',
 statistics:'No statistics are available.',
} as const;

const alphabetical=(a:{label:string;id:string},b:{label:string;id:string})=>a.label.localeCompare(b.label,'en',{sensitivity:'base'})||a.id.localeCompare(b.id);
const matches=(haystack:string,query:string)=>{const terms=query.toLocaleLowerCase('en-US').split(/\s+/).filter(Boolean),text=haystack.toLocaleLowerCase('en-US');return terms.every(term=>text.includes(term));};

function metricsFor(tab:FundamentalsTabId):SelectorEntry[]{
 if(tab==='forecasts')return[];
 return FUNDAMENTALS_PRESETS[tab].map(row=>({id:row.id,label:row.label,kind:'metric' as const}));
}

/** The visible entries for a sidebar item and tab, filtered by the search text. Unknown selections fail instead of guessing. */
export function selectorView(source:SelectorSource,selection:SelectorSelection):SelectorView{
 const {item,query}=selection;
 const filter=(rows:SelectorEntry[],emptyText:string,haystack:(row:SelectorEntry)=>string=row=>row.label+' '+row.id,sort=true):{entries:SelectorEntry[];empty:SelectorEmpty|null}=>{
  const all=sort?[...rows].sort(alphabetical):rows;
  if(!all.length)return{entries:[],empty:{kind:'empty',text:emptyText}};
  const entries=all.filter(row=>matches(haystack(row),query));
  return{entries,empty:entries.length?null:{kind:'no-match'}};
 };
 if(item==='my-scripts'){
  const result=filter(source.scripts.map(row=>({id:row.id,label:row.name,kind:'script' as const})),EMPTY.myScripts,undefined,false);
  return{item,tab:null,columnHeaders:['Script name'],...result};
 }
 if(item==='purchased')return{item,tab:null,columnHeaders:[],entries:[],empty:{kind:'empty',text:EMPTY.purchased}};
 if(item==='built-ins'){
  const tab=(selection.tab??'indicators') as TechnicalsTabId;
  if(!TECHNICALS_TABS.some(row=>row.id===tab))throw new Error('Unknown selector tab.');
  const indicators=(category:SelectorCategory)=>source.indicators.filter(row=>selectorCategoryOf(row)===category).map(row=>({id:row.id,label:row.name,kind:'indicator' as const,acronym:row.acronym}));
  const withAcronym=(rows:Array<SelectorEntry&{acronym:string}>)=>filter(rows,'',row=>row.label+' '+(row as {acronym?:string}).acronym+' '+row.id+' '+catalogKeywords(row.id));
  let result:{entries:SelectorEntry[];empty:SelectorEmpty|null};
  if(tab==='patterns'){
   // Two sections as captured; chart patterns keep the captured order, candlestick patterns are alphabetical
   // (the captured candlestick rows are alphabetical). No column header row: the section titles take its place.
   const rows=indicators('patterns'),chart=rows.filter(row=>CHART_PATTERN_INDICATOR_IDS.includes(row.id)).sort((a,b)=>CHART_PATTERN_INDICATOR_IDS.indexOf(a.id)-CHART_PATTERN_INDICATOR_IDS.indexOf(b.id)),candles=rows.filter(row=>!CHART_PATTERN_INDICATOR_IDS.includes(row.id)).sort(alphabetical);
   if(!rows.length)return{item,tab,columnHeaders:[],entries:[],empty:{kind:'empty',text:EMPTY.patterns}};
   const pick=(list:typeof rows,section:string)=>list.filter(row=>matches(row.label+' '+row.acronym+' '+row.id+' '+catalogKeywords(row.id),query)).map(({id,label,kind})=>({id,label,kind,section}));
   const entries=[...pick(chart,PATTERN_SECTIONS[0].label),...pick(candles,PATTERN_SECTIONS[1].label)];
   return{item,tab,columnHeaders:[],entries,empty:entries.length?null:{kind:'no-match'}};
  }
  if(tab==='strategies')result=filter([...(source.strategies??[]).map(row=>({id:row.id,label:row.name,kind:'strategy' as const})),...source.scripts.filter(row=>row.kind==='strategy').map(row=>({id:row.id,label:row.name,kind:'script' as const}))],EMPTY.strategies,undefined,false);
  else{
   const rows=indicators(tab==='indicators'?'indicators':tab);
   result=rows.length?withAcronym(rows):{entries:[],empty:{kind:'empty',text:tab==='indicators'?'No indicators are available.':EMPTY[tab]}};
  }
  result.entries=result.entries.map(({id,label,kind})=>({id,label,kind}));
  return{item,tab,columnHeaders:['Script name'],...result};
 }
 if(item==='fundamentals'){
  const tab=(selection.tab??'income') as FundamentalsTabId;
  if(!FUNDAMENTALS_TABS.some(row=>row.id===tab))throw new Error('Unknown selector tab.');
  const result=filter(metricsFor(tab),tab==='forecasts'?EMPTY.forecasts:EMPTY.statistics,undefined,false);
  // Casing: the fact records the header as uppercase via CSS and says the source casing was not read.
  return{item,tab,columnHeaders:['Metric name'],...result};
 }
 throw new Error('Unknown selector item.');
}

/** Why a listed metric is not offered locally (for the Fundamentals footer or tooltip). */
export const SELECTOR_UNAVAILABLE_METRICS:readonly {label:string;reason:string}[]=Object.freeze(UNAVAILABLE_METRICS.map(row=>({label:row.label,reason:row.reason})));

/** Claim rule: a selector tab is claimable only if it lists at least one usable LV entry on the fixture. */
export function claimableSelectorTabs(source:SelectorSource){
 const count=(selection:SelectorSelection)=>selectorView(source,selection).entries.length>0;
 return{
  builtIns:count({item:'built-ins',tab:'indicators',query:''}),
  indicators:count({item:'built-ins',tab:'indicators',query:''}),
  strategies:count({item:'built-ins',tab:'strategies',query:''}),
  financials:FUNDAMENTALS_TABS.some(tab=>count({item:'fundamentals',tab:tab.id,query:''})),
  scripts:count({item:'my-scripts',query:''}),
 };
}
