import {reconstructLocalCandleDataset} from '../domain/local-candle-origin';
import {restoreDrawingFavorites} from './drawing-favorites';
import {assertGridTracks} from '../chart/layout-tracks';
import {createImageAssetStore} from '../chart/image-assets';
import {validateChartOptions} from '../chart/navigation';
import {backtestStrategy} from '../domain/strategy';
import {restoreScreenerSettings} from '../domain/screener-state';
import type {BarDataset} from '../domain/types';
import {FIXTURE_CAPABILITIES} from '../domain/fixtures';
import {createLayoutPort,LV_LAYOUTS,mirrorLayoutDrawingSync,resolveDrawingSyncOn} from '../chart/layout-port';
import {migrateDrawingUtility,stampLegacyRows,validateGlobalDrawings} from '../chart/drawing-utility-state';
import {workspaceDatasets,suppliedSourceId,ensureWorkspaceGrid,type ChartWorkspace} from './workspace-grid';
import {createLayoutLibrary,restoreLayoutLibrary} from './layout-library';
import {measureWorkspaceJSON} from './workspace-json';
import {restoreLiveData,restoreLiveCharts,restoreLiveComparisons} from './live-workspace';
import {restoreAppPreferences} from './app-preferences';
import {restoreBottomPanelBook} from './bottom-panel-model';
import {drawingTypes} from '@luxalgo/vela';
import {validateViewport} from '../chart/inspection';
import {restoreFactsDocument} from '../fundamentals/company-facts';
import {createFundamentalsPreferences,restoreFundamentalsPreferences} from '../fundamentals/preferences';
import {restoreNewsState} from '../analysis-news/news';
import {restoreFilingsDocument} from '../analysis-news/filings';
import {restoreHeatmapState} from '../domain/heatmap';
import {restorePortfolioState} from '../portfolio/portfolio';
import {restoreMarketViews} from '../market-views/state';
import {restoreCalendarState} from '../domain/calendar';
import {validatedSettingsBook,type ChartSettingsBook} from '../chart/chart-settings';
import {createScriptLibrary,restoreScriptLibrary,restoreScriptBindings,type ScriptDocument} from './script-library';
import {restoreIntervalMenuState,restoreIntervalDerivation} from '../domain/intervals';
import {isRebuiltDerivedImport,carryRebuiltMark} from './workspace-derived-imports';
import {createWatchBook,restoreWatchBook,watchSymbols} from '../watchlists/model';
import {createWatchAdvancedState,restoreWatchAdvancedState,restoreWatchBenchmarks} from '../watchlists/advanced-data';
import {restoreListAlerts} from '../domain/watchlist-alerts';
import {restoreDrawingToolDefaults} from '../chart/drawing-tool-defaults';
import {initialDrawingPreferences,restoreDrawingPreferences} from './drawing-preferences';
import {validateIndicatorSnapshots} from '../chart/indicator-settings';
import {createIndicatorLibrary,restoreIndicatorLibrary} from './indicator-library';
import {createIndicatorTemplates,restoreIndicatorTemplates} from './indicator-templates';
import {cellSessionDataset,validateCellSession} from '../chart/cell-session';
import {sourceContextForDataset} from '../chart/source-context';
import {validateHistoricalFrame,assertHistoricalFrameCompatible} from '../chart/historical-frame';
import {validateCellDrawingScopes} from './drawing-scopes';
import {validatePriceScaleSettings} from '../chart/price-scale-state';
import {restoreChartSettingsDocument} from '../chart/chart-settings-document';
import {SCALE_FONT_SIZES} from '../chart/chart-settings-facts';
import {isCanonicalSymbolMath} from '../domain/symbol-math';
import {restoreChartTypeFavorites} from './chart-type-favorites';
/** Scale text: any legacy numeric value 6-32, or exactly a size offered by the Settings dialog (adds 40). */
function validScaleFontSize(size:number){return size>=6&&size<=32||SCALE_FONT_SIZES.includes(size);}
const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
/** Map every grid cell's active and inactive scope document rows through `stamp`; no history record. */
function stampGridDocuments(state:Record<string,any>,stamp:(rows:Record<string,unknown>[])=>Record<string,unknown>[]){
 const grid=state.grid;if(!object(grid)||!object(grid.cells))return;
 const doc=(value:unknown)=>object(value)&&Array.isArray(value.drawings)?{...value,drawings:stamp(value.drawings as Record<string,unknown>[])}:value;
 const cells:Record<string,unknown>={};
 for(const [id,cell] of Object.entries(grid.cells)){
  if(!object(cell)){cells[id]=cell;continue;}
  const next:Record<string,any>={...cell};if(next.drawings!==undefined)next.drawings=doc(next.drawings);
  if(object(next.drawingScopes)&&Array.isArray(next.drawingScopes.inactive))next.drawingScopes={...next.drawingScopes,inactive:next.drawingScopes.inactive.map((row:any)=>object(row)?{...row,document:doc(row.document)}:row)};
  cells[id]=next;
 }
 state.grid={...grid,cells};
}
const symbol=(value:unknown):value is string=>typeof value==='string'&&/^[A-Z0-9.^_-]{1,24}$/.test(value);
/** A chart symbol (and a plain watchlist entry) is a ticker or a canonical symbol math expression (a saved derived chart or watchlist row, GME/SPY). */
const chartSymbol=(value:unknown):value is string=>symbol(value)||isCanonicalSymbolMath(value);
/** Saved bars are canonical data, not another permissive import. Never sort/coerce on recovery. */
export function validateSavedBars(value:unknown):void{
 if(!Array.isArray(value)||!value.length||value.length>100000)throw new Error('Invalid saved bar count.');let previous=-Infinity;
 for(const bar of value){if(!object(bar)||!Number.isSafeInteger(bar.time)||bar.time< -62135596800||bar.time>253402300799||bar.time<=previous||!['open','high','low','close','volume'].every(key=>typeof bar[key]==='number'&&Number.isFinite(bar[key]))||Math.min(bar.open,bar.high,bar.low,bar.close)<=0||bar.volume<0||bar.high<Math.max(bar.open,bar.close,bar.low)||bar.low>Math.min(bar.open,bar.close,bar.high))throw new Error('Invalid saved OHLCV bar.');previous=bar.time;}
}
/** Reject malformed persisted state before any renderer or autosave receives it. Retain future fields. */
export function restoreWorkspace<T extends Record<string,unknown>>(input:unknown,defaults:T):T{return restore(input,defaults,true);}
function restore<T extends Record<string,unknown>>(input:unknown,defaults:T,validateCollections:boolean):T{
 if(!object(input)||input.version!==1)throw new Error('Unsupported workspace schema.');
 if(validateCollections&&Object.hasOwn(input,'layoutLibrary')){const descriptor=Object.getOwnPropertyDescriptor(input,'layoutLibrary')!;if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value')||descriptor.value===undefined)throw new Error('Invalid explicit layout library.');measureWorkspaceJSON({layoutLibrary:descriptor.value});}
 if(Object.hasOwn(input,'drawingFavorites')){const field=Object.getOwnPropertyDescriptor(input,'drawingFavorites')!;if(!field.enumerable||!Object.hasOwn(field,'value')||field.value===undefined)throw Error('Unsupported explicit drawing favorites.');}
 if(validateCollections&&Object.hasOwn(input,'drawingAssets')){const field=Object.getOwnPropertyDescriptor(input,'drawingAssets')!;if(!field.enumerable||!Object.hasOwn(field,'value')||field.value===undefined||!createImageAssetStore().check(field.value).ok)throw Error('Unsupported explicit drawing assets.');}
 const state={...defaults,...input};
 if(validateCollections)(state as Record<string,unknown>).drawingFavorites=Object.hasOwn(input,'drawingFavorites')?restoreDrawingFavorites(input.drawingFavorites):[];
 if(input.grid===undefined)delete state.grid;
 if(object(state.grid))assertGridTracks(state.grid as {presetId:string;tracks?:unknown});
 if(!chartSymbol(state.symbol)||!Array.isArray(state.watchlist)||state.watchlist.length>5000||!state.watchlist.every(chartSymbol)||new Set(state.watchlist).size!==state.watchlist.length)throw new Error('Invalid symbol or watchlist.');
 if(validateCollections&&(input.watchBook!==undefined||defaults.watchBook!==undefined)){const book=input.watchBook===undefined?createWatchBook(state.watchlist as string[]):restoreWatchBook(input.watchBook);(state as Record<string,unknown>).watchBook=book;(state as Record<string,unknown>).watchlist=watchSymbols(book);}
 if(validateCollections&&(Object.hasOwn(input,'chartSettings')||defaults.chartSettings!==undefined))(state as Record<string,unknown>).chartSettings=restoreChartSettingsDocument(input.chartSettings);
 // Optional WLCORE collection: restored only when present, so a workspace without it round-trips unchanged.
 // Advanced View beta benchmarks, restored (and validated exactly) only when present.
 if(validateCollections&&Object.hasOwn(input,'watchBenchmarks'))(state as Record<string,unknown>).watchBenchmarks=restoreWatchBenchmarks(input.watchBenchmarks);
 if(validateCollections&&Object.hasOwn(input,'listAlerts'))(state as Record<string,unknown>).listAlerts=restoreListAlerts(input.listAlerts);
 // Saved drawing tool defaults, schema step 1; restored only when present, and a present value must be exact.
 if(validateCollections&&Object.hasOwn(input,'drawingToolDefaults'))(state as Record<string,unknown>).drawingToolDefaults=restoreDrawingToolDefaults(input.drawingToolDefaults);
 if(validateCollections&&(Object.hasOwn(input,'watchAdvanced')||defaults.watchAdvanced!==undefined))(state as Record<string,unknown>).watchAdvanced=Object.hasOwn(input,'watchAdvanced')?restoreWatchAdvancedState(input.watchAdvanced):createWatchAdvancedState();
 if(validateCollections&&(input.drawingPreferences!==undefined||defaults.drawingPreferences!==undefined))(state as Record<string,unknown>).drawingPreferences=restoreDrawingPreferences(input.drawingPreferences===undefined?initialDrawingPreferences:input.drawingPreferences);
 // DrawingUtility is the single sync authority once present; layout.sync.drawings is a mirror written on save and ignored on load.
 if(validateCollections&&(Object.hasOwn(input,'drawingUtility')||defaults.drawingUtility!==undefined)){
  const legacySync=(input.grid as {layout?:{sync?:{drawings?:unknown}}}|undefined)?.layout?.sync?.drawings===true;
  const migrated=migrateDrawingUtility(input.drawingUtility,legacySync);
  (state as Record<string,unknown>).drawingUtility=migrated.value;
  (state as Record<string,unknown>).globalDrawings=validateGlobalDrawings(input.globalDrawings===undefined?{}:input.globalDrawings);
  // Legacy row stamping runs once, only when the block was absent. No history entry.
  if(migrated.migrated)stampGridDocuments(state,rows=>stampLegacyRows(rows,legacySync,false));
 }
 if(validateCollections&&(input.indicatorLibrary!==undefined||defaults.indicatorLibrary!==undefined))(state as Record<string,unknown>).indicatorLibrary=input.indicatorLibrary===undefined?createIndicatorLibrary():restoreIndicatorLibrary(input.indicatorLibrary);
 if(validateCollections&&(input.indicatorTemplates!==undefined||defaults.indicatorTemplates!==undefined))(state as Record<string,unknown>).indicatorTemplates=input.indicatorTemplates===undefined?createIndicatorTemplates():restoreIndicatorTemplates(input.indicatorTemplates);
 for(const key of ['chartStyle','themeId'])if(typeof state[key]!=='string'||(state[key] as string).length>100)throw new Error('Invalid '+key+'.');
 if(!['candles','hollow','bars','hlcbars','line','area','baseline','heikinashi','columns','highlow','linemarkers','step','hlcarea','volumecandles','renko','kagi','pointfigure','linebreak','range','tpo','sessionvp','footprint'].includes(state.chartStyle as string))throw new Error('This saved chart type is not supported. Pick another chart type.');
 if(!object(state.appearance)||!object(defaults.appearance))throw new Error('Invalid chart appearance.');
 for(const [key,expected] of Object.entries(defaults.appearance)){
  if(['indicatorLabelsVisible','indicatorValuesVisible'].includes(key)&&!Object.hasOwn(state.appearance,key))continue;
  const actual=state.appearance[key];if(typeof actual!==typeof expected||typeof actual==='number'&&!Number.isFinite(actual)||typeof actual==='string'&&actual.length>200)throw new Error('Invalid appearance field '+key+'.');
 }
 for(const key of ['indicatorLabelsVisible','indicatorValuesVisible','haShowRealLastPrice'])if(Object.hasOwn(state.appearance,key)&&typeof state.appearance[key]!=='boolean')throw new Error('Invalid appearance field '+key+'.');
 const a=state.appearance;if(!['solid','gradient'].includes(a.backgroundType)||!['both','vertical','horizontal','none'].includes(a.gridMode)||![0,1,2].includes(a.crosshairStyle)||!validScaleFontSize(a.fontSize)||a.crosshairWidth<0.5||a.crosshairWidth>8||a.topMargin<0||a.topMargin>40||a.bottomMargin<0||a.bottomMargin>40||a.priceLineWidth<=0||a.highLowWidth<=0)throw new Error('Unsupported appearance settings.');
 if(!object(state.drawings)||!Array.isArray(state.drawings.drawings)||state.drawings.drawings.length>10000)throw new Error('Invalid drawing document.');
 const knownDrawings=new Set(drawingTypes().map(row=>String(row.type))),drawingIds=new Set();for(const drawing of state.drawings.drawings){if(!object(drawing)||typeof drawing.id!=='string'||drawingIds.has(drawing.id)||typeof drawing.type!=='string'||knownDrawings.has(drawing.type)&&(!Array.isArray(drawing.anchors)||!drawing.anchors.every((point:unknown)=>object(point)&&Number.isFinite(point.time)&&Number.isFinite(point.price))))throw new Error('Invalid drawing record.');drawingIds.add(drawing.id);}
 validateIndicatorSnapshots(state.indicators);
 if(!Array.isArray(state.imports)||state.imports.length>1000)throw new Error('Invalid import collection.');
 if(validateCollections){const importIds=new Set<string>();for(const value of state.imports){if(!object(value)||!object(value.provenance)||typeof value.provenance.datasetId!=='string'||(value.provenance.datasetId.startsWith(FIXTURE_CAPABILITIES.id+':')||importIds.has(value.provenance.datasetId)))throw new Error('Invalid or duplicate imported dataset identity.');importIds.add(value.provenance.datasetId);}}
 if(validateCollections)for(const value of state.imports){if(!object(value)||!object(value.instrument)||!object(value.provenance)||!Array.isArray(value.bars)||typeof value.resolution!=='string')throw new Error('Invalid imported dataset.');const item=value as BarDataset;const i=item.instrument,p=item.provenance;if(!symbol(i.symbol)||typeof i.id!=='string'||typeof i.name!=='string'||typeof i.exchange!=='string'||!/^[A-Z]{3}$/.test(i.currency)||!['stock','etf'].includes(i.assetClass)||!Number.isFinite(i.tickSize)||i.tickSize<=0||!Number.isFinite(i.lotSize)||i.lotSize<=0)throw new Error('Invalid imported instrument.');new Intl.DateTimeFormat('en',{timeZone:i.timezone});if(typeof p.datasetId!=='string'||typeof p.providerName!=='string'||typeof p.fixture!=='boolean'||!Number.isFinite(p.asOf)||!['raw','split-adjusted','total-return','unknown'].includes(p.adjustment)||!['regular','extended','all','unknown'].includes(p.session))throw new Error('Invalid imported provenance.');/* A derived interval this session rebuilt from its source is consistent by construction. */if(isRebuiltDerivedImport(item)){sourceContextForDataset(item);continue;}validateSavedBars(item.bars);sourceContextForDataset(item);if(value.derivation!==undefined||p.providerId==='lv-local-aggregation')restoreIntervalDerivation(value.derivation,item);}
 if(validateCollections)(state as Record<string,unknown>).imports=(state.imports as BarDataset[]).map(row=>carryRebuiltMark(row,reconstructLocalCandleDataset(row)));
 if(validateCollections&&state.intervals!==undefined)(state as Record<string,unknown>).intervals=restoreIntervalMenuState(state.intervals);
 if(state.sourceId!==null&&(typeof state.sourceId!=='string'||!state.imports.some((item:BarDataset)=>item.provenance.datasetId===state.sourceId&&item.instrument.symbol===state.symbol)))throw new Error('Selected dataset is missing.');
 if(!object(state.script)||typeof state.script.id!=='string'||typeof state.script.name!=='string'||state.script.name.length>200||typeof state.script.source!=='string'||new TextEncoder().encode(state.script.source).length>65536||!['price','new'].includes(state.script.pane))throw new Error('Invalid script document.');
 if(validateCollections&&(input.scriptLibrary!==undefined||defaults.scriptLibrary!==undefined))(state as Record<string,unknown>).scriptLibrary=input.scriptLibrary===undefined?createScriptLibrary(state.script as ScriptDocument):restoreScriptLibrary(input.scriptLibrary);
 if(state.scriptBindings!==undefined)(state as Record<string,unknown>).scriptBindings=restoreScriptBindings(state.scriptBindings);
 if(!object(state.chartOptions))throw new Error('Invalid chart options.');validateChartOptions(state.chartOptions as any);
 if(!object(state.strategy)||!backtestStrategy({bars:[],signals:[],config:state.strategy}).ok)throw new Error('Invalid strategy settings.');
 if(validateCollections)(state as Record<string,unknown>).screener=restoreScreenerSettings(state.screener);
 if(state.comparisons!==undefined){if(!Array.isArray(state.comparisons)||state.comparisons.length>1000)throw new Error('Invalid comparison collection.');const ids=new Set();for(const item of state.comparisons){if(!object(item)||typeof item.id!=='string'||ids.has(item.id)||typeof item.datasetId!=='string'||!['absolute','percent','indexed'].includes(item.mode)||!['first-visible-match','first-loaded-match'].includes(item.baseline)||typeof item.color!=='string'||!Number.isFinite(item.width)||item.width<=0||typeof item.visible!=='boolean'||item.placement!==undefined&&!['same-scale','new-pane'].includes(item.placement))throw new Error('Invalid comparison settings.');ids.add(item.id);}}
 if(validateCollections&&state.fundamentals!==undefined){if(!Array.isArray(state.fundamentals)||state.fundamentals.length>1000)throw new Error('Invalid fundamentals collection.');const documents=state.fundamentals.map(restoreFactsDocument);(state as Record<string,unknown>).fundamentals=documents;if(new Set(documents.map(row=>row.id)).size!==documents.length)throw new Error('Duplicate fundamentals documents.');}
 // An older workspace has no saved preferences to inherit from another workspace.
 // Present invalid values must fail recovery rather than silently becoming defaults.
 if(validateCollections)(state as Record<string,unknown>).fundamentalsPreferences=Object.hasOwn(input,'fundamentalsPreferences')?restoreFundamentalsPreferences(input.fundamentalsPreferences):createFundamentalsPreferences();
 // Live-data choices default to off when absent; a present value must be exact. The Alpaca key is never stored here.
 if(validateCollections&&Object.hasOwn(input,'liveData'))(state as Record<string,unknown>).liveData=restoreLiveData(input.liveData);
 // App preferences are restored only when present (absent: factory values); a present value must be exact.
 // Optional chart type favorites, restored only when present (a workspace without them round-trips unchanged).
 if(validateCollections&&Object.hasOwn(input,'chartTypeFavorites'))(state as Record<string,unknown>).chartTypeFavorites=restoreChartTypeFavorites(input.chartTypeFavorites);
 if(validateCollections&&Object.hasOwn(input,'appPreferences'))(state as Record<string,unknown>).appPreferences=restoreAppPreferences(input.appPreferences);
 // Bottom panel views per layout, schema step 1; restored only when present, and a present value must be exact.
 if(validateCollections&&Object.hasOwn(input,'bottomPanel'))(state as Record<string,unknown>).bottomPanel=restoreBottomPanelBook(input.bottomPanel);
 if(validateCollections&&Object.hasOwn(input,'liveCharts'))(state as Record<string,unknown>).liveCharts=restoreLiveCharts(input.liveCharts,state as unknown as ChartWorkspace);
 // Saved live comparisons are references only (feed, symbol, interval, settings); a present value must be exact.
 if(validateCollections&&Object.hasOwn(input,'liveComparisons'))(state as Record<string,unknown>).liveComparisons=restoreLiveComparisons(input.liveComparisons);
 if(validateCollections&&state.news!==undefined)(state as Record<string,unknown>).news=restoreNewsState(state.news);
 if(validateCollections&&state.filings!==undefined){if(!Array.isArray(state.filings)||state.filings.length>100)throw new Error('Invalid filings collection.');let total=0;for(const item of state.filings){if(!object(item)||!Array.isArray(item.rows))throw new Error('Invalid filings collection.');total+=item.rows.length;if(total>50000)throw new Error('Oversized filings collection.');}const documents=state.filings.map(restoreFilingsDocument);if(new Set(documents.map(d=>d.id)).size!==documents.length)throw new Error('Invalid or oversized filings collection.');(state as Record<string,unknown>).filings=documents;}
 if(validateCollections&&state.heatmap!==undefined)(state as Record<string,unknown>).heatmap=restoreHeatmapState(state.heatmap);
 if(validateCollections&&state.portfolio!==undefined)(state as Record<string,unknown>).portfolio=restorePortfolioState(state.portfolio);
 if(validateCollections&&state.marketViews!==undefined)(state as Record<string,unknown>).marketViews=restoreMarketViews(state.marketViews);
 if(validateCollections&&state.calendar!==undefined)(state as Record<string,unknown>).calendar=restoreCalendarState(state.calendar);
 if(state.chartTypeSettings!==undefined)validatedSettingsBook(state.chartTypeSettings as ChartSettingsBook);
 if(state.grid!==undefined){
  const grid=state.grid;if(!object(grid)||grid.schemaVersion!==1||!object(grid.layout)||!object(grid.cells))throw new Error('Invalid chart grid.');
  const layout=grid.layout,preset=LV_LAYOUTS.find(row=>row.id===grid.presetId);if(!preset||!Array.isArray(layout.cells)||layout.cells.length!==preset.count)throw new Error('Chart grid preset does not match its cells.');
  assertGridTracks(grid as {presetId:string;tracks?:unknown});
  const port=createLayoutPort(layout as any);port.dispose();
  // Once drawingUtility exists, layout.sync.drawings is only its mirror (ignored on load, written on save).
  const drawingUtilityState=object(state.drawingUtility)?state.drawingUtility as {syncOn:boolean}:undefined;
  if(drawingUtilityState!==undefined)(state as Record<string,unknown>).grid={...grid,layout:mirrorLayoutDrawingSync(layout as any,resolveDrawingSyncOn(layout as any,drawingUtilityState))};
  if(Object.keys(grid.cells).length>16)throw new Error('Too many saved chart cells.');
  const declaredCells=new Set(layout.cells.map((row:{id:string})=>row.id));if(Object.keys(grid.cells).some(id=>!declaredCells.has(id)))throw new Error('Workspace has chart settings outside the declared layout.');
  const available=workspaceDatasets(state as unknown as ChartWorkspace);
  for(const row of layout.cells){
   const cell=grid.cells[row.id];if(!object(cell)||typeof cell.datasetId!=='string')throw new Error('Missing chart cell settings.');if(cell.viewport!==undefined){if(!object(cell.viewport))throw new Error('Invalid chart viewport.');validateViewport(cell.viewport as any);}
   validateCellSession(cell.session);const supplied=available.find(item=>item.provenance.datasetId===cell.datasetId&&item.instrument.symbol===row.symbol&&item.resolution===row.interval);if(!supplied)throw new Error('Saved chart dataset is unavailable.');const dataset=cellSessionDataset(supplied,cell);
   validateCellDrawingScopes(cell as any,dataset);if(cell.priceScale!==undefined)validatePriceScaleSettings(cell.priceScale);if(cell.seriesHidden!==undefined&&typeof cell.seriesHidden!=='boolean')throw new Error('Invalid main series visibility.');
   if(cell.frame!==undefined){const frame=validateHistoricalFrame(cell.frame);assertHistoricalFrameCompatible(frame,{source:sourceContextForDataset(dataset),style:cell.style,calculationFingerprints:frame.calculationFingerprints});}
   restore({...state,grid:undefined,symbol:row.symbol,sourceId:suppliedSourceId(state as unknown as ChartWorkspace,supplied),scriptBindings:cell.scriptBindings,chartTypeSettings:cell.chartTypeSettings,chartStyle:cell.style,themeId:cell.themeId??state.themeId,appearance:cell.appearance,chartOptions:cell.chartOptions,drawings:cell.drawings,indicators:cell.indicators,comparisons:cell.comparisons},defaults,false);
  }
 }
 if(validateCollections&&(Object.hasOwn(input,'layoutLibrary')||Object.hasOwn(defaults,'layoutLibrary'))){
  const complete=ensureWorkspaceGrid(state as unknown as ChartWorkspace);(state as Record<string,unknown>).grid=complete.grid;
  (state as Record<string,unknown>).layoutLibrary=Object.hasOwn(input,'layoutLibrary')?restoreLayoutLibrary(input.layoutLibrary,complete.grid,grid=>{
   const candidate={...state,grid};restore(candidate,defaults,false);const sources=workspaceDatasets(candidate as unknown as ChartWorkspace);
   for(const cell of Object.values(grid.cells))for(const comparison of cell.comparisons)if(!sources.some(source=>source.provenance.datasetId===comparison.datasetId))throw new Error('A saved layout comparison source is missing: '+comparison.datasetId+'.');
  }):createLayoutLibrary(complete.grid);
  const mirrorUtility=object(state.drawingUtility)?state.drawingUtility as {syncOn:boolean}:undefined,library=(state as Record<string,any>).layoutLibrary;
  if(mirrorUtility!==undefined&&library&&Array.isArray(library.entries))(state as Record<string,unknown>).layoutLibrary={...library,entries:library.entries.map((entry:any)=>({...entry,grid:{...entry.grid,layout:mirrorLayoutDrawingSync(entry.grid.layout,mirrorUtility.syncOn)}}))};
  /* Rebuilt derived intervals are never written (they are saved as recipes), so they are not measured. */
  measureWorkspaceJSON(Array.isArray(state.imports)&&(state.imports as unknown[]).some(isRebuiltDerivedImport)?{...state,imports:(state.imports as unknown[]).filter(row=>!isRebuiltDerivedImport(row))}:state);
 }
 return state as T;
}
