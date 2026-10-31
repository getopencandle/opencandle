import React from 'react';
import {createPortal} from 'react-dom';
import {DEFAULT_STRATEGY_CONFIG,MAX_ORDER_DELAY_BARS,validateStrategyConfig,strategyOrderLabel,type StrategyConfig} from '../domain/strategy';
import type {Bar} from '../domain/types';
import {parseUtcDayInput,sameStrategyDateRange,strategyDateRangeLabel,strategyRangeSlice,STRATEGY_RANGE_DAYS,utcDayInput,type StrategyDateRange,type StrategyRangeDays} from '../domain/strategy-date-range';
import type {ReportAnalysis,ReportBucket,ReportTrade,StrategyReportSide} from '../domain/strategy-report';
import {STRATEGY_REPORT_METRICS} from '../domain/strategy-report-catalog';
import {marginUsageHover,REPORT_PERIOD_KINDS,REPORT_PERIOD_ROW_LIMIT,type ReportPeriodKind,type ReportPeriods,type ReportRpstAnalysis} from '../domain/strategy-report-periods';
import {bestEntryPeriod,DEFAULT_REPORT_COLUMNS,REPORT_TRADE_COLUMNS,tradeColumnValue,type ReportTradeColumn} from '../domain/strategy-report-view';
import {useStrategyReport,copyStrategyConfig as copyConfig,workbookExport,STRATEGY_TESTER_CAPABILITIES} from '../strategy-report/use-report';
import {PerformanceSummary,ReportProperties} from '../strategy-report/PerformanceSummary';
import type {ScriptRequestBase} from './script-requests';
import {ReportChart} from '../strategy-report/ReportChart';
import type {StrategyChoice} from '../strategy-report/strategy-chooser';
import {SavedReportPanel} from '../strategy-report/SavedReport';
import type {ScriptEngineRerun} from '../strategy-report/feedback';
import type {ScriptResult} from './ScriptPanel';
import {Modal} from './Modal';
import {StrategyMarkSettingsPanel} from '../chart/strategy-marks-view';

/** `magnifierBase` names the chart for Bar Magnifier data; `forming` is the still-forming live bar (and its proposals), kept aside for Recalculate on every tick. */
export interface StrategyExecution {result:ScriptResult;bars:Bar[];barIds:string[];identity:string;source:string;chartType:StrategyConfig['chartType'];standardBars?:Bar[];currency?:string|null;timezone?:string;magnifierBase?:ScriptRequestBase|null;forming?:{bar:Bar;barId:string;standardBar?:Bar;orders:Record<string,unknown>[]}|null;
 /** Reruns the script with the engine feed (present when its source reads ctx.strategy or defines onFill), and the onFill proposals of a settled run. */
 rerun?:ScriptEngineRerun|null;fillProposals?:Record<string,unknown>[]}
export interface StrategyDialogProps {execution:StrategyExecution|null;config:StrategyConfig;onChange:(config:StrategyConfig)=>boolean|void;onClose:()=>void;assertOwner?:()=>void;ownerToken?:object;
 /** 'docked' renders the Strategy tester as a bottom panel tab (into dockHost when given); absent or 'floating' keeps the dialog. */
 placement?:'docked'|'floating';onPlacement?:(next:'docked'|'floating')=>void;dockHost?:HTMLElement|null;
 /** A List of trades row was chosen; the host scrolls the chart to the trade's entry bar. */
 onTradeSelect?:(trade:ReportTrade)=>void;
 /** The empty tester's "Open Script editor" action. */
 onOpenScriptEditor?:()=>void;
 /** The chart's strategies; with two or more the report shows a chooser. */
 strategies?:readonly StrategyChoice[];selectedStrategy?:string|null;onSelectStrategy?:(id:string)=>void}
/** The docked tester fills its bottom panel tab; its report scrolls inside the tab (our own layout). */
export const STRATEGY_DOCK_CSS='.lv-strategy-dock{display:flex;flex-direction:column;height:100%;min-height:0}.lv-strategy-dock>.tab-row{padding:4px 8px}.lv-strategy-dock>.modal-scroll{flex:1 1 auto;max-height:none;padding:8px 12px}.lv-strategy-dock>footer{display:flex;align-items:center;gap:8px;border-top:1px solid var(--lv-border);padding:4px 8px}.lv-strategy-dock>footer>span{flex:1}.lv-strategy-dock .lv-strategy-placement{margin-left:auto}';
/** The empty report text. "Add a strategy" only when the chart has none; with strategies on the chart it names the one
 * the report follows (or the only one) and says its results have not arrived. Wording. */
export function strategyEmptyText(strategies:readonly StrategyChoice[]|undefined,selected:string|null|undefined):string{
 if(!strategies?.length)return 'Add a strategy to see results';
 const chosen=strategies.find(row=>row.id===selected)??(strategies.length===1?strategies[0]:null);
 return (chosen?'No results for '+chosen.name+' yet.':'No strategy results yet.')+' It is still calculating or could not run on this chart. The chart shows its script status.';
}
/** A value that rounds to zero prints "0", never "-0". */
const format=(value:number|null,digits=6)=>value===null?'Unavailable':value.toLocaleString(undefined,{maximumFractionDigits:digits}).replace(/^-(?=[0.,\s]*$)/,'');
/** Metric cell text. Durations are stored in seconds and shown as calendar days; under one day shows "<1 day". */
export function strategyMetricText(value:number|null,unit:string,status:string){if(value===null)return 'Unavailable ('+status+')';if(unit==='seconds')return value<86400?'<1 day':format(value/86400,2)+' calendar days';return format(value)+' '+unit;}
function barTime(time:number,timezone:string){return new Intl.DateTimeFormat(undefined,{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'shortOffset'}).format(time*1000);}
const groups=[...new Set(STRATEGY_REPORT_METRICS.map(metric=>metric.group))];
/** Engine commission kinds, labelled with the cost model each one actually applies. */
export const COMMISSION_LABELS:Record<StrategyConfig['commission']['kind'],string>={percent:'Percent of order value (%)','per-unit':'Cash per unit (contract/share)',fixed:'Cash per order'};
type NumberKey='initialCapital'|'slippageTicks'|'tickSize'|'lotSize'|'marginLongPercent'|'marginShortPercent'|'pyramiding'|'limitVerifyTicks';
const PROPERTY_SECTIONS:readonly (readonly [string,readonly (readonly [NumberKey,string,string,number|undefined])[]])[]=[
 ['Capital',[['initialCapital','Initial virtual capital','Starting virtual equity. Report percentages use it as their denominator.',0],['pyramiding','Pyramiding','Maximum open entries in one direction. 0 and 1 both allow a single entry.',0]]],
 ['Costs and price grid',[['slippageTicks','Adverse slippage (ticks)','Added against market and stop-market fills only. Limit fills never slip.',0],['tickSize','Tick size','Size of one slippage tick, and the price grid for limit/stop prices (not used by market-only CandleScript proposals).',0],['lotSize','Lot size','Every order quantity must be a whole multiple of this size.',0]]],
 ['Execution',[['limitVerifyTicks','Limit verification (ticks)','Price must trade this many ticks through a limit before it fills at the limit price. It applies to limit orders from ctx.order options and to exit take-profit legs.',0]]],
 ['Margin',[['marginLongPercent','Long margin (%)','Entries are rejected when equity is below this share of position value. When available funds fall below it, a margin call liquidates four times the units needed to cover the shortfall.',0],['marginShortPercent','Short margin (%)','As long margin, for short positions.',0]]],
];
/** Recalculation and fill-route settings the Strategy tester now supplies. */
export const RECALCULATION_SETTINGS=[
 ['calcOnOrderFills','Recalculate after order is filled','After each fill the script\'s onFill(ctx, fill) runs on the bar so far, and its orders can fill later on that bar. Its state changes there are discarded, as the bar rolls back. A script without onFill adds nothing at a fill.'],
 ['calcOnEveryTick','Recalculate on every tick','Historical bars calculate once, at their close. On a live chart the still-forming bar joins the report at each update and repaints until it closes. Off, the forming bar is left out.'],
 ['barMagnifier','Bar Magnifier','Intrabar fills follow lower-timeframe bars from loaded data (for example 5 minute bars on a 1 hour chart). Bars without matching lower-timeframe bars keep the OHLC route; the report says how many.'],
] as const;
/** Default order size used when an entry proposal omits units. */
export const ORDER_SIZE_LABELS={none:'Each proposal supplies its units',contracts:'Contracts (units)',cash:'Cash',
 'percent-of-equity':'% of equity'} as const;
export type OrderSizeChoice=keyof typeof ORDER_SIZE_LABELS;
export function orderSizeHelp(choice:OrderSizeChoice){return choice==='none'?'No default size: a proposal without units is rejected with a reason.':choice==='contracts'?'Fixed units for entries without units; must be a multiple of the lot size.':choice==='cash'?'Units = this cash amount / fill price, rounded down to the lot size. Below one lot the order is rejected.':'Units = this percent of current strategy equity / fill price, rounded down to the lot size (at most 100%).';}
const OVERVIEW=[['Net closed PnL','closedNet',2],['Marked total PnL','totalProfit',2],['Total closed trades','closedTrades',0],['Profitable (%)','profitablePercent',2],['Profit factor','profitFactor',3],['Maximum close drawdown','maxDrawdown',2],['Average PnL','averagePnl',2],['Average bars in trades','averageBars',2]] as const;
/** Field-by-field comparison, so key order in a loaded draft never reports a false change. */
export function sameStrategyConfig(a:StrategyConfig,b:StrategyConfig){return (Object.keys(DEFAULT_STRATEGY_CONFIG) as (keyof StrategyConfig)[]).every(key=>key==='commission'?a.commission.kind===b.commission.kind&&Object.is(a.commission.value,b.commission.value):Object.is(a[key],b[key]))&&a.defaultQuantity?.kind===b.defaultQuantity?.kind&&Object.is(a.defaultQuantity?.value,b.defaultQuantity?.value)&&a.accountCurrency===b.accountCurrency&&(a.orderDelayBars??0)===(b.orderDelayBars??0)&&sameStrategyDateRange(a.dateRange,b.dateRange);}
/** Default removes the key, so configs without an account currency stay exactly as before. */
export function withAccountCurrency(config:StrategyConfig,choice:'default'|'USD'):StrategyConfig{const {accountCurrency:_old,...rest}=config;return choice==='USD'?{...rest,accountCurrency:'USD'}:rest;}
/** The tester date range; Entire history removes the key, so configs without a range stay exactly as before. */
export function withDateRange(config:StrategyConfig,range:StrategyDateRange|undefined):StrategyConfig{const {dateRange:_old,...rest}=config;return range?{...rest,dateRange:range}:rest;}
export type DateRangeChoice='all'|'last-7'|'last-30'|'last-90'|'last-365'|'custom';
export const dateRangeChoice=(range:StrategyDateRange|undefined):DateRangeChoice=>!range?'all':range.kind==='custom'?'custom':(`last-${range.days}` as DateRangeChoice);
export function dateRangeFor(choice:DateRangeChoice,previous:StrategyDateRange|undefined):StrategyDateRange|undefined{if(choice==='all')return undefined;if(choice==='custom')return previous?.kind==='custom'?previous:{kind:'custom',from:null,to:null};return {kind:'last',days:Number(choice.slice(5)) as StrategyRangeDays};}
/** 0 Removes the key, so configs without a delay stay exactly as before. A blank field keeps NaN so validation names it. */
export function withOrderDelay(config:StrategyConfig,bars:number):StrategyConfig{const {orderDelayBars:_old,...rest}=config;return bars===0?rest:{...rest,orderDelayBars:bars};}
/** Draft config with the chosen default order size; 'none' removes the key so legacy runs keep their exact config. */
export function withOrderSize(config:StrategyConfig,choice:OrderSizeChoice,value:number):StrategyConfig{const {defaultQuantity:_old,...rest}=config;return choice==='none'?rest:{...rest,defaultQuantity:{kind:choice,value}};}
/** Readable run provenance. Script runs append a serialized source identity to the label ("Example data · [...]");
 * show its source name, interval and chart basis instead of the raw JSON and internal ids. */
export function strategyProvenanceText(label:string):string{
 const at=label.indexOf(' · ');if(at<0)return label==='Synthetic demo history'?'Example data':label;
 // The built-in generated data reads "Example data"; older runs said "Synthetic demo history".
 const kind=label.slice(0,at)==='Synthetic demo history'?'Example data':label.slice(0,at),rest=label.slice(at+3).trim();if(!rest.startsWith('[')&&!rest.startsWith('{'))return label;
 let parts:unknown;try{parts=JSON.parse(rest);}catch{return kind;}
 if(!Array.isArray(parts))return kind;
 const [,,resolution,,,source,style,run]=parts,text=[kind];
 if(typeof source==='string'&&source.trim()&&!/synthetic (demo )?(data|fixture)/i.test(source))text.push(source.trim());
 if(typeof resolution==='string'&&resolution.trim())text.push(resolution.trim());
 if(style==='heikinashi')text.push('Heikin Ashi chart');
 if(typeof run==='string'&&run!=='ordinary')text.push('Replay run');
 return text.join(' · ');
}
const WEEKDAY_NAMES=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],MONTH_NAMES=['January','February','March','April','May','June','July','August','September','October','November','December'];

/** A typeable UTC day field. The raw text is kept locally while the user types (a partial year such as 0002 is a
 * "valid" date to the browser but not a usable day), and only a usable day or an empty field is committed. Blur shows the committed day again. */
export function DayInput({label,value,onCommit}:{label:string;value:number|null;onCommit:(value:number|null)=>void}){
 const committed=utcDayInput(value),[raw,setRaw]=React.useState(committed);
 React.useEffect(()=>{setRaw(previous=>parseUtcDayInput(previous)===value||(previous===''&&value===null)?previous:committed);},[value,committed]);
 return <input type="date" aria-label={label} value={raw} onChange={event=>{const text=event.target.value;setRaw(text);if(text===''){if(value!==null)onCommit(null);return;}const parsed=parseUtcDayInput(text);if(parsed!==null&&parsed!==value)onCommit(parsed);}} onBlur={()=>setRaw(committed)}/>;
}

export function StrategyDialog(props:StrategyDialogProps){
 const {execution}=props,docked=props.placement==='docked';
 const {tab,setTab,draft,setDraft,error,setError,status,side,setSide,columns,setColumns,columnPanel,setColumnPanel,query,setQuery,sort,setSort,descending,setDescending,page,setPage,openPage,setOpenPage,reportState,reportEpoch,exportBusy,latest,handle,report,table,openLots,openLotPage,orders,tableBusy,tableError,switchTab,close,apply,cancelEdits,loadDraft,exportReport,toggleColumn,assertReport,cancelCalculation,recalculate,applyDateRange}=useStrategyReport(props);
 const currentExport=tab==='Trades'?'trades':tab==='Orders'?'orders':'metrics';
 // Configuration-only diagnostics; Properties never reads or executes history.
 const problems=tab==='Properties'?validateStrategyConfig({...draft,chartType:execution?.chartType??draft.chartType},STRATEGY_TESTER_CAPABILITIES):[];
 const unapplied=tab==='Properties'&&!sameStrategyConfig(draft,props.config);
 const rangeSlice=strategyRangeSlice(props.config.dateRange,execution?.bars??[]);
 const numberInput=(key:NumberKey,label:string,help:string,min:number|undefined)=><label key={key}>{label}<input type="number" step="any" min={min} value={Number.isNaN(draft[key])?'':draft[key]} onChange={event=>setDraft({...draft,[key]:event.target.value===''?NaN:Number(event.target.value)})}/><small className="help">{help}</small></label>;
 const content=<>
  <nav className="tab-row">{(['Metrics','Trades','Orders','Properties'] as const).map(name=><button key={name} className={tab===name?'active':''} onClick={()=>switchTab(name)}>{name}</button>)}{props.onPlacement&&<button type="button" className="lv-strategy-placement" onClick={()=>props.onPlacement!(docked?'floating':'docked')}>{docked?'Open floating':'Dock to bottom'}</button>}</nav>
  {props.strategies&&props.strategies.length>1&&props.onSelectStrategy&&<div className="button-row"><label title="The strategy whose results fill this report">Strategy <select aria-label="Report strategy" value={props.selectedStrategy??''} onChange={event=>props.onSelectStrategy!(event.target.value)}>{!props.strategies.some(row=>row.id===props.selectedStrategy)&&<option value="">Choose a strategy</option>}{props.strategies.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label></div>}
  {execution&&<div className="screener-toolbar"><span>{strategyProvenanceText(execution.result.provenance.label)}</span>{tab!=='Properties'&&<label title="Bars the report backtests (Properties > Date range has the custom range)">Date range <select aria-label="Report date range" value={dateRangeChoice(props.config.dateRange)} onChange={event=>{const choice=event.target.value as DateRangeChoice;if(choice==='custom'){switchTab('Properties',config=>withDateRange(config,dateRangeFor('custom',config.dateRange)));return;}applyDateRange(dateRangeFor(choice,props.config.dateRange));}}><option value="all">Entire history</option>{STRATEGY_RANGE_DAYS.map(days=><option key={days} value={'last-'+days}>Last {days} days</option>)}<option value="custom">{props.config.dateRange?.kind==='custom'?strategyDateRangeLabel(props.config.dateRange):'Custom range…'}</option></select></label>}<span>{(rangeSlice.end-rangeSlice.start).toLocaleString()} bars{rangeSlice.end-rangeSlice.start!==execution.bars.length?' of '+execution.bars.length.toLocaleString():''} · Virtual orders only</span></div>}
  <div className="modal-scroll">
   {!execution&&tab!=='Properties'&&<div className="lv-strategy-empty"><p className="empty-message">{strategyEmptyText(props.strategies,props.selectedStrategy)}</p>{props.onOpenScriptEditor&&<button type="button" className="primary" onClick={props.onOpenScriptEditor}>Open Script editor</button>}</div>}
   {tab==='Properties'?<>
    {report&&<ReportProperties summary={report} firstTime={execution?.bars[rangeSlice.start]?.time??null} lastTime={execution?.bars[rangeSlice.end-1]?.time??null} timezone={report.context.timezone}/>}
    <StrategyMarkSettingsPanel/>
    <div onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing&&(event.target as HTMLInputElement).type==='number'){event.preventDefault();apply();}}}>
    <fieldset aria-label="Backtest date range"><legend>Date range</legend><div className="strategy-settings"><label>Backtest on<select aria-label="Backtest date range" value={dateRangeChoice(draft.dateRange)} onChange={event=>setDraft(withDateRange(draft,dateRangeFor(event.target.value as DateRangeChoice,draft.dateRange)))}><option value="all">Entire history</option>{STRATEGY_RANGE_DAYS.map(days=><option key={days} value={'last-'+days}>Last {days} days</option>)}<option value="custom">Custom range</option></select><small className="help">Only bars inside the range are backtested: equity starts at the initial capital on its first bar and a position still open at its end stays open. Indicators still warm up on the full loaded history. Last N days counts back from the last loaded bar.</small></label>
     {draft.dateRange?.kind==='custom'&&<><label>From (UTC)<DayInput label="Date range start" value={draft.dateRange.from} onCommit={from=>setDraft(withDateRange(draft,{kind:'custom',from,to:(draft.dateRange as {to:number|null}).to}))}/></label><label>To (UTC, inclusive)<DayInput label="Date range end" value={draft.dateRange.to} onCommit={to=>setDraft(withDateRange(draft,{kind:'custom',from:(draft.dateRange as {from:number|null}).from,to}))}/></label></>}
    </div></fieldset>
    {PROPERTY_SECTIONS.map(([title,fields])=><fieldset key={title}><legend>{title}</legend><div className="strategy-settings">{fields.map(([key,label,help,min])=>numberInput(key,label,help,min))}
     {title==='Capital'&&<label>Account currency<select aria-label="Account currency" value={draft.accountCurrency??'default'} onChange={event=>setDraft(withAccountCurrency(draft,event.target.value==='USD'?'USD':'default'))}><option value="default">Default ({execution?.currency??'symbol currency not stated'})</option><option value="USD">USD</option></select><small className="help">The report shows its values in this currency. Default is the symbol's own currency. USD converts from it; OpenCandle loads no exchange rates, so USD works for USD symbols only. Fills always use the symbol's prices.</small></label>}
     {title==='Costs and price grid'&&<>
      <label>Virtual commission type<select value={draft.commission.kind} onChange={event=>setDraft({...draft,commission:{...draft.commission,kind:event.target.value as typeof draft.commission.kind}})}>{(['percent','per-unit','fixed'] as const).map(value=><option key={value} value={value}>{COMMISSION_LABELS[value]}</option>)}</select></label>
      <label>Virtual commission value<input type="number" min="0" step="any" value={Number.isNaN(draft.commission.value)?'':draft.commission.value} onChange={event=>setDraft({...draft,commission:{...draft.commission,value:event.target.value===''?NaN:Number(event.target.value)}})}/><small className="help">{draft.commission.kind==='percent'?'Percent of each fill value, charged on entries and exits.':draft.commission.kind==='per-unit'?'Cash per unit on each fill, entries and exits.':'Flat cash on each filled order, entries and exits.'}</small></label>
     </>}
     {title==='Execution'&&<>
      <label>Limit order fills<select aria-label="Limit order fills" value={draft.limitVerifyTicks===0?'touch':draft.limitVerifyTicks===1?'through':'custom'} onChange={event=>setDraft({...draft,limitVerifyTicks:event.target.value==='touch'?0:event.target.value==='through'?1:draft.limitVerifyTicks})}><option value="touch">At the limit price when touched</option><option value="through">Only after trading one tick through the limit</option>{draft.limitVerifyTicks!==0&&draft.limitVerifyTicks!==1&&<option value="custom">{Number.isNaN(draft.limitVerifyTicks)?'Invalid tick count':draft.limitVerifyTicks+' ticks through (set below)'}</option>}</select><small className="help">Sets Limit verification (ticks) to 0 or 1; the numeric field below accepts other counts.</small></label>
      <label>Order execution delay (bars)<input aria-label="Order execution delay (bars)" type="number" min="0" max={MAX_ORDER_DELAY_BARS} step="1" value={Number.isNaN(draft.orderDelayBars)?'':draft.orderDelayBars??0} onChange={event=>setDraft(withOrderDelay(draft,event.target.value===''?NaN:Number(event.target.value)))}/><small className="help">Orders the script proposes at a bar's close are placed this many bars later, at that bar's close, and sized and filled from there. 0 places them at once. Orders from onFill are not delayed.</small></label>
      <label><input type="checkbox" style={{width:'auto'}} checked={draft.processOrdersOnClose} onChange={event=>setDraft({...draft,processOrdersOnClose:event.target.checked})}/> Simulate order processing on the signal bar close</label>
      {execution?.chartType==='heikin-ashi'&&<label><input type="checkbox" style={{width:'auto'}} checked={draft.fillBasis==='standard-ohlc'} onChange={event=>setDraft({...draft,fillBasis:event.target.checked?'standard-ohlc':'chart-prices'})}/> Use standard OHLC fills</label>}
     </>}
     {title==='Execution'&&<>
      <fieldset role="radiogroup" aria-label="Default order size"><legend>Default order size</legend>{(Object.keys(ORDER_SIZE_LABELS) as OrderSizeChoice[]).map(choice=><label key={choice} className="strategy-radio"><input type="radio" style={{width:'auto'}} name="lv-strategy-order-size" checked={(draft.defaultQuantity?.kind??'none')===choice} onChange={()=>setDraft(withOrderSize(draft,choice,draft.defaultQuantity?.value??(choice==='percent-of-equity'?10:choice==='cash'?1000:1)))}/> {ORDER_SIZE_LABELS[choice]}</label>)}<small className="help">{orderSizeHelp(draft.defaultQuantity?.kind??'none')} Proposals that carry explicit units always use them.</small></fieldset>
      {draft.defaultQuantity&&<label>Default order size value<input aria-label="Default order size value" type="number" min="0" step="any" value={Number.isNaN(draft.defaultQuantity.value)?'':draft.defaultQuantity.value} onChange={event=>setDraft(withOrderSize(draft,draft.defaultQuantity!.kind,event.target.value===''?NaN:Number(event.target.value)))}/></label>}
     </>}
    </div></fieldset>)}
    <fieldset><legend>Recalculation and fills</legend><div className="strategy-settings">{RECALCULATION_SETTINGS.map(([key,label,help])=><label key={key}><span><input type="checkbox" style={{width:'auto'}} aria-label={label} checked={draft[key]} onChange={event=>setDraft({...draft,[key]:event.target.checked})}/> {label}</span><small className="help">{help}</small></label>)}</div></fieldset>
    </div>
    {problems.length>0&&<ul className="help" aria-live="polite">{problems.map(problem=><li key={problem}>Fix before applying: {problem}</li>)}</ul>}
    <p className="help">{unapplied?'Unapplied changes. Apply reruns the report with these properties; Enter in a number field also applies. '+(docked?'Closing the panel discards the draft.':'Escape closes this window and discards the draft.'):'The draft matches the applied properties.'} All capital, fees and orders are virtual. Default market orders fill at the next bar open. Intrabar fills use the declared OHLC route.</p>
    <div className="button-row"><button onClick={()=>{setDraft(copyConfig(DEFAULT_STRATEGY_CONFIG));setError('');}}>Reset properties</button><button onClick={cancelEdits}>Cancel edits</button><button className="primary" onClick={apply}>Apply properties</button></div>
   </>:<>
    {reportState.busy&&<p role="status">Local report worker: {reportState.progress?.phase??'starting'}{reportState.progress?' ('+reportState.progress.completedRows+'/'+reportState.progress.totalRows+' transferred rows)':''}. Closing this window cancels its work. <button onClick={cancelCalculation}>Cancel calculation</button></p>}
    {reportState.error&&<p role="alert">{reportState.error} <button onClick={recalculate}>Recalculate</button></p>}
    {reportState.notice&&<p role="status">{reportState.notice}</p>}
    {tableBusy&&<p role="status">Loading bounded report rows from the local worker.</p>}{tableError&&<p role="alert">{tableError}</p>}
    {report&&<>
     <div className="button-row" style={{flexWrap:'wrap'}}><label>Trade direction <select aria-label="Report trade direction" value={side} onChange={event=>{setSide(event.target.value as StrategyReportSide);setPage(0);}}>{(['all','long','short'] as const).map(value=><option key={value} value={value}>{value==='all'?'All':value==='long'?'Long':'Short'}</option>)}</select></label><span>Currency: {report.context.currency??'not set'} · Fill prices: {report.fillBasis==='standard-ohlc'?'Standard OHLC':'Chart prices'} · Time zone: {report.context.timezone}</span><button title="Edit the initial virtual capital in Properties; Apply reruns this report." onClick={()=>switchTab('Properties')}>Initial capital {format(report.config.initialCapital,2)}</button><button title="Edit order timing, Recalculate on every tick and the Bar Magnifier in Properties. Recalculate after order is filled and the account currency are set there too." onClick={()=>switchTab('Properties')}>Execution: {report.config.processOrdersOnClose?'signal bar close':'next bar open'}</button><button title="Run this report again on the same execution and properties as a new local report job. Nothing reaches the paper account." disabled={reportState.busy} onClick={recalculate}>Rerun report</button></div>
     <p className="help">Dates are bar times; fills inside a bar have no exact time. Long and short totals count their own trades; the equity curve and benchmark cover both.</p>
     {tab==='Metrics'&&<PerformanceSummary summary={report}/>}
     {tab==='Metrics'&&<>
      <div className="performance-cards">{OVERVIEW.map(([label,key,digits])=><div key={key} title={report.metrics[side][key].reason??report.metrics[side][key].basis}><small>{label}</small><strong>{format(report.metrics[side][key].value,digits)}</strong></div>)}</div>
      <ReportChart key={report.context.executionId+':'+reportEpoch.current} handle={handle!} assertOwner={()=>assertReport(handle!)}/>
      {groups.map(group=><details key={group} open><summary>{group}</summary><table className="data-table"><thead><tr><th>Metric</th><th>{side} value</th><th>Basis or limitation</th></tr></thead><tbody>{STRATEGY_REPORT_METRICS.filter(definition=>definition.group===group).map(definition=>{const metric=report.metrics[side][definition.key];return <tr key={definition.key}><td>{definition.label}</td><td>{strategyMetricText(metric.value,metric.unit,metric.status)}</td><td style={{whiteSpace:'normal'}}>{metric.reason??metric.basis}</td></tr>;})}</tbody></table></details>)}
      <TradeAnalysis analysis={report.analysis} side={side}/>
      <ReportPeriodsTable periods={report.analysis.periods}/>
      <RpstAnalysisPanel analysis={report.analysis.rpst} timezone={report.context.timezone}/>
      <p className="help">Intrabar drawdown and run-up are unavailable when pyramided or partially closed entries overlap.</p>
     </>}
     {/* The toolbar is outside the table condition: a Find keystroke starts a worker query and clears the page meanwhile, which must not remount (and blur) the Find box. */}
     {tab==='Trades'&&<><div className="button-row" style={{marginTop:12,flexWrap:'wrap'}}><label>Find trade or signal <input aria-label="Find report trade" maxLength={200} value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}}/></label><button onClick={()=>setColumnPanel(value=>!value)}>Columns</button><span>{table?table.count+' closed allocations':tableBusy?'Loading rows':''}</span></div>
      {columnPanel&&<fieldset><legend>Visible trade columns</legend><div className="button-row" style={{flexWrap:'wrap'}}>{REPORT_TRADE_COLUMNS.map(([key,label])=><label key={key}><input type="checkbox" checked={columns.includes(key)} disabled={columns.length===1&&columns[0]===key} onChange={()=>toggleColumn(key)}/>{label}</label>)}</div><button onClick={()=>setColumns(DEFAULT_REPORT_COLUMNS)}>Reset columns</button><p className="help">Column choices last for this report window. CSV exports all available columns, including hidden columns.</p></fieldset>}
       <p className="help">Entry notional is the entry units multiplied by the entry fill price, in the report currency. The fill price already includes any configured slippage; fees are excluded. Return % is Net PnL divided by the entry notional.</p></>}
     {tab==='Trades'&&table&&<>
      <div className="table-scroll"><table className="data-table"><thead><tr>{columns.map(key=><th key={key}><button onClick={()=>{if(sort===key)setDescending(value=>!value);else{setSort(key);setDescending(false);}setPage(0);}}>{REPORT_TRADE_COLUMNS.find(([value])=>value===key)![1]}{sort===key?descending?' ↓':' ↑':''}</button></th>)}</tr></thead><tbody>{table.rows.map(trade=><tr key={trade.id} {...(props.onTradeSelect?{tabIndex:0,className:'lv-trade-row',title:'Show this trade on the chart','data-trade-row':trade.number,onClick:()=>props.onTradeSelect!(trade),onKeyDown:(event:React.KeyboardEvent)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();props.onTradeSelect!(trade);}}}:{})}>{columns.map(key=><td key={key}><TradeCell trade={trade} column={key} timezone={report.context.timezone}/></td>)}</tr>)}</tbody></table></div>
      {!table.count&&<p>No closed trades match these controls. This does not imply zero open exposure.</p>}<Pager page={table.page} pages={table.pages} onPage={setPage}/>
      <h3>Open entries</h3><p className="help">Open net includes remaining entry fees under the declared OpenCandle convention. Mark is the last close of the run.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr>{['Direction','Entry signal','Units','Entry','Mark','Gross PnL','Remaining fees','Open net'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{openLots.map(lot=><tr key={lot.id}><td>{lot.direction}</td><td>{lot.entrySignal??strategyOrderLabel({id:lot.entryOrderId})}</td><td>{format(lot.quantity)}</td><td>{format(lot.entryPrice)}</td><td>{format(lot.mark)}</td><td>{format(lot.grossProfit)}</td><td>{format(lot.remainingEntryCommission)}</td><td>{format(lot.netProfit)}</td></tr>)}</tbody></table></div>
      {openLotPage&&<><p className="help">{openLotPage.count} open entries. CSV contains every open entry in this direction.</p><Pager page={openLotPage.page} pages={openLotPage.pages} onPage={setOpenPage}/></>}
     </>}
     {tab==='Orders'&&orders&&<>
      <p className="help">Orders include both directions. Buy/sell is the order action, not the resulting trade direction. Rejected and pending orders remain visible.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr>{ORDER_TABLE_HEADERS.map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{orders.rows.map(order=><tr key={order.id}><td>{strategyOrderLabel(order)}</td><td>{order.action}</td><td>{order.type}</td><td>{format(order.quantity)}</td><td>{order.createdBar}</td><td>{order.eligibleBar}</td><td>{order.fillBar??'Unfilled'}</td><td>{format(order.fillPrice)}</td><td style={{whiteSpace:'normal'}}>{order.status}{order.reason?': '+order.reason:''}</td></tr>)}</tbody></table></div>
      <Pager page={orders.page} pages={orders.pages} onPage={setPage}/>
     </>}
     <details><summary>Execution and report assumptions</summary>{report.policies.map((policy,index)=><p className="help" key={index}>{policy}</p>)}<p className="help">{report.benchmark.policy}</p><p className="help">Source: {strategyProvenanceText(report.context.sourceLabel)}</p><p className="help">Execution: {report.context.executionId}</p>{report.diagnostics.slice(0,100).map((message,index)=><p key={index}>{message}</p>)}{report.counts.diagnostics>report.diagnostics.length&&<p>Further diagnostics are available in the whole report JSON.</p>}<p className="help">The current script order adapter supports event revision one. Other revisions reject without silent normalization.</p></details>
    </>}
   </>}
   {/* Outside the tab branch, so loading saved properties into Properties keeps the pasted report. */}
   <SavedReportPanel side={side} current={report} onLoadProperties={loadDraft}/>
  </div>
  <footer style={{flexWrap:'wrap'}}><span><output role="alert">{error}</output><output role="status">{status}</output></span>{execution&&<><button disabled={!report||exportBusy||tab==='Properties'} onClick={()=>void exportReport(currentExport)}>Export {currentExport} CSV</button><button disabled={!report||exportBusy||tab==='Properties'} onClick={()=>void exportReport('json')}>Export report JSON</button></>}{execution&&workbookExport()?<button disabled={!report||exportBusy||tab==='Properties'} onClick={()=>void exportReport('xlsx')}>Export XLSX</button>:null}<button onClick={close}>Close</button></footer>
 </>;
 if(docked){
  const dock=<section className="lv-strategy-dock" role="region" aria-label="Strategy tester"><style>{STRATEGY_DOCK_CSS}</style>{content}</section>;
  return props.dockHost?createPortal(dock,props.dockHost):dock;
 }
 return <Modal title="Strategy report" onClose={close} wide>{content}</Modal>;
}
function Pager({page,pages,onPage}:{page:number;pages:number;onPage:(page:number)=>void}){return <div className="button-row"><button disabled={page===0} onClick={()=>onPage(page-1)}>Previous page</button><span>Page {page+1} of {pages}</span><button disabled={page+1>=pages} onClick={()=>onPage(page+1)}>Next page</button></div>;}
/** Orders table headers. "Order" holds the readable order name; the name is our own choice. */
export const ORDER_TABLE_HEADERS=['Order','Action','Type','Units','Created row','Eligible row','Fill row','Fill price','Status / reason'] as const;
/** One List of trades cell; signal columns show readable names, never generated identities. */
export function TradeCell({trade,column,timezone}:{trade:ReportTrade;column:ReportTradeColumn;timezone:string}){
 if(column==='entryTime'||column==='exitTime'){const location=column==='entryTime'?trade.entry:trade.exit;return <span title={location.barId}>{barTime(location.time,timezone)} / {location.phase}</span>;}
 if(column==='entryOrderId'||column==='exitOrderId')return <span>{column==='entryOrderId'?trade.entrySignal??strategyOrderLabel({id:trade.entryOrderId}):trade.exitSignal??strategyOrderLabel({id:trade.exitOrderId})}</span>;
 const value=tradeColumnValue(trade,column);return <span title={column==='favorable'||column==='adverse'||column==='favorablePercent'||column==='adversePercent'?trade[column].reason??trade[column].basis:undefined}>{typeof value==='string'?value:format(value)}</span>;
}
const PERIOD_LABELS:Record<ReportPeriodKind,string>={day:'Day',week:'Week (ISO)',month:'Month',quarter:'Quarter',year:'Year'};
/** Calendar periodical results and same-period buy-and-hold returns for the whole account (all directions). */
export function ReportPeriodsTable({periods,initialKind='month'}:{periods:ReportPeriods|undefined;initialKind?:ReportPeriodKind}){
 const [kind,setKind]=React.useState<ReportPeriodKind>(initialKind);
 if(!periods)return <p className="help">Calendar periods are not available in this report.</p>;
 const rows=periods.rows[kind],points=(a:number|null,b:number|null)=>a===null||b===null?'Unavailable':format(a-b,4);
 return <details open><summary>Periodical and benchmark returns</summary>
  <label>Period <select aria-label="Report period" value={kind} onChange={event=>setKind(event.target.value as ReportPeriodKind)}>{REPORT_PERIOD_KINDS.map(value=><option key={value} value={value}>{PERIOD_LABELS[value]}</option>)}</select></label>
  <p className="help">{periods.basis} Month is the initial OpenCandle selection.</p>
  {rows===null?<p>More than {REPORT_PERIOD_ROW_LIMIT} {PERIOD_LABELS[kind].toLowerCase()} periods in this run. Choose a longer period.</p>:<div className="table-scroll"><table className="data-table"><thead><tr>{['Period','Closed trades','Closed net PnL','Marked return %','Buy-and-hold return %','Difference (points)'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.key}><td>{row.key}</td><td>{row.closedTrades}</td><td>{format(row.closedNet)}</td><td>{format(row.returnPercent,4)}</td><td>{format(row.benchmarkReturnPercent,4)}</td><td>{points(row.returnPercent,row.benchmarkReturnPercent)}</td></tr>)}</tbody></table></div>}
 </details>;
}
/** Closed-allocation outcomes, streaks and entry-time groups from the same accepted execution. */
export function TradeAnalysis({analysis,side}:{analysis:ReportAnalysis;side:StrategyReportSide}){
 const row=analysis.sides[side],{outcomes,streaks}=row;
 const share=(value:number|null)=>value===null?'Undefined (no closed trades)':format(value,2)+'%';
 const table=(title:string,rows:readonly ReportBucket[],label:(key:number)=>string)=>{const used=rows.filter(bucket=>bucket.trades);return <details key={title}><summary>{title}</summary>{used.length?<table className="data-table"><thead><tr>{['Group','Closed trades','Win rate','Wins','Losses','Even','Net PnL'].map(heading=><th key={heading}>{heading}</th>)}</tr></thead><tbody>{used.map(bucket=><tr key={bucket.key}><td>{label(bucket.key)}</td><td>{bucket.trades}</td><td>{share(bucket.winRate)}</td><td>{bucket.wins}</td><td>{bucket.losses}</td><td>{bucket.even}</td><td>{format(bucket.net)}</td></tr>)}</tbody></table>:<p>No closed trades in this direction.</p>}</details>;};
 return <details open><summary>Trade analysis ({side})</summary>
  <p className="help">{analysis.basis} Time zone: {analysis.timezone}.</p>
  <table className="data-table"><tbody>
   <tr><td>Winning trades</td><td>{outcomes.wins}</td><td>{share(outcomes.winShare)}</td></tr>
   <tr><td>Losing trades</td><td>{outcomes.losses}</td><td>{share(outcomes.lossShare)}</td></tr>
   <tr><td>Even trades</td><td>{outcomes.even}</td><td>{share(outcomes.evenShare)}</td></tr>
   <tr><td>Longest winning streak</td><td>{streaks.longestWins} trades</td><td>Best winning run net: {format(streaks.bestWinRun)}</td></tr>
   <tr><td>Longest losing streak</td><td>{streaks.longestLosses} trades</td><td>Worst losing run net: {format(streaks.worstLossRun)}</td></tr>
   <tr><td>Final run</td><td>{streaks.finalKind?streaks.finalCount+' '+streaks.finalKind:'None'}</td><td></td></tr>
   {([['Best entry hour',row.hour,(key:number)=>String(key).padStart(2,'0')+':00'],['Best entry weekday',row.weekday,(key:number)=>WEEKDAY_NAMES[key]],['Best entry month',row.month,(key:number)=>MONTH_NAMES[key]]] as const).map(([label,rows,name])=>{const best=bestEntryPeriod(rows);return <tr key={label}><td>{label}</td><td>{best?name(best.key):'None (no closed trades)'}</td><td>{best?'Win rate '+share(best.winRate)+' · '+best.trades+' closed · net '+format(best.net):''}</td></tr>;})}
  </tbody></table>
  <p className="help">Best period: highest win rate among groups with a closed trade; ties go to higher net PnL, then more trades, then the earlier group (OpenCandle policy).</p>
  {table('Entry hour',row.hour,key=>String(key).padStart(2,'0')+':00')}
  {table('Entry weekday',row.weekday,key=>WEEKDAY_NAMES[key])}
  {table('Entry month',row.month,key=>MONTH_NAMES[key])}
 </details>;
}
/** RPST report analyses: return distribution, modeled margin usage with hover, growth/decline periods and benchmark comparison. */
export function RpstAnalysisPanel({analysis,timezone,initialIndex=null}:{analysis:ReportRpstAnalysis|undefined;timezone:string;initialIndex?:number|null}){
 const [selected,setSelected]=React.useState<number|null>(initialIndex);
 if(!analysis)return <p className="help">Distribution, margin usage and growth/decline analyses are not in this report.</p>;
 const {distribution,margin,growthDecline,benchmark}=analysis,hover=selected===null?null:marginUsageHover(margin.points,selected);
 const date=(time:number)=>barTime(time,timezone);
 return <>
  <details open><summary>Return distribution</summary>{distribution.available?<>
   <p className="help">{distribution.basis}</p>
   <table className="data-table"><thead><tr>{['Return range %','Winning','Losing','Even'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{distribution.bins.filter(bin=>bin.winning+bin.losing+bin.even).map(bin=><tr key={bin.from}><td>{format(bin.from,4)} to {format(bin.to,4)}</td><td>{bin.winning}</td><td>{bin.losing}</td><td>{bin.even}</td></tr>)}</tbody></table>
   <p>Average gain: {distribution.averageGainPercent===null?'None (no winning trades)':format(distribution.averageGainPercent,4)+'%'} · Average loss: {distribution.averageLossPercent===null?'None (no losing trades)':format(distribution.averageLossPercent,4)+'%'}</p>
   <p className="help">Outliers: unavailable. {distribution.outliers.reason}</p>
  </>:<p>{distribution.reason}</p>}</details>
  <details><summary>Margin usage</summary><p className="help">{margin.basis}</p><p>Maximum modeled margin: {format(margin.maxMargin,2)}{margin.sampled?' (series sampled)':''}</p>
   <label>Point <select aria-label="Margin usage point" value={selected===null?'':String(selected)} onChange={event=>setSelected(event.target.value===''?null:Number(event.target.value))}><option value="">Choose a bar</option>{margin.points.map((point,index)=><option key={point.barIndex} value={index}>{date(point.time)}</option>)}</select></label>
   {hover&&<p role="status">{date(hover.time)}: {hover.tradeCount} open trade{hover.tradeCount===1?'':'s'}, modeled margin {format(hover.margin,2)}</p>}
  </details>
  <details><summary>Growth and decline</summary><p className="help">{growthDecline.basis}</p>
   <table className="data-table"><thead><tr>{['','Max','Average','Current'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{(['growth','decline'] as const).map(kind=><tr key={kind}><td>{kind==='growth'?'Growth':'Decline'}</td><td>{format(growthDecline.summary[kind].max,2)}</td><td>{format(growthDecline.summary[kind].average,2)}</td><td>{format(growthDecline.summary[kind].current,2)}</td></tr>)}</tbody></table>
   {growthDecline.periods.length?<table className="data-table"><thead><tr>{['Period','Amount','Percent','Start','End'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{growthDecline.periods.map(row=><tr key={row.kind+row.startTime+':'+row.endTime}><td>{row.kind==='growth'?'Growth':'Decline'}</td><td>{format(row.amount,2)}</td><td>{row.percent===null?'Unavailable':format(row.percent,4)+'%'}</td><td>{date(row.startTime)}</td><td>{date(row.endTime)}</td></tr>)}</tbody></table>:<p>No completed growth or decline period.</p>}
   {growthDecline.omitted>0&&<p className="help">{growthDecline.omitted} further periods are in the report export.</p>}
  </details>
  <details><summary>Benchmark comparison</summary>{'available' in benchmark?<p>{benchmark.reason}</p>:benchmark.points.length?<p>Final: strategy {format(benchmark.points.at(-1)!.strategyPercent,4)}% · buy and hold {benchmark.points.at(-1)!.benchmarkPercent===null?'Unavailable':format(benchmark.points.at(-1)!.benchmarkPercent,4)+'%'}{benchmark.sampled?' (series sampled)':''}</p>:<p>No bars loaded.</p>}</details>
 </>;
}
