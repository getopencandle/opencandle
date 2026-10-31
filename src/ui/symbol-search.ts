import type {AssetClass,BarDataset,DataState} from '../domain/types';
import {FIXTURE_CAPABILITIES,FIXTURE_PROVIDER_NAME,fixtureInstrument} from '../domain/fixtures';
import {demoSymbolAllowed,demoDataMode} from '../domain/demo-mode';
import {suppliedSourceId} from './workspace-grid';
import {isLiveProviderId} from '../domain/live-provider';
import {ALPACA_IEX_PROVIDER_ID,ALPACA_SYMBOL,alpacaAssetNotice,alpacaSearchDatasets,type AlpacaAsset} from '../domain/alpaca-live';
import {rememberAlpacaAssets} from '../domain/symbol-info';
import type {MultiChartState} from './MultiChartGrid';
import {isCanonicalSymbolMath,parseSymbolMath,SYMBOL_MATH_MAX_LENGTH} from '../domain/symbol-math';
import {SYMBOL_MATH_EXCHANGE,SYMBOL_MATH_PROVIDER_ID,symbolMathDatasetId} from '../domain/symbol-math-live';
import {coinbaseSearchDatasets} from '../domain/coinbase-live';

/** Same accepted text as App switchSymbol; a row that cannot pass it is shown but not openable. */
export const SYMBOL_TEXT=/^[A-Z0-9.^_-]{1,24}$/;
export const SYMBOL_SEARCH_LIMIT=100;
export type SymbolSearchOrigin='toolbar'|'typed'|'shortcut'|'entry';
/** 'expression' is a symbol math row (GME/SPY), computed from its component feeds when opened. */
export type SymbolSourceKind='imported'|'synthetic'|'derived'|'generated'|'live'|'expression';
/** One row per exact supplied dataset. Nothing here is a quote: values are declared source metadata. */
export interface SymbolSearchCandidate {
 key:string;stamp:string;
 symbol:string;exchange:string;name:string;assetClass:AssetClass;currency:string;instrumentId:string;
 resolution:string;datasetId:string;sourceId:string|null;sourceKind:SymbolSourceKind;
 providerId:string;providerName:string;revision:string;coverage:string;adjustment:string;session:string;timezone:string;
 synthetic:boolean;barCount:number|null;lastBarTime:number|null;delaySeconds:number|null;state:DataState|null;
 openable:boolean;unavailableReason:string|null;
 /** Plain words shown under an openable row (for example a listing Alpaca marks not tradable). */
 notice?:string|null;
}
export interface SymbolSwitchRequest {symbol:string;sourceId:string|null;datasetId:string;exchange:string;providerId:string;resolution:string;synthetic:boolean;generated:boolean;origin:SymbolSearchOrigin;candidateKey:string;stamp:string}
/** exchange: 'all' or omitted keeps every exchange; otherwise rows whose exchange equals it. */
export interface SymbolSearchFilters {assetClass:'all'|AssetClass;source:'all'|'imported'|'synthetic'|'live';exchange?:string}
export const ASSET_CLASS_LABELS:Record<AssetClass,string>={stock:'Stocks',etf:'Funds',index:'Indices',option:'Options',future:'Futures',forex:'Forex',crypto:'Crypto',commodity:'Commodities',bond:'Bonds',other:'Other'};
/** The Source filter choices in plain words (internal kinds stay in the filter values). */
export const SOURCE_FILTER_LABELS:Readonly<Record<SymbolSearchFilters['source'],string>>=Object.freeze({all:'All sources',imported:'Imported',synthetic:'Example',live:'Live'});
/** The empty-result line, in the reference's words. */
export function noSymbolsMatch(query:string):string{const text=String(query??'').trim();return text?'No symbols match "'+text+'".':'No symbols match these filters.';}
/** The reference lists the exact ticker first. A typed ticker with no supplied source is offered as a DEMO
 * row; from two characters on it is that exact ticker, so it leads the list (MS above MSFT) and Enter opens it. A single
 * letter is still being typed, so supplied prefix matches keep the lead there (G opens GME). */
/** The typed text names this ticker's base: BTC for BTC-USD or BTC.X, not GM for GME (a different company). */
export function sameBaseTicker(ticker:string,typed:string):boolean{const t=ticker.toUpperCase();return !!typed&&t.startsWith(typed)&&(t.length===typed.length||/[-./:_]/.test(t[typed.length]));}
/** A real (not synthetic) openable row for the same base ticker (live BTC-USD for "btc") keeps the lead, so a
 * made-up DEMO ticker never outranks real data for it. GM still leads GME. */
export function generatedLeads(query:string,generated:Pick<SymbolSearchCandidate,'symbol'>|null,supplied:readonly Pick<SymbolSearchCandidate,'symbol'|'synthetic'|'openable'>[]=[]):boolean{const q=parseSymbolQuery(query).symbol;return !!generated&&q.length>=2&&generated.symbol===q&&!supplied.some(row=>row.openable&&!row.synthetic&&sameBaseTicker(row.symbol,q));}
/** Coinbase products the typed text names (ticker prefix or name) while Coinbase is off, so search can offer
 * to turn the live crypto source on instead of only a DEMO row. Empty when Coinbase is on or nothing matches. */
export function coinbaseOfferFor(query:string,coinbaseEnabled:boolean):string[]{
 if(coinbaseEnabled)return[];const q=parseSymbolQuery(query).symbol;if(q.length<2)return[];
 return coinbaseSearchDatasets(true).filter(row=>row.instrument.symbol.startsWith(q)||row.instrument.name.toUpperCase().includes(q)).map(row=>row.instrument.symbol);
}
/** A generated DEMO ticker shaped like a crypto pair (BTC-USD) is labelled Crypto, not Stocks. */
const CRYPTO_PAIR=/^[A-Z0-9]{2,10}-(USD|USDC|USDT|EUR|GBP|BTC|ETH)$/;
export const SOURCE_KIND_LABELS:Record<SymbolSourceKind,string>={imported:'Imported',synthetic:'DEMO',derived:'Derived local bars',generated:'DEMO',live:'Live',expression:'Derived (symbol math)'};
/** Source badge text: anything built from synthetic bars always carries the one DEMO marking. */
export function sourceLabel(row:Pick<SymbolSearchCandidate,'sourceKind'|'synthetic'>):string{/* Generated rows read EXAMPLE outside the legacy mode (they only show in example mode). */const demo=demoDataMode()==='legacy'?'DEMO':'EXAMPLE';return row.synthetic&&row.sourceKind==='derived'?demo+' · derived':row.sourceKind==='synthetic'||row.sourceKind==='generated'?demo:SOURCE_KIND_LABELS[row.sourceKind];}

const text=(value:unknown,fallback='')=>typeof value==='string'?value:fallback;
const finite=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:null;
/** Build searchable rows from the exact chart universe. `imports` decides the sourceId App's switchSymbol needs. */
export function buildSymbolSearchCandidates(universe:readonly BarDataset[],imports:readonly BarDataset[]):SymbolSearchCandidate[]{
 const rows:SymbolSearchCandidate[]=[],byKey=new Map<string,SymbolSearchCandidate>();
 for(const dataset of universe){
  const i=dataset.instrument,p=dataset.provenance,bars=Array.isArray(dataset.bars)?dataset.bars:[],last=bars.length?bars[bars.length-1]:null;
  const symbol=text(i?.symbol),datasetId=text(p?.datasetId),resolution=text(dataset.resolution);
  if(!symbol||!datasetId)continue;
  const derived=Object.hasOwn(dataset,'derivation')||p.providerId==='lv-local-aggregation';
  const live=isLiveProviderId(p.providerId);
  let sourceId:string|null=null,reason:string|null=null;
  if(live)sourceId=datasetId;else try{sourceId=suppliedSourceId({imports:[...imports]},dataset);}catch(error){reason=error instanceof Error?error.message:String(error);}
  // selectedDataset matches the stored ticker exactly, so only already-canonical tickers can be opened.
  if(!reason&&!SYMBOL_TEXT.test(symbol))reason='This ticker cannot be entered in the chart symbol field (letters, numbers, dots, carets, underscores or dashes, at most 24).';
  const lastBarTime=finite(last?.time);
  const candidate:SymbolSearchCandidate={key:JSON.stringify([datasetId,symbol,resolution]),stamp:JSON.stringify([datasetId,p.revision,resolution,symbol,i.exchange,i.id,i.name,i.assetClass,i.currency,p.providerId,p.providerName,p.fixture,p.coverage,p.adjustment,p.session,p.timezone,p.delaySeconds,derived,bars.length,lastBarTime,p.asOf,p.state]),
   symbol,exchange:text(i.exchange),name:text(i.name),assetClass:i.assetClass,currency:text(i.currency),instrumentId:text(i.id),
   resolution,datasetId,sourceId,sourceKind:live?'live':derived?'derived':p.fixture===true?'synthetic':'imported',
   providerId:text(p.providerId),providerName:text(p.providerName),revision:text(p.revision),coverage:text(p.coverage),adjustment:text(p.adjustment),session:text(p.session),timezone:text(p.timezone),
   synthetic:p.fixture===true,barCount:bars.length,lastBarTime,delaySeconds:finite(p.delaySeconds),state:p.state??null,openable:!reason,unavailableReason:reason};
  const prior=byKey.get(candidate.key);
  if(prior){if(prior.stamp!==candidate.stamp){prior.openable=false;prior.unavailableReason='Two different sources share this dataset identity. Re-import one of them.';}continue;}
  byKey.set(candidate.key,candidate);rows.push(candidate);
 }
 return rows;
}
export interface ParsedSymbolQuery {text:string;exchange:string|null;symbol:string}
/** `EXCHANGE:SYMBOL` narrows by exchange; anything else is a plain ticker/name query. */
export function parseSymbolQuery(value:string):ParsedSymbolQuery{
 const trimmed=String(value??'').trim().toUpperCase().slice(0,80),parts=trimmed.split(':');
 if(parts.length===2&&parts[0].trim()&&parts[1].trim())return{text:trimmed,exchange:parts[0].trim(),symbol:parts[1].trim()};
 return{text:trimmed,exchange:null,symbol:trimmed};
}
function rank(row:SymbolSearchCandidate,query:ParsedSymbolQuery):number|null{
 // A symbol math row is built for the typed text itself, so it always matches (and ranks first).
 if(row.sourceKind==='expression')return 0;
 if(query.exchange&&!row.exchange.toUpperCase().startsWith(query.exchange))return null;
 const q=query.symbol,ticker=row.symbol.toUpperCase();if(!q)return 5;
 if(ticker===q)return 0;if(ticker.startsWith(q))return 1;if(ticker.includes(q))return 2;
 if(row.name.toUpperCase().includes(q))return 3;
 if(!query.exchange&&(row.exchange.toUpperCase().includes(q)||row.providerName.toUpperCase().includes(q)))return 4;
 return null;
}
/** Real before synthetic; within each, the supplied source before bars derived from it; generation last. */
const sourceOrder=(row:SymbolSearchCandidate)=>row.sourceKind==='generated'?4:(row.synthetic?2:0)+(row.sourceKind==='derived'?1:0);
export interface SymbolSearchResult {rows:SymbolSearchCandidate[];total:number;truncated:number}
export function searchSymbols(candidates:readonly SymbolSearchCandidate[],query:string,filters:SymbolSearchFilters={assetClass:'all',source:'all'},limit=SYMBOL_SEARCH_LIMIT):SymbolSearchResult{
 const parsed=parseSymbolQuery(query),matches:{row:SymbolSearchCandidate;score:number}[]=[];
 for(const row of candidates){
  if(filters.assetClass!=='all'&&row.assetClass!==filters.assetClass)continue;
  if(filters.exchange&&filters.exchange!=='all'&&row.exchange!==filters.exchange)continue;
  if(row.sourceKind==='expression'&&filters.source!=='all'&&filters.source!=='live')continue;
  if(filters.source==='imported'&&(row.synthetic||row.sourceKind==='live')||filters.source==='synthetic'&&!row.synthetic||filters.source==='live'&&row.sourceKind!=='live')continue;
  const score=rank(row,parsed);if(score!==null)matches.push({row,score});
 }
 // An exact DEMO ticker does not outrank a real source that starts with the typed text (BTC demo vs live BTC-USD).
 if(matches.some(entry=>entry.score<=1&&!entry.row.synthetic&&entry.row.openable&&entry.row.sourceKind!=='expression'&&sameBaseTicker(entry.row.symbol,parsed.symbol)))for(const entry of matches)if(entry.score===0&&entry.row.synthetic)entry.score=1;
 const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
 matches.sort((a,b)=>a.score-b.score||Number(b.row.openable)-Number(a.row.openable)||sourceOrder(a.row)-sourceOrder(b.row)||cmp(a.row.symbol,b.row.symbol)||cmp(a.row.exchange,b.row.exchange)||cmp(a.row.providerName,b.row.providerName)||cmp(a.row.resolution,b.row.resolution)||cmp(a.row.datasetId,b.row.datasetId));
 const rows=matches.slice(0,Math.max(0,limit)).map(entry=>entry.row);
 return{rows,total:matches.length,truncated:matches.length-rows.length};
}
/** With an Alpaca key saved, any typed US stock ticker is offered as a live row, so the owner does not
 * have to pre-list it in Data sources (that list still seeds search). Nothing is fetched until the row is opened. */
export function liveTypedCandidates(query:string,candidates:readonly SymbolSearchCandidate[],alpacaKey:boolean,resolution:string):SymbolSearchCandidate[]{
 if(!alpacaKey)return[];
 const parsed=parseSymbolQuery(query);
 if(parsed.exchange&&parsed.exchange!=='US'||!ALPACA_SYMBOL.test(parsed.symbol))return[];
 if(candidates.some(row=>row.providerId===ALPACA_IEX_PROVIDER_ID&&row.symbol===parsed.symbol))return[];
 return buildSymbolSearchCandidates(alpacaSearchDatasets(true,[parsed.symbol],resolution),[]);
}
/** Typed symbol math (GME/SPY, GME-SPY, GME*2, (GME+SPY)/2, GME.WS/GME) is offered as one Derived row.
 * Opening it opens each component through the chart loaders and computes the series bar by bar. A typed text with an
 * operator that does not parse is listed, not openable, with the parser's plain reason. A bare ticker (BTC-USD, BRK.B)
 * is never an expression. `known` names dash tickers to take whole (for example an imported BRK-B). */
export function symbolMathCandidates(query:string,resolution:string,known?:(symbol:string)=>boolean):SymbolSearchCandidate[]{
 const text=String(query??'').trim().toUpperCase().slice(0,SYMBOL_MATH_MAX_LENGTH);if(!text)return[];
 const parsed=parseSymbolMath(text,known);
 if(!parsed.ok){
  if(!/[/*+()]|\s-|-\s|^-/.test(text))return[];
  const key=JSON.stringify(['symbol-math-invalid',text]);
  return[{key,stamp:key,symbol:text,exchange:SYMBOL_MATH_EXCHANGE,name:'Symbol math',assetClass:'other',currency:'USD',instrumentId:SYMBOL_MATH_EXCHANGE+':'+text,resolution,datasetId:'symbol-math-invalid:'+text,sourceId:null,sourceKind:'expression',
   providerId:SYMBOL_MATH_PROVIDER_ID,providerName:'Symbol math',revision:'',coverage:'Not a valid expression',adjustment:'unknown',session:'unknown',timezone:'UTC',synthetic:false,barCount:null,lastBarTime:null,delaySeconds:null,state:null,openable:false,unavailableReason:parsed.error,notice:null}];
 }
 const expression=parsed.expression;if(expression.ast.kind==='sym')return[];
 const datasetId=symbolMathDatasetId(expression.canonical,resolution),key=JSON.stringify(['symbol-math',expression.canonical,resolution]);
 return[{key,stamp:key,symbol:expression.canonical,exchange:SYMBOL_MATH_EXCHANGE,name:'Derived: '+expression.canonical,assetClass:'other',currency:'USD',instrumentId:SYMBOL_MATH_EXCHANGE+':'+expression.canonical,resolution,datasetId,sourceId:datasetId,sourceKind:'expression',
  providerId:SYMBOL_MATH_PROVIDER_ID,providerName:'Symbol math',revision:'',coverage:'Computed bar by bar from '+expression.symbols.join(', '),adjustment:'unknown',session:'unknown',timezone:'UTC',synthetic:false,barCount:null,lastBarTime:null,delaySeconds:null,state:null,
  openable:true,unavailableReason:null,notice:'Opens '+expression.symbols.join(', ')+' and computes '+expression.canonical+' bar by bar.'}];
}
/** One live Alpaca row per listing from the owner's Alpaca asset list, under Alpaca's own symbol and
 * company name (GME.WS "GameStop Corp. Warrants"). A listing in a symbol format the chart cannot use is shown but not
 * openable; one that may have no IEX data carries a plain notice. Rows are deterministic for the same listing. */
export function alpacaAssetCandidates(assets:readonly AlpacaAsset[],resolution:string):SymbolSearchCandidate[]{
 rememberAlpacaAssets(assets); // Symbol info reads listings the search already received
 const rows:SymbolSearchCandidate[]=[];
 for(const asset of assets){
  const notice=alpacaAssetNotice(asset);
  if(asset.chartable&&ALPACA_SYMBOL.test(asset.symbol)){
   const [row]=buildSymbolSearchCandidates(alpacaSearchDatasets(true,[asset.symbol],resolution),[]);if(!row)continue;
   rows.push({...row,name:asset.name||row.name,exchange:asset.exchange||row.exchange,stamp:JSON.stringify([row.stamp,asset.name,asset.exchange,asset.tradable,asset.status]),notice});
  }else{
   const key=JSON.stringify(['alpaca-asset',asset.symbol]);
   rows.push({key,stamp:key,symbol:asset.symbol,exchange:asset.exchange,name:asset.name,assetClass:'stock',currency:'USD',instrumentId:'US:'+asset.symbol,resolution,datasetId:'alpaca-asset:'+asset.symbol,sourceId:null,sourceKind:'live',
    providerId:ALPACA_IEX_PROVIDER_ID,providerName:'Alpaca asset list',revision:'',coverage:'Listed by Alpaca; not chartable here',adjustment:'raw',session:'unknown',timezone:'America/New_York',synthetic:false,barCount:null,lastBarTime:null,delaySeconds:null,state:null,
    openable:false,unavailableReason:notice??'OpenCandle cannot chart this symbol format yet.',notice:null});
  }
 }
 return rows;
}
/** Asset rows replace a saved or typed live row for the same feed (same key), so each feed is listed once with Alpaca's name. */
export function mergeAssetCandidates(base:readonly SymbolSearchCandidate[],assets:readonly SymbolSearchCandidate[]):SymbolSearchCandidate[]{
 if(!assets.length)return[...base];
 const byKey=new Map(assets.map(row=>[row.key,row])),used=new Set<string>();
 const merged=base.map(row=>{const asset=byKey.get(row.key);if(!asset)return row;used.add(row.key);return asset;});
 for(const row of assets)if(!used.has(row.key)){used.add(row.key);merged.push(row);}
 return merged;
}
/** The existing app can generate an arbitrary SYNTHETIC DEMO symbol. Search offers that only as an
 * explicit, labelled row when no supplied source carries the typed ticker; it is never auto-selected. */
export function syntheticGenerationCandidate(query:string,candidates:readonly SymbolSearchCandidate[]):SymbolSearchCandidate|null{
 const parsed=parseSymbolQuery(query);
 /* No generated tickers outside the example symbols (none in normal use). */
 if(!demoSymbolAllowed(parsed.symbol))return null;
 if(!SYMBOL_TEXT.test(parsed.symbol)||parsed.exchange&&parsed.exchange!=='SYNTHETIC'||candidates.some(row=>row.symbol.toUpperCase()===parsed.symbol))return null;
 const i=fixtureInstrument(parsed.symbol),datasetId=`${FIXTURE_CAPABILITIES.id}:${i.symbol}`;
 return{key:JSON.stringify(['generate',datasetId]),stamp:JSON.stringify(['generate',datasetId]),symbol:i.symbol,exchange:i.exchange,name:i.name,assetClass:CRYPTO_PAIR.test(i.symbol)?'crypto':i.assetClass,currency:i.currency,instrumentId:i.id,
  resolution:'1D',datasetId,sourceId:null,sourceKind:'generated',providerId:FIXTURE_CAPABILITIES.id,providerName:FIXTURE_PROVIDER_NAME,revision:'1',
  coverage:'Generated on request. No real market coverage.',adjustment:'raw',session:'unknown',timezone:'UTC',synthetic:true,barCount:null,lastBarTime:null,delaySeconds:null,state:null,openable:true,unavailableReason:null};
}
export function switchRequest(row:SymbolSearchCandidate,origin:SymbolSearchOrigin):SymbolSwitchRequest{
 return{symbol:row.symbol,sourceId:row.sourceId,datasetId:row.datasetId,exchange:row.exchange,providerId:row.providerId,resolution:row.resolution,synthetic:row.synthetic,generated:row.sourceKind==='generated',origin,candidateKey:row.key,stamp:row.stamp};
}
export type SymbolEntryResolution=
 |{kind:'unique';candidate:SymbolSearchCandidate}
 |{kind:'ambiguous';candidates:SymbolSearchCandidate[]}
 |{kind:'unresolved';symbol:string}
 |{kind:'invalid';message:string};
/** Header symbol field Enter: switch only when one supplied source is unambiguous; otherwise the
 * caller opens the search dialog with the typed text. Different intervals of one source family
 * resolve to the current interval when exactly one matches it. */
export function resolveSymbolEntry(value:string,candidates:readonly SymbolSearchCandidate[],currentResolution?:string):SymbolEntryResolution{
 const parsed=parseSymbolQuery(value);
 if(!SYMBOL_TEXT.test(parsed.symbol)||parsed.exchange!==null&&!/^[A-Z0-9._ -]{1,32}$/.test(parsed.exchange))return{kind:'invalid',message:'Enter a symbol using letters, numbers, dots, carets, underscores or dashes (at most 24), optionally prefixed by EXCHANGE:.'};
 const matching=candidates.filter(row=>row.openable&&row.symbol===parsed.symbol&&(parsed.exchange===null||row.exchange.toUpperCase()===parsed.exchange));
 // Derived/resampled datasets (interval aggregation leaves them in imports) belong to the source they
 // were built from: they never make header entry ambiguous while a supplied source exists. Baseline
 // switchSymbol opened the supplied/fixture source here too; derived rows stay reachable in the dialog.
 const supplied=matching.filter(row=>row.sourceKind!=='derived'),exact=supplied.length?supplied:matching;
 if(!exact.length)return{kind:'unresolved',symbol:parsed.symbol};
 if(exact.length===1)return{kind:'unique',candidate:exact[0]};
 const families=new Set(exact.map(row=>JSON.stringify([row.instrumentId,row.exchange,row.providerId,row.synthetic,row.sourceKind])));
 if(families.size===1&&currentResolution){const same=exact.filter(row=>row.resolution===currentResolution);if(same.length===1)return{kind:'unique',candidate:same[0]};}
 return{kind:'ambiguous',candidates:exact};
}
/** Typing on the chart. Digits are left for interval entry, '.' for layouts and Shift+letter
 * for the reserved Shift presets. Ctrl/Cmd+K opens Quick search (shortcut-dispatch 'quick-search'), whose
 * Symbols group finds the same candidates; the 'shortcut' origin stays for callers that open the search directly. */
export interface SymbolEntryKeyEvent {key:string;ctrlKey:boolean;metaKey:boolean;altKey:boolean;shiftKey:boolean;isComposing?:boolean;repeat?:boolean}
export function symbolEntryFromKey(event:SymbolEntryKeyEvent,blocked:boolean):{initialQuery:string;origin:'typed'|'shortcut'}|null{
 if(blocked||event.isComposing||event.repeat)return null;
 if(event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return null;
 return /^[a-zA-Z]$/.test(event.key)?{initialQuery:event.key.toUpperCase(),origin:'typed'}:null;
}
/** Typing while a watchlist has focus opens its Add symbol dialog with the typed character,
 * on every list (custom and flagged), for letters and digits, shifted or not, as in the reference watchlist. The host marks itself
 * with `data-lv-type-to-add`; buttons, links, fields, dialogs and menus inside it keep their own keys. The App capture listener
 * returns early for such a key so symbol search, interval entry and the Shift presets never take it. Returns the seed or null. */
export const WATCH_TYPE_TO_ADD_HOST='[data-lv-type-to-add]';
export const WATCH_TYPE_TO_ADD_SKIP='input,textarea,select,button,a,[contenteditable=true],[contenteditable="true"],[role=dialog],[role=menu]';
/** The key part alone: an unmodified or shifted letter or digit, as the typed (upper-case) seed; null otherwise. */
export function watchTypeToAddKey(event:SymbolEntryKeyEvent):string|null{
 if(event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return null;
 return typeof event.key==='string'&&/^[a-zA-Z0-9]$/.test(event.key)?event.key.toUpperCase():null;
}
export function watchTypeToAddSeed(event:SymbolEntryKeyEvent,target:{closest?:(selector:string)=>unknown}|null|undefined):string|null{
 if(watchTypeToAddKey(event)===null)return null;
 try{if(!target?.closest?.(WATCH_TYPE_TO_ADD_HOST)||target.closest(WATCH_TYPE_TO_ADD_SKIP))return null;}catch{return null;}
 return event.key.toUpperCase();
}
/** Typed entry must not fire while a dialog, menu, context menu, listbox or popover is open, or from
 * inside one (type-to-search applies to the chart workspace only). Fails closed. 
 * a native open <dialog> and any aria-modal surface count as dialogs too, whatever their role. */
export const SYMBOL_ENTRY_BLOCKERS='[role=dialog],[role=alertdialog],dialog[open],[aria-modal="true"],[role=menu],[role=menubar],[role=listbox],[data-lv-context-menu],.color-popover';
/** Shell popups (Main menu, Chart types, Layouts, Calendar views, Help) stay mounted with
 * `hidden`, so only a rendered blocker counts. An element is treated as hidden when it, or an ancestor,
 * carries `hidden`, `aria-hidden="true"` or `inert`, when the browser's checkVisibility() says so, or when
 * its computed style is display:none / visibility:hidden. Objects without DOM shape count as visible. */
interface BlockerCandidate {closest?:(selector:string)=>unknown;checkVisibility?:(options?:object)=>boolean;ownerDocument?:{defaultView?:{getComputedStyle?:(element:never)=>{display?:string;visibility?:string}}|null}|null}
export function symbolEntryBlockerVisible(element:unknown):boolean{
 if(!element||typeof element!=='object')return false;const node=element as BlockerCandidate;
 if(typeof node.closest==='function'&&node.closest('[hidden],[aria-hidden="true"],[inert]'))return false;
 if(typeof node.checkVisibility==='function')return node.checkVisibility({checkVisibilityCSS:true});
 const style=node.ownerDocument?.defaultView?.getComputedStyle?.(element as never);
 return !style||style.display!=='none'&&style.visibility!=='hidden';
}
export function symbolEntryBlocked(root:{querySelector(selector:string):unknown;querySelectorAll?:(selector:string)=>ArrayLike<unknown>}|null|undefined,target?:{closest?:(selector:string)=>unknown}|null):boolean{
 try{
  if(!root)return true;
  const open=typeof root.querySelectorAll==='function'?Array.from(root.querySelectorAll(SYMBOL_ENTRY_BLOCKERS)).some(symbolEntryBlockerVisible):!!root.querySelector(SYMBOL_ENTRY_BLOCKERS);
  if(open)return true;
  const inside=target?.closest?.(SYMBOL_ENTRY_BLOCKERS+',input,textarea,select,[contenteditable="true"]');
  return !!inside&&(typeof (inside as BlockerCandidate).closest!=='function'||symbolEntryBlockerVisible(inside));
 }catch{return true;}
}
/** Charts a symbol choice changes: the active chart plus same-group charts while symbol sync is on. */
export function linkedSymbolTargets(grid:Pick<MultiChartState,'layout'>|undefined):number{
 if(!grid)return 1;const active=grid.layout.cells.find(row=>row.id===grid.layout.activeCellId);if(!active)return 1;
 return grid.layout.cells.filter(row=>row.id===active.id||grid.layout.sync.symbol&&row.group===active.group).length;
}
/** Revision lease for a search session. Results or rendered rows from an older query, filter or
 * candidate set cannot be chosen; an async provider must check `isCurrent` before delivering. */
export function createSymbolSearchSession(){
 let revision=0,closed=false,busy=false;
 return{
  begin(){if(closed)throw Error('This symbol search is closed.');return ++revision;},
  get revision(){return revision;},get closed(){return closed;},get busy(){return busy;},
  isCurrent(ticket:number){return !closed&&ticket===revision;},
  /** Run one selection exactly once for the current ticket and live candidate. */
  choose(ticket:number,row:SymbolSearchCandidate,live:readonly SymbolSearchCandidate[],query:string,accept:()=>boolean|void):boolean{
   if(closed||busy)return false;
   if(ticket!==revision)throw Error('These results belong to an earlier search. Review the current results.');
   const current=row.sourceKind==='generated'?syntheticGenerationCandidate(query,live):live.find(item=>item.key===row.key);
   if(!current||current.key!==row.key||current.stamp!==row.stamp)throw Error('This result is out of date. Review the current results.');
   if(!current.openable)throw Error(current.unavailableReason??'This source cannot be opened.');
   busy=true;try{if(accept()===false)throw Error('The chart did not change. Review the workspace message; your search is kept open.');closed=true;return true;}finally{busy=false;}
  },
  close(){if(closed)return false;closed=true;return true;},
 };
}
export type SymbolSearchSession=ReturnType<typeof createSymbolSearchSession>;
export function formatBarDate(seconds:number|null):string{if(seconds===null||!Number.isFinite(seconds)||Math.abs(seconds)>8640000000000)return 'Unknown';return new Date(seconds*1000).toISOString().slice(0,10);}
/** Recent symbols, a per-computer convenience kept in local storage (never part of the workspace record).
 * Newest first, unique, at most RECENT_SYMBOLS_LIMIT. Unreadable or blocked storage reads as empty and never throws. */
export const RECENT_SYMBOLS_KEY='lv.symbolSearch.recent',RECENT_SYMBOLS_LIMIT=10;
export interface RecentSymbolStorage {getItem(key:string):string|null;setItem(key:string,value:string):void}
export function readRecentSymbols(storage:RecentSymbolStorage|null|undefined):string[]{
 try{const raw=storage?.getItem(RECENT_SYMBOLS_KEY);if(!raw)return[];const value:unknown=JSON.parse(raw);if(!Array.isArray(value))return[];
  return [...new Set(value.filter((item):item is string=>typeof item==='string'&&(SYMBOL_TEXT.test(item)||isCanonicalSymbolMath(item))))].slice(0,RECENT_SYMBOLS_LIMIT);}catch{return[];}
}
/** A switch records the symbol it leaves too (GME then TSLA reads TSLA, GME), so the starting symbol,
 * which was never chosen in search, is listed. Call before the switch; the switch itself records the new symbol. */
export function rememberDepartedSymbol(storage:RecentSymbolStorage|null|undefined,from:string|null|undefined,to:string):string[]{
 const clean=String(from??'').trim().toUpperCase();if(!clean||clean===String(to??'').trim().toUpperCase())return readRecentSymbols(storage);
 // It moves to the front (it is the most recently viewed); the switch then puts the new symbol above it.
 return rememberRecentSymbol(storage,clean);
}
export function rememberRecentSymbol(storage:RecentSymbolStorage|null|undefined,symbol:string):string[]{
 const clean=String(symbol??'').trim().toUpperCase();if(!SYMBOL_TEXT.test(clean)&&!isCanonicalSymbolMath(clean))return readRecentSymbols(storage);// Derived symbols are remembered by their canonical text
 const next=[clean,...readRecentSymbols(storage).filter(item=>item!==clean)].slice(0,RECENT_SYMBOLS_LIMIT);
 try{storage?.setItem(RECENT_SYMBOLS_KEY,JSON.stringify(next));}catch{/* blocked storage: recents are a convenience only */}
 return next;
}
/** One row per recent symbol, in recent order: the best openable supplied source for it (search order), unknown symbols skipped. */
/** A recent derived symbol with no row yet gets its Derived row at `resolution` (the current chart interval). */
export function recentSymbolRows(candidates:readonly SymbolSearchCandidate[],recent:readonly string[],resolution?:string):SymbolSearchCandidate[]{
 const ranked=[...candidates].sort((a,b)=>sourceOrder(a)-sourceOrder(b));
 return recent.flatMap(symbol=>{const row=ranked.find(item=>item.symbol===symbol&&item.openable&&item.sourceKind!=='derived')??ranked.find(item=>item.symbol===symbol&&item.openable)??ranked.find(item=>item.symbol===symbol);if(!row&&resolution&&isCanonicalSymbolMath(symbol))return symbolMathCandidates(symbol,resolution);return row?[row]:[];});
}
