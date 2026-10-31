import type {IndicatorId} from '../domain/indicators';
import {indicatorInputSchema,indicatorPlotIds,indicatorDefaults,indicatorActivePlotIds,LV_INDICATOR_PALETTE} from '../chart/indicator-settings';
import {defaultPlotStyle,type IndicatorInstanceView} from '../chart/indicator-port';
import type {IndicatorDefault} from './indicator-library';
import {parseIndicatorSource} from '../domain/indicator-source';
import {CATALOG_INDICATORS,catalogDefinition,catalogKeywords} from '../domain/indicator-catalog';

/** Pure helpers for the Indicators dialog. No chart mutation happens here. */
export const indicatorNames:Record<IndicatorId,string>={volume:'Volume',sma:'Simple Moving Average',ema:'Exponential Moving Average',rsi:'Relative Strength Index',macd:'MACD',bb:'Bollinger Bands',vwap:'Volume Weighted Average Price',stochastic:'Stochastic Oscillator',atr:'Average True Range',obv:'On Balance Volume',...Object.fromEntries(CATALOG_INDICATORS.map(definition=>[definition.id,definition.name]))} as Record<IndicatorId,string>;
/** Short titles used in instance labels and as searchable acronyms. LV wording, not a reference claim. */
export const indicatorAcronyms:Record<IndicatorId,string>={volume:'Vol',sma:'SMA',ema:'EMA',rsi:'RSI',macd:'MACD',bb:'BB',vwap:'VWAP',stochastic:'Stoch',atr:'ATR',obv:'OBV',...Object.fromEntries(CATALOG_INDICATORS.map(definition=>[definition.id,definition.acronym]))} as Record<IndicatorId,string>;

export type CatalogTab='All'|'Favorites';
export interface CatalogView {rows:IndicatorId[];empty:''|'favorites-empty'|'no-match'}
/** Rows sort alphabetically by name, ignoring case. */
const byName=(a:IndicatorId,b:IndicatorId)=>(indicatorNames[a]??a).localeCompare(indicatorNames[b]??b,'en',{sensitivity:'base'})||a.localeCompare(b);
/** 0 exact, 1 prefix, 2 word start, 3 substring; the weakest term decides (the whole phrase can lift a multi-word query). */
function matchRank(kind:IndicatorId,terms:readonly string[]):number{
 const fields=[indicatorNames[kind],indicatorAcronyms[kind],kind,catalogKeywords(kind)].map(value=>value.toLocaleLowerCase('en-US'));
 const rankOf=(text:string):number=>{
  if(fields.slice(0,2).includes(text))return 0;
  if(fields.slice(0,2).some(field=>field.startsWith(text)))return 1;
  if(fields.some(field=>field.split(/[^a-z0-9]+/).some(word=>word.startsWith(text))))return 2;
  return 3;
 };
 return terms.length>1?Math.min(Math.max(...terms.map(rankOf)),rankOf(terms.join(' '))):rankOf(terms[0]);
}
/** Whitespace-separated terms must all match the full name, acronym, kind or catalog keywords, case-insensitively. */
export function filterIndicatorCatalog(catalog:readonly IndicatorId[],tab:string,favorites:readonly IndicatorId[],query:string):CatalogView{
 const inTab=catalog.filter(kind=>tab!=='Favorites'||favorites.includes(kind)).sort(byName);
 if(tab==='Favorites'&&!inTab.length)return {rows:[],empty:'favorites-empty'};
 const terms=query.toLocaleLowerCase('en-US').split(/\s+/).filter(Boolean);
 const matching=inTab.filter(kind=>{const haystack=(indicatorNames[kind]+' '+indicatorAcronyms[kind]+' '+kind+' '+catalogKeywords(kind)).toLocaleLowerCase('en-US');return terms.every(term=>haystack.includes(term));});
 // Ranking: exact name/short name, then prefix, then word start, then substring; ties keep the alphabetical order.
 const rows=terms.length?matching.map((kind,index)=>({kind,index,rank:matchRank(kind,terms)})).sort((a,b)=>a.rank-b.rank||a.index-b.index).map(row=>row.kind):matching;
 return {rows,empty:rows.length?'':'no-match'};
}

const summaryValue=(value:unknown)=>typeof value==='number'?(Number.isFinite(value)?String(value):'?'):typeof value==='string'?value:'';
/** Compact label such as "SMA 9 close". Duplicate labels get an ordinal suffix in chart order. */
export function indicatorInstanceLabels(instances:readonly Pick<IndicatorInstanceView,'id'|'kind'|'inputs'>[]):Map<string,string>{
 const base=instances.map(row=>{
  const parts=indicatorInputSchema(row.kind).filter(field=>field.type!=='bool'&&!/^(smoothing|band|kernelVersion|timezone|divergence)/.test(field.key)).slice(0,3).map(field=>{const value=Object.hasOwn(row.inputs,field.key)?row.inputs[field.key]:field.defval,ref=field.key==='source'?parseIndicatorSource(value):null;if(!ref)return summaryValue(value);const target=instances.find(item=>item.id===ref.instance);return target?indicatorAcronyms[target.kind]+':'+ref.plot:'missing source';}).filter(Boolean);
  return [indicatorAcronyms[row.kind],...parts].join(' ');
 });
 const totals=new Map<string,number>(),seen=new Map<string,number>(),labels=new Map<string,string>();
 for(const label of base)totals.set(label,(totals.get(label)??0)+1);
 instances.forEach((row,index)=>{const label=base[index],count=(seen.get(label)??0)+1;seen.set(label,count);labels.set(row.id,totals.get(label)!>1?label+' #'+count:label);});
 return labels;
}

export type IndicatorDataState='hidden'|'unavailable'|'waiting'|'short-history'|'calculated'|'partial';
const finiteNumber=(value:unknown,fallback:number)=>typeof value==='number'&&Number.isFinite(value)&&value>=1?Math.floor(value):fallback;
/** Bars before an average of this type emits its first value, per src/domain/indicators.ts: EMA seeds on the first finite value; SMA, RMA, WMA and VWMA need a full window. */
// Every average lags a full window: SMA, WMA, VWMA and RMA by construction, and every EMA (the EMA and MACD indicators
// and each EMA choice of an MA type input) because all EMAs take the SMA seed (src/domain/indicators.ts emaStepper).
const averageLag=(_type:unknown,period:number)=>period-1;
const seededLag=averageLag;
/**
 * Bars needed before every active plot of this instance can have a value, derived from the
 * engine definitions in src/domain/indicators.ts (calculateIndicator), not from the reference.
 * Zero/missing volume or flat prices can still leave values empty; that is data, not warm-up.
 */
export function indicatorWarmupBars(kind:IndicatorId,inputs:Record<string,unknown>):number{
 const definition=catalogDefinition(kind);
 // Retired catalog inputs (e.g. AO Fast/Slow) keep their recorded defaults when absent.
 const value=(key:string)=>finiteNumber(Object.hasOwn(inputs,key)?inputs[key]:indicatorDefaults[kind][key]??definition?.retiredInputs?.find(row=>row.key===key)?.defval,1);if(definition)return definition.warmup(key=>value(key));
 let last=0;// zero-based index of the first bar where every base plot can be finite
 switch(kind){
  case 'sma':last=value('length')-1;break;
  case 'ema':last=value('length')-1;break;// SMA seed
  case 'rsi':last=value('length');break;// gains start at bar 1, then a Wilder seed over length values
  case 'macd':{const type=inputs.oscillatorType??'EMA',line=Math.max(seededLag(type,value('fast')),seededLag(type,value('slow')));last=line+seededLag(inputs.signalType??'EMA',value('signal'));break;}
  case 'bb':last=value('length')-1;break;// the standard deviation always needs a full window
  case 'stochastic':last=value('length')-1+value('smoothK')-1+value('smoothD')-1;break;
  case 'atr':last=averageLag(inputs.smoothing??'RMA',value('length'));break;
  case 'volume':last=averageLag(inputs.maType??'SMA',value('length'));break;
  case 'vwap':case 'obv':last=0;break;
 }
 const smoothing=inputs.smoothingType;
 if(typeof smoothing==='string'&&smoothing!=='None'&&Object.hasOwn(indicatorDefaults[kind],'smoothingType'))last+=value('smoothingLength')-1;// every smoothing type, the SMA-seeded EMA included, needs a full window
 return last+1;
}
/**
 * Honest per-instance data state. Hidden built-ins are not calculated by the renderer, so their last
 * calculation metadata is never reported as current. chartBars is the chart's calculation bar count
 * when known (null/undefined = unknown). Never reports a missing value as zero.
 */
/** Bar counts with thousands separators (3,900), as plain text. */
const barCount=(value:number)=>Number.isFinite(value)?Math.trunc(value).toLocaleString('en-US'):String(value);
export function indicatorDataStatus(row:Pick<IndicatorInstanceView,'diagnostics'|'informationBars'|'inputs'|'visible'|'series'>&{kind?:IndicatorId},chartBars?:number|null):{state:IndicatorDataState;text:string}{
 const known=typeof chartBars==='number'&&Number.isSafeInteger(chartBars)&&chartBars>=0;
 if(!row.visible)return {state:'hidden',text:'Hidden: not calculated while hidden.'+(known?chartBars?' The chart has '+chartBars+' bars; show the indicator to calculate it.':' The chart has no bars loaded.':'')};
 if(row.diagnostics.length&&!row.series.length)return {state:'unavailable',text:'Unavailable: '+row.diagnostics.join(' ')};
 if(!row.informationBars)return {state:'waiting',text:known&&chartBars?'Waiting for a calculation. The chart has '+chartBars+' bars, but this indicator has not reported a result yet.':known?'No bars are loaded on this chart. Load or import data for this chart.':'No bars supplied to this indicator yet. Load or import data for this chart.'};
 const needed=row.kind?indicatorWarmupBars(row.kind,row.inputs):Math.max(0,...['length','slow','fast','signal'].map(key=>row.inputs[key]).filter((value):value is number=>typeof value==='number'&&Number.isFinite(value)));
 if(needed>row.informationBars)return {state:'short-history',text:row.kind?'Needs '+barCount(needed)+' bars for every line to have a value; '+barCount(row.informationBars)+' loaded, so some values stay empty.':'Length '+barCount(needed)+' is longer than the '+barCount(row.informationBars)+' loaded bars, so some values stay empty.'};
 if(row.diagnostics.length)return {state:'partial',text:'Calculated from '+barCount(row.informationBars)+' bars with warnings: '+row.diagnostics.join(' ')};
 return {state:'calculated',text:'Calculated from '+barCount(row.informationBars)+' bars'+(row.series.length?'':', nothing to plot')+'.'};
}

/** Draft equivalent of the live instance, used for reload and unapplied-change detection. */
export function indicatorRowDraft(row:IndicatorInstanceView):IndicatorDefault{return {inputs:structuredClone(row.inputs),offset:row.offset,visible:row.visible,plots:Object.fromEntries(indicatorPlotIds[row.kind].map((id,i)=>[id,structuredClone(row.plots[id]??defaultPlotStyle(row.kind,id,i))])),...(row.presentation!==undefined?{presentation:structuredClone(row.presentation)}:{})};}
const stable=(value:unknown):unknown=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable((value as Record<string,unknown>)[key])])):Number.isNaN(value)?'NaN':value;
/** Inputs that only make an omitted legacy default explicit (VWAP bands, smoothing) are not counted as changes. */
export function indicatorDraftDirty(draft:IndicatorDefault,row:IndicatorInstanceView):boolean{
 const live=indicatorRowDraft(row),defaults=indicatorDefaults[row.kind],inputs={...draft.inputs};
 for(const key of Object.keys(inputs))if(!Object.hasOwn(live.inputs,key)&&Object.hasOwn(defaults,key)&&inputs[key]===defaults[key])delete inputs[key];
 return JSON.stringify(stable({...draft,inputs}))!==JSON.stringify(stable(live));
}

export type IndicatorMoveTarget='price'|{newPane:true}|{pane:string};
export interface PaneChoice {key:string;label:string;target:IndicatorMoveTarget;disabled:boolean;reason:string}
/** Pane destinations derived only from this chart's current built-in instances. Price pane ID is "price". */
/** nativeCount reports how many series (built-ins, scripts, comparisons) the renderer pane holds; undefined means unknown. */
export function indicatorPaneChoices(row:Pick<IndicatorInstanceView,'id'|'paneId'>,instances:readonly Pick<IndicatorInstanceView,'id'|'paneId'>[],labels:ReadonlyMap<string,string>,nativeCount:(paneId:string)=>number|undefined=()=>undefined):{current:string;choices:PaneChoice[]}{
 const pane=row.paneId,unknown=pane===null;
 const members=(id:string|null)=>instances.filter(item=>item.paneId===id);
 const builtIns=unknown?0:members(pane).length,native=unknown||pane==='price'?undefined:nativeCount(pane as string),extra=native!==undefined&&native>builtIns?native-builtIns:0;
 // Only a renderer-confirmed single-series pane disables the new-pane move; unknown membership never blocks it.
 const alone=!unknown&&pane!=='price'&&native===1&&builtIns<=1;
 const shared=members(pane).filter(item=>item.id!==row.id).map(item=>labels.get(item.id)??item.id);
 if(extra)shared.push(extra+' other series (script or comparison)');
 const current=unknown?'Pane unavailable. Placement is disabled until the chart reports this indicator.':pane==='price'?'Price pane':'Separate pane'+(shared.length?' shared with '+shared.join(', '):native===undefined?' (other series in this pane are not reported)':'');
 const unavailable='The current pane is unknown.';
 const choices:PaneChoice[]=[
  {key:'price',label:'Move to price pane',target:'price',disabled:unknown||pane==='price',reason:unknown?unavailable:pane==='price'?'Already in the price pane.':''},
  {key:'new',label:'Move to new pane',target:{newPane:true},disabled:unknown||alone,reason:unknown?unavailable:alone?'Already alone in its own pane.':''},
 ];
 const others=[...new Set(instances.filter(item=>item.id!==row.id&&item.paneId!==null&&item.paneId!=='price'&&item.paneId!==pane).map(item=>item.paneId as string))];
 for(const id of others)choices.push({key:'pane:'+id,label:'Move to pane with '+members(id).map(item=>labels.get(item.id)??item.id).join(', '),target:{pane:id},disabled:unknown,reason:unknown?unavailable:''});
 return {current,choices};
}
/** A field validation message names the label the field shows, not its internal input key
 * ("Invalid numeric input: multiplier" -> "Standard deviations"). A key the schema or the kind's retired inputs name uses that
 * title; any other key becomes readable words, never the raw key. */
const FIELD_MESSAGE=/(Invalid numeric input|Invalid input type|Unsupported input option|Oversized input|Unsupported indicator input): ([A-Za-z_][A-Za-z0-9_]*)/g;
/** Readable words for a key with no title ("someKey_name" -> "Some key name"); never the raw key. */
const readableKey=(key:string)=>{const words=key.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/_+/g,' ').trim().toLowerCase();return words.charAt(0).toUpperCase()+words.slice(1);};
/** `kind` lets a retired input (kept from older saved state) use its own catalog title. Every occurrence is rewritten. */
export function indicatorFieldMessage(message:string,fields:readonly {key:string;title?:string}[],kind?:string):string{
 const retired=kind?catalogDefinition(kind)?.retiredInputs:undefined;
 return message.replace(FIELD_MESSAGE,(_whole,prefix:string,key:string)=>prefix+': '+(fields.find(field=>field.key===key)?.title||retired?.find(field=>field.key===key)?.title||readableKey(key)));
}

/** The catalog's short title column ("Stoch RSI"), not the upper-cased id. */
export const catalogAcronym=(kind:IndicatorId):string=>indicatorAcronyms[kind]??kind.toUpperCase();
/** The highlighted catalog row after an arrow, Home or End key. No wrapping; a stale highlight starts over. */
export function stepCatalogActive(rows:readonly IndicatorId[],active:IndicatorId|null,key:string):IndicatorId|null{
 if(!rows.length)return null;
 const at=active===null?-1:rows.indexOf(active);
 if(key==='Home')return rows[0];
 if(key==='End')return rows[rows.length-1];
 if(key==='ArrowDown')return rows[at<0?0:Math.min(rows.length-1,at+1)];
 if(key==='ArrowUp')return rows[at<0?rows.length-1:Math.max(0,at-1)];
 return active!==null&&at>=0?active:null;
}

/** Picker: one step of the highlighted row over any keyed list (selector entries use "kind:id" keys). Same rules as stepCatalogActive. */
export function stepListActive(rows:readonly string[],active:string|null,key:string):string|null{return stepCatalogActive(rows as readonly IndicatorId[],active as IndicatorId|null,key);}
/** Picker: the parts of a label that match the search terms, for highlighting. Case-insensitive; overlapping matches merge. */
export function highlightSegments(label:string,query:string):{text:string;match:boolean}[]{
 const terms=query.toLocaleLowerCase('en-US').split(/\s+/).filter(Boolean),lower=label.toLocaleLowerCase('en-US'),marks=new Array<boolean>(label.length).fill(false);
 if(lower.length!==label.length)return [{text:label,match:false}];// a case mapping that changes length cannot be mapped back safely
 for(const term of terms)for(let at=lower.indexOf(term);at>=0;at=lower.indexOf(term,at+1))marks.fill(true,at,at+term.length);
 const out:{text:string;match:boolean}[]=[];
 for(let i=0;i<label.length;i++){const last=out[out.length-1];if(last&&last.match===marks[i])last.text+=label[i];else out.push({text:label[i],match:marks[i]});}
 return out.length?out:[{text:label,match:false}];
}
/** Picker: lists longer than this render only the rows near the viewport. */
export const PICKER_WINDOW_THRESHOLD=200;
export const PICKER_ROW_HEIGHT=32;
/** Picker: the rendered slice of a long list, with the space above and below it. A short list renders whole. */
export function pickerWindow(count:number,scrollTop:number,viewport:number,rowHeight=PICKER_ROW_HEIGHT,overscan=8):{start:number;end:number;before:number;after:number;windowed:boolean}{
 if(count<=PICKER_WINDOW_THRESHOLD)return {start:0,end:count,before:0,after:0,windowed:false};
 const top=Math.max(0,Number.isFinite(scrollTop)?scrollTop:0),height=Math.max(rowHeight,Number.isFinite(viewport)?viewport:0);
 const start=Math.min(count,Math.max(0,Math.floor(top/rowHeight)-overscan)),end=Math.min(count,Math.ceil((top+height)/rowHeight)+overscan);
 return {start,end:Math.max(start,end),before:start*rowHeight,after:(count-Math.max(start,end))*rowHeight,windowed:true};
}
/** Picker: the scrollTop that brings row index fully into view (unchanged when it already is). */
export function scrollToRow(index:number,scrollTop:number,viewport:number,rowHeight=PICKER_ROW_HEIGHT):number{
 const top=index*rowHeight,bottom=top+rowHeight;
 if(top<scrollTop)return top;
 if(bottom>scrollTop+viewport)return Math.max(0,bottom-viewport);
 return scrollTop;
}

/** An indicator added on another indicator (SMA on RSI) whose first line would get the same color as the
 * line it reads (both take the first LV palette color) gets the next palette color that differs, so the two lines are told apart.
 * Saved plot colors are kept; only the factory default is changed, on this new instance. */
export function distinctAddOnPlots(kind:IndicatorId,saved:IndicatorDefault,parent:{kind:IndicatorId;plots?:Readonly<Record<string,{color?:string}|undefined>>},parentPlot:string):IndicatorDefault{
 try{
  const plot=indicatorActivePlotIds(kind,saved.inputs)[0];if(!plot)return saved;
  const parentColor=(parent.plots?.[parentPlot]?.color??defaultPlotStyle(parent.kind,parentPlot,Math.max(0,indicatorPlotIds[parent.kind].indexOf(parentPlot))).color).toLowerCase();
  const own=defaultPlotStyle(kind,plot,Math.max(0,indicatorPlotIds[kind].indexOf(plot)));
  const current=saved.plots?.[plot],shown=(current?.color??own.color).toLowerCase();
  // A color the user saved as the default (not the factory one) is kept even when it matches.
  if(shown!==parentColor||current&&current.color.toLowerCase()!==own.color.toLowerCase())return saved;
  const color=LV_INDICATOR_PALETTE.find(value=>value.toLowerCase()!==parentColor&&value!==LV_INDICATOR_PALETTE[0])??LV_INDICATOR_PALETTE[1];
  return {...saved,plots:{...(saved.plots??{}),[plot]:{...(current??own),color}}};
 }catch{return saved;}
}
