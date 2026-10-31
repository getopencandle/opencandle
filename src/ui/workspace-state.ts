import type {BarDataset} from '../domain/types';
import {EXAMPLE_SYMBOLS} from '../domain/demo-mode';
import type {MultiChartState} from './MultiChartGrid';
import {ensureWorkspaceGrid} from './workspace-grid';
import {createIndicatorLibrary,type IndicatorLibrary} from './indicator-library';
import {createIndicatorTemplates,type IndicatorTemplates} from './indicator-templates';
import {initialDrawingPreferences,type DrawingPreferences} from './drawing-preferences';
import {freshDrawingUtility,type DrawingUtility} from '../chart/drawing-utility-state';
import {mirrorLayoutDrawingSync} from '../chart/layout-port';
import {createWatchBook,type WatchBook} from '../watchlists/model';
import {createWatchAdvancedState,type WatchAdvancedState} from '../watchlists/advanced-data';
import type {ListAlert} from '../domain/watchlist-alerts';
import {createIntervalMenuState,type IntervalMenuState} from '../domain/intervals';
import {createScriptLibrary,type ScriptLibrary,type ScriptBinding,type ScriptDocument} from './script-library';
import {initialScript} from './ScriptPanel';
import {createHeatmapState,type HeatmapState} from '../domain/heatmap';
import {createPortfolioState,type PortfolioState} from '../portfolio/portfolio';
import {defaultMarketViews,type MarketViewsState} from '../market-views/state';
import {createCalendarState,type CalendarState} from '../domain/calendar';
import {createNewsState,type NewsState} from '../analysis-news/news';
import type {FactsDocument} from '../fundamentals/company-facts';
import {createFundamentalsPreferences,type FundamentalsPreferences} from '../fundamentals/preferences';
import type {FilingsDocument} from '../analysis-news/filings';
import {defaultScreener,type ScreenerSettings} from './ScreenerDialog';
import {DEFAULT_STRATEGY_CONFIG,type StrategyConfig} from '../domain/strategy';
import {defaultTheme,type ChartAppearance} from './themes';
import type {ChartSettingsBook} from '../chart/chart-settings';
import type {ChartOptions} from '../chart/navigation';
import type {IndicatorInstanceSettings} from '../chart/indicator-port';
import type {ComparisonSettings} from '../chart/compare-port';
import {createLayoutLibrary,type LayoutLibrary} from './layout-library';
import {defaultChartSettingsDocument,type ChartSettingsDocument} from '../chart/chart-settings-document';

export type ComparisonSnapshot=Omit<ComparisonSettings,'dataset'>&{datasetId:string};
export interface Workspace extends Record<string,unknown>{
 layoutLibrary?:LayoutLibrary;
 /** Live market-data choices (off by default). Never holds a key or bars. */
 liveData?:{coinbase:boolean;alpacaSymbols:string[];alpacaPlan?:'paid'};
 /** App-level preferences (Settings, Data sources tab, Application). Absent means the factory values. */
 appPreferences?:import('./app-preferences').AppPreferences;
 /** Chart type menu favorites (optional, additive; chart-type-favorites.ts). */
 chartTypeFavorites?:string[];
 watchAdvanced?:WatchAdvancedState;
 /** The Advanced View beta benchmark per watchlist (advanced-data.ts restoreWatchBenchmarks). Optional and additive: absent means none chosen. */
 watchBenchmarks?:import('../watchlists/advanced-data').WatchBenchmarks;
 /** List alerts are a separate collection (never AlertDefinition rows). Absent means none; older packages keep the key as a future field. */
 listAlerts?:ListAlert[];
 /** Saved drawing tool defaults (drawing settings Template menu, Save as default). Absent means none saved. */
 drawingToolDefaults?:import('../chart/drawing-tool-defaults').DrawingToolDefaults;
 /** The bottom panel's tab, expanded state and height per saved layout. Absent means the defaults. */
 bottomPanel?:import('./bottom-panel-model').BottomPanelBook;
 /** The paper DOM pane's open state and dragged spot (paper-dom-placement.ts). Absent means closed. */
 paperDomPane?:import('./paper-dom-placement').PaperDomPaneSaved;
 version:1;indicatorTemplates:IndicatorTemplates;indicatorLibrary:IndicatorLibrary;drawingPreferences:DrawingPreferences;drawingFavorites:string[];drawingUtility:DrawingUtility;globalDrawings:Record<string,Record<string,unknown>[]>;drawingAssets?:import('../chart/image-assets').ImageAssetDocument;watchBook:WatchBook;intervals:IntervalMenuState;scriptLibrary:ScriptLibrary;scriptBindings:ScriptBinding[];grid?:MultiChartState;chartTypeSettings?:ChartSettingsBook;
 /** Chart Settings dialog document (rows the appearance does not hold) and its global templates. */
 chartSettings:ChartSettingsDocument;
 heatmap:HeatmapState;portfolio:PortfolioState;marketViews:MarketViewsState;calendar:CalendarState;fundamentals:FactsDocument[];fundamentalsPreferences:FundamentalsPreferences;news:NewsState;filings:FilingsDocument[];
 symbol:string;chartStyle:string;themeId:string;appearance:ChartAppearance;watchlist:string[];drawings:Record<string,unknown>;indicators:(IndicatorInstanceSettings&{paneId:string|null})[];imports:BarDataset[];sourceId:string|null;screener:ScreenerSettings;script:ScriptDocument;strategy:StrategyConfig;chartOptions:ChartOptions;comparisons:ComparisonSnapshot[];
}
/** One factory is shared by launch, reset and own-export recovery tests. */
export function createInitialWorkspace():Workspace{const state=createBaseWorkspace();return{...state,layoutLibrary:createLayoutLibrary(state.grid!)};}
function createBaseWorkspace():Workspace{
 const base=createBaseWorkspaceRaw();
 // Layout.sync.drawings is the mirror of drawingUtility.syncOn (factory: on), so a restored factory workspace is byte-stable.
 return{...base,grid:{...base.grid!,layout:mirrorLayoutDrawingSync(base.grid!.layout,base.drawingUtility.syncOn)}};
}
/** A fresh watchlist holds the five example tickers (BTC, ETH, SPY, GME, AAPL). They show a dash until a live
 * source is set up, then follow it (live-watch.ts adoptLiveWatchSources); generated prices show only on the example screen. */
function createBaseWorkspaceRaw():Workspace{
 return ensureWorkspaceGrid(structuredClone({version:1 as const,watchAdvanced:createWatchAdvancedState(),indicatorTemplates:createIndicatorTemplates(),indicatorLibrary:createIndicatorLibrary(),drawingPreferences:{...initialDrawingPreferences},drawingFavorites:[],drawingUtility:freshDrawingUtility(),globalDrawings:{},watchBook:createWatchBook([...EXAMPLE_SYMBOLS]),intervals:createIntervalMenuState(),scriptLibrary:createScriptLibrary(initialScript),scriptBindings:[],chartTypeSettings:{},chartSettings:defaultChartSettingsDocument(),heatmap:createHeatmapState(),portfolio:createPortfolioState(),marketViews:defaultMarketViews(),calendar:createCalendarState(),fundamentals:[],fundamentalsPreferences:createFundamentalsPreferences(),news:createNewsState(),filings:[],symbol:'GME',chartStyle:'candles',themeId:defaultTheme.id,appearance:defaultTheme.appearance,watchlist:[...EXAMPLE_SYMBOLS],drawings:{version:1,drawings:[]},indicators:[],imports:[],sourceId:null,screener:defaultScreener,script:initialScript,strategy:DEFAULT_STRATEGY_CONFIG,chartOptions:{source:'close' as const,scale:'linear' as const,invert:false,auto:true,timezone:'UTC'},comparisons:[]}));
}
