import type {CoinbaseBridge} from '../src/domain/coinbase-live';
import type {AlpacaBridge} from '../src/domain/alpaca-live';
import type {BarCacheBridge} from '../src/domain/live-cache';
import type {ChartEventsBridge} from '../src/domain/chart-events';
import type {DataSourceSettingsBridge} from '../src/domain/data-source-settings';
/** Electron/wick.cjs wickSnapshotInput. */
export type WickStripTab = {id:string;symbol:string;name:string;active:boolean;price?:string;change?:string;tone?:'up'|'down'|'flat'};
export type WickStripSnapshot = {tabs:WickStripTab[];theme:Record<string,string>};
export type WickModeState = {active:boolean;alwaysOnTop:boolean;collapseOnBlur:boolean};
export type BridgeResult<T> ={ok:true;value:T}|{ok:false;error:{code:string;message:string}};
/** Transport address mode is descriptive; renderer publication still requires its private chart/job proof. */
export type ScriptBridgeBar={id:string;revision:number;time:number;open:number;high:number;low:number;close:number;volume:number};
export type ScriptBridgeChartInput=
 |{chartPositionMode?:undefined;bars:ScriptBridgeBar[]}
 |{chartPositionMode:'logical-v1';bars:Array<Omit<ScriptBridgeBar,'volume'>&{volume:number|null}>;snapshot?:null;provisional?:false};
export interface LVBridge {
  loadWorkspace():Promise<BridgeResult<{schemaVersion:1;revision:number;savedAt:string|null;data:Record<string,unknown>|null;storage:{directory:string;backend:'json-atomic'}}>>;
  saveWorkspace(input:{schemaVersion:1;expectedRevision:number;data:Record<string,unknown>}):Promise<BridgeResult<{revision:number;savedAt:string}>>;
  resetWorkspace(expectedRevision:number):Promise<BridgeResult<{revision:number;savedAt:string}>>;
  importBars():Promise<BridgeResult<{fileName:string;format:'csv'|'json';text:string;bytes:number}>>;
  importData(input:{kind:'fundamentals'|'strategy-report'|'news'|'scripts'|'screener'|'indicator-templates'|'workspace'|'watchlist-advanced'|'layouts'}):Promise<BridgeResult<{kind:'fundamentals'|'strategy-report'|'news'|'scripts'|'screener'|'indicator-templates'|'workspace'|'watchlist-advanced'|'layouts';fileName:string;format:'json';text:string;bytes:number}>>;
  importData(input:{kind:'heatmap-metadata'}):Promise<BridgeResult<{kind:'heatmap-metadata';fileName:string;format:'json'|'csv';text:string;bytes:number}>>;
  importData(input:{kind:'calendar'}):Promise<BridgeResult<{kind:'calendar';fileName:string;format:'json'|'csv';text:string;bytes:number}>>;
  importData(input:{kind:'watchlist'}):Promise<BridgeResult<{kind:'watchlist';fileName:string;format:'txt'|'json';text:string;bytes:number}>>;
  exportWorkspace(input:{schemaVersion:1;data:Record<string,unknown>}):Promise<BridgeResult<{fileName:string;bytes:number}>>;
  exportChart(input:{pngDataUrl:string;suggestedName?:string}):Promise<BridgeResult<{fileName:string;bytes:number}>>;
  /** Put the chart PNG on the OS clipboard. Resolves ok only after the clipboard write. */
  copyChartImage?(input:{pngDataUrl:string}):Promise<BridgeResult<{bytes:number;width:number;height:number}>>;
  /** Toggles the calling window's full screen (the F11 mode); answers the resulting state. */
  toggleFullScreen?():Promise<BridgeResult<{fullScreen:boolean}>>;
  exportData(input:{text:string;suggestedName:string;format:'csv'|'json'|'txt'|'ics'}):Promise<BridgeResult<{fileName:string;bytes:number}>>;
  exportBinary(input:{data:Uint8Array;suggestedName:string;format:'xlsx'}):Promise<BridgeResult<{fileName:string;bytes:number}>>;
  fetchSecCompanyFacts(input:{requestId:string;cik:string}):Promise<BridgeResult<{schemaVersion:1;cik:string;entityName:string;data:Record<string,unknown>;provenance:{provider:'SEC EDGAR';kind:'public-unauthenticated';sourceUrl:string;retrievedAt:string;sha256:string;bytes:number;coverage:string}}>>;
  cancelSecRequest(input:{requestId:string}):Promise<BridgeResult<{cancelled:boolean}>>;
  fetchSecSubmissions(input:{requestId:string;cik:string}):Promise<BridgeResult<{schemaVersion:1;cik:string;entityName:string;data:Record<string,unknown>;recentCount:number;historyFiles:Array<{name:string;filingCount:number;filingFrom:string;filingTo:string}>;historyFetched:false;provenance:{provider:'SEC EDGAR';kind:'public-unauthenticated';sourceUrl:string;retrievedAt:string;sha256:string;bytes:number;coverage:string}}>>;
  executeScript(input:ScriptBridgeChartInput&{requestId:string;source:string;snapshot?:Record<string,unknown>|null;provisional?:boolean;provenance?:{kind:'synthetic'|'local-import';label:string};inputs?:Record<string,number|string|boolean>|null;requests?:Record<string,Array<{time:number;open:number;high:number;low:number;close:number;volume:number|null}|null>>|null;timeframes?:Record<string,{rows:Array<{time:number;open:number;high:number;low:number;close:number;volume:number|null;end:number}>;visible:number[]}>|null;symbols?:Record<string,{rows:Array<{time:number;open:number;high:number;low:number;close:number;volume:number|null;end:number}>;visible:number[]}>|null;engine?:{positions:Array<{position:number;averagePrice:number|null;openTrades:number}|null>;fills:Array<{bar:number;ordinal:number;name:string|null;kind:'order'|'exit'|'margin-call';leg:'profit'|'loss'|'trail'|null;side:'buy'|'sell';quantity:number;price:number;high:number;low:number;close:number;position:number;averagePrice:number|null;openTrades:number}>}|null}):Promise<BridgeResult<{plots:Array<{id:string;title:string;values:Array<{time:number;value:number|null;index?:number}>;color:string}>;alerts:Array<Record<string,unknown>>;orders:Array<Record<string,unknown>>;conditions?:Array<{id:string;title:string;message:string;values:Array<{time:number;value:number;index?:number}>}>;visuals?:{hlines:Array<{title:string;price:number;color:string;lineStyle:'solid'|'dashed'|'dotted';width:number}>;fills:Array<{title:string;from:string;to:string;color:string}>;backgrounds:Array<{time:number;color:string;index?:number}>;markers:Array<{title:string;time:number;index?:number;shape:string;location:'abovebar'|'belowbar'|'top'|'bottom';color:string;text:string;size:'tiny'|'small'|'normal'|'large'|'huge'}>};objects?:{base:{index:number;time:number}|null;barcolors:Array<{time:number;color:string;index?:number}>;labels:Array<{id:number;xloc:'index'|'time';x:number;y:number;yloc:'price'|'abovebar'|'belowbar';text:string;style:string;color:string|null;textColor:string|null;size:'auto'|'tiny'|'small'|'normal'|'large'|'huge';textAlign:'left'|'center'|'right';tooltip:string}>;lines:Array<{id:number;xloc:'index'|'time';x1:number;y1:number;x2:number;y2:number;extend:'none'|'left'|'right'|'both';color:string|null;style:'solid'|'dashed'|'dotted'|'arrowleft'|'arrowright'|'arrowboth';width:number}>;boxes:Array<{id:number;xloc:'index'|'time';left:number;top:number;right:number;bottom:number;extend:'none'|'left'|'right'|'both';borderColor:string|null;borderWidth:number;borderStyle:'solid'|'dashed'|'dotted';bgColor:string|null;text:string;textColor:string|null;textSize:'auto'|'tiny'|'small'|'normal'|'large'|'huge';hAlign:'left'|'center'|'right';vAlign:'top'|'center'|'bottom'}>;tables:Array<{id:number;position:'top_left'|'top_center'|'top_right'|'middle_left'|'middle_center'|'middle_right'|'bottom_left'|'bottom_center'|'bottom_right';columns:number;rows:number;bgColor:string|null;frameColor:string|null;frameWidth:number;borderColor:string|null;borderWidth:number;cells:Array<{column:number;row:number;text:string;textColor:string|null;bgColor:string|null;hAlign:'left'|'center'|'right';vAlign:'top'|'center'|'bottom';textSize:'auto'|'tiny'|'small'|'normal'|'large'|'huge';tooltip:string}>}>};logs?:{entries:Array<{time:number;index:number;level:'info'|'warn'|'error';message:string}>;dropped:number};declarations?:{inputs:Array<{id:string;type:'int'|'float'|'bool'|'string';title:string;default:number|string|boolean;min:number|null;max:number|null;step:number|null;options:string[]|null}>;requests:Array<{id:string;symbol:string|null;interval:string|null}>;timeframes?:Array<{id:string;interval:string}>;symbols?:Array<{id:string;symbol:string}>};inputs?:Record<string,number|string|boolean>;state:Record<string,unknown>|null;diagnostics:Array<{code:string;message:string}>;elapsedMs:number;provisional:boolean;provenance:{kind:'synthetic'|'local-import';label:string}}>>;
  /** One silent OS notification (text only). `shown` is false where the OS cannot show one. */
  showAlertNotification?(input:{title:string;body:string;tag:string}):Promise<BridgeResult<{shown:boolean}>>;
  postAlertWebhook?(input:{url:string;body:string;contentType:'application/json'|'text/plain';origin:'local'|'replay'|'synthetic'}):Promise<BridgeResult<{delivered:boolean;status:number;error:string|null}>>;
  cancel(input:{requestId:string}):Promise<BridgeResult<{cancelled:boolean}>>;
  close():Promise<BridgeResult<null>>;
  /** "Keep running in the notification area when closed". `supported` is false where there is no tray (closing quits). */
  setTrayKeepRunning?(input:{keepRunning:boolean}):Promise<BridgeResult<{keepRunning:boolean;supported:boolean}>>;
  /** Quit OpenCandle from the app menu: a full quit that keeps the workspace save flush. */
  quitApp?():Promise<BridgeResult<null>>;
  /** Shrink to the always-on-top tab strip (main window only). */
  enterWickMode?():Promise<BridgeResult<WickModeState>>;
  /** Back to the full window (main window only; a tab switch that must ask first). */
  exitWickMode?():Promise<BridgeResult<WickModeState>>;
  /** The two Settings rows; main keeps its own copy (wick-state.json). */
  configureWickMode?(input:{alwaysOnTop:boolean;collapseOnBlur:boolean}):Promise<BridgeResult<WickModeState&{supported:boolean}>>;
  /** The tab strip as the main window shows it, forwarded to the strip window. */
  publishWickStrip?(input:WickStripSnapshot):Promise<BridgeResult<{accepted:boolean}>>;
  onWickState?(handler:(state:WickModeState)=>void):()=>void;
  onWickTabRequest?(handler:(request:{id:string})=>void):()=>void;
  /** Strip window only: the last tab strip (null before the first), then each update. */
  wickStripReady?():Promise<BridgeResult<WickStripSnapshot|null>>;
  onWickSnapshot?(handler:(snapshot:WickStripSnapshot)=>void):()=>void;
  wickRestore?():Promise<BridgeResult<WickModeState>>;
  wickSelectTab?(input:{id:string}):Promise<BridgeResult<{restored:boolean}>>;
  wickMenu?():Promise<BridgeResult<{shown:boolean}>>;
  /** The main process holds a window close until this handler settles (bounded there). Returns an unsubscribe. */
  fetchFredSeries?(input:{series:string}):Promise<BridgeResult<{schemaVersion:1;series:string;rows:Array<[number,number]>;fetchedAt:number;cached:boolean;stale:boolean;notice?:string}>>;
  fredDataStatus?():Promise<BridgeResult<{schemaVersion:1;bytes:number;entries:number;maxBytes:number}>>;
  clearFredData?():Promise<BridgeResult<{schemaVersion:1;bytes:number;entries:number;maxBytes:number}>>;
  fetchCoinbaseCandles?:CoinbaseBridge['fetchCoinbaseCandles'];
  subscribeCoinbase?:CoinbaseBridge['subscribeCoinbase'];
  unsubscribeCoinbase?:CoinbaseBridge['unsubscribeCoinbase'];
  onCoinbaseEvent?:CoinbaseBridge['onCoinbaseEvent'];
  coinbaseStatus?():Promise<BridgeResult<unknown>>;
  cancelCoinbaseRequest?(input:{requestId:string}):Promise<BridgeResult<{cancelled:boolean}>>;
  startupOpenSymbol?():Promise<BridgeResult<string|null>>;
  /** Raw --lv-open-symbols= text (comma-separated, length-capped in main); the renderer parses it. */
  startupOpenSymbols?():Promise<BridgeResult<string|null>>;
  /** Help > Report where you got stuck: main opens its fixed GitHub issue form in the default browser. */
  reportStuck?():Promise<BridgeResult<{opened:boolean}>>;
  alpacaKeyStatus?:AlpacaBridge['alpacaKeyStatus'];
  saveAlpacaKey?:AlpacaBridge['saveAlpacaKey'];
  clearAlpacaKey?:AlpacaBridge['clearAlpacaKey'];
  testAlpacaConnection?:AlpacaBridge['testAlpacaConnection'];
  fetchAlpacaBars?:AlpacaBridge['fetchAlpacaBars'];
  subscribeAlpaca?:AlpacaBridge['subscribeAlpaca'];
  unsubscribeAlpaca?:AlpacaBridge['unsubscribeAlpaca'];
  onAlpacaEvent?:AlpacaBridge['onAlpacaEvent'];
  alpacaStatus?():Promise<BridgeResult<unknown>>;
  cancelAlpacaRequest?(input:{requestId:string}):Promise<BridgeResult<{cancelled:boolean}>>;
  searchAlpacaAssets?:AlpacaBridge['searchAlpacaAssets'];
  /** Split and dividend history for one US stock (main process, owner key or the SYNTHETIC stub). */
  fetchAlpacaCorporateActions?:ChartEventsBridge['fetchAlpacaCorporateActions'];
  /** Data sources > Your saved info (src/domain/data-source-settings.ts DataSourceSettingsBridge). */
  dataSourcesInfo?:DataSourceSettingsBridge['dataSourcesInfo'];
  openDataFolder?:DataSourceSettingsBridge['openDataFolder'];
  exportDataSourceSettings?:DataSourceSettingsBridge['exportDataSourceSettings'];
  importDataSourceSettings?:DataSourceSettingsBridge['importDataSourceSettings'];
  /** The local bar cache (main process, profile market-data-cache folder). */
  readBarCache?:BarCacheBridge['readBarCache'];
  writeBarCache?:BarCacheBridge['writeBarCache'];
  discardBarCache?:BarCacheBridge['discardBarCache'];
  barCacheStatus?:BarCacheBridge['barCacheStatus'];
  clearBarCache?:BarCacheBridge['clearBarCache'];
  /** A layout window may resolve {keepOpen:true} to keep its window open and ask to save first. */
  onFlushRequest?(handler:()=>Promise<unknown>):()=>void;
  /** Open layout in new window (main window only). focused: the layout was already open and its window was focused. */
  openLayoutWindow?(input:{layoutId:string}):Promise<BridgeResult<{windowId:number;focused:boolean}>>;
  /** A layout window's save, relayed to the main window, which writes the workspace file, with the
   * workspace-wide fields the layout window changed (`shared`). */
  saveLayoutFromWindow?(input:{layoutId:string;grid:Record<string,unknown>;shared?:Record<string,unknown>}):Promise<BridgeResult<{revision:number;savedAt:string}>>;
  /** A layout window's Shift+B / Shift+S, relayed to the main window (which owns paper trading). */
  sendPaperToMain?(input:{side:'buy'|'sell';instrument:Record<string,unknown>;quote:Record<string,unknown>|null;quoteSource:{key:string;state:string};now:number}):Promise<BridgeResult<{ok:boolean;message:string}>>;
  /** The main window's handler for relayed paper actions. */
  onPaperRequest?(handler:(request:unknown)=>Promise<{ok:boolean;message:string;focus?:boolean}>):()=>void;
  /** After a reset or restore, the main window reloads every layout window (main window only). */
  refreshLayoutWindows?():Promise<BridgeResult<{refreshed:number}>>;
  /** The layouts open in other windows (the current list, then each change). */
  onLayoutWindows?(handler:(value:{layoutIds:string[]})=>void):()=>void;
  /** The main window's handler for relayed layout saves. */
  onLayoutSaveRequest?(handler:(request:{layoutId:string;grid:unknown;shared?:unknown})=>Promise<{revision:number}>):()=>void;
}
declare global { interface Window { lv:LVBridge; } }
