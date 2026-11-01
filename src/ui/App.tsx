import {applyScriptSettings} from './script-settings-model';
import {CellScriptSettings,chartSurfaceProps} from './CellStudyLegend';
import {ScriptTablesPanel} from './ScriptTablesPanel';
import {createCellStudyIntentQueue,assertCellStudyIntent,builtinStudyFingerprint,scriptStudyFingerprint,type CellStudyIntent} from './cell-study-intents';
import {confirmAnalysisPublication} from './analysis-capture-confirmation';
import {chartHeaderChange,indicatorPlotTextAt} from './data-window-model';
import {replayClippedResolver,replayHistoryClock} from '../chart/indicator-history-lookup';
import {createHeldKeyGate,heldKeyCommand,type HeldKeyCommand} from './held-key-gate';
import {HELD_KEY_STALE} from './held-key-gate';
import {DRAWING_EDIT_WRITE_WAIT,DRAWING_EDIT_STALE,DRAWING_SETTINGS_CLOSED,DRAWING_FAVORITES_STALE,missingDrawingTargets,type DrawingEditTargets} from './drawing-edit-queue';
import type {ObjectTreeEditTargets} from './ObjectTreePanel';
import type {GridDrawingWorkspaceCommand} from './drawing-workspace';
import {measureWorkspaceJSON} from './workspace-json';
import React,{startTransition,useCallback,useDeferredValue,useEffect,useMemo,useRef,useState} from 'react';
import {calculationBarsForStyle,derivedCalculationOptions,type ChartController} from '../chart/adapter';
import {confirmDrawingPublication} from './drawing-capture-confirmation';
import {sourceContextForDataset,chartSourceContextKey,sameChartSourceBasis} from '../chart/source-context';
import type {ChartMenuSnapshot,ChartMenuActionLease,ChartContextActionOptions,RootChartMenuAction} from '../chart/context-menu';
import {barMarksVisibility} from '../chart/context-menu';
import {captureRootChartAction,type RootChartActionOwnership} from './chart-action-ownership';
import {sameDatasetInput,sameDatasetsInput} from '../chart/bar-input-identity';
import {contextPriceTargetError,contextTargetPrice} from '../chart/context-price-target';
import {cellSessionDataset,cellSessionOverride,cellSessionRefusal,rawCellSessionDataset} from '../chart/cell-session';
import {rawSessionDataset,sessionDataset,sessionDatasets,sessionsApply,barIntervalMs,type SessionMode} from '../chart/session-zones';
import {createContextPriceAuthority} from './context-price-ownership';
import type {ContextPriceRequest,ContextPriceOutcome} from './context-price-request';
import type {IndicatorInstanceSettings,IndicatorInstanceView} from '../chart/indicator-port';
import {defaultPlotStyle} from '../chart/indicator-port';
import type {IndicatorId} from '../domain/indicators';
import {groupLegendByPane,indicatorLegendTexts} from '../chart/legend-pane-model';
import {IndicatorTemplatesMenu} from './IndicatorTemplatesMenu';
import {displayExchange,fixtureDataset,fixtureQuote,isDemoPlaceholder,isHiddenDemoSourceId} from '../domain/fixtures';
import {exactGridDataset} from '../chart/grid-analysis-coordinator';
import {demoDataMode,setDemoDataMode,demoSymbolAllowed,EXAMPLE_SYMBOLS,EXAMPLE_DEFAULT_SYMBOL} from '../domain/demo-mode';
import {NeedsLiveCells,ExampleDataBanner,type NeedsLiveCell} from './NeedsLiveData';
import {layoutTabQuote} from './layout-tab-quote';
import type {Bar,BarDataset} from '../domain/types';
import {replayPrefix,setReplayPlaying,type ReplayState} from '../domain/replay';
import {openReplay,selectReplayStart,beginReplayStartSelection,stepReplaySession,setReplaySessionPlaying,setReplaySessionSpeed,advanceReplaySession,setReplaySessionInterval,setReplayScope,jumpReplayToRealtime,closeReplay,continueReplaySession,replayRestoreLayout,replayTimeline,replayChartView,replayShortcut,replayParticipantSupport,replayDrawingApplicability,replayAlertCreation,replayStartCandidate,stepBackReplaySession,replayCanStepBack,startReplayAt,REPLAY_UNSUPPORTED_CHART_TYPES,type ReplayStartPoint,type ReplaySession,type ReplaySavedSession,type ReplayParticipant,type ReplayKeyAction} from '../domain/replay-session';
import {replayIntervalMenu,chooseReplayInterval,resolveReplayStepSource,replayIntervalDivides} from '../domain/replay-intervals';
import {ReplayPanel,ReplayScissors,replayStartLabel} from './ReplayPanel';
import {replayQuickFlatten,replayQuickOrder,replayQuickPosition,replayQuickPrice} from '../domain/replay-quick-trade';
// Dialogs closed at startup load as their own chunks (lazy-surfaces.tsx); the same components under Vitest.
import {KeyboardShortcutsDialog,ChartSettingsDialog,IndicatorDialog,IndicatorTemplatesDialog,LayoutLibraryDialog,DrawingDialog,DrawingManagerDialog,SymbolSearchDialog,QuickSearchDialog,TableViewDialog,IntervalDialog,NotesDialog,WatchlistAdvancedDialog,ImportDialog,HeatmapDialog,PortfolioDialog,MarketViewsDialog,CalendarDialog,FundamentalsDialog,NewsDialog,DateNavigationDialog,SymbolInfoDialog,ComparisonDialog,ListAlertDialog,LazySurfacesPrefetch} from './lazy-surfaces';
import {RailHelpIcon} from './icons';
import {cellReplaySources,cellReplayLayoutFrames,cellReplayLayoutTimeline} from './cell-replay-sessions';
import {replayDefaultScope,replayLayoutParticipants,replayLayoutTimeline,replayLayoutFrames,replayFocusSession,replayFocusView} from '../domain/replay-layout';
import {liveQuotes} from '../domain/live-quotes';
// The live dataset store and the bindings that inject live values into the children that show them.
import {createLiveDatasetStore,liveChangeNeedsAppRender,LiveBookBinding,WatchQuotesBinding,type LiveDatasetMap,type LiveDatasetStore} from './live-dataset-store';
import {createOwnedElementCache,reuseOwnedElement,type OwnedElementCache} from './element-cache';
import {holdWhile,keepLiveIdentity,onceWhile,stableProps,surfaceCaches} from './surface-reuse';
import {rememberedAlpacaAsset} from '../domain/symbol-info';
import {freezeLiveDatasets,pinReplayDatasets,replaySnapshotsFor,replayHoldsLive,adoptLiveSnapshotRevisions,chartAlertObservationEnabled,liveReplayPaperRouting,REPLAY_LIVE_NO_HISTORY,REPLAY_SNAPSHOT_NOTE,type ReplayLiveSnapshots} from '../domain/replay-live-snapshot';
import {DRAWING_TOOL_CATALOG} from './drawing-tool-catalog';
import {type MultiChartState,type MultiChartCellState,type MultiChartTransactionCoordinator,type GridPreparedInput,type GridFrameEditBaseline} from './MultiChartGrid';
import {WorkspaceChartHost,type WorkspaceChartHostController} from './WorkspaceChartHost';
import {ShellTint} from './shell-tint';
import {validatePreparedGridInput} from './grid-prepared-input';
import {prepareGridFrameHistory} from './grid-frame-baseline';
import {createFrameFingerprintCalculator} from './frame-fingerprints';
import {assertHistoricalFrameCompatible,type HistoricalChartFrame} from '../chart/historical-frame';
import {ensureWorkspaceGrid,patchWorkspace,projectGrid,selectedDataset,workspaceDatasets,focusOnlyChange,allChartsDataset,sameWorkspace,suppliedSourceId,stableDatasetUniverse,withDemoSiblings,gridSourceKey,demoDataset,exampleComponentDataset} from './workspace-grid';
import type {ChartSettingsCommit} from '../chart/chart-settings-session';
import {restoreChartSettingsDocument} from '../chart/chart-settings-document';
import {validatePriceScaleSettings,type PriceScaleSettings} from '../chart/price-scale-state';
import {validateChartOptions} from '../chart/navigation';
import type {IndicatorDetachedAction} from './IndicatorDialog';
import {createIndicatorLibrary,indicatorEditFingerprint,toggleIndicatorFavorite,type IndicatorLibrary} from './indicator-library';
import {createIndicatorTemplates,restoreIndicatorTemplates,templateSource,type IndicatorTemplate,type IndicatorTemplates} from './indicator-templates';
import type {TemplateCapture,TemplateApplyPreview} from './IndicatorTemplatesDialog';
import {prepareTemplateApplication} from './template-application';
import {createWorkspaceHistory,restoredHistoryReplay,historicalChartWorkspace,historyKeepsActiveSource,changedChartGrid,keepCurrentViewports,openHistorySession} from './workspace-history';
import {switchLayoutHistory,forgetLayoutHistory,forgetLayoutHistories} from './layout-history-stash';
import {activeSavedLayout,layoutIsDirty,prepareLayoutSave,renameSavedLayout,favoriteSavedLayout,deleteSavedLayout,duplicateSavedLayout,openedLayout} from './layout-library';
import type {LayoutLibraryAction} from './LayoutLibraryDialog';
import {exportLayoutText,previewLayoutText,type LayoutFile} from './layout-transfer';
import {createMultiChartState} from './MultiChartGrid';
import {isDerivedStyle} from '../chart/derived/common';
import {strategyReportRows} from '../strategy-report/derived-rows';
import {commitLayoutReceipt} from './layout-save-transaction';
import {ownedCallbacks} from './owned-callbacks';
import {prepareWorkspaceJSON} from './workspace-json';
import {createFinancialPublicationGuard} from './financial-publication';
import {routeDrawingDialogTab,drawingDialogEntryTab} from './drawing-dialog-route';
import {BarsPatternResolutionChip,type BarsPatternData} from './BarsPatternSource';
import {barsPatternSpanFetcher} from '../chart/lv-types/bars-pattern-resample';
import {setProfileDatasets} from '../chart/vp-visible-range-ltf';
import {LV_BARS_PATTERN} from '../chart/lv-types/bars-pattern';
import {finishInlineDialogTransfer} from './inline-dialog-transfer';
import {DrawingTools} from './DrawingTools';
import {DrawingToolbar} from './DrawingToolbar';
import {DemonstrationOverlay} from './DemonstrationOverlay';
import {createCursorKindController,type CursorKind} from '../chart/cursor-kind';
import {createImageAssetStore} from '../chart/image-assets';
import {DRAWING_ASSETS_MESSAGES,LV_IMAGE,connectDrawingAssets,createDrawingAssetsController,createImageDrawingRecord} from '../chart/lv-types/image';
import {captureDrawingFavoriteRequest,drawingFavoriteOwnerCurrent,type DrawingFavoriteOwner} from './drawing-favorites';
import type {DrawingMode} from './drawing-toolbar-model';
import {quickSearchIndex,type QuickSearchItem} from './quick-search-model';
import {commandMenuRows,MAIN_MENU_LAYOUT,type AppCommandId,type CommandRuns} from './command-registry';
import {keyboardShortcutRows} from './keyboard-shortcuts';
import {dataWindowIndicators} from './DataWindowPanel';
// The Data window follows the hovered grid cell; the legend follows a synced crosshair.
import {gridHoverStore,legendGhostTime,syncedLegendInspection,useGridHoverRender} from './grid-hover';
import {HoverSlot,SettledHoverSlot} from './grid-hover';
import {LockedTimeLine} from './LockedTimeLine';
import {cursorTimeLock} from './cursor-time-lock';
import {copyPlainText} from './text-clipboard';
import {copyPriceText,BarMarksGate,publishChartMenuCounts} from './ChartContextMenu';
import {ChartNavigationButtons} from './ChartNavigationButtons';
import {setAlertSoundVolume} from './alert-sound';
import {setAlertDisplayClock} from './alert-time';
import {isProfileIndicator} from '../domain/indicator-selector-catalog';
import {intervalMenuEntries} from '../domain/intervals';
import {SymbolMathProvider,SYMBOL_MATH_PROVIDER_ID,staticComponentHandle,derivedPaperRefusal,isSymbolMathDatasetId} from '../domain/symbol-math-live';
import {isSymbolMathText,symbolMathComponentSource} from '../domain/symbol-math';
import {leasedAlertSecondSymbolKeys,notifySecondSymbols,setSecondSymbolLoader} from '../domain/second-symbol';
import {alertSecondSymbolDemand} from '../domain/second-symbol-alerts';
import {secondSymbolDemand} from './second-symbol-demand';
import {alpacaAssetCandidates,buildSymbolSearchCandidates,linkedSymbolTargets,liveTypedCandidates,symbolMathCandidates,readRecentSymbols,rememberDepartedSymbol,rememberRecentSymbol,resolveSymbolEntry,symbolEntryBlocked,watchTypeToAddSeed,symbolEntryFromKey,switchRequest,type SymbolSearchOrigin,type SymbolSwitchRequest} from './symbol-search';
import {importCommitMessage} from '../domain/data-setup';
import {IntervalMenu,IntervalMenuPrewarm} from './IntervalMenu';
import {shortIntervalText} from './interval-display';
import {intervalToolbar,currentIntervalId} from './interval-toolbar';
import {SnapshotMenu} from './SnapshotMenu';
import {snapshotFileName} from './top-toolbar-model';
import {createIntervalMenuState,chooseIntervalSource,editIntervalMenu,intervalEntrySeed,sortIntervalIds,submitIntervalEntry,type IntervalMenuState,type IntervalSuccess} from '../domain/intervals';
import {resolveIntervalSwitch} from '../domain/interval-switch';
import {IntervalEntry} from './IntervalEntry';
import {chartIntervalText,looksLikeRangeInterval,parseRangeInterval,rangeSizeOf,submitChartIntervalEntry,withRangeSize} from '../chart/range-interval';
import {rangeSizeRefusal} from '../chart/derived/range';
import type {BottomRange} from '../chart/bottom-toolbar';
import {selectWorkspaceInterval} from './workspace-intervals';
import {WatchlistPanel} from './WatchlistPanel';
import {DetailSourcesProvider} from '../fundamentals/detail-sources';
import {advancedSourceKey,createWatchBenchmarks,setWatchBenchmark,type WatchAdvancedState} from '../watchlists/advanced';
import {forgetStrategyRunsOnInput,recalledStrategyRun,rememberStrategyRun,strategyChoices} from '../strategy-report/strategy-chooser';
import {restoreNoteMarket,noteMarketKey,notesTargetForContext,type NoteMarket,type NotesContextTarget} from '../watchlists/notes';
import {initialDrawingPreferences,restoreDrawingPreferences,reconcileDrawingPreferences,applyDrawingPreferenceChange,type DrawingPreferences} from './drawing-preferences';
import {activeWatchList,addWatchList,addWatchSymbols,createWatchBook,referenceFromDataset,selectWatchList,watchSymbols,WATCH_LIMITS,type WatchBook} from '../watchlists/model';
import {addWatchMembers,isWatchMember,setWatchFlags,watchFlagOf,watchListChoices,watchReferenceForDataset} from '../watchlists/membership';
import {validateWatchListName} from '../watchlists/menus';
import {stepWatchSymbol} from '../watchlists/gestures';
import {classifyWorkspaceKey,scriptEditorOwnsKey} from './shortcut-dispatch';
import {legendRowMenuProps} from './legend-row-menu';
import {runKeyNavigation,type ExtraKeyAction} from './shortcut-dispatch';
import {BOTTOM_RANGES,BOTTOM_SESSION,fitRangeInterval,fittedBottomRange,servedBottomRange} from '../chart/bottom-toolbar';
import {classifyPaperShortcut,PAPER_SHORTCUT_NO_PRESET_MESSAGE} from './paper-shortcuts';
import {ChartTypeMenu} from './ChartTypeMenu';
import {ScrollToLatestButton,scrollToLatestNow} from './ScrollToLatestButton';
import {indicatorSettingsFocus} from './indicator-settings-route';
import {previousSessionClose} from '../chart/previous-session-close';
import {HeaderSymbolButton} from './HeaderSymbolButton';
import {layoutMenuView,type LayoutMenuState} from './layout-menu';
import {ScreenerDialog,defaultScreener,type ScreenerSettings} from './ScreenerDialog';
import {initialScript,type ScriptDocument} from './ScriptPanel';
import {ScriptLibraryPanel,type ScriptDraftHandle} from './ScriptLibraryPanel';
import {scriptExecutionIdentity} from './script-input';
import {createScriptLibrary,draftScript,selectScript,restoreScriptBindings,type ScriptLibrary,type ScriptBinding} from './script-library';
import {BUILTIN_STRATEGY_SELECTOR_ROWS} from '../domain/builtin-strategies/catalog';
import {addBuiltinStrategyBinding} from '../strategy-report/builtin-strategy-add';
import {StrategyTradeMarks} from '../chart/strategy-marks-view';
import {strategyMarkStore,strategyTradeJumpTime} from '../chart/strategy-marks';
import type {ScriptBindingExecution} from './script-binding-runtime';
import {createDatasetRequestResolver,installScriptRequestResolver,installScriptSymbolLoader,leasedScriptRequestKeys,notifyScriptRequestData,scriptRequestBase} from './script-requests';
import {scriptRequestDemand} from './script-request-demand';
import {createLayoutReplayStash,switchLayoutReplay,layoutReplayNote,carriedReplayPaper} from './layout-replay-stash';
import {carryReplayPaper,recordReplayPaper,type ReplayPaperLedger} from './replay-paper-carry';
import {createWarmLayoutFeeds,leaveWarmLayout,warmFeedIds,warmAlpacaSymbol,forgetWarmLayout,forgetWarmLayouts,scheduleWarmSweep,stopWarmSweep} from './layout-tabs-warm';
import {ScriptLegendRows} from './ScriptSettingsDialog';
import {groupActiveStudyPaneRows,type ScriptLegendOwnedRow,type ActiveLegendNode} from './active-study-pane-rows';
import {activeScriptLegendPosition} from './script-legend-readout';
import {StrategyDialog,type StrategyExecution} from './StrategyDialog';
import {BottomPanel} from './BottomPanel';
import {bottomPanelLayoutId,bottomPanelTabsFor,bottomPanelView,collapseBottomPanel,mountedBottomTabs,nextVisitedTabs,openBottomTab,sameBottomPanelView,selectBottomTab,withBottomPanelView,type BottomPanelTab,type BottomPanelView} from './bottom-panel-model';
import {DEFAULT_STRATEGY_CONFIG,strategyChartTypeForStyle,type StrategyConfig} from '../domain/strategy';
import {publishConfigurationEdit} from '../chart/configuration-edit';
import type {ChartSettingsTabId} from '../chart/chart-settings-facts';
import {tpoMergeChoiceAt} from '../chart/tpo-merge-menu';
import {createCalendarState,type CalendarState} from '../domain/calendar';
import {createHeatmapState,type HeatmapState} from '../domain/heatmap';
import {validateTypeSettings,validatedSettingsBook,type ChartSettingsBook} from '../chart/chart-settings';
import {matchingInspection} from './inspection-guard';
import type {ChartOptions} from '../chart/navigation';
import {createPaperAccount,restorePaperAccount,modifyPaperOrder,cancelPaperOrder,closePaperPosition,reversePaperPosition,configurePaperAccount,type PaperAccount,type PaperResult} from '../domain/paper';
import {documentWithAccountOneClick,oneClickChangeOf,oneClickStatus} from './paper-one-click-link';
import {restoreLocalAlerts,type LocalAlert} from '../domain/alerts';
import {PaperPanel} from './PaperPanel';
import type {PaperManager,PaperPresetSeed} from './PaperPanel';
import {PaperTradingDock,paperDockSummary} from './PaperTradingDock';
import {PaperOrderTicket} from './PaperOrderTicket';
import {registerToast} from './toast-escape';
import {applyPaperExitDrag,attachPaperExitDrag} from '../domain/paper-exit-drag';
import {PaperChartLines,paperChartLines,type PaperPriceProjection,type PaperOrderChange} from './PaperChartLines';
import {PaperTradingToasts} from './PaperTradingToasts';
import {paintPaperSnapshot} from '../chart/paper-snapshot';
import {paintChartSnapshotScene} from '../chart/snapshot-painter';
import {snapshotSourceKey,snapshotSeriesKey,snapshotInspectionKey,assertSnapshotCurrent,requireSnapshotScene,captureSnapshotGuard} from '../chart/snapshot-scene';
import {watermarkView} from '../chart/chart-watermark';
import {SnapshotLegendPublisher} from './SnapshotLegendPublisher';
import {ActiveSeriesHeadingPlacement} from './CellSeriesHeading';
import {PaneIndicatorLayer,PaneLegendMenu} from './PaneIndicatorLayer';
import type {ChartExportFrame} from '../chart/image-export';
import {ChartTradingButtons} from './ChartTradingButtons';
import {oneClickPriceOrder} from './one-click-price-order';
import {copyChartImage} from './chart-image-copy';
import {toggleAppFullScreen} from './window-fullscreen';
import {harnessImageFile,loadHarnessImage} from './image-harness';
import {contextPriceLabel} from './context-price-request';
import {feedPaperBars,type PaperFormingSnapshot} from '../domain/paper-bar-feed';
import {sweepPaperExpiry} from '../domain/paper-expiry-sweep';
import {relayedFeedInput,relayedFeedSymbol,relayedInstrumentFedElsewhere,relayedTicketQuote} from './paper-relay-quote';
import {feedPaperSymbols,paperBackgroundInputs,paperBackgroundSymbols} from '../domain/paper-multi-feed';
import {paperActionQuote} from '../domain/paper-quote';
import {paperInstrumentKey} from '../domain/paper-brackets';
import {paperFeedInput,paperFineFeedSymbol,PAPER_FINE_RESOLUTION} from '../domain/paper-feed-source';
import {paperDurableKey,autosaveDelay} from '../domain/paper-autosave';
import {guardPaperState,guardPaperStorage,type PaperBook,type PaperState} from '../domain/paper-book';
import {placePaperPreset,presetSummary} from '../domain/paper-presets';
import {WorkspaceAlerts} from './WorkspaceAlerts';
import {CompoundAlertBook,compoundAlertBookFor,type CompoundBookChange} from './compound-alert-book';
import {WorkspaceCompoundAlerts} from './WorkspaceCompoundAlerts';
import {CompoundAlertDeliveryHost} from './CompoundAlertDeliveryHost';
import {AlertPopupRack} from './AlertPopupRack';
import {captureCompoundWorkspaceSave,assertCompoundWorkspaceShareable,prepareCompoundWorkspaceAdoption} from './compound-workspace-storage';
import {Modal} from './Modal';
import {RightPanelSplitter} from './RightPanelSplitter';
import type {AlpacaSettingsBridge} from './LiveDataSettings';
import {DataSourcesPanel} from './data-sources-panel';
import {ClockedAppPreferencesSection} from './AppPreferencesSection';
import type {FredCacheBridge} from './FredCacheSection';
import type {DataSourceSettingsBridge} from '../domain/data-source-settings';
import {openPaperDomPane,PAPER_DOM_PANE_NO_HOST,paperDomPaneHosted,paperDomPaneState} from './paper-dom-pane';
import {setPaperDomPanePlacement} from './PaperDomPane';
import {appUpdateBatch} from './app-update-batch';
/** Dialogs opened from the right rail, which stays above their shade so its button toggles them. */
const RAIL_DIALOGS:ReadonlySet<string>=new Set(['screener','calendar','news','fundamentals','heatmap','markets','portfolio']);
/** An unchanged background alert plan keeps its identity (the watcher publishes a new object on every sync). */
const sameBackgroundPlan=(a:unknown,b:unknown)=>{try{return JSON.stringify(a)===JSON.stringify(b);}catch{return false;}};
import {paperDomPaneOf,samePaperDomPane,type PaperDomPaneSaved} from './paper-dom-placement';
/** App instances (their workspace ref) that already reopened a saved DOM pane. */
const paperDomReopened=new WeakSet<object>();
import {fredSearchDatasets,fredDatasetId,FRED_PROVIDER_ID,FRED_RESOLUTION} from '../domain/fred';
import type {SymbolSearchCandidate} from './symbol-search';
/* OpenCandle has no remote-requests switch yet; FRED loads only when the owner opens a series. */
const FRED_INTERVAL_NOTICE='FRED series are daily data (1D) only.';
/** Typed FRED rows. A series is downloaded only when opened, so its row is openable before it is registered. */
function fredCandidates(query:string):SymbolSearchCandidate[]{return buildSymbolSearchCandidates(fredSearchDatasets(query),[]).map(row=>({...row,sourceId:row.datasetId,openable:true,unavailableReason:null}));}
/** The legend's layout inputs. A symbol or interval switch hands every indicator view new data counts only, which never
 * move the legend, so App's legend-bottom measurement (a forced layout inside the switch) is skipped for it. PaneIndicatorLayer
 * still re-measures on its own size observers. */
function legendLayoutKey(views:readonly IndicatorInstanceView[]):string{return JSON.stringify(views.map(({informationBars:_bars,latestInformationTime:_time,...rest})=>rest));}
/** The newest FRED open request (module scope keeps App's pinned hook order). An older answer is dropped. */
let fredOpenToken:object|null=null;
type LiveReopenEntry=Parameters<typeof reopenFredCharts>[1][number];
import type {MarketDataCacheBridge} from './MarketDataCacheSection';
import {CoinbaseLiveProvider,coinbaseSearchDatasets,COINBASE_PROVIDER_ID,type CoinbaseBridge} from '../domain/coinbase-live';
import {readSyntheticMarketClock,syntheticMarketClockLabel,type SyntheticMarketClock} from '../domain/synthetic-market-clock';
import {AlpacaLiveProvider,alpacaSearchDatasets,ALPACA_SYMBOL,ALPACA_IEX_PROVIDER_ID,ALPACA_SIP_PROVIDER_ID,ALPACA_STUB_PROVIDER_ID,ALPACA_CAP_MESSAGE,preferAlpacaDailySession,preferAlpacaDataPlan,preferAlpacaDividendAdjustment,selectAlpacaSyntheticStub,type AlpacaBridge} from '../domain/alpaca-live';
import {isFormingLiveDataset,isLiveDatasetId,isLiveProviderId,personalUseNote,type LiveHandle} from '../domain/live-provider';
import {registerLiveDataset,unregisterLiveDataset,clearLiveDatasets,publishLiveDataset,liveDatasetById} from './live-registry';
import {liveHoldGateFor} from './live-hold-gate';
import {holdLiveHistory,liveAlertBars,liveAlertView,liveHistoryState,requestLiveHistory} from '../domain/live-history';
import {sameBarsInput,barInputIdentity} from '../chart/bar-input-identity';
/** App-level live state (heading, legend, data window, alerts) updates at most about once per second. */
const LIVE_UI_INTERVAL_MS=1000;
/** Heading badge. Alpaca says "Market closed" outside US trading hours; otherwise a stale or
 * connecting feed says Delayed or Connecting, never LIVE. */
// The chart heading badge and title (headingLiveLabel moved there unchanged; derived charts name their components).
import {chartHeadingLabels} from './chart-heading-label';
import {sourceCoverageNote} from '../domain/source-tag';
import {parseStartupOpenSymbol,decideStartupOpen,statusToastAction,parseStartupOpenSymbols,resolveStartupSymbols,decideStartupOpenMany,buildStartupLiveGrid,mergeStreamSymbols,STARTUP_OPEN_FLAG,STARTUP_OPEN_SYMBOLS_FLAG,STARTUP_OPEN_INTERVAL,type StartupSymbol} from './startup-open';
import {liveDataOf,restoreLiveData,persistableWorkspace,gridReferencesDataset,liveSiblings,reconnectLiveCharts,ALPACA_KEY_WAIT_MESSAGE,liveChartPlaceholder,liveRefOfDatasetId,liveRefDependsOn,moveSourceChartsOff,openFredSymbol,reopenFredCharts} from './live-workspace';
import {AboutDialog,larryVisionLogo} from './AboutDialog';
import {lastCloseFor,priceBarsFor} from '../fundamentals/price-feed';
import {createSummaryMemo} from '../fundamentals/symbol-summary';
import {resolveFilingCutoff,utcToday,type FundamentalsMarket} from '../fundamentals/preferences';
import {indicatorInstanceLabels,indicatorAcronyms,indicatorNames,indicatorDataStatus} from './indicator-dialog-model';
import {createNewsState,type NewsState} from '../analysis-news/news';
import type {FilingsDocument} from '../analysis-news/filings';
import type {FactsDocument} from '../fundamentals/company-facts';
import type {Inspection} from './DataWindow';
import {ObjectTreeDataWindowWidget,type ObjectTreeWidgetTab} from './ObjectTreePanelWidget';
import {studyMoveTarget} from './ObjectTreePanel';
import {studyOnPricePane,finishNewPaneAbove,canPlacePaneAbovePrice} from '../chart/pane-actions';
import {statusLineParts,statusLinePriceFormat} from '../chart/status-line-model';
import {AVWAP_UNANCHORED_MESSAGE,anchorTextAt,anchorZoneOf} from '../domain/indicators-ext/vwap-session-catalog';
import {sourcePivotCalendar} from '../domain/indicators-ext/r23-catalog';
import {legendButtons,legendMoreMenu,LEGEND_TOGGLER_QA_ID,indicatorClipboard,indicatorCopiedMessage,indicatorPasteSettings,indicatorOrderAfter,indicatorOrderState,indicatorVisualOrderAvailable,isIndicatorOrderStep,isIndicatorPermutation,visualOrderItems,type IndicatorClip,type LegendMoreItemId} from '../chart/legend-model';
import {indicatorLegendArguments} from '../chart/indicator-display';
import {readIndicatorScalePlacement,indicatorScaleSides} from '../chart/indicator-scale';
import {indicatorPlotIds} from '../chart/indicator-settings';
import {pinToScaleMenu,pinToScalePlacement} from './object-tree-model';
import {statusLineLead,statusLineValues,statusLineBackground,legendButtonView,legendMoreMenuView,legendValuesView,legendPaneView,indicatorReasonView,type LegendSubmenuItem} from './indicator-legend-view';
import {templateIdentityEffect} from './template-application';
import {applyTemplateIdentityEffect} from './template-identity-host';
import {finishIndicatorMove} from './indicator-move-route';
import {indicatorMoveChoices,existingPaneTarget,type IndicatorMoveWhere} from './indicator-move-targets';
import './indicator-legend.css';
import {removeObjectsAsOneStep} from './object-tree-removal';
import {DrawingUtilityBlock,type UtilityMenuName} from './DrawingUtilityBlock';
import {recordGlobalDrawingEdits,applyGlobalDrawings} from '../chart/drawing-global-sync';
import {setIndicatorSnap} from '../chart/drawing-snap';
import {planRemove,removeCountsFor,selectHideMode,selectLockMode,selectSyncMode,toggleHide,toggleLock,toggleSync,toggleRemoveLocked,type DrawingUtility} from '../chart/drawing-utility-state';
import {clipboardKeyDispatcher} from '../chart/drawing-command-router';
import {clipboardMessage} from '../chart/drawing-object-clipboard';
import {loadSharedToolDefaults,withToolDefault,captureToolDefault} from '../chart/drawing-tool-defaults';
import {openLayoutLibraryEntry} from '../chart/layout-port';
// Layout tabs; a tab switch reopens the layout's live feeds.
import {layoutTabFeeds,useLayoutTabs} from './LayoutTabs';
import {useWickMode} from './wick-mode';
import {currentWindowMode,secondaryWorkspace,replaceRelayedLayout,relayLayoutSave,secondaryMenu,useWindowRelay,PRIMARY_ONLY_DIALOGS,PRIMARY_ONLY_PANELS,SECONDARY_WINDOW_NOTICE,SECONDARY_LAYOUT_REFUSAL,SECONDARY_MISSING_LAYOUT,OPEN_ELSEWHERE_MESSAGE,sharedWorkspaceOf,sharedWorkspaceChanges,applySharedWorkspace,closeNeedsPrompt,CLOSE_PROMPT_TEXT,relayedPaperRequest,type SharedWorkspace} from './window-mode';
import {liveTabGrid} from './layout-tabs-live';
import {restoreWorkspace} from './workspace-validation';
/** How long saved live charts wait for main's Alpaca key status on startup. */
const ALPACA_KEY_STATUS_WAIT_MS=8000;
import {StorageDialog} from './StorageDialog';
import {appPreferencesOf,liveOpenTimezone,newChartTimezone,type AppPreferences} from './app-preferences';
import {chartTimeZone,formatChartDateTime} from './chart-time-text';
import {assertStartupStorageAvailable,assertStartupEditable,type WorkspaceStartup} from './workspace-startup';
import {WorkspaceRestoreDialog,type WorkspaceRestorePreview} from './WorkspaceRestoreDialog';
import {prepareWorkspaceReplacement,prepareWorkspaceData} from './workspace-transfer';
import {chartExportBasename,chartSourceCsv,chartSourceTermsLabel,chartCsvSavedMessage} from './chart-source-export';
import {allIndicatorsFileName,allIndicatorsWorkbook,chartIndicatorOptions,computeAllIndicators,drawingExportRows,ALL_INDICATORS_EXPORT_LIMIT} from './all-indicators-export';
import {captureChartCsvColumns} from '../chart/chart-csv-capture';
import {followLiveComparisons} from './comparison-live-follow';
import {MagnetControl} from './MagnetControl';
import type {ComparisonSettings} from '../chart/compare-port';
import {createInitialWorkspace,createFirstRunWorkspace,type Workspace,type ComparisonSnapshot} from './workspace-state';
import {isFreshProfile,firstRunVerdict,FIRST_RUN_PRODUCT,FIRST_RUN_INTERVAL,FIRST_RUN_EXAMPLE_SYMBOL,FIRST_RUN_OPEN_WAIT_MS,FIRST_RUN_LIVE_WAIT_MS,FIRST_RUN_DATASET_ID,FIRST_RUN_LIVE_MESSAGE,FIRST_RUN_FALLBACK_MESSAGE,FIRST_RUN_BANNER_TEXT,FIRST_RUN_RETRY_LABEL,type FirstRunPhase} from './first-run';
import {defaultTheme,normalizeAppearance,serializeAppearance,lvDarkChartExtras,type ChartAppearance} from './themes';
import type {AlertCreateRequest} from './AlertDialog';
import {BackgroundAlertFeeds} from './BackgroundAlertFeeds';
import {AlertsDock,AlertsUnreadCounter,isoMinute} from './AlertsDock';
import {listAlertLogEntries} from './alerts-dock-model';
import {AlertChartLines} from './AlertChartLines';
// Floating order tickets, execution marks, one axis tag layout, main series visibility.
import {FloatingPanel} from './FloatingPanel';
import {PaperExecutionMarks,paperExecutionMarksFor} from './PaperExecutionMarks';
import {ChartEventMarkers,loadChartEvents} from './ChartEventMarkers';
import {CalendarChartMarkers} from './CalendarChartMarkers';
import {NewsChartMarkers} from './NewsChartMarkers';// Latest-news markers and news notifications
import {calendarMarkerSettings} from '../domain/calendar-chart-markers';
import {rememberVwapEventDates,rememberVwapEarningsDates,vwapEarningsDatesFromCalendar} from '../domain/vwap-event-anchors';
import {savedDrawingsForInstrument} from './saved-drawing-lookup';
import {alertDrawingNotesForOwner} from './alert-drawing-note-cache';
import {VwapEventReach} from './VwapEventReach';
import {DrawingAlertCleanup} from './DrawingAlertCleanup';
import {chartEventSymbol} from '../domain/chart-events';
import {createAxisTagBoard,type AxisTagHost} from '../chart/axis-tag-board';
import {activeSeriesHidden,seriesLegendEye,withActiveSeriesVisible} from './series-visibility';
import {seriesMoreMenu,seriesMetricsItems,seriesMoveToItems,seriesPinToScaleItems,seriesWatchlistItems,SERIES_MORE_COMMANDS,SERIES_METRICS_COMMANDS,SERIES_SUBMENU_ROWS,SERIES_REASONS,CREATE_LIST_ITEM,LIST_ITEM_PREFIX,type SeriesMoreItemId,type SeriesAvailability} from './series-legend-menu';
import {paperExtendedHoursDefault} from './PaperPanel';
import {repriceAlert} from './alert-line-drag';
import {alertLineRows} from '../chart/alert-lines-data';
import {alertDatasetKey} from '../domain/alert-observation';
import type {BackgroundFeed,BackgroundPlan} from './background-alert-plan';
import {LIST_ALERT_LIMITS,clearListAlertHistory,restartListAlert,setListAlertPaused} from '../domain/watchlist-alerts';
import {ListAlertsGroup} from './ListAlertsGroup';
import {planWatchFeeds,watchQuoteDatasets,adoptDerivedWatchLabels,adoptLiveWatchSources,cryptoProductFor,parseWatchLiveId,liveOpenTargetFor,type WatchFeed,type WatchRowNote} from '../watchlists/live-watch';
/** The source universe that panels, search and the watchlist show: without the hidden-demo placeholders (no bars)
 * that only keep a saved chart resolving. The chart host still reads the full universe. One filtered copy per universe. */
const shownUniverses=new WeakMap<readonly BarDataset[],BarDataset[]>();
/** The windows (by their workspace ref) that already opened their live chart at start. */
const startLiveOpened=new WeakSet<object>();
function shownUniverseOf(universe:BarDataset[]):BarDataset[]{if(!universe.some(isDemoPlaceholder))return universe;let shown=shownUniverses.get(universe);if(!shown){shown=universe.filter(row=>!isDemoPlaceholder(row));shownUniverses.set(universe,shown);}return shown;}
import {WatchFeedHost,liveListAlertStep} from './background-watch-feeds';
import {announceAlertDeliveries} from './alert-delivery-host';
import {shellMenu,rightRail,nextRailPanel,focusFirstMenuItem,type RailPanelSlot,type RailActionSlot,type ShellMenuItem} from './shell';
import {DrawingEditBar} from './drawing-edit-bar';
import {editBarButtons,editBarRead,editBarSyncScope,editBarSyncChange,editBarTemplateRows,editBarUsesBulk} from './drawing-edit-bar-model';
import {defaultTemplatePatch,drawingDialogTitle} from './drawing-dialog-model';
import {errorDetails,friendlyError,stripErrorPrefix} from './user-error';
import {MultiSelectionBar} from './multi-selection-bar';
import {ChartBottomToolbar,lazyServedRows} from './bottom-toolbar';
import {StartupDeferred} from './StartupDeferred';
import {ComparisonLegendRows} from './ComparisonLegendRows';
import {placeToast} from './toast-placement';
import {SearchIcon,CompareIcon,IndicatorsIcon,IndicatorTemplatesIcon,AlertIcon,ReplayIcon,UndoIcon,RedoIcon,LayoutSetupIcon,ChevronDownIcon,QuickSearchIcon,SettingsIcon,FullscreenIcon,SnapshotIcon,GoToDateIcon,MagnetIcon,KeepDrawingIcon,InfoIcon,ImportIcon,ExportIcon,StorageIcon,ChevronFlyoutIcon,RailWatchlistIcon,RailObjectTreeIcon,RailAlertsIcon,RailScreenerIcon,RailScriptEditorIcon,RailCalendarIcon,RailNewsIcon,RailFundamentalsIcon,RailMarketsIcon,RailPortfolioIcon,RailHeatmapIcon,RailStrategyIcon,RailPaperTradingIcon} from './icons';

const initial=createInitialWorkspace();
/** The active cell leaves Range for Candles. Its saved view is in Range bar time (a synthetic axis), so the
 * viewport and manual frame are dropped (auto scale), as an incompatible source change does; reusing them failed the next
 * frame gesture with an unsupported topology. */
/** CSV export readiness wait and the notice shown when the chart changed under the export. */
const CSV_SETTLE_MS=3000,CSV_RETRY_NOTICE='Chart data was still updating, so nothing was exported. Export chart data again.';
function gridLeavingRange(grid:MultiChartState):MultiChartState{const id=grid.layout.activeCellId,{frame:_frame,viewport:_viewport,...cell}=grid.cells[id];return{...grid,cells:{...grid.cells,[id]:{...cell,style:'candles',chartOptions:{...cell.chartOptions,auto:true}}}};}
/** A chart whose saved frame held a manual price range that this change drops says so in
 * plain words. A dropped frame without a manual range (pane sizes only, the usual case when adding an indicator) is silent. */
function frameResetNotice(before:Workspace,after:Workspace):string{const manual=(frame:MultiChartCellState['frame'])=>!!frame&&(frame.panes.some(pane=>pane.manualRange)||frame.independent.some(row=>row.manualRange));const count=Object.keys(after.grid?.cells??{}).filter(id=>manual(before.grid?.cells[id]?.frame)&&!after.grid!.cells[id].frame&&after.grid!.cells[id].chartOptions.auto!==false).length;return count?'The price scale went back to auto because the chart changed.':'';}
const styles=[['candles','Candles'],['hollow','Hollow candles'],['bars','Bars'],['hlcbars','HLC bars'],['line','Line'],['area','Area'],['baseline','Baseline'],['heikinashi','Heikin Ashi'],['columns','Columns'],['highlow','High-low'],['linemarkers','Line with markers'],['step','Step line'],['hlcarea','HLC area'],['volumecandles','Volume candles'],['renko','Renko'],['linebreak','Line break'],['kagi','Kagi'],['pointfigure','Point & figure'],['range','Range'],['tpo','Time price opportunity'],['sessionvp','Session volume profile']];
// Volume footprint has its own menu place and is enabled (src/chart/footprint.ts). Session volume profile is enabled.
const chartTypes:{value:string;label:string;disabled?:boolean;reason?:string}[]=[...styles.map(([value,label])=>({value,label})),{value:'footprint',label:'Volume footprint'}];
/** The recent-symbol store (local storage, a per-computer convenience); null when the page has none or blocks it. */
function recentStorage(){try{return globalThis.localStorage??null;}catch{return null;}}
/** Replay participants from the chart grid: cell id, symbol, interval, the exact source and revision, and the cell's chart type. */
function replayParticipantsOf(ws:Workspace,datasets:readonly BarDataset[]):ReplayParticipant[]{const grid=ws.grid;if(!grid)return[];return grid.layout.cells.flatMap(row=>{const cell=grid.cells[row.id],data=cell?datasets.find(item=>item.provenance.datasetId===cell.datasetId&&item.instrument.symbol===row.symbol&&item.resolution===row.interval):undefined;return cell&&data?[{cellId:row.id,instrumentId:data.instrument.id,symbol:row.symbol,interval:row.interval,chartType:cell.style??ws.chartStyle,datasetId:data.provenance.datasetId,revision:data.provenance.revision}]:[];});}
/** The replay-interval series of the same instrument when it is finer than the chart (it forms the chart's current bar step by step), else null. */
/** VWAP event and earnings dates reach a chart only through this recalculation. A chart whose every
 * indicator is a bars-and-inputs built-in on its own timeframe (none reads those dates) on a non-derived chart type would
 * recalculate identical values, so it is skipped; any other chart, or a port without the check, recalculates as before. */
const VWAP_DATE_FREE_KINDS:readonly string[]=Object.freeze(['sma','ema','rsi','macd','volume','bb','obv','atr','stochastic']);
function recomputeForVwapDates(chart:ChartController|null){try{if(!chart)return;const port=chart.indicators as typeof chart.indicators&{kindsWithin?:(kinds:readonly string[])=>boolean};if(port.kindsWithin?.(VWAP_DATE_FREE_KINDS)===true&&!isDerivedStyle(chart.getStyle()))return;chart.indicators.recompute();}catch{/* a retired chart recalculates on its next update */}}
function replayStepSourceOf(interval:string|null,chart:BarDataset,datasets:readonly BarDataset[]):BarDataset|null{if(!interval||interval===chart.resolution)return null;try{const step=resolveReplayStepSource(datasets,chart.instrument.id,interval);return step.ok&&step.dataset!==chart&&step.dataset.resolution!==chart.resolution&&replayIntervalDivides(step.dataset.resolution,chart.resolution)?step.dataset:null;}catch{return null;}}
/** The replay clock (end of the last revealed step) in the chart time zone; LV wording. */
/** Shown when focusing another chart ends the active chart's replay. */
const REPLAY_FOCUS_ENDED='Bar Replay ended because another chart was selected.';
/** How long a user-action status is protected from the routine background autosave status. */
const STATUS_HOLD_MS=3000;
/** A status line's kind for that hold: only 'action' statuses are protected. String(error) statuses read "<Name>Error: ...". */
type StatusKind='action'|'error'|'save';
const ERROR_STATUS=/^[A-Za-z]*Error: /;
/** Dialogs that are floating panels (non-modal) for the paper workflow. */
const FLOATING_PAPER_DIALOGS:ReadonlySet<string>=new Set(['paper','order']);
export function App(){
 // A layout window (secondary) shows one saved layout; the main window (primary) owns everything else.
 const windowMode=currentWindowMode(),secondaryWindow=windowMode.role==='secondary';
 // A layout window's workspace-wide baseline (what the main window last took), and its close prompt.
 const sharedBaseline=useRef<SharedWorkspace>({}),discardOnClose=useRef(false),[closePrompt,setClosePrompt]=useState(false);
 const contextDialog=useRef<{dialog:string;snapshot:ChartMenuSnapshot;ownership:RootChartActionOwnership;priceRequest?:ContextPriceRequest}|null>(null);
 const contextPriceAuthority=useRef<ReturnType<typeof createContextPriceAuthority>|null>(null);if(!contextPriceAuthority.current)contextPriceAuthority.current=createContextPriceAuthority();
 const [advancedRequest,setAdvancedRequest]=useState<{id:string;book:WatchBook;state:WatchAdvancedState;datasets:BarDataset[];calendar:CalendarState;news:NewsState;now:number}|null>(null),advancedOwner=useRef<object|null>(null);
 const [noteRequest,setNoteRequest]=useState<{id:string;market:NoteMarket|null;noteId?:string;startNew:boolean;/** The screener dialog authority the notes stack over (absent: notes is the dialog). */overScreener?:object}|null>(null);
 const [paperState,setPaperState]=useState<PaperState>(()=>({paper:createPaperAccount(),book:null})),paper=paperState.paper;
 const setPaper=(next:PaperAccount)=>setPaperState(state=>({...state,paper:next}));
 const [replayPaper,setReplayPaper]=useState<PaperAccount|null>(null),[alerts,setAlerts]=useState<LocalAlert[]>([]);
 const [selectedPresetId,setSelectedPresetId]=useState<string|null>(null),[presetSeed,setPresetSeed]=useState<PaperPresetSeed|null>(null),presetSeedToken=useRef(0);
 const paperFeedForming=useRef<PaperFormingSnapshot|null>(null);
 /** The 1m live series that feeds virtual fills while a live chart shows a coarser interval. */
 const [paperFine,setPaperFine]=useState<BarDataset|null>(null),[paperBackground,setPaperBackground]=useState<ReadonlyMap<string,BarDataset>>(()=>new Map());
 /** When the first unsaved change since the last autosave arrived (max-wait). */
 const autosaveDirtySince=useRef<number|null>(null);
 const financial=useRef<{paper:PaperAccount;paperBook:PaperBook|null;alerts:LocalAlert[]}>({paper,paperBook:paperState.book,alerts});financial.current={paper,paperBook:paperState.book,alerts};
 const financialGuard=useRef(createFinancialPublicationGuard()),currentReplayPaper=useRef(replayPaper);currentReplayPaper.current=replayPaper;
 const [strategyExecution,setStrategyExecutionState]=useState<StrategyExecution|null>(null);
 const strategyExecutionCurrent=useRef<StrategyExecution|null>(strategyExecution);strategyExecutionCurrent.current=strategyExecution;
 const setStrategyExecution=(value:StrategyExecution|null)=>{strategyExecutionCurrent.current=value;setStrategyExecutionState(value);};
 const [intervalTarget,setIntervalTarget]=useState<string|undefined>();
 // LIVE: providers live for the app session. The Alpaca key stays in the main process; only "configured" is kept here.
 // One handle per live dataset, so several charts can stream at once (Alpaca multiplexes every symbol
 // over its single stream connection). A handle closes when no chart references its dataset.
 const coinbaseProvider=useRef<CoinbaseLiveProvider|null>(null),alpacaProvider=useRef<AlpacaLiveProvider|null>(null),liveHandles=useRef(new Map<string,LiveHandle>());
 // The symbol math provider (derived series) and the latest-render component opener it calls.
 const symbolMathProvider=useRef<SymbolMathProvider|null>(null),symbolMathHooks=useRef<{open:(symbol:string,resolution:string)=>LiveHandle;known:(symbol:string)=>boolean;alpaca:(symbols:readonly string[],resolution:string)=>string[];streaming:()=>ReadonlySet<string>}|null>(null),alpacaKeyRef=useRef(false),secondSymbolPrune=useRef<(keep:ReadonlySet<string>)=>void>(()=>{});
 // Alpaca tickers the second-symbol feeds (indicators and script requests) stream, and the per-layout replay hand-off.
 const secondSymbolAlpaca=useRef<()=>string[]>(()=>[]),layoutReplays=useRef(createLayoutReplayStash());
 // Live feeds of recently left layout tabs stay open for a while (layout-tabs-warm.ts).
 const warmFeeds=useRef(createWarmLayoutFeeds());
 const [,setLiveRevision]=useState(0),liveStore=useRef<LiveDatasetStore|null>(null),watchSteps=useRef<()=>void>(()=>{}),keptElements=useRef<OwnedElementCache|null>(null),[alpacaKeyConfigured,setAlpacaKeyConfigured]=useState(false),[alpacaKeyKnown,setAlpacaKeyKnown]=useState(false),[alpacaKeyPending,setAlpacaKeyPending]=useState(false),[liveReconnectTick,setLiveReconnectTick]=useState(0);
 // The live datasets are in liveStore (live-dataset-store.ts), not in App state. App reads
 // the newest snapshot when it renders, and a store change renders App only when liveChangeNeedsAppRender says App draws from
 // it (the active chart's source, the set of feeds, a feed's state or revision). The watchlist, the list-alert dialog and the
 // paper book subscribe to the store themselves; list alerts and derived watch labels step from it (watchSteps).
 const liveData=liveStore.current??=createLiveDatasetStore(),liveDatasets=liveData.getSnapshot();
 const setLiveDatasets=(updater:(prior:LiveDatasetMap)=>LiveDatasetMap)=>{const prior=liveData.getSnapshot(),next=liveData.update(updater);if(next===prior)return;if(liveChangeNeedsAppRender(prior,next,current.current.sourceId))setLiveRevision(value=>value+1);else watchSteps.current();};
 // Toolbars, the watchlist panel, the dock and dialogs keep their element while nothing they read changed
 // (element-cache reuseOwnedElement), so an App render for the active chart's tick does not re-render them.
 const kept=keptElements.current??=createOwnedElementCache(),reuse=<E,>(slot:string,element:E,deps?:readonly unknown[],data?:readonly string[]):E=>reuseOwnedElement(kept,slot,element,deps,data);
 // Nested prop objects kept while their values are unchanged (handlers forwarded), see surface-reuse.ts.
 const surfaces=surfaceCaches(kept),surfaceProps=<T extends object,>(slot:string,value:T,deps?:readonly unknown[]):T=>stableProps(surfaces.props,slot,value,deps);
 // The chart cell follows every live snapshot through the live channel (publishLiveDataset). App state
 // (heading, legend, data window, alerts, symbol search) follows a copy throttled to about once per second, and at once
 // when the feed state changes (Delayed, Disconnected).
 const liveThrottle=useRef<{pending:Map<string,BarDataset>;timer:ReturnType<typeof setTimeout>|null;last:number}>({pending:new Map(),timer:null,last:0});
 const flushLiveState=()=>{const throttle=liveThrottle.current;if(throttle.timer!==null){clearTimeout(throttle.timer);throttle.timer=null;}if(!throttle.pending.size)return;const updates=Object.fromEntries(throttle.pending);throttle.pending.clear();throttle.last=Date.now();setLiveDatasets(prior=>{const next={...prior};for(const [id,value] of Object.entries(updates))if(liveHandles.current.has(id))next[id]=value;return next;});};
 const queueLiveState=(next:BarDataset,prior:BarDataset|undefined)=>{const throttle=liveThrottle.current;throttle.pending.set(next.provenance.datasetId,next);const wait=LIVE_UI_INTERVAL_MS-(Date.now()-throttle.last);if(!prior||prior.provenance.state!==next.provenance.state||wait<=0){flushLiveState();return;}if(throttle.timer===null)throttle.timer=setTimeout(flushLiveState,wait);};
 const closeLiveHandle=(datasetId:string)=>{const handle=liveHandles.current.get(datasetId);if(!handle)return;liveHandles.current.delete(datasetId);liveThrottle.current.pending.delete(datasetId);handle.close();unregisterLiveDataset(datasetId);setLiveDatasets(prior=>{if(!Object.hasOwn(prior,datasetId))return prior;const next={...prior};delete next[datasetId];return next;});};
 const [intervalMenuLeft,setIntervalMenuLeft]=useState<number|null>(null),[intervalPrompt,setIntervalPrompt]=useState<string|null>(null);
 const [financialEpoch,setFinancialEpoch]=useState(0),financialGeneration=useRef(0);
 const [layoutImport,setLayoutImport]=useState<{file:LayoutFile;summary:string[];workspace:Workspace;datasets:BarDataset[]}|null>(null);
 const strategyBindings=useRef(new Map<string,string>());
 // The script editor docks as a bottom panel of the chart area by default (its own open state, so other
 // dialogs leave it open); "Open floating" switches it back to the dialog.
 const [scriptDocked,setScriptDocked]=useState(true),[scriptDockHost,setScriptDockHost]=useState<HTMLDivElement|null>(null);
 // The script editor, the Strategy tester and the paper trading dock are tabs of one bottom panel. Its tab,
 // expanded state and height are saved per layout (workspace.bottomPanel); maximize and the docked/floating placements are
 // per session. Each tab's owner portals into the host element the panel gives it (one host state per tab).
 const [strategyDocked,setStrategyDocked]=useState(true),[strategyDockHost,setStrategyDockHost]=useState<HTMLDivElement|null>(null),[tradingDockHost,setTradingDockHost]=useState<HTMLDivElement|null>(null);
 const [bottomMaximized,setBottomMaximized]=useState(false),[bottomVisited,setBottomVisited]=useState<readonly BottomPanelTab[]>([]);
 const bottomHostRefs=useRef({script:setScriptDockHost,strategy:setStrategyDockHost,trading:setTradingDockHost}).current;
 /** The docked Strategy tester's owner: replaced whenever the panel collapses, so a closed tester's handlers retire at once. */
 const strategyDockToken=useRef<object>({}),strategyDockLive=useRef(false);
 const [scriptEpoch,setScriptEpoch]=useState(0),[executionEpoch,setExecutionEpoch]=useState(0),[inputEpoch,setInputEpoch]=useState(0),[gridEpoch,setGridEpoch]=useState(0),[workspaceBusy,setWorkspaceBusy]=useState(false),[storageBusy,setStorageBusy]=useState(false);
 // The mounted script editor's draft handle (see withScriptDraft).
 const scriptDraft=useRef<ScriptDraftHandle|null>(null);
 const storageMutation=useRef(false);
 const startupGeneration=useRef(0),startup=useRef<WorkspaceStartup>({phase:'loading',error:''}),[startupView,setStartupView]=useState<WorkspaceStartup>(startup.current);
 const publishStartup=(next:WorkspaceStartup)=>{startup.current=next;setStartupView(next);};
 const gridGeneration=useRef(0),coordinator=useRef<MultiChartTransactionCoordinator|null>(null),workspaceTransaction=useRef(false),committedInput=useRef<{workspace:Workspace;dataset:BarDataset;datasets:BarDataset[];replay:ReplayState|null;bars:Bar[]}|null>(null);
 const currentInput=useRef<{dataset:BarDataset;datasets:BarDataset[];bars:Bar[];replay:ReplayState|null}|null>(null);
 const transactionReady=useCallback((value:MultiChartTransactionCoordinator|null)=>{coordinator.current=value;},[]);
 const gridHost=useRef<WorkspaceChartHostController|null>(null),hostReady=useCallback((value:WorkspaceChartHostController|null)=>{gridHost.current=value;},[]);
 // The crosshair inspection lives in the hover store (hoverInspection), so a crosshair move re-renders only
 // HoverSlot children. This state is no longer written; it stays only to keep App's pinned hook order and signatures.
 const [inspection,setInspection]=useState<Inspection|null>(null),[inspectionEpoch,setInspectionEpoch]=useState(0);void inspection;void setInspection;
 const hoverInspection=gridHoverStore(gridHost);
 /** A HoverSlot whose first content is built in this render (so the rendered tree is unchanged) and rebuilt on hover.
  * With settle (ms), it rebuilds only once the hover has been quiet that long (snapshot overlay publishers). */
 const hoverSlot=(select:(()=>unknown)|undefined,render:()=>React.ReactNode,settle?:number)=>settle===undefined?<HoverSlot store={hoverInspection} version={hoverInspection.version} select={select} render={render}>{render()}</HoverSlot>:<SettledHoverSlot store={hoverInspection} version={hoverInspection.version} select={select} render={render} settle={settle}>{render()}</SettledHoverSlot>;
 const [workspace,setWorkspaceState]=useState<Workspace>(initial),[dialog,setDialogState]=useState<string|null>(null),[preview,setPreview]=useState<ChartAppearance|null>(null),[settingsPreview,setSettingsPreview]=useState<Workspace['chartSettings']|null>(null),[chart,setChart]=useState<ChartController|null>(null),[message,setMessageState]=useState('Loading local workspace...'),[loaded,setLoaded]=useState(false),[storage,setStorage]=useState(''),[symbolInput,setSymbolInput]=useState('GME'),[activeTool,setActiveTool]=useState<string|null>(null),[drawings,setDrawings]=useState<Record<string,unknown>[]>([]),[selectedDrawing,setSelectedDrawing]=useState<string|null>(null),[selectedDrawingIds,setSelectedDrawingIds]=useState<string[]>([]),[objectTreeTab,setObjectTreeTab]=useState<ObjectTreeWidgetTab>('object_tree'),[indicatorViews,setIndicatorViews]=useState<IndicatorInstanceView[]>([]),[replay,setReplay]=useState<ReplayState|null>(null);
 /* The routine background autosave keeps its status line, but it
  does not replace an undo or redo status, or any other non-error status a user action showed, less than STATUS_HOLD_MS
  earlier. It is held, not dropped: it is shown when the hold ends unless a newer status was shown first. An error status
  is never protected, so a later success always replaces it. Every status goes through showStatus, which records its kind
  and the monotonic time it was shown (performance.now, immune to wall clock steps) and cancels a held save status. */
 const statusShown=useRef<{at:number;kind:StatusKind}>({at:Number.NEGATIVE_INFINITY,kind:'save'}),heldSaveStatus=useRef<ReturnType<typeof setTimeout>|null>(null);
 const showStatus=useCallback((value:React.SetStateAction<string>,kind:StatusKind)=>{if(heldSaveStatus.current!==null){clearTimeout(heldSaveStatus.current);heldSaveStatus.current=null;}statusShown.current={at:performance.now(),kind};setMessageState(value);},[]);
 const [messageDetail,setMessageDetail]=useState('');
 const statusAction=statusToastAction(message);
 /* A status built from String(error) is shown without its "Error: " prefix; it still counts as an error status. */
 const setMessage=useCallback((value:React.SetStateAction<string>)=>{setMessageDetail('');const error=typeof value==='string'&&ERROR_STATUS.test(value);showStatus(typeof value==='string'?stripErrorPrefix(value):value,error?'error':'action');},[showStatus]);
 const reportFailure=useCallback((cause:unknown)=>{setMessageDetail(errorDetails(cause));showStatus(friendlyError(cause),'error');},[showStatus]);
 /** An error status reported as plain message text (not in the String(error) form). */
 const reportError=useCallback((value:string)=>showStatus(value,'error'),[showStatus]);
 const publishBackgroundStatus=useCallback((status:string)=>{
  const last=statusShown.current,remaining=last.kind==='action'?last.at+STATUS_HOLD_MS-performance.now():0;
  if(remaining<=0){showStatus(status,'save');return;}
  if(heldSaveStatus.current!==null)clearTimeout(heldSaveStatus.current);
  heldSaveStatus.current=setTimeout(()=>{heldSaveStatus.current=null;if(statusShown.current===last)showStatus(status,'save');},remaining);
 },[showStatus]);
 const [activeMode,setActiveMode]=useState<DrawingMode|null>(null);
 const cursorKinds=useRef(createCursorKindController()),[activeCursor,setActiveCursor]=useState<CursorKind>('cross');
 const imageAssets=useRef(createImageAssetStore()),imageInput=useRef<HTMLInputElement|null>(null),
  /* A cancelled image chooser fires the native 'cancel' event on the file input (React has no input onCancel
   prop), so a stable ref attaches the listener once; it runs the latest disarmTool and leaves Cursor armed. */
  imageCancel=useRef<()=>void>(()=>{}),imageCancelListener=useRef(()=>imageCancel.current()),attachImageInput=useRef((node:HTMLInputElement|null)=>{const listener=imageCancelListener.current;imageInput.current?.removeEventListener?.('cancel',listener);imageInput.current=node;node?.addEventListener?.('cancel',listener);}).current,imageHolds=useRef(new Set<string>()),imageSync=useRef<ReturnType<typeof createDrawingAssetsController>|null>(null);
 // The Bar Replay session. The per-chart ReplayState (replay) stays the owner/run guard carrier; the session owns the clock, interval and scope. replaySaved is the in-memory remembered session (Continue session); replay persistence is not part of the workspace record.
 const [replaySession,setReplaySessionState]=useState<ReplaySession|null>(null),[replaySaved,setReplaySaved]=useState<ReplaySavedSession|null>(null),[replayRefusal,setReplayRefusal]=useState<string|null>(null),[replayPointer,setReplayPointer]=useState<{x:number;time:number|null}|null>(null);
 const replaySessionRef=useRef<ReplaySession|null>(replaySession);replaySessionRef.current=replaySession;
 /** Anchored VWAP click-a-bar placement: the instance waiting for its anchor; fresh = just added (Esc removes it). */
 const [anchorPlacement,setAnchorPlacement]=useState<{id:string;fresh:boolean}|null>(null),anchorPlacementRef=useRef(anchorPlacement);anchorPlacementRef.current=anchorPlacement;
 const anchorPlacementEnd=useRef<(cancel:boolean)=>void>(()=>{});
 const anchorDown=useRef<{x:number;y:number}|null>(null);
 // The last replay speed is kept for this app session, so reopening Bar Replay keeps it (not saved in the workspace).
 const replaySpeedMemory=useRef<number>(1);if(replaySession)replaySpeedMemory.current=replaySession.stepsPerSecond;
 const replayTick=useRef<(elapsed:number)=>void>(()=>{}),replayKeys=useRef<(action:ReplayKeyAction)=>void>(()=>{}),pendingRange=useRef<{preset:BottomRange['preset'];interval:string;datasetId:string;tries?:number;at?:number}|null>(null);
 // The frozen copies of live charts a session replays (replay-live-snapshot.ts).
 // They follow the session through this one setter: kept while it lasts, dropped by Jump to real time and Close, so the chart
 // returns to its live feed with the bars that arrived meanwhile. Openers stage freshly frozen copies in replaySnapshotStage.
 const [replaySnapshots,setReplaySnapshots]=useState<ReplayLiveSnapshots|null>(null),replaySnapshotsRef=useRef<ReplayLiveSnapshots|null>(null),replaySnapshotStage=useRef<ReplayLiveSnapshots|null>(null);
 const heldReplaySnapshots=():ReplayLiveSnapshots|null=>replaySnapshotStage.current?{...replaySnapshotStage.current,...(replaySnapshotsRef.current??{})}:replaySnapshotsRef.current;
 // The replay account of the current session across its runs (replay-paper-carry.ts); dropped with the session.
 const replayPaperLedger=useRef<ReplayPaperLedger|null>(null);
 const setReplaySession=(next:ReplaySession|null)=>{replaySessionRef.current=next;if(!next)replayPaperLedger.current=null;
  let held:ReplayLiveSnapshots|null=null;try{const prior=heldReplaySnapshots();held=next&&(prior||next.participants.some(row=>isLiveDatasetId(row.datasetId)))?replaySnapshotsFor(prior,next,workspaceDatasets(current.current)):null;}catch{held=null;}
  replaySnapshotStage.current=null;if(held!==replaySnapshotsRef.current){replaySnapshotsRef.current=held;setReplaySnapshots(held);}setReplaySessionState(next);};
 const [fundamentalsMarket,setFundamentalsMarket]=useState<FundamentalsMarket|null>(null);
 const [symbolInfoDataset,setSymbolInfoDataset]=useState<BarDataset|null>(null);
 const [calendarEntry,setCalendarEntry]=useState<{kind?:'economic'|'earnings'|'dividend'|'ipo';nonce:string;focus?:{documentId:string;eventId:string}}|null>(null);
 const indicatorFocus=useRef<{authority:object;id:string;tab?:string;compact?:boolean;/** Id is the "Add indicator on" target, not a selection. */addOn?:boolean}|null>(null);
 const fundamentalsSummaries=useMemo(()=>createSummaryMemo(),[]);
 const fundamentalsFor=(market:FundamentalsMarket,assetClass:string|null)=>{const prefs=workspace.fundamentalsPreferences;return fundamentalsSummaries({market,documents:workspace.fundamentals,links:prefs.links,asOf:resolveFilingCutoff(prefs.view,utcToday()),basis:'FY',revisions:prefs.view.revisions,assetClass});};
 const shortcutRows=useMemo(()=>keyboardShortcutRows(),[]);
 const [symbolSearch,setSymbolSearch]=useState<{id:string;query:string;origin:SymbolSearchOrigin}|null>(null);
 // The open Quick search, a chosen row waiting for the palette to close, and the indicator a row asked to add.
 const [quickSearchSeed,setQuickSearchSeed]=useState<{id:string;query:string}|null>(null),pendingQuickSearch=useRef<QuickSearchItem|null>(null),indicatorSearch=useRef<{authority:object;query:string;active:string}|null>(null);
 const dialogOwner=useRef(dialog),dialogAuthority=useRef<object>({});dialogOwner.current=dialog;
 function setDialog(next:string|null,adopted:typeof contextDialog.current=null){
  // Typeof keeps setDialog self-contained for tests/security/inline-dialog-app-independent, which evaluates its text alone.
  if(typeof secondaryWindow!=='undefined'&&secondaryWindow&&next!==null&&PRIMARY_ONLY_DIALOGS.has(next)){setMessage(SECONDARY_WINDOW_NOTICE);return;}
  if(next==='drawing'&&activeController.current?.finishInlineText){const target=activeController.current,generation=gridGeneration.current,authority=dialogAuthority.current;let assertTransferOwner:(()=>void)|null=null;try{if(!finishInlineDialogTransfer(target,()=>{if(activeController.current!==target||gridGeneration.current!==generation||dialogAuthority.current!==authority)throw Error('Drawing settings action changed. Open it again.');},owner=>{assertTransferOwner=owner;}))return;(assertTransferOwner as (()=>void)|null)?.();}catch(error){try{if(assertTransferOwner){const message=String(error);(assertTransferOwner as ()=>void)();setMessage(message);}}catch{/* A retired action cannot report into its replacement chart. */}return;}}
  retireContextDialog();contextDialog.current=adopted;dialogAuthority.current={};dialogOwner.current=next;if(next!=='watch-advanced')advancedOwner.current=null;if(dialog==='chart-settings'&&next!=='chart-settings')setPreview(null);setDialogState(next);}
 const snap=workspace.drawingPreferences.magnet,stay=workspace.drawingPreferences.stay;
 setIndicatorSnap(workspace.drawingPreferences.snapToIndicators===true);/* Shared by every chart renderer (drawing-snap.ts). */
 const lastPersisted=useRef<{workspace:Workspace;paper:PaperAccount;paperBook?:PaperBook|null;alerts:LocalAlert[];compoundReviewVersion:bigint}|null>(null);
 const lastSaveFailure=useRef<{workspace:Workspace;paper:PaperAccount;paperBook?:PaperBook|null;alerts:LocalAlert[];revision:number;compoundReviewVersion:bigint}|null>(null);
 const revision=useRef(0),current=useRef(workspace),history=useRef(createWorkspaceHistory<Workspace>()),currentReplay=useRef(replay),saving=useRef(false),saveAgain=useRef(false),autosaveRetry=useRef<{timer:ReturnType<typeof setTimeout>|null;waits:number}>({timer:null,waits:0}),holdRetry=useRef<{timer:ReturnType<typeof setTimeout>|null;count:number;refused:boolean}>({timer:null,count:0,refused:false});
 // BackgroundSave marks the in-flight storage mutation as the routine autosave (main stays interactive during it);
 // manualSaveQueued is an explicit Save requested meanwhile, which runs right after it instead of being dropped.
 // WorkspaceAlerts is suspended only while the workspace is inert (workspaceBusy: explicit Save, layout and other
 // blocking operations). During the routine autosave it gets backgroundSave instead: its observation, controls and focus
 // stay live and it only defers its own evaluation publication to the end of the write (acceptAlerts' storage lock is
 // unchanged and still refuses every alert write meanwhile).
 const backgroundSave=useRef(false),manualSaveQueued=useRef(false),storageWriteWaiters=useRef<Array<()=>void>>([]);
 // symbolDraft: true while the Symbol box holds text the owner typed and has not committed (Enter) or cancelled
 // (Escape). Passive syncs (chart re-ready, active-cell effects, grid input) leave that text alone; explicit switches,
 // loads and restores replace it. queuedSwitch is the one symbol/interval switch waiting for a storage write.
 const symbolDraft=useRef(false),queuedSwitch=useRef<object|null>(null);
 /** Every symbolInput write goes through takeSymbol or showSymbol, so an unchanged symbol (each ready callback repeats it) is not written again. */
 function showSymbol(symbol:string){const written=appUpdateBatch(current).written;if(!symbolDraft.current&&written.get('symbol-input')!==symbol){written.set('symbol-input',symbol);setSymbolInput(symbol);}}
 function takeSymbol(symbol:string){symbolDraft.current=false;appUpdateBatch(current).written.set('symbol-input',symbol);setSymbolInput(symbol);}
 current.current=workspace;currentReplay.current=replay;
 const commit=useCallback((patch:Partial<Workspace>,historyBaseline?:Workspace,acknowledge?:()=>void,beforeCommit?:()=>void)=>{try{
  assertStartupEditable(startup.current);const before=current.current,/* typeof: extracted-section test harnesses evaluate commit without it. */next=typeof withGlobalDrawingEdits==='function'?withGlobalDrawingEdits(before,patchWorkspace(before,patch)):patchWorkspace(before,patch);if(sameWorkspace(next,before)){beforeCommit?.();acknowledge?.();return true;}
  if(workspaceTransaction.current||storageMutation.current)throw new Error('The chart is busy. Try again in a moment.');
  financialGuard.current(next,financial.current.alerts,financial.current.paper);if(historyBaseline)financialGuard.current(historyBaseline,financial.current.alerts,financial.current.paper);
  const resetNotice=frameResetNotice(before,next),dropped=history.current.status().dropped;
  beforeCommit?.();
  if(changedChartGrid(historyBaseline??before,next))history.current.record(historyBaseline??before,currentReplay.current);current.current=next;acknowledge?.();setWorkspace(next);
  const notices:string[]=[];if(resetNotice)notices.push(resetNotice);
  if(history.current.status().dropped>dropped)notices.push('Older undo steps were removed to save space.');if(notices.length)setMessage(notices.join(' '));return true;
 }catch(e){reportFailure(e);return false;}},[]);
 /** `workspace` with the script editor's unsaved draft (typed inside its 250 ms save window) folded in, for a
  * route that is about to remount the editor (key={scriptEpoch}) inside the same workspace. Same guard as the editor's timer:
  * only into the document the text was typed into, and only while it is still that library's active one. A draft over the
  * local limits throws, so the route is refused and the editor keeps the text. The route calls settle() once it committed. */
 function withScriptDraft(workspace:Workspace):Workspace{const draft=scriptDraft.current?.pending(),library=workspace.scriptLibrary;if(!draft||library.activeId!==draft.documentId||!library.documents.some(row=>row.id===draft.documentId))return workspace;const scriptLibrary=draftScript(library,draft.documentId,{source:draft.source});return scriptLibrary===library?workspace:{...workspace,scriptLibrary};}
 /** Saves the pending draft now, into the current workspace, when a workspace replacement is about to be
  * reviewed (Data sources settings, Restore workspace). The replacement itself never receives it (installStoredWorkspace). */
 function saveScriptDraft(){try{const before=current.current,next=withScriptDraft(before);if(next!==before&&commit({scriptLibrary:next.scriptLibrary}))scriptDraft.current?.settle();}catch(error){reportFailure(error);}}
 /** One change of the active layout's bottom panel view, saved through commit (no undo step: commit records
  * history only for chart grid changes). Collapsing retires the docked Strategy tester's owner and ends maximize. */
 const changeBottomPanel=useCallback((update:(view:BottomPanelView)=>BottomPanelView):boolean=>{try{
  const saved=current.current,layoutId=bottomPanelLayoutId(saved),before=bottomPanelView(saved.bottomPanel,layoutId),after=update(before);
  if(sameBottomPanelView(before,after))return true;
  if(!commit({bottomPanel:withBottomPanelView(saved.bottomPanel,layoutId,after,saved.layoutLibrary?.entries.map(row=>row.id))}))return false;
  if(!after.open){strategyDockToken.current={};setBottomMaximized(false);}
  setBottomVisited(visited=>nextVisitedTabs(before,after,visited));return true;
 }catch(error){reportFailure(error);return false;}},[commit]);
 /** The paper trading dock's open state is the Trading panel tab (menus, the rail and the replay panel open it). */
 const setPaperDockOpen=useCallback((open:boolean)=>{changeBottomPanel(view=>open?openBottomTab(view,'trading'):view.tab==='trading'?collapseBottomPanel(view):view);},[changeBottomPanel]);
 const changeDrawingFavorites=useMemo(()=>{
  const editable=()=>loaded&&(startup.current.phase==='ready'||startup.current.phase==='preview');
  const owner:DrawingFavoriteOwner={workspace,favorites:workspace.drawingFavorites,chart,gridEpoch,ready:editable(),blocked:workspaceTransaction.current||storageMutation.current};
  const read=():DrawingFavoriteOwner=>({workspace:current.current,favorites:current.current.drawingFavorites,chart:activeController.current,gridEpoch:gridGeneration.current,ready:editable(),blocked:workspaceTransaction.current||storageMutation.current});
  const request=captureDrawingFavoriteRequest({read,catalog:()=>chart?.drawingCatalog().map(row=>row.type)??[],publish:next=>commit({drawingFavorites:next})},owner);
  // A favorite change made during the routine background autosave waits for the write (queueDrawingEdit) and
  // is requested then against the workspace as it is then (the rendered owner is blocked during the write and is not re-rendered
  // before the queue runs). A refusal at that point is shown plainly.
  const later=(proposed:string[])=>{const fresh=read(),run=captureDrawingFavoriteRequest({read,catalog:()=>activeController.current?.drawingCatalog().map(row=>row.type)??[],publish:value=>commit({drawingFavorites:value})},fresh);try{if(!run(proposed))return DRAWING_FAVORITES_STALE;}catch(error){return error instanceof Error?error.message:String(error);}};
  return(next:string[])=>{const proposed=[...next];if(queueDrawingEdit(()=>later(proposed),{},null))return true;try{return request(next);}catch(error){if(drawingFavoriteOwnerCurrent(owner,read())){const text=error instanceof Error?error.message:String(error);if(drawingFavoriteOwnerCurrent(owner,read()))setMessage(text);}return false;}};
 },[workspace,chart,gridEpoch,loaded,workspaceBusy,storageBusy,startupView.phase,commit]);
 const acceptGrid=useCallback((grid:MultiChartState,prepared?:GridPreparedInput,frameBaseline?:GridFrameEditBaseline,markCommitted?:()=>void)=>{if(workspaceTransaction.current)return false;
  // A chart type chosen through the grid during a replay follows the Chart type select's rule.
  const styleRefusal=replayStyleRefusal(grid.cells[grid.layout.activeCellId]?.style,current.current.grid?.cells[grid.layout.activeCellId]?.style);if(styleRefusal){setMessage(styleRefusal);return false;}
  try{
  if(prepared&&frameBaseline)throw new Error('This change cannot also replace the chart source.');
  const historyBaseline=frameBaseline?prepareGridFrameHistory(current.current,grid,frameBaseline,{...currentInput.current!,replay:currentReplay.current}):undefined;
  let input=prepared?validatePreparedGridInput(grid,prepared,{...currentInput.current!,replay:currentReplay.current}):null;
  const acknowledge=()=>{if(input){committedInput.current={workspace:current.current,...input};currentInput.current=input;currentReplay.current=input.replay;}markCommitted?.();};
  const focusOnly=focusOnlyChange(current.current.grid,grid);
  if(focusOnly){
   assertStartupEditable(startup.current);const next=projectGrid(current.current,grid),id=grid.layout.activeCellId,metadata=grid.layout.cells.find(row=>row.id===id),datasets=currentInput.current?.datasets;
   const matches=datasets?.filter(row=>row.provenance.datasetId===grid.cells[id].datasetId&&row.instrument.symbol===metadata?.symbol&&row.resolution===metadata?.interval);
   if(!datasets||matches?.length!==1)throw new Error('Select a chart first.');
   const dataset=cellSessionDataset(matches[0],grid.cells[id]),moved=replayFocusSession(replaySessionRef.current,id),held=replaySnapshotsRef.current,view=moved&&replayFocusView(moved,pinnedReplayView(dataset,held),cellReplaySources(dataset,grid.cells[id],datasets.map(row=>pinnedReplayView(row,held))));if(view)setReplaySession(moved);input={dataset,datasets,bars:view?view.bars:dataset.bars,replay:view?view.state:null};financialGuard.current(next,financial.current.alerts,financial.current.paper);current.current=next;acknowledge();setWorkspace(next);
  }else if(!commit({grid},historyBaseline,acknowledge))return false;
  if(input){setReplay(input.replay);setInputEpoch(value=>value+1);showSymbol(input.dataset.instrument.symbol);setStrategyExecution(null);if(followReplayGuard(input.replay,grid.layout.activeCellId)&&focusOnly)setMessage(REPLAY_FOCUS_ENDED);}return true;
 }catch(error){reportFailure(error);return false;}},[commit]);
 const captureDrawingWorkspace=useCallback((expectedGrid:MultiChartState):GridDrawingWorkspaceCommand=>{
  const before=current.current,openingReplay=currentReplay.current,openingInput=currentInput.current,openingFinancial=financial.current,openingStartup=startup.current,epoch=gridGeneration.current;
  let expected=before,retired=false,prepared=false;
  const assertCurrent=()=>{
   if(retired)throw Error('The drawing changed. Try again.');
   try{
    assertStartupEditable(startup.current);
    const now=currentInput.current;
    if(workspaceTransaction.current||storageMutation.current||startup.current!==openingStartup||gridGeneration.current!==epoch||current.current!==expected||currentReplay.current!==openingReplay||financial.current.paper!==openingFinancial.paper||financial.current.alerts!==openingFinancial.alerts||!openingInput||!now||!sameDatasetInput(now.dataset,openingInput.dataset)||!sameDatasetsInput(now.datasets,openingInput.datasets)||!sameBarsInput(now.bars,openingInput.bars))throw Error('The chart changed before the drawing was saved. Try again.');// A live tick or tail re-read on the same lineage keeps a drawing publication current
   }catch(error){retired=true;throw error;}
  };
  assertCurrent();if(before.grid!==expectedGrid)throw Error('The layout changed. Try again.');
  return Object.freeze({assertCurrent,prepare(nextGrid:MultiChartState){
   assertCurrent();if(prepared)throw Error('The drawing changed. Try again.');prepared=true;
   measureWorkspaceJSON({grid:nextGrid});
   const next=typeof withGlobalDrawingEdits==='function'?withGlobalDrawingEdits(before,patchWorkspace(before,{grid:nextGrid})):patchWorkspace(before,{grid:nextGrid});financialGuard.current(next,openingFinancial.alerts,openingFinancial.paper);
   const historyRecord=history.current.prepareRecord(before,openingReplay);assertCurrent();historyRecord.assertCurrent();
   let phase:'prepared'|'accepted'|'retired'='prepared';
   const pending=Object.freeze({
    assertCurrent(){if(this!==pending||phase==='retired')throw Error('The drawing changed. Try again.');assertCurrent();if(phase==='prepared')historyRecord.assertCurrent();},
    publish(mark:()=>void){
     if(this!==pending||phase!=='prepared')throw Error('The drawing changed. Try again.');pending.assertCurrent();
     // Only private writes occur between the prepared history commit and ACK.
     historyRecord.commit();current.current=next;expected=next;phase='accepted';
     const failures:unknown[]=[];try{mark();}catch(error){failures.push(error);}try{setWorkspace(next);}catch(error){failures.push(error);}
     if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'The drawing changed. Try again.');
    }
   });return pending;
  }});
 },[]);
 function drawingHistory(direction:'undo'|'redo',expected:MultiChartState){
  assertStartupEditable(startup.current);if(workspaceTransaction.current||storageMutation.current||current.current.grid!==expected)throw Error('History changed. Try again.');
  void restoreHistory(direction);
 }
 function drawingHistoryStatus(){const value=history.current.status();return{canUndo:value.undo>0,canRedo:value.redo>0};}
 const activeCell=useCallback((id:string,cell:MultiChartCellState)=>{if(workspaceTransaction.current)return;const dataset=workspaceDatasets(current.current).find(row=>row.provenance.datasetId===cell.datasetId);if(dataset){showSymbol(dataset.instrument.symbol);if(dataset.provenance.datasetId!==selectedDataset(current.current).provenance.datasetId){setReplay(null);setReplaySession(null);}}},[]);
 const undo=()=>{try{if(chart)chart.drawings.undo();else void restoreHistory('undo');}catch(error){reportFailure(error);}};
 const redo=()=>{try{if(chart)chart.drawings.redo();else void restoreHistory('redo');}catch(error){reportFailure(error);}};
 /** drawingAlert: Alt+A with exactly one drawing selected opens that drawing's alert; false leaves Alt+A to the ordinary alert. */
 const drawingAlert=()=>{if(!selectedDrawing||selectedDrawingIds.length>=2)return false;openDrawingAlert(selectedDrawing);return true;};
 /** Open the drawing edit bar near the selected drawing's anchors, in price-pane-relative px. A remembered or dragged bar position still wins inside the bar; a controller without the geometry readers, or one that throws, keeps the default place. Only drawings with two or more anchors are placed: a one-anchor drawing (Anchored volume profile, text, icons) paints a body its anchor box does not bound, so a bar above the anchor would cover the body the user just clicked. */
 const editBarNear=(()=>{if(!chart||!selectedDrawing||typeof chart.pricePaneProjection!=='function'||typeof chart.timeToX!=='function')return undefined;try{const row=drawings.find(x=>x.id===selectedDrawing) as {anchors?:{time:number;price:number}[]}|undefined;const projection=chart.pricePaneProjection();if(!row?.anchors||row.anchors.length<2||!projection)return undefined;
  const xs:number[]=[],ys:number[]=[];for(const anchor of row.anchors){const seconds=anchor.time>1e11?anchor.time/1000:anchor.time,x=chart.timeToX(seconds),y=projection.priceToY(anchor.price);if(x===null||!Number.isFinite(y))continue;xs.push(x-projection.left);ys.push(y-projection.top);}
  if(!xs.length)return undefined;return{box:{left:Math.min(...xs),top:Math.min(...ys),right:Math.max(...xs),bottom:Math.max(...ys)},viewport:{width:projection.width,height:projection.height},origin:{left:projection.left,top:projection.top}};}catch{/* Placement is advisory: an unreadable geometry keeps the bar's default place. */return undefined;}})();
 /** Workspace keys named by the shared classifier (shortcut-dispatch). */
 const workspaceKey=(command:'indicators'|'go-to-date'|'add-to-watchlist'|'next-symbol'|'previous-symbol'|'shortcuts')=>{
  if(command==='shortcuts'){setDialog('shortcuts');return;}
  if(command==='indicators'){if(chart){indicatorFocus.current=null;setDialog('indicators');}return;}
  if(command==='go-to-date'){if(chart)setDialog('date');return;}
  if(command==='add-to-watchlist'){addChartSymbolToWatchlist();return;}
  stepWatchlist(command==='next-symbol'?1:-1);
 };
 /* Shift+B / Shift+S use the selected order preset exactly as the chart Buy/Sell buttons do (chartPresetAction); without a preset they show the hint. True when the key was handled. */
 const paperKey=(event:KeyboardEvent,chartFocused:boolean):boolean=>{const account=replay?currentReplayPaper.current:financial.current.paper;const action=classifyPaperShortcut({key:event.key,shiftKey:event.shiftKey,ctrlKey:event.ctrlKey,altKey:event.altKey,metaKey:event.metaKey,repeat:event.repeat,isComposing:event.isComposing,defaultPrevented:event.defaultPrevented,target:event.target as never},{chartFocused,dialogOpen:dialogOwner.current!==null||!!document.querySelector('[aria-modal="true"]'),menuOpen:[...document.querySelectorAll('[role=menu],[role=listbox]')].some(node=>node.getClientRects().length>0)/* mounted-but-hidden menus and listboxes (display none) do not count */,presetSelected:secondaryWindow||!!selectedPreset,oneClick:secondaryWindow||!!account?.settings.oneClick});if(action.kind==='ignore')return false;
 /* A layout window sends the key to the main window, which owns paper trading (preset, one-click, ticket). */if(secondaryWindow){if(action.kind==='place')relayPaperKey(action.side);return true;}if(action.kind==='status')setMessage(action.message);else chartPresetAction(action.side,`key-${globalThis.crypto.randomUUID()}`);return true;};
 const fullscreenKey=()=>toggleFullscreen();
 const priceScaleKey=(action:'invert'|'percent'|'logarithmic'|'resetChart')=>{if(!chart)return;const result=chart.priceScale.execute(action,{origin:'keyboard'});if(!result.ok&&result.message)setMessage(result.message);};
 const resetTimeScaleKey=(marginBars:number)=>{const lastBar=bars.at(-1);if(!lastBar)return;const result=scrollToLatestNow(chart,lastBar.time,bars.length>=2?bars[bars.length-1].time-bars[bars.length-2].time:60,marginBars);if(!result.ok)setMessage(result.message);};
 /** Ctrl+K opens Quick search; Alt+S copies and Ctrl+Alt+S saves the chart image, locally only (never an upload). */
 const quickSearchKey=()=>openQuickSearch();
 const snapshotKey=(mode:'copy'|'save')=>{if(mode==='save')void exportImage();else void copyActiveChartImage();};
 /** The registry commands Alt+D and Shift+T run (commandRuns of the latest render). */
 const keyCommandRuns=useRef<CommandRuns>({});
 /** The Alt+Shift chords and Shift+D (assigned after commandRuns, each render). */
 const extraKeyRun=useRef<(action:ExtraKeyAction)=>void>(()=>{});
 const keyboardCommands=useRef({undo,redo,armTool,placeAtCrosshair,drawingAlert,workspaceKey,paperKey,fullscreenKey,priceScaleKey,resetTimeScaleKey,quickSearchKey,snapshotKey,deleteKeyDuringSave});keyboardCommands.current={undo,redo,armTool,placeAtCrosshair,drawingAlert,workspaceKey,paperKey,fullscreenKey,priceScaleKey,resetTimeScaleKey,quickSearchKey,snapshotKey,deleteKeyDuringSave};
 async function loadStoredWorkspace(expectedOwner?:WorkspaceStartup){
  if(expectedOwner!==undefined&&(startup.current!==expectedOwner||!['unavailable','recoverable'].includes(expectedOwner.phase))){setMessage('This recovery action is no longer current. Review the current storage state.');return;}
  if(saving.current||workspaceTransaction.current||storageMutation.current){setMessage('The workspace is busy. Try again in a moment.');return;}
  const token=++startupGeneration.current;publishStartup({phase:'loading',error:''});setLoaded(false);
  if(!window.lv){publishStartup({phase:'preview',error:''});setLoaded(true);setMessage('Browser preview. Saving and file dialogs need the desktop app.');return;}
  try{const result=await window.lv.loadWorkspace();if(startupGeneration.current!==token)return;
   if(!result.ok){publishStartup({phase:'unavailable',error:result.error.message});setMessage('Saved storage is unavailable. Your files are unchanged.'+result.error.message);return;}
   revision.current=result.value.revision;setStorage(result.value.storage.directory);const saved=result.value.data;
   // A layout window opens its layout of the saved workspace, with no alerts and an empty paper account (both stay
   // in the main window). A layout that is no longer saved closes the window.
   try{const recovered=saved?prepareWorkspaceData(saved):null,fresh=!recovered&&demoDataMode()!=='legacy'&&isFreshProfile(result.value,windowMode.role==='secondary'),stored=recovered?.workspace??(fresh?createFirstRunWorkspace():createInitialWorkspace()),next=windowMode.role==='secondary'?secondaryWorkspace(stored,windowMode.layoutId,projectGrid):stored,nextPaper=secondaryWindow?createPaperAccount():recovered?.paper??createPaperAccount(),nextAlerts=secondaryWindow?[]:recovered?.alerts??[],nextPaperBook=secondaryWindow?null:(recovered as {paperBook?:PaperBook|null}|null)?.paperBook??null;
    if(!next){publishStartup({phase:'unavailable',error:SECONDARY_MISSING_LAYOUT});setMessage(SECONDARY_MISSING_LAYOUT);void window.lv.close?.();return;}
    financialGuard.current(next,nextAlerts,nextPaper);
    const message=secondaryWindow?SECONDARY_WINDOW_NOTICE:result.value.savedAt?'Local workspace restored':(demoDataMode()==='legacy'?'Ready. Prices are demo data.':'Ready.')/* The needs-live card gives the advice, and a set-up source opens its live chart. */;
    // A layout window relays the workspace-wide fields it changes after this point.
    if(secondaryWindow)sharedBaseline.current=sharedWorkspaceOf(next);
    const nextCompound=prepareCompoundWorkspaceAdoption(compoundBook,secondaryWindow?undefined:recovered?.compoundAlerts,Math.floor(Date.now()/1000));
    try{installStoredWorkspace(next,nextPaper,nextAlerts,result.value.revision,message+(recovered?.migrations.length?' '+recovered.migrations.join(' '):''),nextPaperBook,nextCompound);}finally{nextCompound.rollback();}
    // A brand-new profile opens live BTC-USD (first-run.ts); the first-run effect falls back to example data if Coinbase fails.
    firstRun.current={loadedAt:Date.now(),openedAt:0};setFirstRunPhase(fresh?'opening':'idle');
   }catch(error){if(startupGeneration.current!==token)return;const message='Saved workspace needs recovery. Your data is unchanged. '+stripErrorPrefix(String(error));if(saved)publishStartup({phase:'recoverable',error:message,data:saved});else publishStartup({phase:'unavailable',error:message});setMessage(message);}
  }catch(error){if(startupGeneration.current!==token)return;const message='Saved storage is unreadable or unavailable. Your files are unchanged. '+stripErrorPrefix(String(error));publishStartup({phase:'unavailable',error:message});setMessage(message);}
 }
 useEffect(()=>{void loadStoredWorkspace();return()=>{startupGeneration.current++;retireContextDialog();};},[]);

 const liveDataset=typeof workspace.sourceId==='string'?liveDatasets[workspace.sourceId]??null:null;
 const liveSourcesKey=Object.values(liveDatasets).map(row=>row.provenance.datasetId+'|'+row.provenance.revision).sort().join(',');
 // The session mode (Chart settings > Symbol > Extended trading hours, bottom toolbar ETH) shapes the chart
 // data once, here: every chart, legend, alert and paper path reads the same session view of each dataset.
 const workspaceSessionMode:SessionMode=workspace.chartSettings?.symbol?.session??'extended';
 const activeSession=workspace.grid?.cells[workspace.grid.layout.activeCellId]?.session;
 const sessionMode:SessionMode=activeSession??workspaceSessionMode;
 // Chart settings > Symbol > Adjust data for dividends (off by default) picks the Alpaca history basis:
 // split-adjusted, or split and dividend adjusted. A change reloads every open Alpaca feed on the new basis.
 const dividendsAdjustment=workspace.chartSettings?.symbol?.dividendsAdjustment===true;
 useEffect(()=>{preferAlpacaDividendAdjustment(dividendsAdjustment);},[dividendsAdjustment]);
 // Extended trading hours also decides which trades move a forming daily, weekly or monthly Alpaca bar.
 useEffect(()=>{preferAlpacaDailySession(workspaceSessionMode);},[workspaceSessionMode]);
 const rawDataset=useMemo(()=>{if(liveDataset&&workspace.sourceId===liveDataset.provenance.datasetId&&workspace.symbol===liveDataset.instrument.symbol)return liveDataset;const prepared=committedInput.current;/* A demo chart on its intraday series keeps sourceId null; the active cell source keys this memo too. */const activeSource=workspace.grid?.cells[workspace.grid.layout.activeCellId]?.datasetId;return prepared&&prepared.workspace.symbol===workspace.symbol&&prepared.workspace.sourceId===workspace.sourceId&&prepared.workspace.imports===workspace.imports&&(workspace.sourceId!==null||prepared.dataset.provenance.datasetId===activeSource)?prepared.dataset:selectedDataset(workspace);},[workspace.symbol,workspace.imports,workspace.sourceId,inputEpoch,liveDataset,workspace.sourceId===null?workspace.grid?.cells[workspace.grid.layout.activeCellId]?.datasetId:null]);
 // While a replay holds a frozen copy of this live chart, the chart, legend, data window and replay read
 // the copy; the live feed keeps updating rawDataset (liveDataset) underneath for alerts and ordinary paper.
 const frozenRaw=replaySnapshots?.[rawDataset.provenance.datasetId],pinnedRaw=frozenRaw&&frozenRaw.instrument.id===rawDataset.instrument.id&&frozenRaw.resolution===rawDataset.resolution?frozenRaw:rawDataset;
 const liveReplayHeld=replayHoldsLive(replaySnapshots);
 const dataset=useMemo(()=>cellSessionDataset(sessionDataset(rawCellSessionDataset(pinnedRaw),workspaceSessionMode),{session:activeSession}),[pinnedRaw,workspaceSessionMode,activeSession]);
 const replayStepSource=useMemo(()=>replayStepSourceOf(replaySession?.interval??null,dataset,cellReplaySources(dataset,{session:activeSession},pinReplayDatasets(workspaceDatasets(workspace),replaySnapshots))),[replaySession?.interval,dataset,workspace.imports,replaySnapshots]);
 const replayView=useMemo(()=>{if(!replaySession||replaySession.clock===null)return null;try{return replayChartView(replaySession,dataset,replayStepSource);}catch{return null;}},[replaySession?.runId,replaySession?.clock,dataset,replayStepSource]);
 // While the session's projected state is the guard state, the chart, indicators, scripts and the data window receive the replay frame (complete bars plus the forming bar) instead of replayPrefix.
 const bars=useMemo(()=>{const prepared=committedInput.current,view=replayView&&replay&&replayView.state?.runId===replay.runId&&replayView.state.cursor===replay.cursor?replayView:null;return prepared&&prepared.dataset===dataset&&prepared.replay?.runId===replay?.runId&&prepared.replay?.cursor===replay?.cursor&&!view?.frame.partial?prepared.bars:view?view.frame.bars:replay?replayPrefix(dataset,replay):dataset.bars;},[dataset,replay?.cursor,replay?.runId,inputEpoch,replayView]);
 // A derived build that cannot run yet (e.g. Renko ATR(14) with under 14 bars at a replay cursor) throws by design; in render that unmounted the whole App. No calculation bars instead; the chart shows the unavailable state.
 const calculationBars=useMemo(()=>{try{return calculationBarsForStyle(bars,workspace.chartStyle,derivedCalculationOptions(workspace.chartStyle,workspace.chartTypeSettings?.[workspace.chartStyle] as Record<string,unknown>|undefined,dataset.instrument.tickSize,!!replay||isLiveDatasetId(dataset.provenance.datasetId)));}catch{return [] as Bar[];}},[bars,workspace.chartStyle,workspace.chartTypeSettings,dataset,replay]);
 const source=useMemo(()=>sourceContextForDataset(dataset,bars),[dataset,bars]);
 const gridSymbols=gridSourceKey(workspace.grid);
 // The universe identity survives live growth (and unchanged recomputation), so grid cells, frame
 // fingerprints and dialog owners never treat a live update as a new set of sources.
 const universeRef=useRef<BarDataset[]|null>(null);
 const rawUniverse=useMemo(()=>{const prepared=committedInput.current;const next=!liveSourcesKey&&prepared&&prepared.workspace.imports===workspace.imports&&prepared.workspace.symbol===workspace.symbol&&gridSourceKey(prepared.workspace.grid)===gridSymbols?(prepared.datasets.some(row=>rawSessionDataset(row)!==row)?prepared.datasets.map(rawSessionDataset):prepared.datasets):workspaceDatasets(workspace);const stable=stableDatasetUniverse(universeRef.current,next);universeRef.current=stable;return stable;},[workspace.imports,workspace.symbol,gridSymbols,inputEpoch,liveSourcesKey,demoDataMode()/* the data mode re-keys the universe */]);
 // The session view keeps array identity whenever its members are unchanged (ownership checks compare the universe array).
 const universeViewRef=useRef<BarDataset[]|null>(null);
 const universe=useMemo(()=>{const views=sessionDatasets(rawUniverse,workspaceSessionMode),same=(list:readonly BarDataset[]|null|undefined)=>!!list&&list.length===views.length&&list.every((row,index)=>row===views[index]);
  const kept=views===rawUniverse?views:same(universeViewRef.current)?universeViewRef.current!:same(committedInput.current?.datasets)?committedInput.current!.datasets:views;universeViewRef.current=kept;return kept;},[rawUniverse,workspaceSessionMode]);
 const shownUniverse=shownUniverseOf(universe); // Not a hook (App tests rely on hook order)
 const symbolInfoUniverse=useRef(universe);symbolInfoUniverse.current=universe; // current universe for the memoized watchlist rail Symbol info opener
 // An All charts replay steps along every chart's replay-interval closes, and the other charts show their frames.
 // All charts replay reads the frozen copies of its live charts too.
 const replayUniverse=useMemo(()=>replaySnapshots?sessionDatasets(pinReplayDatasets(rawUniverse,replaySnapshots),workspaceSessionMode):universe,[replaySnapshots,rawUniverse,workspaceSessionMode,universe]);
 const replayTimelineNow=useMemo(()=>replaySession?.interval?replaySession.scope==='all'?cellReplayLayoutTimeline(replaySession,workspace.grid,replayUniverse):replayTimeline([replayStepSource??dataset]):[],[replaySession?.interval,replaySession?.scope,replaySession?.participants,replayStepSource,dataset,replayUniverse,workspace.grid]);
 const replayCellBars=useMemo(()=>{const frames=cellReplayLayoutFrames(replaySession,workspace.grid,replayUniverse);return Object.keys(frames).length?frames:undefined;},[replaySession?.runId,replaySession?.clock,replaySession?.scope,replaySession?.activeCellId,replaySession?.phase,replayUniverse,workspace.grid]);
 // The volume profile indicators read finer bars of the chart instrument from the loaded datasets.
 useEffect(()=>{setProfileDatasets(universe);},[universe]);
 const liveChoices=liveDataOf(workspace);
 /** Whether FRED downloads are allowed (Data sources setting; absent means on). */
 const fredRemoteOk=liveChoices.fred!==false;
 // Data sources > Data plan (Free by default). Paid switches every Alpaca feed and the stream to all exchanges.
 const alpacaPlan=liveChoices.alpacaPlan==='paid'?'paid':'free';
 useEffect(()=>{preferAlpacaDataPlan(alpacaPlan);},[alpacaPlan]);
 // App-level preferences. The notification-area choice is pushed to the main process once the workspace has
 // loaded and on every change; `trayAvailable` is false where the desktop app reports no tray (closing then quits).
 const appPreferences=appPreferencesOf(workspace),[trayAvailable,setTrayAvailable]=useState(()=>typeof window!=='undefined'&&typeof window.lv?.setTrayKeepRunning==='function');
 useEffect(()=>{if(!loaded)return;const lv=typeof window!=='undefined'?window.lv:undefined;if(typeof lv?.setTrayKeepRunning!=='function')return;let active=true;void lv.setTrayKeepRunning({keepRunning:appPreferences.keepRunningInTray}).then(result=>{if(active&&result?.ok)setTrayAvailable(result.value.supported);}).catch(()=>undefined);return()=>{active=false;};},[loaded,appPreferences.keepRunningInTray]);
 const changeAppPreferences=(next:AppPreferences)=>{commit({appPreferences:next});};
 // Wick mode, the always-on-top row of tabs (desktop main window only; wick-mode.ts).
 // The open layout tabs: their inactive tabs get background quote feeds after everything else (layoutTabFeeds).
 const [layoutTabIds,setLayoutTabIds]=useState<readonly string[]>([]);
 const wickMode=useWickMode({enabled:!secondaryWindow,loaded,preferences:appPreferences,onPreferences:changeAppPreferences,report:setMessage});
 // Watchlist rows and list-alert members that no chart streams get background live feeds (WatchFeedHost); quotes read each live source's newest snapshot.
 const watchFeeds=liveData.getWatchFeeds(),watchHost=useRef<WatchFeedHost|null>(null),[listAlertTarget,setListAlertTarget]=useState<string|null>(null),[listAlertEditing,setListAlertEditing]=useState<string|null>(null);
 const watchQuotes=useMemo(()=>watchQuoteDatasets(universe,liveDatasets,watchFeeds.datasets),[universe,liveDatasets,watchFeeds.datasets]);
 const liveSearch=useMemo(()=>[...coinbaseSearchDatasets(liveChoices.coinbase,dataset.resolution),...alpacaSearchDatasets(alpacaKeyConfigured,liveChoices.alpacaSymbols,dataset.resolution)],[liveChoices.coinbase,liveChoices.alpacaSymbols.join(','),alpacaKeyConfigured,dataset.resolution]);
 const symbolCandidates=useMemo(()=>buildSymbolSearchCandidates([...shownUniverse,...liveSearch],workspace.imports),[shownUniverse,liveSearch,workspace.imports]);
 // Symbol info, the interval menu and dialog and the object tree read the chart's identity, not its bars:
 // chartIdentity is the same object while a live feed only grows (keepLiveIdentity); other datasets pass through.
 const chartIdentity=keepLiveIdentity(surfaces.identity,dataset);
 const plainIntervalUniverse=useMemo(()=>[...universe,...liveSiblings(chartIdentity)],[universe,chartIdentity]),intervalUniverse=useMemo(()=>withDemoSiblings(plainIntervalUniverse,chartIdentity),[plainIntervalUniverse,chartIdentity]); // Demo intraday sources join interval choices only
 /** The interval each bottom range button opens on this chart's data (see servedBottomRange). */
 /** The range buttons' servable check builds a full aggregate per interval, once per newly opened symbol (cold aggregation cache). It reads a deferred copy of its inputs so that cost runs in a follow-up render, not in the click task. */
 /* The same universe as the click (demo intraday siblings included); the plain one named 30 minutes on demo 1D, which opens 1m. */const bottomServedInputs=useMemo(()=>({universe:intervalUniverse,identity:chartIdentity,policy:workspace.intervals.policy}),[intervalUniverse,chartIdentity,workspace.intervals.policy]),deferredServedInputs=useDeferredValue(bottomServedInputs);
 /* The tooltips name the interval a click opens (fitted to the bars the plot can show). */const bottomCapacity:number|null=(chart as {maxVisibleBars?:()=>number|null}|null)?.maxVisibleBars?.()??null;
 const bottomServed=useMemo(()=>{const {universe:servedUniverse,identity:servedIdentity,policy:servedPolicy}=deferredServedInputs,known=new Map<string,boolean>(),servable=(id:string)=>{let ok=known.get(id);if(ok===undefined){try{ok=resolveIntervalSwitch(servedUniverse,servedIdentity,id,servedPolicy,true).ok;/* Availability only, no bar copies */}catch{ok=false;}known.set(id,ok);}return ok;};/* Unevaluated, one thunk per row; the toolbar answers them in idle slices once a chart is open (about 100 ms of aggregation left the startup render). */return lazyServedRows(BOTTOM_RANGES.map(row=>[row.preset,()=>fittedBottomRange(row,servable,bottomCapacity)] as const));},[deferredServedInputs,bottomCapacity]);
 // LIVE: a feed closes (and unsubscribes) as soon as no chart names it, e.g. after a symbol or interval switch.
 // Except the feeds of recently left layout tabs, kept warm within their budget until they go idle.
 function sweepLiveFeeds(grid:Workspace['grid']){
  const now=Date.now(),warm=warmFeeds.current,named=(id:string)=>gridReferencesDataset(grid,id);
  const demand=new Set<string>([...[...liveHandles.current.keys()].filter(named).map(warmAlpacaSymbol).filter((symbol):symbol is string=>symbol!==null),...warm.alerts.symbols,...secondSymbolAlpaca.current()]);
  const keep=warmFeedIds(warm,now,demand,warm.alerts.waiting);
  for(const id of [...liveHandles.current.keys()])if(!named(id)&&!keep.has(id))closeLiveHandle(id);
  scheduleWarmSweep(warm,now,()=>sweepLiveFeeds(current.current.grid));
 }
 useEffect(()=>{sweepLiveFeeds(workspace.grid);},[workspace.grid]);
 // LIVE: turning Coinbase off moves the chart off the feed, closes it and disposes the provider (main closes the socket).
 // Saved live charts come back on restore and whenever the live settings change: enabled sources reopen, disabled ones say why.
 // They wait for main's Alpaca key status (which also picks the keyless stub's namespace), so a saved Alpaca
 // chart is never shown as turned off just because the status arrived after the workspace. The wait is bounded
 // (ALPACA_KEY_STATUS_WAIT_MS): then the other live charts reopen and Alpaca ones say they are waiting, and a late status
 // reopens them here. A stand-in already on the grid reopens with the grid unchanged, so listed feeds always open.
 // Escape (outside dialogs and text fields) dismisses the status toast while it shows (6 s; 10 s with an action).
 useEffect(()=>{if(!message)return;const release=registerToast({},()=>setMessageState(''));const timer=setTimeout(release,statusAction?10000:6000);return()=>{clearTimeout(timer);release();};},[message]);
 useEffect(()=>{if(!loaded||!alpacaKeyKnown)return;const r=reconnectLiveCharts(current.current,{coinbase:liveChoices.coinbase,alpacaKey:alpacaKeyConfigured,alpacaPending:alpacaKeyPending,fred:fredRemoteOk});if(r.workspace!==current.current&&!commit({grid:r.workspace.grid}))return;reopenLiveEntries(r.reopen,r.fredReopen);if(r.disconnected[0])setMessage(r.disconnected[0].message);},[loaded,alpacaKeyKnown,alpacaKeyPending,liveChoices.coinbase,fredRemoteOk,alpacaKeyConfigured,liveReconnectTick]);
 // An effect that throws reaches the recovery boundary and takes every open dialog with it, so a
 // failure moving charts off the live source is reported instead (the feeds still close).
 useEffect(()=>{if(liveChoices.coinbase)return;
  // A derived chart with a Coinbase component closes too (and its components with it) and shows the usual
  // Disconnected stand-in under the same dataset id; turning Coinbase back on reopens it (reconnectLiveCharts, waiting stand-in).
  for(const id of [...liveHandles.current.keys()]){const ref=liveRefOfDatasetId(id);if(!ref||ref.providerId!==SYMBOL_MATH_PROVIDER_ID||!liveRefDependsOn(ref,'coinbase'))continue;closeLiveHandle(id);const holder=liveChartPlaceholder(ref,false);if(holder){registerLiveDataset(holder);setLiveDatasets(prior=>({...prior,[id]:holder}));}}
  // Only the Coinbase charts and comparisons move to their saved-file fallback; Alpaca and other live charts stay live.
  const ids=[...liveHandles.current.keys()].filter(id=>id.startsWith('live:'+COINBASE_PROVIDER_ID+':'));
  if(ids.length){let moved=true;try{const ws=current.current,safe=moveSourceChartsOff(ws,'coinbase');if(safe&&safe!==ws.grid&&!commit({grid:safe}))moved=false;}catch(error){moved=false;reportFailure(error);}if(!moved)return;for(const id of ids)closeLiveHandle(id);}
  coinbaseProvider.current?.dispose();coinbaseProvider.current=null;},[liveChoices.coinbase]);
 // The Alpaca key removed (Settings > Data sources). Only Alpaca-dependent feeds close: a plain Alpaca chart or
 // comparison, and a derived chart with an Alpaca component. Each shows the Disconnected stand-in under its own dataset id, so
 // entering the key again reopens it (reconnectLiveCharts, waiting stand-in). Coinbase charts stay live. Before the first key
 // status no Alpaca feed is open, so this does nothing at startup.
 useEffect(()=>{if(alpacaKeyConfigured)return;
  for(const id of [...liveHandles.current.keys()]){const ref=liveRefOfDatasetId(id);if(!ref||!liveRefDependsOn(ref,'alpaca'))continue;closeLiveHandle(id);const holder=liveChartPlaceholder(ref,false);if(holder&&holder.provenance.datasetId===id){registerLiveDataset(holder);setLiveDatasets(prior=>({...prior,[id]:holder}));}}
 },[alpacaKeyConfigured]);
 useEffect(()=>{const lv=window.lv;if(!lv?.alpacaKeyStatus){setAlpacaKeyKnown(true);return;}let active=true;
  // Never wait forever. Unanswered after ALPACA_KEY_STATUS_WAIT_MS, the key counts as unavailable for now.
  const timer=setTimeout(()=>{if(!active)return;setAlpacaKeyPending(true);setAlpacaKeyKnown(true);},ALPACA_KEY_STATUS_WAIT_MS);
  void lv.alpacaKeyStatus().then(result=>{if(active&&result.ok){try{const clock=readSyntheticMarketClock(result.value);if(result.value.synthetic===true)selectAlpacaSyntheticStub(true,clock);setSyntheticClock(clock);setAlpacaKeyConfigured(result.value.configured);}catch{setAlpacaKeyConfigured(false);setMessage('Live stocks are off for this session.');}}}).catch(()=>{}).then(()=>{clearTimeout(timer);if(active)setAlpacaKeyPending(false);}).finally(()=>{if(active)setAlpacaKeyKnown(true);});return()=>{active=false;clearTimeout(timer);};},[]);
 const startupOpenDone=useRef(false);
 useEffect(()=>{
  if(!loaded||!alpacaKeyKnown||startupOpenDone.current)return;
  startupOpenDone.current=true;
  const lv=window.lv;if(!lv?.startupOpenSymbol&&!lv?.startupOpenSymbols)return;
  // The key check did not answer in time. Alpaca symbols still get live charts, on stand-ins that wait for it
  // (ALPACA_KEY_WAIT_MESSAGE); the reconnect effect opens them when it answers. Never a non-live or synthetic fallback.
  const alpacaWaiting=alpacaKeyPending&&!alpacaKeyConfigured,alpacaUsable=alpacaKeyConfigured||alpacaWaiting;
  const providerOf=(source:'alpaca'|'coinbase')=>source==='alpaca'?ALPACA_IEX_PROVIDER_ID:COINBASE_PROVIDER_ID;
  const layoutStartup=(open:StartupSymbol[])=>{
   let built;try{built=buildStartupLiveGrid(current.current,open,STARTUP_OPEN_INTERVAL,{coinbase:liveChoices.coinbase,alpacaKey:alpacaKeyConfigured,alpacaPending:alpacaWaiting,fred:fredRemoteOk},undefined,(zone,data)=>liveOpenTimezone(zone,current.current,data.instrument));}
   catch(error){setMessage('The startup charts could not be laid out: '+(error instanceof Error?error.message:String(error)));return;}
   if(!commit({grid:built.grid}))return;
   reopenLiveEntries(built.reopen);
   // The active chart follows the Default chart timezone for its live symbol (was: New York for any Alpaca list).
   const activeLive=liveDatasetById(built.grid.cells[built.grid.layout.activeCellId]?.datasetId),zone=activeLive?liveOpenTimezone(current.current.chartOptions?.timezone,current.current,activeLive.instrument):null;
   if(zone)commit({chartOptions:{...current.current.chartOptions,timezone:zone}});
   // Waiting Alpaca charts: run the reconnect pass again now, in case the key check answered while this was being laid out.
   if(alpacaWaiting&&open.some(row=>row.source==='alpaca')){setLiveReconnectTick(value=>value+1);setMessage(ALPACA_KEY_WAIT_MESSAGE);}
  };
  void (async()=>{
   const many=lv.startupOpenSymbols?await lv.startupOpenSymbols():null;
   const list=many?.ok&&many.value?parseStartupOpenSymbols([STARTUP_OPEN_SYMBOLS_FLAG+many.value]):null;
   if(!list){
    // Single symbol, exactly as before.
    const r=lv.startupOpenSymbol?await lv.startupOpenSymbol():null;
    if(!r?.ok||!r.value)return;
    const action=decideStartupOpen({symbol:parseStartupOpenSymbol([STARTUP_OPEN_FLAG+r.value]),alpacaKeyConfigured:alpacaUsable,coinbaseEnabled:liveChoices.coinbase});
    if(action.kind==='message')setMessage(action.text);
    else if(action.kind==='open-live'&&action.source==='alpaca'&&alpacaWaiting)layoutStartup([{source:'alpaca',symbol:action.symbol}]);
    else if(action.kind==='open-live')openLive(action.source==='alpaca'?ALPACA_IEX_PROVIDER_ID:COINBASE_PROVIDER_ID,action.symbol,STARTUP_OPEN_INTERVAL);
    return;
   }
   // Several symbols: check each against the owner's Alpaca asset list (real symbol, e.g. GME-WS -> GME.WS), open the found ones.
   const lookup=alpacaKeyConfigured&&lv.searchAlpacaAssets?(query:string)=>lv.searchAlpacaAssets!({query}):null;
   const resolved=await resolveStartupSymbols(list.symbols,lookup);
   const decision=decideStartupOpenMany({...resolved,rejected:list.rejected,alpacaKeyConfigured:alpacaUsable,coinbaseEnabled:liveChoices.coinbase});
   if(decision.open.length===1&&!(alpacaWaiting&&decision.open[0].source==='alpaca'))openLive(providerOf(decision.open[0].source),decision.open[0].symbol,STARTUP_OPEN_INTERVAL);
   else if(decision.open.length)layoutStartup(decision.open);
   // The saved Alpaca stream list includes every chart opened here (within 30), so alerts on all of them keep running.
   const alpacaOpen=decision.open.filter(row=>row.source==='alpaca').map(row=>row.symbol);
   if(alpacaOpen.length){const saved=liveDataOf(current.current),merged=mergeStreamSymbols(saved.alpacaSymbols,alpacaOpen);if(merged.join(',')!==saved.alpacaSymbols.join(','))commit({liveData:{...saved,alpacaSymbols:merged}});}
   if(decision.message)setMessage(decision.message);
  })().catch(()=>{});
 },[loaded,alpacaKeyKnown]);
 useEffect(()=>()=>{if(holdRetry.current.timer!==null)clearTimeout(holdRetry.current.timer);holdRetry.current.timer=null;const throttle=liveThrottle.current;if(throttle.timer!==null)clearTimeout(throttle.timer);throttle.timer=null;throttle.pending.clear();stopWarmSweep(warmFeeds.current);for(const handle of liveHandles.current.values())handle.close();liveHandles.current.clear();symbolMathProvider.current?.dispose();symbolMathProvider.current=null;coinbaseProvider.current?.dispose();alpacaProvider.current?.dispose();clearLiveDatasets();},[]);
 const replayMenu=useMemo(()=>replayIntervalMenu(replaySession?.participants??replayParticipantsOf(workspace,universe).filter(row=>row.cellId===workspace.grid?.layout.activeCellId),universe),[workspace,universe,replaySession?.participants]);
 function openSymbolSearch(query:string,origin:SymbolSearchOrigin){setSymbolSearch({id:crypto.randomUUID(),query,origin});setDialog('symbol-search');}
 /** Quick search (Ctrl+K, the toolbar magnifier). */
 function openQuickSearch(query=''){setQuickSearchSeed({id:crypto.randomUUID(),query});setDialog('quick-search');}
 /** One symbol choice, from Symbol search (after its dialog check) or a Quick search row: derived, live or local source. */
 function openSymbolRequest(request:SymbolSwitchRequest):boolean{/* A FRED series loads on demand (cache first), then opens like any registered source. Never demo data. */if(request.providerId===FRED_PROVIDER_ID){openFred(request.symbol);return true;}if(request.providerId===SYMBOL_MATH_PROVIDER_ID){const ok=openLive(SYMBOL_MATH_PROVIDER_ID,request.symbol,request.resolution);if(ok)rememberRecentSymbol(recentStorage(),request.symbol);if(ok&&!queuedSwitch.current)setMessage('Opened '+request.symbol+' (derived from its component feeds), '+request.resolution+'.');return ok;}if(isLiveProviderId(request.providerId)){const ok=openLive(request.providerId,request.symbol,request.resolution);if(ok)rememberRecentSymbol(recentStorage(),request.symbol);if(ok&&!queuedSwitch.current)setMessage('Opened '+request.symbol+', '+shortIntervalText(request.resolution)+'.')/* A plain toast, no exchange id. */;return ok;}if(request.sourceId!==null&&!current.current.imports.some(row=>row.provenance.datasetId===request.sourceId))return false;const ok=switchSymbol(request.symbol,request.sourceId);if(ok)rememberRecentSymbol(recentStorage(),request.symbol);if(ok&&!queuedSwitch.current)setMessage(request.symbol+', '+shortIntervalText(request.resolution)+(request.synthetic?(demoDataMode()==='example'?' (example data)':' (synthetic demo data)'):''));return ok;}
 currentInput.current={dataset,datasets:universe,bars,replay};
 const frameCalculator=useMemo(()=>createFrameFingerprintCalculator(),[]),activeFrameCell=workspace.grid?.cells[workspace.grid.layout.activeCellId];
 const [dialogFrameState,setDialogFrameState]=useState<{cell:MultiChartCellState;datasets:BarDataset[];values:Readonly<Record<string,string>>}|null>(null);
 useEffect(()=>{let owned=true;if(!activeFrameCell||!['chart-settings'].includes(dialog??''))return;void frameCalculator(activeFrameCell,universe).then(values=>{if(owned)setDialogFrameState({cell:activeFrameCell,datasets:universe,values});},error=>{if(owned){setDialogFrameState(null);setMessage('Chart settings are unavailable:'+String(error));}});return()=>{owned=false;};},[activeFrameCell,universe,dialog,frameCalculator]);
 // Chart and source captured when Settings opened: the frame-safe Ok path refuses to apply if either has changed since.
 const settingsOpening=useRef<{controller:NonNullable<typeof chart>;source:ReturnType<NonNullable<typeof chart>['sourceContext']>;style:string}|null>(null);
 useEffect(()=>{if(dialog==='chart-settings'&&chart){if(!settingsOpening.current)settingsOpening.current={controller:chart,source:chart.sourceContext(),style:chart.getStyle()};}else if(dialog!=='chart-settings')settingsOpening.current=null;},[dialog,chart]);
 const settingsEntry=useRef<ChartSettingsTabId|null>(null),storagePending=useRef(false);
 /** The empty Strategy tester's action, the same route as the Script editor command. */
 function openScriptEditor(){if(scriptDocked)changeBottomPanel(view=>openBottomTab(view,'script'));else setDialog('script');}
 function openSettings(tab:ChartSettingsTabId|null=null){if(tab==='datasources')saveScriptDraft();settingsEntry.current=tab;setDialog('chart-settings');}
 const dialogFrameFingerprints=dialogFrameState&&dialogFrameState.cell===activeFrameCell&&dialogFrameState.datasets===universe?dialogFrameState.values:undefined;
 function applyChartConfiguration(patch:Partial<Workspace>,frame?:HistoricalChartFrame,opening?:HistoricalChartFrame):boolean{
  try{
   const before=current.current,id=before.grid?.layout.activeCellId;
   if(!id||!activeFrameCell||before.grid!.cells[id]!==activeFrameCell||currentInput.current?.datasets!==universe||!chart||activeController.current!==chart||!dialogFrameFingerprints||!frame||!opening)throw new Error('The chart changed. Reopen the settings.');
   const next=patchWorkspace(before,patch),cell=next.grid.cells[id],expected={source:chart.sourceContext(),style:chart.getStyle(),calculationFingerprints:dialogFrameFingerprints};
   const close=assertHistoricalFrameCompatible(frame,expected),start=assertHistoricalFrameCompatible(opening,expected);
   for(const [settings,value] of [[cell.chartOptions,close],[before.grid!.cells[id].chartOptions,start]] as const){const price=value.panes.find(pane=>pane.key.kind==='price')!,scale=price.log?'logarithmic':price.mode==='price'?'linear':price.mode;if(settings.scale!==scale||settings.invert!==price.invert||settings.auto!==(price.manualRange===null))throw new Error('Chart settings are out of sync. Reopen them.');}
   const grid={...next.grid,cells:{...next.grid.cells,[id]:{...cell,frame:close}}},historyBaseline=projectGrid(before,{...before.grid!,cells:{...before.grid!.cells,[id]:{...before.grid!.cells[id],frame:start}}});
   const roots:Partial<Workspace>={...(patch.themeId!==undefined?{themeId:patch.themeId}:{}),...(patch.chartSettings!==undefined?{chartSettings:patch.chartSettings}:{})};
   return commit({grid,...roots},historyBaseline);
  }catch(error){reportFailure(error);return false;}
 }
 async function requestLayoutResize(expectedGrid:MultiChartState,nextGrid:MultiChartState):Promise<boolean>{
  // A layout pick that meets the routine background autosave write waits for it (a few tens of ms) and then runs
  // through the newest render's handler, instead of being refused with "A workspace operation is finishing".
  if(backgroundWriteActive()){await new Promise<void>(resolve=>{afterStorageWrite(resolve);});await new Promise<void>(resolve=>setTimeout(resolve,32));return gridHandlers.current.requestLayoutResize(expectedGrid,nextGrid);}
  if(workspaceTransaction.current||storageMutation.current){setMessage('The workspace is busy. Try again in a moment.');return false;}
  let ownsTransaction=false;
  try{
   assertStartupEditable(startup.current);
   const expected=current.current,opening=currentInput.current,host=gridHost.current;
   if(expected!==workspace||expected.grid!==expectedGrid||!opening||!host)throw new Error('The chart layout changed or is still loading. Select the layout again.');
   const next=patchWorkspace(expected,{grid:nextGrid});financialGuard.current(next,financial.current.alerts,financial.current.paper);
   const structural=expectedGrid.layout.cells.length!==nextGrid.layout.cells.length||expectedGrid.layout.cells.some(row=>!nextGrid.cells[row.id]);
   if(!structural)return commit({grid:nextGrid});
   if(currentReplay.current?.playing){const paused=setReplayPlaying(currentReplay.current,false);currentReplay.current=paused;setReplay(paused);}
   const expectedReplay=currentReplay.current,active=nextGrid.layout.cells.find(row=>row.id===nextGrid.layout.activeCellId)!,matches=opening.datasets.filter(row=>row.provenance.datasetId===nextGrid.cells[active.id].datasetId&&row.instrument.symbol===active.symbol&&row.resolution===active.interval);
   if(matches.length!==1)throw new Error('Pick a chart first. The layout is unchanged.');
   const preserveActive=nextGrid.layout.activeCellId===expectedGrid.layout.activeCellId&&sameChartSourceBasis(sourceContextForDataset(cellSessionDataset(matches[0],nextGrid.cells[active.id])),sourceContextForDataset(opening.dataset),true),nextDataset=preserveActive?opening.dataset:cellSessionDataset(matches[0],nextGrid.cells[active.id]),nextReplay=preserveActive?expectedReplay:null,nextBars=preserveActive?opening.bars:nextDataset.bars;
   workspaceTransaction.current=true;ownsTransaction=true;setWorkspaceBusy(true);
   const stillCurrent=()=>current.current===expected&&current.current.grid===expectedGrid&&currentReplay.current===expectedReplay&&gridHost.current===host&&currentInput.current?.datasets===opening.datasets&&(currentInput.current?.bars===opening.bars||typeof sameBarsInput==='function'&&sameBarsInput(currentInput.current?.bars,opening.bars));
   const outcome=await host.transition({expected:{state:expectedGrid,datasets:opening.datasets,activeBars:opening.bars,activeDatasetId:opening.dataset.provenance.datasetId,activeExecutionIdentity:expectedReplay?.runId??'ordinary'},next:{state:nextGrid,datasets:opening.datasets,activeBars:nextBars,activeDatasetId:nextDataset.provenance.datasetId,activeExecutionIdentity:nextReplay?.runId??'ordinary'},view:{drawingPreferences:next.drawingPreferences,appearance:next.appearance,chartSettings:next.chartSettings},assertCurrent:stillCurrent,commitModel:(canonical,markCommitted)=>{
    if(!stillCurrent())throw new Error('The layout changed while loading. Try again.');
    const committed=projectGrid(next,canonical);financialGuard.current(committed,financial.current.alerts,financial.current.paper);
    history.current.record(expected,expectedReplay);
    committedInput.current={workspace:committed,dataset:nextDataset,datasets:opening.datasets,replay:nextReplay,bars:nextBars};current.current=committed;currentReplay.current=nextReplay;
    markCommitted();
    setWorkspace(committed);setReplay(nextReplay);setInputEpoch(value=>value+1);takeSymbol(nextDataset.instrument.symbol);setStrategyExecution(null);followReplayGuard(nextReplay,nextGrid.layout.activeCellId);
   }});
   if(!outcome.committed)throw new Error(outcome.errors.join(' ')||'The new charts were not ready. The previous layout is unchanged.');
   setMessage('Chart layout changed.'+(outcome.errors.length?' The accepted layout needs recovery: '+outcome.errors.join(' ')+' Reload the workspace to retry.':''));return true;
  }catch(error){reportFailure(error);return false;}
  finally{if(ownsTransaction){workspaceTransaction.current=false;setWorkspaceBusy(false);}}
 }
 async function openSavedLayout(expected:Workspace,id:string,assertRequest:()=>void):Promise<void>{
  assertRequest();
  assertStartupEditable(startup.current);if(workspaceTransaction.current||storageMutation.current||saving.current)throw new Error('The workspace is busy. Try again in a moment.');
  const opening=currentInput.current,host=gridHost.current,expectedReplay=currentReplay.current;let acceptedOwner:Workspace|null=null;
  if(current.current!==expected||!expected.grid||!opening||!host)throw new Error('The layout changed or is still loading. Review the saved layout again.');
  const leavingLayout=expected.layoutLibrary!.activeId;
  // The replay of the layout being left is paused and kept for that layout (layout-replay-stash.ts).
  const replayLeft=replaySessionRef.current,replayRemembered=replaySaved;
  // Its replay paper account goes with it.
  const paperLeft=replayLeft?currentReplayPaper.current:null;
  const openedBook=openedLayout(expected.layoutLibrary!,id),openedLive=liveTabGrid(expected,openedBook.grid,{coinbase:liveChoices.coinbase,alpacaKey:alpacaKeyConfigured,alpacaPending:alpacaKeyPending,fred:fredRemoteOk},expected.grid.layout.id),openedRaw={...openedBook,grid:openedLive.grid},openedSync=openLayoutLibraryEntry(openedRaw.grid.layout,expected.drawingUtility),opened={...openedRaw,grid:{...openedRaw.grid,layout:openedSync.layout}},/* Globally synced drawings reach the opening layout's charts of the same symbol. */openedGlobal=applyGlobalDrawings(expected.globalDrawings??{},opened.grid),next=projectGrid({...expected,layoutLibrary:opened.library,globalDrawings:openedGlobal.store},openedGlobal.grid);/* Validate what a save would write: a live chart cell is kept as its reference, never as a saved dataset. */prepareWorkspaceData({...persistableWorkspace(next),paper:financial.current.paper,alerts:financial.current.alerts,...(financial.current.paperBook?{paperBook:financial.current.paperBook}:{})});
  const nextDatasets=sessionDatasets(workspaceDatasets(next),workspaceSessionMode),active=next.grid.layout.cells.find(row=>row.id===next.grid.layout.activeCellId)!,matches=nextDatasets.filter(row=>row.provenance.datasetId===next.grid.cells[active.id].datasetId&&row.instrument.symbol===active.symbol&&row.resolution===active.interval);
  if(matches.length!==1)throw new Error('Pick a chart first. The layout is unchanged.');const nextDataset=cellSessionDataset(matches[0],next.grid!.cells[active.id]),nextBars=nextDataset.bars;
  const stillCurrent=()=>{try{assertRequest();return current.current===expected&&currentReplay.current===expectedReplay&&gridHost.current===host&&currentInput.current?.datasets===opening.datasets&&(currentInput.current?.bars===opening.bars||typeof sameBarsInput==='function'&&sameBarsInput(currentInput.current?.bars,opening.bars));}catch{return false;}};
  workspaceTransaction.current=true;setWorkspaceBusy(true);
  try{const outcome=await host.transition({expected:{state:expected.grid,datasets:opening.datasets,activeBars:opening.bars,activeDatasetId:opening.dataset.provenance.datasetId,activeExecutionIdentity:expectedReplay?.runId??'ordinary'},next:{state:next.grid,datasets:nextDatasets,activeBars:nextBars,activeDatasetId:nextDataset.provenance.datasetId,activeExecutionIdentity:'ordinary'},view:{drawingPreferences:next.drawingPreferences,appearance:next.appearance,chartSettings:next.chartSettings},assertCurrent:stillCurrent,park:leavingLayout!==id,commitModel:(canonical,markCommitted)=>{
    if(!stillCurrent())throw new Error('The layout changed while loading. Try again.');const scriptLibrary=withScriptDraft(next).scriptLibrary;/* The script library is workspace-wide, so the draft goes with it. */leaveWarmLayout(warmFeeds.current,leavingLayout,id,liveHandles.current.keys(),dataset=>gridReferencesDataset(expected.grid,dataset),Date.now());const committed=projectGrid({...next,scriptLibrary},canonical);financialGuard.current(committed,financial.current.alerts,financial.current.paper);
    acceptedOwner=committed;current.current=committed;currentReplay.current=null;currentReplayPaper.current=null;committedInput.current={workspace:committed,dataset:nextDataset,datasets:nextDatasets,replay:null,bars:nextBars};currentInput.current={dataset:nextDataset,datasets:nextDatasets,replay:null,bars:nextBars};switchLayoutHistory(history,leavingLayout,id,()=>createWorkspaceHistory<Workspace>());strategyBindings.current.clear();financialGeneration.current++;markCommitted();
    setDialog(null);setFinancialEpoch(financialGeneration.current);setWorkspace(committed);setReplay(null);setReplaySession(null);setReplayPaper(null);setStrategyExecution(null);setSelectedDrawing(null);setActiveTool(null);setActiveMode(null);setPreview(null);hoverInspection.setInspection(null);scriptDraft.current?.settle();setScriptEpoch(value=>value+1);setInputEpoch(value=>value+1);takeSymbol(next.symbol);
   }});
   if(!outcome.committed)throw new Error(outcome.errors.join(' ')||'The saved chart layout was not ready. The previous layout is unchanged.');
   const replayHandoff=switchLayoutReplay(layoutReplays.current,leavingLayout,id,replayLeft,replayRemembered,Date.now(),paperLeft);if(!replayHandoff.same){setReplaySaved(replayHandoff.restored);setReplayPanelHidden(false);}
   reopenLiveEntries(openedLive.reopen);
   if(outcome.errors.length)throw new Error('The selected layout is active but needs recovery: '+outcome.errors.join(' '));/* "replay ended" only when a replay was running. */const replayRan=!!(replayLeft||expectedReplay);setMessage('Opened '+activeSavedLayout(current.current.layoutLibrary!).name+(leavingLayout===id?(replayRan?'. Chart Undo was cleared and replay ended.':'. Chart Undo was cleared.'):(replayRan?'. Replay ended.':'.')));
   const replayNote=layoutReplayNote(replayHandoff);if(replayNote)setMessage('Opened '+activeSavedLayout(current.current.layoutLibrary!).name+'. '+replayNote);
  }catch(error){let owned=acceptedOwner!==null&&current.current===acceptedOwner;if(!owned)try{assertRequest();owned=current.current===expected;}catch{/* A retired dialog cannot publish failure into its replacement. */}if(owned)reportFailure(error);throw error;}finally{workspaceTransaction.current=false;setWorkspaceBusy(false);}
 }
 /** origin 'menu': the header layout dropdown, which runs with no dialog open; any dialog opened meanwhile retires the request. */
 async function layoutAction(action:LayoutLibraryAction,origin:'dialog'|'menu'='dialog'):Promise<void>{
  // A layout window only saves its layout; opening a layout shown in another window focuses that window.
  if(secondaryWindow&&action.kind!=='save')throw new Error(SECONDARY_LAYOUT_REFUSAL);
  if(!secondaryWindow&&action.kind==='delete'&&layoutWindowIds.includes(action.id))throw new Error('That layout is open in another window. Close that window first.');
  if(!secondaryWindow&&action.kind==='open'&&layoutWindowIds.includes(action.id)){const result=await window.lv?.openLayoutWindow?.({layoutId:action.id});if(result&&!result.ok)throw new Error(result.error.message);setMessage(OPEN_ELSEWHERE_MESSAGE);return;}
  assertDialogContext(false);assertStartupEditable(startup.current);const operationAuthority=dialogAuthority.current,owner=origin==='menu'?null:'layouts';const assertRequest=()=>{if(dialogAuthority.current!==operationAuthority||dialogOwner.current!==owner)throw new Error('This layout request was closed or replaced.');};let expected=current.current;
  if(expected!==workspace||!expected.grid||!expected.layoutLibrary)throw new Error('The layout changed. Reopen this dialog.');
  if(action.kind==='export'){if(!window.lv)throw new Error('Export needs the desktop app.');const text=exportLayoutText(persistableWorkspace(expected)),result=await window.lv.exportData({text,suggestedName:'OpenCandle-layout.json',format:'json'});if(dialogAuthority.current!==operationAuthority||dialogOwner.current!==owner||current.current!==expected)return;if(!result.ok)throw new Error(result.error.message);setMessage('Layout exported. Price data and accounts are not included.');return;}
  if(action.kind==='import'){if(!window.lv)throw new Error('Import needs the desktop app.');const datasets=currentInput.current!.datasets,result=await window.lv.importData({kind:'layouts'});if(!result.ok){if(result.error.code==='CANCELLED')return;throw new Error(result.error.message);}assertDialogContext(false);if(current.current!==expected||currentInput.current?.datasets!==datasets)throw new Error('The workspace changed while choosing the layout file. Choose it again.');const preview=previewLayoutText(result.value.text,expected);setLayoutImport({...preview,workspace:expected,datasets});setDialog('import-layout');return;}
  if(action.kind==='save'){const next={...expected,layoutLibrary:prepareLayoutSave(expected.layoutLibrary,expected.grid,Date.now())};await persistLayoutCandidate(expected,next,'Layout saved locally.');return;}
  if(action.kind==='autosave'||action.kind==='favorite'||action.kind==='rename'){
   let next:Workspace;
   if(action.kind==='rename'){const result=renameSavedLayout(expected.layoutLibrary,expected.grid,action.id,action.name);next=projectGrid({...expected,layoutLibrary:result.library},result.grid);}
   else next={...expected,layoutLibrary:action.kind==='favorite'?favoriteSavedLayout(expected.layoutLibrary,action.id):{...expected.layoutLibrary,autosave:action.enabled}};
   if(action.kind==='autosave'&&action.enabled)next={...next,layoutLibrary:prepareLayoutSave(next.layoutLibrary!,next.grid!,Date.now())};await persistLayoutCandidate(expected,next,'Layout settings saved locally.');return;
  }
  const switches=action.kind!=='delete'||action.id===expected.layoutLibrary.activeId,dirty=layoutIsDirty(expected.layoutLibrary,expected.grid),target='id' in action?expected.layoutLibrary.entries.find(row=>row.id===action.id):null;
  if('id' in action&&!target)throw new Error('The chosen saved layout no longer exists.');
  if(switches&&dirty&&!expected.layoutLibrary.autosave&&!action.decision)throw new Error('Choose Save and open, Discard and open, or Cancel.');
  if(switches&&dirty&&(expected.layoutLibrary.autosave||action.decision==='save')){const next={...expected,layoutLibrary:prepareLayoutSave(expected.layoutLibrary,expected.grid,Date.now())};await persistLayoutCandidate(expected,next,'Layout saved locally.');assertRequest();expected=next;}
  if(action.kind==='open'){await openSavedLayout(expected,action.id,assertRequest);return;}
  if(action.kind==='create'||action.kind==='duplicate'){
   const original=action.kind==='create'?createMultiChartState(currentInput.current!.dataset,{appearance:defaultTheme.appearance,themeId:defaultTheme.id,chartOptions:{source:'close',scale:'linear',invert:false,auto:true,timezone:newChartTimezone(expected,currentInput.current!.dataset.instrument)}}):action.id===expected.layoutLibrary!.activeId?expected.grid!:expected.layoutLibrary!.entries.find(row=>row.id===action.id)!.grid;
   const copy=duplicateSavedLayout(expected.layoutLibrary!,expected.grid!,original,action.name,Date.now(),()=>crypto.randomUUID()),next={...expected,layoutLibrary:copy.library};await persistLayoutCandidate(expected,next,'New layout saved locally.');assertRequest();await openSavedLayout(next,copy.entry.id,assertRequest);return;
  }
  if(action.kind==='delete'){
   if(action.id===expected.layoutLibrary!.activeId){if(!action.replacementId||action.replacementId===action.id)throw new Error('Choose a different replacement layout.');await openSavedLayout(expected,action.replacementId,assertRequest);expected=current.current;}
   const next={...expected,layoutLibrary:deleteSavedLayout(expected.layoutLibrary!,action.id)};try{await persistLayoutCandidate(expected,next,'Saved layout deleted.');forgetLayoutHistory(history,action.id);gridHost.current?.forgetParked?.(action.id);forgetWarmLayout(warmFeeds.current,action.id);sweepLiveFeeds(current.current.grid);}catch(error){if(action.replacementId)throw new Error('The replacement layout is open. Review whether deletion was saved: '+String(error));throw error;}
  }
 }
 async function applyLayoutImport(){
  try{assertDialogContext(false);const preview=layoutImport;if(!preview||current.current!==preview.workspace||currentInput.current?.datasets!==preview.datasets)throw new Error('The layout changed. Choose the file again.');
   const expected=preview.workspace,copy=duplicateSavedLayout(expected.layoutLibrary!,expected.grid!,preview.file.grid,preview.file.name,Date.now(),()=>crypto.randomUUID()),next={...expected,layoutLibrary:copy.library};await persistLayoutCandidate(expected,next,'Imported a new saved layout. Open Local layouts to view it.');if(dialogAuthority.current===renderedDialogAuthority&&dialogOwner.current==='import-layout'){setDialog(null);setLayoutImport(null);}
  }catch(error){if(dialogAuthority.current===renderedDialogAuthority&&dialogOwner.current==='import-layout')reportFailure(error);}
 }
 /** Only an exact one-destination history step bypasses generic source restoration. Pending is a handled refusal. */
 function restoreTableDestinationHistory(direction:'undo'|'redo',entry:NonNullable<ReturnType<typeof history.current.peekUndo>>):boolean{
  const expected=current.current,oldGrid=entry.workspace.grid,grid=expected.grid,replay=currentReplay.current;
  const sameReplay=()=>{const a=entry.replay,b=replay;if(!a||!b)return a===b;const keys=['schemaVersion','datasetId','revision','totalBars','cursor','playing','barsPerSecond','remainderMilliseconds','generation','sessionId','runId'] as const;if(Reflect.ownKeys(a).length!==keys.length||Reflect.ownKeys(b).length!==keys.length)return false;return keys.every(key=>{const left=Object.getOwnPropertyDescriptor(a,key),right=Object.getOwnPropertyDescriptor(b,key);return!!left&&!!right&&Object.hasOwn(left,'value')&&Object.hasOwn(right,'value')&&Object.is(left.value,right.value);});};
  if(!oldGrid||!grid||!sameReplay())return false;
  let change:{cellId:string;bindingId:string;destination:'chart'|'bottom';binding:ScriptBinding}|null=null;
  if(oldGrid.layout.cells.length!==grid.layout.cells.length||oldGrid.layout.cells.some(row=>!grid.cells[row.id]))return false;
  for(const cell of grid.layout.cells){const currentBindings=grid.cells[cell.id]?.scriptBindings??[],priorBindings=oldGrid.cells[cell.id]?.scriptBindings??[];if(currentBindings.length!==priorBindings.length)return false;
   for(let index=0;index<currentBindings.length;index++){const before=currentBindings[index],after=priorBindings[index];if(before.id!==after.id)return false;if(before.tablePlacement===after.tablePlacement)continue;if(change)return false;
    const a=restoreScriptBindings([before])[0],b=restoreScriptBindings([after])[0];delete a.tablePlacement;delete b.tablePlacement;if(!sameWorkspace({scriptBindings:[a]},{scriptBindings:[b]}))return false;change={cellId:cell.id,bindingId:before.id,destination:after.tablePlacement??'chart',binding:before};
   }
  }
  if(!change)return false;
  const selected=change,normalizedBindings=(oldGrid.cells[selected.cellId].scriptBindings??[]).map(row=>{if(row.id!==selected.bindingId)return row;const value={...row};if(selected.binding.tablePlacement==='bottom')value.tablePlacement='bottom';else delete value.tablePlacement;return value;}),normalizedGrid={...oldGrid,cells:{...oldGrid.cells,[selected.cellId]:{...oldGrid.cells[selected.cellId],scriptBindings:normalizedBindings}}};
  if(!sameWorkspace({grid},{grid:normalizedGrid})||!sameWorkspace(expected,projectGrid({...entry.workspace,bottomPanel:expected.bottomPanel},normalizedGrid)))return false;
  // From this point the step is recognized. An unavailable producer must never fall through to a worker-restarting restore.
  const coordinatorOwner=coordinator.current,input=currentInput.current,committed=committedInput.current,financialOwner=financial.current,controller=activeController.current,epoch=gridGeneration.current,startupOwner=startup.current;
  let lease:import('../chart/script-port').ScriptTableDestinationLease|null=null,accepted=false,transaction=false;
  const assertHistoryCurrent=()=>{assertStartupEditable(startup.current);if(!input||committed&&(committed.dataset!==input.dataset||committed.datasets!==input.datasets||committed.bars!==input.bars||committed.replay!==input.replay)||expected!==workspace||current.current!==expected||current.current.grid!==grid||currentReplay.current!==replay||currentInput.current!==input||committedInput.current!==committed||financial.current!==financialOwner||activeController.current!==controller||gridGeneration.current!==epoch||startup.current!==startupOwner||coordinator.current!==coordinatorOwner||(direction==='undo'?history.current.peekUndo():history.current.peekRedo())!==entry||dialogOwner.current||storageMutation.current||workspaceTransaction.current!==transaction||coordinatorOwner?.transactionActive?.()||coordinatorOwner?.gestureActive?.())throw Error('The chart changed or is busy. Retry its current table history.');};
  try{assertHistoryCurrent();if(!coordinatorOwner?.scriptTables?.prepareDestination)throw Error('The chart changed. Try again.');const restored=projectGrid(expected,oldGrid),nextCommitted=committed?{...committed,workspace:restored}:null;financialGuard.current(restored,financialOwner.alerts,financialOwner.paper);assertHistoryCurrent();
   lease=coordinatorOwner.scriptTables.prepareDestination(grid,selected.cellId,selected.bindingId);assertHistoryCurrent();transaction=true;workspaceTransaction.current=true;lease.apply(selected.destination);assertHistoryCurrent();lease.assertCurrent();financialGuard.current(restored,financialOwner.alerts,financialOwner.paper);assertHistoryCurrent();lease.assertCurrent();
   // The real history method performs its fallible sizing before consumption. No callback runs between its success and these model writes.
   if(history.current[direction](expected,replay)){current.current=restored;accepted=true;if(nextCommitted)committedInput.current=nextCommitted;}else throw Error('This table history entry is no longer available.');
   setWorkspace(restored);setMessage(direction==='undo'?'Change undone.':'Change restored.');
  }catch(error){const failures:unknown[]=[error];if(!accepted&&lease)try{assertHistoryCurrent();lease.rollback();}catch(rollback){failures.push(rollback);}reportFailure(failures.length===1?failures[0]:new AggregateError(failures,'The chart changed. Try again.'));}
  finally{const release=lease;lease=null;try{release?.release();}catch(error){reportFailure(error);}if(transaction){workspaceTransaction.current=false;transaction=false;}}
  return true;
 }
 async function restoreHistory(direction:'undo'|'redo'){
  if(workspaceTransaction.current){setMessage('The chart is busy. Try again in a moment.');return;}
  const entry=direction==='undo'?history.current.peekUndo():history.current.peekRedo();if(!entry)return;
  if(restoreTableDestinationHistory(direction,entry))return;
  try{
   if(currentReplay.current?.playing){const paused=setReplayPlaying(currentReplay.current,false);currentReplay.current=paused;setReplay(paused);}
   const owner=coordinator.current,expected=current.current,expectedReplay=currentReplay.current;if(!owner||!expected.grid||!entry.workspace.grid||expected!==workspace)throw new Error('Wait for the chart to finish loading before restoring history.');
   // Undo/redo restores the chart content, never the time scale the user is looking at.
   let liveView:{from:number;to:number}|null=null;try{liveView=activeController.current?.getViewport()??null;}catch{liveView=null;}
   const next=keepCurrentViewports(expected,historicalChartWorkspace(expected,entry.workspace),liveView?{[expected.grid.layout.activeCellId]:liveView}:{}),nextDatasets=sessionDatasets(workspaceDatasets(next),workspaceSessionMode),active=next.grid!.layout.cells.find(row=>row.id===next.grid!.layout.activeCellId)!,supplied=nextDatasets.find(row=>row.provenance.datasetId===next.grid!.cells[active.id].datasetId&&row.instrument.symbol===active.symbol&&row.resolution===active.interval);if(!supplied)throw new Error('The chart changed. Try again.');const nextDataset=cellSessionDataset(supplied,next.grid!.cells[active.id]);/* A restore that keeps the active chart on its navigated source keeps that source's replay too. */const nextReplay=historyKeepsActiveSource(expected,entry.workspace)?(expectedReplay&&expectedReplay.datasetId===nextDataset.provenance.datasetId&&expectedReplay.revision===nextDataset.provenance.revision&&expectedReplay.totalBars===nextDataset.bars.length?expectedReplay:null):restoredHistoryReplay(entry,nextDataset,()=>crypto.randomUUID()),nextBars=nextReplay?replayPrefix(nextDataset,nextReplay):nextDataset.bars;
   financialGuard.current(next,financial.current.alerts,financial.current.paper);
   workspaceTransaction.current=true;setWorkspaceBusy(true);
   const stillCurrent=()=>current.current===expected&&currentReplay.current===expectedReplay&&(direction==='undo'?history.current.peekUndo():history.current.peekRedo())===entry;
   const commitHistory=(canonical:MultiChartState,markCommitted?:()=>void)=>{
    if(!stillCurrent())throw new Error('This history entry changed before restoration.');
    const committed=projectGrid(next,canonical);financialGuard.current(committed,financial.current.alerts,financial.current.paper);
    if(!history.current[direction](expected,expectedReplay))throw new Error('This history entry is no longer available.');
    committedInput.current={workspace:committed,dataset:nextDataset,datasets:nextDatasets,replay:nextReplay,bars:nextBars};currentInput.current={dataset:nextDataset,datasets:nextDatasets,replay:nextReplay,bars:nextBars};current.current=committed;currentReplay.current=nextReplay;
    markCommitted?.();
    setWorkspace(committed);setReplay(nextReplay);setInputEpoch(value=>value+1);setExecutionEpoch(value=>value+1);takeSymbol(next.symbol);setStrategyExecution(null);followReplayGuard(nextReplay,next.grid!.layout.activeCellId);
   };
   const structural=expected.grid.layout.cells.length!==next.grid!.layout.cells.length||expected.grid.layout.cells.some(row=>!next.grid!.cells[row.id]);
   let publicationErrors:string[];
   if(structural){
    const host=gridHost.current;if(!host)throw new Error('The chart workspace cannot stage a replacement yet.');
    const outcome=await host.transition({expected:{state:expected.grid,datasets:universe,activeBars:bars,activeDatasetId:dataset.provenance.datasetId,activeExecutionIdentity:expectedReplay?.runId??'ordinary'},next:{state:next.grid!,datasets:nextDatasets,activeBars:nextBars,activeDatasetId:nextDataset.provenance.datasetId,activeExecutionIdentity:nextReplay?.runId??'ordinary'},view:{drawingPreferences:next.drawingPreferences,appearance:next.appearance,chartSettings:next.chartSettings},assertCurrent:()=>gridHost.current===host&&stillCurrent(),commitModel:commitHistory});
    if(!outcome.committed)throw new Error(outcome.errors.join(' ')||'Chart history restoration was cancelled.');publicationErrors=outcome.errors;
   }else{
    const outcome=await owner.apply({expectedState:expected.grid,nextState:next.grid!,nextDatasets,activeBars:bars,nextActiveBars:nextBars,activeExecutionIdentity:expectedReplay?.runId??'ordinary',nextExecutionIdentity:nextReplay?.runId??'ordinary',assertCurrent:stillCurrent,commitModel:markCommitted=>commitHistory(next.grid!,markCommitted)});publicationErrors=outcome.publicationErrors;
   }
   // The entry's drawings were reloaded through loadDrawings, which publishes no drawing change, so App's
   // drawing mirror (remove counts, the selected drawing's toolbar) is read again here. A replaced chart is skipped (its own
   // capture effect runs). The read is best effort: a failure here must not turn a committed restore into an error.
   refreshDrawingMirror();
   // Like the reference, an ordinary undo or redo shows no message; only a replay pause or a partial update is reported.
   const notes=[...(nextReplay?['Replay is paused at the restored bar.']:[]),...(publicationErrors.length?['Some charts could not finish updating. '+publicationErrors.join(' ')+' Reload the workspace to retry.']:[])];if(notes.length)setMessage(notes.join(' '));
  }catch(error){reportFailure(error);}finally{workspaceTransaction.current=false;setWorkspaceBusy(false);}
 }
 function templateCheckpoint(){
  const expected=current.current,expectedReplay=currentReplay.current,controller=activeController.current;
  if(!controller||expected!==workspace||workspaceTransaction.current||!expected.grid)throw new Error('Wait for the active chart to finish loading.');
  const native=()=>JSON.stringify([controller.indicators.serialize(),controller.saveDrawings(),expected.scriptBindings]);
  const configuration=native(),valid=()=>current.current===expected&&currentReplay.current===expectedReplay&&activeController.current===controller&&!!matchingInspection(controller.getDataWindow(),bars,source,expected.chartStyle)&&native()===configuration;
  if(!valid())throw new Error('The chart changed. Try again.');
  return {workspace:expected,replay:expectedReplay,chart:controller,valid,indicators:controller.indicators.serialize(),scripts:structuredClone(expected.scriptBindings),drawings:controller.saveDrawings()};
 }
 function captureTemplate():TemplateCapture{const snapshot=templateCheckpoint();return {content:{indicators:snapshot.indicators,scripts:snapshot.scripts,rememberSymbol:false,rememberInterval:false,source:templateSource(dataset)},assertCurrent:()=>{if(!snapshot.valid())throw new Error('The chart changed after this template preview. Preview it again.');}};}
 async function previewTemplate(template:IndicatorTemplate):Promise<TemplateApplyPreview>{
  const snapshot=templateCheckpoint(),owner=coordinator.current;if(!owner)throw new Error('The chart changed. Try again.');
  const activeId=snapshot.workspace.grid!.layout.activeCellId,inventory=owner.inventory(activeId),canonical=patchWorkspace(snapshot.workspace,{indicators:snapshot.indicators,drawings:snapshot.drawings}),prepared=prepareTemplateApplication(canonical,template,inventory.panes,inventory.occupiedIds,()=>crypto.randomUUID());
  const next=prepared.workspace,nextDatasets=universe,supplied=prepared.sourceChanged?universe.find(row=>row.provenance.datasetId===prepared.activeSource.provenance.datasetId&&row.resolution===prepared.activeSource.resolution&&row.instrument.id===prepared.activeSource.instrument.id):dataset;if(!supplied)throw new Error('The chart changed. Try again.');const nextDataset=cellSessionDataset(supplied,next.grid!.cells[next.grid!.layout.activeCellId]);const nextReplay=prepared.sourceChanged?null:snapshot.replay,nextBars=prepared.sourceChanged?nextDataset.bars:bars;
  financialGuard.current(next,financial.current.alerts,financial.current.paper);
  const identityEffect=templateIdentityEffect(prepared);// REPLAY_POLICY: decided before apply, so an invalid decision refuses up front.
  return {lines:[template.name+': replace '+prepared.replacedIndicators+' built-in indicators and '+prepared.replacedScripts+' scripts.',template.indicators.length+' built-in indicators and '+template.scripts.length+' scripts will be added with fresh identities.',prepared.removedDrawingIds.length+' drawings on replaced indicator panes will be removed. Price and unaffected comparison-pane drawings remain.',prepared.sourceChanged?'Switch to '+nextDataset.instrument.symbol+' · '+nextDataset.resolution+' · '+nextDataset.provenance.providerName+' ('+(sourceCoverageNote(nextDataset.provenance))+').':'Keep the current source and replay prefix.',prepared.changedSourceIds.length+' chart source(s) will change through the current link settings.'],apply:async()=>{
   if(workspaceTransaction.current||coordinator.current!==owner||!snapshot.valid())throw new Error('The chart changed. Preview the template again.');workspaceTransaction.current=true;setWorkspaceBusy(true);
   try{const outcome=await owner.apply({expectedState:snapshot.workspace.grid!,nextState:next.grid!,nextDatasets,activeBars:bars,nextActiveBars:nextBars,activeExecutionIdentity:snapshot.replay?.runId??'ordinary',nextExecutionIdentity:nextReplay?.runId??'ordinary',assertCurrent:()=>current.current===snapshot.workspace&&currentReplay.current===snapshot.replay,commitModel:markCommitted=>{const committed=withScriptDraft(projectGrid(next,next.grid!));financialGuard.current(committed,financial.current.alerts,financial.current.paper);history.current.record(canonical,snapshot.replay);committedInput.current={workspace:committed,dataset:nextDataset,datasets:nextDatasets,replay:nextReplay,bars:nextBars};currentInput.current={dataset:nextDataset,datasets:nextDatasets,replay:nextReplay,bars:nextBars};current.current=committed;currentReplay.current=nextReplay;markCommitted();setWorkspace(committed);setReplay(nextReplay);setInputEpoch(value=>value+1);takeSymbol(next.symbol);setStrategyExecution(null);scriptDraft.current?.settle();applyTemplateIdentityEffect(identityEffect,{retireReplay:()=>{currentReplayPaper.current=null;setReplaySession(null);setReplayPaper(null);},retireAlerts:()=>{financialGeneration.current++;setFinancialEpoch(financialGeneration.current);},retireScripts:()=>{strategyBindings.current.delete(next.grid!.layout.activeCellId);},freshExecutionIdentity:()=>{setScriptEpoch(value=>value+1);}});followReplayGuard(nextReplay,next.grid!.layout.activeCellId);}});/* See restoreHistory. */refreshDrawingMirror();setMessage((outcome.publicationErrors.length?'Template configuration saved with chart update errors. '+outcome.publicationErrors.join(' '):'Template applied.')+(frameResetNotice(canonical,next)?' '+frameResetNotice(canonical,next):''));return outcome;}finally{workspaceTransaction.current=false;setWorkspaceBusy(false);}
  }};
 }
 function comparisonSnapshot():ComparisonSnapshot[]{return chart?.comparisons.list().map(({dataset,rendererId,...settings})=>({...settings,datasetId:dataset.provenance.datasetId}))??[];}

 /* Chart settings rows preview live; every setPreview(null) (Cancel, Ok, layout switch) also drops the settings preview. */
 useEffect(()=>{if(preview===null)setSettingsPreview(null);},[preview]);
 const shownSettings=settingsPreview??workspace.chartSettings;
 const appearance=preview??workspace.appearance,last=bars.at(-1),previous=bars.at(-2)??last,change=last&&previous?last.close-previous.close:0,percent=previous?.close?change/previous.close*100:0;
 // The quote the ticket and the chart buttons show is the one the virtual account holds for this instrument (set by the bar feed below).
 const virtualQuote=(replay?replayPaper:paper)?.quotes[dataset.instrument.id]??null;
 const virtualNow=last?.time??0;
 // An imported, non-fixture source acts on the last imported price rebuilt at the action time (the feed quote otherwise).
 const virtualActionQuote=paperActionQuote(dataset,virtualQuote,Math.max((replay?replayPaper:paper)?.clock??0,virtualNow),{replay:!!replay});
 // The live best bid and ask of the charted instrument, for display in the order ticket and the DOM's best bid
 // and ask rows (display only: virtual fills keep the bar-feed price). Never while the chart replays: live quotes are after the replay clock.
 // App no longer holds this quote. LiveBookBinding subscribes for the dock and the ticket; this effect keeps the
 // instrument watched under the same condition as before (the quote-rate shedding order) without an App render per quote.
 const chartQuoteInstrument=!replay&&!liveReplayHeld&&isLiveDatasetId(dataset.provenance.datasetId)?dataset.instrument.id:null;
 useEffect(()=>chartQuoteInstrument?liveQuotes.subscribe(chartQuoteInstrument,()=>{}):undefined,[chartQuoteInstrument]);
 // A new run of the same replay session carries the replay account (kept on a seek forward,
 // returned to its state at the new time on a seek back) instead of starting a fresh one; another session still starts fresh.
 useEffect(()=>{if(!replay){currentReplayPaper.current=null;setReplayPaper(null);return;}const account=currentReplayPaper.current;let next=account?.runId===replay.runId?account:null;
  if(!next){const carried=carryReplayPaper(replayPaperLedger.current,{sessionId:replay.sessionId,runId:replay.runId,time:virtualNow});replayPaperLedger.current=carried.ledger;if(carried.account)paperFeedForming.current=null;if(carried.notice)setMessage(carried.notice);next=carried.account??createPaperAccount({id:'replay-paper',mode:'replay-paper',runId:replay.runId,name:'Replay virtual account',now:0});}
  currentReplayPaper.current=next;setReplayPaper(next);},[replay?.runId]);
 useEffect(()=>{if(replay&&replayPaper&&replayPaper.runId===replay.runId)replayPaperLedger.current=recordReplayPaper(replayPaperLedger.current,replay.sessionId,replayPaper);},[replayPaper]);
 // Which account the chart bars feed, and which instruments the background 1m series feed. While a frozen
 // live copy waits for its start bar the chart bars feed nothing (they are frozen); ordinary paper follows the background series.
 const paperRouting=liveReplayPaperRouting(!!replay,liveReplayHeld);
 useEffect(()=>{if(paperRouting.chart==='none'||gridGeneration.current!==gridEpoch||workspaceTransaction.current||storageMutation.current||!loaded||!bars.length)return;
  const account=replay?currentReplayPaper.current:financial.current.paper;if(!account||replay&&account.runId!==replay.runId)return;
  // Fills follow the finest live series (1m) whatever interval the chart shows; null waits for that series.
  const input=paperFeedInput({dataset,bars,replay:!!replay,fine:paperFine,forming:paperFeedForming.current});if(!input)return;
  const step=feedPaperBars(account,input);
  if(!step.ok){if(step.message)setMessage(step.message);return;}
  paperFeedForming.current=step.forming;
  // Fills and marks for every other symbol the account touches, from its background 1m series.
  const others=replay?[]:paperBackgroundInputs(step.account,dataset.instrument.id,paperBackground),more=others.length?feedPaperSymbols(step.account,others):null,settled=more?.account??step.account;
  if(settled!==account&&(replay?acceptReplayPaper:acceptPaper)(settled,account)){const said=step.message||more?.messages[0];if(said)setMessage(said);}
 },[bars,dataset,replay?.runId,paper,replayPaper,gridEpoch,workspaceBusy,loaded,paperFine,paperBackground,paperRouting.chart]);
 // Replaying a frozen live chart keeps ordinary paper on the live feed: every ordinary instrument
 // (the charted one too) is fed from its background 1m series, while the chart trades the replay account.
 const paperBackgroundKey=paperRouting.background==='all'?paperBackgroundSymbols(paper,'').join('|'):paperRouting.background==='none'?'':paperBackgroundSymbols(paper,dataset.instrument.id).join('|');
 useEffect(()=>{if(paperRouting.background!=='all'||gridGeneration.current!==gridEpoch||workspaceTransaction.current||storageMutation.current||!loaded)return;
  const account=financial.current.paper,inputs=paperBackgroundInputs(account,'',paperBackground);if(!inputs.length)return;
  const more=feedPaperSymbols(account,inputs);if(more.account!==account&&acceptPaper(more.account,account)&&more.messages[0])setMessage(more.messages[0]);
 },[paperBackground,replay?.runId,paperRouting.background,paper,gridEpoch,workspaceBusy,loaded]);
 useEffect(()=>{const provider=alpacaProvider.current;if(!paperBackgroundKey||!provider){setPaperBackground(new Map());return;}
  const handles:LiveHandle[]=[],timers:ReturnType<typeof setTimeout>[]=[],books=new Map<string,BarDataset>();let active=true,last=0,pending=false;
  const publish=()=>{pending=false;if(!active)return;last=Date.now();setPaperBackground(new Map(books));};
  for(const symbol of paperBackgroundKey.split('|')){let handle:LiveHandle;try{handle=provider.open(symbol,PAPER_FINE_RESOLUTION);}catch{continue;}
   handles.push(handle);const take=()=>{const data=handle.dataset();if(data?.bars.length)books.set(data.instrument.id,data);};take();
   handle.onChange(()=>{take();if(!pending){pending=true;timers.push(setTimeout(publish,Math.max(0,LIVE_UI_INTERVAL_MS-(Date.now()-last))));}});}
  publish();
  return()=>{active=false;timers.forEach(clearTimeout);handles.forEach(handle=>handle.close());setPaperBackground(new Map());};
 },[paperBackgroundKey,alpacaProvider.current]);
 const paperFineSymbol=paperFineFeedSymbol(dataset,!!replay);
 useEffect(()=>{const provider=alpacaProvider.current;if(!paperFineSymbol||!provider){setPaperFine(null);return;}
  let handle:LiveHandle;try{handle=provider.open(paperFineSymbol,PAPER_FINE_RESOLUTION);}catch{setPaperFine(null);return;}
  // Throttled like the chart's live state: at most one publication per LIVE_UI_INTERVAL_MS.
  let timer:ReturnType<typeof setTimeout>|null=null,last=0,active=true;
  const publish=()=>{timer=null;if(!active)return;last=Date.now();setPaperFine(handle.dataset());};
  publish();
  const off=handle.onChange(()=>{if(timer===null)timer=setTimeout(publish,Math.max(0,LIVE_UI_INTERVAL_MS-(Date.now()-last)));});
  return()=>{active=false;off();if(timer!==null)clearTimeout(timer);handle.close();setPaperFine(null);};
 },[paperFineSymbol,alpacaProvider.current]);
 const activeController=useRef<ChartController|null>(null);
 // Runtime alert state belongs beside the financial refs. It never enters the
 // chart workspace, its Undo history, or a layout-window shared payload.
 const compoundBook=compoundAlertBookFor(financial)??new CompoundAlertBook({financial,currentInput,activeController,financialGeneration,gridGeneration,storageMutation,workspaceTransaction,currentReplay,startup,mainWindow:!secondaryWindow});
 const compoundControl=useMemo(()=>({book:compoundBook,readActionTime:()=>Math.floor(Date.now()/1000)}),[compoundBook]);
 const setChartReady=useCallback((controller:ChartController|null)=>{if(activeController.current===controller){/* The same chart re-reporting ready bumps the inspection epoch once per batch (app-update-batch.ts), not once per callback. */appUpdateBatch(current).queue('inspection',()=>setInspectionEpoch(value=>value+1));return;}const previous=activeController.current;/* At most one chart is armed: the toolbar, Escape and Cursor reach only the active chart. While still the owner, the outgoing chart leaves its renderer mode (adapter route, owner-guarded, no focus) and drawing tool (renderer facade; the controller setTool would focus it). */if(previous)try{if(previous.drawings.getMode()!==null)previous.setDrawingMode(null);if(previous.drawings.getTool()!==null)previous.drawings.setTool(null);}catch(e){reportFailure(e);}activeController.current=controller;setChart(controller);setSelectedDrawing(null);setActiveTool(null);setActiveMode(null);},[]);
 useEffect(()=>{if(!chart)return;const current=()=>activeController.current===chart&&!workspaceTransaction.current&&!storageMutation.current;setActiveTool(chart.drawings.getTool());setActiveMode(chart.drawings.getMode());cursorKinds.current.connect(typeof chart.nativeRenderer==='function'?chart.nativeRenderer():null);setActiveCursor(cursorKinds.current.kind());const offTool=chart.onToolChanged(type=>{if(current())setActiveTool(type);}),offMode=chart.onDrawingModeChanged(mode=>{if(current())setActiveMode(mode);});return()=>{offTool();offMode();};},[chart]);
 const acceptDrawingPreferences=useCallback((value:DrawingPreferences)=>{try{const next=reconcileDrawingPreferences(current.current.drawingPreferences,value);return next===current.current.drawingPreferences||commit({drawingPreferences:next});}catch(error){reportFailure(error);return false;}},[commit]);
 /** The magnet and Stay in drawing mode toggles made during the routine background autosave wait for the write
  (queueDrawingEdit) and are evaluated when they run, so two presses toggle twice. */
 function deferDrawingPreference(apply:()=>unknown){if(queueDrawingEdit(apply,{},chart))return;apply();}
 function changeDrawingPreferences(next:DrawingPreferences){try{const validated=restoreDrawingPreferences(next);if(chart!==activeController.current)throw new Error('The active chart changed before drawing settings were applied.');if(chart)applyDrawingPreferenceChange(chart.drawingPreferences,validated,value=>commit({drawingPreferences:value}));else if(!commit({drawingPreferences:validated}))return false;return true;}catch(error){reportFailure(error);return false;}}
 const captureDrawings=useCallback(()=>{if(chart&&gridGeneration.current===gridEpoch&&activeController.current===chart&&!storageMutation.current)setDrawings(chart.drawingManager.list() as unknown as Record<string,unknown>[]);},[chart,gridEpoch]);
 useEffect(()=>{captureDrawings();if(!chart)return;return chart.onDrawingsChanged(captureDrawings);},[chart,captureDrawings]);
 // A restore that reloads drawings without a change event (loadDrawings) refreshes the mirror itself.
 const refreshDrawingMirror=()=>{try{captureDrawings();}catch{/* Best effort: the next published drawing change captures again. */}};
 useEffect(()=>{if(!chart)return;return chart.onDrawingSelection(ids=>{if(gridGeneration.current===gridEpoch&&activeController.current===chart&&!storageMutation.current)setSelectedDrawing(ids[0]??null);setSelectedDrawingIds(ids);});},[chart,gridEpoch]);

 // The first read is direct; later port notifications (one per indicator when a switch recomputes) queue one batched read
 // of the rows (every port change notifies, so the newest job reads the newest rows; a retired chart's pending read is dropped and
 // the job rechecks ownership), so three indicators cost one list() and one App render instead of three. Other direct writes read
 // list() too, so a later batched read never sets older rows than they did.
 useEffect(()=>{if(!chart)return;const owns=()=>gridGeneration.current===gridEpoch&&activeController.current===chart&&!storageMutation.current;const refresh=()=>{if(owns()){appUpdateBatch(current).cancel('indicator-views');setIndicatorViews(chart.indicators.list());}};const notified=()=>{if(owns())appUpdateBatch(current).queue('indicator-views',()=>{if(owns())setIndicatorViews(chart.indicators.list());});};refresh();const off=chart.indicators.subscribe(notified);return()=>{off();appUpdateBatch(current).cancel('indicator-views');};},[chart,gridEpoch]);
 // Live growth keeps the data window (same input token); it refreshes when the chart applies new bars.
 const inputToken=barInputIdentity(bars),inspectionCellId=workspace.grid?.layout.activeCellId,inspectionLayoutId=workspace.grid?.layout.id,inspectionReplayRun=replay?.runId??null,inspectionReplayCursor=replay?.cursor??null,inspectionStyle=workspace.chartStyle,inspectionSession=workspace.grid?.cells[inspectionCellId??'']?.session??null,inspectionDatasetId=workspace.grid?.cells[inspectionCellId??'']?.datasetId,inspectionSymbol=workspace.symbol,inspectionSourceId=workspace.sourceId,inspectionCellIndex=workspace.grid?.layout.cells.findIndex(row=>row.id===inspectionCellId)??-1,inspectionInterval=workspace.grid?.layout.cells[inspectionCellIndex]?.interval;
 useEffect(()=>{
  hoverInspection.setInspection(null);if(!chart)return;const inspectionSourceKey=chartSourceContextKey(source);
  let alive=true,frame=0,deferredRead=false;
  const releases:Array<()=>void>=[];
  let waiting:{active:boolean;cancel:()=>void}|null=null;
  const stop=()=>{
   if(!alive)return[];alive=false;const held=waiting,pending=frame;waiting=null;frame=0;deferredRead=false;if(held)held.active=false;
   const failures:unknown[]=[],attempt=(release:()=>void)=>{try{release();}catch(error){failures.push(error);}};
   if(held)attempt(held.cancel);if(pending)attempt(()=>cancelAnimationFrame(pending));for(const release of releases.splice(0))attempt(release);return failures;
  };
  const retire=()=>{const failures=stop();if(failures.length)throw new AggregateError(failures,'Inspection could not start. Try again.');};
  const acquire=(release:()=>void)=>{if(alive)releases.push(release);else release();};
  // Fixed App ownership only; ordinary hover never packs source metadata or traverses history.
  const owns=()=>{
   if(!alive)return false;const input=currentInput.current,now=current.current,run=currentReplay.current;
   const owned=gridGeneration.current===gridEpoch&&activeController.current===chart&&financialGeneration.current===financialEpoch&&now.grid?.layout.id===inspectionLayoutId&&now.grid?.layout.activeCellId===inspectionCellId&&now.chartStyle===inspectionStyle&&now.symbol===inspectionSymbol&&now.sourceId===inspectionSourceId&&now.grid?.cells[inspectionCellId??'']?.datasetId===inspectionDatasetId&&now.grid?.layout.cells[inspectionCellIndex]?.id===inspectionCellId&&now.grid?.layout.cells[inspectionCellIndex]?.interval===inspectionInterval&&(now.grid?.cells[inspectionCellId??'']?.session??null)===inspectionSession&&(run?.runId??null)===inspectionReplayRun&&(run?.cursor??null)===inspectionReplayCursor&&!!input&&sameBarsInput(input.bars,bars)&&sameDatasetInput(input.dataset,dataset);
   if(!owned)retire();return owned;
  };
  // Only deferred capture/drain checks build a fixed metadata key. This reads no candle rows or native arrays.
  const sourceCurrent=()=>{
   if(!owns())return false;const input=currentInput.current!;let key:string;
   try{key=chartSourceContextKey(sourceContextForDataset(input.dataset,input.bars));}catch{retire();return false;}
   const owned=owns()&&currentInput.current?.dataset===input.dataset&&sameBarsInput(currentInput.current?.bars,input.bars)&&key===inspectionSourceKey;
   if(!owned)retire();return owned;
  };
  const defer=()=>{
   if(!owns()||waiting)return;if(!sourceCurrent())return;
   const held={active:true,cancel:()=>{}};waiting=held;
   held.cancel=afterStorageWrite(()=>{
    if(!held.active||waiting!==held)return;held.active=false;waiting=null;
    if(!sourceCurrent())return;deferredRead=true;refresh();
   });
   if(!held.active||!owns())held.cancel();
  };
  const refresh=()=>{
   if(!owns())return;if(storageMutation.current){defer();return;}if(frame)return;
   frame=requestAnimationFrame(()=>{
    frame=0;if(!owns())return;if(storageMutation.current){defer();return;}
    const verifySource=deferredRead;deferredRead=false;if(verifySource&&!sourceCurrent())return;
    const snapshot=chart.getDataWindow();
    if(!owns())return;if(storageMutation.current){defer();return;}if(verifySource&&!sourceCurrent())return;
    hoverInspection.setInspection(snapshot);
   });
  };
  try{
   if(owns()){const crosshair=chart.onCrosshair;if(owns())acquire(crosshair.call(chart,refresh));}
   if(owns()){const market=chart.onMarketApplied;if(owns()&&typeof market==='function')acquire(market.call(chart,refresh));}
   if(owns())refresh();
  }catch(cause){const failures=stop();if(failures.length)throw new AggregateError([cause,...failures],'Inspection could not start. Try again.');throw cause;}
  return retire;
 },[chart,inputToken,workspace.chartStyle,indicatorViews,inspectionEpoch,gridEpoch,source.datasetId,source.revision,source.fixture,source.label,source.resolution,source.basisIdentity,source.inputIdentity,source.sessionOverride,inspectionCellId,inspectionLayoutId,inspectionReplayRun,inspectionReplayCursor,financialEpoch,inspectionStyle,inspectionSession,inspectionDatasetId,inspectionSymbol,inspectionSourceId,inspectionCellIndex,inspectionInterval]);
 const captureIndicators=(assertCurrent:()=>void=()=>{})=>{assertCurrent();if(chart){const port=chart.indicators,list=port.list;assertCurrent();const rows=list.call(port);assertCurrent();setIndicatorViews(rows);}};
 /** background: the routine autosave (debounce timer, close/hide flush). It holds the same storage and chart locks but
  never makes the workspace inert, so an open dialog keeps keyboard focus. Explicit saves stay blocking.
  sourceChange (close flush only): a grid Source change is still running past the close bound. Its analysis hold
  already blocks every grid publication, and the storage lock below refuses every workspace and alert commit (the
  Source change's own acceptance included), so the committed workspace is written WITHOUT that change and without a
  second chart hold, which is refused inside a Source change. */
 async function persistLayoutCandidate(expected:Workspace,next:Workspace,status:string,background=false,sourceChange=false,closing=false):Promise<void>{
  if(!window.lv)throw new Error('Saving needs the desktop app.');assertStartupEditable(startup.current);
  const opening=currentInput.current,owner=coordinator.current,expectedFinancial=financial.current,expectedReplay=currentReplay.current,expectedRevision=revision.current;
  if(current.current!==expected||!expected.grid||!opening||!owner)throw new Error('Wait for the exact chart workspace to finish loading before saving.');
  const compoundSave=captureCompoundWorkspaceSave(compoundBook,Math.floor(Date.now()/1000));
  const data=prepareWorkspaceData({...persistableWorkspace(next),paper:expectedFinancial.paper,alerts:expectedFinancial.alerts,...(expectedFinancial.paperBook?{paperBook:expectedFinancial.paperBook}:{}),...compoundSave.data}).data;
  const assertCurrent=()=>{if(current.current!==expected||coordinator.current!==owner||currentReplay.current!==expectedReplay||currentInput.current?.datasets!==opening.datasets||!(currentInput.current?.bars===opening.bars||typeof sameBarsInput==='function'&&sameBarsInput(currentInput.current?.bars,opening.bars))||financial.current.paper!==expectedFinancial.paper||financial.current.paperBook!==expectedFinancial.paperBook||financial.current.alerts!==expectedFinancial.alerts||revision.current!==expectedRevision||compoundBook.version!==compoundSave.version)throw new Error('The layout or local account changed before saving. Retry the current state.');};
  assertCurrent();beginStorageMutation(background);let writeStarted=false,receiptAccepted=false;holdRetry.current.refused=false;
  // A layout window's save carries the workspace-wide fields it changed (the main window takes them).
  const sharedSent=windowMode.role==='secondary'?sharedWorkspaceChanges(sharedBaseline.current,next):null;
  // The close flush never drops the workspace because the chart tree refuses its hold (a quarantined or not yet
  // settled chart: "Chart tree input or configuration is not settled"). It writes the committed workspace without a hold, as
  // the sourceChange flush does for a running Source change; the window closes right after, so no chart publication can follow. Before, every
  // close after such a refusal skipped the save and the next start showed the last good save (often the factory workspace).
  const hold=()=>{try{return owner.suspend({state:expected.grid!,datasets:opening.datasets,activeBars:opening.bars,activeDatasetId:opening.dataset.provenance.datasetId,activeExecutionIdentity:expectedReplay?.runId??'ordinary'},background?{background:true}:undefined);}catch(error){if(!closing){holdRetry.current.refused=true;throw error;}return{isCurrent:()=>true,resume:()=>{}};}};
  /* Live replacements (not growth) wait for this hold to end (live-hold-gate.ts). */let releaseLive:(()=>void)|null=null;const gated=(lease:{isCurrent():boolean;resume():void})=>{releaseLive=liveHoldGateFor(liveHandles.current).hold();return{isCurrent:()=>lease.isCurrent(),resume:()=>{try{lease.resume();}finally{releaseLive?.();}}};};
  try{await commitLayoutReceipt({assertCurrent,suspend:()=>gated(sourceChange&&owner.transactionActive?.()?{isCurrent:()=>!!owner.transactionActive?.(),resume:()=>{}}:hold()),write:async()=>{writeStarted=true;const result=windowMode.role==='secondary'?await relayLayoutSave(window.lv,windowMode.layoutId,next.layoutLibrary!,sharedSent):await window.lv.saveWorkspace({schemaVersion:1,expectedRevision,data});if(!result.ok)throw new Error(result.error.message);return result.value;},acceptReceipt:receipt=>{
   receiptAccepted=true;lastSaveFailure.current=null;revision.current=receipt.revision;current.current=next;if(sharedSent)sharedBaseline.current={...sharedBaseline.current,...sharedSent};committedInput.current={workspace:next,...opening};lastPersisted.current={workspace:next,...expectedFinancial,compoundReviewVersion:compoundSave.reviewVersion};
  },publish:()=>{setWorkspace(next);if(!background)setMessage(status);else if(statusShown.current.kind==='error'||!/saved locally/i.test(status))publishBackgroundStatus(status);}});}catch(error){if(writeStarted&&!receiptAccepted)lastSaveFailure.current={workspace:expected,...expectedFinancial,revision:expectedRevision,compoundReviewVersion:compoundSave.reviewVersion};/* A background save refused only because a chart is still loading (a live interval switch) retries in 1 s; it no longer flashes "The chart is not settled yet" after every quick switch. */if((current.current===expected||current.current===next)&&!(background&&holdRetry.current.refused&&holdRetry.current.count<120))reportFailure(error);throw error;}finally{(releaseLive as (()=>void)|null)?.();finishStorageMutation();}
 }
 /** The main window writes a layout window's relayed save through its own save path (the single writer). It waits
  briefly for a running save or workspace transaction, as the close flush does. */
 async function acceptRelayedLayout(request:{layoutId:string;grid:unknown;shared?:unknown}):Promise<{revision:number}>{
  if(secondaryWindow)throw new Error('Only the main window saves layouts from other windows.');
  // A layout window restored at startup can relay before this window has loaded the saved workspace: wait for it.
  const loading=Date.now()+8000;while(startup.current.phase==='loading'&&Date.now()<loading)await new Promise(resolve=>setTimeout(resolve,50));
  if(startup.current.phase!=='ready')throw new Error('The main window has not loaded the saved workspace, so the layout was not saved.');
  const deadline=Date.now()+5000;while(saving.current||workspaceTransaction.current||storageMutation.current){if(Date.now()>deadline)throw new Error('The main window is busy saving. The layout is saved with its next change.');await new Promise(resolve=>setTimeout(resolve,20));}
  const expected=current.current;if(!expected.layoutLibrary)throw new Error('The main window is still loading its workspace.');
  // The layout window's workspace-wide edits (chart settings and templates, drawing and indicator templates,
  // intervals, Data sources choices) become this window's, so they are saved in the file and survive that window's close.
  const relayed={...applySharedWorkspace(expected,request.shared),layoutLibrary:replaceRelayedLayout(expected.layoutLibrary,request.layoutId,request.grid,Date.now())};
  // The other window's global drawing edits enter the workspace store.
  const relayedStore=recordGlobalDrawingEdits(relayed.globalDrawings??{},expected.layoutLibrary.entries.find(row=>row.id===request.layoutId)?.grid,relayed.layoutLibrary.entries.find(row=>row.id===request.layoutId)?.grid),next=relayedStore===relayed.globalDrawings?relayed:{...relayed,globalDrawings:relayedStore};
  await persistLayoutCandidate(expected,next,'Layout saved from another window.',true);return{revision:revision.current};
 }
 /** Open layout in new window. The new window reads the saved file, so the pending save is written first. */
 async function openLayoutInWindow(id:string):Promise<void>{
  const lv=window.lv;if(typeof lv?.openLayoutWindow!=='function')throw new Error('A new window requires the desktop app.');
  if(!await flushPendingSave.current('hidden'))throw new Error('The workspace could not be saved, so the layout did not open in a new window. Try again.');
  const result=await lv.openLayoutWindow({layoutId:id});if(!result.ok)throw new Error(result.error.message);
  const name=current.current.layoutLibrary?.entries.find(row=>row.id===id)?.name??'The layout';setMessage(result.value.focused?OPEN_ELSEWHERE_MESSAGE:'Opened '+name+' in a new window.');
 }
 /* flush: the close/hide flush, which finishes frame gestures itself and must not be postponed.
  sourceChange: the close flush past its bound with only a grid Source change still running (persistLayoutCandidate). */
 async function save(manual=true,flush=false,sourceChange=false):Promise<boolean>{
  if(!loaded)return false;
  const grid=coordinator.current,busy=workspaceTransaction.current||storageMutation.current||saving.current,gridBusy=!busy&&!sourceChange&&!!grid?.transactionActive?.();
  if(busy||gridBusy){
   // An explicit save requested while the background autosave writes, or while a chart Source change
   // finishes, is queued and runs right after it, with visible status (a queued save keeps waiting through whatever runs
   // next). A new request during a blocking operation (main inert) reports instead. The autosave retries after a Source
   // change (no commit may follow to re-arm its debounce); after a storage mutation the debounce re-arms on its own.
   if(manual){if(busy&&!backgroundSave.current&&!manualSaveQueued.current)setMessage('The workspace is busy. Try again in a moment.');else queueManualSave(gridBusy?'Save queued: it runs when the chart source change finishes.':'Save queued: it runs when the current autosave finishes.');}
   else if(gridBusy&&!flush)scheduleSaveRetry();
   return false;
  }
  // An explicit save never takes its blocking chart hold mid-gesture. A released gesture still inside its 200 ms
  // window is published first (the close flush's order); a gesture still open (held pointer, eraser drag) queues the save.
  if(manual&&!flush&&grid?.gestureActive?.()){try{grid.flushFrameGesture?.();}catch(error){reportFailure(error);}if(grid.gestureActive?.()){queueManualSave('Save queued: it runs when the chart gesture ends.');return false;}}
  const expected=current.current,book=expected.layoutLibrary!,last=lastPersisted.current;
  if(!manual&&last?.workspace===expected&&last.paper===financial.current.paper&&last.paperBook===financial.current.paperBook&&last.alerts===financial.current.alerts&&last.compoundReviewVersion===compoundBook.reviewVersion)return true;
  const failed=lastSaveFailure.current;if(!manual&&failed?.workspace===expected&&failed.paper===financial.current.paper&&failed.paperBook===financial.current.paperBook&&failed.alerts===financial.current.alerts&&failed.revision===revision.current&&failed.compoundReviewVersion===compoundBook.reviewVersion)return false;
  if(!manual&&!coordinator.current)return false;
  // The debounced autosave never saves mid-gesture (frame gesture, eraser drag): it retries every 250 ms
  // until the gesture ends, with no cap (a capped save published into its own hold and quarantined the cell).
  if(!manual&&!flush&&grid?.gestureActive?.()){scheduleSaveRetry();return false;}
  if(manual){manualSaveQueued.current=false;autosaveRetry.current.waits=0;}
  try{const shouldSnapshot=manual||book.autosave&&layoutIsDirty(book,expected.grid!),next=shouldSnapshot?{...expected,layoutLibrary:prepareLayoutSave(book,expected.grid!,Date.now())}:expected;
   await persistLayoutCandidate(expected,next,shouldSnapshot?'Layout saved locally.':book.autosave?'Workspace saved locally.':'Recovery draft saved locally. Layout autosave is off; the saved layout is unchanged.',!manual,sourceChange,flush);holdRetry.current.count=0;return true;
  }catch(error){const retrying=!manual&&!flush&&holdRetry.current.refused&&holdRetry.current.count<120;if(!retrying)reportFailure(error);if(!manual&&!flush&&holdRetry.current.refused)scheduleHoldRetry();return false;}
 }
 /** An autosave refused by the chart hold (a chart still settling) is retried every second, up to 120 times in a
  row, instead of waiting for the next workspace change. A refusal used to leave the change unsaved for the rest of the session. */
 function scheduleHoldRetry(){const retry=holdRetry.current;if(retry.timer!==null||retry.count>=120)return;retry.count++;retry.timer=setTimeout(()=>{retry.timer=null;void latestSave.current(false);},1000);}
 /** One 250 ms retry timer for a deferred autosave (open gesture, Source change) and a queued explicit save. */
 function scheduleSaveRetry(){const retry=autosaveRetry.current;if(retry.timer===null)retry.timer=setTimeout(()=>{retry.timer=null;void latestSave.current(manualSaveQueued.current);},250);}
 /** Queue an explicit save behind the in-flight autosave, Source change or chart gesture (bounded to about 60 s). */
 function queueManualSave(status:string){const retry=autosaveRetry.current;if(!manualSaveQueued.current){manualSaveQueued.current=true;retry.waits=0;setMessage(status);}else if(++retry.waits>240){manualSaveQueued.current=false;retry.waits=0;setMessage('The queued save did not run because a chart gesture, save or chart change is still in progress. Save again.');return;}scheduleSaveRetry();}

 /* Live price marks never re-arm the debounce (paperDurableKey leaves out quotes and the clock), and a
  stream of real changes still saves within AUTOSAVE_MAX_WAIT_MS of the first one. */
 const paperDurable=useMemo(()=>paperDurableKey(paper),[paper]);
 useEffect(()=>{if(!loaded||!window.lv||workspaceBusy||storageBusy)return;const now=Date.now();autosaveDirtySince.current??=now;const timer=setTimeout(()=>{autosaveDirtySince.current=null;void save(false);},Math.min(1200,autosaveDelay(autosaveDirtySince.current,now)));return()=>clearTimeout(timer);},[workspace,loaded,paperDurable,paperState.book,alerts,workspaceBusy,storageBusy,chart]);
 /* Flush the debounced autosave now. The main process holds a window close until this settles (bounded
  there); hiding the window flushes too. It waits for an in-flight save or chart transaction, then runs the
  ordinary autosave path, so startup recovery, CAS revisions and the no-retry-after-rejection rule still apply. */
 const latestSave=useRef(save);latestSave.current=save;
 /* A viewport edit released within the grid's 200 ms frame-gesture window is finished first, through the
  active chart tree's coordinator (the host forwards only the active tree's) and the same flush its timer runs.
  Hiding the window flushes only a finished gesture (a held drag publishes on its own release); the close
  request also finishes a held one, since the window closes after this save. */
 const flushPendingSave=useRef(async(reason:'close'|'hidden'='close')=>{const deadline=Date.now()+2500;let sourceChange=false;while(saving.current||workspaceTransaction.current||storageMutation.current||coordinator.current?.transactionActive?.()){if(Date.now()>deadline){
   // A close never silently skips its save. Past the bound, with only a grid Source change still running (no save,
   // storage mutation or workspace transaction), it writes the committed workspace without that change; the main process
   // closes the window right after (its own bound is 3 s). Anything else past the bound, and a hidden window, still skip.
   if(reason!=='close'||saving.current||workspaceTransaction.current||storageMutation.current)return false;sourceChange=true;break;}
   await new Promise(resolve=>setTimeout(resolve,20));}
  // The Source change's hold refuses frame publication, and no frame gesture can begin inside it, so none is flushed then.
  if(!sourceChange)try{coordinator.current?.flushFrameGesture?.({includeHeld:reason==='close'});}catch(error){reportFailure(error);}
  // Close finished any gesture above and saves now (an explicit save still queued behind the autosave runs as
  // that save). Hiding never saves with a held gesture still open (its later publication would land inside the
  // save's hold); it hands over to the gesture-gated autosave, which saves at its end.
  return latestSave.current(reason==='close'&&manualSaveQueued.current,reason==='close',sourceChange);});
 useEffect(()=>{const lv=window.lv;if(!lv)return;const flushNow=()=>{/* Layout Autosave off with unsaved edits: keep the layout window open and ask. */if(closeNeedsPrompt(windowMode,current.current.layoutLibrary,current.current.grid,discardOnClose.current)){setClosePrompt(true);return Promise.resolve({keepOpen:true});}return flushPendingSave.current('close');},hidden=()=>{if(globalThis.document?.visibilityState==='hidden')void flushPendingSave.current('hidden');};const off=typeof lv.onFlushRequest==='function'?lv.onFlushRequest(flushNow):undefined;window.addEventListener?.('visibilitychange',hidden);return()=>{off?.();window.removeEventListener?.('visibilitychange',hidden);};},[]);
 useEffect(()=>{const keyboard=(e:KeyboardEvent)=>{if(backgroundWriteActive()&&(e.key==='Delete'||e.key==='Backspace')&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&!e.isComposing&&!dialog&&!document.querySelector('[role=dialog],[role=alertdialog]')&&keyboardCommands.current.deleteKeyDuringSave(e.target as HTMLElement|null)){e.preventDefault();e.stopImmediatePropagation();return;}if((workspaceTransaction.current||storageMutation.current||heldKeys.current!.pending()>0&&heldCommandOf(e))&&!(backgroundSave.current&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s')){const held=heldCommandOf(e);if(held&&!e.isComposing&&!(e.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable="true"],[role=menu],[aria-haspopup=menu][aria-expanded=true]')&&!dialog&&!document.querySelector('[role=dialog],[role=alertdialog]')&&heldKeys.current!.accept(held)&&held.kind!=='disarm'){e.preventDefault();e.stopImmediatePropagation();}return;}const editing=(e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]');if(e.isComposing||editing||dialog||document.querySelector('[role=dialog],[role=alertdialog]'))return;if((e.target as HTMLElement)?.closest?.('[role=menu],[aria-haspopup=menu][aria-expanded=true]'))return;/* Typing in a watchlist goes to its Add symbol dialog. */if(watchTypeToAddSeed(e,e.target as Element|null)!==null)return;/* Ctrl+S and the other editor chords belong to the script editor while it holds the keyboard. */if(scriptEditorOwnsKey(e,e.target as Element|null,document))return;if((e.ctrlKey||e.metaKey)&&e.altKey&&!e.shiftKey&&e.key.toLowerCase()==='h'){e.preventDefault();e.stopImmediatePropagation();utilityKeys.current.hide();return;}if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&(e.key.toLowerCase()==='c'||e.key.toLowerCase()==='v'||e.key.toLowerCase()==='x')){const target=e.target as HTMLElement|null,owner=clipboardKeyDispatcher({inChartCell:!!target?.closest?.('.lv-multichart,[data-chart-tree]'),inTextInput:!!target&&(target.tagName==='INPUT'||target.tagName==='TEXTAREA'||target.isContentEditable===true),composing:false,chartActive:true}),clipKey=e.key.toLowerCase() as 'c'|'v'|'x';/* The native router has no Cut, so App owns Ctrl+X on the chart as well. */if(owner==='app'||clipKey==='x'&&owner==='router'){e.preventDefault();e.stopImmediatePropagation();utilityKeys.current.clipboard(clipKey);}return;}const replayKey=replayShortcut({key:e.key,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,altKey:e.altKey,metaKey:e.metaKey,isComposing:e.isComposing,focus:(e.target as HTMLElement)?.closest?.('.chart-workspace')?'chart':'other'},replaySessionRef.current);if(replayKey){e.preventDefault();e.stopImmediatePropagation();replayKeys.current(replayKey);return;}const symbolEntry=symbolEntryFromKey(e,!loaded||symbolEntryBlocked(document,e.target as Element|null));if(symbolEntry){e.preventDefault();e.stopImmediatePropagation();openSymbolSearch(symbolEntry.initialQuery,symbolEntry.origin);return;}const intervalSeed=!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&!e.repeat&&loaded&&!symbolEntryBlocked(document,e.target as Element|null)?intervalEntrySeed(e.key):null;if(intervalSeed!==null){e.preventDefault();e.stopImmediatePropagation();setIntervalPrompt(intervalSeed);return;}const keyTarget=e.target as HTMLElement|null,onChart=!keyTarget||keyTarget.tagName==='BODY'||!!keyTarget.closest?.('.chart-workspace')&&!keyTarget.closest?.('button,a,select,[role=button],[role=tab],[role=slider],[role=radio]');const routed=classifyWorkspaceKey(e,{editable:false,composing:false,dialogOpen:false,menuOpen:false,dropdownOpen:false,chartFocus:onChart,loaded,placementActive:false,toolArmed:false,selectedDrawings:0,hasSelection:false});if(routed.command==='indicators'||routed.command==='shortcuts'||routed.command==='go-to-date'||routed.command==='add-to-watchlist'||routed.command==='next-symbol'||routed.command==='previous-symbol'){e.preventDefault();e.stopImmediatePropagation();keyboardCommands.current.workspaceKey(routed.command);return;}if(routed.command==='fullscreen'){e.preventDefault();e.stopImmediatePropagation();keyboardCommands.current.fullscreenKey();return;}if(routed.command==='price-scale'){e.preventDefault();e.stopImmediatePropagation();keyboardCommands.current.priceScaleKey(routed.action);return;}if(routed.command==='reset-time-scale'){e.preventDefault();e.stopImmediatePropagation();keyboardCommands.current.resetTimeScaleKey(current.current.chartSettings.canvas.rightMarginBars);return;}if(routed.command==='quick-search'){e.preventDefault();e.stopImmediatePropagation();keyboardCommands.current.quickSearchKey();return;}if(routed.command==='snapshot'){e.preventDefault();e.stopImmediatePropagation();keyboardCommands.current.snapshotKey(routed.mode);return;}if(routed.command==='navigate'){e.preventDefault();e.stopImmediatePropagation();runKeyNavigation(chart,routed.action);return;}if(routed.command==='app-command'){const run=keyCommandRuns.current[routed.id];if(run&&!run.disabled){e.preventDefault();e.stopImmediatePropagation();run.run();}return;}if(routed.command==='extra-key'){e.preventDefault()
 e.stopImmediatePropagation()
 extraKeyRun.current(routed.action)
 return
}if(routed.command==='paper-preset'&&keyboardCommands.current.paperKey(e,onChart)){e.preventDefault();e.stopImmediatePropagation();return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();void save();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.stopImmediatePropagation();e.shiftKey?keyboardCommands.current.redo():keyboardCommands.current.undo();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();e.stopImmediatePropagation();keyboardCommands.current.redo();}if(e.key==='.'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();setDialog('layouts');}if(e.key==='Escape')disarmTool();if(e.altKey&&!e.ctrlKey&&!e.metaKey){const key=e.key.toLowerCase();if(!e.shiftKey&&key==='t'){e.preventDefault();keyboardCommands.current.armTool('trendline');}else if(!e.shiftKey&&key==='f'){e.preventDefault();keyboardCommands.current.armTool('fibretracement');}else if(e.shiftKey&&key==='r'){e.preventDefault();keyboardCommands.current.armTool('box');}else if(!e.shiftKey&&(key==='h'||key==='j'||key==='v'||key==='c')){e.preventDefault();keyboardCommands.current.placeAtCrosshair(({h:'hline',j:'hray',v:'vline',c:'crossline'} as const)[key]);}else if(!e.shiftKey&&key==='a'&&loaded){e.preventDefault();if(keyboardCommands.current.drawingAlert()){e.stopPropagation();return;}openAlertCreate();}}if(e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&e.key.toLowerCase()==='n'){const active=currentInput.current?.dataset;if(active){e.preventDefault();openNotes({exchange:active.instrument.exchange,symbol:active.instrument.symbol,synthetic:active.provenance.fixture},undefined,true);}}};window.addEventListener('keydown',keyboard,true);return()=>window.removeEventListener('keydown',keyboard,true);},[chart,loaded,dialog,symbolCandidates]);
 useEffect(()=>{if(!anchorPlacement)return;const key=(event:KeyboardEvent)=>{if(event.key!=='Escape')return;event.preventDefault();event.stopImmediatePropagation();anchorPlacementEnd.current(true);};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[anchorPlacement]);
 useEffect(()=>{if(!replaySession?.playing)return;let previous=performance.now();const timer=setInterval(()=>{const now=performance.now(),elapsed=now-previous;previous=now;if(workspaceTransaction.current||storageMutation.current)return;replayTick.current(elapsed);},50);return()=>clearInterval(timer);},[replaySession?.playing]);
 // A range chosen with an interval switch is shown once the switched chart input is current.
 /* The input can still be busy on the last render of a switch (the ready callback lands while a second write or the analysis runs), and nothing re-renders when it frees up, so the range was lost (6M stayed on the default view). A busy input is re-checked every 16 ms for up to 5 s; a newer render cancels the check. */
 useEffect(()=>{let retry:ReturnType<typeof setTimeout>|null=null;const until=Date.now()+5000;const apply=()=>{retry=null;const pending=pendingRange.current;if(!pending||!chart||dataset.provenance.datasetId!==pending.datasetId||!bars.length/* A live feed's placeholder has no bars yet */)return;try{if(!chart.isInputCurrent({bars,source,style:workspace.chartStyle})){if(Date.now()<until)retry=setTimeout(apply,16);return;}const shown=chart.setRange(pending.preset);if(!shown.ok){pendingRange.current=null;setMessage(shown.diagnostic.message);return;}/* A live range wider than the loaded bars asks for the history it needs and re-applies as each page lands (this effect re-runs on every bars change). */if(!shown.limitedByHistory){pendingRange.current=null;return;}const state=liveHistoryState(pending.datasetId);pending.tries=(pending.tries??0)+1;pending.at??=Date.now();const stale=pending.tries>200||Date.now()-pending.at>60000;if(!state||state.status==='exhausted'||stale){pendingRange.current=null;setMessage(stale?'Showing the history loaded so far.':'Showing all available history for this range.');return;}requestLiveHistory(pending.datasetId);}catch(error){pendingRange.current=null;reportFailure(error);}};apply();return()=>{if(retry!==null)clearTimeout(retry);};},[chart,bars,dataset,inspectionEpoch]);
 /** A symbol or interval switch requested while a storage write (the routine background autosave) holds
  the lock used to be refused by commit with only a status message. It is now queued and applied once the write ends
  (re-queued if another write follows at once). Only the latest queued switch runs. Returns false when nothing is writing. */
 function deferSwitch(label:string,run:()=>boolean|{ok:boolean;message?:string},settle?:(result:{ok:boolean;message:string|null})=>void):boolean{
  if(!storageMutation.current)return false;const token={};queuedSwitch.current=token;
  /* `settle` tells the interval entry how a queued switch ended, so a refusal shows its reason there. */
  afterStorageWrite(()=>{if(queuedSwitch.current!==token){settle?.({ok:true,message:null});return;}queuedSwitch.current=null;if(deferSwitch(label,run,settle))return;const result=run(),ok=typeof result==='boolean'?result:result.ok;
   settle?.({ok,message:typeof result==='object'?result.message??null:null});
   if(ok)setMessage('Switched to '+label+'.');else if(typeof result==='object'&&result.message)setMessage(result.message);});
  setMessage('Switching to '+label+' once the background save finishes.');return true;
 }
 function switchSymbol(value:string,sourceId:string|null=null){const symbol=value.trim().toUpperCase();if(!/^[A-Z0-9.^_-]{1,24}$/.test(symbol)){setMessage('Enter a symbol using letters, numbers, dots or dashes.');return false;}if(deferSwitch(symbol,()=>switchers.current.switchSymbol(value,sourceId)))return true;if(!commit({symbol,sourceId}))return false;takeSymbol(symbol);setReplay(null);setReplaySession(null);return true;}
 /** Open one FRED series on the active chart. The answer is dropped when a newer FRED open or another symbol came first. */
 function openFred(series:string){
  const token={},from=current.current.symbol,label='FRED:'+series;fredOpenToken=token;setMessage('Opening '+label+'.');
  void openFredSymbol(window.lv,label,{enabled:fredRemoteOk}).then(({dataset,notice})=>{
   if(fredOpenToken!==token)return;fredOpenToken=null;
   if(!dataset){if(notice)setMessage(notice);return;}
   const id=dataset.provenance.datasetId;setLiveDatasets(prior=>({...prior,[id]:dataset}));
   if(current.current.symbol!==from)return;
   if(switchSymbol(dataset.instrument.symbol,id)){rememberRecentSymbol(recentStorage(),dataset.instrument.symbol);if(!queuedSwitch.current)setMessage(notice??'Opened '+label+', '+shortIntervalText(FRED_RESOLUTION)+'.');}
  },error=>{if(fredOpenToken===token){fredOpenToken=null;reportFailure(error);}});
 }
 /** Saved FRED charts reopen through the cache; any other entry is a live feed. */
 function reopenLiveEntries(entries:readonly LiveReopenEntry[],fred:readonly LiveReopenEntry[]=[]){
  const saved=[...fred,...entries.filter(entry=>entry.providerId===FRED_PROVIDER_ID)];
  for(const entry of entries)if(entry.providerId!==FRED_PROVIDER_ID)attachLive(entry.providerId,entry.symbol,entry.interval);
  if(saved.length)void reopenFredCharts(window.lv,saved,{enabled:fredRemoteOk}).then(notices=>{if(notices[0])setMessage(notices[0]);},reportFailure);
 }
 /** LIVE: open a feed on the active chart (backfill, then streaming). The old feed closes only after the chart moved. */
 function openLive(providerId:string,symbol:string,resolution:string):boolean{
  if(deferSwitch(symbol+' '+resolution,()=>switchers.current.openLive(providerId,symbol,resolution)))return true;
  const attached=attachLive(providerId,symbol,resolution);if(!attached)return false;const {handle,existing}=attached;
  // A derived chart is named by its canonical expression (GME / spy opens as GME/SPY).
  if(providerId===SYMBOL_MATH_PROVIDER_ID)symbol=handle.dataset().instrument.symbol;
  // A chart still on the factory UTC zone takes the Default chart timezone for the live symbol
  // (factory Exchange: New York for a US stock, so the 09:30 open is labelled 09:30; UTC for crypto). A zone the owner chose is kept.
  const options=current.current.chartOptions,zone=liveOpenTimezone(options?.timezone,current.current,handle.dataset().instrument);
  if(!commit({symbol,sourceId:handle.datasetId,...(zone?{chartOptions:{...options,timezone:zone}}:{})})){if(!existing)detachLive(handle);return false;}
  takeSymbol(symbol);setReplay(null);setReplaySession(null);
  return true;
 }
 /** Open (or share) a live feed and publish its dataset, without changing any chart. */
 /** The live provider for a feed (created on first use). Also the symbol math provider, whose components open
  * through the Coinbase and Alpaca providers here (or an import); it needs the desktop bridge only for live components. */
 function liveProviderFor(providerId:string):{open(symbol:string,resolution:string):LiveHandle}|null{
  const lv=window.lv;
  if(providerId===COINBASE_PROVIDER_ID){if(!coinbaseProvider.current&&lv?.fetchCoinbaseCandles&&lv.subscribeCoinbase&&lv.unsubscribeCoinbase&&lv.onCoinbaseEvent)coinbaseProvider.current=new CoinbaseLiveProvider(lv as unknown as CoinbaseBridge);return coinbaseProvider.current;}
  if(providerId===ALPACA_IEX_PROVIDER_ID){if(!alpacaProvider.current&&lv?.fetchAlpacaBars&&lv.subscribeAlpaca&&lv.unsubscribeAlpaca&&lv.onAlpacaEvent)alpacaProvider.current=new AlpacaLiveProvider(lv as unknown as AlpacaBridge);return alpacaProvider.current;}
  if(providerId===SYMBOL_MATH_PROVIDER_ID){
   if(!symbolMathProvider.current)symbolMathProvider.current=new SymbolMathProvider((symbol,resolution)=>symbolMathHooks.current!.open(symbol,resolution),{known:symbol=>symbolMathHooks.current?.known(symbol)??false,alpacaComponents:(symbols,resolution)=>symbolMathHooks.current?.alpaca(symbols,resolution)??[],openAlpacaSymbols:()=>symbolMathHooks.current?.streaming()??new Set()});
   return symbolMathProvider.current;
  }
  return null;
 }
 /** One component of a derived series (or a second-symbol indicator series), through the chart loaders: an
  * exact import at this interval (static), a Coinbase product, or an Alpaca US ticker. Throws a plain message otherwise. */
 function importedComponent(symbol:string,resolution:string):BarDataset|null{
  const rows=current.current.imports.filter(row=>row.instrument.symbol===symbol&&row.resolution===resolution&&row.provenance.fixture!==true&&Array.isArray(row.bars)&&row.bars.length>0);
  if(rows.length>1)throw new Error(`More than one import carries ${symbol} at ${resolution}. Remove one of them first.`);
  return rows[0]??null;
 }
 function openComponentFeed(symbol:string,resolution:string):LiveHandle{
  const imported=importedComponent(symbol,resolution);if(imported)return staticComponentHandle(imported);
  // Example screen: an example symbol (SPY, BTC, ...) reads its generated series, so two-symbol studies work without a live feed.
  const example=exampleComponentDataset(symbol,resolution);if(example)return staticComponentHandle(example);
  if(symbolMathComponentSource(symbol)==='coinbase'){
   if(!liveDataOf(current.current).coinbase)throw new Error('Coinbase live data is turned off. Open Data sources to turn it on.');
   const provider=liveProviderFor(COINBASE_PROVIDER_ID);if(!provider)throw new Error('Live data needs the desktop app.');return provider.open(symbol,resolution);
  }
  if(!ALPACA_SYMBOL.test(symbol))throw new Error(`${symbol} is not an import at ${resolution}, a Coinbase product or a US stock ticker.`);
  if(!alpacaKeyRef.current)throw new Error(`${symbol} needs Alpaca live data. Add the Alpaca key in Data sources, or import ${symbol} at ${resolution}.`);
  const provider=liveProviderFor(ALPACA_IEX_PROVIDER_ID);if(!provider)throw new Error('Live data needs the desktop app.');return provider.open(symbol,resolution);
 }
 function attachLive(providerId:string,symbol:string,resolution:string):{handle:LiveHandle;existing:boolean}|null{
  const provider=liveProviderFor(providerId);
  if(!provider){setMessage('Live data needs the desktop app.');return null;}
  // A feed already open for this dataset (another chart streams it) is shared, never opened twice.
  // At the Alpaca cap, warm feeds of left tabs give their slots back first, then the open is tried once more.
  const openOnce=()=>provider.open(symbol,resolution);
  let handle:LiveHandle;try{try{handle=openOnce();}catch(cause){if(!(cause instanceof Error&&cause.message===ALPACA_CAP_MESSAGE&&warmFeeds.current.layouts.size))throw cause;forgetWarmLayouts(warmFeeds.current);sweepLiveFeeds(current.current.grid);handle=openOnce();}}catch(cause){setMessage(cause instanceof Error?cause.message:String(cause));return null;}
  const existing=liveHandles.current.get(handle.datasetId);if(existing){handle.close();return{handle:existing,existing:true};}
  registerLiveDataset(handle.dataset());liveHandles.current.set(handle.datasetId,handle);
  const owned=handle,first=owned.dataset();setLiveDatasets(prior=>({...prior,[owned.datasetId]:first}));let shown:BarDataset|undefined=first;
  const take=(next:BarDataset)=>{if(liveHandles.current.get(owned.datasetId)!==owned)return;publishLiveDataset(next);const prior=shown;shown=next;queueLiveState(next,prior);};
  /* live-hold-gate.ts: a snapshot that is not growth of the shown one waits while a save holds the chart tree. */
  owned.onChange(next=>{if(liveHandles.current.get(owned.datasetId)!==owned)return;if(!sameDatasetInput(shown,next)&&liveHoldGateFor(liveHandles.current).offer(owned.datasetId,()=>take(next)))return;take(next);});
  return{handle,existing:false};
 }
 function detachLive(handle:LiveHandle){liveHandles.current.delete(handle.datasetId);handle.close();unregisterLiveDataset(handle.datasetId);setLiveDatasets(prior=>{if(!(handle.datasetId in prior))return prior;const next={...prior};delete next[handle.datasetId];return next;});}
 function applyInterval(selected:BarDataset,intervals:IntervalMenuState,result:IntervalSuccess){if(dataset.provenance.providerId===FRED_PROVIDER_ID&&selected.resolution!==FRED_RESOLUTION){setMessage(FRED_INTERVAL_NOTICE);return false;}if(deferSwitch(selected.instrument.symbol+' '+selected.resolution,()=>switchers.current.applyInterval(selected,intervals,result)))return true;if(isLiveDatasetId(selected.provenance.datasetId))return openLive(selected.provenance.providerId,selected.instrument.symbol,selected.resolution);const next=selectWorkspaceInterval(current.current,selected,intervals),resetNotice=frameResetNotice(current.current,next);/* The grid carries the chart type, so leaving Range sets the active cell's style in the same step. */const grid=current.current.chartStyle==='range'&&next.grid?gridLeavingRange(next.grid):next.grid;if(!commit({imports:next.imports,intervals:next.intervals,grid}))return false;setReplay(null);setReplaySession(null);/* An interval change is silent; only a reset manual range is worth a word. */setMessage(resetNotice);void result;return true;}
 /** A time interval chosen on a Range chart returns the chart to Candles. */
 function leaveRangeStyle():Partial<Workspace>{if(current.current.chartStyle!=='range')return{};const grid=current.current.grid;return grid?{grid:gridLeavingRange(grid)}:{chartStyle:'candles'};}
 /** A bottom-toolbar range. Same interval (or no exact source for it): show the range now. Otherwise open the exact supplied interval first and show the range once that chart input is current (pendingRange, effect below). */
 function rangeFromBottomToolbar(row:BottomRange){try{if(!chart)return;/* The click resolves against the chart as it is now; bottomServed is a deferred copy that can still describe the previous symbol. */const served=servedBottomRange(row,id=>{try{return resolveIntervalSwitch(intervalUniverse,chartIdentity,id,current.current.intervals.policy,true).ok;}catch{return false;}});if(served===null){setMessage(row.label+' is not available for this data.');return;}const servable=(id:string)=>{try{return resolveIntervalSwitch(intervalUniverse,chartIdentity,id,current.current.intervals.policy,true).ok;}catch{return false;}},target=fitRangeInterval(row.preset,served?.interval??row.interval,(chart as any).maxVisibleBars?.()??null,servable),sources=withDemoSiblings([...workspaceDatasets(current.current),...liveSiblings(dataset)],dataset),policy=current.current.intervals.policy;
  if(target!==dataset.resolution){const exact=chooseIntervalSource(sources,{instrumentId:dataset.instrument.id,target,policy});let next:{dataset:BarDataset;result:IntervalSuccess}|null=exact.ok&&exact.kind==='exact'&&exact.dataset!==dataset?{dataset:exact.dataset,result:exact}:null;
   /* A range switches the interval (5Y opens 1W), derived from the loaded bars when no exact source exists, like a typed interval. */
   if(!next){const choice=resolveIntervalSwitch(sources,dataset,target,policy);if(choice.ok&&choice.kind==='local'&&choice.result.dataset!==dataset)next={dataset:choice.result.dataset,result:choice.result};
    /* A live chart switches its feed for the range (1D opens 1m, 5Y opens 1W). Before, the 'live' answer was dropped, the range was shown in the old interval and backfill paged in hundreds of old-interval bars. */
    else if(choice.ok&&choice.kind==='live'&&choice.interval!==dataset.resolution){/* The range is pinned to the new feed when the switch runs, also a switch queued behind the background autosave (it used to drop the range and leave the carried spacing: 1D showed 3 one-minute bars). */const preset=row.preset,interval=choice.interval;pendingRange.current=null;applyLiveInterval(interval,current.current.intervals,()=>{const id=current.current.sourceId;pendingRange.current=typeof id==='string'?{preset,interval,datasetId:id}:null;});return;}}
   if(next){pendingRange.current={preset:row.preset,interval:next.dataset.resolution,datasetId:next.dataset.provenance.datasetId};/* The switch renders as a transition (the click and the chart build are separate tasks); same result. */let applied=false;const switched=next;startTransition(()=>{applied=!!applyInterval(switched.dataset,current.current.intervals,switched.result);});if(!applied)pendingRange.current=null;return;}}
  pendingRange.current=null;if(current.current.chartStyle==='range'){if(!commit(leaveRangeStyle()))return;const shownChart=chart;requestAnimationFrame(()=>{try{const shown=shownChart.setRange(row.preset);if(!shown.ok)setMessage(shown.diagnostic.message);}catch(error){reportFailure(error);}});return;}const shown=chart.setRange(row.preset);if(!shown.ok)setMessage(shown.diagnostic.message);else if(shown.limitedByHistory&&liveHistoryState(dataset.provenance.datasetId)?.status==='idle'){pendingRange.current={preset:row.preset,interval:dataset.resolution,datasetId:dataset.provenance.datasetId};requestLiveHistory(dataset.provenance.datasetId);}}catch(error){reportFailure(error);}}
 function toggleIntervalMenu(){if(intervalMenuLeft!==null){setIntervalMenuLeft(null);return;}const box=document.getElementById?.('lv-interval-badge')?.getBoundingClientRect?.();setIntervalMenuLeft(Math.max(4,Math.round(box?.left??120)));}
 function closeIntervalMenu(focusTrigger:boolean){setIntervalMenuLeft(null);if(focusTrigger&&typeof document!=='undefined')document.getElementById?.('lv-interval-badge')?.focus?.();}
 /** LIVE: switch the active live chart's interval. The feed for the new interval opens first and the old one closes after the chart moved, so the symbol keeps one subscription. */
 function applyLiveInterval(interval:string,intervals:IntervalMenuState,opened?:()=>void){if(!isLiveDatasetId(dataset.provenance.datasetId))return false;if(deferSwitch(dataset.instrument.symbol+' '+interval,()=>switchers.current.applyLiveInterval(interval,intervals,opened)))return true;if(!openLive(dataset.provenance.providerId,dataset.instrument.symbol,interval))return false;const patch={...(intervals!==current.current.intervals?{intervals}:{}),...leaveRangeStyle()};if(Object.keys(patch).length)commit(patch);/* "Opened ... (live), 1D" no longer stays after the switch. */setMessage('');/* Runs once the new feed is the chart's source, now or after a queued switch. */opened?.();return true;}
 /** One path for every interval choice (menu, toolbar favorite, typed entry): live feed plan or local aggregation. */
 function switchInterval(target:string):{ok:boolean;message?:string;settled?:Promise<{ok:boolean;message:string|null}>}{/* FRED series are 1D only. */if(dataset.provenance.providerId===FRED_PROVIDER_ID&&target!==FRED_RESOLUTION)return{ok:false,message:FRED_INTERVAL_NOTICE};if(looksLikeRangeInterval(target)){const ranged=parseRangeInterval(target);return ranged.ok?applyRangeInterval(ranged.size):{ok:false,message:ranged.message};}try{let settle:(result:{ok:boolean;message:string|null})=>void=()=>{};const settled=new Promise<{ok:boolean;message:string|null}>(resolve=>{settle=resolve;});if(deferSwitch(dataset.instrument.symbol+' '+target,()=>switchers.current.switchInterval(target),settle))return{ok:true,settled};const choice=resolveIntervalSwitch(withDemoSiblings([...workspaceDatasets(current.current),...liveSiblings(dataset)],dataset),dataset,target,current.current.intervals.policy);if(!choice.ok)return{ok:false,message:choice.reason};if(choice.interval===dataset.resolution)return current.current.chartStyle!=='range'||commit(leaveRangeStyle())?{ok:true}:{ok:false,message:'The interval change was rejected. Review the workspace message.'};if(choice.kind==='live')return applyLiveInterval(choice.interval,current.current.intervals)?{ok:true}:{ok:false,message:'The live interval could not be opened.'};return applyInterval(choice.result.dataset,current.current.intervals,choice.result)===false?{ok:false,message:'The interval change was rejected. Review the workspace message.'}:{ok:true};}catch(error){return{ok:false,message:error instanceof Error?error.message:String(error)};}}
 function favoriteInterval(target:string){const result=switchInterval(target);if(!result.ok)setMessage(result.message??'That interval is not available.');}
 // A queued switch runs the latest render's functions (current dataset, intervals and handlers).
 const switchers=useRef({switchSymbol,openLive,applyInterval,applyLiveInterval,switchInterval,applyRangeInterval});switchers.current={switchSymbol,openLive,applyInterval,applyLiveInterval,switchInterval,applyRangeInterval};
 const selectPaperDockSymbol=useCallback((instrument:{symbol:string})=>{switchers.current.switchSymbol(instrument.symbol);},[]);
 function openWatchDataset(data:BarDataset,all=false){const next=all?allChartsDataset(current.current,data):patchWorkspace(current.current,{symbol:data.instrument.symbol,sourceId:suppliedSourceId(current.current,data)});if(!commit({grid:next.grid}))throw new Error('The source change could not be saved. Review the workspace message.');setReplay(null);setReplaySession(null);takeSymbol(data.instrument.symbol);return true;}
 /** Space / Shift+Space from the chart open the next or previous watchlist symbol (same route as a row click). */
 function stepWatchlist(delta:1|-1){try{const data=currentInput.current?.dataset;if(!data)return;const next=stepWatchSymbol(current.current.watchBook,currentInput.current?.datasets??[],{symbol:data.instrument.symbol,exchange:data.instrument.exchange},delta);if(!next){setMessage('The watchlist has no other symbol to open.');return;}if(demoDataMode()!=='legacy'&&isDemoPlaceholder(next)){const opener=liveOpenerFor(next.instrument.symbol);if(opener){opener();return;}}openWatchDataset(next);}catch(error){reportFailure(error);}}
 /** Alt+W adds the chart's symbol to the active watchlist. */
 function addChartSymbolToWatchlist(){try{const data=currentInput.current?.dataset;if(!data){setMessage('This chart has no symbol to add yet.');return;}/* In example mode the panel shows the example list (never saved), so the symbol goes there, as the panel's own Add does. */const example=exampleBook,book=example??current.current.watchBook,list=activeWatchList(book),reference=referenceFromDataset(data);if(list.rows.some(row=>row.kind==='symbol'&&row.reference.symbol===reference.symbol&&row.reference.exchange===reference.exchange)){setMessage(data.instrument.symbol+' is already in '+list.name+'.');return;}const next=addWatchSymbols(book,list.id,[reference],()=>crypto.randomUUID());if(example){setExampleBook(next);setMessage('Added '+data.instrument.symbol+' to '+list.name+'.');return;}if(commit({watchBook:next,watchlist:watchSymbols(next)}))setMessage('Added '+data.instrument.symbol+' to '+list.name+'.');}catch(error){reportFailure(error);}}
 function openNotes(target:NoteMarket|null,noteId?:string,startNew=false){try{assertStartupEditable(startup.current);const market=restoreNoteMarket(target);if(noteId&&!current.current.watchBook.notes?.some(note=>note.id===noteId&&noteMarketKey(note.market)===noteMarketKey(market)))throw new Error('The selected note is no longer available.');/* From the open screener, notes stack over it (one dialog state) instead of replacing it; Esc closes notes first. */const overScreener=dialog==='screener'?dialogAuthority.current:undefined;setNoteRequest({id:crypto.randomUUID(),market,noteId,startNew,...(overScreener?{overScreener}:{})});if(!overScreener)setDialog('notes');return true;}catch(cause){reportFailure(cause);return false;}}
 /** The watchlist Hotlists row opens Markets on a hotlist tab (loaded symbols only). */
 function openHotlists(){try{assertStartupEditable(startup.current);if(dialogOwner.current)throw new Error('Close the current dialog before opening Hotlists.');const views=current.current.marketViews;if(views&&!['gainers','losers','active'].includes(views.tab)&&!commit({marketViews:{...views,tab:'gainers'}}))return false;setDialog('markets');return true;}catch(error){reportFailure(error);return false;}}
 function openAdvanced(){try{assertStartupEditable(startup.current);if(dialogOwner.current)throw new Error('Close the current dialog before opening Advanced View.');const owner={id:crypto.randomUUID(),book:current.current.watchBook,state:current.current.watchAdvanced??initial.watchAdvanced!,datasets:currentInput.current!.datasets,calendar:current.current.calendar,news:current.current.news,now:Math.floor(Date.now()/1000)};advancedOwner.current=owner;setAdvancedRequest(owner);dialogOwner.current='watch-advanced';setDialog('watch-advanced');return true;}catch(cause){reportFailure(cause);return false;}}
 function assertAdvancedOwner(owner:NonNullable<typeof advancedRequest>){assertStartupEditable(startup.current);if(advancedOwner.current!==owner||dialogOwner.current!=='watch-advanced'||current.current.watchBook!==owner.book||(current.current.watchAdvanced??initial.watchAdvanced)!==owner.state||currentInput.current?.datasets!==owner.datasets||current.current.calendar!==owner.calendar||current.current.news!==owner.news)throw new Error('Advanced View inputs changed or the dialog closed. Reopen the view.');}
 function retireContextDialog(){const owner=contextDialog.current;contextDialog.current=null;if(owner?.priceRequest)contextPriceAuthority.current!.retire(owner.priceRequest);owner?.ownership.release();}
 async function requestChartContext(action:RootChartMenuAction,snapshot:ChartMenuSnapshot,lease:ChartMenuActionLease,options?:ChartContextActionOptions){
  let ownership:RootChartActionOwnership|null=null,transferred=false,adoptionAttempted=false,mintedRequest:ContextPriceRequest|null=null,actionFailed=false,actionFailure:unknown;
  const canReport=()=>{if(!ownership)return true;try{ownership.assertCurrent(false);return true;}catch{return false;}};
  try{
   // The paper panel and order ticket are floating (non-modal); a clicked-price paper ticket re-adopts the paper panel and its
   // contextRequest effect replaces the draft (a dirty draft gets the replacement prompt). Any other open dialog still refuses.
   assertStartupEditable(startup.current);if(dialogOwner.current&&!(action==='paper-ticket'&&FLOATING_PAPER_DIALOGS.has(dialogOwner.current))||workspaceTransaction.current||storageMutation.current)throw new Error('Finish the current dialog or workspace operation first.');
   adoptionAttempted=true;ownership=captureRootChartAction(snapshot,lease,()=>{const input=currentInput.current;if(!input)throw new Error('The chart is unavailable.');return{epoch:gridGeneration.current,cellId:current.current.grid?.layout.activeCellId??'',controller:activeController.current,input:{bars:input.bars,source:sourceContextForDataset(input.dataset,input.bars),style:current.current.chartStyle},executionIdentity:currentReplay.current?.runId??'ordinary'};});
   if(action==='price-alert'||action==='paper-ticket'){
    const unavailable=contextPriceTargetError(snapshot);if(unavailable)throw new Error(unavailable);
    const capturedOwnership=ownership,replayRun=currentReplay.current,account=action==='paper-ticket'?(replayRun?currentReplayPaper.current:financial.current.paper):null;
    if(action==='paper-ticket'){const refusal=derivedPaperRefusal(snapshot);if(refusal)throw new Error(refusal);}
    if(action==='paper-ticket'&&(!account||replayRun&&account.runId!==replayRun.runId||account.mode!==(replayRun?'replay-paper':'paper')))throw new Error('Wait for the matching virtual account before opening a clicked-price ticket.');
    if(action==='paper-ticket'&&options?.item==='dom'){if(snapshot.instrument.id!==dataset.instrument.id)throw new Error('Open the DOM pane from the active chart.');if(!openPaperDomPane('chart-menu',contextTargetPrice(snapshot)))throw new Error(PAPER_DOM_PANE_NO_HOST);return{ok:true};}
    // With one-click on, a price scale + order row places at the clicked level at once.
    if(action==='paper-ticket'&&options?.order&&account){const placed=oneClickPriceOrder({oneClick:!!account.settings.oneClick,preset:selectedPreset,quantityText:chartQty,order:options.order,priceText:contextPriceLabel(contextTargetPrice(snapshot),snapshot.instrument.tickSize),context:{account,instrument:snapshot.instrument,quote:virtualActionQuote,quoteSource:{key:chartSourceContextKey(snapshot.input.source),state:dataset.provenance.state},now:Math.max(account.clock,virtualNow)},commandId:`plus-${crypto.randomUUID()}`});
     if(placed.kind==='refused')throw new Error(placed.message);
     if(placed.kind==='placed'){if(!(replayRun?acceptReplayPaper:acceptPaper)(placed.account,account))throw new Error('The virtual account change was rejected. Nothing was placed.');if(canReport())setMessage(placed.message);return{ok:true};}}
    // With no preset, Shift+Alt+B/S and the price scale + order rows open the compact order ticket (the one Buy and
    // Sell open) on the order type's tab with the price at the cursor, not the full Paper trading panel.
    if(action==='paper-ticket'&&options?.order&&account&&!selectedPreset&&snapshot.instrument.id===dataset.instrument.id){const qty=chartQty.trim();setOrderSeed({side:options.order.side,tab:options.order.orderType,price:contextPriceLabel(contextTargetPrice(snapshot),snapshot.instrument.tickSize),...(qty?{quantity:qty}:{})});setDialog('order');return{ok:true};}
    const paperOwner=account?{id:account.id,mode:account.mode,runId:account.runId}:null;
    mintedRequest=contextPriceAuthority.current!.mint({id:crypto.randomUUID(),action,price:contextTargetPrice(snapshot),instrument:snapshot.instrument,chartId:snapshot.cellId,sourceKey:chartSourceContextKey(snapshot.input.source),style:snapshot.input.style,executionIdentity:snapshot.executionIdentity,pointTime:snapshot.point.barTime,pointIndex:snapshot.point.barIndex,paperOwner,...(action==='paper-ticket'&&options?.order?{order:options.order}:{})},phase=>{
     assertStartupEditable(startup.current);if(workspaceTransaction.current||storageMutation.current)throw new Error('Wait for the workspace operation before using this clicked-price draft.');capturedOwnership.assertCurrent();
     if(phase==='seed'&&!lease.isCurrent())throw new Error('The opening chart geometry changed before the clicked-price draft was seeded. Reopen the chart menu.');
     if(paperOwner){const live=currentReplay.current?currentReplayPaper.current:financial.current.paper;if(!live||live.id!==paperOwner.id||live.mode!==paperOwner.mode||live.runId!==paperOwner.runId)throw new Error('The clicked-price virtual account was reset or replaced.');}
    });
    const destination=action==='price-alert'?'alerts':'paper';setDialog(destination,{dialog:destination,snapshot,ownership,priceRequest:mintedRequest});transferred=true;return{ok:true};
   }
   // A comparison series' note targets that series' own market; every other target uses the main instrument.
   if(action==='note'){const entity=snapshot.entity,target:NotesContextTarget=entity.kind==='series'?{kind:'series',owner:entity.owner==='main'?'main':{kind:entity.owner.kind,id:entity.owner.id}}:entity.kind==='indicator'?{kind:'series',owner:{kind:'built',id:entity.id}}:{kind:entity.kind};const comparisons=target.kind==='series'&&target.owner!=='main'&&target.owner.kind==='comparison'?snapshot.controller.comparisons.list().map(row=>({id:row.id,exchange:row.dataset.instrument.exchange,symbol:row.dataset.instrument.symbol,synthetic:!!row.dataset.provenance.fixture})):[];return{ok:openNotes(notesTargetForContext(target,{instrument:snapshot.instrument,fixture:!!snapshot.input.source.fixture,comparisons}),undefined,true)};}
   // Copy price, Lock vertical cursor line by time, Table view.
   if(action==='copy-price'){const text=copyPriceText(snapshot);if(!text)throw new Error('Point at a price on the chart to copy it.');const copied=await copyPlainText(text);if(!copied.ok)throw new Error(copied.message);if(canReport())setMessage(copied.message);return{ok:true};}
   if(action==='cursor-lock'){const lock=cursorTimeLock.toggle(snapshot.cellId,snapshot.point.barTime);if(canReport())setMessage(lock?'Vertical cursor line locked to this bar time.':'Vertical cursor line unlocked.');return{ok:true};}
   if(action==='table-view'){setDialog('table-view');return{ok:true};}
   if(action==='objects'){setRailPanel('objects');setObjectTreeTab('object_tree');return{ok:true};}
   const name=chartExportBasename(snapshot.instrument.symbol,snapshot.input.source.fixture);
   if(action==='source-csv'){
    if(!window.lv)throw new Error('Export needs the desktop app.');
    // Live, FRED and licensed data may be saved for the user's own analysis; the save status states the provider terms.
    // A study just added (or its frame recapture) may still be settling; wait for it instead of failing silently.
    const csvAttempt=()=>{const state=current.current,captured=captureChartCsvColumns(snapshot.controller,snapshot.input,snapshot.executionIdentity,csvInventory(snapshot.cellId),()=>{ownership!.assertCurrent();if(current.current!==state)throw Error('The chart configuration changed before CSV export.');});
     const text=chartSourceCsv(snapshot.input,snapshot.executionIdentity,captured.columns,captured.assertCurrent);captured.assertCurrent();return{captured,text};},firstCsv=tryCsvCapture(csvAttempt);
    const {captured,text}=firstCsv.ok?firstCsv.value:await settledCsvCapture(csvAttempt,canReport);
    const result=await window.lv.exportData({text,suggestedName:name+'-bars.csv',format:'csv'}),canReportCsv=()=>{try{captured.assertCurrent();return canReport();}catch{return false;}};const message=result.ok?chartCsvSavedMessage('Selected chart source bars exported locally',snapshot.input.source,captured):result.error.message;if(canReportCsv())setMessage(message);return{ok:result.ok,...(canReportCsv()?{message}:{})};
   }
   // Every built-in indicator at its defaults, calculated off-chart with this chart's facts, saved as one workbook.
   if(action==='indicators-xlsx'){
    const save=(window.lv as {exportBinary?:(value:{data:Uint8Array;suggestedName:string;format:'xlsx'})=>ReturnType<NonNullable<typeof window.lv>['exportBinary']>}|undefined)?.exportBinary;
    if(!window.lv||typeof save!=='function')throw new Error('Export needs the desktop app.');
    // Live, FRED and licensed data may be saved for the user's own analysis; the Key sheet states the provider terms.
    const termsLabel=chartSourceTermsLabel(snapshot.input.source);
    const input=snapshot.input,assertOwner=()=>{ownership!.assertCurrent();};if(!input.bars.length)throw new Error('This chart has no bars to export.');
    if(canReport())setMessage('Exporting all indicators...');
    let viewport:{from:number;to:number}|null=null;try{viewport=snapshot.controller.getViewport();}catch{viewport=null;}
    let drawings:ReturnType<typeof drawingExportRows>=[];try{drawings=drawingExportRows(snapshot.controller.drawingManager.list() as unknown as Record<string,unknown>[]);}catch{drawings=[];}
    const entries=await computeAllIndicators(input.bars,chartIndicatorOptions(input,viewport),{assertCurrent:assertOwner});assertOwner();
    const style=input.style,notes=[...(termsLabel!==null?[personalUseNote(termsLabel)]:[]),...(style==='heikinashi'||isDerivedStyle(style)?['This chart is drawn as '+style+'. Every value here is calculated from the source candles in the Data sheet, which can differ from what that chart type draws.']:[]),...(viewport?['Visible range at export time: '+new Date(viewport.from*1000).toISOString().slice(0,19).replace('T',' ')+' to '+new Date(viewport.to*1000).toISOString().slice(0,19).replace('T',' ')+' UTC.']:[])];
    const book=await allIndicatorsWorkbook({bars:input.bars,symbol:snapshot.instrument.symbol,interval:input.source.resolution??'',exampleData:!!input.source.fixture,sourceName:input.source.label||'the loaded source',exportedAt:new Date(),entries,drawings,notes});assertOwner();
    if(book.bytes.length>ALL_INDICATORS_EXPORT_LIMIT)throw new Error('The workbook is larger than 20 MB. Load fewer bars and try again.');
    const result=await save.call(window.lv,{data:book.bytes,suggestedName:allIndicatorsFileName(name),format:'xlsx'});
    const message=result.ok?`Saved ${result.value.fileName}, ${book.indicators} indicators, ${book.dataColumns+book.patternColumns} columns`+(book.unavailable?` (${book.unavailable} not available on this data, listed in the Key sheet)`:''):result.error.message;
    if(canReport())setMessage(message);return{ok:result.ok,...(canReport()?{message}:{})};
   }
   // Copy chart image puts the same composite on the clipboard; success only after the main process wrote it.
   if(action==='png-copy'){const copied=await copyChartImage({render:()=>snapshot.controller.exportChartImage(snapshot.controller===chart?{overlay:chartSnapshotOverlay(),footer:snapshotFooter()}:undefined),datasetId:snapshot.input.source.datasetId,bridge:window.lv});if(!copied.ok)throw new Error(copied.message);if(canReport())setMessage(copied.message);return{ok:true};}
   if(action==='png-save'){
    if(!window.lv)throw new Error('Image export needs the desktop app.');
    // Live chart screenshots are allowed for personal use, like live data exports.
    const rendered=snapshot.controller.exportChartImage(snapshot.controller===chart?{overlay:chartSnapshotOverlay(),footer:snapshotFooter()}:undefined);if(!rendered.ok)throw new Error(rendered.diagnostic.message);
    const result=await window.lv.exportChart({pngDataUrl:rendered.dataUrl,suggestedName:name+'.png'}),message=result.ok?'Selected chart image exported locally':result.error.message;if(canReport())setMessage(message);return{ok:result.ok,...(canReport()?{message}:{})};
   }
   const destination=({theme:'chart-settings',indicator:'indicators',interval:'intervals',date:'date','drawing-settings':'drawing','drawing-template':'drawing','drawing-visibility':'drawing'} as Partial<Record<RootChartMenuAction,string>>)[action];if(!destination)throw new Error('This chart action is not implemented.');
   if(action==='drawing-settings'){if(snapshot.entity.kind!=='drawing'||snapshot.entity.ids.length!==1)throw new Error('Select one exact drawing for its settings.');snapshot.controller.drawings.select([snapshot.entity.ids[0]]);setSelectedDrawing(snapshot.entity.ids[0]);}
   if(action==='theme')settingsEntry.current=snapshot.entity.kind==='price-axis'?'scales':snapshot.entity.kind==='series'?'symbol':null;
   if(action==='interval')setIntervalTarget(undefined);const priorAuthority=dialogAuthority.current;setDialog(destination,{dialog:destination,snapshot,ownership});if(action==='drawing-visibility'&&dialogAuthority.current!==priorAuthority)routeDrawingDialogTab(dialogAuthority.current,'Visibility');transferred=true;return{ok:true};
  }catch(cause){actionFailed=true;actionFailure=cause;const message=cause instanceof Error?cause.message:String(cause);if(canReport())reportError(message);else if(action==='source-csv')setMessage(CSV_RETRY_NOTICE);return{ok:false,...(canReport()?{message}:{})};}finally{if(!transferred){if(mintedRequest)contextPriceAuthority.current!.retire(mintedRequest);try{if(ownership)ownership.release();else if(!adoptionAttempted&&lease.snapshot===snapshot)lease.release();}catch(cleanup){if(actionFailed)throw new AggregateError([actionFailure,cleanup],(actionFailure instanceof Error?actionFailure.message:String(actionFailure))+'; chart action cleanup failed: '+(cleanup instanceof Error?cleanup.message:String(cleanup)));throw cleanup;}}}
 }
 function importDataset(data:BarDataset){if(current.current.imports.length>=1000)throw new Error('The local dataset limit is 1,000.');if(current.current.imports.some(row=>row.provenance.datasetId===data.provenance.datasetId))throw new Error('That data source is already imported.');const imports=[...current.current.imports,data],next=patchWorkspace(current.current,{imports,symbol:data.instrument.symbol,sourceId:data.provenance.datasetId}),resetNotice=frameResetNotice(current.current,next);if(!commit({imports,grid:next.grid}))return false;takeSymbol(data.instrument.symbol);setReplay(null);setReplaySession(null);setMessage(importCommitMessage(data)+(resetNotice?' '+resetNotice:''));return true;}
 async function exportWorkspace():Promise<string>{let message:string;try{if(!window.lv)throw new Error('Export needs the desktop app.');assertStartupStorageAvailable(startup.current);assertCompoundWorkspaceShareable(compoundBook,startup.current.phase==='recoverable'?startup.current.data:undefined);const data=startup.current.phase==='recoverable'?startup.current.data:prepareWorkspaceJSON({...persistableWorkspace(current.current),paper:financial.current.paper,alerts:financial.current.alerts,...(financial.current.paperBook?{paperBook:financial.current.paperBook}:{})});const result=await window.lv.exportWorkspace({schemaVersion:1,data});message=result.ok?'Workspace exported locally':result.error.message;}catch(error){message=String(error);}setMessage(message);return message;}
 function csvInventory(cellId:string|undefined){const state=current.current,cell=cellId?state.grid?.cells[cellId]:undefined;return {indicators:(cell?.indicators??state.indicators).map(row=>row.id),comparisons:(cell?.comparisons??state.comparisons).map(row=>row.id),scripts:(cell?.scriptBindings??state.scriptBindings??[]).map(row=>row.id)};}
 /** CSV capture waits up to CSV_SETTLE_MS for loading studies and in-flight chart
  * updates (it retries while the request still owns the chart); the last failure is thrown to the caller's report. */
 /** The first CSV capture runs synchronously (no wait when the chart is ready). */
 function tryCsvCapture<T>(attempt:()=>T):{ok:true;value:T}|{ok:false}{try{return{ok:true,value:attempt()};}catch{return{ok:false};}}
 async function settledCsvCapture<T>(attempt:()=>T,live:()=>boolean):Promise<T>{
  const deadline=Date.now()+CSV_SETTLE_MS;
  for(;;){try{return attempt();}catch(cause){if(Date.now()>=deadline||!live())throw cause;}await new Promise(resolve=>setTimeout(resolve,150));}
 }
 async function exportBars(){
  if(!window.lv){setMessage('Export needs the desktop app.');return;}
  const state=current.current,opening=currentInput.current,controller=activeController.current,epoch=gridGeneration.current,execution=currentReplay.current?.runId??'ordinary';
  const assertOwner=()=>{if(current.current!==state||(currentInput.current?.dataset!==opening?.dataset||currentInput.current?.bars!==opening?.bars||currentInput.current?.datasets!==opening?.datasets)||activeController.current!==controller||gridGeneration.current!==epoch||(currentReplay.current?.runId??'ordinary')!==execution)throw Error('The chart source or configuration changed before CSV export.');};
  const canReportCsv=()=>{try{assertOwner();return true;}catch{return false;}};
  try{if(!opening)throw Error('The chart is unavailable.');const input={bars:opening.bars,source:sourceContextForDataset(opening.dataset,opening.bars),style:state.chartStyle},csvAttempt=()=>{const captured=captureChartCsvColumns(controller,input,execution,csvInventory(state.grid?.layout.activeCellId),assertOwner),text=chartSourceCsv(input,execution,captured.columns,captured.assertCurrent);captured.assertCurrent();return{captured,text};},firstCsv=tryCsvCapture(csvAttempt),{captured,text}=firstCsv.ok?firstCsv.value:await settledCsvCapture(csvAttempt,canReportCsv);
   const result=await window.lv.exportData({text,suggestedName:chartExportBasename(state.symbol,opening.dataset.provenance.fixture)+'-bars.csv',format:'csv'});try{captured.assertCurrent();if(canReportCsv())setMessage(result.ok?chartCsvSavedMessage('Chart data saved',input.source,captured):result.error.message);}catch{/* The immutable file may finish after its chart retires; its replacement keeps its status. */}
  }catch(cause){if(canReportCsv())reportFailure(cause);else setMessage(CSV_RETRY_NOTICE);}
 }

 /** Chart settings > Trading > Orders, executions, and positions in chart snapshots (trading.inSnapshots). While
  * it is checked the active chart's image export paints the virtual lines and execution marks the chart shows (same rows and
  * settings as PaperChartLines and PaperExecutionMarks); unchecked, the export is the chart canvas alone. */
 function paperSnapshotOverlay(){const trading=workspace.chartSettings.trading,account=activeAccount;if(!trading.inSnapshots||!account)return undefined;
  const lines=trading.positionsAndOrders?paperChartLines(account,dataset.instrument,{profitLoss:{visible:trading.profitLoss,position:trading.positionPL,brackets:trading.bracketsPL},projectMarketOrders:trading.projectMarketOrders,lastPrice:last?.close??null}):[];
  const marks=trading.executionMarks?paperExecutionMarksFor(account.fills,dataset.instrument,bars):[];
  if(!lines.length&&!marks.length)return undefined;
  return (ctx:CanvasRenderingContext2D,frame:ChartExportFrame)=>{paintPaperSnapshot(ctx,{lines,marks,labels:trading.executionLabels,alignment:trading.alignment,extendLines:trading.extendLines},frame);};}
  /** Snapshot footer facts; the date is the caller's own (today, UTC). */
  function snapshotFooter(){return{symbol:dataset.instrument.symbol,interval:dataset.resolution,dateText:new Date().toISOString().slice(0,10)};}
  /** Snapshot series line, top-left like the on-screen legend: "GME · 1D · SOURCE  O.. H.. L.. C.. change". statusLine already follows the crosshair bar, else the last bar. */
  function snapshotTitle(){const lead:string[]=[],values:string[]=[];for(const part of hoverReadout().statusLine.parts){if(part.state!=='shown')continue;if(part.id==='title'||part.id==='interval'||part.id==='exchange')lead.push(part.text);else if(part.id==='chartValues')values.push(part.values.map(row=>row.label+row.text).join(' '));else if(part.id==='barChange')values.push(part.absolute+' ('+part.percent+')');}
   const text=[lead.join(' · '),...values].filter(Boolean).join('  ');return text?{text}:undefined;}
  /** Read only the active chart's committed overlays. Never fetch during export, and reject stale native/DOM identity. */
  function chartSnapshotOverlay(){
   if(!chart||!snapshotOwnerCurrent())throw Error('The active chart changed. Try the snapshot again after it finishes.');
   const watermark=watermarkView(shownSettings.canvas.watermark,{symbol:dataset.instrument.symbol,interval:dataset.resolution,description:dataset.instrument.name,replay:!!replay}),paper=paperSnapshotOverlay();
   const legendExpected=legendVisible&&(indicatorViews.length>0||workspace.scriptBindings.length>0),cellId=workspace.grid?.layout.activeCellId;
   const eventsVisible=loaded&&(!cellId||!barMarksVisibility.hiddenFor(cellId))&&!!chartEventSymbol(dataset.provenance.providerId,dataset.instrument.symbol)&&(shownSettings.events.dividends||shownSettings.events.splits);
   const rows=loaded&&workspace.chartSettings.alerts.lines.visible?alertLineRows({alerts,cell:{instrumentId:dataset.instrument.id,datasetKey:[alertDatasetKey(dataset,1),alertDatasetKey(dataset,2)]},settings:{lines:workspace.chartSettings.alerts.lines,activeOnly:workspace.chartSettings.alerts.activeOnly,labelsVisible:workspace.chartSettings.alerts.labelsVisible},format:value=>value.toFixed(priceDigits)}):[];
   // With no DOM layer requested the existing native export needs no scene or projection. Required layers never fall back.
   const title=snapshotTitle();
   if(!watermark&&!paper&&!legendExpected&&!eventsVisible&&!rows.length)return title?(ctx:CanvasRenderingContext2D,frame:ChartExportFrame)=>{paintChartSnapshotScene(ctx,{watermark:null,watermarkFont:lvDarkChartExtras.canvasFontFamily,alerts:{rows:[],tickSize:dataset.instrument.tickSize,scaleSide:readSeriesSide(),obstacles:[],tags:new Map()},title},frame);}:undefined;
   const binding={owner:gridHost,chart,sourceKey:snapshotSourceKey(source,workspace.chartStyle),seriesKey:snapshotSeriesKey(chart),isOwnerCurrent:snapshotOwnerCurrent};assertSnapshotCurrent(binding);
   const legend=legendExpected?requireSnapshotScene(binding,'legend'):undefined,events=eventsVisible?requireSnapshotScene(binding,'events'):undefined;
   if(rows.length)requireSnapshotScene(binding,'alerts');
   const assertSnapshot=captureSnapshotGuard(binding,[...(legend?['legend' as const]:[]),...(events?['events' as const]:[]),...(rows.length?['alerts' as const]:[])]);
   const scene={watermark,watermarkFont:lvDarkChartExtras.canvasFontFamily,paper,alerts:{rows,color:getComputedStyle(document.documentElement).getPropertyValue('--lv-alert-line').trim()||'#f0a030',tickSize:dataset.instrument.tickSize,scaleSide:readSeriesSide(),obstacles:axisTagBoard.labelObstacles?.('alerts')??[],tags:new Map(axisTagBoard.placements('alerts'))},legend,events,title};
   return(ctx:CanvasRenderingContext2D,frame:ChartExportFrame)=>{assertSnapshot();paintChartSnapshotScene(ctx,scene,frame);};
  }
 async function exportImage(){if(!window.lv||!chart){setMessage('Image export needs a chart and the desktop app.');return;}/* Live chart screenshots are allowed for personal use, like live data exports. */try{const rendered=chart.exportChartImage({overlay:chartSnapshotOverlay(),footer:snapshotFooter()});if(!rendered.ok)throw new Error(rendered.diagnostic.message);const result=await window.lv.exportChart({pngDataUrl:rendered.dataUrl,suggestedName:snapshotFileName(workspace.symbol)});if(!result.ok&&(result.error.code==='CANCELLED'||result.error.code==='BUSY'))return;setMessage(result.ok?'Image saved':result.error.message);}catch(e){reportFailure(e);}}
 function installStoredWorkspace(next:Workspace,nextPaper:PaperAccount,nextAlerts:LocalAlert[],savedRevision:number,status:string,nextPaperBook:PaperBook|null,nextCompound:CompoundBookChange){
  // A loading layout (main or layout window) shows the globally synced drawings of its symbols.
  if(next.grid){const applied=applyGlobalDrawings(next.globalDrawings??{},next.grid);if(applied.grid!==next.grid||applied.store!==next.globalDrawings)next={...next,grid:applied.grid,globalDrawings:applied.store};}
  // Persistence has already committed. Retire callbacks before native teardown.
  // A draft still pending in the old editor belongs to the replaced workspace. Its timer stops here, so the old
  // library can never be published into this one before the editor remounts (the review dialogs saved it earlier).
  scriptDraft.current?.settle();nextCompound.assertCurrent();if(!nextCompound.commit())throw Error('Alerts changed during recovery. Try again.');
  // Book adoption queues its notification. Assign all Root model refs before
  // React or a delivery subscriber can observe the replacement.
  startupGeneration.current++;startup.current={phase:'ready',error:''};gridGeneration.current++;revision.current=savedRevision;current.current=next;currentReplay.current=null;currentReplayPaper.current=null;financial.current={paper:nextPaper,paperBook:nextPaperBook,alerts:nextAlerts};paperFeedForming.current=null;committedInput.current=null;coordinator.current=null;activeController.current=null;
  setStartupView(startup.current);lastPersisted.current=null;lastSaveFailure.current=null;history.current.clear();forgetLayoutHistories(history);forgetWarmLayouts(warmFeeds.current);strategyBindings.current.clear();setWorkspace(next);setPaperState({paper:nextPaper,book:nextPaperBook});setAlerts(nextAlerts);setReplay(null);setReplaySession(null);setReplaySaved(null);setReplayRefusal(null);setReplayPaper(null);setStrategyExecution(null);setChart(null);hoverInspection.setInspection(null);setDrawings([]);setIndicatorViews([]);setSelectedDrawing(null);setActiveTool(null);setActiveMode(null);setPreview(null);setScriptEpoch(value=>value+1);setInputEpoch(value=>value+1);setGridEpoch(gridGeneration.current);takeSymbol(next.symbol);setLoaded(true);setMessage(status);
 }
 function beginStorageMutation(background=false){
  assertStartupStorageAvailable(startup.current);
  if(saving.current||workspaceTransaction.current||storageMutation.current)throw new Error('A save or chart change is finishing. Try again in a moment.');
  storageMutation.current=true;workspaceTransaction.current=true;saving.current=true;saveAgain.current=false;backgroundSave.current=background;queuedEditGrid.current=null;heldDrawingQueued.current.clear();setStorageBusy(true);if(!background)setWorkspaceBusy(true);
 }
 function finishStorageMutation(){saveAgain.current=false;backgroundSave.current=false;saving.current=false;workspaceTransaction.current=false;storageMutation.current=false;setStorageBusy(false);setWorkspaceBusy(false);const waiting=storageWriteWaiters.current.splice(0);if(waiting.length)queueMicrotask(()=>{for(const run of waiting)run();});}
 // The routine background autosave holds the storage lock only for its write. Indicator input stays
 // editable meanwhile; an indicator publication registers here and runs once the write ends (each waiter re-checks every
 // guard and reports its own refusal). Explicit Save, layout, history, template and restore operations still block.
 const backgroundWriteActive=()=>storageMutation.current&&backgroundSave.current;
 function afterStorageWrite(run:()=>void){const entry=()=>{try{run();}catch(error){reportFailure(error);}};if(!storageMutation.current&&!workspaceTransaction.current){queueMicrotask(entry);return()=>{};}storageWriteWaiters.current.push(entry);return()=>{const index=storageWriteWaiters.current.indexOf(entry);if(index>=0)storageWriteWaiters.current.splice(index,1);};}
 const analysisStorageWrite={state:():'idle'|'background'|'blocking'=>!storageMutation.current&&!workspaceTransaction.current?'idle':backgroundWriteActive()?'background':'blocking',afterWrite:afterStorageWrite,runDetached:runDetachedIndicatorChange};
 /** An Indicators-dialog change queued during the routine write whose dialog closed before the write ended. Same
  checks as the legend route (rendered owner, active chart, saved capture); applied once, or the reason is shown. */
 function runDetachedIndicatorChange(action:IndicatorDetachedAction){try{
  assertRenderedAnalysisOwner();assertActiveAnalysisChart();assertRenderedAnalysisOwner();
  if(action.kind==='library'){if(current.current.indicatorLibrary!==action.expected)throw Error('The indicator library changed. Review it again.');if(!commit({indicatorLibrary:action.next}))throw Error('The library change was not saved.');}
  else{if(action.library&&current.current.indicatorLibrary!==action.library)throw Error('Saved defaults changed. Review them again.');action.run();assertRenderedAnalysisOwner();if(!confirmAnalysisCapture('indicator',false,assertRenderedAnalysisOwner))throw Error('Reopen the chart before editing the indicator.');}
  setMessage('The indicator change queued during the save was applied.');
 }catch(error){setMessage('The indicator change queued during the save was not applied. '+(error instanceof Error?error.message:String(error)));}}
 const INDICATOR_WRITE_WAIT='The workspace is saving. The indicator change applies when the save finishes.';
 // Manage drawings uses the same deferral with its own wording.
 const DRAWING_MANAGER_WRITE_WAIT='The workspace is saving. The Drawing manager opens when the save finishes.';
 /** A chart-side indicator action (legend or Object tree) met the background write: retry it once the write ends. `wait` is the message shown meanwhile. */
 function indicatorChartAction(run:()=>void,wait=INDICATOR_WRITE_WAIT){if(!backgroundWriteActive()){run();return;}afterStorageWrite(()=>{setMessage(value=>value===wait?'':value);run();});setMessage(wait);}
 /** drawing-edit-queue.ts: a drawing edit made while the routine background autosave holds the chart waits in
  the held-input queue and runs when the write ends, in press order with the held keys and indicator changes (each held entry
  has its own storage-write waiter, held-key-gate.ts), one undo step
  each as before. The hold made the chart refuse the edit (Object tree, settings Apply, Clone, Copy, Paste) or keep it
  unpublished (drawing-manager calls from the toolbars, the chart menu and the Delete key), so it was lost. Before it runs it
  re-checks the chart it acts on (owner; null for an edit with no chart, such as a drawing utility toggle) and that its
  drawings and groups still exist, and says so plainly when not. A run that returns a string reports it. quiet: no notice
  (a selection). true: queued; false: no background write and nothing queued, so the caller runs it now. */
 function queueDrawingEdit(run:()=>unknown,targets:DrawingEditTargets&{quiet?:boolean}={},owner:ChartController|null=activeController.current):boolean{
  const gate=heldKeys.current;if(!gate)return false;
  const generation=gridGeneration.current,wasActive=!!owner&&activeController.current===owner,quiet=targets.quiet===true;
  const queued=gate.defer({run:()=>{
   setMessage(value=>value===DRAWING_EDIT_WRITE_WAIT?'':value);
   if(owner&&(gridGeneration.current!==generation||wasActive&&activeController.current!==owner)){if(!quiet)setMessage(DRAWING_EDIT_STALE);return;}
   const missing=owner?missingDrawingTargets(owner.drawingManager,targets):null;if(missing){if(!quiet)setMessage(missing);return;}
   try{const result=run();if(typeof result==='string')setMessage(result);}catch(error){reportFailure(error);}finally{queuedEditGrid.current=current.current.grid??null;}
  }});
  if(queued&&!quiet)setMessage(DRAWING_EDIT_WRITE_WAIT);
  return queued;
 }
 /** src/chart/held-drawing-publication.ts: a chart of the grid held back a drawing publication while the save
  holds it: a native gesture (dragging a drawing or one of its anchors, inline text editing on the chart) cannot be queued
  before it happens, so the chart already shows it, and the hold used to drop its publication (no undo step, not saved, gone
  after relaunch). One publication per chart waits in the held-input queue (in press order with the held keys and queued
  edits) and runs when the write ends: the chart's drawings are published through the ordinary path, one workspace change and
  undo step, and the next autosave writes them. Any chart of the grid counts, not only the active one; a chart replaced
  meanwhile (grid generation) is reported, a disposed one has nothing to publish. Not queued (an explicit, blocking save):
  it runs right after that write instead. */
 function heldDrawingChange(owner:ChartController){
  const queued=heldDrawingQueued.current;if(queued.has(owner))return;queued.add(owner);
  const generation=gridGeneration.current;
  const run=()=>{queued.delete(owner);if(gridGeneration.current!==generation)return DRAWING_EDIT_STALE;owner.publishHeldDrawings();};
  if(queueDrawingEdit(run,{},null))return;
  afterStorageWrite(()=>{const result=run();if(typeof result==='string')setMessage(result);});
 }
 // The alert panel reads the lock itself, so a tick in the gap before the backgroundSave render defers too.
 const isAlertStoreLocked=()=>storageMutation.current||workspaceTransaction.current;
 const resetSnapshot={startup:startupView,revision:revision.current,workspace:current.current,paper:financial.current.paper,alerts:financial.current.alerts,compoundVersion:compoundBook.reviewVersion};
 async function resetWorkspace(){
  if(!window.lv)throw new Error('Reset needs the desktop app.');assertStartupStorageAvailable(startup.current);
  if(startup.current!==resetSnapshot.startup||revision.current!==resetSnapshot.revision||current.current!==resetSnapshot.workspace||financial.current.paper!==resetSnapshot.paper||financial.current.alerts!==resetSnapshot.alerts||compoundBook.reviewVersion!==resetSnapshot.compoundVersion)throw new Error('The workspace changed after reset was reviewed. Cancel and confirm the current workspace again.');
  const fresh=createInitialWorkspace(),freshPaper=createPaperAccount();beginStorageMutation();let nextCompound:CompoundBookChange|null=null;
  try{nextCompound=prepareCompoundWorkspaceAdoption(compoundBook,undefined,Math.floor(Date.now()/1000));nextCompound.assertCurrent();const result=await window.lv.resetWorkspace(resetSnapshot.revision);if(!result.ok)throw new Error(result.error.message);installStoredWorkspace(fresh,freshPaper,[],result.value.revision,'Local workspace reset. Exported files are unchanged.',null,nextCompound);refreshLayoutWindows();}finally{nextCompound?.rollback();finishStorageMutation();}
 }
 /** After a reset or restore of the workspace file, every layout window reloads it (one whose layout is gone closes). */
 function refreshLayoutWindows(){if(secondaryWindow)return;const lv=window.lv;if(typeof lv?.refreshLayoutWindows!=='function')return;void lv.refreshLayoutWindows().then(result=>{if(!result.ok)setMessage(result.error.message);}).catch(()=>{});}
 function previewWorkspaceRestore(text:string):WorkspaceRestorePreview{
  assertStartupStorageAvailable(startup.current);
  if(saving.current||workspaceTransaction.current)throw new Error('A save or chart change is finishing. Preview again afterward.');
  const candidate=prepareWorkspaceReplacement(text),expected=current.current,expectedPaper=financial.current.paper,expectedAlerts=financial.current.alerts,expectedReplay=currentReplay.current,expectedRevision=revision.current,expectedStartup=startup.current,expectedCompoundVersion=compoundBook.reviewVersion;
  let committed=false;
  const assertCurrent=()=>{if(committed)throw new Error('This replacement was already committed.');if(startup.current!==expectedStartup||current.current!==expected||financial.current.paper!==expectedPaper||financial.current.alerts!==expectedAlerts||currentReplay.current!==expectedReplay||revision.current!==expectedRevision||compoundBook.reviewVersion!==expectedCompoundVersion)throw new Error('The current workspace or virtual account changed after preview. Preview the export again.');};
  return {summary:candidate.summary,assertCurrent,apply:async()=>{
   assertCurrent();if(!window.lv)throw new Error('Workspace replacement needs the desktop app.');beginStorageMutation();let nextCompound:CompoundBookChange|null=null;
   try{nextCompound=prepareCompoundWorkspaceAdoption(compoundBook,candidate.compoundAlerts,Math.floor(Date.now()/1000));assertCurrent();nextCompound.assertCurrent();const result=await window.lv.saveWorkspace({schemaVersion:1,expectedRevision,data:candidate.data});if(!result.ok)throw new Error(result.error.message);assertCurrent();committed=true;installStoredWorkspace(candidate.workspace,candidate.paper,candidate.alerts,result.value.revision,'Local workspace replaced from the reviewed export. Replay and chart Undo history were cleared.',candidate.paperBook,nextCompound);refreshLayoutWindows();}finally{nextCompound?.rollback();finishStorageMutation();}
  }};
 }
 async function chooseWorkspaceExport(){if(!window.lv)throw new Error('Choosing a file needs the desktop app.');const result=await window.lv.importData({kind:'workspace'});if(!result.ok){if(result.error.code==='CANCELLED')return null;throw new Error(result.error.message);}return{text:result.value.text};}
 function armTool(id:string){try{if(id===LV_IMAGE){if(chart&&!workspaceTransaction.current&&!storageMutation.current&&activeController.current===chart){disarmTool();const injected=harnessImageFile();if(injected)void addImageFile(injected);else imageInput.current?.click();}return;}/* A tool click during the routine background autosave write was dropped silently (the next typed keys opened Symbol search); it now arms once the write ends, every guard re-checked (afterStorageWrite). */if(chart&&backgroundWriteActive()&&activeController.current===chart){afterStorageWrite(()=>armTool(id));return;}if(!chart||workspaceTransaction.current||storageMutation.current||activeController.current!==chart)return;if(replaySessionRef.current?.phase==='active'){const leaf=DRAWING_TOOL_CATALOG.flatMap(group=>group.sections.flatMap(section=>section.leaves)).find(row=>row.target.kind==='tool'&&row.target.type===id),applicable=replayDrawingApplicability(leaf?.tvToolId??id);if(!applicable.active){setMessage(applicable.reason);return;}}chart.setTool(id as any);cursorKinds.current.armTool();setActiveTool(id);}catch(e){reportFailure(e);}}
 function placeAtCrosshair(type:'hline'|'hray'|'vline'|'crossline'){try{if(!chart||workspaceTransaction.current||storageMutation.current||activeController.current!==chart)return;const result=chart.placeAtCrosshair(type);if(!result.ok)setMessage(result.message);}catch(e){reportFailure(e);}}
 imageCancel.current=()=>disarmTool();
 // Exe harness only. Main answers null in every other run, so the Image tool keeps opening the file chooser.
 useEffect(()=>{void loadHarnessImage(window.lv);},[]);
 function disarmTool(){try{if(!chart||workspaceTransaction.current||storageMutation.current||activeController.current!==chart)return;chart.setDrawingMode(null);chart.setTool(null);cursorKinds.current.escape();setActiveTool(null);setActiveMode(null);}catch(e){reportFailure(e);}}
 function changeCursorKind(kind:CursorKind){try{if(!chart||workspaceTransaction.current||storageMutation.current||activeController.current!==chart)return;const result=cursorKinds.current.choose(kind);setActiveCursor(cursorKinds.current.kind());if(!result.ok)setMessage(result.reason);}catch(e){reportFailure(e);}}
 /** Every committed workspace goes through here: the asset controller learns of a different drawingAssets map synchronously (generation bump) instead of from a passive effect, so an edit resuming right after the commit sees the new map and is refused. */
 /** Records a chart's global drawing edits in workspace.globalDrawings (drawing-global-sync.ts). */
 function withGlobalDrawingEdits(before:Workspace,next:Workspace):Workspace{if(!next.grid||next.grid===before.grid)return next;const store=next.globalDrawings??{},recorded=recordGlobalDrawingEdits(store,before.grid,next.grid);return recorded===store?next:{...next,globalDrawings:recorded};}
 function setWorkspace(next:Workspace){imageSync.current?.sync(next.drawingAssets);setWorkspaceState(next);}
 const latestCommit=useRef(commit);latestCommit.current=commit;
 if(!imageSync.current)imageSync.current=createDrawingAssetsController(imageAssets.current,document=>latestCommit.current({drawingAssets:document}),message=>setMessage(message));
 /** Save-time trimming: walks the drawing values only (workspace drawings, grid cell drawings, the active chart), skips while a map load is pending, and never commits over a newer map. */
 function trimImageAssets(){const cells=Object.values((current.current as {grid?:{cells?:Record<string,{drawings?:unknown}>}}).grid?.cells??{});const active=chart;imageSync.current!.trim(()=>[current.current.drawings,...cells.map(cell=>cell.drawings),active?active.saveDrawings():null]);}
 function releaseImageHolds(){for(const id of imageHolds.current)imageAssets.current.unhold(id);imageHolds.current.clear();trimImageAssets();}
 function imageGuard(){return !!chart&&!workspaceTransaction.current&&!storageMutation.current&&activeController.current===chart;}
 /** Paste and file pick: the import runs on the asset controller's queue, after any pending workspace map load, and its
  *  commit is refused when a newer map arrived meanwhile, so it can never write the old store's map over an incoming workspace. */
 async function addImageFile(file:Blob){let held='';try{
  if(!imageGuard()||!chart)return;
  const bytes=new Uint8Array(await file.arrayBuffer());
  const outcome=await imageSync.current!.edit(async session=>{
   if(!imageGuard()||!chart)return{ok:true as const};
   const spot=chart.imagePlacement();if(!spot.ok)return spot;
   trimImageAssets();
   const result=await createImageDrawingRecord(bytes,file.type,spot.placement);
   if(!result.ok)return result;
   held=result.asset.id;imageAssets.current.hold(held);
   if(!imageGuard()){imageAssets.current.release(held);return{ok:true as const};}
   if(!session.current()){imageAssets.current.release(held);return{ok:false as const,message:DRAWING_ASSETS_MESSAGES.changed};}
   const placed=chart.placeImage({paneId:result.record.paneId,anchors:result.record.anchors,props:result.record.props});
   if(!placed.ok){imageAssets.current.release(held);return placed;}
   // A refused commit removes the drawing it just placed, so no "Image unavailable" placeholder is left behind (0.8.1).
   if(!session.commit()){imageAssets.current.release(held);try{(chart as unknown as {drawings?:{remove?:(id:string)=>unknown}}).drawings?.remove?.(placed.id);}catch{/* the drawing is already gone */}return{ok:false as const,message:DRAWING_ASSETS_MESSAGES.changed};}
   return{ok:true as const};
  });
  if(!outcome.ok)setMessage(outcome.message);
 }catch(e){reportFailure(e);}finally{if(held){imageAssets.current.unhold(held);trimImageAssets();}}}
 /** Dialog replacement: same guards and the same controller queue as an add; the asset is held until the dialog closes, then kept only if the edited drawing refers to it. */
 async function pickReplacementImage(file:File):Promise<{ok:true;id:string;width:number;height:number}|{ok:false;message:string}>{
  const waiting={ok:false as const,message:'Wait for the chart to finish loading, then try again.'};
  if(!imageGuard())return waiting;
  const bytes=new Uint8Array(await file.arrayBuffer());
  return imageSync.current!.edit(async session=>{
   if(!imageGuard())return waiting;
   trimImageAssets();
   const imported=await imageAssets.current.import(bytes,file.type);
   if(!imported.ok)return imported;
   if(!imageGuard())return waiting;
   if(!session.current())return{ok:false as const,message:DRAWING_ASSETS_MESSAGES.changed};
   const id=imported.asset.id;
   imageAssets.current.hold(id);imageHolds.current.add(id);
   if(!session.commit()){imageAssets.current.unhold(id);imageHolds.current.delete(id);return{ok:false as const,message:DRAWING_ASSETS_MESSAGES.changed};}
   return{ok:true as const,id,width:imported.asset.width,height:imported.asset.height};
  });
 }
 useEffect(()=>{connectDrawingAssets(imageAssets.current);return()=>connectDrawingAssets(null);},[]);
 /** Workspace restore: a different map starts a verified, serialized load; a mismatch refuses the whole map. */
 useEffect(()=>{imageSync.current?.sync(workspace.drawingAssets);},[workspace.drawingAssets]);
 useEffect(()=>{if(loaded)trimImageAssets();},[workspace,loaded]);
 useEffect(()=>{const paste=(event:ClipboardEvent)=>{if((event.target as HTMLElement|null)?.closest?.('input,textarea,select,[contenteditable="true"]'))return;const file=[...(event.clipboardData?.files??[])].find(item=>item.type.startsWith('image/'));if(!file)return;event.preventDefault();void addImageFile(file);};window.addEventListener('paste',paste);return()=>window.removeEventListener('paste',paste);});
 function changeDrawingMode(mode:DrawingMode|null){try{if(!chart||workspaceTransaction.current||storageMutation.current||activeController.current!==chart)return;chart.setDrawingMode(mode);}catch(e){reportFailure(e);}}
 function editReplay(value:ReplayState|null|((previous:ReplayState|null)=>ReplayState|null)){if(!loaded||workspaceTransaction.current||storageMutation.current||current.current!==workspace||currentReplay.current!==replay)return;const next=typeof value==='function'?value(replay):value;currentReplay.current=next;setReplay(next);}
 // Bar Replay session handlers. Every transition projects the next session onto the active chart (replayChartView, forming bar included) and keeps the per-chart ReplayState in step through editReplay's owner/run guards. A step that would leave the active chart without a completed bar is refused visibly.
 function replayEditable(){return loaded&&!workspaceTransaction.current&&!storageMutation.current&&current.current===workspace&&currentReplay.current===replay;}
 function replayFail(error:unknown){reportFailure(error);}
 /** The session view replay reads for a dataset: its frozen copy when a replay holds one, else itself. */
 function pinnedReplayView(data:BarDataset,held:ReplayLiveSnapshots|null):BarDataset{const raw=rawCellSessionDataset(data),frozen=held?.[raw.provenance.datasetId];return frozen&&frozen.instrument.id===raw.instrument.id&&frozen.resolution===raw.resolution?cellSessionDataset(sessionDataset(frozen,workspaceSessionMode),{session:cellSessionOverride(data)}):data;}
 /** A session that already jumped to real time on a live chart starts its next replay as a new session, on a fresh freeze
  * (the earlier copy was released); scope, interval choice and speed carry over. Other sessions are reused as before. */
 function replayNeedsFreshStart(session:ReplaySession):boolean{return session.phase==='realtime'&&session.participants.some(row=>isLiveDatasetId(row.datasetId));}
 function replaySessionForStart():ReplaySession|null{const session=replaySession;return session&&!replayNeedsFreshStart(session)?session:newReplaySession();}
 function applyReplaySession(next:ReplaySession|null):boolean{
  if(!replayEditable()){setMessage('Wait for the workspace operation to finish before changing Bar Replay.');return false;}
  let view:ReturnType<typeof replayChartView>|null=null;
  const held=heldReplaySnapshots(),chartNow=pinnedReplayView(dataset,held);
  if(next&&next.clock!==null){view=replayChartView(next,chartNow,next.interval===replaySession?.interval&&chartNow===dataset?replayStepSource:replayStepSourceOf(next.interval,chartNow,cellReplaySources(chartNow,{session:cellSessionOverride(chartNow)},pinReplayDatasets(workspaceDatasets(workspace),held))));if(!view.state){setMessage(view.notice??'This chart has no completed bar at the replay point yet.');return false;}}
  setReplaySession(next);editReplay(view?.state??null);return true;
 }
 /** The checks of opening Bar Replay, returning the new start-selection session (null after a visible refusal). */
 function newReplaySession():ReplaySession|null{
  if(!replayEditable()){setMessage('Wait for the workspace operation to finish before opening Bar Replay.');return null;}
  // Bar Replay pins a fixed source revision. A live chart replays a frozen copy of its
  // loaded closed bars (that copy is the pinned revision); the live feed keeps running underneath. Only a live chart with no
  // closed bar yet is refused.
  try{const ws=current.current,raw=workspaceDatasets(ws),frozen=freezeLiveDatasets(raw,replaySnapshotsRef.current),activeId=rawSessionDataset(dataset).provenance.datasetId;
   if(isLiveDatasetId(activeId)&&!frozen[activeId]){setReplayRefusal(REPLAY_LIVE_NO_HISTORY);return null;}
   const participants=replayParticipantsOf(ws,pinReplayDatasets(raw,frozen)),activeCellId=ws.grid?.layout.activeCellId??'',active=participants.find(row=>row.cellId===activeCellId);if(!active)throw new Error('The active chart source is unavailable for Bar Replay.');
   const support=replayParticipantSupport(active);if(!support.supported){setReplayRefusal(support.reason);return null;}
   const prior=replaySessionRef.current;
   setReplayRefusal(null);const opened=openReplay({participants:replayLayoutParticipants(participants,activeCellId,id=>isLiveDatasetId(id)&&!frozen[id]),activeCellId,scope:prior?.scope??replayDefaultScope(ws.grid?.layout),stepsPerSecond:prior?.stepsPerSecond??replaySpeedMemory.current,...(prior?{intervalChoice:prior.intervalChoice}:{})});replaySnapshotStage.current=frozen;return opened;}catch(error){replayFail(error);return null;}
 }
 function openReplayPanel(){const next=newReplaySession();if(next)setReplaySession(next);}
 function closeReplayPanel(){
  setReplayRefusal(null);setReplayPointer(null);const session=replaySession;
  // With no session (the closed-with-saved panel, a refusal, or an Undo-restored replay prefix) close hides the panel; a restored prefix ends too.
  if(!session){if(replay){if(!replayEditable()){setMessage('Wait for the workspace operation to finish before closing Bar Replay.');return;}editReplay(null);}setReplayPanelHidden(true);setReplaySaved(null);return;}
  if(!replayEditable()){setMessage('Wait for the workspace operation to finish before closing Bar Replay.');return;}
  // A replay closed with X stays closed, so nothing is remembered for Continue or a layout switch.
  closeReplay(session,Date.now());if(applyReplaySession(null)){setReplayPanelHidden(true);setReplaySaved(null);}
 }
 /** The session follows the per-chart replay guard. App replays the active chart only (scope 'current', multiChart=false), so when the guard is replaced (focus moves to another chart, a staged layout, history or template commit) by an ordinary input or by a different run, the session ends as on the other replay-ending paths (the remembered replaySaved stays). Returns true when it ended a session. */
 function followReplayGuard(nextReplay:ReplayState|null,activeCellId:string|undefined):boolean{const session=replaySessionRef.current;if(!session)return false;if(nextReplay?nextReplay.runId===session.runId:session.clock===null&&session.activeCellId===activeCellId)return false;setReplaySession(null);setReplayPointer(null);return true;}
 /** While a replay session exists, a derived chart type is refused with a plain message, as opening Bar Replay on one is (replayParticipantSupport); it is never emulated. */
 function replayStyleRefusal(style:string|undefined,before:string|undefined):string|null{if(!replaySessionRef.current||!style||style===before)return null;const name=REPLAY_UNSUPPORTED_CHART_TYPES[style];return name?name+' charts are not available in Bar Replay. Close Bar Replay before choosing this chart type.':null;}
 function changeChartStyle(style:string){const refusal=replayStyleRefusal(style,current.current.chartStyle);if(refusal){setMessage(refusal);return;}commit({chartStyle:style});}
 /** An R interval sets the Range size and selects the Range chart type. */
 function applyRangeInterval(size:number,intervals?:IntervalMenuState):{ok:boolean;message?:string}{try{const refusal=replayStyleRefusal('range',current.current.chartStyle);if(refusal){setMessage(refusal);return{ok:false,message:refusal};}/* A size these bars cannot build (typed 100R on 12M BTC) is refused here, as the menu row is, and never reaches the chart. */const tooSmall=rangeSizeRefusal(dataset.bars,size,dataset.instrument.tickSize);if(tooSmall){setMessage(tooSmall);return{ok:false,message:tooSmall};}/* A range pick during the background autosave was dropped silently (commit refused, ok returned). It now waits for the write like a time interval. */if(deferSwitch(dataset.instrument.symbol+' '+size+'R',()=>switchers.current.applyRangeInterval(size,intervals)))return{ok:true};/* The range-bar commit renders as a transition, so the click, the render and the chart build (passive effects) run as separate tasks instead of one 50-120 ms task; the result is the same. */let accepted=false;startTransition(()=>{accepted=commit({chartStyle:'range',chartTypeSettings:withRangeSize(current.current.chartTypeSettings,size),...(intervals?{intervals}:{})});});if(!accepted)return{ok:false,message:'The range interval was rejected. Review the workspace message.'};return{ok:true};}catch(error){const message=error instanceof Error?error.message:String(error);setMessage(message);return{ok:false,message};}}
 /** A copy staged for a transition that is then refused or throws is dropped here; a transition that applies has already consumed it. */
 function replayTransition(build:(session:ReplaySession)=>ReplaySession){const session=replaySession;if(!session)return;try{applyReplaySession(build(session));}catch(error){replayFail(error);}finally{replaySnapshotStage.current=null;}}
 function replayTogglePlay(){replayTransition(session=>setReplaySessionPlaying(session,!session.playing,replayTimelineNow));}
 function replayStep(){replayTransition(session=>stepReplaySession(session,replayTimelineNow));}
 /** Step back: a backseek under a new run, paused. */
 function replayStepBack(){replayTransition(session=>stepBackReplaySession(session,replayTimelineNow));}
 /** The start-point menu: Select date, First available date or Random bar; with no session (closed with a remembered one) it opens a new replay there. */
 function replayStartFrom(point:ReplayStartPoint){const session=replaySessionForStart();if(!session)return;try{const choice=chooseReplayInterval(replayMenu,session.intervalChoice);if(!choice.ok)throw new Error(choice.message);if(applyReplaySession(startReplayAt(session,pinnedReplayView(dataset,heldReplaySnapshots()),point,choice.id)))setReplayPointer(null);}catch(error){replayFail(error);}finally{replaySnapshotStage.current=null;}}
 function replayInterval(choice:string){replayTransition(session=>{const resolved=chooseReplayInterval(replayMenu,choice);if(!resolved.ok)throw new Error(resolved.message);return setReplaySessionInterval(session,choice,resolved.id);});}
 function selectReplayStartAt(time:number|null){const session=replaySession;if(!session||session.phase!=='selecting-start')return;try{if(time===null)throw new Error('Choose a bar on the chart.');const choice=chooseReplayInterval(replayMenu,session.intervalChoice);if(!choice.ok)throw new Error(choice.message);if(applyReplaySession(selectReplayStart(session,pinnedReplayView(dataset,heldReplaySnapshots()),time,choice.id)))setReplayPointer(null);}catch(error){replayFail(error);}}
 /** Continue session. The saved charts must already be open (symbol, interval and exact source per cell); the restore is then built on the loaded universe. A legacy import revision is adopted only when the continue is applied; its notice shows once and the adopted record replaces the remembered one. */
 function continueSavedReplay(){
  const saved=replaySaved;if(!saved)return;
  try{if(!replayEditable())throw new Error('Wait for the workspace operation to finish before continuing Bar Replay.');
   // Live charts continue on a fresh frozen copy that still holds the remembered history.
   const ws=current.current,raw=workspaceDatasets(ws),frozen=freezeLiveDatasets(raw,replaySnapshotsRef.current),datasets=pinReplayDatasets(raw,frozen),grid=ws.grid,missing=replayRestoreLayout(saved).filter(row=>{const cell=grid?.cells[row.cellId],meta=grid?.layout.cells.find(item=>item.id===row.cellId);return!cell||!meta||cell.datasetId!==row.datasetId||meta.symbol!==row.symbol||meta.interval!==row.interval;});
   if(missing.length)throw new Error('Open the saved replay charts first: '+missing.map(row=>row.symbol+' '+row.interval).join(', ')+'.');
   const participants=replayParticipantsOf(ws,datasets),chartTypes=Object.fromEntries(participants.map(row=>[row.cellId,row.chartType])),choice=chooseReplayInterval(replayIntervalMenu(participants.filter(row=>saved.participants.some(item=>item.cellId===row.cellId)),datasets),saved.intervalChoice);if(!choice.ok)throw new Error(choice.message);
   const out:{notice:string|null;adopted:ReplaySavedSession|null}={notice:null,adopted:null};
   const next=continueReplaySession(adoptLiveSnapshotRevisions(saved,frozen),datasets,chartTypes,choice.id,{onNotice:message=>{out.notice=message;},onAdopt:value=>{out.adopted=value;}});
   replaySnapshotStage.current=frozen;if(!applyReplaySession(next)){replaySnapshotStage.current=null;return;}setReplayRefusal(null);
   // A replay paused by a tab switch gets its replay paper account back, bound to the restored run.
   const carried=carriedReplayPaper(saved,next.runId);if(carried){currentReplayPaper.current=carried;setReplayPaper(carried);}if(out.adopted)setReplaySaved(out.adopted);if(out.notice)setMessage(out.notice);
  }catch(error){replayFail(error);}finally{replaySnapshotStage.current=null;}
 }
 replayKeys.current=action=>action==='toggle-play'?replayTogglePlay():action==='step-back'?replayStepBack():replayStep();
 replayTick.current=elapsed=>{const session=replaySessionRef.current,state=currentReplay.current;if(!session?.playing)return;
  if(!state||state.runId!==session.runId||!state.playing){setReplaySession(setReplaySessionPlaying(session,false,replayTimelineNow));return;}
  const next=advanceReplaySession(session,elapsed,replayTimelineNow);if(next.clock===session.clock){setReplaySession(next);return;}
  const view=replayChartView(next,dataset,replayStepSource);if(!view.state){setReplaySession(setReplaySessionPlaying(session,false,replayTimelineNow));setMessage(view.notice??'');return;}
  setReplaySession(next);currentReplay.current=view.state;setReplay(view.state);};
 /** ids: the drawings the edit acts on; with them it waits for the routine background autosave (queueDrawingEdit). */
 function drawingAction(fn:()=>void,ids?:readonly string[]){if(ids&&queueDrawingEdit(()=>applyDrawingEdit(fn),{drawings:ids}))return;applyDrawingEdit(fn);}
 function applyDrawingEdit(fn:()=>void){try{fn();captureDrawings();}catch(e){reportFailure(e);}}
 /** Delete or Backspace on the chart while the routine background autosave holds it. The native delete would
  apply unpublished (the save drops the held drawing publication), so the selection's removal waits for the write instead.
  false: not a chart Delete of a selection; the key goes on as before. */
 function deleteKeyDuringSave(target:HTMLElement|null):boolean{
  const owner=activeController.current;if(!owner||owner!==chart||activeMode==='eraser')return false;
  const onChart=!target||target.tagName==='BODY'||!!target.closest?.('.chart-workspace')&&!target.closest?.('input,textarea,select,[contenteditable="true"],button,a,[role=button],[role=tab],[role=slider],[role=radio],[role=menu]');
  const ids=[...selectedDrawingIds];if(!onChart||!ids.length)return false;
  // With Lock all drawings on, the Delete key removes nothing (the native route already does nothing).
  if(current.current.drawingUtility.drawingsLocked)return false;
  return queueDrawingEdit(()=>applyDrawingEdit(()=>{owner.drawingManager.remove(ids);setSelectedDrawing(null);}),{drawings:ids},owner);
 }
 function openCalendarSymbol(instrumentId:string|null,symbol:string){const choices=universe.filter(row=>(instrumentId===null||row.instrument.id===instrumentId)&&row.instrument.symbol===symbol.toUpperCase());if(choices.length!==1){setMessage(choices.length?'More than one data source matches. Choose one from the chart.':'No price data matches this event. Import the symbol first.');return false;}const chosen=choices[0];if(!switchSymbol(chosen.instrument.symbol,suppliedSourceId(workspace,chosen)))return false;setMessage('Opened '+chosen.instrument.symbol+' using '+(chosen.provenance.fixture?'clearly labeled synthetic demonstration prices':chosen.provenance.providerName)+'. Calendar events and price data have separate provenance.');return true;}
 function acceptPaper(next:PaperAccount,expected?:PaperAccount):boolean{
  try{if(!loaded||workspaceTransaction.current||storageMutation.current)throw new Error('Wait for the workspace change to finish before changing the virtual account.');if(expected&&financial.current.paper!==expected)throw new Error('The virtual account changed before this action completed. Review it again.');if(next.mode!=='paper')throw new Error('Replay funds cannot replace the ordinary virtual account.');const cap=guardPaperStorage({paper:financial.current.paper,book:financial.current.paperBook},next);if(!cap.ok)throw new Error(cap.message);financialGuard.current(current.current,financial.current.alerts,next);financial.current={...financial.current,paper:next};setPaper(next);return true;}catch(error){reportFailure(error);return false;}
 }
 function acceptReplayPaper(next:PaperAccount,expected?:PaperAccount):boolean{
  try{if(!loaded||workspaceTransaction.current||storageMutation.current)throw new Error('Wait for the workspace change to finish before changing replay funds.');if(expected&&currentReplayPaper.current!==expected)throw new Error('The replay account changed before this action completed. Review it again.');if(next.mode!=='replay-paper'||!currentReplay.current||next.runId!==currentReplay.current.runId)throw new Error('The virtual account belongs to a different replay run.');financialGuard.current(current.current,financial.current.alerts,next,true);currentReplayPaper.current=next;setReplayPaper(next);return true;}catch(error){reportFailure(error);return false;}
 }
 function acceptPaperState(next:PaperState,expected:PaperState):boolean{
  try{if(!loaded||workspaceTransaction.current||storageMutation.current)throw new Error('Wait for the workspace change to finish before changing the virtual accounts.');
   if(financial.current.paper!==expected.paper||financial.current.paperBook!==expected.book)throw new Error('The virtual accounts changed before this action completed. Review them again.');
   if(next.paper.mode!=='paper')throw new Error('Replay funds cannot replace the ordinary virtual account.');
   const cap=guardPaperState({paper:financial.current.paper,book:financial.current.paperBook},next);if(!cap.ok)throw new Error(cap.message);
   financialGuard.current(current.current,financial.current.alerts,next.paper);
   if(next.paper.id!==financial.current.paper.id)paperFeedForming.current=null;
   financial.current={...financial.current,paper:next.paper,paperBook:next.book};setPaperState(next);return true;}
  catch(error){reportFailure(error);return false;}
 }
 /** One engine action on the account the chart trades (replay funds during replay). */
 function paperAction(run:(account:PaperAccount,now:number)=>PaperResult):boolean{
  const account=replay?currentReplayPaper.current:financial.current.paper;if(!account)return false;
  const result=run(account,Math.max(account.clock,virtualNow));
  if(!result.ok){setMessage(result.diagnostics.map(row=>row.message).join(' ')||'The account could not do that.');return false;}
  return (replay?acceptReplayPaper:acceptPaper)(result.account,account);
 }
 const acceptAlerts=useCallback((next:LocalAlert[],expected?:LocalAlert[])=>{try{if(!loaded||storageMutation.current||workspaceTransaction.current)throw new Error('Wait for the workspace change before changing alerts.');if(expected&&financial.current.alerts!==expected)throw new Error('The alert collection changed before this action completed. Review it again.');financialGuard.current(current.current,next,financial.current.paper);financial.current={...financial.current,alerts:next};setAlerts(next);return true;}catch(error){reportFailure(error);return false;}},[loaded]);
 const gridHandlers=useRef({studyIntent:acceptCellStudyIntent,heldDrawingChange,captureDrawingWorkspace,drawingHistory,drawingHistoryStatus,transactionReady,hostReady,acceptDrawingPreferences,scriptExecution,acceptGrid,requestLayoutResize,setChartReady,activeCell,setAlerts:acceptAlerts,setPaper:acceptPaper,setReplayPaper:acceptReplayPaper});gridHandlers.current={studyIntent:acceptCellStudyIntent,heldDrawingChange,captureDrawingWorkspace,drawingHistory,drawingHistoryStatus,transactionReady,hostReady,acceptDrawingPreferences,scriptExecution,acceptGrid,requestLayoutResize,setChartReady,activeCell,setAlerts:acceptAlerts,setPaper:acceptPaper,setReplayPaper:acceptReplayPaper};
 const ownedGrid=useMemo(()=>ownedCallbacks(()=>gridHandlers.current,()=>gridGeneration.current===gridEpoch),[gridEpoch]);
 const ownedDrawing=useMemo(()=>({
  onCaptureDrawingWorkspace:(expected:MultiChartState)=>{if(gridGeneration.current!==gridEpoch)throw Error('The chart changed. Try again.');return gridHandlers.current.captureDrawingWorkspace(expected);},
  onDrawingHistory:(direction:'undo'|'redo',expected:MultiChartState)=>{if(gridGeneration.current!==gridEpoch)throw Error('The chart changed. Try again.');gridHandlers.current.drawingHistory(direction,expected);},
  drawingHistoryStatus:()=>{if(gridGeneration.current!==gridEpoch)return{canUndo:false,canRedo:false};return gridHandlers.current.drawingHistoryStatus();}
 }),[gridEpoch]);
 const ownedFinancial=useMemo(()=>ownedCallbacks(()=>gridHandlers.current,()=>gridGeneration.current===gridEpoch&&financialGeneration.current===financialEpoch),[gridEpoch,financialEpoch]);
 // A native publication belongs to the model it opened from. Advance only for
 // this callback's own accepted writes, including focus followed by a gesture.
 const publishOwnedGrid=useMemo(()=>{let expected=workspace.grid;return (grid:MultiChartState,prepared?:GridPreparedInput,frameBaseline?:GridFrameEditBaseline,markCommitted?:()=>void,stale?:()=>void,held?:(whenFree:(run:()=>void)=>void)=>void)=>{
  if(gridGeneration.current!==gridEpoch)return false;
  // The routine background autosave holds the workspace for its write; a grid publication then waits for the write
  // (the tree retries it) instead of being refused with a banner and a dropped click.
  if(held&&backgroundWriteActive()){held(run=>{afterStorageWrite(run);});return false;}
  // Another change replaced the grid before this tree re-rendered; the tree rebases instead of reporting a refusal.
  if(current.current.grid!==expected){stale?.();return false;}
  let accepting=true;try{const accepted=gridHandlers.current.acceptGrid(grid,prepared,frameBaseline,()=>{if(!accepting)throw Error('The chart changed. Try again.');expected=current.current.grid;markCommitted?.();})===true;
   if(accepted)expected=current.current.grid;return accepted;
  }finally{accepting=false;}
 };},[workspace.grid,gridEpoch]);
 const contextHandler=(action:RootChartMenuAction)=>(snapshot:ChartMenuSnapshot,lease:ChartMenuActionLease,options?:ChartContextActionOptions)=>requestChartContext(action,snapshot,lease,options);
 /** Right-click drawing menu: each row acts on the clicked drawing(s) through the same manager calls as the selection bar and the object tree. */
 const drawingContextRun=(run:(controller:ChartController,ids:string[],rows:Record<string,unknown>[])=>void)=>(snapshot:ChartMenuSnapshot)=>{
  try{const controller=snapshot.controller,ids=snapshot.entity.kind==='drawing'?[...snapshot.entity.ids].map(String):[];if(!ids.length)return{ok:false,message:'No drawing is selected.'};run(controller,ids,controller.drawingManager.list() as unknown as Record<string,unknown>[]);if(controller===activeController.current)captureDrawings();return true;}
  catch(error){return{ok:false,message:friendlyError(error)};}
 };
 /** The TPO chart menu rows Merge with previous profile / Unmerge profile save mergePoints. */
 const tpoMergeAction=(action:'tpo-merge'|'tpo-unmerge')=>(snapshot:ChartMenuSnapshot)=>{
  try{if(snapshot.input.style!=='tpo'||current.current.chartStyle!=='tpo')return{ok:false,message:'This chart is not a TPO chart.'};if(snapshot.controller!==activeController.current)return{ok:false,message:'Select this chart first, then merge its profiles.'};
   const saved=current.current.chartTypeSettings??{},settings={...(snapshot.controller.getChartSettingsBook?.()?.tpo??{}),...(saved.tpo??{})},choice=tpoMergeChoiceAt(snapshot.input.bars,settings,snapshot.input.source,snapshot.point.barTime),patch=action==='tpo-merge'?choice?.merge:choice?.unmerge;
   if(!patch)return{ok:false,message:action==='tpo-merge'?'This profile has no previous profile to merge with.':'This profile is not merged.'};
   return commit({chartTypeSettings:{...saved,tpo:{...(saved.tpo??{}),...patch}}})?true:{ok:false,message:'The TPO merge points could not be saved.'};}
  catch(error){return{ok:false,message:friendlyError(error)};}
 };
 const barsPatternToggle=(snapshot:ChartMenuSnapshot,key:'mirrored'|'flipped')=>{
  try{const id=snapshot.entity.kind==='drawing'&&snapshot.entity.ids.length===1?String(snapshot.entity.ids[0]):null;if(!id)return{ok:false,message:'Select one Bars pattern first.'};
   const editor=snapshot.controller.getDrawingEditor(id);if(editor.type!==LV_BARS_PATTERN)return{ok:false,message:'Select a Bars pattern first.'};
   snapshot.controller.updateDrawingProperties(id,{[key]:editor.values[key]!==true});if(snapshot.controller===activeController.current)captureDrawings();return true;}
  catch(error){return{ok:false,message:friendlyError(error)};}
 };
 /** During the routine background autosave a drawing row of the chart menu (all but Add alert, which opens a
  dialog) waits for the write (queueDrawingEdit) and the menu closes at once; a refusal when it runs goes to the status line. */
 const queuedDrawingRows=<T extends Record<string,(snapshot:ChartMenuSnapshot)=>boolean|{ok:boolean;message?:string}>>(rows:T):T=>Object.fromEntries(Object.entries(rows).map(([action,handler])=>[action,action==='drawing-alert'?handler:(snapshot:ChartMenuSnapshot)=>{
  const ids=snapshot.entity.kind==='drawing'?[...snapshot.entity.ids].map(String):[];
  if(queueDrawingEdit(()=>{const result=handler(snapshot);return typeof result==='object'&&!result.ok?result.message:undefined;},{drawings:ids},snapshot.controller))return true;
  return handler(snapshot);}])) as T;
 const drawingContextHandlers=queuedDrawingRows({
  'drawing-alert':(snapshot:ChartMenuSnapshot)=>{const id=snapshot.entity.kind==='drawing'&&snapshot.entity.ids.length===1?String(snapshot.entity.ids[0]):null;if(!id)return{ok:false,message:'Select one drawing first.'};openDrawingAlert(id);return true;},
  'drawing-clone':drawingContextRun((controller,ids)=>{controller.drawings.duplicate(ids);}),
  // LV drawing clipboard (process memory, held by the chart). Ctrl+V pastes the copy as one undo step.
  'drawing-copy':drawingContextRun((controller,ids)=>{controller.copyDrawings(ids);setMessage(ids.length===1?'Drawing copied. Press Ctrl+V to paste it.':ids.length+' drawings copied. Press Ctrl+V to paste them.');}),
  // Cut (copy then remove as one step) and the chart menu's Paste (VDL#series.moreMenu order 10).
  'drawing-cut':drawingContextRun((controller,ids)=>{controller.cutDrawings(ids);setMessage(clipboardMessage(ids.length,true));}),
  paste:(snapshot:ChartMenuSnapshot)=>{try{snapshot.controller.pasteDrawings();if(snapshot.controller===activeController.current)captureDrawings();return true;}catch(error){return{ok:false,message:friendlyError(error)};}},
  'drawing-forward':drawingContextRun((controller,ids)=>{controller.drawingManager.order(ids,'forward');}),
  'drawing-backward':drawingContextRun((controller,ids)=>{controller.drawingManager.order(ids,'backward');}),
  'drawing-mirror':(snapshot:ChartMenuSnapshot)=>barsPatternToggle(snapshot,'mirrored'),
  'drawing-flip':(snapshot:ChartMenuSnapshot)=>barsPatternToggle(snapshot,'flipped'),
  'drawing-lock':drawingContextRun((controller,ids,rows)=>{const chosen=rows.filter(row=>ids.includes(String(row.id)));controller.drawingManager.set(ids,{locked:!chosen.every(row=>row.locked===true)});}),
  'drawing-hide':drawingContextRun((controller,ids,rows)=>{const chosen=rows.filter(row=>ids.includes(String(row.id)));controller.drawingManager.set(ids,{visible:!chosen.every(row=>row.visible!==false)});}),
  'drawing-front':drawingContextRun((controller,ids)=>{controller.drawingManager.order(ids,'front');}),
  'drawing-back':drawingContextRun((controller,ids)=>{controller.drawingManager.order(ids,'back');}),
  'drawing-remove':drawingContextRun((controller,ids)=>{controller.drawingManager.remove(ids);}),
  // "Draw horizontal line at {price}" places a Horizontal line at the clicked price (rounded
  // to the tick as the row shows it), anchored at the clicked bar; one drawing step, like the price scale + menu row.
  hline:(snapshot:ChartMenuSnapshot)=>{try{const refusal=contextPriceTargetError(snapshot);if(refusal)throw new Error(refusal);const price=contextTargetPrice(snapshot),time=snapshot.point.barTime??snapshot.input.bars.at(-1)?.time;if(typeof time!=='number'||!Number.isFinite(time))throw new Error('The chart has no bars to anchor a horizontal line yet.');
   const created=snapshot.controller.drawings.add('hline',{paneId:'price',anchors:[{time:time*1000,price}]});if(!created)throw new Error('The chart renderer refused the drawing.');if(snapshot.controller===activeController.current)captureDrawings();return true;}catch(error){return{ok:false,message:friendlyError(error)};}},
 });
 // The indicator menu on a clicked plot, the main series rows on the candles, and the
 // chart-body rows Add {symbol} to watchlist, Hide marks on bars and Paste {indicator}. Each acts on the active chart only, through
 // the same routes as the legend (owner, fingerprint and saved-capture checks; the background autosave wait).
 const activeMenuChart=(snapshot:ChartMenuSnapshot)=>{if(!chart||snapshot.controller!==chart||activeController.current!==chart)throw new Error('This menu belongs to another chart. Click that chart first.');return chart;};
 const menuIndicator=(snapshot:ChartMenuSnapshot)=>{activeMenuChart(snapshot);const entity=snapshot.entity;if(entity.kind!=='indicator')throw new Error('Point at an indicator first.');const row=indicatorViews.find(item=>item.id===entity.id);if(!row)throw new Error('This indicator was removed.');return row;};
 const menuRun=(run:(snapshot:ChartMenuSnapshot,options?:ChartContextActionOptions)=>void)=>(snapshot:ChartMenuSnapshot,_lease:ChartMenuActionLease,options?:ChartContextActionOptions)=>{try{run(snapshot,options);return true;}catch(error){return{ok:false,message:friendlyError(error)};}};
 const indicatorMenuHandlers={
  'indicator-settings':menuRun(snapshot=>openIndicatorSettings(menuIndicator(snapshot))),
  'indicator-intervals':menuRun(snapshot=>openIndicatorSettings(menuIndicator(snapshot),'Visibility')),
  'indicator-alert':menuRun(snapshot=>openIndicatorAlert(menuIndicator(snapshot))),
  'indicator-add-on':menuRun(snapshot=>{const row=menuIndicator(snapshot);openIndicatorsOn(row);}),
  'indicator-hide':menuRun(snapshot=>{const row=menuIndicator(snapshot);indicatorChartAction(()=>applyIndicatorLegendAction(row));}),
  'indicator-remove':menuRun(snapshot=>{const row=menuIndicator(snapshot);indicatorChartAction(()=>applyIndicatorLegendAction(row,true));}),
  'indicator-copy':menuRun(snapshot=>copyIndicator(menuIndicator(snapshot))),
  'indicator-anchor':menuRun(snapshot=>beginAnchorPlacement(menuIndicator(snapshot).id,false)),
  'indicator-order':menuRun((snapshot,options)=>{const row=menuIndicator(snapshot),step=options?.item;if(!step||!isIndicatorOrderStep(step))throw new Error('Choose a Visual order step.');const ids=indicatorOrderAfter(indicatorViews.map(item=>({id:item.id,paneId:item.paneId})),row.id,step);if(ids)indicatorChartAction(()=>applyIndicatorOrder(ids));}),
  'indicator-move':menuRun((snapshot,options)=>{const row=menuIndicator(snapshot),where=options?.item;if(where!=='above'&&where!=='below'&&where!=='existing-above'&&where!=='existing-below')throw new Error('Choose where to move the indicator.');indicatorChartAction(()=>applyIndicatorMove(row,where));}),
  'indicator-pin':menuRun((snapshot,options)=>{const row=menuIndicator(snapshot),placement=pinToScalePlacement(options?.item??'');indicatorChartAction(()=>applyIndicatorScale(row,placement));}),
  'indicator-paste':menuRun(snapshot=>{activeMenuChart(snapshot);const clip=indicatorClipboard.get();if(!clip)throw new Error('Copy an indicator first.');indicatorChartAction(()=>applyIndicatorPaste(clip));}),
  'series-hide':menuRun(snapshot=>{activeMenuChart(snapshot);setSeriesVisibility(seriesHidden);}),
  'series-pin':menuRun((snapshot,options)=>{const target=activeMenuChart(snapshot),side=options?.item;if(side!=='left'&&side!=='right')throw new Error('Choose a price scale side.');if(readSeriesSide()===side)return;const result=target.priceScale.execute(side==='left'?'moveLeft':'moveRight',{origin:'chart-pointer'});if(!result.ok)throw new Error(result.message??'The price scale did not move.');}),
  'watchlist-add':menuRun(snapshot=>{activeMenuChart(snapshot);addChartSymbolToWatchlist();}),
  'hide-marks':menuRun(snapshot=>{const hidden=barMarksVisibility.toggle(snapshot.cellId);setMessage(hidden?'Marks on bars are hidden on this chart.':'Marks on bars are shown on this chart.');}),
 };
 const selectedDrawingProperties=useMemo(()=>{
  if(!chart||!selectedDrawing)return undefined;
  const row=drawings.find(x=>x.id===selectedDrawing);if(!row)return undefined;
  let buttons:ReturnType<ChartController['bulkPropertyBar']>['buttons']=[];
  try{buttons=chart.bulkPropertyBar([row,row] as never).buttons;}catch{buttons=[];}
  // Text color and Font size come from the drawing's own settings; a write outside the five shared paths is the drawing's settings edit.
  let editor:ReturnType<ChartController['getDrawingEditor']>|null=null;try{editor=chart.getDrawingEditor(selectedDrawing);}catch{editor=null;}
  const all=editBarButtons(buttons,editor?.fields,String(row.type));
  if(!all.length)return undefined;
  const read=(path:string)=>editBarRead(row,editor?.values,path);
  return{buttons:all,read,apply:(path:string,value:unknown)=>drawingAction(()=>{if(editBarUsesBulk(path))chart.drawingManager.applyProperties([selectedDrawing],{[path]:value});else chart.updateDrawingProperties(selectedDrawing,{[path]:value});},[selectedDrawing])};
 },[chart,selectedDrawing,drawings]);
 /** The floating toolbar Template menu, read fresh each render (no memo: undo, redo and layout restore re-render it). */
 const selectedDrawingTemplates=(()=>{
  if(!chart||!selectedDrawing)return undefined;const row=drawings.find(x=>x.id===selectedDrawing);if(!row||typeof row.type!=='string')return undefined;
  let list:{id:string;name:string}[]=[];try{list=editBarTemplateRows(chart.drawingManager.state().templates,row.type);}catch{return undefined;}
  const type=row.type,id=selectedDrawing;
  return{list,
   onApply:(templateId:string)=>drawingAction(()=>{chart.drawingManager.applyTemplate([id],templateId);},[id]),
   onSave:(name:string)=>drawingAction(()=>{chart.drawingManager.saveTemplate(id,name);setMessage('Drawing template saved.');},[id]),
   onRemove:(templateId:string)=>drawingAction(()=>{chart.drawingManager.removeTemplate(templateId);},[id]),
   onApplyDefault:()=>drawingAction(()=>{const patch=defaultTemplatePatch(chart.getDrawingEditor(id));if(patch&&Object.keys(patch).length)chart.updateDrawingProperties(id,patch);},[id]),
   onSaveDefault:()=>{try{const saved=chart.drawingManager.list().find(item=>item.id===id);if(!saved)throw Error('This drawing no longer exists.');const captured=captureToolDefault(saved);if(commit({drawingToolDefaults:withToolDefault(current.current.drawingToolDefaults,captured.type,captured.value)})===false)throw Error('The default was not saved.');setMessage('New '+drawingDialogTitle(type)+' drawings start with these settings.');}catch(error){reportFailure(error);}},
  };
 })();
 const selectedDrawingOrder=(()=>{if(!chart||!selectedDrawing)return undefined;try{return chart.drawingManager.orderState([selectedDrawing]);}catch{return undefined;}})();
 const currentContextHandlers={note:contextHandler('note'),'copy-price':contextHandler('copy-price'),'cursor-lock':contextHandler('cursor-lock'),'table-view':contextHandler('table-view'),'source-csv':contextHandler('source-csv'),'indicators-xlsx':contextHandler('indicators-xlsx'),'png-save':contextHandler('png-save'),'png-copy':contextHandler('png-copy'),/* Reset chart view runs the Alt+R command on the clicked chart. */'reset-view':(snapshot:ChartMenuSnapshot)=>snapshot.controller.priceScale.execute('resetChart',{origin:'chart-pointer'}),/* Remove N drawings / indicators run the trash rail removal on the active chart (the only chart whose counts are published). */'remove-drawings':(snapshot:ChartMenuSnapshot)=>{if(snapshot.controller!==chart)return{ok:false,message:'This chart is no longer active. Try again.'};removeFromToolbar('drawings');return true;},'remove-indicators':(snapshot:ChartMenuSnapshot)=>{if(snapshot.controller!==chart)return{ok:false,message:'This chart is no longer active. Try again.'};removeFromToolbar('indicators');return true;},objects:contextHandler('objects'),theme:contextHandler('theme'),date:contextHandler('date'),interval:contextHandler('interval'),indicator:contextHandler('indicator'),'drawing-settings':contextHandler('drawing-settings'),'drawing-template':contextHandler('drawing-template'),'drawing-visibility':contextHandler('drawing-visibility'),'price-alert':contextHandler('price-alert'),'paper-ticket':contextHandler('paper-ticket'),'tpo-merge':tpoMergeAction('tpo-merge'),'tpo-unmerge':tpoMergeAction('tpo-unmerge'),command:(snapshot:ChartMenuSnapshot,_lease:ChartMenuActionLease,options?:ChartContextActionOptions)=>{if(snapshot.controller!==chart)return{ok:false,message:'This chart is no longer active. Try again.'};const id=options?.item;if(id==='hide-drawings'){changeUtility(toggleHide);return true;}const run=id?commandRuns[id as AppCommandId]:undefined;if(!run||run.disabled)return{ok:false,message:'That command is not available right now.'};run.run();return true;},...drawingContextHandlers,...indicatorMenuHandlers};
 const contextHandlers=useRef(currentContextHandlers);contextHandlers.current=currentContextHandlers;
 const contextActions=useMemo(()=>ownedCallbacks(()=>contextHandlers.current,()=>gridGeneration.current===gridEpoch),[gridEpoch]);
 const renderedDialogAuthority=dialogAuthority.current;
 const closeDialog=()=>{if(dialogAuthority.current!==renderedDialogAuthority)return;setDialog(null);};
 const activeDialogContext=contextDialog.current;
 function assertDialogContext(native=true){if(dialogAuthority.current!==renderedDialogAuthority||dialogOwner.current!==dialog)throw new Error('This chart dialog was closed or replaced.');if(!activeDialogContext)return;if(contextDialog.current!==activeDialogContext||dialogOwner.current!==activeDialogContext.dialog)throw new Error('This chart dialog was closed or replaced.');activeDialogContext.ownership.assertCurrent(native);}
 function commitDialogField<K extends 'news'|'filings'|'fundamentals'|'fundamentalsPreferences'|'calendar'|'heatmap'|'screener'|'portfolio'|'marketViews'>(key:K,value:Workspace[K]){assertDialogContext(false);if(current.current[key]!==workspace[key])throw new Error('The saved analysis data changed. Review the current view before applying this draft.');return commit({[key]:value} as Partial<Workspace>);}
 function assertContextPriceOwner(request:ContextPriceRequest,phase:'seed'|'use'='use'){assertDialogContext();if(!activeDialogContext||activeDialogContext.priceRequest!==request)throw new Error('This clicked-price request was closed or replaced.');contextPriceAuthority.current!.assert(request,phase);}
 function assertStrategyReportOwner(){assertStartupEditable(startup.current);assertDialogContext(false);assertStrategyReportRun();}
 function assertStrategyReportRun(){if(strategyExecutionCurrent.current!==strategyExecution||current.current.strategy!==workspace.strategy)throw new Error('The strategy execution or properties changed. Review the current report.');}
 // The active layout's panel view, the mounted tabs and the docked Strategy tester's owner of this render.
 const bottomView=bottomPanelView(workspace.bottomPanel,bottomPanelLayoutId(workspace)),tablesOffered=bottomView.tab==='tables'||!!workspace.grid?.layout.cells.some(cell=>workspace.grid?.cells[cell.id]?.scriptBindings?.some(binding=>binding.tablePlacement==='bottom')),bottomMounted=mountedBottomTabs(bottomView,bottomVisited),renderedStrategyToken=strategyDockToken.current;
 strategyDockLive.current=strategyDocked&&bottomMounted.includes('strategy');
 const scriptEditorOpen=scriptDocked?bottomMounted.includes('script'):dialog==='script';
 function assertDockedStrategyOwner(){if(strategyDockToken.current!==renderedStrategyToken||!strategyDockLive.current)throw new Error('This Strategy tester was closed or replaced.');assertStartupEditable(startup.current);assertStrategyReportRun();}
 const openStrategyTester=()=>{if(strategyDocked)changeBottomPanel(view=>openBottomTab(view,'strategy'));else setDialog('strategy');};
 function completeContextPrice(request:ContextPriceRequest,outcome:ContextPriceOutcome){if(!['saved','cancelled','replaced'].includes(outcome)||dialogAuthority.current!==renderedDialogAuthority||!activeDialogContext||contextDialog.current!==activeDialogContext||activeDialogContext.priceRequest!==request)return;setDialog(null);}
 function confirmDrawingCapture(){assertDialogContext();if(!chart)return false;const saved=current.current,grid=saved.grid,cell=grid&&grid.cells[grid.layout.activeCellId];if(!cell)return false;return confirmDrawingPublication({assertCurrent(){assertDialogContext();if(current.current!==saved||activeController.current!==chart||gridGeneration.current!==gridEpoch||storageMutation.current)throw Error('Drawing publication owner changed.');},readSaved:()=>cell.drawings,readNative:()=>chart.saveDrawings(),refresh:captureDrawings});}
 const analysisRenderOwner={chart,epoch:gridEpoch,cellId:workspace.grid?.layout.activeCellId,style:workspace.chartStyle,runId:replay?.runId??null,bars,sourceKey:chartSourceContextKey(source)};
 function ownsRenderedAnalysis(){try{const input=currentInput.current,owner=analysisRenderOwner;const matches=()=>!!owner.chart&&activeController.current===owner.chart&&gridGeneration.current===owner.epoch&&current.current.grid?.layout.activeCellId===owner.cellId&&current.current.chartStyle===owner.style&&(currentInput.current?.bars===owner.bars||typeof sameBarsInput==='function'&&sameBarsInput(currentInput.current?.bars,owner.bars))&&(currentReplay.current?.runId??null)===owner.runId;if(!input||!matches())return false;const key=chartSourceContextKey(sourceContextForDataset(input.dataset,input.bars));return key===owner.sourceKey&&matches()&&currentInput.current?.dataset===input.dataset;}catch{return false;}}
 function assertRenderedAnalysisOwner(){if(!ownsRenderedAnalysis())throw Error('This indicator control belongs to a previous chart source or replay position.');}
 /** allowBackgroundWrite: indicator draft input stays editable during the routine background autosave; publication still waits for the write. */
 function assertActiveAnalysisChart(allowBackgroundWrite=false){if(!chart||activeController.current!==chart||gridGeneration.current!==gridEpoch||(storageMutation.current||workspaceTransaction.current)&&!(allowBackgroundWrite&&backgroundWriteActive()))throw Error('The active chart changed or is busy.');const input=currentInput.current;if(!input||!chart.isInputCurrent({bars:input.bars,source:sourceContextForDataset(input.dataset,input.bars),style:current.current.chartStyle}))throw Error('The active chart analysis is unavailable. Reopen it before editing.');}
 function assertAnalysisDialogContext(){assertDialogContext(false);assertRenderedAnalysisOwner();const owner=chart!,check=owner.isInputOwned;assertRenderedAnalysisOwner();if(!check.call(owner,{bars:analysisRenderOwner.bars,source,style:analysisRenderOwner.style}))throw Error('This analysis dialog belongs to a previous chart source. Reopen it before editing.');assertRenderedAnalysisOwner();}
 function assertAnalysisDialogEditable(allowBackgroundWrite=false){assertAnalysisDialogContext();assertDialogContext();assertActiveAnalysisChart(allowBackgroundWrite);assertAnalysisDialogContext();}
 function confirmAnalysisCapture(domain:'indicator'|'comparison',dialogOwned=true,assertOrigin:()=>void=()=>{}){
  assertOrigin();assertActiveAnalysisChart();assertOrigin();if(dialogOwned)assertAnalysisDialogContext();const owner=chart!,saved=current.current,grid=saved.grid,cell=grid&&grid.cells[grid.layout.activeCellId];if(!cell)return false;
  const assertOwnership=()=>{assertOrigin();if(dialogOwned)assertAnalysisDialogContext();if(current.current!==saved||activeController.current!==owner)throw Error('Analysis publication owner changed.');};
  const assertCapture=()=>{assertOwnership();assertActiveAnalysisChart();assertOwnership();};
  return confirmAnalysisPublication(domain,{assertCurrent:assertCapture,readSaved:()=>domain==='indicator'?cell.indicators:cell.comparisons,readNative:()=>domain==='indicator'?owner.indicators.serialize():owner.comparisons.list().map(({dataset,rendererId,...settings})=>({...settings,datasetId:dataset.provenance.datasetId})),refresh:()=>{if(domain==='indicator')captureIndicators(assertCapture);},quarantine:error=>{assertOwnership();const report=owner.reportAnalysisPublicationFailure;assertOwnership();report.call(owner,error);}});
 }
 /** Root-owned table destination transaction: one exact cell, one Undo entry, no calculation request. */
 function changeScriptTableDestination(controller:ChartController,cellId:string,binding:ScriptBinding,destination:'chart'|'bottom',assertOwner:()=>void):boolean{
  const saved=current.current,grid=saved.grid,cell=grid?.cells[cellId],epoch=gridGeneration.current;let lease:import('../chart/script-port').ScriptTableDestinationLease|null=null,accepted=false,ok=false;const failures:unknown[]=[];
  const owns=()=>{assertOwner();if(!loaded||dialogOwner.current||workspaceTransaction.current||storageMutation.current||coordinator.current?.transactionActive?.()||current.current!==saved||current.current.grid!==grid||gridGeneration.current!==epoch||!cell||grid?.cells[cellId]!==cell||!cell.scriptBindings?.some(row=>row===binding||row.id===binding.id&&scriptStudyFingerprint(row)===scriptStudyFingerprint(binding)))throw Error('This chart changed or is busy. Reopen its script actions.');};
  try{assertStartupEditable(startup.current);owns();const prepare=controller.scripts.prepareTableDestination;if(!prepare)throw Error('This script renderer cannot prepare table destinations.');lease=prepare.call(controller.scripts,binding.id,destination);owns();lease.assertCurrent();lease.apply(destination);owns();lease.assertCurrent();
   const bindings=(cell!.scriptBindings??[]).map(row=>{if(row.id!==binding.id)return row;const next={...row};if(destination==='bottom')next.tablePlacement='bottom';else delete next.tablePlacement;return next;}),nextGrid={...grid!,cells:{...grid!.cells,[cellId]:{...cell!,scriptBindings:bindings}}},layoutId=bottomPanelLayoutId(saved),before=bottomPanelView(saved.bottomPanel,layoutId),after=openBottomTab(before,'tables');
   if(!commit({grid:nextGrid,bottomPanel:withBottomPanelView(saved.bottomPanel,layoutId,after,saved.layoutLibrary?.entries.map(row=>row.id))},undefined,()=>{accepted=true;const value=committedInput.current;if(value?.workspace===saved)committedInput.current={...value,workspace:current.current};},()=>{owns();lease!.assertCurrent();}))throw Error('The workspace refused this table destination.');
   lease.assertCurrent();setBottomVisited(visited=>nextVisitedTabs(before,after,visited));ok=true;
  }catch(error){failures.push(error);if(!accepted&&lease&&current.current===saved)try{owns();lease.rollback();}catch(rollback){failures.push(rollback);}}
  finally{const release=lease;lease=null;try{release?.release();}catch(error){failures.push(error);}}
  if(failures.length)reportFailure(failures.length===1?failures[0]:new AggregateError(failures,'Script table destination and recovery were incomplete.'));return ok;
 }
 /** Queue after acknowledged cell activation; actual actions wait for this App render's owner. */
 function acceptCellStudyIntent(intent:CellStudyIntent):boolean{try{
  assertStartupEditable(startup.current);assertCellStudyIntent(intent);
  if(intent.subject.kind==='script'&&intent.action.kind==='tables'){
   const cell=current.current.grid?.cells[intent.target.cellId],binding=cell?.scriptBindings?.find(row=>row.id===intent.subject.id);if(!binding||scriptStudyFingerprint(binding)!==intent.subject.fingerprint)return false;
   return changeScriptTableDestination(intent.target.controller,intent.target.cellId,binding,intent.action.destination,()=>{assertCellStudyIntent(intent);if(intent.target.controller.getExecutionIdentity()!==intent.target.executionIdentity||!intent.target.controller.isInputCurrent(intent.target.input))throw Error('The script source changed.');});
  }
  if(!loaded||dialogOwner.current||workspaceTransaction.current||storageMutation.current&&!backgroundWriteActive()||activeController.current!==intent.target.controller||current.current.grid?.layout.activeCellId!==intent.target.cellId)return false;
  if(!intent.target.controller.isInputOwned(intent.target.input))return false;
  studyIntents.current!.enqueue(intent,gridGeneration.current,dialogAuthority.current,current.current);setStudyRevision(value=>value+1);return true;
 }catch(cause){reportFailure(cause);return false;}}
 function assertCellScriptDialog(expected:NonNullable<typeof cellScriptDialog.current>|null,expectedBinding?:ScriptBinding){
  const payload=expected,owns=()=>!!payload&&cellScriptDialog.current===payload&&(expectedBinding===undefined||payload.binding===expectedBinding)&&dialogAuthority.current===payload.authority&&dialogOwner.current==='cell-script-settings'&&current.current===payload.workspace&&activeController.current===payload.intent.target.controller&&current.current.grid?.layout.activeCellId===payload.intent.target.cellId;
  if(!payload||!owns())throw Error('This script dialog belongs to a previous chart.');payload.intent.assertTreeCurrent?.();const target=payload.intent.target,input=currentInput.current;
  if(!input||current.current.chartStyle!==target.input.style||(currentReplay.current?.runId??'ordinary')!==target.executionIdentity||chartSourceContextKey(sourceContextForDataset(input.dataset,input.bars))!==chartSourceContextKey(target.input.source)||target.controller.getExecutionIdentity()!==target.executionIdentity||!target.controller.isInputOwned(target.input))throw Error('The script source changed. Reopen Settings.');
  payload.intent.assertTreeCurrent?.();if(!owns())throw Error('This script dialog belongs to a previous chart.');return payload;
 }
 function runCellStudyIntent(intent:CellStudyIntent){
  assertCellStudyIntent(intent);assertRenderedAnalysisOwner();assertActiveAnalysisChart();
  if(intent.subject.kind==='series'){
   if(intent.action.kind!=='series')throw Error('This series command is invalid.');
   switch(intent.action.command){case'title':openSymbolSearch('','toolbar');return;case'interval':toggleIntervalMenu();return;case'flag':toggleSeriesFlag();return;case'show':setSeriesVisibility(true);return;case'menu':setLegendMenu({id:SERIES_MENU,open:null});return;}
  }
  if(intent.action.kind==='series')throw Error('The series command belongs to another control.');
  if(intent.subject.kind==='script'){
   const rows=current.current.scriptBindings,binding=rows.find(row=>row.id===intent.subject.id);if(!binding||scriptStudyFingerprint(binding)!==intent.subject.fingerprint)throw Error('This script changed. Review its current settings.');
   if(intent.action.kind==='settings'){setDialog('cell-script-settings');cellScriptDialog.current={intent,binding,workspace:current.current,authority:dialogAuthority.current};return;}
   if(intent.action.kind!=='visibility'&&intent.action.kind!=='remove')throw Error('That action is unavailable for scripts.');
   if(!commit({scriptBindings:intent.action.kind==='remove'?rows.filter(row=>row.id!==binding.id):rows.map(row=>row.id===binding.id?{...row,visible:!row.visible}:row)}))throw Error('The workspace refused this script change.');return;
  }
  const rows=chart!.indicators.list(),row=rows.find(value=>value.id===intent.subject.id);if(!row||builtinStudyFingerprint(row)!==intent.subject.fingerprint)throw Error('This indicator changed. Review its current settings.');
  setIndicatorViews(rows);
  switch(intent.action.kind){
   case'settings':openIndicatorSettings(row,intent.action.tab);return;
   case'visibility':indicatorChartAction(()=>{assertCellStudyIntent(intent);applyIndicatorLegendAction(row);});return;
   case'remove':indicatorChartAction(()=>{assertCellStudyIntent(intent);applyIndicatorLegendAction(row,true);});return;
   case'move':{const where=intent.action.where;indicatorChartAction(()=>{assertCellStudyIntent(intent);applyIndicatorMove(row,where);});return;}
   case'scale':{const placement=intent.action.placement;indicatorChartAction(()=>{assertCellStudyIntent(intent);applyIndicatorScale(row,placement);});return;}
   case'order':{const ids=indicatorOrderAfter(rows.map(value=>({id:value.id,paneId:value.paneId})),row.id,intent.action.step);if(ids)indicatorChartAction(()=>{assertCellStudyIntent(intent);applyIndicatorOrder(ids);});return;}
   case'copy':copyIndicator(row);return;
   case'favorite':if(!commit({indicatorLibrary:toggleIndicatorFavorite(current.current.indicatorLibrary,row.kind)}))throw Error('The workspace refused this favorite change.');return;
   case'alert':openIndicatorAlert(row);return;
   case'add-indicator':openIndicatorsOn(row);return;
   case'object-tree':setRailPanel('objects');setObjectTreeTab('object_tree');return;
  }
 }
 /** Anchored VWAP placement: the next click on a chart bar stores that bar's open time as the anchor (read back in the
  *  exchange clock, src/domain/indicators-ext/vwap-session-catalog.ts anchorTextAt); Esc ends it, removing a just-added
  *  instance that never got an anchor. */
 function beginAnchorPlacement(id:string,fresh:boolean){setLegendMenu(null);if(dialogOwner.current==='indicators')closeChartDialog();setAnchorPlacement({id,fresh});}
 function endAnchorPlacement(cancel:boolean){const placing=anchorPlacementRef.current;if(!placing)return;anchorPlacementRef.current=null;setAnchorPlacement(null);
  if(!cancel||!placing.fresh)return;indicatorChartAction(()=>{try{const port=chart!.indicators,live=port.list().find(item=>item.id===placing.id);if(!live||String(live.inputs.anchor??'').trim())return;assertRenderedAnalysisOwner();port.remove(placing.id);if(!confirmAnalysisCapture('indicator',false,assertRenderedAnalysisOwner))throw Error('Reopen the chart before editing the indicator.');}catch(error){if(ownsRenderedAnalysis())reportFailure(error);}});}
 anchorPlacementEnd.current=endAnchorPlacement;
 function placeAnchorAt(time:number|null){const placing=anchorPlacementRef.current;if(!placing)return;if(time===null){setMessage('Choose a bar on the chart.');return;}
  anchorPlacementRef.current=null;setAnchorPlacement(null);
  indicatorChartAction(()=>{try{assertRenderedAnalysisOwner();assertActiveAnalysisChart();const port=chart!.indicators,live=port.list().find(item=>item.id===placing.id);if(!live)throw Error('This indicator is no longer on the chart.');
   const anchor=anchorTextAt(time,anchorZoneOf(sourcePivotCalendar(dataset.instrument.assetClass,dataset.instrument.timezone)));
   port.update(placing.id,{inputs:{...live.inputs,anchor}});if(!confirmAnalysisCapture('indicator',false,assertRenderedAnalysisOwner))throw Error('Reopen the chart before editing the indicator.');}
  catch(error){if(ownsRenderedAnalysis())reportFailure(error);}});}
 function applyIndicatorLegendAction(row:IndicatorInstanceView,remove=false){try{
  assertRenderedAnalysisOwner();assertActiveAnalysisChart();assertRenderedAnalysisOwner();const port=chart!.indicators,list=port.list;assertRenderedAnalysisOwner();const live=list.call(port).find(item=>item.id===row.id);assertRenderedAnalysisOwner();if(!live||indicatorEditFingerprint(live)!==indicatorEditFingerprint(row))throw Error('This indicator changed. Review its current settings.');
  const mutate=remove?()=>{const fn=port.remove;assertRenderedAnalysisOwner();fn.call(port,row.id);}:()=>{const fn=port.update;assertRenderedAnalysisOwner();fn.call(port,row.id,{visible:!row.visible});};assertActiveAnalysisChart();assertRenderedAnalysisOwner();mutate();assertRenderedAnalysisOwner();if(!confirmAnalysisCapture('indicator',false,assertRenderedAnalysisOwner))throw Error('Reopen the chart before editing the indicator.');
 }catch(error){if(ownsRenderedAnalysis())reportFailure(error);}}
  /** Object tree Move to: the same owner, fingerprint and saved-capture checks as the legend Hide/Remove route.
   * An existing-pane choice merges into the neighbour pane (indicator-move-targets); it never lifts a pane. */
  function applyIndicatorMove(row:IndicatorInstanceView,where:IndicatorMoveWhere){try{
   assertRenderedAnalysisOwner();assertActiveAnalysisChart();assertRenderedAnalysisOwner();const port=chart!.indicators,list=port.list;assertRenderedAnalysisOwner();const live=list.call(port).find(item=>item.id===row.id);assertRenderedAnalysisOwner();if(!live||indicatorEditFingerprint(live)!==indicatorEditFingerprint(row))throw Error('This indicator changed. Review its current settings.');
   const raise=where==='above'&&studyOnPricePane(chart!,live.rendererId);if(raise){const can=canPlacePaneAbovePrice(chart!,live.rendererId);if(!can.ok)throw Error(can.message);}const target=where==='existing-above'||where==='existing-below'?existingPaneTarget(chart!,live.rendererId,list.call(port),where):studyMoveTarget(chart!,live.rendererId,where);assertActiveAnalysisChart();assertRenderedAnalysisOwner();const fn=port.move;fn.call(port,row.id,target);finishIndicatorMove({raise,lift:()=>finishNewPaneAbove(chart!,live.rendererId,true),confirm:()=>{assertRenderedAnalysisOwner();return confirmAnalysisCapture('indicator',false,assertRenderedAnalysisOwner);},report:setMessage});
  }catch(error){if(ownsRenderedAnalysis())reportFailure(error);}}
  /** Legend More "Pin to scale": the indicator port's own setScale, with the same owner, fingerprint and saved-capture checks as the legend Hide/Remove route. */
  function applyIndicatorScale(row:IndicatorInstanceView,placement:Parameters<ChartController['indicators']['setScale']>[1]){try{
   assertRenderedAnalysisOwner();assertActiveAnalysisChart();assertRenderedAnalysisOwner();const port=chart!.indicators,list=port.list;assertRenderedAnalysisOwner();const live=list.call(port).find(item=>item.id===row.id);assertRenderedAnalysisOwner();if(!live||indicatorEditFingerprint(live)!==indicatorEditFingerprint(row))throw Error('This indicator changed. Review its current settings.');
   const fn=port.setScale;assertActiveAnalysisChart();assertRenderedAnalysisOwner();fn.call(port,row.id,placement);assertRenderedAnalysisOwner();if(!confirmAnalysisCapture('indicator',false,assertRenderedAnalysisOwner))throw Error('Reopen the chart before editing the indicator.');
  }catch(error){if(ownsRenderedAnalysis())reportFailure(error);}}
  /** Visual order and the Object tree same-pane drag. The indicator port restores its own
   * saved snapshot in the new list order (the path undo, redo and layout restore take), then the saved-capture check runs as for
   * the legend Hide/Remove route; one workspace step. */
  function applyIndicatorOrder(ids:readonly string[]){try{
   assertRenderedAnalysisOwner();assertActiveAnalysisChart();assertRenderedAnalysisOwner();const port=chart!.indicators,serialize=port.serialize;assertRenderedAnalysisOwner();const saved=serialize.call(port);assertRenderedAnalysisOwner();
   if(!isIndicatorPermutation(saved,ids))throw Error('This indicator changed. Review its current settings.');const byId=new Map(saved.map(row=>[row.id,row] as const));
   const fn=port.restore;assertActiveAnalysisChart();assertRenderedAnalysisOwner();fn.call(port,ids.map(id=>byId.get(id)!));assertRenderedAnalysisOwner();if(!confirmAnalysisCapture('indicator',false,assertRenderedAnalysisOwner))throw Error('Reopen the chart before editing the indicator.');
  }catch(error){if(ownsRenderedAnalysis())reportFailure(error);}}
  /** An Object tree indicator dropped on an indicator of another pane moves into that pane (the indicator port
   * move), with the same owner, fingerprint and saved-capture checks as Move to. */
  function applyIndicatorPaneMove(row:IndicatorInstanceView,target:'price'|{pane:string}){try{
   assertRenderedAnalysisOwner();assertActiveAnalysisChart();assertRenderedAnalysisOwner();const port=chart!.indicators,list=port.list;assertRenderedAnalysisOwner();const live=list.call(port).find(item=>item.id===row.id);assertRenderedAnalysisOwner();if(!live||indicatorEditFingerprint(live)!==indicatorEditFingerprint(row))throw Error('This indicator changed. Review its current settings.');
   const fn=port.move;assertActiveAnalysisChart();assertRenderedAnalysisOwner();fn.call(port,row.id,target);assertRenderedAnalysisOwner();if(!confirmAnalysisCapture('indicator',false,assertRenderedAnalysisOwner))throw Error('Reopen the chart before editing the indicator.');
  }catch(error){if(ownsRenderedAnalysis())reportFailure(error);}}
  /** "Paste {indicator}" adds the copied settings as a new indicator (new id, the kind's default placement). */
  function applyIndicatorPaste(clip:IndicatorClip){try{
   assertRenderedAnalysisOwner();assertActiveAnalysisChart();assertRenderedAnalysisOwner();const port=chart!.indicators,fn=port.add;assertActiveAnalysisChart();assertRenderedAnalysisOwner();fn.call(port,clip.kind,{},indicatorPasteSettings(clip));assertRenderedAnalysisOwner();if(!confirmAnalysisCapture('indicator',false,assertRenderedAnalysisOwner))throw Error('Reopen the chart before editing the indicator.');setMessage(clip.title+' pasted.');
  }catch(error){if(ownsRenderedAnalysis())reportFailure(error);}}
  /** Copy on an indicator (legend, chart menu) fills the indicator clipboard; nothing on the chart changes. */
  function copyIndicator(row:IndicatorInstanceView){const clip=indicatorClipboard.copy(row,indicatorAcronyms[row.kind]??row.kind);setMessage(indicatorCopiedMessage(clip.title));}
  /** Object tree multi-select Delete: held indicator publication plus one drawing capture is ONE workspace step. Same owner, fingerprint and saved-capture checks as the legend Remove route. */
  function applyObjectTreeRemoval(request:{indicators:IndicatorInstanceView[];drawingIds:string[];removeDrawings:()=>void}){try{
   assertRenderedAnalysisOwner();assertActiveAnalysisChart();assertRenderedAnalysisOwner();const port=chart!.indicators,live=port.list.call(port);
   for(const row of request.indicators){const item=live.find(value=>value.id===row.id);if(!item||indicatorEditFingerprint(item)!==indicatorEditFingerprint(row))throw Error('This indicator changed. Review its current settings.');}
   // The saved-capture check runs after the one publication even when a later step failed partway.
   removeObjectsAsOneStep(port,request.indicators.map(row=>row.id),request.drawingIds.length?request.removeDrawings:undefined,()=>{assertRenderedAnalysisOwner();if(!confirmAnalysisCapture('indicator',false,assertRenderedAnalysisOwner))throw Error('Reopen the chart before editing the indicator.');});
  }catch(error){if(ownsRenderedAnalysis())reportFailure(error);}}

 const closeChartDialog=()=>{if(dialogAuthority.current!==renderedDialogAuthority||activeDialogContext&&contextDialog.current!==activeDialogContext)return;closeDialog();};
 /* The drawing settings dialog renders only while its drawing is selected. When the selection is lost (the renderer
  popup's outside-press dismissal, a deletion, a chart swap), close it through the same path as its Cancel, so the dialog
  state and its owner reset instead of leaving a hidden dialog that refuses chart actions and reopens on the next selection. */
 useEffect(()=>{if(dialog==='drawing'&&!selectedDrawing)closeChartDialog();},[dialog,selectedDrawing]);
 // Split and dividend ex-dates for the VWAP Dividends and Splits anchors (chart and alerts), from the same
 // memoized corporate-action load as the chart's markers. The chart recalculates its indicators once the dates arrive.
 const vwapEventSymbol=chartEventSymbol(dataset.provenance.providerId,dataset.instrument.symbol),vwapEventInstrument=dataset.instrument.id;
 useEffect(()=>{if(!vwapEventSymbol)return;let live=true;void loadChartEvents(vwapEventSymbol).then(result=>{if(!live)return;rememberVwapEventDates(vwapEventInstrument,result.ok?result.value.events:null);recomputeForVwapDates(chart);});return()=>{live=false;};},[vwapEventSymbol,vwapEventInstrument,chart]);
 // Earnings starts for the VWAP Earnings anchor, from the user's own Calendar documents only (none = unavailable).
 const vwapCalendarDocuments=workspace.calendar.documents,vwapEarningsSymbol=dataset.instrument.symbol,vwapEarningsFixture=!!dataset.provenance.fixture;
 useEffect(()=>{rememberVwapEarningsDates(vwapEventInstrument,vwapEarningsDatesFromCalendar(vwapCalendarDocuments,{instrumentId:vwapEventInstrument,symbol:vwapEarningsSymbol,fixture:vwapEarningsFixture}));recomputeForVwapDates(chart);},[vwapCalendarDocuments,vwapEventInstrument,vwapEarningsSymbol,vwapEarningsFixture,chart]);
 const scriptIdentity=scriptExecutionIdentity(source,workspace.chartStyle,replay?.runId??'ordinary');
 // Kept runs are forgotten synchronously when the calculation input changed. The former post-commit effect
 // also cleared the report, and it ran after the child script panel had delivered its result in the same commit (child
 // effects run first), so a settled run was wiped and the tester stayed at "Add a strategy to see results".
 const strategyRunInput=()=>[currentInput.current?.bars,current.current.chartStyle,current.current.grid?.layout.activeCellId,currentReplay.current?.runId];
 function scriptExecution(value:ScriptBindingExecution,cellId:string){
  forgetStrategyRunsOnInput(strategyBindings.current,strategyRunInput());rememberStrategyRun(strategyBindings.current,cellId,value);
  const saved=current.current,input=currentInput.current;if(!input||cellId!==saved.grid?.layout.activeCellId)return;
  const currentSource=sourceContextForDataset(input.dataset,input.bars),expected=scriptExecutionIdentity(currentSource,saved.chartStyle,currentReplay.current?.runId??'ordinary');
  if(value.identity!==expected||value.fixture!==input.dataset.provenance.fixture)return;
  const bindings=saved.scriptBindings;let selected=strategyBindings.current.get(cellId);if(!bindings.some(row=>row.id===selected)){selected=bindings.find(row=>saved.scriptLibrary.documents.find(doc=>doc.id===row.documentId)?.kind==='strategy')?.id??bindings[0]?.id;if(selected)strategyBindings.current.set(cellId,selected);}
  const binding=bindings.find(row=>row.id===selected),derivedRows=isDerivedStyle(saved.chartStyle),offset=derivedRows?0:input.bars.length-value.bars.length;if(value.bindingId!==selected||!binding||binding.source!==value.sourceCode||!derivedRows&&(offset<0||value.bars[0]?.time!==input.bars[offset]?.time)||value.barIds.length!==value.bars.length)return;
  const data=input.dataset,p=data.provenance,label=(p.fixture?'Example data':p.providerId===COINBASE_PROVIDER_ID||p.providerId===ALPACA_IEX_PROVIDER_ID?'Live data':p.providerId===ALPACA_SIP_PROVIDER_ID?'Delayed history (15 min)':'Local imported data')+' | '+p.providerName+' ['+p.providerId+'] | dataset '+p.datasetId+' | '+data.instrument.exchange+':'+data.instrument.symbol+' '+data.resolution+' | '+p.coverage+' | '+p.adjustment+' | '+p.session+' session | source timezone '+p.timezone+' | revision '+p.revision+' | as of '+p.asOf+' Unix seconds | delay '+(p.delaySeconds===null?'unknown':p.delaySeconds+' seconds')+' | '+p.state;
  // A still-forming live bar is never backtested by default: drop it (and any proposal made on it) before the report input
  // is staged. It is kept aside as `forming`, and the report includes it only with Recalculate on every tick on.
  const forming=!derivedRows&&isFormingLiveDataset(data),cut=value.bars.length-1,formingId=forming?value.barIds[cut]:null,onForming=(order:Record<string,unknown>)=>(order as {event?:{id?:string}}).event?.id===formingId;
  const execBars=derivedRows?strategyReportRows(value.bars):forming?value.bars.slice(0,cut):value.bars,execIds=forming?value.barIds.slice(0,cut):value.barIds,standard=forming?input.bars.slice(offset,offset+cut):offset?input.bars.slice(offset):input.bars;
  const execResult=forming?{...value.result,orders:value.result.orders.filter(order=>!onForming(order))}:value.result;
  setStrategyExecution({result:execResult,bars:execBars,barIds:execIds,source:label,identity:crypto.randomUUID(),currency:data.instrument.currency,timezone:saved.chartOptions.timezone,chartType:strategyChartTypeForStyle(saved.chartStyle),standardBars:derivedRows?[]:standard,magnifierBase:scriptRequestBase(currentSource,saved.chartStyle),forming:forming&&cut>=0?{bar:value.bars[cut],barId:formingId!,standardBar:input.bars[offset+cut],orders:value.result.orders.filter(onForming)}:null,...(value.rerun?{rerun:value.rerun}:{})});
 }
 // The report's strategy chooser. A switch shows the chosen strategy's
 // latest run (through scriptExecution's own checks); the chart's trade marks follow the same execution.
 const reportStrategies=strategyChoices(workspace.scriptBindings,workspace.scriptLibrary.documents),reportStrategyCell=workspace.grid?.layout.activeCellId;
 const reportStrategy=reportStrategyCell?strategyBindings.current.get(reportStrategyCell)??null:null;
 function selectReportStrategy(id:string){
  const saved=current.current,cellId=saved.grid?.layout.activeCellId,choice=strategyChoices(saved.scriptBindings,saved.scriptLibrary.documents).find(row=>row.id===id);
  if(!cellId||!choice||strategyBindings.current.get(cellId)===id)return;
  strategyBindings.current.set(cellId,id);setStrategyExecution(null);
  forgetStrategyRunsOnInput(strategyBindings.current,strategyRunInput());const kept=recalledStrategyRun<ScriptBindingExecution>(strategyBindings.current,cellId,id);if(kept)scriptExecution(kept,cellId);
  setMessage('The Strategy report follows '+choice.name+(kept?'.':' after its next calculation.'));
 }
 // A built-in strategy from the Indicators dialog's Strategies tab. Its original LVScript source becomes a
 // saved local strategy document (reused when already there) and is attached to this chart like Add to chart; it becomes
 // the strategy the report and the chart's trade marks follow.
 function addBuiltinStrategy(entryId:string){
  const saved=current.current,added=addBuiltinStrategyBinding(saved.scriptLibrary,saved.scriptBindings,entryId,()=>crypto.randomUUID(),new Date().toISOString());
  if(!commit({scriptLibrary:added.library,scriptBindings:added.bindings}))return;
  const cell=saved.grid?.layout.activeCellId;if(cell)strategyBindings.current.set(cell,added.binding.id);
  // Reveal the docked Strategy tester unless it is already showing; a floating tester would replace the open dialog, so it stays closed.
  if(strategyDocked)changeBottomPanel(view=>view.open&&view.tab==='strategy'?view:openBottomTab(view,'strategy'));
  setMessage(added.name+' added to the chart. Its virtual trades show on the chart; the Strategy report has the results.');
 }

 // Shell frame state. Declared after every other hook: App tests rely on hook order.
 // The legend toggler is session state (not persisted); the open legend More menu is view state.
 const [legendVisible,setLegendVisible]=useState(true),[legendMenu,setLegendMenu]=useState<{id:string;open:string|null;draft?:string}|null>(null);
 // Drawing utility block. Toggles never write history: commit() with no historyBaseline.
 const utility:DrawingUtility=workspace.drawingUtility;
 const [utilityMenu,setUtilityMenu]=useState<UtilityMenuName|null>(null),[zoomArmed,setZoomArmed]=useState(false);
 // Live comparisons on the active chart follow their feeds (comparison-live-follow.ts).
 useEffect(()=>chart?followLiveComparisons(chart.comparisons):undefined,[chart]);
 // A toggle or Remove made during the routine background autosave waits for the write (queueDrawingEdit).
 const changeUtility=(step:(value:DrawingUtility)=>DrawingUtility)=>{const apply=()=>{commit({drawingUtility:step(current.current.drawingUtility)});};if(queueDrawingEdit(apply,{},null))return;apply();};
 const zoomCanOut=!!chart?.drawingUtility?.canZoomOut();
 // Counts and plan are over the ACTIVE cell's active scope document.
 const removeCounts=removeCountsFor({rows:drawings,indicatorIds:indicatorViews.map(row=>row.id),utility});publishChartMenuCounts(chart??null,removeCounts);
 const removeFromToolbar=(scope:'drawings'|'indicators'|'all')=>{if(queueDrawingEdit(()=>removeFromToolbarNow(scope),{},chart))return;removeFromToolbarNow(scope);};
 const removeFromToolbarNow=(scope:'drawings'|'indicators'|'all')=>{
  const plan=planRemove({rows:drawings,indicatorIds:indicatorViews.map(row=>row.id),utility:current.current.drawingUtility,scope});
  applyObjectTreeRemoval({indicators:indicatorViews.filter(row=>plan.indicatorIds.includes(row.id)),drawingIds:plan.drawingIds,removeDrawings:()=>{chart!.drawingManager.remove(plan.drawingIds);}});
 };
 const utilityKeys=useRef({hide:()=>{},clipboard:(_key:'c'|'v'|'x')=>{}});
 utilityKeys.current={hide:()=>changeUtility(toggleHide),clipboard:key=>{if(!chart)return;try{if(key==='c')chart.drawingUtility.copySelection();else if(key==='x'){const count=chart.drawingUtility.cutSelection();if(count)setMessage(clipboardMessage(count,true));}else chart.drawingUtility.paste();captureDrawings();}catch(error){reportFailure(error);}}};
 useEffect(()=>{chart?.drawingUtility?.apply(workspace.drawingUtility);},[chart,workspace.drawingUtility]);
 useEffect(()=>{if(!chart)return;return chart.drawingUtility?.onChangeFromChart(value=>{commit({drawingUtility:value});});},[chart,commit]);
 /* The time axis right-click menu (controller.timeScale) runs the same writes as the bottom toolbar Timezone menu, Ctrl + Alt + Q and the Chart settings Scales and Canvas rows (scales.dayOfWeek/dateFormat/timeHours, canvas.sessionBreaks). */
 const timeScaleHostValues=useRef<{exchangeTimezone:string|null}>({exchangeTimezone:null});timeScaleHostValues.current={exchangeTimezone:dataset.provenance.timezone??null};
 useEffect(()=>{if(!chart||typeof chart.timeScale?.bindHost!=='function')return;let release:(()=>void)|undefined;try{release=chart.timeScale.bindHost({
  read:()=>{const settings=current.current.chartSettings;return{timezone:current.current.chartOptions.timezone,exchangeTimezone:timeScaleHostValues.current.exchangeTimezone,settings:{dayOfWeek:settings.scales.dayOfWeek,dateFormat:settings.scales.dateFormat,timeHours:settings.scales.timeHours,sessionBreaks:settings.canvas.sessionBreaks===true}};},
  resetTimeScale:()=>{if(activeController.current!==chart)return{ok:false,message:'This chart is no longer active. Try again.'};keyboardCommands.current.resetTimeScaleKey(current.current.chartSettings.canvas.rightMarginBars);return true;},
  setTimezone:zone=>{try{const chartOptions={...current.current.chartOptions,timezone:zone};validateChartOptions(chartOptions);commit({chartOptions});return true;}catch(error){reportFailure(error);return false;}},
  setSettings:patch=>{try{const settings=current.current.chartSettings,{sessionBreaks,...scales}=patch;commit({chartSettings:{...settings,scales:{...settings.scales,...scales},canvas:sessionBreaks===undefined?settings.canvas:{...settings.canvas,sessionBreaks}}});return true;}catch(error){reportFailure(error);return false;}},
 });}catch(error){reportFailure(error);}return()=>release?.();},[chart,commit]);
 useEffect(()=>{chart?.drawingUtility?.observeZoomContext(workspace.symbol+'|'+dataset.resolution+'|'+(workspace.grid?.layout.id??''));},[chart,workspace.symbol,dataset.resolution,workspace.grid?.layout.id]);
 const zoomTimeAt=(clientX:number)=>{const range=chart?.getViewport(),box=document.querySelector('.lv-zoom-region-overlay')?.getBoundingClientRect();if(!range||!box||box.width<=0)return null;const ratio=Math.min(1,Math.max(0,(clientX-box.left)/box.width));return range.from+ratio*(range.to-range.from);};
 const [railPanel,setRailPanel]=useState<string|null>('watchlist'),[shellMenuOpen,setShellMenuOpen]=useState<string|null>(null),[layoutSetup,setLayoutSetup]=useState<{right:number}|null>(null),[alertCreateRequest,setAlertCreateRequest]=useState<AlertCreateRequest|null>(null);
 const mainMenuRef=useRef<HTMLDivElement|null>(null),calendarMenuRef=useRef<HTMLDivElement|null>(null),layoutSetupButton=useRef<HTMLButtonElement|null>(null);
 useEffect(()=>{if(shellMenuOpen==='main')focusFirstMenuItem(mainMenuRef.current);else if(shellMenuOpen==='calendar')focusFirstMenuItem(calendarMenuRef.current);},[shellMenuOpen]);
 useEffect(()=>{if(!layoutSetup||typeof document==='undefined')return;document.querySelector?.<HTMLInputElement>('[data-chart-tree]:not([aria-hidden="true"]) [aria-label="Chart layout"] input:checked')?.focus?.();
  // Escape and outside presses close Layout setup wherever focus is (after a grid pick
  // re-renders the cells, or after another dialog, focus is no longer inside the chart workspace that used to own these keys).
  // Capture phase: a chart canvas or panel that stops Escape propagation (its own cancel) must not keep the setup open; the
  // key is not consumed here, so that surface still gets it.
  if(typeof document.addEventListener!=='function')return;
  const inside=(target:EventTarget|null)=>{const node=target as Element|null;return !!node?.closest?.('.lv-multichart > div:first-child')||!!layoutSetupButton.current&&!!node&&layoutSetupButton.current.contains?.(node as Node)===true;};
  const key=(event:KeyboardEvent)=>{if(event.key!=='Escape'||event.defaultPrevented||event.isComposing)return;const node=event.target as Element|null;if(node?.closest?.('[role=dialog],[role=alertdialog],[role=menu]')&&!inside(node))return;closeLayoutSetup(true);};
  const press=(event:Event)=>{if(!inside(event.target))closeLayoutSetup(false);};
  // Picking a grid closes Layout setup; the Sync checkboxes keep it open.
  // A click (pointer, or Space on a tile); the close runs after the grid handler has taken the pick.
  const pick=(event:Event)=>{const node=event.target as Element|null;if(node?.closest?.('[aria-label="Chart layout"] .lv-layout-tile'))setTimeout(()=>closeLayoutSetup(true),0);};
  document.addEventListener('keydown',key,true);document.addEventListener('pointerdown',press,true);document.addEventListener('click',pick,true);
  return()=>{document.removeEventListener('keydown',key,true);document.removeEventListener('pointerdown',press,true);document.removeEventListener('click',pick,true);};
 },[layoutSetup]);
 // Declared after every other hook (App tests rely on hook order): keys pressed while a storage hold is active are queued behind the routine autosave (hold state and owner re-checked before each key: active chart, grid generation, workspace chart grid) or refused visibly.
 const heldKeyRun=useRef<(command:HeldKeyCommand)=>void>(()=>{});heldKeyRun.current=command=>{if(command.kind==='replay'){if(replaySessionRef.current?.runId!==command.runId){setMessage(HELD_KEY_STALE);return;}setHeldReplayKey({action:command.action,runId:command.runId});return;}if(command.kind==='undo')keyboardCommands.current.undo();else if(command.kind==='redo')keyboardCommands.current.redo();else if(command.kind==='arm')keyboardCommands.current.armTool(command.tool);else if(command.kind==='disarm')disarmTool();else if(command.kind==='hide-toggle')utilityKeys.current.hide();else if(command.kind==='copy')utilityKeys.current.clipboard('c');else if(command.kind==='paste')utilityKeys.current.clipboard('v');else if(command.kind==='cut')utilityKeys.current.clipboard('x');else if(command.kind==='layouts'&&!document.querySelector('[role=dialog],[role=alertdialog]'))setDialog('layouts');};
 const heldKeys=useRef<ReturnType<typeof createHeldKeyGate>|null>(null);if(!heldKeys.current)heldKeys.current=createHeldKeyGate({state:()=>!storageMutation.current&&!workspaceTransaction.current?'idle':backgroundWriteActive()?'background':'blocking',afterWrite:run=>afterStorageWrite(run),capture:()=>{const chartAt=activeController.current,generation=gridGeneration.current,gridAt=current.current.grid;return()=>activeController.current===chartAt&&gridGeneration.current===generation&&(current.current.grid===gridAt||queuedEditGrid.current!==null&&current.current.grid===queuedEditGrid.current);},run:command=>heldKeyRun.current(command),report:message=>setMessage(message)});
 /** Shift+ArrowDown / Shift+ArrowRight (replayShortcut) are held-key commands too: queued behind the background write or refused visibly during a blocking hold, with the default prevented. */
 function heldCommandOf(e:KeyboardEvent):HeldKeyCommand|null{const command=heldKeyCommand(e);if(command)return command;const session=replaySessionRef.current,action=replayShortcut({key:e.key,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,altKey:e.altKey,metaKey:e.metaKey,isComposing:e.isComposing,focus:(e.target as HTMLElement)?.closest?.('.chart-workspace')?'chart':'other'},session);return action&&session?{kind:'replay',action,runId:session.runId}:null;}
 // The closed-with-saved replay panel can be closed (Continue stays remembered). A queued replay key runs after the render that follows the write, so it reads the current session and chart input.
 const [replayPanelHidden,setReplayPanelHidden]=useState(false),[heldReplayKey,setHeldReplayKey]=useState<{action:ReplayKeyAction;runId:string}|null>(null);
 useEffect(()=>{if(!heldReplayKey)return;setHeldReplayKey(null);if(replaySessionRef.current?.runId!==heldReplayKey.runId){setMessage(HELD_KEY_STALE);return;}replayKeys.current(heldReplayKey.action);},[heldReplayKey]);
 function openBackgroundFeed(feed:BackgroundFeed):LiveHandle|null{
  // An alert on a derived chart is evaluated on the derived series (its feed opens its components).
  const provider=feed.providerId===COINBASE_PROVIDER_ID||feed.providerId===ALPACA_IEX_PROVIDER_ID||feed.providerId===SYMBOL_MATH_PROVIDER_ID?liveProviderFor(feed.providerId):null;
  if(!provider)return null;
  return provider.open(feed.symbol,feed.resolution);
 }
 // The Alpaca components of open derived series stream too, so they count toward the 30-symbol limit.
 // So do the second-symbol feeds (indicator Symbol inputs and script requests).
 const alpacaChartSymbols=()=>new Set([...[...liveHandles.current.keys()].filter(id=>id.startsWith('live:'+ALPACA_IEX_PROVIDER_ID+':')).map(id=>id.split(':')[2]),...(symbolMathProvider.current?.componentSymbols()??[]).filter(symbol=>symbolMathComponentSource(symbol)!=='coinbase'&&ALPACA_SYMBOL.test(symbol)),...secondSymbolAlpaca.current()]);
 alpacaKeyRef.current=alpacaKeyConfigured;
 symbolMathHooks.current={open:openComponentFeed,known:symbol=>universe.some(row=>row.instrument.symbol===symbol),
  alpaca:(symbols,resolution)=>symbols.filter(symbol=>symbolMathComponentSource(symbol)!=='coinbase'&&ALPACA_SYMBOL.test(symbol)&&!importedComponent(symbol,resolution)),streaming:alpacaChartSymbols};
 // The "Symbol" input of the two-symbol indicators (Correlation coefficient, Relative strength, Spread). A series is
 // opened on first lookup through the same loaders as a chart (live feed, import or symbol math) at the interval asked for; its
 // updates recalculate those indicators. At most SECOND_SYMBOL_FEEDS stay open (least recently used closes first). A failed open
 // is retried after SECOND_SYMBOL_RETRY_MS (the Alpaca key status can arrive after the workspace). A feed opens
 // SECOND_SYMBOL_DELAY_MS after its first lookup, and not at all when a newer lookup extends or shortens its text, so typing
 // SPY in the Symbol field never streams S and SP (each would count toward the Alpaca limit). Limits.
 useEffect(()=>{
  // Layout windows load second-symbol series too (their feeds count toward the shared Alpaca cap in main).
  const SECOND_SYMBOL_FEEDS=8,SECOND_SYMBOL_RETRY_MS=15000,SECOND_SYMBOL_DELAY_MS=600;
  const SCRIPT_DEMAND_SWEEP_MS=30000;
  // `typed` feeds come from the indicator Symbol field (a newer lookup can supersede them while typing);
  // `script` feeds were requested by a script (declared statically, never superseded) and also recalculate scripts.
  type SecondFeed={symbol:string;resolution:string;handle:LiveHandle|null;error:string|null;failedAt:number;off:()=>void;used:number;created:number;timer:ReturnType<typeof setTimeout>|null;typed:boolean;script:boolean;alert:boolean};
  const feeds=new Map<string,SecondFeed>();let tick=0,disposed=false,queued=false,scriptQueued=false;
  const notify=()=>{if(queued||disposed)return;queued=true;queueMicrotask(()=>{queued=false;if(!disposed)notifySecondSymbols();});};
  const notifyScripts=()=>{if(scriptQueued||disposed)return;scriptQueued=true;queueMicrotask(()=>{scriptQueued=false;if(!disposed)notifyScriptRequestData();});};
  const changed=(feed:SecondFeed)=>{notify();if(feed.script)notifyScripts();};
  const drop=(key:string)=>{const feed=feeds.get(key);if(!feed)return;feeds.delete(key);if(feed.timer!==null)clearTimeout(feed.timer);try{feed.off();feed.handle?.close();}catch{/* best effort */}};
  // `alert` feeds were looked up by a technical alert (chart or background): never superseded, kept by the
  // saved alerts that read them (alertSecondSymbolDemand) and by a lease per lookup (leasedAlertSecondSymbolKeys).
  const lookup=(symbol:string,resolution:string,typed:boolean,alert=false):SecondFeed=>{
   const key=symbol+'\u0000'+resolution;let feed=feeds.get(key);
   if(feed&&feed.error&&Date.now()-feed.failedAt>SECOND_SYMBOL_RETRY_MS){drop(key);feed=undefined;}
   if(!feed){
    const opened:SecondFeed={symbol,resolution,handle:null,error:null,failedAt:0,off:()=>{},used:++tick,created:tick,timer:null,typed,script:!typed&&!alert,alert};feeds.set(key,opened);
    while(feeds.size>SECOND_SYMBOL_FEEDS){let oldest:string|null=null,at=Infinity;for(const [id,row] of feeds)if(row.used<at&&id!==key){oldest=id;at=row.used;}if(oldest===null)break;drop(oldest);}
    opened.timer=setTimeout(()=>{opened.timer=null;if(disposed||feeds.get(key)!==opened)return;
     const superseded=opened.typed&&!opened.script&&!opened.alert&&[...feeds.values()].some(row=>row!==opened&&row.typed&&row.created>opened.created&&row.resolution===resolution&&!row.handle&&(row.symbol.startsWith(symbol)||symbol.startsWith(row.symbol)));
     if(superseded){drop(key);return;}
     try{const handle=isSymbolMathText(symbol,s=>symbolMathHooks.current?.known(s)??false)?liveProviderFor(SYMBOL_MATH_PROVIDER_ID)!.open(symbol,resolution):openComponentFeed(symbol,resolution);opened.handle=handle;opened.off=handle.onChange(()=>changed(opened));}
     catch(cause){opened.error=cause instanceof Error?cause.message:String(cause);opened.failedAt=Date.now();}
     changed(opened);},SECOND_SYMBOL_DELAY_MS);
    feed=opened;
   }
   feed.used=++tick;if(typed)feed.typed=true;else if(alert)feed.alert=true;else feed.script=true;
   return feed;
  };
  setSecondSymbolLoader({series(symbol,resolution){
   const feed=lookup(symbol,resolution,true);
   if(feed.error)return{bars:null,state:'unavailable',message:feed.error};
   if(!feed.handle)return{bars:null,state:'loading',message:symbol+' is loading.'};
   const data=feed.handle.dataset();
   return data.bars.length?{bars:data.bars,state:'ready',message:null}:{bars:null,state:'loading',message:symbol+' is loading ('+data.provenance.state+').'};
  },alertSeries(symbol,resolution){
   // An alert reads only a settled series (a feed still connecting or backfilling is loading), with its
   // live and forming facts, so it never evaluates on partial data (second-symbol-alerts.ts).
   const feed=lookup(symbol,resolution,false,true);
   if(feed.error)return{bars:null,state:'unavailable',message:feed.error};
   if(!feed.handle)return{bars:null,state:'loading',message:symbol+' is loading.'};
   const data=feed.handle.dataset();
   if(!data.bars.length||data.provenance.state==='loading')return{bars:null,state:'loading',message:symbol+' is loading.'};
   return{bars:data.bars,state:'ready',message:null,live:isLiveDatasetId(data.provenance.datasetId),formingTime:feed.handle.formingTime()};
  }});
  // Script requests (ctx.request) read the same feeds, with the dataset itself for its provenance.
  const uninstallScriptLoader=installScriptSymbolLoader((symbol,resolution)=>{
   if(disposed){uninstallScriptLoader();return{state:'unavailable',message:symbol+' is not loaded. Requested symbols load in the main chart window.',dataset:null};}
   const feed=lookup(symbol,resolution,false);
   if(feed.error)return{state:'unavailable',message:feed.error,dataset:null};
   if(!feed.handle)return{state:'loading',message:symbol+' is loading.',dataset:null};
   const data=feed.handle.dataset();
   return data.bars.length?{state:'ready',message:null,dataset:data}:{state:'loading',message:symbol+' is loading ('+data.provenance.state+').',dataset:null};
  });
  secondSymbolAlpaca.current=()=>[...feeds.values()].filter(row=>!!row.handle&&row.handle.datasetId.startsWith('live:'+ALPACA_IEX_PROVIDER_ID+':')).map(row=>row.symbol);
  // A feed no indicator on the charts uses any more closes (secondSymbolDemand), not only on eviction.
  // Nor any chart script (scriptRequestDemand) or recent script alert or editor run (leasedScriptRequestKeys).
  secondSymbolPrune.current=keep=>{for(const key of [...feeds.keys()])if(!keep.has(key))drop(key);};
  const pruneUnused=secondSymbolPrune.current;secondSymbolPrune.current=keep=>pruneUnused(new Set([...keep,...scriptRequestDemand(current.current.grid),...leasedScriptRequestKeys(),...alertSecondSymbolDemand(financial.current.alerts),...leasedAlertSecondSymbolKeys()]));
  secondSymbolPrune.current(secondSymbolDemand(current.current.grid));
  // Leases expire without a grid change, so script-only feeds are swept too (indicator feeds keep the grid-change rule).
  const sweep=setInterval(()=>{if(disposed){clearInterval(sweep);return;}const wanted=new Set([...secondSymbolDemand(current.current.grid),...scriptRequestDemand(current.current.grid),...leasedScriptRequestKeys(),...alertSecondSymbolDemand(financial.current.alerts),...leasedAlertSecondSymbolKeys()]);for(const [key,feed] of [...feeds])if((feed.script||feed.alert)&&!feed.typed&&!wanted.has(key))drop(key);},SCRIPT_DEMAND_SWEEP_MS);
  // The sweep and the script loader retire themselves once disposed (the cleanup below is unchanged).
  return()=>{disposed=true;secondSymbolPrune.current=()=>{};setSecondSymbolLoader(null);for(const key of [...feeds.keys()])drop(key);};
 },[secondaryWindow]);
 useEffect(()=>{secondSymbolPrune.current(secondSymbolDemand(workspace.grid));},[workspace.grid]);
 function openAlertEdit(id:string){setAlertCreateRequest({editId:id});setDialog('alerts');}
 function openAlertCreate(){const creation=replayAlertCreation(replaySessionRef.current,'ordinary');if(!creation.allowed){setMessage(creation.reason);return;}setAlertCreateRequest({});setDialog('alerts');}
 /** Legend More "Add alert on ...": the same entry as the toolbar, preset to the indicator's first plot (alert catalog id indicator:<instance>:<plot>). */
 function openIndicatorAlert(row:IndicatorInstanceView){const creation=replayAlertCreation(replaySessionRef.current,'ordinary');if(!creation.allowed){setMessage(creation.reason);return;}const plot=indicatorPlotIds[row.kind]?.[0];setAlertCreateRequest(plot?{sourceId:'indicator:'+row.id+':'+plot}:{});setDialog('alerts');}
 /** Add alert on one drawing (context menu, edit bar, Alt+A), prefilled with that drawing (alert source drawing:<id>). */
 function openDrawingAlert(id:string){const creation=replayAlertCreation(replaySessionRef.current,'ordinary');if(!creation.allowed){setMessage(creation.reason);return;}setAlertCreateRequest({sourceId:'drawing:'+id});setDialog('alerts');}
 function closeShellMenu(focusTrigger:boolean){const open=shellMenuOpen;setShellMenuOpen(null);if(focusTrigger&&open&&typeof document!=='undefined')document.getElementById?.(open==='main'?'lv-main-menu-trigger':'lv-calendar-menu-trigger')?.focus?.();}
 function toggleLayoutSetup(button:HTMLElement|null){if(layoutSetup){setLayoutSetup(null);return;}const box=button?.getBoundingClientRect?.(),width=typeof window!=='undefined'&&typeof window.innerWidth==='number'?window.innerWidth:0;setLayoutSetup({right:box&&width?Math.max(4,width-box.right):4});}
 function closeLayoutSetup(focusTrigger:boolean){if(!layoutSetup)return;setLayoutSetup(null);if(focusTrigger)layoutSetupButton.current?.focus?.();}
 /** Chart Settings Ok as ONE transaction. Every changed part (appearance, document, chart type settings, time zone,
  * price scale) is validated first and then written by a single workspace commit, which is one undo step. The grid
  * publishes the committed cell to the renderer. Any refusal writes nothing and leaves the dialog open with its values.
  * Exception: turning "Lock price to bar ratio" on makes the price scale manual, which must be saved with the
  * frame and auto flag. So, after validation, that row runs first as the chart's own price-scale lock action (its frame
  * gesture writes frame, auto=false and the lock together, as the price-scale menu does); the rest of the Ok is then
  * one commit built on the workspace those writes produced. A refused lock refuses the whole Ok before any write; if
  * the final commit is refused after an accepted lock, the lock stays as its own consistent undo step. */
 /** Price scale settings of an Ok, with the lock-ratio request resolved against the live chart. */
 function settingsPriceScale(opening:Workspace,id:string,change:ChartSettingsCommit):PriceScaleSettings|undefined{
  let priceScale=change.priceScale?validatePriceScaleSettings(change.priceScale):undefined;
  if(priceScale?.lockRatio){
   const live=activeController.current,locked=live?readChartValue(()=>live.priceScale.settings().lockRatio):opening.grid!.cells[id].priceScale?.lockRatio===true;
   if(!locked){
    if(!live)throw new Error('The price to bar ratio can be locked only while the chart is open.');
    const result=live.priceScale.execute('lockRatio',{origin:'toolbar'});if(!result.ok)throw new Error(result.message??'The price to bar ratio could not be locked.');
    priceScale={...priceScale,lockRatio:true,ratio:live.priceScale.settings().ratio};
   }
  }
  return priceScale;
 }
 /** The workspace patch of one Ok. `lease` carries the chart-owned fields (type settings book, chart options) already applied by the frame-safe path. */
 function buildSettingsPatch(before:Workspace,id:string,themeId:string,appearance:ChartAppearance,change:ChartSettingsCommit,priceScale:PriceScaleSettings|undefined,lease?:Partial<Workspace>):Partial<Workspace>{
  const fields:Partial<Workspace>={themeId,appearance:normalizeAppearance(serializeAppearance(appearance))};
  if(change.document)fields.chartSettings=restoreChartSettingsDocument(structuredClone(change.document));
  if(lease)Object.assign(fields,lease);
  else{
   if(change.timezone!==undefined){const options={...before.chartOptions,timezone:change.timezone};validateChartOptions(options);fields.chartOptions=options;}
   if(change.typeSettings){
    if(change.typeSettings.style!==before.chartStyle)throw new Error('The chart type changed while the settings were open. Reopen the settings.');
    validateTypeSettings(change.typeSettings.style,change.typeSettings.settings);
    const book:ChartSettingsBook={...(before.chartTypeSettings??{}),[change.typeSettings.style]:structuredClone(change.typeSettings.settings)};validatedSettingsBook(book);fields.chartTypeSettings=book;
   }
  }
  if(!priceScale)return fields;
  const next=patchWorkspace(before,fields);
  return{...(fields.chartSettings?{chartSettings:fields.chartSettings}:{}),...(lease?{themeId}:{}),grid:{...next.grid,cells:{...next.grid.cells,[id]:{...next.grid.cells[id]!,priceScale}}}};
 }
 /** Ok. Chart type and scale type changes go through the configuration-edit lease with frame fingerprints (async); everything else commits at once. */
 function applyChartSettings(themeId:string,appearance:ChartAppearance,change:ChartSettingsCommit):boolean|Promise<boolean>{
  // The One-click row is the paper account's switch; an Ok that changes it sets the account the chart trades.
  const linked=secondaryWindow?null:oneClickChangeOf(change.document,(replay?currentReplayPaper.current:financial.current.paper)?.settings.oneClick);
  const link=(ok:boolean)=>{if(ok&&linked!==null&&paperAction((account,now)=>configurePaperAccount(account,{oneClick:linked},now)))setMessage(oneClickStatus(linked));return ok;};
  if(change.typeSettings||change.chartOptions)return applyChartSettingsFrameSafe(themeId,appearance,change).then(link);
  try{
   assertDialogContext();
   const opening=current.current,id=opening.grid?.layout.activeCellId;
   if(!opening.grid||!id||!opening.grid.cells[id])throw new Error('The active chart changed while the settings were open. Reopen the settings.');
   const priceScale=settingsPriceScale(opening,id,change);
   buildSettingsPatch(opening,id,themeId,appearance,change,priceScale);
   if(!commit(buildSettingsPatch(current.current,id,themeId,appearance,change,priceScale)))return false;
   stackIndicatorScales(opening.grid.cells[id]!.priceScale,priceScale);
   setPreview(null);closeDialog();setMessage('Settings applied.');return link(true);
  }catch(cause){reportFailure(cause);return false;}
 }
 async function applyChartSettingsFrameSafe(themeId:string,appearance:ChartAppearance,change:ChartSettingsCommit):Promise<boolean>{
  assertDialogContext();
  const target=chart,opening=settingsOpening.current,start=current.current,id=start.grid?.layout.activeCellId;
  if(!target||!opening||opening.controller!==target||activeController.current!==target||!start.grid||!id||!start.grid.cells[id])throw new Error('The chart changed while the settings were open. Reopen the settings.');
  const fingerprints=dialogFrameFingerprints;if(!fingerprints)throw new Error('Chart frame settings are still loading. Try again in a moment.');
  if(change.typeSettings){
   if(change.typeSettings.style!==opening.style)throw new Error('The chart type changed while the settings were open. Reopen the settings.');
   validateTypeSettings(change.typeSettings.style,change.typeSettings.settings);
  }
  const timezone=change.timezone;
  let options:ChartOptions|undefined;
  if(change.chartOptions){options={...target.getChartOptions(),...change.chartOptions,...(timezone!==undefined?{timezone}:{})};validateChartOptions(options);}
  const priceScale=settingsPriceScale(start,id,change),expected={source:opening.source,style:opening.style},errors:string[]=[];
  const withZone=(value:ChartOptions):ChartOptions=>timezone===undefined?value:{...value,timezone};
  let applied=false;
  if(change.typeSettings){
   const lease=await target.prepareConfigurationEdit({kind:'type',style:change.typeSettings.style,settings:change.typeSettings.settings,calculationFingerprints:fingerprints,expected});
   const outcome=await publishConfigurationEdit(lease,result=>{
    assertDialogContext(false);
    const dialogAppearanceChanged=change.changed.includes('appearance');
    const base=buildSettingsPatch(current.current,id,themeId,appearance,change,priceScale,{chartTypeSettings:result.book,chartOptions:withZone(change.chartOptions?current.current.chartOptions:result.chartOptions),...(!dialogAppearanceChanged&&result.appearance?{appearance:normalizeAppearance(result.appearance)}:{})});
    return applyChartConfiguration(base,result.frame,result.openingFrame);
   });
   errors.push(...outcome.publicationErrors);applied=true;
  }
  if(options){
   try{
    const lease=await target.prepareConfigurationEdit({kind:'options',options,calculationFingerprints:fingerprints,expected});
    const outcome=await publishConfigurationEdit(lease,result=>{
     assertDialogContext(false);
     if(applied)return applyChartConfiguration({chartOptions:result.chartOptions},result.frame,result.openingFrame);
     return applyChartConfiguration(buildSettingsPatch(current.current,id,themeId,appearance,change,priceScale,{chartOptions:result.chartOptions}),result.frame,result.openingFrame);
    });
    errors.push(...outcome.publicationErrors);
   }catch(cause){
    if(!applied)throw cause;
    setPreview(null);closeDialog();setMessage('Your chart type changes were applied, but the scale changes were not: '+(cause instanceof Error?cause.message:String(cause)));return true;
   }
  }
  stackIndicatorScales(start.grid?.cells[id]?.priceScale,priceScale);
  setPreview(null);closeDialog();setMessage(errors.length?errors.join('; '):'Settings applied.');return true;
 }
 /** An Ok that changes Scales placement to Stack on the left or on the right also moves every extra indicator
  * scale of the active chart to that side (the main scale follows the saved mainSide). Auto moves nothing. */
 function stackIndicatorScales(before:PriceScaleSettings|null|undefined,after:PriceScaleSettings|null|undefined){
  const next=after?.placement,target=activeController.current;if(!target||!next||next==='auto'||(before?.placement??'auto')===next)return;
  try{target.indicators.stackScales(next);}catch(cause){reportFailure(cause);}
 }
 /** Optional chart reads for dialog defaults: a renderer that cannot answer leaves the row unavailable. */
 function readChartValue<T>(read:()=>T):T|null{try{return read();}catch{return null;}}
 function toggleFullscreen(){void toggleAppFullScreen({bridge:typeof window==='undefined'?null:window.lv,doc:typeof document==='undefined'?null:document,report:setMessage});}
 // What each registry command runs in this window (command-registry.ts); the main menu and Quick search both read it.
 const commandRuns:CommandRuns={
  about:{run:()=>setDialog('about')},'import-data':{run:()=>setDialog('import')},'export-workspace':{run:()=>void exportWorkspace()},'export-bars':{run:()=>void exportBars()},
  'export-image':{run:()=>void exportImage(),disabled:!chart},'copy-image':{run:()=>void copyActiveChartImage(),disabled:!chart},
  'data-sources':{run:()=>loaded?openSettings('datasources'):setDialog('storage')},'local-storage':{run:()=>loaded?openSettings('datasources'):setDialog('storage')},
  ...(typeof window!=='undefined'&&typeof window.lv?.quitApp==='function'?{quit:{run:()=>{void window.lv?.quitApp?.();}}}:{}),
  'symbol-search':{run:()=>openSymbolSearch('','toolbar')},compare:{run:()=>setDialog('compare'),disabled:!chart},'symbol-info':{run:()=>{setSymbolInfoDataset(null);setDialog('symbol-info');}},
  indicators:{run:()=>{indicatorFocus.current=null;indicatorSearch.current=null;setDialog('indicators');},disabled:!chart},'indicator-templates':{run:()=>{setTemplateTab('saved');setDialog('templates');},disabled:!chart},
  'create-alert':{run:()=>openAlertCreate(),disabled:!chart||!loaded},replay:{run:()=>{if(replaySession||replayRefusal||replay)closeReplayPanel();else openReplayPanel();}},
  undo:{run:()=>undo()},redo:{run:()=>redo()},'save-layout':{run:()=>void save(),disabled:!loaded},'open-layouts':{run:()=>setDialog('layouts')},'chart-settings':{run:()=>openSettings()},'app-settings':{run:()=>openSettings('general')},fullscreen:{run:()=>toggleFullscreen()},...(wickMode.available?{'wick-mode':{run:wickMode.enter}}:{}),
  'go-to-date':{run:()=>setDialog('date'),disabled:!chart},'change-interval':{run:()=>{setIntervalTarget(undefined);setDialog('intervals');}},
  'reset-chart-view':{run:()=>priceScaleKey('resetChart'),disabled:!chart},'reset-time-scale':{run:()=>resetTimeScaleKey(workspace.chartSettings.canvas.rightMarginBars),disabled:!chart},
  'table-view':{run:()=>setDialog('table-view'),disabled:!chart},'add-to-watchlist':{run:()=>addChartSymbolToWatchlist(),disabled:!loaded},'keyboard-shortcuts':{run:()=>setDialog('shortcuts')},
  notes:{run:()=>{const active=currentInput.current?.dataset;if(active)openNotes({exchange:active.instrument.exchange,symbol:active.instrument.symbol,synthetic:active.provenance.fixture},undefined,true);},disabled:!loaded},
  'drawing-manager':{run:()=>indicatorChartAction(()=>setDialog('drawing-manager'),DRAWING_MANAGER_WRITE_WAIT),disabled:!chart},
  watchlist:{run:()=>setRailPanel('watchlist')},'object-tree':{run:()=>{setRailPanel('objects');setObjectTreeTab('object_tree');}},'data-window':{run:()=>{setRailPanel('objects');setObjectTreeTab('data-window');}},'alerts-panel':{run:()=>setRailPanel('alerts')},
  'paper-trading':{run:()=>setPaperDockOpen(true)},screener:{run:()=>setDialog('screener')},'script-editor':{run:()=>{if(scriptDocked)changeBottomPanel(view=>openBottomTab(view,'script'));else setDialog('script');}},calendar:{run:()=>{setCalendarEntry(null);setDialog('calendar');}},
  news:{run:()=>setDialog('news')},fundamentals:{run:()=>{setFundamentalsMarket(null);setDialog('fundamentals');}},heatmap:{run:()=>setDialog('heatmap')},portfolio:{run:()=>setDialog('portfolio')},markets:{run:()=>setDialog('markets')},strategy:{run:()=>openStrategyTester()},
 };
 keyCommandRuns.current=commandRuns;
 extraKeyRun.current=action=>{
  if(action==='first-bar'){const first=bars[0];if(!chart||!first){setMessage('There is no chart to move.');return;}try{const view=chart.getViewport();if(!view){setMessage('The chart has no visible range yet.');return;}const moved=chart.goToDate(first.time+(view.to-view.from)/2);if(!moved.ok)setMessage(moved.diagnostic.message);}catch(error){setMessage(error instanceof Error?error.message:String(error));}return;}
  if(action==='switch-session'){const button=document.querySelector<HTMLButtonElement>('[data-name="'+BOTTOM_SESSION.dataName+'"]');if(!button||button.disabled)setMessage(button?.title||'This chart has no extended trading hours to switch.');else button.click();return;}
  if(action==='toggle-dom'){const domTab=()=>[...document.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(node=>node.textContent==='DOM')??null;
   if(bottomView.tab==='trading'&&domTab()?.getAttribute('aria-selected')==='true'){setPaperDockOpen(false);return;}
   setPaperDockOpen(true);let tries=0;const pick=()=>{const tab=domTab();if(tab){tab.click();return;}if(++tries<20)window.setTimeout(pick,50);};window.setTimeout(pick,0);return;}
  const detail:{side:'buy'|'sell';handled:boolean;result?:{ok:boolean;message?:string}}={side:action==='limit-buy-at-cursor'?'buy':'sell',handled:false};
  window.dispatchEvent(new CustomEvent('lv:cursor-order',{detail}));
  if(!detail.handled)setMessage('Move the pointer over the price chart first.');else if(detail.result&&!detail.result.ok&&detail.result.message)setMessage(detail.result.message);
 };
 const MAIN_MENU_ICONS:Partial<Record<AppCommandId,typeof InfoIcon>>={about:InfoIcon,'import-data':ImportIcon,'export-workspace':ExportIcon,'export-bars':ExportIcon,'export-image':SnapshotIcon,'data-sources':SettingsIcon,'local-storage':StorageIcon};
 const mainMenuItems:ShellMenuItem[]=commandMenuRows(MAIN_MENU_LAYOUT,commandRuns).map(row=>row==='separator'?row:{label:row.label,onSelect:row.onSelect,...(row.disabled?{disabled:true}:{}),...(MAIN_MENU_ICONS[row.id]?{icon:MAIN_MENU_ICONS[row.id]}:{})});
 /** The copy half of the snapshot keys (Alt+S, Quick search "Copy chart image"); the same composite the chart menu copies. */
 async function copyActiveChartImage(){if(!chart){setMessage('There is no chart to copy.');return;}const copied=await copyChartImage({render:()=>chart.exportChartImage({overlay:chartSnapshotOverlay(),footer:snapshotFooter()}),datasetId:dataset.provenance.datasetId,bridge:window.lv});setMessage(copied.message);}
 /** Runs a Quick search row after the palette closed, through the same route its menu, toolbar or dialog uses. */
 function runQuickSearchItem(row:QuickSearchItem){
  try{const run=row.run;
   switch(run.kind){
    case 'command':{const entry=commandRuns[run.id];if(!entry||entry.disabled){setMessage(row.label+' is not available right now.');return;}entry.run();return;}
    case 'symbol':{/* Quick search records the departed symbol in recents, as symbol search does. */const from=dataset.instrument.symbol;if(openSymbolRequest(switchRequest(run.candidate,'entry'))){rememberDepartedSymbol(recentStorage(),from,run.candidate.symbol);rememberRecentSymbol(recentStorage(),run.candidate.symbol);}else openSymbolSearch(run.candidate.symbol,'entry');return;}
    case 'symbol-search':openSymbolSearch(run.query,'entry');return;
    case 'indicator':{if(!chart)return;indicatorFocus.current=null;setDialog('indicators');indicatorSearch.current={authority:dialogAuthority.current,query:run.name,active:run.id};return;}
    case 'drawing':armTool(run.tool);return;
    case 'drawing-mode':changeDrawingMode(run.mode);return;
    case 'interval':favoriteInterval(run.id);return;
    case 'chart-type':changeChartStyle(run.id);return;
    case 'layout':{if(workspace.layoutLibrary?.activeId===run.id){setMessage('That layout is already open.');return;}void layoutAction({kind:'open',id:run.id},'menu').catch(error=>{setDialog('layouts');reportFailure(error);});return;}
    case 'settings':openSettings(run.tab);return;
   }
  }catch(error){reportFailure(error);}
 }
 const calendarMenuItems:ShellMenuItem[]=([['economic','Economic'],['earnings','Earnings and revenue'],['dividend','Dividends'],['ipo','IPO']] as const).map(([kind,label])=>({label,onSelect:()=>{setCalendarEntry({kind,nonce:crypto.randomUUID()});setDialog('calendar');}}));
 // The object tree reads the chart identity, the indicator rows and the scale readers it calls while
 // rendering; the props object is kept while none of them changed (the data window beside it follows every tick).
 // A workspace Undo/Redo reloads the chart's drawings through loadDrawings, which publishes no drawing change
 // (ObjectTreePanel.tsx re-reads them when it renders). The active cell's saved drawing document changes with every such
 // restore, so it is a dependency: the kept tree is rebuilt then, and still kept across live ticks.
 const objectTreeDrawings=workspace.grid?.cells[workspace.grid.layout.activeCellId]?.drawings;
 // The alert ids whose expiration has passed on the clock. AlertsDock reads now() while rendering, and
 // WorkspaceAlerts publishes an expiration only while it is not suspended, so the kept dock is rebuilt when this changes.
 const alertExpiriesPassed=(rows:readonly LocalAlert[])=>{const now=Math.floor(Date.now()/1000);return rows.filter(row=>row.definition.expiresAt!==null&&row.definition.expiresAt<=now).map(row=>row.definition.id).join('|');};
 // Every Object tree drawing edit waits for a routine background autosave (queueDrawingEdit). A function member
 // is forwarded by the kept props object, so the dependency list below is unchanged.
 const objectTreeDeferEdit=(run:()=>void,targets:ObjectTreeEditTargets)=>queueDrawingEdit(run,targets,chart);
 const keepObjectTree=<T extends {indicators?:readonly IndicatorInstanceView[];indicatorScale?:(row:IndicatorInstanceView)=>unknown},>(input:T):T=>{const tree={...input,deferDrawingEdit:objectTreeDeferEdit};let scales:string|null=null;try{scales=JSON.stringify((tree.indicators??[]).map(row=>tree.indicatorScale?.(row)??null));}catch{scales=null;}return surfaceProps('rail:object-tree',tree,[scales,objectTreeDrawings]);};
  const invalidDrawingNotes=alertDrawingNotesForOwner(gridHost,alerts,instrumentId=>savedDrawingsForInstrument(workspace,instrumentId));
  const railPanels:RailPanelSlot[]=[
  {id:'watchlist',label:'Watchlist',heading:'',icon:RailWatchlistIcon,title:'Watchlist',render:()=>reuse('rail:watchlist',<WatchQuotesBinding store={liveData} universe={shownUniverse} quotesProp="quoteDatasets" notesProp="liveNotes">{reuse('rail:watchlist-panel',<WatchlistPanel onOpenDataSources={demoDataMode()!=='legacy'&&!alpacaKeyConfigured?()=>openSettings('datasources'):undefined} currentMarket={dataset.instrument.exchange+':'+dataset.instrument.symbol} fundamentalsFor={fundamentalsFor} onOpenFundamentals={market=>{setFundamentalsMarket(market);setDialog('fundamentals');return true;}} onOpenSymbolInfo={market=>{const found=symbolInfoUniverse.current.find(row=>row.instrument.exchange===market.exchange&&row.instrument.symbol===market.symbol&&row.provenance.fixture===market.synthetic);if(!found)return false;setSymbolInfoDataset(found);setDialog('symbol-info');return true;}} onAdvanced={openAdvanced} onHotlists={openHotlists} onNotes={openNotes} onListAlert={openListAlert} onSymbolAlert={openSymbolAlert} listAlertDisabled={(workspace.listAlerts?.length??0)>=LIST_ALERT_LIMITS.alerts?'A workspace holds at most 20 list alerts.':null} liveSources={exampleBook?undefined:{stocks:alpacaKeyConfigured,crypto:liveChoices.coinbase}} book={exampleBook??workspace.watchBook} datasets={shownUniverse} onChange={watchBook=>{/* The example list lives only in example mode and is never saved. */if(exampleBook){setExampleBook(watchBook);return true;}return commit({watchBook,watchlist:watchSymbols(watchBook)});}} onOpen={data=>openWatchRow(data)} onOpenAll={data=>openWatchRow(data,true)}/>,[workspace.fundamentals,workspace.fundamentalsPreferences,utcToday(),exampleBook,alpacaKeyConfigured,liveChoices.coinbase])}</WatchQuotesBinding>)},
  {id:'objects',label:'Object tree and data window',icon:RailObjectTreeIcon,title:'Object tree and data window',heading:'',render:()=>hoverSlot(undefined,()=>{const {validInspection}=hoverReadout();return <ObjectTreeDataWindowWidget tab={objectTreeTab} onTabChange={setObjectTreeTab} objectTree={keepObjectTree({chart,dataset:chartIdentity,seriesVisible:!seriesHidden,onSeriesVisibility:setSeriesVisibility,indicators:indicatorViews,onIndicatorAction:(row,action)=>indicatorChartAction(()=>applyIndicatorLegendAction(row,action==='remove')),onIndicatorMove:(row,where)=>indicatorChartAction(()=>applyIndicatorMove(row,where)),onIndicatorMoveExisting:(row,where)=>indicatorChartAction(()=>applyIndicatorMove(row,where)),onIndicatorReorder:ids=>indicatorChartAction(()=>applyIndicatorOrder(ids)),onIndicatorMovePane:(row,target)=>indicatorChartAction(()=>applyIndicatorPaneMove(row,target)),onIndicatorCopied:setMessage,onSeriesAlert:()=>{const run=commandRuns['create-alert'];if(run&&!run.disabled)run.run();else setMessage(SERIES_REASONS.busy);},onSeriesAddIndicator:()=>{indicatorFocus.current=null;setDialog('indicators');},onSeriesSymbolInfo:()=>{setSymbolInfoDataset(null);setDialog('symbol-info');},onSeriesTableView:()=>{const run=commandRuns['table-view'];if(run&&!run.disabled)run.run();else setMessage(SERIES_REASONS.busy);},onSeriesSettings:()=>openSettings('symbol'),onAddIndicatorAlert:id=>treeIndicatorRow(id,openIndicatorAlert),onAddChildIndicator:id=>treeIndicatorRow(id,openIndicatorsOn),onFavoriteIndicator:id=>treeIndicatorRow(id,row=>legendMoreAction(row,'favorite')),isFavoriteIndicator:id=>{const row=indicatorViews.find(item=>item.id===id);return !!row&&current.current.indicatorLibrary.favorites.includes(row.kind);},onSeriesPinToScale:side=>{if(!chart||readSeriesSide()===side)return;const result=chart.priceScale.execute(side==='left'?'moveLeft':'moveRight',{origin:'chart-pointer'});if(!result.ok&&result.message)setMessage(result.message);},seriesScaleSide:readSeriesSide,onRemoveObjects:request=>applyObjectTreeRemoval(request),onOpenIndicatorSettings:(id,tab)=>{setDialog('indicators');indicatorFocus.current=indicatorSettingsFocus(dialogAuthority.current,id,tab==='visibility'?'Visibility':undefined);},onIndicatorScale:(row,placement)=>indicatorChartAction(()=>applyIndicatorScale(row,placement)),indicatorScale:row=>({current:scaleOf(row),sides:scaleSides(),choices:scaleChoicesOf(row)}),onOpenDrawingSettings:(id,tab)=>{setSelectedDrawing(id);const priorAuthority=dialogAuthority.current;setDialog('drawing');if(tab==='visibility'&&dialogAuthority.current!==priorAuthority)routeDrawingDialogTab(dialogAuthority.current,'Visibility');},onManageDrawings:chart?()=>indicatorChartAction(()=>setDialog('drawing-manager'),DRAWING_MANAGER_WRITE_WAIT):undefined,onDrawingsChanged:captureDrawings,onError:setMessage})} dataWindow={gridHoverStore(gridHost).feed({chart,dataset,bars:calculationBars,sourceBars:bars,inspection:validInspection,indicators:indicatorViews,timezone:shownTimeZone,timeHours:shownTimeHours,dateFormat:workspace.chartSettings.scales.dateFormat},workspace.grid,universe,appPreferences.defaultChartTimezone)}/>;})},
 {id:'alerts',label:'Alerts',icon:RailAlertsIcon,title:'Alerts',extra:reuse('rail:alerts-counter',<AlertsUnreadCounter alerts={alerts} listAlerts={workspace.listAlerts}/>),render:()=>reuse('rail:alerts',<AlertsDock alerts={alerts} activeInstrumentId={dataset.instrument.id} unwatched={unwatchedAlerts} invalidDrawings={invalidDrawingNotes} timezone={shownTimeZone} timeHours={shownTimeHours} now={()=>Math.floor(Date.now()/1000)} onAlertsChange={(next,expected)=>ownedFinancial.setAlerts(next,expected)} onCreate={openAlertCreate} onEdit={openAlertEdit} onJumpToTrigger={jumpToAlertTrigger} listAlertLog={listAlertLogEntries(workspace.listAlerts??[])} onClearListAlertLog={clearListAlertLog} listAlerts={reuse('rail:alerts-list',<ListAlertsGroup alerts={workspace.listAlerts??[]} book={workspace.watchBook} onPause={(id,paused)=>listAlertAction(id,paused?'pause':'resume')} onRemove={id=>listAlertAction(id,'remove')} onRestart={id=>listAlertAction(id,'restart')} onEdit={id=>{openListAlertEdit(id);}}/>,[],['alerts'])}/>,[alertExpiriesPassed(alerts)],['listAlertLog'])},
 ];
 const activeRailPanel=railPanels.find(row=>row.id===railPanel&&!(secondaryWindow&&PRIMARY_ONLY_PANELS.has(row.id)))??null;
 const railTopActions:RailActionSlot[]=[
 ];
 /** The rail opens these as modals but stays clickable above their shade (data-lv-rail-dialog), so a second press of
  the same button closes its dialog, as it does for the docked panels. */
 const railDialog=(id:string,open:()=>void)=>{if(dialog===id){closeDialog();return;}open();};
 const railBottomActions:RailActionSlot[]=[
  {id:'screener',label:'Stock screener',icon:RailScreenerIcon,pressed:dialog==='screener',onSelect:()=>railDialog('screener',()=>setDialog('screener'))},
  {id:'script',label:'Script editor',icon:RailScriptEditorIcon,onSelect:()=>{if(scriptDocked)changeBottomPanel(view=>selectBottomTab(view,'script'));else setDialog('script');}},
  {id:'calendar',label:'Calendar',icon:RailCalendarIcon,pressed:dialog==='calendar',onSelect:()=>railDialog('calendar',()=>{setCalendarEntry(null);setDialog('calendar');}),extra:<><button type="button" className="lv-rail-arrow" id="lv-calendar-menu-trigger" aria-label="Open calendar views" title="Calendar views" aria-haspopup="menu" aria-expanded={shellMenuOpen==='calendar'} aria-controls="lv-calendar-menu" onClick={()=>setShellMenuOpen(shellMenuOpen==='calendar'?null:'calendar')}><ChevronFlyoutIcon/></button>{shellMenu({id:'lv-calendar-menu',label:'Calendar views',open:shellMenuOpen==='calendar',items:calendarMenuItems,onClose:closeShellMenu,menuRef:calendarMenuRef,triggerId:'lv-calendar-menu-trigger',className:'lv-rail-menu'})}</>},
  {id:'news',label:'News and filings',icon:RailNewsIcon,pressed:dialog==='news',onSelect:()=>railDialog('news',()=>setDialog('news'))},
  {id:'fundamentals',label:'Fundamentals',icon:RailFundamentalsIcon,pressed:dialog==='fundamentals',onSelect:()=>railDialog('fundamentals',()=>{setFundamentalsMarket(null);setDialog('fundamentals');})},
  {id:'heatmap',label:'Heatmap',icon:RailHeatmapIcon,pressed:dialog==='heatmap',onSelect:()=>railDialog('heatmap',()=>setDialog('heatmap'))},
  {id:'markets',label:'Markets',icon:RailMarketsIcon,pressed:dialog==='markets',onSelect:()=>railDialog('markets',()=>setDialog('markets'))},
  {id:'portfolio',label:'Portfolio',icon:RailPortfolioIcon,pressed:dialog==='portfolio',onSelect:()=>railDialog('portfolio',()=>setDialog('portfolio'))},
  {id:'strategy',label:'Strategy tester',icon:RailStrategyIcon,onSelect:()=>{if(strategyDocked)changeBottomPanel(view=>selectBottomTab(view,'strategy'));else setDialog('strategy');}},
  /* A second press closes the Trading panel, like the other rail buttons. */{id:'paper',label:'Paper trading',icon:RailPaperTradingIcon,pressed:bottomView.open&&bottomView.tab==='trading',onSelect:()=>setPaperDockOpen(!(bottomView.open&&bottomView.tab==='trading'))},
  // Help (the last right sidebar button) with the Keyboard shortcuts reference (Ctrl+/).
  {id:'help',label:'Help',icon:RailHelpIcon,pressed:shellMenuOpen==='help',onSelect:()=>setShellMenuOpen(shellMenuOpen==='help'?null:'help'),extra:shellMenu({id:'lv-help-menu',label:'Help',open:shellMenuOpen==='help',items:[{label:'Keyboard shortcuts',onSelect:()=>setDialog('shortcuts')},{label:'Version and license',onSelect:()=>setDialog('about')},...(!secondaryWindow&&typeof window!=='undefined'&&typeof window.lv?.reportStuck==='function'?[{label:'Report where you got stuck',onSelect:()=>{/* Main opens its fixed GitHub issue form in the browser. */void window.lv!.reportStuck!().then(result=>{if(!result.ok)setMessage('The issue form could not be opened. '+result.error.message);},reportFailure);}}]:[])],onClose:focus=>{setShellMenuOpen(null);if(focus)(document.querySelector?.('[data-rail-item="help"] button') as HTMLElement|null)?.focus?.();},menuRef:node=>{/* .lv-popup-menu is fixed, so the rail offset put the menu off screen; open it beside the Help button, bottom-aligned. */if(node&&!node.hidden)try{const box=(node.parentElement?.querySelector?.('.lv-rail-button') as HTMLElement|null)?.getBoundingClientRect?.(),view=node.ownerDocument?.defaultView;if(box&&view)Object.assign(node.style,{position:'fixed',top:'auto',left:'auto',right:Math.max(4,view.innerWidth-box.left+6)+'px',bottom:Math.max(8,view.innerHeight-box.bottom)+'px'});}catch{/* Keep the stylesheet placement. */}if(node&&!node.hidden&&!node.contains(document.activeElement))focusFirstMenuItem(node);},className:'lv-rail-menu'})},
 ];

 const indicatorLabels=indicatorInstanceLabels(indicatorViews);
 const barsPatternFetch=useMemo(()=>{
  const lv=window.lv,coinbase=liveChoices.coinbase&&lv?.fetchCoinbaseCandles?lv as unknown as CoinbaseBridge:null,alpaca=alpacaKeyConfigured&&lv?.fetchAlpacaBars?lv as unknown as AlpacaBridge:null;
  return coinbase||alpaca?barsPatternSpanFetcher({coinbase,alpaca}):null;
 },[liveChoices.coinbase,alpacaKeyConfigured]);
 const barsPatternData:BarsPatternData={datasets:universe,policy:workspace.intervals.policy,asOf:replaySession&&replay&&replay.runId===replaySession.runId?replaySession.clock:null,fetchSpan:replay?null:barsPatternFetch};
 // Crosshair-dependent reads, computed once per hover/inspection change (version) inside HoverSlot children.
 const readHover=()=>{const inspection=hoverInspection.inspection;
 const validInspection=syncedLegendInspection(matchingInspection(inspection,bars,source,workspace.chartStyle),calculationBars,bars,workspace.chartStyle,legendGhostTime(workspace.grid,gridHoverStore(gridHost).hover)),headerBar=validInspection?.displayed.bar??calculationBars.at(-1),headerPrevious=calculationBars[(validInspection?.displayed.index??calculationBars.length-1)-1],headerChange=chartHeaderChange(headerBar,headerPrevious);
 // Series status line and indicator legend from the status-line and legend models (status-line-model, legend-model).
 const statusLine=statusLineParts(shownSettings.statusLine,{symbol:workspace.symbol,name:dataset.instrument.name,exchange:displayExchange(dataset.instrument.exchange),interval:chartIntervalText(workspace.chartStyle,workspace.chartTypeSettings,shortIntervalText(dataset.resolution))},headerBar?{time:headerBar.time,open:headerBar.open,high:headerBar.high,low:headerBar.low,close:headerBar.close,volume:headerBar.volume}:null,headerPrevious??null,indicatorViews.map(row=>({id:row.id,acronym:indicatorAcronyms[row.kind],arguments:indicatorLegendArguments(row.kind,row.inputs,instance=>indicatorLabels.get(instance)??null,{calendar:sourcePivotCalendar(dataset.instrument.assetClass,dataset.instrument.timezone)??null})})),{legendVisible,indicatorValues:appearance.indicatorValuesVisible!==false,format:statusLinePriceFormat(shownSettings.symbol.precision,dataset.instrument.tickSize,isSymbolMathDatasetId(dataset.provenance.datasetId)?headerBar?.close??null:null),previousSessionClose:previousSessionClose(calculationBars,validInspection?.displayed.index??calculationBars.length-1,dataset.resolution,workspace.chartOptions.timezone)});
 return{validInspection,headerBar,headerPrevious,headerChange,statusLine};};
 let hoverCache:{version:number;value:ReturnType<typeof readHover>}|null=null;
 const hoverReadout=()=>{const version=hoverInspection.version;if(hoverCache?.version!==version)hoverCache={version,value:readHover()};return hoverCache.value;};
 // The title, interval, exchange, indicator rows, legend toggler and background do not depend on the inspected bar.
 const {statusLine}=hoverReadout();
 const legendReadout=new Map(statusLine.indicators.rows.map(row=>[row.id,row])),statusBackground=statusLineBackground(statusLine);
 // Times outside the canvas (alert log, Go to date, replay start, script logs) follow the active chart's timezone, then the Default chart timezone.
 const shownTimeZone=chartTimeZone(workspace.chartOptions.timezone,{defaultChoice:appPreferences.defaultChartTimezone,instrument:dataset.instrument}),shownTimeHours=workspace.chartSettings.scales.timeHours;
 /** The legend title, Settings and More > Settings open the compact window on this instance. */
 function openIndicatorsOn(row:IndicatorInstanceView){setLegendMenu(null);setDialog('indicators');indicatorFocus.current={authority:dialogAuthority.current,id:row.id,addOn:true};}
 function openIndicatorSettings(row:IndicatorInstanceView,tab?:string){setLegendMenu(null);setDialog('indicators');indicatorFocus.current=indicatorSettingsFocus(dialogAuthority.current,row.id,tab);}
 const scaleOf=(row:IndicatorInstanceView)=>{try{return chart?.chart?readIndicatorScalePlacement(chart.chart,row.rendererId):null;}catch{return null;}};
 const scaleSides=()=>{try{return chart?.chart?indicatorScaleSides(chart.chart):{left:false,none:false};}catch{return{left:false,none:false};}};
 /** The existing extra scales on the row's pane it can share, named by their indicators' legend labels. */
 const scaleChoicesOf=(row:IndicatorInstanceView)=>{try{return chart?.indicators.scaleChoices(row.id,id=>indicatorLabels.get(id)??id)??[];}catch{return [];}};
 /** The Object tree row menu's alert, add-on and favorite items reuse the legend More routes on the live row. */
 function treeIndicatorRow(id:string,run:(row:IndicatorInstanceView)=>void){try{const row=chart?.indicators.list().find(item=>item.id===id);if(!row){setMessage('This indicator is no longer on the chart.');return;}run(row);}catch(error){reportFailure(error);}}
 function legendMoreAction(row:IndicatorInstanceView,id:LegendMoreItemId){
  if(id==='moveTo'||id==='pinToScale'||id==='visualOrder'){setLegendMenu({id:row.id,open:legendMenu?.id===row.id&&legendMenu.open===id?null:id});return;}
  setLegendMenu(null);
  switch(id){
   case 'anchor':beginAnchorPlacement(row.id,false);return;
   case 'alert':openIndicatorAlert(row);return;
   case 'addIndicator':openIndicatorsOn(row);return;
   case 'favorite':try{if(!commit({indicatorLibrary:toggleIndicatorFavorite(current.current.indicatorLibrary,row.kind)}))setMessage('The workspace refused the favorite change.');}catch(error){reportFailure(error);}return;
   case 'intervals':openIndicatorSettings(row,'Visibility');return;
   case 'hide':indicatorChartAction(()=>applyIndicatorLegendAction(row));return;
   case 'remove':indicatorChartAction(()=>applyIndicatorLegendAction(row,true));return;
   case 'objectTree':setRailPanel('objects');setObjectTreeTab('object_tree');return;
   case 'settings':openIndicatorSettings(row);return;
   case 'copy':copyIndicator(row);return;
   default:return;
  }
 }
 function legendSubmenu(row:IndicatorInstanceView,parent:LegendMoreItemId,id:string){
  setLegendMenu(null);
  if(parent==='moveTo'&&(id==='above'||id==='below'||id==='existing-above'||id==='existing-below'))indicatorChartAction(()=>applyIndicatorMove(row,id));
  else if(parent==='pinToScale'){try{const placement=pinToScalePlacement(id);indicatorChartAction(()=>applyIndicatorScale(row,placement));}catch(error){reportFailure(error);}}
  else if(parent==='visualOrder'&&isIndicatorOrderStep(id)){const ids=indicatorOrderAfter(indicatorViews.map(item=>({id:item.id,paneId:item.paneId})),row.id,id);if(ids)indicatorChartAction(()=>applyIndicatorOrder(ids));}
 }
 // Published reasons use the earlier analysis owner; later pane-legend constants are not initialized here.
 const builtinReasonCurrent=legendVisible&&indicatorViews.some(row=>row.visible&&(!row.informationBars||row.diagnostics.length>0&&!row.series.length))&&ownsRenderedAnalysis();
 const legendRow=(row:IndicatorInstanceView)=>{
  const label=indicatorLabels.get(row.id)??indicatorAcronyms[row.kind],readout=legendReadout.get(row.id),suffix=readout?.text?/ #\d+$/.exec(label)?.[0]??'':'',restricted=!!row.presentation?.visibility&&row.presentation.visibility.mode!=='all',menuOpen=legendMenu?.id===row.id;
  const press:Record<string,()=>void>={hide:()=>indicatorChartAction(()=>applyIndicatorLegendAction(row)),intervalSettings:()=>openIndicatorSettings(row,'Visibility'),settings:()=>openIndicatorSettings(row),remove:()=>indicatorChartAction(()=>applyIndicatorLegendAction(row,true)),more:()=>setLegendMenu(menuOpen?null:{id:row.id,open:null})};
  // PeekValues is the shared frozen read (no per-frame deep copy); the legend only reads it.
  // NumericSeries holds nulls for warm-up bars; legendValueParts reads them as empty (Number.isFinite), so the port is re-typed here.
  const legendPort=chart?{values:(id:string)=>({series:(chart.indicators.peekValues?.(id)??chart.indicators.values(id)).series.map(series=>({id:series.id,values:series.values as unknown as ArrayLike<number>}))})}:null;
  // Live plot values at the inspected bar (null reads the last bar); displayed.index indexes the calculation bars.
  // The shared reader (indicatorPlotTextAt) is the data window's: values[bar - offset] with the instance precision and tick size.
  const values=legendPort&&statusLine.indicators.values?hoverSlot(()=>hoverReadout().validInspection?.displayed.index??null,()=>{const {validInspection}=hoverReadout(),reading={kind:row.kind,offset:row.offset,precision:row.presentation?.precision??'auto'},tickSize=dataset.instrument.tickSize;
   return legendValuesView(indicatorLegendTexts(legendPort,row,validInspection?.displayed.index??null,(kind,plot)=>defaultPlotStyle(kind as IndicatorId,plot,0),(plotValues,bar,plot)=>indicatorPlotTextAt(plotValues,bar,{...reading,plot},tickSize)));}):null;
  const orderRows=menuOpen?indicatorViews.map(item=>({id:item.id,paneId:item.paneId})):[];
  const placement=menuOpen?scaleOf(row):null,moveTo:LegendSubmenuItem[]=menuOpen?indicatorMoveChoices(chart??{},row.rendererId,indicatorViews).map(choice=>({id:choice.id,label:choice.label,...(choice.disabled?{disabled:true,title:choice.disabled}:{})})):[];
  return <div key={row.id} className="lv-legend-row" data-legend-row={row.id} data-hidden={row.visible?undefined:'true'} style={{background:statusBackground??'transparent'}} {...legendRowMenuProps(()=>setLegendMenu({id:row.id,open:null}))}>
   <button type="button" className="lv-legend-title" title={label} onClick={()=>openIndicatorSettings(row)}>{readout?.title&&<span className="lv-legend-name">{readout.title}</span>}{readout?.arguments&&<span className="lv-legend-args">{(readout.title?' ':'')+readout.arguments}</span>}{suffix}</button>
   {values}{row.kind==='avwap'&&!String(row.inputs.anchor??'').trim()&&<button type="button" className="lv-legend-anchor-hint" data-anchor-hint="true" aria-pressed={anchorPlacement?.id===row.id} onClick={()=>beginAnchorPlacement(row.id,false)}>{AVWAP_UNANCHORED_MESSAGE}</button>}{builtinReasonCurrent&&row.visible&&(!row.informationBars||row.diagnostics.length>0&&!row.series.length)?indicatorReasonView(label,indicatorDataStatus(row)):null}
   {legendButtons('indicator',{hidden:!row.visible,intervalRestricted:restricted}).map(button=>legendButtonView(button,label,press[button.id],button.id==='more'?{expanded:menuOpen}:{}))}
   {menuOpen&&<PaneLegendMenu isCurrent={paneLegendOwnerCurrent}>{legendMoreMenuView(legendMoreMenu('indicator',{surface:'legend',title:indicatorAcronyms[row.kind],value:null,hidden:!row.visible,favorite:workspace.indicatorLibrary.favorites.includes(row.kind),scalePlacement:placement,mainScaleSide:(()=>{try{return chart?.priceScale.settings().mainSide==='left'?'left' as const:'right' as const;}catch{return 'right' as const;}})(),linkedToSeries:false,routes:{visualOrder:indicatorVisualOrderAvailable(orderRows,row.id),copy:true,anchor:row.kind==='avwap'}}),{label,open:legendMenu!.open,submenus:{moveTo,visualOrder:visualOrderItems(indicatorOrderState(orderRows,row.id)),pinToScale:pinToScaleMenu(placement,scaleSides(),scaleChoicesOf(row)).map(item=>({id:item.id,label:item.label??item.id,checked:item.checked,disabled:item.disabled,title:item.title}))},onItem:id=>legendMoreAction(row,id),onSubmenu:(parent,id)=>legendSubmenu(row,parent,id),onClose:()=>setLegendMenu(null)})}</PaneLegendMenu>}
  </div>;
 };
 // A collapsed legend shows how many indicators it holds (the count text is our own choice).
 const collapsedCount=legendVisible?'':indicatorViews.length===1?', 1 indicator':', '+indicatorViews.length+' indicators';
 const legendToggler=<button key="legend-toggler" type="button" className="lv-legend-toggler" data-qa={LEGEND_TOGGLER_QA_ID} title={statusLine.legend.tooltip} aria-label={statusLine.legend.tooltip+collapsedCount} aria-expanded={legendVisible} onClick={()=>{setLegendMenu(null);setLegendVisible(value=>!value);}}><ChevronDownIcon style={{transform:legendVisible?'rotate(180deg)':undefined}}/>{!legendVisible&&<span className="lv-legend-counter" data-qa="legend-collapsed-sources-counter" aria-hidden="true">{indicatorViews.length}</span>}</button>;
 // Prebuilt builtin nodes are reused by script-only metadata renders; no producer read runs inside the composer.
 const builtinLegendNodes=legendVisible?indicatorViews.map(row=>({id:row.id,paneId:row.paneId,node:legendRow(row)})):[];
 if(legendVisible){
  const ownedBuiltinNodes=new Map(indicatorViews.map((row,index)=>[row,builtinLegendNodes[index]] as const));
  const paneOrderedBuiltinNodes=groupLegendByPane(indicatorViews).map(group=>group.rows.map(row=>ownedBuiltinNodes.get(row)!)).flat();
  builtinLegendNodes.splice(0,builtinLegendNodes.length,...paneOrderedBuiltinNodes);
 }
 const comparisonLegendNode=chart?<ComparisonLegendRows key="comparison-legend" port={chart.comparisons} onSettings={()=>setDialog('compare')} onEdit={run=>indicatorChartAction(()=>{try{assertRenderedAnalysisOwner();assertActiveAnalysisChart();assertRenderedAnalysisOwner();run();assertRenderedAnalysisOwner();if(!confirmAnalysisCapture('comparison',false,assertRenderedAnalysisOwner))throw Error('The accepted comparison edit has no saved chart cell. Reopen the chart before editing.');}catch(error){if(ownsRenderedAnalysis())reportFailure(error);}})}/>:null;
 const comparisonCount=workspace.grid?.cells[workspace.grid.layout.activeCellId]?.comparisons?.length??0;
 const composeScriptLegendRows=(scriptRows:readonly ScriptLegendOwnedRow[])=>{
  const grouped=groupActiveStudyPaneRows(builtinLegendNodes,legendVisible?scriptRows:[]),renderNodes=(rows:readonly ActiveLegendNode[])=>rows.map(row=><React.Fragment key={row.key}>{row.node}</React.Fragment>);
  return <React.Fragment key="active-study-panes">
   <div key="price" className="lv-legend-pane lv-legend-price-scroll" data-legend-pane="price">{renderNodes(grouped.price)}{legendVisible&&comparisonLegendNode}{legendToggler}</div>
   {grouped.panes.map(group=>legendPaneView(group.paneId,renderNodes(group.rows)))}
   {grouped.unplaced.length>0&&<div className="lv-study-unplaced lv-active-study-unplaced" data-study-placement="unavailable"><span className="help">Placement unavailable</span>{renderNodes(grouped.unplaced)}</div>}
   <span key="pane-separators" className="lv-pane-legend-separators" aria-hidden="true"/>
  </React.Fragment>;
 };
 const paperManager:PaperManager={book:paperState.book,selectedPresetId,onSelectPreset:setSelectedPresetId,onStateChange:acceptPaperState};
 const selectedPreset=paperState.book?.presets?.find(row=>row.id===selectedPresetId)??null;
 const activeAccount=secondaryWindow?null:replay?replayPaper:paper;
 // The DOM pane's open state and dragged spot are saved in the workspace (paperDomPane; no undo
 // step, commit records history only for grid changes). The dock renders the pane, so the saved spot and the save callbacks are
 // registered with PaperDomPane. A pane saved open reopens once per App, as soon as the trading dock (the pane host) is mounted.
 useEffect(()=>{if(secondaryWindow)return;const saved=()=>paperDomPaneOf(current.current),save=(next:PaperDomPaneSaved)=>{const prior=saved();if(samePaperDomPane(prior,next))return;try{assertStartupEditable(startup.current);}catch{return;}commit({paperDomPane:next});};
  setPaperDomPanePlacement({get at(){return saved()?.at??null;},onMove:point=>save({open:true,at:point}),onOpenChange:open=>{const at=saved()?.at;save(at?{open,at}:{open});}});
  if(loaded&&activeAccount&&!paperDomReopened.has(current)&&paperDomPaneHosted()){paperDomReopened.add(current);if(saved()?.open&&!paperDomPaneState().open)openPaperDomPane('panel');}
  return()=>setPaperDomPanePlacement(null);},[loaded,!!activeAccount,commit,secondaryWindow]);
 // Paper trading is refused on a derived (symbol math) chart: ticket, Buy/Sell, DOM, + menu, Trade, Shift+B/S.
 const derivedTrade=derivedPaperRefusal({instrument:dataset.instrument,datasetId:dataset.provenance.datasetId});
 const openOrderTicket=(side:'buy'|'sell',quantity?:string)=>{if(derivedTrade){setMessage(derivedTrade);return;}const text=quantity?.trim();setOrderSeed({side,...(text?{quantity:text}:{})});setDialog('order');};
 // Object tree Hide / status line eye for the active cell's main series (saved on the cell, undoable).
 const seriesHidden=activeSeriesHidden(workspace.grid);
 const setSeriesVisibility=(visible:boolean)=>{try{const grid=current.current.grid;if(!grid)throw new Error('The active chart is unavailable.');const next=withActiveSeriesVisible(grid,visible);if(next!==grid)commit({grid:next});}catch(error){reportFailure(error);}};
 // The main series legend buttons (Flag symbol, More) and its More menu (series-legend-menu.ts). Rows that are
 // registry commands run commandRuns, so the main menu, Quick search and this menu share one handler each. The watchlist rows
 // use the watchlist membership API only. The menu shares the legend menu state (id SERIES_MENU), so no hook is added.
 const SERIES_MENU='lv:main-series',seriesMenu=legendMenu?.id===SERIES_MENU?legendMenu:null;
 const seriesReference=()=>{const data=currentInput.current?.dataset;if(!data)throw new Error('The chart has no symbol yet.');return{data,reference:watchReferenceForDataset(data)};};
 const seriesFlag=(()=>{try{return watchFlagOf(workspace.watchBook,dataset.instrument);}catch{return null;}})();
 // The scale side is read only while the menu is open, so a render on a tick makes no extra chart read.
 const readSeriesSide=()=>{try{return chart?.priceScale.settings().mainSide==='left'?'left' as const:'right' as const;}catch{return 'right' as const;}},seriesSide=seriesMenu?readSeriesSide():'right';
 const seriesLast=calculationBars.at(-1),seriesPrice=seriesLast?statusLinePriceFormat(workspace.chartSettings.symbol.precision,dataset.instrument.tickSize,isSymbolMathDatasetId(dataset.provenance.datasetId)?seriesLast.close:null)(seriesLast.close):null;
 function toggleSeriesFlag(){try{const {reference}=seriesReference(),book=current.current.watchBook,next=setWatchFlags(book,[reference],watchFlagOf(book,reference)?null:'red');commit({watchBook:next,watchlist:watchSymbols(next)});}catch(error){reportFailure(error);}}
 function addSeriesToList(listId:string){try{const {data,reference}=seriesReference(),book=current.current.watchBook,name=watchListChoices(book).find(row=>row.id===listId)?.name??'the list',result=addWatchMembers(book,listId,[reference],()=>crypto.randomUUID());if(!result.added.length){setMessage(data.instrument.symbol+' is already in '+name+'.');return;}if(commit({watchBook:result.book,watchlist:watchSymbols(result.book)}))setMessage('Added '+data.instrument.symbol+' to '+name+'.');}catch(error){reportFailure(error);}}
 /** As the Screener does: the new list is created and filled, and the active list stays as it was. */
 function createSeriesList(name:string){try{const {data,reference}=seriesReference(),book=current.current.watchBook;if(book.lists.length>=WATCH_LIMITS.lists)throw new Error('The local book already holds 100 lists. Delete a list first.');const listName=validateWatchListName(book,name),id=crypto.randomUUID(),result=addWatchMembers(selectWatchList(addWatchList(book,id,listName),book.activeId),id,[reference],()=>crypto.randomUUID());setLegendMenu(null);if(commit({watchBook:result.book,watchlist:watchSymbols(result.book)}))setMessage('Created '+listName+' with '+data.instrument.symbol+'.');}catch(error){reportFailure(error);}}
 const commandState=(command:AppCommandId):string|null|undefined=>{const run=commandRuns[command];return run?run.disabled?SERIES_REASONS.busy:null:undefined;};
 const seriesAvailability:SeriesAvailability={};
 for(const [id,command] of Object.entries(SERIES_MORE_COMMANDS) as [SeriesMoreItemId,AppCommandId][]){const state=commandState(command);if(state!==undefined)seriesAvailability[id]=state;}
 const metricsAvailable:Partial<Record<keyof typeof SERIES_METRICS_COMMANDS,string|null>>={};
 for(const [id,command] of Object.entries(SERIES_METRICS_COMMANDS) as [keyof typeof SERIES_METRICS_COMMANDS,AppCommandId][]){const state=commandState(command);if(state!==undefined)metricsAvailable[id]=state;}
 if(Object.keys(metricsAvailable).length)seriesAvailability.metrics=null;
 // The order ticket belongs to the main window; a derived chart refuses paper trading.
 if(!secondaryWindow)seriesAvailability.order=derivedTrade??(chart&&loaded?null:SERIES_REASONS.busy);
 Object.assign(seriesAvailability,{copyPrice:null,paste:chart?null:SERIES_REASONS.busy,moveTo:null,pinToScale:chart?null:SERIES_REASONS.busy,hide:null,watchlist:loaded?null:SERIES_REASONS.busy,settings:null});
 function seriesMoreAction(id:SeriesMoreItemId){
  if(SERIES_SUBMENU_ROWS.has(id)){setLegendMenu({id:SERIES_MENU,open:seriesMenu?.open===id?null:id});return;}
  setLegendMenu(null);
  const command=SERIES_MORE_COMMANDS[id];
  if(command){const run=commandRuns[command];if(run&&!run.disabled)run.run();else setMessage(SERIES_REASONS.busy);return;}
  switch(id){
   case 'order':openOrderTicket('buy');return;
   case 'copyPrice':if(seriesPrice)void copyPlainText(seriesPrice).then(result=>setMessage(result.message));return;
   case 'paste':utilityKeys.current.clipboard('v');return;
   case 'hide':setSeriesVisibility(seriesHidden);return;
   // The series More menu "Settings...": the main series settings, which LV keeps on the Chart settings Symbol tab.
   case 'settings':openSettings('symbol');return;
   default:return;
  }
 }
 function seriesSubmenu(parent:SeriesMoreItemId,id:string){
  if(parent==='watchlist'&&id===CREATE_LIST_ITEM){setLegendMenu({id:SERIES_MENU,open:'watchlist',draft:''});return;}
  setLegendMenu(null);
  if(parent==='metrics'){const command=SERIES_METRICS_COMMANDS[id as keyof typeof SERIES_METRICS_COMMANDS],run=command?commandRuns[command]:undefined;if(run&&!run.disabled)run.run();return;}
  if(parent==='watchlist'&&id.startsWith(LIST_ITEM_PREFIX)){addSeriesToList(id.slice(LIST_ITEM_PREFIX.length));return;}
  if(parent==='pinToScale'&&(id==='left'||id==='right')&&chart&&readSeriesSide()!==id){const result=chart.priceScale.execute(id==='left'?'moveLeft':'moveRight',{origin:'chart-pointer'});if(!result.ok&&result.message)setMessage(result.message);}
 }
 const seriesButtons=legendButtons('series',{hidden:seriesHidden,intervalRestricted:false}).map(button=>legendButtonView(button,dataset.instrument.symbol,button.id==='flag'?toggleSeriesFlag:()=>setLegendMenu(seriesMenu?null:{id:SERIES_MENU,open:null}),button.id==='flag'?{pressed:seriesFlag!==null}:{expanded:!!seriesMenu}));
 const createListForm=seriesMenu&&seriesMenu.draft!==undefined?<form className="lv-legend-create-list" aria-label="Create new list" onSubmit={event=>{event.preventDefault();createSeriesList(seriesMenu.draft??'');}}><input aria-label="List name" autoFocus maxLength={WATCH_LIMITS.name} value={seriesMenu.draft} onChange={event=>setLegendMenu({id:SERIES_MENU,open:'watchlist',draft:event.target.value})} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setLegendMenu({id:SERIES_MENU,open:'watchlist'});}}}/><button type="submit">Create</button></form>:null;
 const seriesMenuView=seriesMenu?<div ref={node=>{mainSeriesMenuRef.current=node;}} className="lv-series-menu-host">{legendMoreMenuView(seriesMoreMenu({symbol:dataset.instrument.symbol,price:seriesPrice,hidden:seriesHidden,mainScaleSide:seriesSide,availability:seriesAvailability}),{label:dataset.instrument.symbol,open:seriesMenu.open,
  submenus:{metrics:seriesMetricsItems(metricsAvailable),moveTo:seriesMoveToItems(),pinToScale:seriesPinToScaleItems(seriesSide),watchlist:seriesWatchlistItems(watchListChoices(workspace.watchBook),listId=>{try{return isWatchMember(workspace.watchBook,listId,watchReferenceForDataset(dataset),'market');}catch{return false;}},workspace.watchBook.lists.length>=WATCH_LIMITS.lists?'The local book already holds 100 lists. Delete a list first.':null)},
  onItem:seriesMoreAction,onSubmenu:seriesSubmenu,onClose:()=>setLegendMenu(null),submenuFooter:{watchlist:createListForm}})}</div>:null;
 const openPaperTicket=(side:'buy'|'sell'|null)=>{if(side&&derivedTrade){setMessage(derivedTrade);return;}if(side&&!selectedPresetId){openOrderTicket(side);return;}presetSeedToken.current++;setPresetSeed(side?{token:presetSeedToken.current,side}:null);setDialog('paper');};
  const legendRef=useRef<HTMLDivElement|null>(null),[legendBottom,setLegendBottom]=useState(0);
 useEffect(()=>{const element=legendRef.current?.querySelector<HTMLElement>('.lv-legend-price-scroll'),host=legendRef.current?.parentElement;if(!paneLegendOwnerCurrent())return;const bottom=element&&host?Math.max(0,element.getBoundingClientRect().bottom-host.getBoundingClientRect().top):0;if(paneLegendOwnerCurrent())setLegendBottom(previous=>previous===bottom?previous:bottom);},[legendLayoutKey(indicatorViews),workspace.scriptBindings,legendVisible,legendMenu,loaded,chart,gridEpoch,financialEpoch,workspace.grid?.layout.activeCellId]);
 // Declared after every other hook (App tests rely on hook order): the header layout dropdown.
 const [layoutMenu,setLayoutMenu]=useState<LayoutMenuState|null>(null);
 useEffect(()=>{if(!layoutMenu?.open||typeof document==='undefined')return;document.querySelector?.<HTMLElement>('#lv-layout-menu [role^=menuitem]')?.focus?.();const outside=(event:PointerEvent)=>{if(!(event.target as Element|null)?.closest?.('.lv-layout-menu-host'))setLayoutMenu(null);};document.addEventListener?.('pointerdown',outside,true);return()=>document.removeEventListener?.('pointerdown',outside,true);},[layoutMenu?.open]);
 // Declared after every other hook (App tests rely on hook order): the indicator templates dropdown.
 const [templateMenu,setTemplateMenu]=useState(false),[templateTab,setTemplateTab]=useState<'saved'|'save'|'transfer'>('saved'),[appliedTemplate,setAppliedTemplate]=useState<{name:string}|null>(null);
 // Declared after every other hook: the chart quantity box and the broker order ticket seed.
  useEffect(()=>{if(!replay)return;return holdLiveHistory(dataset.provenance.datasetId);},[replay?.runId,dataset.provenance.datasetId]);
 // Background alert feeds and the docked Alerts panel.
 const [alertPlan,setAlertPlan]=useState<BackgroundPlan>({feeds:[],skipped:[]});
 warmFeeds.current.alerts={symbols:alertPlan.feeds.filter(feed=>feed.providerId===ALPACA_IEX_PROVIDER_ID).map(feed=>feed.symbol),waiting:alertPlan.skipped.filter(row=>row.reason.includes('(the Alpaca limit)')).length};
 const unwatchedAlerts=useMemo(()=>new Map(alertPlan.skipped.map(row=>[row.alertId,row.reason] as const)),[alertPlan]);
 // Alpaca slots go to charts, then alerts and paper orders (strong opens), then list-alert members, then the watchlist (yielding opens a stronger need takes over).
 function openWatchFeed(feed:WatchFeed,onEvicted:()=>void):LiveHandle|null{if(feed.providerId!==ALPACA_IEX_PROVIDER_ID)return openBackgroundFeed({...feed,instrumentId:'',alertIds:[]});const lv=window.lv;if(!alpacaProvider.current&&lv?.fetchAlpacaBars&&lv.subscribeAlpaca&&lv.unsubscribeAlpaca&&lv.onAlpacaEvent)alpacaProvider.current=new AlpacaLiveProvider(lv as unknown as AlpacaBridge);return alpacaProvider.current?alpacaProvider.current.open(feed.symbol,feed.resolution,{yielding:feed.priority==='watch',onEvicted}):null;}
 const watchOpen=useRef(openWatchFeed);watchOpen.current=openWatchFeed;
 useEffect(()=>{const host=new WatchFeedHost({open:(feed,onEvicted)=>watchOpen.current(feed,onEvicted),publish:(datasets,notes)=>{liveData.setWatchFeeds({datasets,notes});watchSteps.current();},intervalMs:LIVE_UI_INTERVAL_MS});watchHost.current=host;return()=>{host.dispose();if(watchHost.current===host)watchHost.current=null;};},[]);
 const liveIdsKey=Object.keys(liveDatasets).sort().join('|');
 useEffect(()=>{const host=watchHost.current;if(!host||!loaded||secondaryWindow)return;const taken=new Set([...alpacaChartSymbols(),...alertPlan.feeds.filter(feed=>feed.providerId===ALPACA_IEX_PROVIDER_ID).map(feed=>feed.symbol),...(paperBackgroundKey?paperBackgroundKey.split('|'):[]),...(paperFineSymbol?[paperFineSymbol]:[])]);const charted=new Set(liveHandles.current.keys()),watchPlan=planWatchFeeds({book:workspace.watchBook,listAlerts:workspace.listAlerts,taken,charted}),plan={...watchPlan,feeds:[...watchPlan.feeds,...(workspace.layoutLibrary?layoutTabFeeds({library:workspace.layoutLibrary,open:layoutTabIds,workspace,taken,planned:watchPlan.feeds,charted}):[])]};host.sync({...plan,feeds:plan.feeds.filter(feed=>feed.providerId===ALPACA_IEX_PROVIDER_ID?alpacaKeyConfigured:feed.providerId===COINBASE_PROVIDER_ID&&liveChoices.coinbase)});},[loaded,workspace.watchBook,workspace.listAlerts,alertPlan,paperBackgroundKey,paperFineSymbol,liveIdsKey,alpacaKeyConfigured,liveChoices.coinbase,workspace.layoutLibrary,layoutTabIds]);
 // List alerts evaluate every member on its closed session view; each new trigger is presented like a local alert trigger. Saved only when something changed (never on a forming-bar tick).
 // A derived watch row adopts its feed's synthetic labelling (the keyless stub's derived feed is SYNTHETIC), so it
 // quotes with the SYNTHETIC label. No undo step (only grid changes record history); skipped while the workspace is busy.
 useEffect(()=>{if(!loaded||secondaryWindow||workspaceTransaction.current||storageMutation.current)return;try{assertStartupEditable(startup.current);}catch{return;}const book=current.current.watchBook,next=adoptDerivedWatchLabels(book,watchQuotes);if(next!==book)commit({watchBook:next});},[loaded,workspace.watchBook,watchQuotes]);
 useEffect(()=>{if(!loaded||secondaryWindow)return;const step=liveListAlertStep(current.current.listAlerts,current.current.watchBook,watchQuotes);if(step&&commit({listAlerts:step.alerts})&&step.deliveries.length)announceAlertDeliveries(step.deliveries);},[loaded,workspace.listAlerts,workspace.watchBook,watchQuotes]);
 // A store change App does not render for (another feed's snapshot, a background watch feed) steps the derived
 // watch labels and the list alerts here, with the guards of the two effects above, in the same order.
 watchSteps.current=()=>{try{const quotes=watchQuoteDatasets(universe,liveData.getSnapshot(),liveData.getWatchFeeds().datasets);
  if(loaded&&!secondaryWindow&&!workspaceTransaction.current&&!storageMutation.current){let editable=true;try{assertStartupEditable(startup.current);}catch{editable=false;}if(editable){const book=current.current.watchBook,next=adoptDerivedWatchLabels(book,quotes);if(next!==book)commit({watchBook:next});}}
  if(!loaded||secondaryWindow)return;const step=liveListAlertStep(current.current.listAlerts,current.current.watchBook,quotes);if(step&&commit({listAlerts:step.alerts})&&step.deliveries.length)announceAlertDeliveries(step.deliveries);}catch(error){reportFailure(error);}};
 function openListAlert(listId:string){try{assertStartupEditable(startup.current);if(dialogOwner.current&&!FLOATING_PAPER_DIALOGS.has(dialogOwner.current))throw new Error('Close the current dialog before adding a list alert.');setListAlertEditing(null);setListAlertTarget(listId);setDialog('list-alert');return true;}catch(cause){reportFailure(cause);return false;}}
 /** Open a saved list alert in its dialog to change it in place. */
 function openListAlertEdit(id:string){try{assertStartupEditable(startup.current);if(dialogOwner.current&&!FLOATING_PAPER_DIALOGS.has(dialogOwner.current))throw new Error('Close the current dialog before editing a list alert.');const row=(current.current.listAlerts??[]).find(alert=>alert.id===id);if(!row)throw new Error('This list alert was removed.');setListAlertEditing(id);setListAlertTarget(row.listId);setDialog('list-alert');return true;}catch(cause){reportFailure(cause);return false;}}
 /** Pause, resume or remove one saved list alert from the docked Alerts panel (one checked commit; a refusal is reported). */
 function listAlertAction(id:string,action:'pause'|'resume'|'remove'|'restart'):boolean{try{assertStartupEditable(startup.current);const saved=current.current.listAlerts??[];if(!saved.some(row=>row.id===id))throw new Error('That list alert no longer exists.');const listAlerts=action==='remove'?saved.filter(row=>row.id!==id):saved.map(row=>row.id===id?action==='restart'?restartListAlert(row,current.current.watchBook):setListAlertPaused(row,action==='pause'):row);if(!commit({listAlerts}))throw new Error('That list alert change could not be saved. Nothing was changed.');setMessage(action==='remove'?'List alert removed.':action==='pause'?'List alert paused.':action==='restart'?'List alert restarted. Each symbol starts again at its next completed bar.':'List alert resumed.');return true;}catch(cause){reportFailure(cause);return false;}}
 /** Clear log in the Alerts panel also clears list alert triggers (members and state are kept). */
 function clearListAlertLog():boolean{try{assertStartupEditable(startup.current);if(!commit({listAlerts:clearListAlertHistory(current.current.listAlerts??[])}))throw new Error('The list alert log could not be cleared. Nothing was changed.');return true;}catch(cause){reportFailure(cause);return false;}}
 /** A watchlist row on a live feed no chart streams opens that feed on the chart. */
 /** The watchlist row's "Add alert on X" shows that symbol on the active chart, then opens Create alert for it. */
 function openSymbolAlert(data:BarDataset){try{if(openWatchRow(data)===false)return false;}catch(cause){reportFailure(cause);return false;}if(current.current.symbol!==data.instrument.symbol){setMessage('The chart has not switched to '+data.instrument.symbol+' yet. Add the alert once it shows.');return false;}openAlertCreate();return true;}
 /** The Alerts log's Show on chart. On the trigger's symbol the chart centres on the trigger time (Go to date's
  * policy: the visible span is kept). Another symbol is opened first (a saved dataset of that instrument through the watchlist
  * path, else the symbol switch); the chart centres once that symbol shows, if it does within 30 seconds. */
 function jumpToAlertTrigger(target:{instrumentId?:string;symbol:string;at:number}):boolean{
  if(dataset.instrument.id===target.instrumentId||dataset.instrument.symbol===target.symbol){
   if(!chart){setMessage('The chart is not ready yet.');return false;}
   const result=chart.goToDate(target.at);if(!result.ok){setMessage(result.diagnostic.message);return false;}
   setMessage(result.withinHistory?'Chart centred on the trigger at '+formatChartDateTime(target.at,shownTimeZone,{hours:shownTimeHours})+'.':'The trigger at '+formatChartDateTime(target.at,shownTimeZone,{hours:shownTimeHours})+' is outside the loaded history; the chart is centred on that time.');return true;
  }
  const saved=target.instrumentId?universe.find(row=>row.instrument.id===target.instrumentId):undefined;
  try{if((saved?openWatchRow(saved):switchSymbol(target.symbol))===false)return false;}catch(cause){reportFailure(cause);return false;}
  pendingAlertJump.current={symbol:saved?.instrument.symbol??target.symbol,at:target.at,until:Date.now()+30000};
  setMessage('Opening '+target.symbol+'. The chart centres on the trigger once it shows.');return true;
 }
 /** Rebuild every chart from the workspace after the demo mode changed (same steps as installStoredWorkspace, minus
  * the workspace swap): a demo source keeps its dataset id across modes, so only a fresh chart host reads its new bars. */
 function remountCharts(){gridGeneration.current++;committedInput.current=null;coordinator.current=null;activeController.current=null;setChart(null);hoverInspection.setInspection(null);setDrawings([]);setIndicatorViews([]);setSelectedDrawing(null);setActiveTool(null);setActiveMode(null);setReplay(null);setReplaySession(null);setStrategyExecution(null);setInputEpoch(value=>value+1);setGridEpoch(gridGeneration.current);}
 function enterExampleMode(symbol:string=EXAMPLE_DEFAULT_SYMBOL){
  try{assertStartupEditable(startup.current);if(workspaceTransaction.current||storageMutation.current)throw new Error('The workspace is busy. Try again in a moment.');
   const live=parseWatchLiveId(current.current.sourceId);exampleReturn.current=live;
   setDemoDataMode('example');
   try{const book=createWatchBook([...EXAMPLE_SYMBOLS]);setExampleBook({...book,lists:book.lists.map(list=>({...list,name:'Example data'}))});
    if(current.current.sourceId!==null||!demoSymbolAllowed(current.current.symbol))openWatchDataset(demoDataset(symbol));}
   catch(cause){setDemoDataMode('off');setExampleBook(null);exampleReturn.current=null;throw cause;}
   remountCharts();setMessage('Showing example data. The prices are invented.');
  }catch(error){reportFailure(error);}
 }
 function leaveExampleMode(){
  try{setDemoDataMode('off');setExampleBook(null);const back=exampleReturn.current;exampleReturn.current=null;
   remountCharts();if(back)openLive(back.providerId,back.symbol,back.resolution);setMessage('Example data is off.');
  }catch(error){reportFailure(error);}
 }
 /** The live chart the needs-live-data card, a watchlist click or Space stepping opens for a symbol whose only bound source is
  * the hidden-demo placeholder (null when the recommended source is not set up). The chart's interval is tried first, then 1D. */
 function liveOpenerFor(symbol:string):(()=>boolean)|null{
  const target=liveOpenTargetFor(symbol,{stocks:alpacaKeyConfigured,crypto:liveChoices.coinbase});if(!target)return null;
  return()=>{const interval=currentInput.current?.dataset.resolution;return interval&&interval!=='1D'&&openLive(target.providerId,target.symbol,interval)||openLive(target.providerId,target.symbol,'1D');};
 }
 /** The empty cells (hidden-demo placeholders) that get a needs-live card. The active cell uses the chart's dataset. */
 function needsLiveCellsOf(grid:NonNullable<typeof workspace.grid>,datasets:readonly BarDataset[],active:BarDataset):NeedsLiveCell[]{
  const example=demoDataMode()==='example';
  return grid.layout.cells.flatMap(row=>{const saved=grid.cells[row.id],data=row.id===grid.layout.activeCellId?active:datasets.find(item=>item.provenance.datasetId===saved?.datasetId&&item.instrument.symbol===row.symbol);
   if(!data||!isDemoPlaceholder(data)){
    // A cell the grid cannot resolve whose saved source is the hidden demo (a saved keyless live chart) gets the
    // same card; the grid then leaves that cell empty instead of "Saved source unavailable".
    let unresolved=false;try{exactGridDataset(grid,row.id,datasets);}catch{unresolved=true;}
    // A saved live feed counts only while its provider is not set up (a keyless Alpaca chart, Coinbase turned off), so a feed that is
    // still loading never shows the card.
    const id=saved?.datasetId,provider=typeof id==='string'&&id.startsWith('live:')?id.split(':')[1]??'':null,liveMissing=provider!==null&&(provider.startsWith('coinbase')?!liveChoices.coinbase:!alpacaKeyConfigured);
    if(!unresolved||!(isHiddenDemoSourceId(id)||liveMissing)||(row.id===grid.layout.activeCellId&&active.bars.length>0))return[];
    const product=cryptoProductFor(row.symbol);
    return[{cellId:row.id,symbol:product??row.symbol,crypto:product!==null,liveReady:!!liveOpenTargetFor(row.symbol,{stocks:alpacaKeyConfigured,crypto:liveChoices.coinbase}),example}];
   }
   const symbol=data.instrument.symbol,product=cryptoProductFor(symbol);
   return[{cellId:row.id,symbol:product??symbol,crypto:product!==null,liveReady:!!liveOpenTargetFor(symbol,{stocks:alpacaKeyConfigured,crypto:liveChoices.coinbase}),example}];});
 }
 /** "Show live" on a cell's card. The cell becomes the active chart first, then its live source opens there. */
 function openLiveInCell(cellId:string){
  const grid=current.current.grid,row=grid?.layout.cells.find(item=>item.id===cellId);if(!grid||!row)return;
  const symbol=(grid.cells[cellId]?.datasetId?.match(/^lv-synthetic-v1:([^:]+)/)?.[1])??row.symbol,opener=liveOpenerFor(symbol);if(!opener)return;
  if(grid.layout.activeCellId===cellId){opener();return;}
  const element=[...document.querySelectorAll<HTMLElement>('[data-chart-tree]:not([inert]) [data-lv-cell-id]')].find(item=>item.getAttribute('data-lv-cell-id')===cellId);
  element?.querySelector<HTMLElement>('.lv-grid-strip button')?.focus();
  let frames=0;const wait=()=>{if(current.current.grid?.layout.activeCellId===cellId&&!workspaceTransaction.current){opener();return;}if(++frames<60)requestAnimationFrame(wait);else setMessage('Select the chart, then choose Show live again.');};requestAnimationFrame(wait);
 }
 function openWatchRow(data:BarDataset,all=false){/* A row still bound to the hidden demo source opens the user's live source. */if(!all&&demoDataMode()!=='legacy'&&isDemoPlaceholder(data)){const opener=liveOpenerFor(data.instrument.symbol);if(opener)return opener();}const id=data.provenance.datasetId;if(!all&&isLiveDatasetId(id)&&!liveHandles.current.has(id))return openLive(data.provenance.providerId,data.instrument.symbol,data.resolution);return openWatchDataset(data,all);}
 const [chartQty,setChartQty]=useState(''),[orderSeed,setOrderSeed]=useState<{side:'buy'|'sell';quantity?:string;tab?:'limit'|'stop';price?:string;relay?:{instrument:Parameters<typeof placePaperPreset>[2]['instrument'];quote:Parameters<typeof placePaperPreset>[2]['quote'];quoteSource:Parameters<typeof placePaperPreset>[2]['quoteSource'];now:number}}|null>(null);
 useEffect(()=>{if(!templateMenu||typeof document==='undefined')return;document.querySelector?.<HTMLElement>('.lv-template-menu [role^=menuitem]')?.focus?.();const outside=(event:PointerEvent)=>{if(!(event.target as Element|null)?.closest?.('.lv-template-menu-host'))setTemplateMenu(false);};document.addEventListener?.('pointerdown',outside,true);return()=>document.removeEventListener?.('pointerdown',outside,true);},[templateMenu]);
 // Declared after every other hook (App tests rely on hook order): the active chart's shared axis tag layout.
 const axisTagBoard=useMemo(()=>createAxisTagBoard(()=>activeController.current===chart&&!workspaceTransaction.current&&!storageMutation.current?(chart as unknown as {axisTags?:AxisTagHost}|null)?.axisTags??null:null),[chart]);
 // Declared after every other hook (App tests rely on hook order): the layout tab strip.
 // Declared after every other hook, before the tab strip: relayed layout saves and the layouts open in other windows. A
 // layout window has no tab strip and never reads or writes the main window's tab list.
 const layoutWindowIds=useWindowRelay({mode:windowMode,bridge:typeof window!=='undefined'?window.lv:undefined,accept:request=>acceptRelayedLayout(request),paper:request=>acceptRelayedPaper(request),title:secondaryWindow?workspace.layoutLibrary?.entries.find(row=>row.id===workspace.layoutLibrary?.activeId)?.name??null:null});
 const layoutTabs=useLayoutTabs({reserve:!secondaryWindow,/* The active tab reads the active chart's ticker and daily change. */quote:loaded?layoutTabQuote(dataset,watchQuotes,workspace.watchBook):null,loaded:loaded&&!secondaryWindow,library:workspace.layoutLibrary,grid:workspace.grid,run:action=>layoutAction(action,'menu'),onError:reportFailure,keyboard:loaded&&!dialog,elsewhere:layoutWindowIds,openWindow:typeof window!=='undefined'&&typeof window.lv?.openLayoutWindow==='function'?openLayoutInWindow:null,wick:wickMode.available?wickMode:null,tabQuotes:loaded&&!secondaryWindow?{datasets:watchQuotes,workspace}:null,onOpenTabs:setLayoutTabIds});
 // Declared after every other hook (App tests rely on hook order): ctx.request in chart scripts and script
 // alerts reads only these loaded datasets, under the interval menu's aggregation policy. Nothing is fetched for it.
 // During Bar Replay chart-owned intrabar history stops at the replay clock, so the forming bar's Volume delta, Up/Down volume
 // and CVD read the revealed steps only (the same rows that build the forming bar).
 const replayHistoryClockOf=useMemo(()=>replayHistoryClock(replaySession),[replaySession?.phase,replaySession?.clock,replaySession?.participants]);
 useEffect(()=>installScriptRequestResolver(replayClippedResolver(createDatasetRequestResolver({datasets:intervalUniverse,policy:workspace.intervals.policy}),replayHistoryClockOf)),[intervalUniverse,dataset,workspace.intervals.policy,replayHistoryClockOf]);
 // Declared after every other hook (App tests rely on hook order): an order ticket opened here for a layout
 // window's instrument (the Shift+B / Shift+S relay) follows that instrument's live quote in this window. Its 1m series is opened
 // through the same provider as the paper background feed and folded into the paper account, and its live bid and ask show in the
 // ticket. An instrument the chart or the background feed already keeps is not opened twice.
 const relaySeed=dialog==='order'&&orderSeed?.relay&&!secondaryWindow&&!replay?orderSeed.relay:null;
 const relaySymbol=relaySeed?relayedFeedSymbol(relaySeed.instrument):null;
 // The relayed quote stays out of App. The ticket binding reads it from the store; this quote-less
 // subscription keeps the relayed instrument watched for the quote-rate priority, as the chart does.
 const relayQuoteInstrument=relaySymbol?relaySeed!.instrument.id:null;
 useEffect(()=>relayQuoteInstrument?liveQuotes.subscribe(relayQuoteInstrument,()=>{}):undefined,[relayQuoteInstrument]);
 const [relaySeries,setRelaySeries]=useState<BarDataset|null>(null);
 const relayOwnFeed=relaySymbol&&paper&&!relayedInstrumentFedElsewhere(paper,dataset.instrument.id,relaySeed!.instrument.id)?relaySymbol:null;
 useEffect(()=>{const provider=alpacaProvider.current;if(!relayOwnFeed||!provider){setRelaySeries(null);return;}
  let handle:LiveHandle;try{handle=provider.open(relayOwnFeed,PAPER_FINE_RESOLUTION);}catch{setRelaySeries(null);return;}
  // Throttled like the other live series: at most one publication per LIVE_UI_INTERVAL_MS.
  let timer:ReturnType<typeof setTimeout>|null=null,last=0,active=true;
  const publish=()=>{timer=null;if(!active)return;last=Date.now();const data=handle.dataset();setRelaySeries(data&&data.bars.length?data:null);};
  publish();handle.onChange(()=>{if(timer===null)timer=setTimeout(publish,Math.max(0,LIVE_UI_INTERVAL_MS-(Date.now()-last)));});
  return()=>{active=false;if(timer!==null)clearTimeout(timer);handle.close();setRelaySeries(null);};
 },[relayOwnFeed,alpacaProvider.current]);
 useEffect(()=>{if(!relaySeed||replay||gridGeneration.current!==gridEpoch||workspaceTransaction.current||storageMutation.current||!loaded)return;
  const account=financial.current.paper;if(!account)return;const input=relayedFeedInput(account,dataset.instrument.id,relaySeed.instrument,relaySeries);if(!input)return;
  const step=feedPaperBars(account,input);if(step.account!==account&&acceptPaper(step.account,account)&&step.message)setMessage(step.message);
 },[relaySeries]);
 // Due Day/GTD orders expire once the chart data time passes them, even on instruments no chart is quoting
 // (a relaunch, another chart, a non-executable symbol). Data time only, never the wall clock. Ordinary account only; replay
 // funds advance with their own bar feed.
 useEffect(()=>{if(replay||!loaded||workspaceTransaction.current||storageMutation.current)return;const account=financial.current.paper;if(!account)return;const next=sweepPaperExpiry(account,virtualNow,{instrumentId:dataset.instrument.id,assetClass:dataset.instrument.assetClass});if(next)acceptPaper(next,account);},[virtualNow,paper,loaded,replay,dataset.instrument.id,dataset.instrument.assetClass]);
 const headerSymbols=[...new Set(symbolCandidates.filter(row=>row.openable).map(row=>row.symbol))].slice(0,500);
 const legendState=legendMenu!==null?'editing':'normal';
 const priceDigits=(String(dataset.instrument.tickSize).split('.')[1]??'').length;
 /** Shift+B / Shift+S in a layout window. The chart's instrument and current quote go to the main window. */
 function relayPaperKey(side:'buy'|'sell'){
  const lv=window.lv;if(typeof lv?.sendPaperToMain!=='function'){setMessage(SECONDARY_WINDOW_NOTICE);return;}
  if(replay||replaySessionRef.current?.phase==='active'){setMessage('Replay paper trading is not available in a layout window. Close replay to send a live virtual order to the main window.');return;}
  if(derivedTrade){setMessage(derivedTrade);return;}
  const plain=<T,>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
  void lv.sendPaperToMain({side,instrument:plain(dataset.instrument) as unknown as Record<string,unknown>,quote:virtualActionQuote?plain(virtualActionQuote) as unknown as Record<string,unknown>:null,quoteSource:{key:chartSourceContextKey(source),state:dataset.provenance.state},now:Math.max(0,virtualNow)})
   .then(result=>setMessage(result.ok?result.value.message:result.error.message)).catch(reportFailure);
 }
 /** The main window acts on a layout window's Shift+B / Shift+S: one-click with an order preset places the
  * preset order for that window's instrument at its quote; otherwise the order ticket opens here for that instrument. */
 async function acceptRelayedPaper(raw:unknown):Promise<{ok:boolean;message:string;focus?:boolean}>{
  if(secondaryWindow)throw new Error('Only the main window takes paper actions from other windows.');
  if(!loaded||startup.current.phase!=='ready')return{ok:false,message:'The main window is still loading. No virtual order was sent.'};
  const request=relayedPaperRequest(raw),symbol=request.instrument.symbol;
  const derived=derivedPaperRefusal({instrument:request.instrument});if(derived)return{ok:false,message:derived};
  if(replay)return{ok:false,message:'The main window is in replay, so it uses replay funds. No virtual order was sent from the layout window.'};
  const account=financial.current.paper;
  if(!selectedPreset)return{ok:false,message:PAPER_SHORTCUT_NO_PRESET_MESSAGE+' in the main window.'};
  type Context=Parameters<typeof placePaperPreset>[2];
  const context={account,instrument:request.instrument,quote:request.quote,quoteSource:request.quoteSource,now:Math.max(account.clock,request.now)} as unknown as Context;
  if(!account.settings.oneClick){setOrderSeed({side:request.side,relay:{instrument:context.instrument,quote:context.quote,quoteSource:context.quoteSource,now:request.now}});setDialog('order');return{ok:true,message:`The ${symbol} order ticket opened in the main window.`,focus:true};}
  const result=placePaperPreset(selectedPreset,request.side,context,{commandId:`relay-${globalThis.crypto.randomUUID()}`});
  if(!result.ok)return{ok:false,message:result.message};
  if(!acceptPaper(result.account,account))return{ok:false,message:'The main window could not take the virtual order now. Try again.'};
  setMessage(`Virtual ${request.side} order for ${symbol} placed from a layout window.`);
  return{ok:true,message:`Virtual ${request.side} order for ${symbol} sent to the main window.`};
 }
  function chartPresetAction(side:'buy'|'sell',commandId:string,quantity?:string):boolean{
  if(derivedTrade){setMessage(derivedTrade);return false;}
  const account=replay?currentReplayPaper.current:financial.current.paper;
  const typed=quantity?.trim()??'',preset=selectedPreset&&/^(?:\d+\.?\d*|\.\d+)$/.test(typed)?{...selectedPreset,input:{...selectedPreset.input,quantity:{kind:'units' as const,value:typed}}}:selectedPreset;
  if(!account||!preset||!account.settings.oneClick){if(selectedPreset){presetSeedToken.current++;setPresetSeed({token:presetSeedToken.current,side});setDialog('paper');}else openOrderTicket(side,quantity);return true;}
  const result=placePaperPreset(preset,side,{account,instrument:dataset.instrument,quote:virtualActionQuote,quoteSource:{key:chartSourceContextKey(source),state:dataset.provenance.state},now:Math.max(account.clock,virtualNow)},{commandId});
  if(!result.ok){setMessage(result.message);return false;}
  return (replay?acceptReplayPaper:acceptPaper)(result.account,account);
 }
 // The workspace's saved drawing tool defaults reach every chart (drawing-tool-defaults.ts); undo and restore follow the workspace.
 // Declared after every other effect so the existing effect order is unchanged.
 useEffect(()=>{try{loadSharedToolDefaults(workspace.drawingToolDefaults);}catch(error){reportFailure(error);}},[workspace.drawingToolDefaults]);
 // The chart grid right after the last queued drawing edit ran (null at each storage mutation start). A key held
 // behind that edit still applies: the edit was made before the key, so its change is not a stale-owner change. A ref,
 // not an effect, so the effect order above and below is unchanged.
 const queuedEditGrid=useRef<unknown>(null);
 // The charts whose held drawing publication is already queued behind the current write (heldDrawingChange).
 const heldDrawingQueued=useRef(new Set<ChartController>());
 // Chart settings Alert volume reaches the alert sound player; a chosen Quick search row runs once its palette has
 // closed (a clean, no-dialog context, as if its menu or toolbar control had been used). Declared last to keep the effect order.
 useEffect(()=>{setAlertSoundVolume(workspace.chartSettings.alerts.volume);},[workspace.chartSettings.alerts.volume]);
 useEffect(()=>{setAlertDisplayClock({zone:shownTimeZone,hours:shownTimeHours});},[shownTimeZone,shownTimeHours]);
 useEffect(()=>{const row=pendingQuickSearch.current;if(!row||dialog!==null)return;pendingQuickSearch.current=null;runQuickSearchItem(row);},[dialog]);
 // Declared last to keep the hook order: Show on chart for a trigger on another symbol, once that symbol shows.
 const pendingAlertJump=useRef<{symbol:string;at:number;until:number}|null>(null);
 useEffect(()=>{const jump=pendingAlertJump.current;if(!jump)return;if(Date.now()>jump.until){pendingAlertJump.current=null;return;}if(!chart||!loaded||!bars.length||dataset.instrument.symbol!==jump.symbol)return;pendingAlertJump.current=null;try{const result=chart.goToDate(jump.at);setMessage(result.ok?'Chart centred on the '+jump.symbol+' trigger at '+formatChartDateTime(jump.at,shownTimeZone,{hours:shownTimeHours})+'.':result.diagnostic.message);}catch(cause){reportFailure(cause);}},[chart,loaded,bars.length,dataset.instrument.symbol]);
 // Declared after every other hook (App tests rely on hook order): re-render when the hovered grid cell moves.
 useGridHoverRender(gridHoverStore(gridHost));
 // The synthetic fixture clock hooks append after every pre-existing hook. Startup effects capture setters without running during render.
 const [syntheticClock,setSyntheticClock]=useState<SyntheticMarketClock|null>(null),[syntheticClockText,setSyntheticClockText]=useState('');
 useEffect(()=>{if(!syntheticClock){setSyntheticClockText('');return;}const update=()=>setSyntheticClockText(syntheticMarketClockLabel(syntheticClock));update();const timer=setInterval(update,1000);return()=>clearInterval(timer);},[syntheticClock]);
 // Per-cell study UI hooks append after all pre-existing App hooks.
 const [studyRevision,setStudyRevision]=useState(0),studyIntents=useRef<ReturnType<typeof createCellStudyIntentQueue>|null>(null);
 if(!studyIntents.current)studyIntents.current=createCellStudyIntentQueue();
 const cellScriptDialog=useRef<{intent:CellStudyIntent;binding:ScriptBinding;workspace:Workspace;authority:object}|null>(null);
 useEffect(()=>{const queue=studyIntents.current!,attempt=queue.peek();try{queue.drain(entry=>{
  const target=entry.intent.target;
  if(gridGeneration.current!==entry.epoch||dialogAuthority.current!==entry.dialog||dialogOwner.current!==null||current.current!==entry.workspace||current.current.grid?.layout.activeCellId!==target.cellId||activeController.current!==target.controller)throw Error('The study action was replaced by another chart or edit.');
  if(storageMutation.current&&backgroundWriteActive())return false;if(workspaceTransaction.current||storageMutation.current)throw Error('A workspace operation replaced this study action.');
  const input=currentInput.current;if(!input||chartSourceContextKey(sourceContextForDataset(input.dataset,input.bars))!==chartSourceContextKey(target.input.source)||(currentReplay.current?.runId??'ordinary')!==target.executionIdentity||current.current.chartStyle!==target.input.style)throw Error('The study source or execution changed.');
  if(chart!==target.controller||workspace!==entry.workspace||workspace.grid?.layout.activeCellId!==target.cellId||!ownsRenderedAnalysis())return false;
  if(!target.controller.isInputCurrent({bars:input.bars,source:sourceContextForDataset(input.dataset,input.bars),style:target.input.style}))return false;
  return true;
 },runCellStudyIntent);}catch(cause){queue.cancel();if(attempt&&activeController.current===attempt.intent.target.controller&&gridGeneration.current===attempt.epoch)reportFailure(cause);}
 },[studyRevision,chart,workspace,bars,dataset,replay,gridEpoch,storageBusy,workspaceBusy,inspectionEpoch]);
 useEffect(()=>{if(dialog!=='cell-script-settings')return;try{assertCellScriptDialog(cellScriptDialog.current);}catch{cellScriptDialog.current=null;if(dialogOwner.current==='cell-script-settings')setDialog(null);}},[dialog,chart,workspace,bars,dataset,replay,gridEpoch]);
 useEffect(()=>()=>studyIntents.current?.cancel(),[]);
 // Compound-only changes have no Workspace identity change. Feed the existing
 // deferred save path, whose version check includes this separate collection.
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>|null=null,dirtySince:number|null=null,scheduledReview=compoundBook.reviewVersion;
  const unsubscribe=compoundBook.subscribe(()=>{const review=compoundBook.reviewVersion;if(review===scheduledReview)return;scheduledReview=review;const now=Date.now();dirtySince??=now;if(timer!==null)clearTimeout(timer);timer=setTimeout(()=>{timer=null;dirtySince=null;void latestSave.current(false);},autosaveDelay(dirtySince,now));});
  return()=>{unsubscribe();if(timer!==null)clearTimeout(timer);};
 },[compoundBook]);
 // The example-mode hooks append after every pre-existing App hook (App tests rely on hook order).
 // exampleBook: the example screen's own watchlist (the five example tickers), held only while example mode is on, never saved.
 const [exampleBook,setExampleBook]=useState<WatchBook|null>(null),exampleReturn=useRef<{providerId:string;symbol:string;resolution:string}|null>(null);
 // Watchlist rows still on the built-in demo source follow the user's live source for that symbol once one is set up
 // (stocks: Alpaca key, crypto: Coinbase). Same commit pattern as adoptDerivedWatchLabels above.
 useEffect(()=>{if(!loaded||secondaryWindow||demoDataMode()==='legacy'||workspaceTransaction.current||storageMutation.current)return;try{assertStartupEditable(startup.current);}catch{return;}
  try{const book=current.current.watchBook,next=adoptLiveWatchSources(book,{stocks:alpacaKeyConfigured,crypto:liveChoices.coinbase});if(next!==book)commit({watchBook:next,watchlist:watchSymbols(next)});}catch(error){reportFailure(error);}
  /* Once the key status is known, a start on a placeholder chart whose live source is set up opens that live chart (once per window). */
  if(alpacaKeyKnown&&!startLiveOpened.has(current)&&isDemoPlaceholder(dataset)){startLiveOpened.add(current);const opener=liveOpenerFor(dataset.instrument.symbol);if(opener)try{opener();}catch(error){reportFailure(error);}}
 },[loaded,alpacaKeyConfigured,alpacaKeyKnown,liveChoices.coinbase,workspace.watchBook,workspaceBusy,storageBusy]);
 const renderedCellScriptDialog=cellScriptDialog.current,renderedCellScriptBinding=renderedCellScriptDialog?.binding??null;
  const snapshotOwnerCurrent=()=>{try{const input=currentInput.current;return !!chart&&!!input&&activeController.current===chart&&gridGeneration.current===gridEpoch&&current.current===workspace&&currentReplay.current===replay&&financial.current.paper===paper&&financial.current.paperBook===paperState.book&&financial.current.alerts===alerts&&!workspaceTransaction.current&&!storageMutation.current&&(input.bars===bars||sameBarsInput(input.bars,bars))&&(input.dataset===dataset||sameChartSourceBasis(sourceContextForDataset(input.dataset,input.bars),source,true));}catch{return false;}};
  // The binding follows the hover store; HoverSlot consumers re-render when its series key changes.
  const readSnapshotBinding=()=>{const inspection=hoverInspection.inspection;
  const snapshotInspection=snapshotOwnerCurrent()?matchingInspection(inspection,bars,source,workspace.chartStyle):null;
  const snapshotBinding=chart?{owner:gridHost,chart,sourceKey:snapshotSourceKey(source,workspace.chartStyle),seriesKey:snapshotInspectionKey(snapshotInspection,workspace.chartStyle),isOwnerCurrent:snapshotOwnerCurrent,gestureOwnerKey:JSON.stringify([gridEpoch,financialEpoch,workspace.grid?.layout.activeCellId??null,replay?.runId??'ordinary'])}:null;
  return snapshotBinding;};
  let snapshotCache:{version:number;value:ReturnType<typeof readSnapshotBinding>}|null=null;
  const snapshotBindingNow=()=>{const version=hoverInspection.version;if(snapshotCache?.version!==version)snapshotCache={version,value:readSnapshotBinding()};return snapshotCache.value;},hoverSnapshotKey=()=>snapshotBindingNow()?.seriesKey??null;
  // Alert lines and event marks republish (forcing a layout) only after the hover settles; their scenes do not follow it.
  const SNAPSHOT_OVERLAY_SETTLE_MS=60;
  const dialogDeps=[renderedDialogAuthority,activeDialogContext,dialog];
 // What the open Indicators dialog reads from the chart while it renders, beyond its props:
 // the calculation bar count ("The chart has N bars"), each instance's scale and source choices, and the pane sizes. A read that
 // fails gives a fresh object, so the element is rebuilt.
 const indicatorDialogReads=(target:ChartController|null):unknown=>{if(dialog!=='indicators'||!target)return null;try{const bars=target.getCalculationBars?.();return JSON.stringify([Array.isArray(bars)?bars.length:null,indicatorViews.map(row=>[row.id,target.indicators.scale?.(row.id)??null,target.indicators.sourceChoices?.(row.id)??[]]),target.chart?.panes?.list?.().map(pane=>[pane.id,pane.indicators.length])??null]);}catch{return {};}};
 // One storageWrite object for the open Indicators dialog, so its identity can hold. Its members forward to
 // the newest closures (stableProps), so it is kept only while what those closures capture from the render is unchanged: the
 // dialog authority (dialogDeps) and the rendered analysis owner (chart, grid epoch, cell, style, replay run, source, bar input;
 // a live feed's growth keeps its input). A change queued in the dialog still runs the checks of the chart it was made on.
 const paneLegendCellId=workspace.grid?.layout.activeCellId,paneLegendOwnerKey=JSON.stringify([gridEpoch,financialEpoch,paneLegendCellId??null,replay?.runId??'ordinary']);
 const mainSeriesHeadingRef=useRef<HTMLDivElement|null>(null),mainSeriesMenuRef=useRef<HTMLDivElement|null>(null);
 // Keyed on the source identity, not the dataset object or its bars. A live tick hands App a new
 // snapshot of the same source, which used to retire and remount the trade box placement every second. The placement reads only
 // the chart and the heading/legend layout; isCurrent() still checks the newest bars before every paint.
 const mainSeriesHeadingOwner=useMemo(()=>Object.freeze({}),[chart,gridEpoch,financialEpoch,workspace.grid?.layout.activeCellId,dataset.provenance.datasetId,dataset.instrument.id,dataset.resolution,workspace.chartStyle,loaded]);
 function paneLegendOwnerCurrent(){const input=currentInput.current;return !!chart&&loaded&&activeController.current===chart&&gridGeneration.current===gridEpoch&&financialGeneration.current===financialEpoch&&current.current.grid?.layout.activeCellId===paneLegendCellId&&!workspaceTransaction.current&&!storageMutation.current&&input?.bars===bars&&input.dataset===dataset&&(currentReplay.current?.runId??null)===(replay?.runId??null);}
 const keptStorageWrite=()=>surfaceProps('dialog:indicators:storage-write',analysisStorageWrite,[...dialogDeps,analysisRenderOwner.chart,analysisRenderOwner.epoch,analysisRenderOwner.cellId,analysisRenderOwner.style,analysisRenderOwner.runId,analysisRenderOwner.sourceKey,analysisRenderOwner.bars?barInputIdentity(analysisRenderOwner.bars):null]);
 // Chart settings reads the chart once, when it opens (the dialog takes these into its draft at mount and
 // never reads them again), so a live tick neither rebuilds the reads nor the dialog.
 const settingsReads=dialog==='chart-settings'?onceWhile(surfaces.chartReads,[renderedDialogAuthority,chart,workspace.chartStyle],()=>({typeSettings:chart&&workspace.chartStyle!=='candles'?readChartValue(()=>chart.getChartSettings(workspace.chartStyle)):null,priceScale:chart?readChartValue(()=>chart.priceScale.settings()):null,ratio:chart?readChartValue(()=>chart.priceScale.ratio()):null,scaleMode:chart?readChartValue(()=>{const o=chart.getChartOptions();return{scale:o.scale,invert:o.invert,auto:o.auto};}):null})) as Pick<Parameters<typeof ChartSettingsDialog>[0],'typeSettings'|'priceScale'|'ratio'|'scaleMode'>:null;
 // Declared after every other hook (App tests rely on hook order): the first run (first-run.ts). A fresh profile opens
 // live BTC-USD from Coinbase (the start-on-placeholder effect above opens it). No bars in time, or a Coinbase failure, moves
 // the chart to example data on BTC with a one-line message and a Try live again button. Anything the user does first wins.
 const [firstRunPhase,setFirstRunPhase]=useState<FirstRunPhase>('idle'),[firstRunTick,setFirstRunTick]=useState(0),firstRun=useRef({loadedAt:0,openedAt:0});
 useEffect(()=>{
  if(firstRunPhase==='fallback'&&!exampleBook){setFirstRunPhase('done');return;}
  if(firstRunPhase!=='opening'||!loaded||secondaryWindow)return;
  const now=Date.now(),run=firstRun.current,sourceId=current.current.sourceId;
  if(sourceId===FIRST_RUN_DATASET_ID&&!run.openedAt)run.openedAt=now;
  const placeholder=sourceId===null&&current.current.symbol===FIRST_RUN_EXAMPLE_SYMBOL&&isDemoPlaceholder(dataset);
  const verdict=firstRunVerdict({chartSourceId:sourceId,placeholder,dataset:sourceId?liveDatasets[sourceId]:null,elapsedMs:now-(run.openedAt||run.loadedAt),opened:!!run.openedAt});
  if(verdict==='wait'){const timer=setTimeout(()=>setFirstRunTick(value=>value+1),Math.max(50,(run.openedAt?run.openedAt+FIRST_RUN_LIVE_WAIT_MS:run.loadedAt+FIRST_RUN_OPEN_WAIT_MS)-now));return()=>clearTimeout(timer);}
  if(verdict==='live'){setFirstRunPhase('done');setMessage(FIRST_RUN_LIVE_MESSAGE);return;}
  if(verdict==='abandon'){setFirstRunPhase('done');return;}
  if(workspaceTransaction.current||storageMutation.current){const timer=setTimeout(()=>setFirstRunTick(value=>value+1),250);return()=>clearTimeout(timer);}
  setFirstRunPhase('fallback');enterExampleMode(FIRST_RUN_EXAMPLE_SYMBOL);setMessage(FIRST_RUN_FALLBACK_MESSAGE);
 },[firstRunPhase,firstRunTick,loaded,liveDatasets,workspace.sourceId,workspace.symbol,dataset,exampleBook]);
 /** The first-run banner's Try live again: leave the example data and open live BTC-USD again, under a new wait. */
 function retryFirstRunLive(){
  const back=exampleReturn.current;firstRun.current={loadedAt:Date.now(),openedAt:0};setFirstRunPhase('opening');leaveExampleMode();
  if(!back)openLive(COINBASE_PROVIDER_ID,FIRST_RUN_PRODUCT,FIRST_RUN_INTERVAL);
 }
 return <main className={'workspace'+(activeRailPanel?'':' lv-panel-collapsed')} data-lv-rail-dialog={dialog&&RAIL_DIALOGS.has(dialog)?'':undefined} data-lv-starting={!loaded&&startupView.phase==='loading'?'':undefined} data-theme={workspace.themeId} data-layout-setup={layoutSetup?'open':undefined} style={layoutSetup?{['--lv-layout-setup-right' as string]:layoutSetup.right+'px'}:undefined} aria-busy={workspaceBusy} inert={workspaceBusy||undefined}><DetailSourcesProvider value={{datasets:universe,news:workspace.news.documents,filings:workspace.filings,facts:workspace.fundamentals,links:workspace.fundamentalsPreferences.links,heatmap:workspace.heatmap.metadata,onOpenNews:()=>setDialog('news')}}>
  {layoutTabs}
  <header className="topbar"><button type="button" className="brand brand-logo-button" id="lv-main-menu-trigger" title="Main menu" aria-label="Main menu" aria-haspopup="menu" aria-expanded={shellMenuOpen==='main'} aria-controls="lv-main-menu" onClick={()=>setShellMenuOpen(shellMenuOpen==='main'?null:'main')} onKeyDown={event=>{if(event.key==='ArrowDown'&&shellMenuOpen!=='main'){event.preventDefault();setShellMenuOpen('main');}}}><img src={larryVisionLogo} alt="" width="28" height="28"/></button>{shellMenu({id:'lv-main-menu',label:'Main menu',open:shellMenuOpen==='main',items:secondaryWindow?secondaryMenu(mainMenuItems):mainMenuItems,onClose:closeShellMenu,menuRef:mainMenuRef,triggerId:'lv-main-menu-trigger',className:'lv-main-menu'})}{reuse('toolbar:symbol',<HeaderSymbolButton symbol={dataset.instrument.symbol} onOpen={openSymbolSearch} onInfo={()=>{setSymbolInfoDataset(null);setDialog('symbol-info');}}/>)}<button className="lv-icon-button" aria-label="Compare" title="Compare or add symbol" onClick={()=>setDialog('compare')} disabled={!chart}><CompareIcon/></button><span className="toolbar-divider"/>{/* Fixed favorites, the active one highlighted; the dropdown shows the current interval only when it is not a favorite. */intervalToolbar({favorites:sortIntervalIds(workspace.intervals.favorites),currentId:currentIntervalId(workspace.chartStyle,workspace.chartTypeSettings,dataset.resolution),menuOpen:intervalMenuLeft!==null,onToggleMenu:toggleIntervalMenu,onPick:favoriteInterval})}<span className="toolbar-divider"/>{reuse('toolbar:chart-type',<ChartTypeMenu value={workspace.chartStyle} types={chartTypes} onSelect={changeChartStyle} favorites={workspace.chartTypeFavorites} onFavoritesChange={next=>commit({chartTypeFavorites:next})}/>)}<span className="toolbar-divider"/><button className="lv-icon-text" aria-label="Indicators" title="Indicators" onClick={()=>setDialog('indicators')} disabled={!chart}><IndicatorsIcon/><span>Indicators</span></button><span className="lv-template-menu-host"><button aria-label="Indicator templates" aria-haspopup="menu" aria-expanded={templateMenu} disabled={!chart} onClick={()=>{if(templateMenu){setTemplateMenu(false);return;}if(replay?.playing){const paused=setReplayPlaying(replay,false);currentReplay.current=paused;editReplay(paused);setMessage('Replay paused for template editing.');}setTemplateMenu(true);}} className="lv-icon-button" title="Indicator templates"><IndicatorTemplatesIcon/></button>{templateMenu&&chart&&<IndicatorTemplatesMenu library={workspace.indicatorTemplates} applied={appliedTemplate} onApply={template=>{void (async()=>{try{const preview=await previewTemplate(template);const outcome=await preview.apply();if(outcome&&outcome.publicationErrors.length)setMessage(outcome.publicationErrors.join(' '));setAppliedTemplate({name:template.name});}catch(error){reportFailure(error);}})();}} onUndo={()=>{setAppliedTemplate(null);void restoreHistory('undo');}} onSave={()=>{setTemplateTab('save');setDialog('templates');}} onManage={()=>{setTemplateTab('saved');setDialog('templates');}} onClose={()=>setTemplateMenu(false)}/>}</span><span className="toolbar-divider"/><button className="lv-icon-text" aria-label="Create alert" title="Create alert (Alt+A)" disabled={!chart||!loaded} onClick={openAlertCreate}><AlertIcon/><span>Alert</span></button><button className={'lv-icon-text'+(replaySession||replay?' active':'')} aria-label="Replay" title="Bar replay" aria-pressed={!!replaySession||!!replay} onClick={()=>replaySession||replayRefusal||replay?closeReplayPanel():openReplayPanel()}><ReplayIcon/><span> Replay</span></button><span className="toolbar-divider"/><button className="lv-icon-button" onClick={undo} title="Undo (Ctrl+Z)" aria-label="Undo"><UndoIcon/></button><button className="lv-icon-button" onClick={redo} title="Redo (Ctrl+Y)" aria-label="Redo"><RedoIcon/></button><div className="topbar-spacer"/><button className="lv-icon-button" ref={layoutSetupButton} aria-label="Layout setup" title="Layout setup" aria-expanded={!!layoutSetup} aria-haspopup="dialog" disabled={!loaded||!workspace.grid} onClick={event=>toggleLayoutSetup(event.currentTarget)}><LayoutSetupIcon/></button>{workspace.layoutLibrary&&workspace.grid?layoutMenuView({library:workspace.layoutLibrary,grid:workspace.grid,state:layoutMenu,disabled:!loaded,onState:setLayoutMenu,onAction:action=>layoutAction(action,'menu'),onOpenLibrary:()=>{setLayoutMenu(null);setDialog('layouts');},onError:reportFailure}):<button type="button" className="layout-library-button" aria-label="Manage layouts" aria-haspopup="menu" disabled>Local layout<ChevronDownIcon/></button>}<button onClick={()=>void save()} disabled={!loaded} className="save-button">Save</button><span className="toolbar-divider"/><button className="lv-icon-button" aria-label="Quick search" title="Quick search (Ctrl+K)" onClick={()=>openQuickSearch()}><QuickSearchIcon/></button><button className="lv-icon-button" onClick={()=>openSettings()} title="Chart settings" aria-label="Chart settings"><SettingsIcon/></button><button className="lv-icon-button" aria-label="Fullscreen" title="Fullscreen" onClick={toggleFullscreen}><FullscreenIcon/></button><SnapshotMenu disabled={!chart} onDownload={exportImage} onCopy={copyActiveChartImage}/></header>
  <aside className="drawing-toolbar" aria-label="Drawing tools">{reuse('toolbar:drawing',<DrawingToolbar favorites={workspace.drawingFavorites} onFavoritesChange={changeDrawingFavorites} chart={chart} activeTool={activeTool} activeMode={activeMode} onSelect={armTool} onCursor={disarmTool} onMode={changeDrawingMode} enabledModes={['measure','eraser']} activeCursor={activeCursor} onCursorKind={changeCursorKind} onOpenAll={()=>setDialog('tools')}/>,[changeDrawingFavorites],['enabledModes'])}<input ref={attachImageInput} type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp" aria-label="Choose an image" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void addImageFile(file);}}/><div className="tool-divider"/>{reuse('toolbar:magnet',<MagnetControl preferences={workspace.drawingPreferences} open={utilityMenu==='magnet'} onOpen={open=>setUtilityMenu(open?'magnet':null)} onToggle={()=>deferDrawingPreference(()=>{const prefs=current.current.drawingPreferences;changeDrawingPreferences(reconcileDrawingPreferences(prefs,{magnet:prefs.magnet==='off'?prefs.lastEnabledMagnet:'off',stay:prefs.stay}));})} onSelect={strength=>deferDrawingPreference(()=>changeDrawingPreferences(reconcileDrawingPreferences(current.current.drawingPreferences,{magnet:strength,stay:current.current.drawingPreferences.stay})))} onSnapIndicators={()=>deferDrawingPreference(()=>{const prefs=current.current.drawingPreferences;changeDrawingPreferences({...prefs,snapToIndicators:prefs.snapToIndicators!==true});})}/>)}<button type="button" aria-label="Stay in drawing mode" aria-pressed={stay} title="Stay in drawing mode" className={stay?'active':''} onClick={()=>deferDrawingPreference(()=>changeDrawingPreferences(reconcileDrawingPreferences(current.current.drawingPreferences,{magnet:current.current.drawingPreferences.magnet,stay:!current.current.drawingPreferences.stay})))}><KeepDrawingIcon/></button><div className="tool-divider"/>{reuse('toolbar:utility',<DrawingUtilityBlock utility={utility} canZoomOut={zoomCanOut} zoomArmed={zoomArmed} counts={removeCounts} openMenu={utilityMenu} disabled={!chart} onOpenMenu={setUtilityMenu} onZoomIn={()=>setZoomArmed(value=>!value)} onZoomOut={()=>{chart?.drawingUtility?.zoomOut();}} onToggleLock={()=>changeUtility(toggleLock)} onToggleHide={()=>changeUtility(toggleHide)} onToggleSync={()=>changeUtility(toggleSync)} onSelectLock={mode=>changeUtility(value=>selectLockMode(value,mode))} onSelectHide={mode=>changeUtility(value=>selectHideMode(value,mode))} onSelectSync={mode=>changeUtility(value=>selectSyncMode(value,mode))} onRemove={removeFromToolbar} onToggleRemoveLocked={()=>changeUtility(toggleRemoveLocked)}/>,[],['counts'])}</aside>
  <section className="chart-workspace" data-anchor-placing={anchorPlacement?'true':undefined} onPointerMove={event=>{if(replaySessionRef.current?.phase!=='selecting-start')return;const box=(event.currentTarget as HTMLElement).getBoundingClientRect?.(),inspected=chart?.getDataWindow().standard;setReplayPointer({x:event.clientX-(box?.left??0),time:inspected?.hovered&&inspected.bar?inspected.bar.time:null});}} onClickCapture={event=>{const down=anchorDown.current;anchorDown.current=null;if(anchorPlacementRef.current&&down&&Math.hypot(event.clientX-down.x,event.clientY-down.y)>4)return;/* a drag pans the chart, it does not place */if(anchorPlacementRef.current&&(event.target as Element)?.closest?.('[data-chart-tree]')&&!(event.target as Element).closest('[data-lv-context-menu],.lv-legend-row')){event.preventDefault();event.stopPropagation();const inspected=chart?.getDataWindow().standard;placeAnchorAt(inspected?.hovered&&inspected.bar?inspected.bar.time:null);return;}if(replaySessionRef.current?.phase!=='selecting-start'||!(event.target as Element)?.closest?.('[data-chart-tree]')||(event.target as Element).closest('[data-lv-context-menu]'))return;event.preventDefault();event.stopPropagation();const inspected=chart?.getDataWindow().standard;selectReplayStartAt(inspected?.hovered&&inspected.bar?inspected.bar.time:null);}} onKeyDown={event=>{if(event.key==='Escape'&&layoutSetup&&(event.target as Element)?.closest?.('.lv-multichart')){event.stopPropagation();closeLayoutSetup(true);}}} onPointerDownCapture={event=>{anchorDown.current=anchorPlacementRef.current?{x:event.clientX,y:event.clientY}:null;if(layoutSetup&&!(event.target as Element)?.closest?.('.lv-multichart > div:first-child'))closeLayoutSetup(false);}}><div ref={mainSeriesHeadingRef} className="chart-heading" title={chartHeadingLabels(dataset.provenance,bars.length).title} data-status-background={statusBackground?'on':'off'} data-chart-surface={chartSurfaceProps(appearance)['data-chart-surface']} style={{...chartSurfaceProps(appearance).style,...(statusBackground?{background:statusBackground}:{})}}><div>{statusLineLead(statusLine,<><b className="synthetic-badge">{chartHeadingLabels(dataset.provenance,bars.length).badge}</b>{replay&&<b className="synthetic-badge">REPLAY</b>}{seriesLegendEye(seriesHidden,()=>setSeriesVisibility(true))}</>,{onTitle:()=>openSymbolSearch('','toolbar'),onInterval:()=>toggleIntervalMenu()})}<span className="lv-series-buttons">{seriesButtons}</span></div><div className="ohlc">{hoverSlot(undefined,()=>{const {statusLine,headerBar,headerChange}=hoverReadout();return statusLineValues(statusLine,headerBar?headerChange:null);})}</div></div>{seriesMenuView}<ActiveSeriesHeadingPlacement chart={chart} heading={mainSeriesHeadingRef} menu={mainSeriesMenuRef} owner={mainSeriesHeadingOwner} holdKey={(workspace.grid?.layout.activeCellId??'')+'|'+dataset.instrument.symbol+'|'+dataset.resolution+'|'+workspace.chartStyle} isCurrent={()=>chart===activeController.current&&workspace===current.current&&ownsRenderedAnalysis()&&paneLegendOwnerCurrent()}/>
   {loaded&&workspace.grid&&<WorkspaceChartHost key={gridEpoch} {...ownedDrawing} drawingSyncOn={utility.syncOn} onDrawingSyncChange={on=>changeUtility(value=>on===value.syncOn?value:{...value,syncOn:on})} zoomArmed={zoomArmed} zoomTimeAt={(_cellId,clientX)=>zoomTimeAt(clientX)} zoomBarInterval={()=>bars.length>=2?bars[bars.length-1].time-bars[bars.length-2].time:60} zoomRange={(_cellId,from,to)=>{try{chart?.drawingUtility.zoomCommit(from,to);}catch(error){reportFailure(error);}setZoomArmed(false);}} zoomCancel={()=>setZoomArmed(false)} studyFavorites={workspace.indicatorLibrary.favorites} onStudyIntent={ownedGrid.studyIntent} contextActions={contextActions} onHostReady={ownedGrid.hostReady} onTransactionReady={ownedGrid.transactionReady} drawingPreferences={workspace.drawingPreferences} onDrawingPreferencesChange={ownedGrid.acceptDrawingPreferences} onHeldDrawingChange={ownedGrid.heldDrawingChange} state={workspace.grid} datasets={universe} activeBars={bars} activeDatasetId={dataset.provenance.datasetId} activeExecutionIdentity={replay?.runId??'ordinary'} replayCellBars={replayCellBars} chartSettings={workspace.chartSettings} onOpenSettings={tab=>openSettings(tab)} onScriptResult={ownedGrid.scriptExecution} appearance={appearance} onChange={publishOwnedGrid} onRequestResize={ownedGrid.requestLayoutResize} newChartTimezone={data=>newChartTimezone(current.current,data?.instrument)} onReady={ownedGrid.setChartReady} onCellCrosshair={gridHoverStore(gridHost).onCellCrosshair} onActiveCell={ownedGrid.activeCell}/> }
   {loaded&&workspace.grid&&<DemonstrationOverlay active={activeCursor==='demonstration'&&!activeTool&&!activeMode&&!zoomArmed}/>}
   {loaded&&demoDataMode()!=='legacy'&&firstRunPhase!=='opening'&&workspace.grid&&(()=>{/* One needs-live card per empty cell, sized to the cell. */const grid=workspace.grid,cells=needsLiveCellsOf(grid,universe,dataset);return cells.length?<NeedsLiveCells onCommand={id=>commandRuns[id]?.run()} cells={cells} single={grid.layout.cells.length===1} onOpenLive={openLiveInCell} onOpenDataSources={()=>openSettings('datasources')} onLoadExample={enterExampleMode}/>:null;})()}
   {loaded&&demoDataMode()==='example'&&(!workspace.grid||workspace.grid.layout.cells.some(r=>(r.id===workspace.grid!.layout.activeCellId?dataset:universe.find(i=>i.provenance.datasetId===workspace.grid!.cells[r.id]?.datasetId&&i.instrument.symbol===r.symbol))?.provenance.fixture))&&(firstRunPhase==='fallback'?<ExampleDataBanner text={FIRST_RUN_BANNER_TEXT} leaveLabel={FIRST_RUN_RETRY_LABEL} onLeave={retryFirstRunLive}/>:<ExampleDataBanner onLeave={leaveExampleMode}/>)}
   {!loaded&&<section className="source-note" role="status" aria-label="Workspace startup recovery"><h2>{startupView.phase==='loading'?'Loading local workspace':'Saved workspace needs recovery'}</h2><p>{startupView.error||'Waiting for the saved workspace revision. No changes will be written while loading.'}</p>{startupView.phase!=='loading'&&<><button onClick={()=>void loadStoredWorkspace(startupView)}>Retry loading</button><button onClick={()=>setDialog('storage')}>Review local recovery options</button></>}</section>}
   {(indicatorViews.length>0||workspace.scriptBindings.length>0||comparisonCount>0)&&<React.Fragment>{hoverSlot(()=>legendVisible&&workspace.scriptBindings.length?hoverInspection.version:0,()=>{const {validInspection,headerBar}=hoverReadout();return <div ref={legendRef} className="indicator-legend" data-legend-visible={legendVisible?'true':'false'} {...chartSurfaceProps(appearance)}>{[
    ...(legendVisible&&workspace.scriptBindings.length?[<ScriptLegendRows key="lv-script-legend" chart={chart} bindings={workspace.scriptBindings} showTitles={shownSettings.statusLine.indicatorTitles} showInputs={shownSettings.statusLine.indicatorInputs} showValues={statusLine.indicators.values} formatValue={statusLinePriceFormat(shownSettings.symbol.precision,dataset.instrument.tickSize,isSymbolMathDatasetId(dataset.provenance.datasetId)?headerBar?.close??null:null)} owner={mainSeriesHeadingOwner} context={{datasetId:source.datasetId,basisIdentity:source.basisIdentity,inputIdentity:source.inputIdentity,resolution:source.resolution,sessionOverride:source.sessionOverride,style:workspace.chartStyle,execution:replay?.runId??'ordinary',cellId:paneLegendCellId,treeEpoch:gridEpoch}} position={activeScriptLegendPosition({chart,inspection:validInspection,hover:gridHoverStore(gridHost).hover,grid:workspace.grid,style:workspace.chartStyle,current:paneLegendOwnerCurrent()&&current.current.chartStyle===workspace.chartStyle})} composeRows={composeScriptLegendRows} onTablePlacement={(binding,destination)=>{if(!chart||!paneLegendCellId)return false;return changeScriptTableDestination(chart,paneLegendCellId,binding,destination,()=>{assertRenderedAnalysisOwner();assertActiveAnalysisChart();if(!paneLegendOwnerCurrent())throw Error('This script chart changed.');});}} isCurrent={()=>paneLegendOwnerCurrent()&&current.current.chartStyle===workspace.chartStyle} onBindingsChange={scriptBindings=>{if(workspace!==current.current||!paneLegendOwnerCurrent()||!ownsRenderedAnalysis())return false;assertActiveAnalysisChart();if(workspace!==current.current||!paneLegendOwnerCurrent()||!ownsRenderedAnalysis())return false;return commit({scriptBindings});}}/>]:[]),
    ...(!(legendVisible&&workspace.scriptBindings.length)?[composeScriptLegendRows([])]:[]),
    <PaneIndicatorLayer key="pane-positions" chart={chart} host={legendRef} ownerKey={paneLegendOwnerKey} isCurrent={paneLegendOwnerCurrent} onPriceBottom={bottom=>{if(paneLegendOwnerCurrent())setLegendBottom(previous=>previous===bottom?previous:bottom);}}/>,
   ]}</div>;})}{hoverSlot(hoverSnapshotKey,()=>{const snapshotBinding=snapshotBindingNow();return legendVisible&&snapshotBinding?.seriesKey&&<SnapshotLegendPublisher host={legendRef} binding={snapshotBinding}/>;})}</React.Fragment>}
   {loaded&&activeAccount&&<ChartTradingButtons seeThrough={(workspace.grid?.layout.cells.length??1)>1} placement={{chart,owner:mainSeriesHeadingOwner,isCurrent:()=>chart===activeController.current&&workspace===current.current&&paneLegendOwnerCurrent()&&current.current.chartStyle===workspace.chartStyle}} visible={shownSettings.trading.buySellButtons} legend={legendState} legendBottom={indicatorViews.length>0||workspace.scriptBindings.length>0?legendBottom:0} quote={virtualActionQuote?{bid:virtualActionQuote.bid,ask:virtualActionQuote.ask,basis:(virtualActionQuote as {basis?:'last-imported-bar'}).basis}:null} lastPrice={!replay&&isLiveDatasetId(dataset.provenance.datasetId)?last?.close??null:null} digits={priceDigits} presetName={selectedPreset?.name??null} presetTooltip={selectedPreset?presetSummary(selectedPreset):null} oneClick={activeAccount.settings.oneClick??false} disabledReason={!loaded||workspaceBusy?'Wait for the workspace change to finish.':derivedTrade} actionKey={[activeAccount.id,activeAccount.runId,selectedPresetId,dataset.instrument.id].join('|')} quantity={chartQty} onQuantity={setChartQty} onBuy={(commandId,quantity)=>chartPresetAction('buy',commandId,quantity)} onSell={(commandId,quantity)=>chartPresetAction('sell',commandId,quantity)} onRefused={setMessage}/>}
   {loaded&&hoverSlot(hoverSnapshotKey,()=>{const snapshotBinding=snapshotBindingNow();return <AlertChartLines tagBoard={axisTagBoard} snapshot={snapshotBinding??undefined} rows={alertLineRows({alerts,cell:{instrumentId:dataset.instrument.id,datasetKey:[alertDatasetKey(dataset,1),alertDatasetKey(dataset,2)]},settings:{lines:workspace.chartSettings.alerts.lines,activeOnly:workspace.chartSettings.alerts.activeOnly,labelsVisible:workspace.chartSettings.alerts.labelsVisible},format:value=>value.toFixed(priceDigits)})} tickSize={dataset.instrument.tickSize} visible={workspace.chartSettings.alerts.lines.visible} projection={()=>snapshotOwnerCurrent()?(chart as unknown as {pricePaneProjection?:()=>PaperPriceProjection|null}|null)?.pricePaneProjection?.()??null:null} onReprice={(alertId,slot,price)=>{try{const base=financial.current.alerts,next=repriceAlert(base,{alertId,slot,price,tickSize:dataset.instrument.tickSize,now:Math.floor(Date.now()/1000)});return next===base?true:ownedFinancial.setAlerts(next,base);}catch(cause){setMessage(cause instanceof Error?cause.message:String(cause));return false;}}}/>;},SNAPSHOT_OVERLAY_SETTLE_MS)}
   {loaded&&<StrategyTradeMarks execution={strategyExecution} config={workspace.strategy} projection={()=>(chart as unknown as {pricePaneProjection?:()=>PaperPriceProjection|null}|null)?.pricePaneProjection?.()??null} timeToX={seconds=>chart?.timeToX?.(seconds)??null}/>}
   {loaded&&activeAccount&&<PaperExecutionMarks account={activeAccount} instrument={dataset.instrument} bars={bars} settings={{marks:shownSettings.trading.executionMarks,labels:shownSettings.trading.executionLabels,sound:shownSettings.trading.executionSound}} projection={()=>(chart as unknown as {pricePaneProjection?:()=>PaperPriceProjection|null}|null)?.pricePaneProjection?.()??null} timeToX={seconds=>chart?.timeToX?.(seconds)??null}/>}
   {loaded&&activeAccount&&<PaperTradingToasts account={activeAccount} rejectionOnly={shownSettings.trading.rejectionOnly}/>}
   {loaded&&activeAccount&&<PaperChartLines tagBoard={axisTagBoard} account={activeAccount} instrument={dataset.instrument} visible={shownSettings.trading.positionsAndOrders&&workspace.drawingUtility.positionsHidden!==true} profitLoss={{visible:shownSettings.trading.profitLoss,position:shownSettings.trading.positionPL,brackets:shownSettings.trading.bracketsPL}} alignment={shownSettings.trading.alignment} extendLines={shownSettings.trading.extendLines} projection={()=>(chart as unknown as {pricePaneProjection?:()=>PaperPriceProjection|null}|null)?.pricePaneProjection?.()??null} onModifyOrder={(orderId,changes:PaperOrderChange)=>paperAction((account,now)=>modifyPaperOrder(account,orderId,changes,now))} onCancelOrder={orderId=>{paperAction((account,now)=>cancelPaperOrder(account,orderId,now));}} onClosePosition={instrumentId=>{paperAction((account,now)=>closePaperPosition(account,instrumentId,now));}} showReverse={shownSettings.trading.reverseButton} projectMarketOrders={shownSettings.trading.projectMarketOrders} lastPrice={last?.close??null} onReversePosition={instrumentId=>{const symbol=activeAccount.positions[instrumentId]?.instrument.symbol??dataset.instrument.symbol;if(paperAction((account,now)=>reversePaperPosition(account,instrumentId,now)))setMessage(`${symbol} position reversed.`);}} onModifyExit={(orderId,price,pending)=>paperAction((account,now)=>applyPaperExitDrag(account,orderId,price,dataset.instrument.tickSize,now,pending)??{ok:true,account,diagnostics:[]})} onAttachExit={(instrumentId,leg,price)=>paperAction((account,now)=>attachPaperExitDrag(account,instrumentId,leg,price,now))} confirmActions={!activeAccount.settings.oneClick} onNotice={setMessage}/>}
   {selectedDrawing&&selectedDrawingIds.length>=2&&selectedDrawingIds.includes(selectedDrawing)&&chart&&<MultiSelectionBar chart={chart} ids={selectedDrawingIds} rows={drawings} onChanged={captureDrawings} onMessage={setMessage} deferEdit={(run,ids)=>queueDrawingEdit(run,{drawings:ids},chart)}/>}
   {selectedDrawing&&selectedDrawingIds.length<2&&drawings.some(x=>x.id===selectedDrawing&&x.visible!==false)&&<DrawingEditBar near={editBarNear} extra={chart?<BarsPatternResolutionChip chart={chart} id={selectedDrawing} data={barsPatternData} onChange={confirmDrawingCapture} onMessage={setMessage} deferEdit={(run,id)=>queueDrawingEdit(run,{drawings:[id]},chart)}/>:null} onSettings={()=>setDialog('drawing')} onLock={()=>drawingAction(()=>chart?.drawingManager.set([selectedDrawing],{locked:!(drawings.find(x=>x.id===selectedDrawing)?.locked)}),[selectedDrawing])} onDuplicate={()=>drawingAction(()=>chart?.drawings.duplicate([selectedDrawing]),[selectedDrawing])} locked={!!drawings.find(x=>x.id===selectedDrawing)?.locked} onHide={()=>drawingAction(()=>{const show=drawings.find(x=>x.id===selectedDrawing)?.visible===false;chart?.drawingManager.set([selectedDrawing],{visible:show});/* Hiding clears the selection, so its toolbar goes with the line. */if(!show)try{chart?.drawings.select([]);}catch{/* The render guard still hides the bar. */}},[selectedDrawing])} onFront={()=>drawingAction(()=>chart?.drawingManager.order([selectedDrawing],'front'),[selectedDrawing])} onBack={()=>drawingAction(()=>chart?.drawingManager.order([selectedDrawing],'back'),[selectedDrawing])} properties={selectedDrawingProperties} templates={selectedDrawingTemplates} sync={{scope:editBarSyncScope(drawings.find(x=>x.id===selectedDrawing)),onChange:editBarSyncChange(drawings.find(x=>x.id===selectedDrawing),chart?scope=>drawingAction(()=>{chart.drawingManager.setSyncScope(selectedDrawing,scope);},[selectedDrawing]):null)}} orderDisabled={selectedDrawingOrder} onForward={()=>drawingAction(()=>chart?.drawingManager.order([selectedDrawing],'forward'),[selectedDrawing])} onBackward={()=>drawingAction(()=>chart?.drawingManager.order([selectedDrawing],'backward'),[selectedDrawing])} onCopy={()=>{try{chart?.copyDrawings([selectedDrawing]);setMessage('Drawing copied. Press Ctrl+V to paste it.');}catch(error){reportFailure(error);}}} onVisibility={()=>{const prior=dialogAuthority.current;setDialog('drawing');if(dialogAuthority.current!==prior)routeDrawingDialogTab(dialogAuthority.current,'Visibility');}} onObjectTree={()=>{setRailPanel('objects');setObjectTreeTab('object_tree');}} {...(()=>{/* More > Move to (drawing-pane-move.ts). */const id=selectedDrawing,targets=(typeof chart?.drawingMoveTargets==='function'?chart.drawingMoveTargets(id):null)??{above:null,below:null},run=(paneId:string|null)=>paneId?()=>drawingAction(()=>{chart?.moveDrawingsToPane([id],paneId);},[id]):undefined;return{onMoveAbove:run(targets.above),onMoveBelow:run(targets.below)};})()} onAlert={()=>openDrawingAlert(selectedDrawing)} onDelete={()=>drawingAction(()=>{chart?.drawings.remove(selectedDrawing);setSelectedDrawing(null);},[selectedDrawing])}/>}
   {anchorPlacement&&<div className="lv-anchor-placement" role="status" data-anchor-placement="true"><span>Click a bar to anchor Anchored VWAP</span><button type="button" onClick={()=>endAnchorPlacement(true)}>Cancel</button></div>}
   {replaySession?.phase==='selecting-start'&&replayPointer&&<ReplayScissors x={replayPointer.x} valid={replayPointer.time!==null&&replayStartCandidate(dataset,replayPointer.time).ok} label={replayPointer.time===null?'Choose a bar on the chart.':(()=>{const candidate=replayStartCandidate(dataset,replayPointer.time);return candidate.ok?replayStartLabel(candidate.time,shownTimeZone,dataset.resolution,workspace.chartSettings.scales):candidate.reason;})()}/>}
   {(replaySession||replayRefusal||replaySaved&&!replayPanelHidden)&&<ReplayPanel session={replaySession} saved={replaySaved} intervalMenu={replayMenu} multiChart={(workspace.grid?.layout.cells.length??1)>1} atEnd={!!replaySession&&replaySession.clock!==null&&!replayTimelineNow.some(time=>time>(replaySession.clock??Infinity))} unsupportedReason={replayRefusal} timezone={shownTimeZone} onSelectStart={()=>replaySession&&!replayNeedsFreshStart(replaySession)?replayTransition(beginReplayStartSelection):openReplayPanel()} onTogglePlay={replayTogglePlay} onStep={replayStep} onSpeed={speed=>replayTransition(session=>setReplaySessionSpeed(session,speed))} onInterval={replayInterval} onScope={scope=>replayTransition(session=>{const raw=workspaceDatasets(current.current),frozen=freezeLiveDatasets(raw,replaySnapshotsRef.current);replaySnapshotStage.current=frozen;return setReplayScope(session,scope,replayLayoutParticipants(replayParticipantsOf(current.current,pinReplayDatasets(raw,frozen)),session.activeCellId,id=>isLiveDatasetId(id)&&!frozen[id]));})} liveNote={liveReplayHeld?REPLAY_SNAPSHOT_NOTE:null} onRealtime={()=>replayTransition(session=>jumpReplayToRealtime(session).session)} onClose={closeReplayPanel} onContinue={continueSavedReplay} onStepBack={replayStepBack} canStepBack={replayCanStepBack(replaySession,replayTimelineNow)} onStartPoint={replayStartFrom} account={replay&&replayPaper?{equity:paperDockSummary(replayPaper,Math.max(replayPaper.clock,virtualNow)).equity,currency:replayPaper.settings.currency}:null} quickTrade={replay&&!derivedTrade?{lotSize:dataset.instrument.lotSize,bid:virtualActionQuote?.instrumentId===dataset.instrument.id?replayQuickPrice(virtualActionQuote.bid,dataset.instrument.tickSize):null,ask:virtualActionQuote?.instrumentId===dataset.instrument.id?replayQuickPrice(virtualActionQuote.ask,dataset.instrument.tickSize):null,position:replayQuickPosition(replayPaper?.runId===replay.runId?replayPaper:null,dataset.instrument),onOrder:(side,quantity)=>paperAction((account,now)=>replayQuickOrder(account,dataset.instrument,side,quantity,virtualActionQuote,now)),onFlatten:()=>paperAction((account,now)=>replayQuickFlatten(account,dataset.instrument,virtualActionQuote,now))}:null} onTrading={()=>setPaperDockOpen(true)}/>}
   {loaded&&<ChartNavigationButtons visibility={shownSettings.canvas.navigationButtons} target={chart} onReset={()=>priceScaleKey('resetChart')} onMessage={setMessage}/>}
   {loaded&&<LockedTimeLine cellId={workspace.grid?.layout.activeCellId??null} projection={()=>(chart as unknown as {pricePaneProjection?:()=>PaperPriceProjection|null}|null)?.pricePaneProjection?.()??null} timeToX={seconds=>chart?.timeToX?.(seconds)??null}/>}
   <ScrollToLatestButton chart={chart} lastTime={last?.time??null} barSeconds={bars.length>=2?bars[bars.length-1].time-bars[bars.length-2].time:60} marginBars={workspace.chartSettings.canvas.rightMarginBars} onMessage={setMessage}/>
   {loaded&&<BarMarksGate cellId={workspace.grid?.layout.activeCellId}>{hoverSlot(hoverSnapshotKey,()=>{const snapshotBinding=snapshotBindingNow();return <ChartEventMarkers snapshot={snapshotBinding??undefined} symbol={chartEventSymbol(dataset.provenance.providerId,dataset.instrument.symbol)} bars={bars} settings={{dividends:shownSettings.events.dividends,splits:shownSettings.events.splits}} synthetic={dataset.provenance.providerId===ALPACA_STUB_PROVIDER_ID} projection={()=>snapshotOwnerCurrent()?(chart as unknown as {pricePaneProjection?:()=>PaperPriceProjection|null}|null)?.pricePaneProjection?.()??null:null} timeToX={seconds=>snapshotOwnerCurrent()?chart?.timeToX?.(seconds)??null:null} sourceKey={dataset.provenance.datasetId} onDiagnostic={setMessage}/>;},SNAPSHOT_OVERLAY_SETTLE_MS)}<CalendarChartMarkers documents={workspace.calendar.documents} symbol={dataset.instrument.symbol} bars={bars} settings={calendarMarkerSettings(shownSettings.events,chartEventSymbol(dataset.provenance.providerId,dataset.instrument.symbol)!==null,shownTimeZone)} projection={()=>snapshotOwnerCurrent()?(chart as unknown as {pricePaneProjection?:()=>PaperPriceProjection|null}|null)?.pricePaneProjection?.()??null:null} timeToX={seconds=>snapshotOwnerCurrent()?chart?.timeToX?.(seconds)??null:null} onOpen={entry=>{setCalendarEntry({nonce:crypto.randomUUID(),focus:entry});setDialog('calendar');}}/><NewsChartMarkers documents={workspace.news.documents} symbol={dataset.instrument.symbol} bars={bars} settings={{latestNews:shownSettings.events.latestNews,newsNotification:shownSettings.events.newsNotification}} projection={()=>snapshotOwnerCurrent()?(chart as unknown as {pricePaneProjection?:()=>PaperPriceProjection|null}|null)?.pricePaneProjection?.()??null:null} timeToX={seconds=>snapshotOwnerCurrent()?chart?.timeToX?.(seconds)??null:null} onOpen={()=>setDialog('news')} onNotify={setMessage}/></BarMarksGate>}
   {reuse('toolbar:bottom',<ChartBottomToolbar chartReady={!!chart} timezone={workspace.chartOptions.timezone} timeHours={shownTimeHours} exchangeTimezone={dataset.provenance.timezone??null} adjustment={dataset.provenance.adjustment} dividendsAdjustment={dividendsAdjustment} onAdjust={next=>{try{const settings=current.current.chartSettings;commit({chartSettings:{...settings,symbol:{...settings.symbol,dividendsAdjustment:next}}});}catch(error){reportFailure(error);}}} onGoTo={()=>setDialog('date')} onTimezone={zone=>{try{const chartOptions={...current.current.chartOptions,timezone:zone};validateChartOptions(chartOptions);commit({chartOptions});}catch(error){reportFailure(error);}}} served={bottomServed} onRange={row=>rangeFromBottomToolbar(row)} onMessage={setMessage} {...(sessionsApply(rawDataset.instrument.assetClass,rawDataset.instrument.timezone,barIntervalMs(rawDataset.bars))?{session:sessionMode,sessionOwner:chart,sessionDisabled:workspaceBusy||storageBusy||!loaded||!ownsRenderedAnalysis(),sessionReason:cellSessionRefusal(rawCellSessionDataset(dataset),sessionMode==='extended'?'regular':'extended')??undefined,onSession:(mode:SessionMode)=>{if(workspaceBusy||storageBusy||!loaded||!ownsRenderedAnalysis())throw Error('Wait for the active chart to finish updating before changing trading hours.');const id=current.current.grid?.layout.activeCellId,owner=coordinator.current;if(id&&owner?.setCellSession)return owner.setCellSession(id,mode);throw Error('Wait for the chart to finish loading before choosing trading hours.');}}:{})}/>)}
   {loaded&&reuse('bottom-panel',<BottomPanel view={bottomView} tabs={bottomPanelTabsFor(!!activeAccount,tablesOffered)} tables={tablesOffered?<ScriptTablesPanel layoutId={bottomPanelLayoutId(workspace)} revision={workspace.grid} source={coordinator.current?.scriptTables??null} active={bottomView.open&&bottomView.tab==='tables'&&!workspaceBusy&&!storageBusy}/>:undefined} maximized={bottomMaximized} hostRefs={bottomHostRefs} onMaximize={setBottomMaximized} onChange={next=>{if(next.open&&next.tab==='script'&&!scriptDocked){setScriptDocked(true);if(dialog==='script')setDialog(null);}if(next.open&&next.tab==='strategy'&&!strategyDocked){setStrategyDocked(true);if(dialog==='strategy')setDialog(null);}changeBottomPanel(()=>next);}}/>,[],['view'])}
   {reuse('dock',loaded&&activeAccount&&<LiveBookBinding instrumentId={chartQuoteInstrument} actionQuote={virtualActionQuote} mode="dock">{reuse('dock:panel',<PaperTradingDock tradingRefusal={derivedTrade} account={activeAccount} instrument={dataset.instrument} now={Math.max(activeAccount.clock,virtualNow)} open={bottomMounted.includes('trading')} onToggle={setPaperDockOpen} embedded dockHost={tradingDockHost} replay={!!replay} onAccountChange={(next,expected)=>{if(next.id!==expected.id||next.runId!==expected.runId)paperFeedForming.current=null;return (replay?acceptReplayPaper:acceptPaper)(next,expected);}} onOpenTicket={openPaperTicket} manager={replay?undefined:paperManager} timezone={shownTimeZone} timeHours={shownTimeHours} onSelectSymbol={replay?undefined:selectPaperDockSymbol} quote={virtualActionQuote}/>)}</LiveBookBinding>)}
  </section>
  <aside className="right-panel" hidden={!activeRailPanel} aria-label={activeRailPanel?.label}>{activeRailPanel?.heading!==''&&<div className="panel-heading"><strong>{activeRailPanel?.heading??activeRailPanel?.label}</strong></div>}{/* The rail panel mounts after the first chart (or at once when the startup stops short of one) */}<StartupDeferred hold={loaded?!chart:startupView.phase==='loading'}>{activeRailPanel?.render()}<LazySurfacesPrefetch/><IntervalMenuPrewarm datasets={intervalUniverse} current={chartIdentity} state={workspace.intervals}/></StartupDeferred></aside><RightPanelSplitter hidden={!activeRailPanel}/>
  {rightRail({panels:secondaryWindow?railPanels.filter(row=>!PRIMARY_ONLY_PANELS.has(row.id)):railPanels,activePanel:activeRailPanel?.id??null,onPanel:id=>setRailPanel(nextRailPanel(railPanel,id)),topActions:railTopActions,bottomActions:secondaryWindow?railBottomActions.filter(row=>!PRIMARY_ONLY_PANELS.has(row.id)):railBottomActions,topOrder:['watchlist','alerts','objects']})}
  <footer className="statusbar"><output role="status" aria-live="polite"><span key={message} ref={placeToast /* Clear of the chart trading controls */} className={(statusAction?"lv-toast-text lv-toast-has-action":"lv-toast-text")+(message==='Local workspace restored'||message==='Loading local workspace...'?' lv-toast-quiet':'')} title={messageDetail||undefined}>{message}</span></output>{statusAction&&<button key={message} type="button" className="lv-toast-action" onClick={()=>openSettings(statusAction.tab)}>{statusAction.label}</button>}{syntheticClockText&&<output aria-label="Synthetic market clock">{syntheticClockText}</output>}</footer>
  {reuse('dialog:about',dialog==='about'&&<AboutDialog onClose={()=>{if(dialogOwner.current==='about'&&dialogAuthority.current===renderedDialogAuthority)closeDialog();}}/>,dialogDeps)}
  {dialog==='quick-search'&&quickSearchSeed&&<QuickSearchDialog key={quickSearchSeed.id} initialQuery={quickSearchSeed.query} candidates={symbolCandidates} storage={recentStorage()} index={quickSearchIndex({runs:commandRuns,shortcuts:shortcutRows,indicators:(chart?.indicators.catalog??[]).filter(kind=>!isProfileIndicator(kind)).map(kind=>({id:kind,name:indicatorNames[kind]??kind,acronym:indicatorAcronyms[kind]})),drawings:chart?DRAWING_TOOL_CATALOG:[],intervals:intervalMenuEntries(workspace.intervals).map(spec=>spec.id),currentInterval:dataset.resolution,chartTypes:chartTypes.filter(row=>!row.disabled),currentChartType:workspace.chartStyle,layouts:(workspace.layoutLibrary?.entries??[]).map(row=>({id:row.id,name:row.name,active:row.id===workspace.layoutLibrary?.activeId}))})} onRun={row=>{if(dialogOwner.current!=='quick-search'||dialogAuthority.current!==renderedDialogAuthority)return;pendingQuickSearch.current=row;closeDialog();}} onClose={()=>{if(dialogOwner.current==='quick-search'&&dialogAuthority.current===renderedDialogAuthority)closeDialog();}}/>}
  {dialog==='table-view'&&<TableViewDialog series={{symbol:dataset.instrument.symbol,exchange:dataset.instrument.exchange,interval:dataset.resolution,description:dataset.instrument.name,tickSize:dataset.instrument.tickSize}} bars={calculationBars} timezone={workspace.chartOptions.timezone} indicators={dataWindowIndicators(chart,indicatorViews)} synthetic={dataset.provenance.fixture} onClose={()=>{if(dialogOwner.current==='table-view'&&dialogAuthority.current===renderedDialogAuthority)closeDialog();}}/>}
  {reuse('dialog:symbol-info',dialog==='symbol-info'&&<SymbolInfoDialog dataset={symbolInfoDataset??chartIdentity} onClose={()=>{if(dialogOwner.current==='symbol-info'&&dialogAuthority.current===renderedDialogAuthority){setSymbolInfoDataset(null);closeDialog();}}}/>,[...dialogDeps,symbolInfoDataset,dialog==='symbol-info'?JSON.stringify(rememberedAlpacaAsset((symbolInfoDataset??chartIdentity).instrument.symbol)):null])}{reuse('dialog:shortcuts',dialog==='shortcuts'&&<KeyboardShortcutsDialog onClose={()=>{if(dialogOwner.current==='shortcuts'&&dialogAuthority.current===renderedDialogAuthority)closeDialog();}}/>,dialogDeps)}
  {reuse('dialog:layouts',dialog==='layouts'&&workspace.layoutLibrary&&workspace.grid&&<LayoutLibraryDialog library={workspace.layoutLibrary} grid={workspace.grid} ownerToken={workspace} onAction={layoutAction} onClose={closeDialog}/>,dialogDeps)}
  {dialog==='import-layout'&&layoutImport&&<Modal title="Import local layout" onClose={closeDialog}><ul>{layoutImport.summary.map((line,index)=><li key={index}>{line}</li>)}</ul><div className="dialog-actions"><button onClick={closeDialog}>Cancel</button><button onClick={()=>void applyLayoutImport()}>Add saved layout</button></div></Modal>}
  {reuse('dialog:list-alert',dialog==='list-alert'&&listAlertTarget&&<WatchQuotesBinding store={liveData} universe={universe} quotesProp="datasets">{reuse('dialog:list-alert-form',<ListAlertDialog key={listAlertEditing??'new'} book={workspace.watchBook} listId={listAlertTarget} alerts={workspace.listAlerts??[]} datasets={watchQuotes} now={()=>Math.floor(Date.now()/1000)} newId={()=>crypto.randomUUID()} onCreate={listAlerts=>commit({listAlerts})} onClose={()=>{setListAlertEditing(null);closeDialog();}} editing={listAlertEditing?(workspace.listAlerts??[]).find(row=>row.id===listAlertEditing):undefined}/>,dialogDeps,['alerts'])}</WatchQuotesBinding>,dialogDeps)}
  {dialog==='watch-advanced'&&advancedRequest&&<WatchlistAdvancedDialog key={advancedRequest.id} benchmarks={workspace.watchBenchmarks} onBenchmark={(listId,datasetId)=>{assertAdvancedOwner(advancedRequest);return commit({watchBenchmarks:setWatchBenchmark(current.current.watchBenchmarks??createWatchBenchmarks(),listId,datasetId)});}} list={activeWatchList(workspace.watchBook)} datasets={shownUniverse} fundamentals={workspace.fundamentals} fundamentalsPreferences={workspace.fundamentalsPreferences} calendarDocuments={workspace.calendar.documents} newsDocuments={workspace.news.documents} state={workspace.watchAdvanced??initial.watchAdvanced!} now={advancedRequest.now} onChange={(watchAdvanced,expected)=>{assertAdvancedOwner(advancedRequest);if(expected!==advancedRequest.state)throw new Error('Advanced View saved state changed.');return commit({watchAdvanced});}} onOpenDataset={(data,expectedSourceKey)=>{try{assertAdvancedOwner(advancedRequest);if(advancedSourceKey(data)!==expectedSourceKey)throw new Error('The selected analysis source changed.');if(!advancedRequest.datasets.includes(data)){if(advancedRequest.datasets.some(row=>row.provenance.datasetId===data.provenance.datasetId)||suppliedSourceId(current.current,data)!==null)throw new Error('The exact analysis source is no longer supplied.');}openWatchDataset(data);return{ok:true};}catch(cause){return{ok:false,error:cause instanceof Error?cause.message:String(cause)};}}} onOpenNotes={market=>{assertAdvancedOwner(advancedRequest);if(!openNotes(market))throw new Error('The note view could not be opened.');advancedOwner.current=null;dialogOwner.current='notes';}} onClose={()=>{if(advancedOwner.current===advancedRequest)closeDialog();}}/>}
  {reuse('dialog:notes',dialog==='notes'&&noteRequest&&<NotesDialog key={noteRequest.id} book={workspace.watchBook} initialMarket={noteRequest.market} initialNoteId={noteRequest.noteId} startNew={noteRequest.startNew} onChange={(watchBook,expected)=>{assertDialogContext(false);if(current.current.watchBook!==expected)throw new Error('Local notes changed. Your draft is retained.');return commit({watchBook});}} onClose={closeDialog}/>,dialogDeps)}
  {reuse('dialog:chart-settings',dialog==='chart-settings'&&<ChartSettingsDialog ownerToken={renderedDialogAuthority} isCurrent={()=>dialogAuthority.current===renderedDialogAuthority&&dialogOwner.current==='chart-settings'} themeId={workspace.themeId} appearance={workspace.appearance} onPreview={(value,payload)=>{try{assertDialogContext();setPreview(value);setSettingsPreview(payload.document??null);}catch(cause){reportFailure(cause);}}} onCancel={()=>{if(dialogAuthority.current!==renderedDialogAuthority||activeDialogContext&&contextDialog.current!==activeDialogContext)return;setPreview(null);setSettingsPreview(null);closeChartDialog();}} document={documentWithAccountOneClick(workspace.chartSettings,activeAccount?.settings.oneClick)} chartStyle={workspace.chartStyle} typeSettings={settingsReads!.typeSettings} timezone={workspace.chartOptions.timezone} exchangeTimezone={dataset.instrument.timezone||null} priceScale={settingsReads!.priceScale} ratio={settingsReads!.ratio} scaleMode={settingsReads!.scaleMode} initialTab={settingsEntry.current} dataSourcesBusy={()=>storagePending.current}
   general={reuse('dialog:general',<ClockedAppPreferencesSection {...surfaceProps('general:app',{preferences:appPreferences,trayAvailable,onChange:changeAppPreferences,wickAvailable:wickMode.available})}/>)}
   dataSources={reuse('dialog:data-sources',<DataSourcesPanel live={surfaceProps('data-sources:live',{coinbaseEnabled:liveChoices.coinbase,onCoinbaseEnabledChange:enabled=>{commit({liveData:{...liveChoices,coinbase:enabled}});},alpacaSymbols:liveChoices.alpacaSymbols,onAlpacaSymbolsChange:symbols=>{commit({liveData:{...liveChoices,alpacaSymbols:symbols}});},alpacaPlan,onAlpacaPlanChange:plan=>{const {alpacaPlan:_old,...rest}=liveChoices;commit({liveData:plan==='paid'?{...rest,alpacaPlan:'paid'}:rest});},onAlpacaKeyStatus:status=>setAlpacaKeyConfigured(status.configured),bridge:window.lv?.saveAlpacaKey&&window.lv.alpacaKeyStatus&&window.lv.clearAlpacaKey&&window.lv.testAlpacaConnection?window.lv as unknown as AlpacaSettingsBridge:null})} storage={surfaceProps('data-sources:storage',{directory:storage,startup:startupView,onRetry:()=>void loadStoredWorkspace(startupView),onExport:exportWorkspace,onReset:resetWorkspace,onRestore:()=>{saveScriptDraft();setDialog('restore-workspace');},onResetDone:closeDialog,onPendingChange:value=>{storagePending.current=value;}})} fred={surfaceProps('data-sources:fred',{bridge:window.lv?.fredDataStatus&&window.lv.clearFredData?window.lv as unknown as FredCacheBridge:null,enabled:fredRemoteOk,onEnabledChange:enabled=>{const next={...liveChoices};if(enabled)delete next.fred;else next.fred=false;commit({liveData:next});}})} saved={surfaceProps('data-sources:saved',{bridge:window.lv?.dataSourcesInfo&&window.lv.openDataFolder&&window.lv.exportDataSourceSettings&&window.lv.importDataSourceSettings?window.lv as unknown as DataSourceSettingsBridge:null,settings:liveChoices,onImport:settings=>{commit({liveData:restoreLiveData(settings)});}})} onImportData={()=>setDialog('import')} cache={surfaceProps('data-sources:cache',{bridge:window.lv?.barCacheStatus&&window.lv.clearBarCache?window.lv as unknown as MarketDataCacheBridge:null})}/>)}
   onTemplatesChange={templates=>commit({chartSettings:{...current.current.chartSettings,templates}})} onApply={applyChartSettings}/>,dialogDeps,['document'])}
  {dialog==='templates'&&chart&&<IndicatorTemplatesDialog initialTab={templateTab} library={workspace.indicatorTemplates} onLibraryChange={(indicatorTemplates,expected)=>{if(JSON.stringify(restoreIndicatorTemplates(current.current.indicatorTemplates))!==expected)throw new Error('The template library changed. Preview it again.');if(!commit({indicatorTemplates:restoreIndicatorTemplates(indicatorTemplates)}))throw new Error('Template library change could not be committed.');}} capture={captureTemplate} previewApply={previewTemplate} onClose={closeDialog}/>}
  {reuse('dialog:indicators',dialog==='indicators'&&chart&&<IndicatorDialog onAnchorPlacement={id=>beginAnchorPlacement(id,true)} onInstanceRemoved={id=>{if(anchorPlacementRef.current?.id===id)endAnchorPlacement(false);}}initialSearch={indicatorSearch.current?.authority===renderedDialogAuthority?{query:indicatorSearch.current.query,active:indicatorSearch.current.active as IndicatorId}:null} initialSelected={indicatorFocus.current?.authority===renderedDialogAuthority&&!indicatorFocus.current.addOn?indicatorFocus.current.id:null} addOn={indicatorFocus.current?.authority===renderedDialogAuthority&&indicatorFocus.current.addOn?indicatorFocus.current.id:null} initialTab={indicatorFocus.current?.authority===renderedDialogAuthority?indicatorFocus.current.tab??null:null} compact={indicatorFocus.current?.authority===renderedDialogAuthority&&indicatorFocus.current.compact===true} scripts={workspace.scriptLibrary.documents.map(doc=>({id:doc.id,name:doc.name,kind:doc.kind}))} strategies={BUILTIN_STRATEGY_SELECTOR_ROWS} onAddStrategy={id=>{try{addBuiltinStrategy(id);}catch(error){reportFailure(error);}}} onOpenScript={id=>{try{if(!commit({scriptLibrary:selectScript(withScriptDraft(current.current).scriptLibrary,id)}))return;scriptDraft.current?.settle();setScriptEpoch(value=>value+1);if(scriptDocked){setDialog(null);changeBottomPanel(view=>openBottomTab(view,'script'));}else setDialog('script');}catch(error){reportFailure(error);}}} onOpenMetric={()=>{setFundamentalsMarket(null);setDialog('fundamentals');}} ownerToken={renderedDialogAuthority} assertOwner={assertAnalysisDialogContext} assertEditable={()=>assertAnalysisDialogEditable(true)} storageWrite={keptStorageWrite()} chart={chart} instances={indicatorViews} library={workspace.indicatorLibrary} onLibraryChange={indicatorLibrary=>{assertDialogContext();return commit({indicatorLibrary});}} onClose={closeChartDialog} onChange={()=>confirmAnalysisCapture('indicator')} historySession={()=>openHistorySession(history,()=>({workspace:current.current,replay:currentReplay.current}))}/>,[...dialogDeps,indicatorDialogReads(chart)],['scripts'])}
  {dialog==='cell-script-settings'&&renderedCellScriptDialog&&renderedCellScriptBinding&&<CellScriptSettings chart={renderedCellScriptDialog.intent.target.controller} binding={renderedCellScriptBinding} assertOwner={()=>{assertCellScriptDialog(renderedCellScriptDialog,renderedCellScriptBinding);}} onClose={()=>{try{const payload=assertCellScriptDialog(renderedCellScriptDialog);if(cellScriptDialog.current===payload){cellScriptDialog.current=null;setDialog(null);}}catch{/* A retired dialog cannot close its replacement. */}}} onApply={change=>{const payload=assertCellScriptDialog(renderedCellScriptDialog,renderedCellScriptBinding),rows=current.current.scriptBindings,binding=rows.find(row=>row.id===payload.binding.id);if(!binding||scriptStudyFingerprint(binding)!==scriptStudyFingerprint(renderedCellScriptBinding))throw Error('The script settings changed. Reopen this dialog.');const next=applyScriptSettings(rows,binding.id,change);assertCellScriptDialog(renderedCellScriptDialog,renderedCellScriptBinding);if(!commit({scriptBindings:next}))return false;payload.workspace=current.current;payload.binding=next.find(row=>row.id===binding.id)!;return true;}}/>}
  {dialog==='compare'&&chart&&<ComparisonDialog ownerToken={renderedDialogAuthority} assertOwner={assertAnalysisDialogContext} assertEditable={assertAnalysisDialogEditable} chart={chart} datasets={shownUniverse} candidates={symbolCandidates} typedCandidates={(query,rows)=>[...liveTypedCandidates(query,rows,alpacaKeyConfigured,dataset.resolution),...symbolMathCandidates(query,dataset.resolution,symbol=>rows.some(row=>row.symbol===symbol)),...fredCandidates(query)]} searchAssets={alpacaKeyConfigured&&window.lv?.searchAlpacaAssets?async query=>{const result=await window.lv.searchAlpacaAssets!({query});if(!result.ok)throw new Error(result.error.message);return alpacaAssetCandidates(result.value.assets,dataset.resolution);}:undefined} resolution={dataset.resolution} loadSymbol={request=>{if(request.providerId===FRED_PROVIDER_ID){const id=fredDatasetId(request.symbol);void openFredSymbol(window.lv,'FRED:'+request.symbol,{enabled:fredRemoteOk}).then(({dataset,notice})=>{if(notice)setMessage(notice);if(dataset)setLiveDatasets(prior=>({...prior,[id]:dataset}));},reportFailure);return{ok:true,datasetId:id};}/* A compared symbol that is not loaded opens through the chart feed opener; a live comparison then keeps its feed (gridReferencesDataset). */const opened=attachLive(request.providerId,request.symbol,request.resolution);return opened?{ok:true,datasetId:opened.handle.datasetId}:{ok:false,message:request.symbol+' could not be loaded. The reason is in the status message.'};}} onClose={closeDialog} onChange={()=>confirmAnalysisCapture('comparison')}/>}
  {dialog==='drawing-manager'&&chart&&<DrawingManagerDialog ownerToken={renderedDialogAuthority} isCurrent={()=>dialogAuthority.current===renderedDialogAuthority&&dialogOwner.current==='drawing-manager'} assertOwner={()=>assertDialogContext()} chart={chart} onClose={closeDialog} onChange={confirmDrawingCapture} held={backgroundWriteActive} deferEdit={run=>queueDrawingEdit(run,{},chart)}/>}
  {dialog==='drawing'&&chart&&selectedDrawing&&<DrawingDialog ownerToken={renderedDialogAuthority} isCurrent={()=>dialogAuthority.current===renderedDialogAuthority&&dialogOwner.current==='drawing'} assertOwner={()=>assertDialogContext()} chart={chart} id={selectedDrawing} barsPatternData={barsPatternData} imagePicker={pickReplacementImage} timeZone={workspace.chartOptions.timezone} initialTab={drawingDialogEntryTab(renderedDialogAuthority)} onClose={()=>{try{closeChartDialog();}finally{releaseImageHolds();}}} onChange={confirmDrawingCapture} deferApply={run=>queueDrawingEdit(()=>run()===false?DRAWING_SETTINGS_CLOSED:undefined,{},chart)} onToolDefault={(type,value)=>commit({drawingToolDefaults:withToolDefault(current.current.drawingToolDefaults,type,value)})}/>}
  {reuse('dialog:tools',dialog==='tools'&&chart&&<DrawingTools chart={chart} activeTool={activeTool} onSelect={armTool} onClose={closeDialog} favorites={workspace.drawingFavorites} onFavoritesChange={changeDrawingFavorites}/>,[...dialogDeps,changeDrawingFavorites])}
  {reuse('interval-entry',intervalPrompt!==null&&<IntervalEntry seed={intervalPrompt} current={chartIntervalText(workspace.chartStyle,workspace.chartTypeSettings,shortIntervalText(dataset.resolution))} onSubmit={text=>{let settled:Promise<{ok:boolean;message:string|null}>|undefined;const result=submitChartIntervalEntry(text,applyRangeInterval,value=>submitIntervalEntry(value,target=>{const applied=switchInterval(target);settled=applied.settled;return applied;}));return settled&&result.ok?{...result,settled}:result;}} onClose={()=>setIntervalPrompt(null)}/>)}
  {reuse('interval-menu',intervalMenuLeft!==null&&<IntervalMenu datasets={intervalUniverse} current={chartIdentity} state={workspace.intervals} style={{left:intervalMenuLeft}} onApply={applyInterval} onApplyLive={applyLiveInterval} onEditMenu={action=>commit({intervals:editIntervalMenu(current.current.intervals,action)})} onAdvanced={()=>{setIntervalTarget(undefined);setDialog('intervals');}} onClose={closeIntervalMenu} onRangeInterval={size=>applyRangeInterval(size).ok} onLeaveRange={()=>commit(leaveRangeStyle())} rangeActive={workspace.chartStyle==='range'} rangeSize={rangeSizeOf(workspace.chartTypeSettings)}/>,[],['style'])}
  {reuse('dialog:intervals',dialog==='intervals'&&<IntervalDialog datasets={intervalUniverse} current={chartIdentity} state={workspace.intervals} initialTarget={intervalTarget} onClose={closeChartDialog} onApply={(selected,state,result)=>{assertDialogContext();return applyInterval(selected,state,result);}} onApplyLive={(interval,state)=>{assertDialogContext();return applyLiveInterval(interval,state);}} onRangeInterval={(size,state)=>{assertDialogContext();return applyRangeInterval(size,state).ok;}} rangeActive={workspace.chartStyle==='range'} rangeSize={rangeSizeOf(workspace.chartTypeSettings)}/>,dialogDeps)}
  {reuse('dialog:symbol-search',dialog==='symbol-search'&&symbolSearch&&<SymbolSearchDialog key={symbolSearch.id} currentSymbol={dataset.instrument.symbol} candidates={symbolCandidates} typedCandidates={(query,rows)=>[...liveTypedCandidates(query,rows,alpacaKeyConfigured,dataset.resolution),...symbolMathCandidates(query,dataset.resolution,symbol=>rows.some(row=>row.symbol===symbol)),...fredCandidates(query)]} searchAssets={alpacaKeyConfigured&&window.lv?.searchAlpacaAssets?async query=>{const result=await window.lv.searchAlpacaAssets!({query});if(!result.ok)throw new Error(result.error.message);return alpacaAssetCandidates(result.value.assets,dataset.resolution);}:undefined} recent={readRecentSymbols(recentStorage())} resolution={dataset.resolution} initialQuery={symbolSearch.query} origin={symbolSearch.origin} currentDatasetId={dataset.provenance.datasetId} linkedCharts={linkedSymbolTargets(workspace.grid)} assertOwner={()=>assertDialogContext(false)} onEnableCoinbase={liveChoices.coinbase?undefined:()=>{commit({liveData:{...liveChoices,coinbase:true}});}} onOpenDataSources={demoDataMode()!=='legacy'&&!alpacaKeyConfigured?()=>openSettings('datasources'):undefined} onSelect={request=>{assertDialogContext(false);return openSymbolRequest(request);}} onClose={closeDialog}/>,[...dialogDeps,alpacaKeyConfigured,dataset.resolution],['recent'])}
  {reuse('dialog:import',dialog==='import'&&<ImportDialog onClose={closeDialog} existing={workspace.imports} onImport={value=>{assertDialogContext(false);return importDataset(value);}}/>,dialogDeps)}
  {reuse('dialog:news',dialog==='news'&&<NewsDialog symbol={workspace.symbol} watchlist={workspace.watchlist} state={workspace.news} filings={workspace.filings} onNewsAlert={setMessage} onChange={news=>commitDialogField('news',news)} onFilingsChange={filings=>commitDialogField('filings',filings)} onClose={closeDialog}/>,dialogDeps)}
  {dialog==='fundamentals'&&<FundamentalsDialog symbol={fundamentalsMarket?.symbol??workspace.symbol} market={fundamentalsMarket??{exchange:dataset.instrument.exchange,symbol:dataset.instrument.symbol,synthetic:dataset.provenance.fixture}} preferences={workspace.fundamentalsPreferences} onPreferencesChange={next=>commitDialogField('fundamentalsPreferences',next)} documents={workspace.fundamentals} lastClose={fundamentalsMarket&&fundamentalsMarket.symbol!==dataset.instrument.symbol?null:lastCloseFor(dataset)} priceBars={fundamentalsMarket&&fundamentalsMarket.symbol!==dataset.instrument.symbol?null:priceBarsFor(dataset)} onChange={fundamentals=>commitDialogField('fundamentals',fundamentals)} onClose={closeDialog}/>}
  {dialog==='date'&&chart&&<DateNavigationDialog time={activeDialogContext?.snapshot.point.barTime??last?.time??Date.now()/1000} timezone={shownTimeZone} onClose={closeChartDialog} onGo={seconds=>{assertDialogContext();const result=chart.goToDate(seconds);if(!result.ok)throw new Error(result.diagnostic.message);setMessage(result.withinHistory?'Chart moved to selected date':'Selected date is outside supplied history.');}}/>}
  {dialog==='storage'&&<StorageDialog directory={storage} startup={startupView} onRetry={()=>void loadStoredWorkspace(startupView)} onExport={exportWorkspace} onReset={resetWorkspace} onRestore={()=>{saveScriptDraft();setDialog('restore-workspace');}} onClose={closeDialog}/>}
  {dialog==='calendar'&&<CalendarDialog key={calendarEntry?.nonce??'calendar'} watchBook={workspace.watchBook} fundamentals={workspace.fundamentals} fundamentalsLinks={workspace.fundamentalsPreferences.links} alpacaCorporateActions={window.lv?.fetchAlpacaCorporateActions?.bind(window.lv)} initialKind={calendarEntry?.kind} focusEvent={calendarEntry?.focus} onOpenFinancials={(id,symbol)=>{assertDialogContext(false);if(!openCalendarSymbol(id,symbol))return false;setFundamentalsMarket(null);setDialog('fundamentals');return true;}} state={workspace.calendar} onChange={calendar=>commitDialogField('calendar',calendar)} onSelectSymbol={(id,symbol)=>{assertDialogContext(false);return openCalendarSymbol(id,symbol);}} onOpenSeries={series=>{assertDialogContext(false);openFred(series);return true;}} onClose={closeDialog}/>}
  {dialog==='heatmap'&&<HeatmapDialog datasets={shownUniverse} watchBook={workspace.watchBook} state={workspace.heatmap} onChange={heatmap=>commitDialogField('heatmap',heatmap)} onSelect={item=>{try{assertDialogContext(false);openWatchDataset(item);return{ok:true};}catch(error){return{ok:false,error:error instanceof Error?error.message:String(error)};}}} onClose={closeDialog}/>}
  {dialog==='portfolio'&&<PortfolioDialog state={workspace.portfolio} datasets={shownUniverse} paperAccounts={[paperState.paper,...(paperState.book?.inactive??[])]} onChange={portfolio=>commitDialogField('portfolio',portfolio)} onClose={closeDialog}/>}
  {dialog==='markets'&&<MarketViewsDialog datasets={shownUniverse} fredBridge={window.lv} fredEnabled={fredRemoteOk} watchSymbols={watchSymbols(workspace.watchBook)} state={workspace.marketViews} onChange={marketViews=>{try{commitDialogField('marketViews',marketViews);}catch{}}} onOpen={item=>{try{assertDialogContext(false);openWatchDataset(item);}catch{}}} onAddToWatchlist={item=>{try{assertDialogContext(false);const book=current.current.watchBook,list=activeWatchList(book),reference=referenceFromDataset(item);if(list.rows.some(row=>row.kind==='symbol'&&row.reference.symbol===reference.symbol&&row.reference.exchange===reference.exchange)){setMessage(item.instrument.symbol+' is already in '+list.name+'.');return;}const next=addWatchSymbols(book,list.id,[reference],()=>crypto.randomUUID());if(commit({watchBook:next,watchlist:watchSymbols(next)}))setMessage('Added '+item.instrument.symbol+' to '+list.name+'.');}catch(error){reportFailure(error);}}} onClose={closeDialog}/>}
  {dialog==='strategy'&&<StrategyDialog strategies={reportStrategies} selectedStrategy={reportStrategy} onSelectStrategy={selectReportStrategy} ownerToken={renderedDialogAuthority} onOpenScriptEditor={openScriptEditor} execution={strategyExecution} config={workspace.strategy} assertOwner={assertStrategyReportOwner} onTradeSelect={trade=>{try{strategyMarkStore.select({entryBar:trade.entry.barIndex,exitBar:trade.exit.barIndex,entryTime:trade.entry.time});if(!chart)return;const moved=chart.goToDate(strategyTradeJumpTime(trade));if(!moved.ok)throw new Error(moved.diagnostic.message);}catch(error){reportFailure(error);}}} onChange={strategy=>{assertStrategyReportOwner();return commit({strategy});}} onClose={closeDialog} placement="floating" onPlacement={next=>{if(next!=='docked')return;setStrategyDocked(true);setDialog(null);changeBottomPanel(view=>openBottomTab(view,'strategy'));}}/>}
  {strategyDocked&&bottomMounted.includes('strategy')&&<StrategyDialog strategies={reportStrategies} selectedStrategy={reportStrategy} onSelectStrategy={selectReportStrategy} placement="docked" onOpenScriptEditor={openScriptEditor} dockHost={strategyDockHost} ownerToken={renderedStrategyToken} execution={strategyExecution} config={workspace.strategy} assertOwner={assertDockedStrategyOwner} onTradeSelect={trade=>{try{strategyMarkStore.select({entryBar:trade.entry.barIndex,exitBar:trade.exit.barIndex,entryTime:trade.entry.time});if(!chart)return;const moved=chart.goToDate(strategyTradeJumpTime(trade));if(!moved.ok)throw new Error(moved.diagnostic.message);}catch(error){reportFailure(error);}}} onChange={strategy=>{assertDockedStrategyOwner();return commit({strategy});}} onClose={()=>{changeBottomPanel(collapseBottomPanel);}} onPlacement={next=>{if(next!=='floating')return;setStrategyDocked(false);changeBottomPanel(view=>view.tab==='strategy'?collapseBottomPanel(view):view);setDialog('strategy');}}/>}
  {closePrompt&&secondaryWindow&&<FloatingPanel title="Unsaved layout" onClose={()=>setClosePrompt(false)}><section role="alertdialog" aria-label="Unsaved layout"><p>{CLOSE_PROMPT_TEXT}</p><div className="dialog-actions"><button type="button" onClick={()=>setClosePrompt(false)}>Cancel</button><button type="button" onClick={()=>{discardOnClose.current=true;setClosePrompt(false);void window.lv?.close();}}>Close without saving</button><button type="button" className="primary" onClick={()=>{setClosePrompt(false);void latestSave.current(true).then(saved=>{if(saved&&!closeNeedsPrompt(windowMode,current.current.layoutLibrary,current.current.grid,false))void window.lv?.close();});}}>Save and close</button></div></section></FloatingPanel>}
  {reuse('dialog:order',dialog==='order'&&orderSeed&&activeAccount&&<FloatingPanel title="Order ticket" onClose={closeDialog}>{reuse('dialog:order-book',<LiveBookBinding key={(orderSeed.tab??'')+'|'+(orderSeed.price??'')} instrumentId={orderSeed.relay?relayQuoteInstrument:chartQuoteInstrument} mode="ticket">{reuse('dialog:order-ticket',<PaperOrderTicket key={paperInstrumentKey(orderSeed.relay?.instrument??dataset.instrument)+'|'+activeAccount.id+'|'+activeAccount.runId} extendedHoursDefault={paperExtendedHoursDefault(sessionMode,orderSeed.relay?.instrument??dataset.instrument,Math.max(activeAccount.clock,orderSeed.relay?.now??virtualNow))} account={activeAccount} instrument={orderSeed.relay?.instrument??dataset.instrument} quote={orderSeed.relay?relayedTicketQuote(activeAccount,orderSeed.relay):virtualActionQuote} quoteSource={orderSeed.relay?.quoteSource??{key:chartSourceContextKey(source),state:dataset.provenance.state}} now={Math.max(activeAccount.clock,orderSeed.relay?.now??virtualNow)} side={orderSeed.side} {...(orderSeed.quantity?{quantity:orderSeed.quantity}:{})} {...(orderSeed.price&&orderSeed.tab?{price:orderSeed.price,tab:orderSeed.tab}:{})} onAccountChange={(next,expected)=>(replay?acceptReplayPaper:acceptPaper)(next,expected)} onDone={text=>{closeDialog();if(workspace.chartSettings.trading.rejectionOnly)setMessage(text);}} timezone={shownTimeZone} timeHours={shownTimeHours}/>,dialogDeps,['instrument','quote','quoteSource'])}</LiveBookBinding>)}</FloatingPanel>,dialogDeps)}
  {dialog==='paper'&&<FloatingPanel title={replay?'Replay paper trading':'Paper trading'} onClose={closeDialog} width={720}>{replay&&<p className="help">Replay funds are separate. Moving the replay forward keeps the replay account; moving it back returns the account to its state at that time. Ordinary paper funds are unaffected.</p>}<PaperPanel tradingRefusal={derivedTrade} account={replay?(replayPaper?.runId===replay.runId?replayPaper:createPaperAccount({id:'replay-paper',mode:'replay-paper',runId:replay.runId,name:'Replay virtual account',now:0})):paper} onAccountChange={(next,expected)=>{try{assertDialogContext(false);if(activeDialogContext?.priceRequest)assertContextPriceOwner(activeDialogContext.priceRequest);return(replay?ownedFinancial.setReplayPaper:ownedFinancial.setPaper)(next,expected);}catch{return false;}}} instrument={dataset.instrument} quote={virtualActionQuote} quoteSource={{key:chartSourceContextKey(source),state:dataset.provenance.state}} now={Math.max((replay?replayPaper:paper)?.clock??0,virtualNow)} contextRequest={activeDialogContext?.dialog==='paper'?activeDialogContext.priceRequest:null} assertContextCurrent={assertContextPriceOwner} onContextComplete={completeContextPrice} paperManager={replay?undefined:paperManager} timezone={shownTimeZone} timeHours={shownTimeHours} presetSeed={replay?null:presetSeed} sessionMode={sessionMode}/></FloatingPanel>}
  {dialog==='restore-workspace'&&<WorkspaceRestoreDialog onChoose={chooseWorkspaceExport} onPreview={previewWorkspaceRestore} onExport={exportWorkspace} onClose={closeDialog}/>}
  <BackgroundAlertFeeds alerts={alerts} readAlerts={()=>financial.current.alerts} activeInstrumentId={liveReplayHeld?'':dataset.instrument.id} activeDatasetId={liveReplayHeld?undefined:dataset.provenance.datasetId} activeResolution={liveReplayHeld?undefined:dataset.resolution} enabled={loaded&&!secondaryWindow} suspended={workspaceBusy} backgroundSave={storageBusy&&!workspaceBusy} isStorageLocked={isAlertStoreLocked} onAlertsChange={ownedFinancial.setAlerts} openLiveFeed={openBackgroundFeed} openAlpacaSymbols={alpacaChartSymbols} onPlan={plan=>{const written=appUpdateBatch(current).written;if(written.has('alert-plan')&&sameBackgroundPlan(written.get('alert-plan'),plan))return;written.set('alert-plan',plan);setAlertPlan(plan);}} readDrawings={instrumentId=>savedDrawingsForInstrument(current.current,instrumentId)}/>
  <VwapEventReach alerts={alerts} workspace={workspace} enabled={loaded&&!secondaryWindow} onLoaded={instrumentId=>{if(instrumentId!==dataset.instrument.id)return;recomputeForVwapDates(chart);}}/>
  <DrawingAlertCleanup layoutId={workspace.layoutLibrary?.activeId??null} grid={workspace.grid} alerts={alerts} readAlerts={()=>financial.current.alerts} enabled={loaded&&!secondaryWindow} held={!!dialog||workspaceBusy} onAlertsChange={ownedFinancial.setAlerts} onMessage={setMessage}/>
  {!secondaryWindow&&<WorkspaceCompoundAlerts book={compoundBook} enabled={loaded&&!replay&&!liveReplayHeld&&workspace.chartStyle==='candles'} suspended={workspaceBusy} isHeld={isAlertStoreLocked} readActionTime={compoundControl.readActionTime} onDiagnostic={(id,diagnostic)=>{if(!diagnostic)return;const name=compoundBook.entry(id)?.state.definition.name;setMessage((name?name+': ':'')+'The alert could not check the current chart. Review its source and conditions.');}} financialGeneration={financialEpoch} gridGeneration={gridEpoch} financialGenerationRef={financialGeneration} gridGenerationRef={gridGeneration}/>}
  <AlertPopupRack>
  {!secondaryWindow&&<CompoundAlertDeliveryHost key="compound-delivery" book={compoundBook} autoHide={workspace.chartSettings.alerts.hideToasts} financialGeneration={financialEpoch} gridGeneration={gridEpoch} financialGenerationRef={financialGeneration} gridGenerationRef={gridGeneration}/>}
  <WorkspaceAlerts compound={secondaryWindow?undefined:compoundControl} key={gridEpoch+':'+financialEpoch} createRequest={dialog==='alerts'?alertCreateRequest:null} open={dialog==='alerts'} onClose={closeDialog} onSaved={setMessage} alerts={alerts} autoHideToasts={workspace.chartSettings.alerts.hideToasts} onAlertsChange={ownedFinancial.setAlerts} dataset={liveAlertView(dataset)} sessionOverride={activeSession} chart={chart} bars={liveAlertBars(bars) as typeof bars} chartId={workspace.grid?.layout.activeCellId} replay={replay} enabled={loaded&&chartAlertObservationEnabled(!!replay,liveReplayHeld)} suspended={workspaceBusy} backgroundSave={storageBusy&&!workspaceBusy} isStorageLocked={isAlertStoreLocked} strategy={workspace.strategy} contextRequest={activeDialogContext?.dialog==='alerts'?activeDialogContext.priceRequest:null} assertContextCurrent={assertContextPriceOwner} onContextComplete={completeContextPrice} readSavedDrawings={instrumentId=>savedDrawingsForInstrument(current.current,instrumentId)}/>
  </AlertPopupRack>
  {dialog==='screener'&&<ScreenerDialog fxBridge={window.lv} fxEnabled={fredRemoteOk} timezone={shownTimeZone} watchBook={workspace.watchBook} calendarDocuments={workspace.calendar.documents} fundamentals={workspace.fundamentals} fundamentalsPreferences={workspace.fundamentalsPreferences} onWatchBook={(watchBook,expected)=>{assertDialogContext(false);if(current.current.watchBook!==expected)throw new Error('Local watchlists changed. Review the current lists and try again.');return commit({watchBook,watchlist:watchSymbols(watchBook)});}} onNotes={market=>{assertDialogContext(false);return openNotes(market,undefined,true);}} datasets={shownUniverse} settings={workspace.screener} onChange={screener=>commitDialogField('screener',screener)} onClose={closeDialog} onSelect={item=>{try{assertDialogContext(false);openWatchDataset(item);return{ok:true};}catch(error){return{ok:false,error:error instanceof Error?error.message:String(error)};}}}/>}
  {reuse('dialog:notes-over-screener',dialog==='screener'&&noteRequest?.overScreener===renderedDialogAuthority&&<NotesDialog key={noteRequest.id} book={workspace.watchBook} initialMarket={noteRequest.market} initialNoteId={noteRequest.noteId} startNew={noteRequest.startNew} onChange={(watchBook,expected)=>{assertDialogContext(false);if(current.current.watchBook!==expected)throw new Error('Local notes changed. Your draft is retained.');return commit({watchBook});}} onClose={()=>setNoteRequest(null)}/>,dialogDeps)}
  {reuse('script-library',<ScriptLibraryPanel key={scriptEpoch} draftHandle={scriptDraft} executionEpoch={executionEpoch} open={scriptEditorOpen} onClose={scriptDocked?()=>{changeBottomPanel(collapseBottomPanel);}:closeDialog} placement={scriptDocked?'docked':'floating'} embedded onPlacement={next=>{if(next==='floating'){setScriptDocked(false);changeBottomPanel(view=>view.tab==='script'?collapseBottomPanel(view):view);setDialog('script');}else{setScriptDocked(true);changeBottomPanel(view=>openBottomTab(view,'script'));if(dialog==='script')setDialog(null);}}} dockHost={scriptDockHost} chart={chart} bars={holdWhile(surfaces.scriptBars,!scriptEditorOpen,{bars:calculationBars,key:[chartIdentity,workspace.chartStyle,replay?.runId??null,replay?.cursor??null]},(kept,next)=>isLiveDatasetId(chartIdentity.provenance.datasetId)&&kept.key.every((value,index)=>Object.is(value,next.key[index]))).bars as typeof calculationBars} fixture={dataset.provenance.fixture} synthetic={dataset.provenance.providerId===ALPACA_STUB_PROVIDER_ID} live={isLiveDatasetId(dataset.provenance.datasetId)} identity={scriptIdentity} library={workspace.scriptLibrary} onChange={scriptLibrary=>commit({scriptLibrary})} bindings={workspace.scriptBindings} onBindingsChange={scriptBindings=>commit({scriptBindings})} onResult={(result,inputBars,barIds,sourceCode,bindingId)=>{const cellId=workspace.grid?.layout.activeCellId;if(gridGeneration.current!==gridEpoch||!cellId||!bindingId||current.current.grid?.layout.activeCellId!==cellId||!(currentInput.current?.bars===bars||typeof sameBarsInput==='function'&&sameBarsInput(currentInput.current?.bars,bars))||inputBars!==calculationBars||activeController.current!==chart)return;strategyBindings.current.set(cellId,bindingId);scriptExecution({result,bars:inputBars,barIds,sourceCode,bindingId,identity:scriptIdentity,fixture:dataset.provenance.fixture},cellId);}}/>)}
 </DetailSourcesProvider><ShellTint grid={workspace.grid} themeId={workspace.themeId}/></main>;
}












