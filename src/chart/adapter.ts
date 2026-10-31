import {registerDrawingIntentSeam} from './drawing-duplicate-native';
import {producerCompletionSourceInputMatches} from './source-context';
import {type AnalysisPublicationHost,type AnalysisPublicationProof,type AnalysisPublicationError} from './analysis-publication';
import { Vela, NativeRenderer, chartType, chartTypes, drawingTypes, type ChartConfig,type RendererDisplayOptions, type DrawingTypeKey, type SerializedDrawing, type VisibleRangePreset } from '@luxalgo/vela';
import type { Bar } from '../domain/types';
import {seriesOwn,seriesNumber,seriesScalarBar,seriesFloor,createSeriesDayCloseReader,SeriesReadoutQueryError,SeriesReadoutPendingError,type SeriesReadout,type SeriesReadoutPosition} from './series-readout-position';
import { identifyDisplayBars, LosslessDrawingDocument, type ChartDiagnostic } from './contracts';
import { mapAppearance, type AppearanceSettings } from './appearance';
import { APPEARANCE_LAYER, PREVIOUS_CLOSE_STYLE,PREVIOUS_CLOSE_HA_STYLE,registerHeikinAppearanceTransform, appearanceBoolean, registerAppearanceExtensions } from './appearance-layer';
import { CHART_TYPES, TIME_AXIS_STYLES, LV_TEMPORAL_DEFAULTS, registerTemporalChartTypes, registerDerivedChartTypes, selectedPrice, type TemporalChartSettings } from './chart-types';
import {isDerivedStyle,type DerivedResult} from './derived/common';
import {derivedStepPinKey} from './derived';
import {buildDerivedAxis,derivedAxisSourceTime,derivedDisplayBars,type DerivedAxis} from './derived/derived-axis';
import {setDerivedTimeSource} from './derived-time-labels';
import {derivedCalculationSettings,derivedSettingsDefaults} from './derived/derived-settings';
import {createDerivedDrawingLens,DERIVED_DRAWING_REFUSED} from './derived/derived-drawings';
import {parseInterval} from '../domain/intervals';
import { requireVolume } from './contracts';
import {createIndicatorPort as createLegacyIndicatorPort,createIndicatorPortWithPrimarySource,type OwnedPrimarySourceControl} from './indicator-port';
import type {OwnedPrimarySourceHost,PrimarySourceBasis,PrimarySourceMode,PrimarySourceFrame,PrimaryCalendarFrame,PrimaryCalendarHold} from './seasonality-source';
import {captureSeasonalityNativeOrigin} from './seasonality-native-origin';
import type {SeasonalityCalendarAxisHandle} from './seasonality-calendar-axis';
import {createScriptLogicalPositions,type ScriptLogicalPositions} from './script-logical-position';
import {captureScriptPresentationInputFrame,scriptPresentationNumber,renewScriptPresentationPort,type ScriptPresentationHost} from './script-presentation-proof';
function weakMainSeriesReadout(lease:Extract<SeriesReadout,{state:'ready'}>):Extract<SeriesReadout,{state:'ready'}>{
 const weak=new WeakRef(lease),get=()=>{const current=weak.deref();if(!current)throw Error('The main-series presentation owner retired.');return current;};
 return Object.freeze({state:'ready' as const,assertCurrent:()=>get().assertCurrent(),readPosition:(address:SeriesReadoutPosition)=>get().readPosition(address)});
}
import type {IndicatorPresentationOwner} from './indicator-presentation';
import {installIndicatorDisplay,type IndicatorDisplayController} from './indicator-display';
import {indicatorDisplayOptionsFromAppearance} from './indicator-display-options';
import {installTrendlineAnnotation} from './trendline-annotation';
import {createTrendlineStatisticsSource} from './trendline-stats-source';
import {createOwnedVwapPrefixSource} from './vwap-prefix-source';
import {applicationVwapClient} from '../vwap/application-client';
import {captureTrendlineStatisticsNativeOwner} from './trendline-stats-owner';
import {installTrendlineStatistics} from './trendline-stats-painter';
import {installFibTrendLine} from './fib-trend-line-painter';
import {captureFibTrendLineNativeOwner,captureFibLevelPresentationNativeOwner} from './fib-trend-line-owner';
import {FIB_TREND_LINE_PREFIX} from './fib-trend-line-data';
import {installOwnedTrendlineInlineGeometry} from './trendline-inline-geometry';
import {installTrendlineInlineEditor} from './trendline-inline-editor';
import {captureNativeInlineDOMPorts} from './native-inline-dom-ports';
import {captureNativeInlineLayoutOwner} from './native-inline-layout-owner';
import {captureInlineDrawingOwner} from './drawing-inline-owner';
import {captureTrendlineInlineOpening} from './trendline-inline-publication';
import {DrawingEditRecoveryError,createDrawingSettingsSession,installDrawingSettingsSession} from './drawing-edit-transaction';
import {installTrendlineStatsFold} from './trendline-stats-fold';
import {installNativeShowOn,savedShowOnBands,withShowOn} from './native-show-on-readback';
import {sameDrawingData} from './drawing-data-equality';
import {installNativeDrawingReset} from './native-drawing-reset';
import {createNativeDrawingResetPublisher} from './native-drawing-reset-publication';
import {installDrawingCommandRouter,type DrawingCommandRouter,type DrawingDuplicateReceipt} from './drawing-command-router';
import {createDrawingErasePublisher} from './drawing-erase-publication';
import {createDrawingDuplicatePublisher,createDrawingPasteRoute,type DrawingDuplicateWorkspaceHost,type DrawingDuplicateWorkspaceCommand,type PreparedDrawingDuplicateWorkspace} from './drawing-duplicate-publication';
import {readTrendlineAnnotation} from './trendline-annotation-data';
import {captureNativeDrawingProjection} from './drawing-native-projection';
import { drawingCatalog, drawingEditor, isTrendlineStatsPath, createDrawingFieldConsumerSet, type DrawingCoordinate } from './drawing-port';
import {indicatorContextWithOverlay,indicatorHideOverlay} from './indicator-hide-overlay';
import {sourcePivotCalendar} from '../domain/indicators-ext/r23-catalog';
import {profileSourceContext} from './vp-visible-range-ltf';
import {applyChannelSeeds} from './channel-seed';
import {registerDwb3ShapeLayer,dwb3ShapePayload,DWB3_SHAPE_LAYER} from './dwb3-shape-layer';
import {assertNativeDrawingMatchesCanonical} from './drawing-canonical';
import { createScriptPort } from './script-port';
import { rangeStart,validateChartOptions,type RangePreset,type ChartOptions } from './navigation';
import { calculationBarsForStyle,createCalculationBarCache,calculationTransformId,derivedCalculation,type DerivedCalculationOptions } from './calculation-bars';
import { createComparisonPort } from './compare-port';
import {normalizedCrosshair,inspectedBar,centeredDateRange,validateViewport} from './inspection';
import {createViewportDeferral} from './viewport-deferral';
import {createIntervalSpacingCarry,typicalBarStep} from './interval-spacing-carry';
import {composeChartExport,chartExportPngDataUrl,type ChartExportOverlay,type ChartExportFooter} from './image-export';
import {createMarketQueue} from './market-queue';
import {cloneProfileInputBars,profileCloneProducerInputMatches} from './profile-input-clone';
import {barInputIdentity,isLiveInputIdentity,isReplayFrameBars} from './bar-input-identity';
import {LIVE_HISTORY_MIN_INTERVAL_MS,LIVE_HISTORY_PREFETCH_BARS,LIVE_HISTORY_PREFETCH_SCREENS,LIVE_HISTORY_ZOOM_ROOM_BARS,liveHistoryState,nearHistoryStart,requestLiveHistory} from '../domain/live-history';
import {commitChartStyle} from './style-transaction';
import {localCandleSourceInputMatches,sourceContextForInput,sameChartSourceBasis,validateChartSourceBasisIdentity,type ChartSourceContext} from './source-context';
import {validateIndicatorSnapshots} from './indicator-settings';
import {validateComparisonSettings} from './compare-port';
import {createAnalysisTransactionEngine,type AnalysisRestoreRequest,type PreparedAnalysisLease,type AnalysisPaneInventory} from './analysis-transaction';
import {remapAnalysisStacking,remapDrawingPaneRecords} from './analysis-frame';
import {createRendererFramePort,coreModelAbsence} from './renderer-frame';
import {createConfigurationEditor,acquireNotificationHolds,type ConfigurationEditRequest,type ConfigurationEditResult,type PreparedConfigurationEdit} from './configuration-edit';
import {attemptEveryCleanup} from './chart-retirement';
import {assertHistoricalFrameCompatible,validateHistoricalCalculationFingerprints,historicalPaneKey,type HistoricalFrameCaptureRequest,type HistoricalChartFrame} from './historical-frame';
import {createRendererContextPort} from './renderer-context';
import {commitPortableDrawingBindings,reprojectPortableDrawingDocument,resolvePortableDrawingDocument,drawingPaneBinding} from './drawing-document-bindings';
import {sharedObjectClipboard,pasteRouteFor,preparePastedRows,stackingFloor,clipboardGroups,pastedGroups,OBJECT_PASTE_UNAVAILABLE,OBJECT_PASTE_EMPTY,type ObjectClipboardSnapshot} from './drawing-object-clipboard';
import {connectToolDefaults,type ToolDefaultsFacade} from './drawing-tool-defaults';
import {installDrawingSnap} from './drawing-snap';
import {forexPipSize} from '../domain/pip-size';
import {drawingMoveTargets,commitDrawingPaneMove} from './drawing-pane-move';
import {createChartContextPort,type ChartContextPort,type ChartContextCaptureRequest} from './chart-context-port';
import type {ChartMenuSnapshot,ChartMenuActionLease} from './context-menu';
import {beginChartTreeSuspension} from './tree-suspension';
export {sourceContextForInput,sourceContextForDataset,sameChartSourceBasis,validateChartSourceBasisIdentity} from './source-context';
export type {ChartSourceContext} from './source-context';
import {createDrawingManager,DrawingManagerPublicationError} from './drawing-manager';
import {publishDrawingSubscribers,type DrawingSubscriber} from './drawing-publication';
import {createHeldDrawingPublication} from './held-drawing-publication';
import {createDrawingTemplateBatches,captureNativeDrawingLease,bulkPropertyBar} from './drawing-template-batch';
import {createDrawingIdReservations} from './drawing-id-reservations';
import {createPaneRegistry} from './pane-registry';
import {createDrawingPreferencesPort} from './drawing-preferences-port';
import {createDrawingPreview} from './drawing-preview';
import {createDrawingVisibilityProjection,commitDrawingVisibility,drawingVisibility,type DrawingIntervalVisibility,type DrawingVisibilityRule} from './drawing-visibility';
import {createZoomController} from './drawing-zoom';
import {stampNewDrawings} from './drawing-linked-plan';
import {createUnhideUnlock,unhideUnlockStep,defaultDrawingUtility,currentSyncStamp,type DrawingUtility} from './drawing-utility-state';
import {createNativeFullModelBridge,type NativeFullModelBridge} from './native-full-model';
// Trusted imported native method: subclass forwarding never follows a supplied chain.
const lvNativeMountIndicator=NativeRenderer.prototype.mountIndicator,lvNativeMountApply=Reflect.apply;
import {installAppearancePainters,type AxisLabelContext} from './appearance-painters';
import {installPrecisionCrosshair} from './precision-crosshair';
import {countdownSessionFor,tickDecimals,type AxisDrawing} from './axis-labels';
import {precisionFormatter,derivedPriceDecimals} from './symbol-precision';
import {SESSION_BREAK_COLOR,nominalBarIntervalMs,sessionBreaksFor,sessionZonesFor,sessionsApply,type SessionMode} from './session-zones';
import {paneGeometryOf} from './pane-geometry';
import {chartSettingsSchema,settingsDefaults,validateTypeSettings,appearanceTypeSettings,appearanceWithTypeSettings,validatedSettingsBook,heikinAshiTypeSettings,candleAppearanceForStyle,type ChartSettingsBook} from './chart-settings';
import {installPriceScalePort,priceScaleFacade,reconcileManualScales,capturePriceScaleDisplayPrecision,type PriceScalePort} from './price-scale-port';
import {installTimeScalePort,timeScaleFacade,type TimeScalePort} from './time-scale-port';
import {createTextPlacementHold} from './text-placement-hold';
import {returnBrushToCursor} from './brush-tool-return';
import {LV_BARS_PATTERN,barsPatternPlacementRefusal} from './lv-types/bars-pattern';
import {bindBarsPatternMember} from './lv-types/bars-pattern-source';
import {readBarsPattern,patchBarsPatternMember} from './lv-types/bars-pattern-data';
import type {BarDataset} from '../domain/types';
import {timeToClientX,type TimeAxisCoords} from './time-to-x';
import {applyRightMargin,type RightMarginRenderer} from './right-margin';
import {pricePaneProjectionOf,type PricePaneProjection} from './price-pane-projection';
import {crosshairPlacement,PLACE_POINTER_MESSAGE} from './place-at-crosshair';
import {installDrawingHoverLeave} from './drawing-hover-leave';
import {forgetPickedInk,installTextInkDefault,paintedBackgrounds} from './drawing-text-ink';
import {derivedPaperRefusal,isSymbolMathDatasetId} from '../domain/symbol-math-live';
import {chartPositionContext,registerPositionChartContext as registerPositionContextOwner,rendererHoveredDrawingId} from './lv-types/position-tool';
export { calculationBarsForStyle } from './calculation-bars';

/** The refusal text for a write with nothing to draw (see applyMarketInput). */
export const EMPTY_MARKET_MESSAGE='There are no bars to draw for this chart input yet.';
/** A derived chart type that builds nothing from the current bars (a refused range size). Thrown by the
 * style check before any native change, so the style transaction rolls back to the chart already drawn. */
export class DerivedDrawRefusal extends Error{readonly diagnostic:DerivedResultDiagnostic;constructor(message:string,diagnostic:DerivedResultDiagnostic){super(message);this.name='DerivedDrawRefusal';this.diagnostic=diagnostic;}}
type DerivedResultDiagnostic=Extract<DerivedResult,{ok:false}>['diagnostic'];
const plainRecord=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const sameConfigValue=(a:unknown,b:unknown):boolean=>{if(Object.is(a,b))return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const left=Object.keys(a),right=Object.keys(b);if(left.length!==right.length)return false;for(const key of left)if(!Object.hasOwn(b,key)||!sameConfigValue((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key]))return false;return true;};
/** True when merging this renderer config patch onto the current config cannot change it. Vela merges a patch
 *  section by section (each chart-type value is replaced whole), so a patch is a no-op when every leaf it names already holds
 *  the same value. A key the current config does not have, a value of another shape, or a chart-type value that is not
 *  deeply equal always applies. */
export function rendererPatchIsNoop(current:unknown,patch:unknown,depth=0):boolean{
 if(!plainRecord(current)||!plainRecord(patch))return false;
 for(const [key,value] of Object.entries(patch)){
  if(!Object.hasOwn(current,key))return false;const held=current[key];
  if(depth===0&&key==='chartTypes'){if(!plainRecord(value)||!plainRecord(held))return false;for(const [typeId,values] of Object.entries(value)){const now=held[typeId];if(!plainRecord(values)||!plainRecord(now))return false;for(const [name,setting] of Object.entries(values))if(!Object.hasOwn(now,name)||!sameConfigValue(now[name],setting))return false;}continue;}
  if(plainRecord(value)){if(!plainRecord(held)||!rendererPatchIsNoop(held,value,depth+1))return false;continue;}
  if(!sameConfigValue(held,value))return false;
 }
 return true;
}
export function toVelaBars(bars: readonly Bar[]) { return bars.map(bar => ({ ...bar, time: bar.time * 1000 })); }
/** CTX 2b: instrument tick size carried in the source basis identity tuple (index 15), when known. */
export function sourceTickSize(source:Pick<ChartSourceContext,'basisIdentity'>|null|undefined):number|undefined{try{const tuple=source?.basisIdentity?JSON.parse(source.basisIdentity) as unknown[]:null,value=tuple?.[15];return typeof value==='number'&&Number.isFinite(value)&&value>0?value:undefined;}catch{return undefined;}}
/** Instrument facts the price axis labels follow, from the source basis identity tuple (symbol 2, asset class 6,
 * instrument timezone 7, session 12). Null when the source carries no basis identity. */
/** Session study fallback uses only the actual source tuple; a missing exchange zone stays unknown. */
export function sourceExchangeTimeZone(source:Pick<ChartSourceContext,'basisIdentity'>|null|undefined):string|undefined{try{const tuple=JSON.parse(validateChartSourceBasisIdentity(source?.basisIdentity)) as unknown[],value=tuple[7];return typeof value==='string'&&value.length>0&&value.length<=80?value:undefined;}catch{return undefined;}}
export function sourceAxisBasis(source:Pick<ChartSourceContext,'basisIdentity'>|null|undefined):{symbol:string;assetClass:string;timezone:string;session:string}|null{try{const tuple=source?.basisIdentity?JSON.parse(source.basisIdentity) as unknown[]:null;if(!Array.isArray(tuple))return null;const text=(index:number)=>typeof tuple[index]==='string'?tuple[index] as string:'';return{symbol:text(2),assetClass:text(6),timezone:text(7)||'UTC',session:text(12)};}catch{return null;}}
/** CTX 2b: options every calculationBarsForStyle caller passes for a derived (non-time) style; undefined for time styles.
 * lastBarOpen: the last source bar can still change (true while a replay run is active or the source is a live feed). */
export function derivedCalculationOptions(style:string,typeSettings:Record<string,unknown>|undefined,tickSize:number|undefined,lastBarOpen:boolean):DerivedCalculationOptions|undefined{if(!isDerivedStyle(style))return undefined;return{settings:derivedCalculationSettings(style,{...derivedSettingsDefaults(style),...(typeSettings??{})}),...(tickSize!==undefined?{tickSize}:{}),lastBarOpen};}
/** Owned resource teardown may observe a newly installed price scale before labels bind. */
type ChartResourceCleanup=(()=>void)&{onPriceScaleCreated?:(port:PriceScalePort)=>void};
/** Read-only renderer facts stay outside settings, source identity and persistence. */
export interface TradingSessionPaneTarget {id:string;instanceOwner:object;nativeId:string;nativeIncarnation:object;paneId:string;inverted:boolean;assertCurrent():void}
export function createTradingSessionPaneRefresh(host:{captureOwner():{isCurrent():boolean};busy():boolean;targets():readonly TradingSessionPaneTarget[];target(id:string):TradingSessionPaneTarget|null;refresh(id:string):TradingSessionPaneTarget|null;defer(callback:()=>void):void;report(error:unknown):void;accepted?():void}){
 let disposed=false,scheduled=false,refreshing=false,ticket:{owner:{isCurrent():boolean}}|null=null;
 let accepted=new WeakMap<object,{nativeId:string;nativeIncarnation:object;paneId:string;inverted:boolean}>();
 const placement=(a:{nativeId:string;paneId:string;inverted:boolean}|undefined,b:TradingSessionPaneTarget)=>!!a&&a.nativeId===b.nativeId&&a.paneId===b.paneId&&a.inverted===b.inverted;
 const same=(a:{nativeId:string;nativeIncarnation:object;paneId:string;inverted:boolean}|undefined,b:TradingSessionPaneTarget)=>placement(a,b)&&a?.nativeIncarnation===b.nativeIncarnation;
 const owned=(job:NonNullable<typeof ticket>)=>!disposed&&job.owner.isCurrent();
 const current=(job:NonNullable<typeof ticket>)=>ticket===job&&owned(job);
 const request=()=>{if(disposed)return;ticket={owner:host.captureOwner()};if(scheduled)return;scheduled=true;host.defer(flush);};
 function flush(){
  scheduled=false;const job=ticket;if(!job)return;
  try{
   if(!current(job)){if(ticket===job)ticket=null;return;}if(host.busy())return;
   const targets=host.targets();if(!current(job))return;
   for(const target of targets){
    if(!current(job))return;target.assertCurrent();if(same(accepted.get(target.instanceOwner),target))continue;
    let emission:TradingSessionPaneTarget|null;refreshing=true;try{emission=host.refresh(target.id);}finally{refreshing=false;}
    if(!owned(job))return;
    if(!emission)return;emission.assertCurrent();if(!owned(job))return;
    const after=host.target(target.id);if(!owned(job))return;
    if(!after||after.instanceOwner!==target.instanceOwner||!placement(target,after)||after.nativeIncarnation!==emission.nativeIncarnation)return;
    after.assertCurrent();if(!owned(job))return;
    // A refused, busy, superseded or reentrant refresh never declares this key accepted.
    accepted.set(after.instanceOwner,{nativeId:after.nativeId,nativeIncarnation:after.nativeIncarnation,paneId:after.paneId,inverted:after.inverted});
    if(!current(job))return;
   }
   if(current(job)){ticket=null;host.accepted?.();}
  }catch(error){if(current(job))host.report(error);}
 }
 return{request,isRefreshing:()=>refreshing,assertSettled(){const owner=host.captureOwner(),targets=host.targets();if(!owner.isCurrent())throw Error('Trading session label source is updating. Try the snapshot again.');if(!targets.length)return;if(ticket||scheduled||refreshing||host.busy())throw Error('Trading session label placement is updating. Try the snapshot again.');for(const target of targets){target.assertCurrent();if(!same(accepted.get(target.instanceOwner),target))throw Error('Trading session label placement is updating. Try the snapshot again.');}if(!owner.isCurrent())throw Error('Trading session label source is updating. Try the snapshot again.');},retire(){ticket=null;accepted=new WeakMap();},dispose(){disposed=true;ticket=null;accepted=new WeakMap();}};
}

let nextPrefetchArm=0;
/** A history page (a prepend) reloads through vela setMarket, whose restartNativeIndicators restarts every native
 * indicator (each a full recompute) inside that one task. While the prepend's setMarket runs, the starts are queued; `run`
 * then starts each in its own task (all posted at once, so other queued work runs after the set) while the renderer holds its
 * paint: frames, direct animation paints, the crosshair layer, legend values and legend status. The last start releases it
 * with one full repaint, so no frame shows a half-restarted set. A newer market (vela generation) drops the rest: that
 * setMarket restarts every native itself. Without the vela internals (fixtures) nothing is deferred. */
export type DeferredNativeStarts={stop():void;run():Promise<void>};
const HELD_PAINT=['renderFrame','paintData','renderCrosshairLayer','updateLegendValues','setIndicatorStatus'] as const;
export function deferNativeStarts(chart:unknown,renderer:unknown):DeferredNativeStarts|null{
  try{
    const core=(chart as {orchestrator?:Record<string,unknown>}|null)?.orchestrator,start=core?.startNativeIndicator,registry=core?.registry as {get?:unknown}|undefined;
    if(!core||typeof start!=='function'||!registry||typeof registry.get!=='function'||typeof core.generation!=='number'||typeof MessageChannel!=='function'||!renderer||typeof renderer!=='object'||Object.hasOwn(core,'startNativeIndicator'))return null;
    const host=renderer as Record<string,unknown>,scheduler=host.scheduler as {invalidate?:unknown}|undefined;
    if(!scheduler||typeof scheduler.invalidate!=='function'||HELD_PAINT.some(name=>typeof host[name]!=='function'||Object.hasOwn(host,name)))return null;
    const queue:Array<[unknown,unknown]>=[],statuses=new Map<unknown,[unknown,unknown]>(),setStatus=host.setIndicatorStatus as (handle:unknown,status:unknown)=>void;
    let stopped=false,running:Promise<void>|null=null;
    Object.defineProperty(core,'startNativeIndicator',{configurable:true,writable:true,value:(id:unknown,handle:unknown)=>{queue.push([id,handle]);return Promise.resolve();}});
    for(const name of HELD_PAINT)Object.defineProperty(host,name,{configurable:true,writable:true,value:name==='setIndicatorStatus'?(handle:unknown,status:unknown)=>{const key=(handle as {id?:unknown}|null)?.id??handle;statuses.delete(key);statuses.set(key,[handle,status]);}:()=>{}});
    const stop=()=>{if(stopped)return;stopped=true;delete core.startNativeIndicator;};
    const release=()=>{for(const name of HELD_PAINT)delete host[name];for(const [handle,status] of statuses.values())try{Reflect.apply(setStatus,host,[handle,status]);}catch{/* a retired legend row */}try{Reflect.apply(scheduler.invalidate as (level:number)=>void,scheduler,[4]);}catch{/* the next invalidation paints */}};
    const run=async()=>{
      stop();const generation=core.generation;
      try{
        const channel=new MessageChannel(),turns:Array<()=>void>=[];channel.port1.onmessage=()=>{turns.shift()?.();};
        const waits=queue.map(()=>new Promise<void>(resolve=>{turns.push(resolve);channel.port2.postMessage(0);}));
        try{for(let index=0;index<queue.length;index++){await waits[index];if(core.generation!==generation)break;const [id,handle]=queue[index],record=Reflect.apply(registry.get as (id:unknown)=>unknown,registry,[id]) as {native?:{started?:unknown}}|undefined;
          if(!record?.native||record.native.started)continue;await Reflect.apply(start,core,[id,handle]);}}
        finally{channel.port1.onmessage=null;channel.port1.close();}
      }catch{/* a start reports its own failure (vela fail) */}finally{release();}
    };
    return {stop,run:()=>running??=run()};
  }catch{return null;}
}
/** The renderer's inline text editor shows its own placeholder "Enter Text"; the chart shows "Type text".
 * Display only (the textarea's placeholder attribute, read as the user types); the renderer is not patched. */
export const TEXT_TOOL_PLACEHOLDER='Type text';
export function retitleTextPlaceholders(root:ParentNode):void{
 try{for(const node of Array.from(root.querySelectorAll?.('textarea')??[]))if((node as HTMLTextAreaElement).placeholder==='Enter Text')(node as HTMLTextAreaElement).placeholder=TEXT_TOOL_PLACEHOLDER;}catch{/* display only */}
}
/** The renderer names its drawing-toolbar flyout arrows "Lines \u2014 more" (em dash). Screen-reader text only;
 * rewritten to "More lines" here, the renderer is not patched (hash-pinned). Idempotent: a rewritten name no longer matches. */
const DRAWING_ARROW_NAMES:Readonly<Record<string,string>>={Lines:'More lines',Fibonacci:'More Fibonacci tools',Patterns:'More patterns',Measurements:'More measurements',Shapes:'More shapes',Text:'More text tools',Icons:'More icons','Magnet snap':'More magnet options'};
export function plainDrawingArrowName(label:string):string|null{
 const match=/^(.+?)\s*\u2014\s*more$/.exec(label);if(!match)return null;const group=match[1]!.trim();
 return DRAWING_ARROW_NAMES[group]??'More '+group.toLowerCase();
}
function retitleDrawingArrow(element:Element):void{
 const label=element.getAttribute('aria-label');if(!label)return;const plain=plainDrawingArrowName(label);if(plain)element.setAttribute('aria-label',plain);
}
export function retitleDrawingArrows(root:ParentNode):void{
 try{if((root as Element).nodeType===1&&(root as Element).matches?.('[aria-label]'))retitleDrawingArrow(root as Element);for(const node of Array.from(root.querySelectorAll?.('[aria-label]')??[]))retitleDrawingArrow(node);}catch{/* display only */}
}
function installTextPlaceholder(container:HTMLElement,cleanups:Array<()=>void>):void{
 if(typeof MutationObserver!=='function')return;
 try{retitleTextPlaceholders(container);retitleDrawingArrows(container);
  const observer=new MutationObserver(records=>{for(const record of records){if(record.type==='attributes'){if(record.target.nodeType===1)retitleDrawingArrow(record.target as Element);continue;}for(const node of Array.from(record.addedNodes)){if((node as Element).nodeType!==1)continue;const element=node as Element;if(element.tagName==='TEXTAREA'){const area=element as HTMLTextAreaElement;if(area.placeholder==='Enter Text')area.placeholder=TEXT_TOOL_PLACEHOLDER;}else{retitleTextPlaceholders(element);retitleDrawingArrows(element);}}}});
  observer.observe(container,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-label']});cleanups.push(()=>observer.disconnect());}catch{/* display only */}
}
export function createChartProbe(container: HTMLElement, bars: readonly Bar[], sourceContext:ChartSourceContext={datasetId:'synthetic-probe',revision:'1',fixture:true,label:'Synthetic capability fixture'}) {
  registerAppearanceExtensions();
  registerTemporalChartTypes();
  registerDerivedChartTypes();
  let fullModels:NativeFullModelBridge|null=null;
  /* The renderer's own (ResizeObserver) resize, recorded for controller.resize (LVRenderer.resize). */
  const rendererHolder:{current:NativeRenderer|null}={current:null},lvResize:{forwarding:boolean;native:{w:number;h:number;dpr:number;at:number}|null}={forwarding:false,native:null};class LVRenderer extends NativeRenderer{constructor(options?:RendererDisplayOptions){super(options);rendererHolder.current=this;}override mountIndicator(...args:Parameters<NativeRenderer['mountIndicator']>):ReturnType<NativeRenderer['mountIndicator']>{return lvNativeMountApply(lvNativeMountIndicator,this,args);}override updateIndicator(handle:Parameters<NativeRenderer['updateIndicator']>[0],patch:Parameters<NativeRenderer['updateIndicator']>[1]){if(!fullModels?.update(handle,patch))super.updateIndicator(handle,patch);}override resize(){super.resize();if(lvResize.forwarding)return;try{const wrapper=(this as unknown as {wrapper?:HTMLElement}).wrapper;lvResize.native=wrapper?{w:wrapper.clientWidth,h:wrapper.clientHeight,dpr:window.devicePixelRatio||1,at:performance.now()}:null;}catch{lvResize.native=null;}}}
  /* Bar-slot anchors, weak/strong magnet and snap to indicators (drawing-snap.ts), on the subclass prototype. */
  installDrawingSnap(LVRenderer.prototype);
  // The shape layer must be registered before the renderer mounts.
  let dwb3LayerRegistered=false;try{registerDwb3ShapeLayer();dwb3LayerRegistered=true;}catch{dwb3LayerRegistered=false;}
  const primaryConstructorSeed={source:new WeakRef(sourceContext),bars:new WeakRef(bars)};
  const chart = new Vela(container, { renderer:LVRenderer,data: toVelaBars(bars), live: false, theme: 'dark', nativeBackend: 'canvas2d', animations: false, drawings: false, volume: false });
  const primaryConstructorIdentity=(()=>{try{const core=Object.getOwnPropertyDescriptor(chart,'orchestrator')?.value,renderer=core&&Object.getOwnPropertyDescriptor(core,'renderer')?.value;return core&&typeof core==='object'&&renderer&&typeof renderer==='object'?{core:new WeakRef<object>(core),renderer:new WeakRef<object>(renderer)}:null;}catch{return null;}})();
  let primaryConstructorReady:Promise<unknown>|null=null;try{primaryConstructorReady=chart.ready();}catch{/* Optional source readiness cannot alter constructor acceptance. */}
  let disposed = false,destroyStarted=false;
  const earlyChartResources:Array<()=>void>=[];
  // The context must already have an owner if a later subscription acquisition fails.
  const registerPositionChartContext=(context:Parameters<typeof registerPositionContextOwner>[0])=>{
    if(disposed)throw Error('This chart is closed.');
    const off=registerPositionContextOwner(context);let released=false;
    const release=()=>{if(released)return;released=true;off();};
    earlyChartResources.push(release);return release;
  };
  let releaseChartResources:()=>void=()=>{disposed=true;attemptEveryCleanup(earlyChartResources.splice(0),'Chart startup resource cleanup was incomplete');};
  const destroyNativeChart=chart.destroy.bind(chart);
  chart.destroy=()=>{
    if(destroyStarted)return;destroyStarted=true;
    const failures:unknown[]=[];try{releaseChartResources();}catch(error){failures.push(error);}
    try{destroyNativeChart();}catch(error){failures.push(error);}
    if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Chart resources and native destruction failed');
  };
  // OpenCandle draws its own per-pane legend, so the renderer's built-in indicator title legend stays off.
  try{chart.renderer.set('indicatorTitles',false);}catch{/* A renderer without the feature has no built-in legend to hide. */}
  // The inline text editor reads "Type text" (released with the chart's early resources).
  installTextPlaceholder(container,earlyChartResources);
  let disposeAppearancePainters:(()=>void)|null=null;let indicatorDisplay:IndicatorDisplayController|null=null;let trendlineAnnotation:ReturnType<typeof installTrendlineAnnotation>|null=null;let nativeDrawingReset:ReturnType<typeof installNativeDrawingReset>|null=null;
  let inlineGeometry:ReturnType<typeof installOwnedTrendlineInlineGeometry>|null=null,inlineEditor:ReturnType<typeof installTrendlineInlineEditor>|null=null,inlineRefreshTicket:object|null=null;
  let statsSource:ReturnType<typeof createTrendlineStatisticsSource>|null=null;
  let vwapPrefixSource:ReturnType<typeof createOwnedVwapPrefixSource>|null=null;
  let vwapSourceEpoch:object={},currentExecutionIdentity='ordinary';
  let seriesReadoutRetiredBasis:{series:object;input:object}|null=null;
  let seriesDayReader:{zone:string;read:ReturnType<typeof createSeriesDayCloseReader>}|null=null;
  let seriesReadoutLease:{lease:Extract<SeriesReadout,{state:'ready'}>;view:Extract<SeriesReadout,{state:'ready'}>}|null=null;
  let statsPainter:ReturnType<typeof installTrendlineStatistics>|null=null;
  let pushDwb3Shapes:(()=>void)|null=null;
  // The DWB3 field flags belong to this chart (a grid cell whose layer failed never inherits another cell's flags); disposed with the chart.
  const dwb3Consumers=createDrawingFieldConsumerSet();
  // The workspace drawingUtility block, pushed in by the App through controller.drawingUtility.apply(). Declared early: the indicator context reads it.
  let drawingUtilityState:DrawingUtility|undefined;
  // Channels placed by the pointer that still wait for their LV level defaults in the canonical document.
  const channelSeedPending=new Set<string>();
  let fibTrendLine:ReturnType<typeof installFibTrendLine>|null=null;
  let drawingCommands:DrawingCommandRouter|null=null;
  let retireDrawingWorkspaceBinding=()=>{};
  let queueInlineRefresh=()=>{};
  let queueSessionPaneRefresh=()=>{},retireSessionPaneRefresh=()=>{},assertSessionPaneRefresh=()=>{};
  try {
  if(rendererHolder.current)fullModels=createNativeFullModelBridge(chart,rendererHolder.current);
  // The axis labels read the price scale port, the source basis and the drawings once per frame.
  let axisLabelPort:PriceScalePort|null=null,axisBasisKey:string|undefined,axisBasis:ReturnType<typeof sourceAxisBasis>=null;
  // Price-axis tags held by the DOM overlays (pane-relative px, by owner), the canvas-owned fixed
  // ranges of the last painted frame (canvas px), and the latest pre/post-market price the grid cell hands in.
  const overlayAxisTags=new Map<string,readonly (readonly [number,number])[]>();let nativeAxisFixed:readonly (readonly [number,number])[]=[];
  let prePostPrice:{price:number;phase:'pre'|'post';color:string}|null=null;
  // The live best bid and ask the grid cell hands in (null: none, or the chart replays).
  let bidAskPrice:{bid:{price:number;color:string}|null;ask:{price:number;color:string}|null}|null=null;
  // Session breaks (chart setting canvas.sessionBreaks, off by default): break times are recomputed only when the bars, interval or instrument change.
  let sessionBreaksOn=false,sessionBreaksKey='',sessionBreaksCache:number[]=[];
  // Chart settings > Scales > Symbol second line ('scale' the chip alone, 'pricePercent' adds the change row).
  let lastValueMode:'scale'|'pricePercent'='scale';
  const currentSessionBreaks=(basis:{assetClass?:string;timezone?:string}|null):number[]=>{
   const interval=nominalBarIntervalMs(currentSource?.resolution,currentBars),first=currentBars[0]?.time,last=currentBars[currentBars.length-1]?.time,key=[currentBars.length,first,last,interval,basis?.assetClass,basis?.timezone].join('|');
   if(key!==sessionBreaksKey){sessionBreaksKey=key;sessionBreaksCache=sessionBreaksFor(currentBars,basis,interval);}
   return sessionBreaksCache;};
  const pricePaneTop=():number|null=>{const top=(rendererHolder.current as unknown as {scene?:{panes?:Map<string,{bounds?:{top?:unknown}}>}}|null)?.scene?.panes?.get('price')?.bounds?.top;return typeof top==='number'&&Number.isFinite(top)?top:null;};
  const invalidateAxis=()=>{try{((rendererHolder.current as unknown as {scheduler?:{invalidate?:(level:number)=>void}}|null)?.scheduler)?.invalidate?.(4);}catch{/* The next frame repaints. */}};
  // Derived/derived-drawings.ts: the store, the canonical document and every host consumer keep drawing anchors in
  // source time; only rows going down to the renderer and its gesture intents coming up cross the derived logical axis.
  const derivedDrawings=createDerivedDrawingLens();
  // The stored Symbol precision for the canvas chips (absent or not ready: Default, the renderer text).
  const displayPrecision=():string|undefined=>{const port=axisLabelPort;if(!port||disposed)return undefined;try{return capturePriceScaleDisplayPrecision(port)?.precision;}catch{return undefined;}};
  const axisLabelContext=():AxisLabelContext|null=>{
    const port=axisLabelPort;if(!port||disposed)return null;const scale=port.settings();
    if(axisBasisKey!==currentSource.basisIdentity){axisBasisKey=currentSource.basisIdentity;axisBasis=sourceAxisBasis(currentSource);}
    const basis=axisBasis,highLow=lastAppearance?.['mainSeriesProperties.highLowAvgPrice.highLowPriceLinesColor'];
    return{labels:{symbolName:scale.labels.symbolName,prevClose:scale.labels.prevClose,highLow:scale.labels.highLow,noOverlap:scale.labels.noOverlap},lines:{prevCloseLine:scale.lines.prevCloseLine},
     symbol:basis?.symbol||null,timezone:basis?.timezone??'UTC',session:countdownSessionFor(basis?.assetClass,basis?.timezone,basis?.session),highLowColor:typeof highLow==='string'?highLow:'',
     drawings:()=>(chart.drawings.all() as unknown as AxisDrawing[]).map(row=>derivedDrawings.toNativeRow(row)),sourceDrawings:()=>chart.drawings.all() as unknown as AxisDrawing[],selected:()=>[...selectedDrawingIds],
     overlayRanges:()=>{const top=pricePaneTop();return top===null?[]:[...overlayAxisTags.values()].flat().map(([a,b])=>[a+top,b+top] as const);},
     onNativeFixed:ranges=>{nativeAxisFixed=ranges;},
     prePost:prePostPrice?{...prePostPrice,label:scale.labels.prePost,line:scale.lines.prePostLine}:null,
     bidAsk:bidAskPrice&&(scale.labels.bidAsk||scale.lines.bidAskLines)?{...bidAskPrice,label:scale.labels.bidAsk,line:scale.lines.bidAskLines}:null,
     sessionBreaks:sessionBreaksOn?{times:currentSessionBreaks(basis),color:SESSION_BREAK_COLOR}:null,lastChange:lastValueMode==='pricePercent',precision:displayPrecision(),derived:isDerivedStyle(requestedStyle)};
  };
  if(rendererHolder.current){disposeAppearancePainters=installAppearancePainters(rendererHolder.current,axisLabelContext);
   try{const offCrosshair=installPrecisionCrosshair(rendererHolder.current,displayPrecision),offPainters=disposeAppearancePainters;disposeAppearancePainters=()=>{try{offCrosshair();}finally{offPainters();}};}catch{/* No crosshair layer: the renderer text. */}}
  // Pre/post-market shading through the renderer's own sessionZones feature and shades. 'extended'
  // (LV default here: the chart shows whatever session the input carries, so its extended bars are marked) shades US equity
  // intraday pre and post runs; 'regular' clears them. Regular-only data is the input's job (regularSessionBars, App diff).
  let chartSessionMode:SessionMode='extended',sessionZonesKey='';
  const refreshSessionZones=()=>{if(disposed)return;const basis=sourceAxisBasis(currentSource),interval=nominalBarIntervalMs(currentSource?.resolution,currentBars);
   const zones=chartSessionMode==='extended'&&sessionsApply(basis?.assetClass,basis?.timezone,interval)?sessionZonesFor(currentBars,interval):null,key=JSON.stringify(zones);
   if(key===sessionZonesKey)return;sessionZonesKey=key;try{chart.renderer.set('sessionZones',zones);}catch{/* No sessionZones feature: no shading. */}};
  const rendererFrames=rendererHolder.current?createRendererFramePort(rendererHolder.current,coreModelAbsence(chart,rendererHolder.current)):null;
  registerHeikinAppearanceTransform(chartType('heikinashi')?.barTransform);
  const document = new LosslessDrawingDocument();
  const drawingReservations=createDrawingIdReservations(ids=>chart.drawings.reserveIds(ids));drawingReservations.apply(document.ids());
  const paneRegistry=createPaneRegistry(chart);
  const claimNative=fullModels?.claim;
  const analysisPublication:AnalysisPublicationHost={captureOwner(){const source=currentSource,input=currentBars,style=requestedStyle,epoch=vwapSourceEpoch,execution=currentExecutionIdentity;const isCurrent=()=>!disposed&&currentSource===source&&currentBars===input&&requestedStyle===style&&vwapSourceEpoch===epoch&&currentExecutionIdentity===execution;return{isCurrent,quarantine(error){if(isCurrent())unavailable(error.message);}};},assertMutable(){if(disposed||analysisUnavailable)throw Error('Chart analysis is unavailable. Reopen the chart before editing.');}};
  let primarySourceControl:OwnedPrimarySourceControl|null=null;
  // Fixed private mode receipt follows the actual chart-controller setter.
  // It describes geometry only and cannot register source/native membership.
  const primarySourceSelection={session:'extended' as SessionMode};
  // Only the actual adapter constructor opts in. Legacy source hosts keep their
  // original dependencies and cannot silently acquire calendar-frame authority.
  let primaryCalendarProducer:{capture(renderer:object,count:number,tail:number):object;install(renderer:object,frame:object,labels:Float64Array):SeasonalityCalendarAxisHandle;segments?:(renderer:object,frame:object,times:Float64Array,offsets:Float64Array)=>SeasonalityCalendarAxisHandle}|null=null;
  const primarySourceSettled=new Set<()=>void>();
  let primaryWakeQueued=false;
  const notifyPrimarySourceSettled=()=>{if(disposed||primaryWakeQueued)return;primaryWakeQueued=true;queueMicrotask(()=>{primaryWakeQueued=false;if(disposed)return;for(const listener of [...primarySourceSettled])try{listener();}catch{/* An optional source demand cannot affect native publication. */}});};
  // This host stores closures only. No late adapter state is read during real port construction.
  const primarySourceHost:OwnedPrimarySourceHost={sourceMode:()=>capturePrimarySourceMode(),capture:()=>capturePrimarySourceBasis(),accepted:(token,liveGeometry)=>acceptedPrimarySourceFrame(token,liveGeometry),subscribeSettled(listener){if(disposed)throw Error('Chart source is disposed.');primarySourceSettled.add(listener);return()=>{primarySourceSettled.delete(listener);};}};
  function createIndicatorPort(...args:Parameters<typeof createLegacyIndicatorPort>){
   const capture:NativeRenderer['lvCaptureTimeFrame']|undefined=Object.getOwnPropertyDescriptor(NativeRenderer.prototype,'lvCaptureTimeFrame')?.value,install:NativeRenderer['lvSetFutureTimeSpine']|undefined=Object.getOwnPropertyDescriptor(NativeRenderer.prototype,'lvSetFutureTimeSpine')?.value,segments:NativeRenderer['lvSetFutureTimeSegments']|undefined=Object.getOwnPropertyDescriptor(NativeRenderer.prototype,'lvSetFutureTimeSegments')?.value;
   if(typeof capture==='function'&&typeof install==='function')primaryCalendarProducer=Object.freeze({capture(renderer:object,count:number,tail:number){return Reflect.apply(capture,renderer,[count,tail]);},install(renderer:object,frame:object,labels:Float64Array){return Reflect.apply(install,renderer,[frame,labels]);},...(typeof segments==='function'?{segments(renderer:object,frame:object,times:Float64Array,offsets:Float64Array){return Reflect.apply(segments,renderer,[frame,times,offsets]);}}:{})});
   const owned=createIndicatorPortWithPrimarySource({chart:args[0],panes:args[1],calculationBars:args[2],inputBars:args[3],claimNative:args[4],presentationContext:args[5],publication:args[6],vwap:args[7],primaryHost:primarySourceHost,...(primaryCalendarProducer?{calendar:true as const}:{})});primarySourceControl=owned.primary;return owned.port;
  }
  const indicators=createIndicatorPort(chart,paneRegistry,raw=>sharedFeedRows(raw),()=>currentBars,claimNative,(owner)=>{const context=indicatorContextWithOverlay(currentSource.resolution??null,drawingUtilityState),basis=sourceAxisBasis(currentSource),calendar=sourcePivotCalendar(basis?.assetClass,basis?.timezone);return {...context,paneInverted:typeof readSessionPane==='function'?readSessionPane(owner)?.inverted??null:null,...(calendar?{calendar}:{}),...(sourceExchangeTimeZone(currentSource)?{exchangeZone:sourceExchangeTimeZone(currentSource)}:{}),style:requestedStyle,...profileSourceContext(currentSource,currentBars)};},analysisPublication,{capture:()=>{if(!vwapPrefixSource)throw Error('VWAP prefix source is not initialized.');return vwapPrefixSource.capture();},client:applicationVwapClient});
  // UI authority is private to this exact producer. Export eligibility and the public live-lineage match are not proof.
  const scriptPresentationHost:ScriptPresentationHost={capturePriceScaleFormat(){
   try{
    const port=axisLabelPort,source=currentSource,epoch=vwapSourceEpoch,execution=currentExecutionIdentity,style=requestedStyle;
    if(!port||disposed||analysisUnavailable||analysisPending||marketUpdating||marketQueue.isPending())return null;
    const precision=capturePriceScaleDisplayPrecision(port);if(!precision)return null;precision.assertCurrent();
    const tick=sourceTickSize(source);let main:Extract<SeriesReadout,{state:'ready'}>|null=null,reference:number|null=null;
    if((precision.precision===undefined||precision.precision==='default')&&isSymbolMathDatasetId(source.datasetId)){
     const captured=controller.captureSeriesReadout();if(captured.state!=='ready')return null;main=captured;main.assertCurrent();reference=main.readPosition({kind:'latest'}).bar.close;main.assertCurrent();if(!Number.isFinite(reference))return null;
    }
    const digits=reference!==null?derivedPriceDecimals(reference):typeof tick==='number'&&Number.isFinite(tick)&&tick>0?tickDecimals(tick):2;
    const format=precisionFormatter(precision.precision,value=>value.toFixed(digits));
    const assertCurrent=()=>{if(disposed||analysisUnavailable||analysisPending||marketUpdating||marketQueue.isPending()||axisLabelPort!==port||currentSource!==source||vwapSourceEpoch!==epoch||currentExecutionIdentity!==execution||requestedStyle!==style)throw Error('Script label formatting source changed.');precision.assertCurrent();main?.assertCurrent();};
    assertCurrent();return Object.freeze({assertCurrent,format(value:number){assertCurrent();const text=format(value);assertCurrent();return text;}});
   }catch{return null;}
  },capture(expected,consumed,renew){
   try{
    const input=expected.input,execution=expected.execution,source=currentSource;
    const sourceKeys=['datasetId','revision','fixture','label','resolution','basisIdentity','inputIdentity','sessionOverride'] as const;
    const sourceValues=sourceKeys.map(key=>{const field=Object.getOwnPropertyDescriptor(source,key);if(field&&(!('value' in field)||field.value!==undefined&&(key==='fixture'?typeof field.value!=='boolean':typeof field.value!=='string')))throw Error('Script presentation source fields must be primitive data.');return field?.value;});
    if(disposed||analysisUnavailable||analysisPending||marketUpdating||marketQueue.isPending()||execution!==currentExecutionIdentity||input.style!==requestedStyle||!sameChartSourceBasis(currentSource,input.source,true)||!renew&&!controller.isInputExact(input)||consumed.length>5000)return null;
    const epoch=vwapSourceEpoch,style=requestedStyle,publication=analysisPublication.captureOwner(),frame=captureScriptPresentationInputFrame(chart as unknown as object);
    if(!frame||!publication.isCurrent())return null;
    const derived=isDerivedStyle(style)?derivedMemo:null;
    if(isDerivedStyle(style)&&(!derived||derived.raw!==currentBars||derived.style!==style||!derived.result.ok))return null;
    const data=(value:unknown,key:string):any=>{if(!value||typeof value!=='object')throw Error('Derived script axis data is unavailable.');const field=Object.getOwnPropertyDescriptor(value,key);if(!field||!('value' in field))throw Error('Derived script axis requires own data.');return field.value;};
    const derivedResult=derived?data(derived,'result'):null,series=derived?data(derivedResult,'value'):null;
    const actual=derived?data(series,'confirmed'):frame.rows;
    // A chart longer than the script limit runs on its newest rows: consumed is then exactly the last 5,000 confirmed rows.
    const offset=Array.isArray(actual)?actual.length-consumed.length:-1;
    if(!Array.isArray(actual)||offset<0||offset>0&&(derived!==null||consumed.length!==5000)||frame.rows.length<actual.length)return null;
    let axisCurrent:(()=>boolean)|undefined,axisRows:readonly unknown[]|undefined,axisFeed:readonly unknown[]|undefined,sourceTimes:readonly unknown[]|undefined;
    if(derived){
     const axis=data(derived,'axis'),rows=data(axis,'bars'),feed=data(axis,'feed'),times=data(axis,'sourceTimes'),projection=data(series,'projection'),projectionFrom=data(axis,'projectionFrom'),step=data(axis,'syntheticStep');
     if(![rows,feed,times,projection].every(value=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype)||projectionFrom!==actual.length||!Number.isSafeInteger(projectionFrom)||typeof step!=='number'||!Number.isFinite(step)||step<=0||rows.length!==actual.length+projection.length||feed.length!==rows.length||times.length!==rows.length||frame.rows.length!==feed.length)return null;
     const length=rows.length;axisRows=rows;axisFeed=feed;sourceTimes=times;
     axisCurrent=()=>data(derived,'axis')===axis&&data(derived,'result')===derivedResult&&data(derivedResult,'value')===series&&data(series,'confirmed')===actual&&data(series,'projection')===projection&&data(axis,'bars')===rows&&data(axis,'feed')===feed&&data(axis,'sourceTimes')===times&&data(axis,'projectionFrom')===projectionFrom&&data(axis,'syntheticStep')===step&&rows.length===length&&feed.length===length&&times.length===length&&actual.length===projectionFrom&&projection.length===length-projectionFrom;
    }
    const fields=['time','open','high','low','close','volume'] as const;let previous=-Infinity;
    // One bounded dispatch/renewal traversal of the actual confirmed/native producer, not a hover verifier or copy.
    for(let index=0;index<consumed.length;index++){
     const row=Object.getOwnPropertyDescriptor(actual,String(offset+index)),given=Object.getOwnPropertyDescriptor(consumed,String(index)),native=Object.getOwnPropertyDescriptor(frame.rows,String(offset+index));
     if(!row||!given||!native||!('value' in row)||!('value' in given)||!('value' in native))return null;
     if(derived){
      const eventTime=scriptPresentationNumber(row.value,'time'),feedRow=data(axisFeed,String(index)),feedTime=scriptPresentationNumber(feedRow,'time');
      // Timestamp-only status values cannot distinguish duplicate events or remap a synthetic logical axis yet.
      if(data(axisRows,String(index))!==row.value||!Object.is(data(sourceTimes,String(index)),eventTime)||eventTime<=previous||!Object.is(feedTime,eventTime)||!Object.is(scriptPresentationNumber(native.value,'time',1000),feedTime))return null;
      for(const field of fields)if(!Object.is(scriptPresentationNumber(feedRow,field),scriptPresentationNumber(row.value,field)))return null;
      previous=eventTime;
     }
     for(const field of fields){
      const value=scriptPresentationNumber(row.value,field,derived?1:1000);
      if(!Object.is(value,scriptPresentationNumber(given.value,field)))return null;
      if(derived&&field!=='time'&&!Object.is(value,scriptPresentationNumber(native.value,field)))return null;
     }
    }
    let alive=true;
    const current=()=>{if(!alive)return false;try{
     const matches=!disposed&&!analysisUnavailable&&!analysisPending&&!marketUpdating&&!marketQueue.isPending()&&currentSource===source&&vwapSourceEpoch===epoch&&requestedStyle===style&&currentExecutionIdentity===execution&&(!derived||derivedMemo===derived&&axisCurrent!==undefined&&axisCurrent())&&publication.isCurrent()&&frame.isCurrent()&&sourceKeys.every((key,index)=>{const field=Object.getOwnPropertyDescriptor(source,key);return(!field||'value' in field)&&Object.is(field?.value,sourceValues[index]);});
     if(!matches)alive=false;return matches;
    }catch{alive=false;return false;}};
    return current()?{isCurrent:current}:null;
   }catch{return null;}
  },captureLogical(expected,consumed,renew){
   try{
    const input=expected.input,execution=expected.execution,source=currentSource;
    const sourceKeys=['datasetId','revision','fixture','label','resolution','basisIdentity','inputIdentity','sessionOverride'] as const;
    const sourceValues=sourceKeys.map(key=>{const field=Object.getOwnPropertyDescriptor(source,key);if(field&&(!('value' in field)||field.value!==undefined&&(key==='fixture'?typeof field.value!=='boolean':typeof field.value!=='string')))throw Error('Script presentation source fields must be primitive data.');return field?.value;});
    if(disposed||analysisUnavailable||analysisPending||marketUpdating||marketQueue.isPending()||execution!==currentExecutionIdentity||input.style!==requestedStyle||!sameChartSourceBasis(currentSource,input.source,true)||!renew&&!controller.isInputExact(input)||consumed.length>5000)return null;
    const epoch=vwapSourceEpoch,style=requestedStyle,publication=analysisPublication.captureOwner();
    publishDerivedPayload(currentBars,{kind:'renew'});
    if(!publication.isCurrent())return null;
    const derived=isDerivedStyle(style)?derivedMemo:null,accepted=acceptedScriptMarket;
    if(isDerivedStyle(style)&&(!derived||!accepted||accepted.source!==source||accepted.bars!==currentBars||accepted.style!==style||accepted.memo!==derived||accepted.execution!==execution||accepted.epoch!==epoch||!accepted.frame.isCurrent()))return null;
    const frame=captureScriptPresentationInputFrame(chart as unknown as object);if(!frame||!publication.isCurrent())return null;
    if(isDerivedStyle(style)&&(!derived||derived.raw!==currentBars||derived.style!==style||!derived.result.ok))return null;
    const data=(value:unknown,key:string):any=>{if(!value||typeof value!=='object')throw Error('Derived script axis data is unavailable.');const field=Object.getOwnPropertyDescriptor(value,key);if(!field||!('value' in field))throw Error('Derived script axis requires own data.');return field.value;};
    const derivedResult=derived?data(derived,'result'):null,series=derived?data(derivedResult,'value'):null;
    const actual=derived?data(series,'confirmed'):frame.rows;
    // A chart longer than the script limit runs on its newest rows: consumed is then exactly the last 5,000 confirmed rows.
    const offset=Array.isArray(actual)?actual.length-consumed.length:-1;
    if(!Array.isArray(actual)||offset<0||offset>0&&consumed.length!==5000||frame.rows.length<actual.length)return null;
    let axisCurrent:(()=>boolean)|undefined,positionInput:Parameters<typeof createScriptLogicalPositions>[0]|undefined;
    if(derived){
     const axis=data(derived,'axis'),rows=data(axis,'bars'),feed=data(axis,'feed'),times=data(axis,'sourceTimes'),projection=data(series,'projection'),projectionFrom=data(axis,'projectionFrom'),step=data(axis,'syntheticStep');
     if(![rows,feed,times,projection].every(value=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype)||projectionFrom!==actual.length||!Number.isSafeInteger(projectionFrom)||typeof step!=='number'||!Number.isFinite(step)||step<=0||rows.length!==actual.length+projection.length||feed.length!==rows.length||times.length!==rows.length||frame.rows.length!==feed.length)return null;
     const length=rows.length;
     axisCurrent=()=>data(derived,'axis')===axis&&data(derived,'result')===derivedResult&&data(derivedResult,'value')===series&&data(series,'confirmed')===actual&&data(series,'projection')===projection&&data(axis,'bars')===rows&&data(axis,'feed')===feed&&data(axis,'sourceTimes')===times&&data(axis,'projectionFrom')===projectionFrom&&data(axis,'syntheticStep')===step&&rows.length===length&&feed.length===length&&times.length===length&&actual.length===projectionFrom&&projection.length===length-projectionFrom;
     positionInput=offset?{confirmed:actual.slice(offset),consumed,axisRows:rows.slice(offset),feed:feed.slice(offset),sourceTimes:times.slice(offset),native:frame.rows.slice(offset),projection,projectionFrom:projectionFrom-offset,step,isCurrent:()=>current()}:{confirmed:actual,consumed,axisRows:rows,feed,sourceTimes:times,native:frame.rows,projection,projectionFrom,step,isCurrent:()=>current()};
    }else{
     const fields=['time','open','high','low','close','volume'] as const;
     // Ordinary/HA input proof stays on its original numeric path.
     for(let index=0;index<consumed.length;index++){
      const row=Object.getOwnPropertyDescriptor(actual,String(offset+index)),given=Object.getOwnPropertyDescriptor(consumed,String(index));
      if(!row||!given||!('value' in row)||!('value' in given))return null;
      for(const field of fields)if(!Object.is(scriptPresentationNumber(row.value,field,1000),scriptPresentationNumber(given.value,field)))return null;
     }
    }
    let alive=true;
    const current=()=>{if(!alive)return false;try{
     const matches=!disposed&&!analysisUnavailable&&!analysisPending&&!marketUpdating&&!marketQueue.isPending()&&currentSource===source&&vwapSourceEpoch===epoch&&requestedStyle===style&&currentExecutionIdentity===execution&&(!derived||acceptedScriptMarket===accepted&&accepted!==null&&accepted.frame.isCurrent()&&derivedMemo===derived&&axisCurrent!==undefined&&axisCurrent())&&publication.isCurrent()&&frame.isCurrent()&&sourceKeys.every((key,index)=>{const field=Object.getOwnPropertyDescriptor(source,key);return(!field||'value' in field)&&Object.is(field?.value,sourceValues[index]);});
     if(!matches)alive=false;return matches;
    }catch{alive=false;return false;}};
    if(!current())return null;
    // Projection rows prove completion of the owned native feed, but are never consumed observations.
    if(positionInput)for(let index=consumed.length;index<positionInput.feed.length;index++)for(const field of ['time','open','high','low','close','volume'] as const){if(!current())return null;const expectedValue=scriptPresentationNumber(data(positionInput.feed,String(index)),field);if(!current())return null;const nativeValue=scriptPresentationNumber(data(positionInput.native,String(index)),field,field==='time'?1000:1);if(!current()||!Object.is(expectedValue,nativeValue))return null;}
    const logicalPositions:ScriptLogicalPositions|null=positionInput?createScriptLogicalPositions(positionInput):null;if(derived&&!logicalPositions)return null;
    return current()?{isCurrent:current,...(logicalPositions?{logicalPositions}:{})}:null;
   }catch{return null;}
  }};
  const scripts=createScriptPort(chart,paneRegistry,claimNative,scriptPresentationHost);
  if(rendererHolder.current)indicatorDisplay=installIndicatorDisplay(rendererHolder.current,chart,indicators,scripts);
  const comparisons=createComparisonPort(chart,claimNative,analysisPublication);
  const drawingPreferences=createDrawingPreferencesPort({read:()=>({magnet:chart.drawings.getSnapMode(),stay:chart.drawings.getStayMode()}),setMagnet:mode=>{chart.drawings.setSnapMode(mode);},setStay:on=>{chart.drawings.setStayMode(on);},onSnap:callback=>chart.on('drawing:snap',callback),onStay:callback=>chart.on('drawing:stay',callback)});
  const knownTypes = new Set(drawingTypes().map(meta => meta.type));
  let lastAppearance: AppearanceSettings | null = null;
  // Gap 4: "Indicators and financials value labels" (price scale menu) gates the indicator value tags on top of the appearance flag.
  const gateIndicatorLabels=(options:ReturnType<typeof indicatorDisplayOptionsFromAppearance>)=>({...options,labelsVisible:options.labelsVisible&&(axisLabelPort?.settings().labels.indValue??true)});
  let diagnostics: ChartDiagnostic[] = [];
  let unavailableDrawingIds=new Set<string>(),drawingBindingDiagnostics:ChartDiagnostic[]=[];
  queueInlineRefresh=()=>{if(!inlineEditor)return;const ticket={},expected=inlineEditor,source=currentSource,input=currentBars,style=requestedStyle;inlineRefreshTicket=ticket;queueMicrotask(()=>{if(inlineRefreshTicket!==ticket)return;inlineRefreshTicket=null;const owns=()=>!disposed&&inlineEditor===expected&&currentSource===source&&currentBars===input&&requestedStyle===style;if(!owns())return;try{expected.refresh();}catch(error){if(!owns())return;let message='Inline text refresh failed; details are unavailable.';try{message=String(error);}catch{/* Preserve a bounded diagnostic when formatting fails. */}if(!owns())return;diagnostics=diagnostics.filter(row=>row.code!=='INLINE_TEXT_REFRESH');diagnostics.push({code:'INLINE_TEXT_REFRESH',feature:'Trendline inline text',severity:'warning',message});}});};
  let currentBars = cloneProfileInputBars(bars);
  let calculationBarCache=createCalculationBarCache();
  // Derived (non-time) styles. One memoized construction per (input, style, options); the renderer is fed the
  // logical axis (synthetic increasing times), labels map back to source event times, calculations use CONFIRMED rows only.
  type ScriptMarketBasis={source:ChartSourceContext;bars:readonly Bar[];style:string;memo:NonNullable<typeof derivedMemo>;execution:string;epoch:object;facts:readonly unknown[]};
  type ScriptMarketAccepted=ScriptMarketBasis&{frame:NonNullable<ReturnType<typeof captureScriptPresentationInputFrame>>};
  type DerivedPublishCommand={kind:'prepare'}|{kind:'commit'|'release';ticket:object|null}|{kind:'retire-source'|'renew'}|{kind:'execution';expectedExecution:string};
  const scriptMarketFields=['datasetId','revision','fixture','label','resolution','basisIdentity','inputIdentity','sessionOverride'] as const;
  let acceptedScriptMarket:ScriptMarketAccepted|null=null,scriptApplyTicket:object|null=null,scriptApplyTickets=new WeakMap<object,ScriptMarketBasis>();
  let derivedMemo:{raw:readonly Bar[];style:string;key:string;result:DerivedResult;axis:DerivedAxis|null}|null=null,fedDerivedKey:string|null=null,derivedStepPin:{key:string;step:number}|null=null;
  // A live feed's last bar is forming, so derived constructions never present it as settled.
  const lastBarForming=()=>currentExecutionIdentity!=='ordinary'||currentSource.datasetId.startsWith('live:')||isReplayFrameBars(currentBars);
  const derivedFor=(raw:readonly Bar[],style:string=requestedStyle)=>{
    const settings=(chart.renderer.getConfig() as {chartTypes?:Record<string,Record<string,unknown>>}).chartTypes?.[style];
    const options=derivedCalculationOptions(style,settings,sourceTickSize(currentSource),lastBarForming());if(!options||!isDerivedStyle(style))return null;
    const key=JSON.stringify(options);if(derivedMemo&&derivedMemo.raw===raw&&derivedMemo.style===style&&derivedMemo.key===key)return derivedMemo;
    // One live subscription keeps the first ATR or Percentage step it resolved (the pin is a function of the key, so it stays out of it).
    /* typeof: extracted-block harnesses evaluate this body without the module imports. */const pinKey=typeof derivedStepPinKey==='function'&&typeof isLiveInputIdentity==='function'&&lastBarForming()&&isLiveInputIdentity(currentSource.inputIdentity)?derivedStepPinKey(style,options.settings,currentSource.datasetId+'|'+String(currentSource.resolution)+'|'+currentSource.inputIdentity)
     // A replay run pins the step it first resolved from the revealed bars too, so stepping never re-bricks the chart; a new run (seek, start, interval) resolves again.
     :typeof derivedStepPinKey==='function'&&currentExecutionIdentity!=='ordinary'?derivedStepPinKey(style,options.settings,'replay|'+currentSource.datasetId+'|'+String(currentSource.resolution)+'|'+currentExecutionIdentity):null;
    if(pinKey&&derivedStepPin?.key===pinKey)options.pinnedStep=derivedStepPin.step;
    // The synthetic step is the source interval, so the renderer's time axis formats a daily-or-higher
    // source as dates. parseInterval gives seconds only for second/minute units; day/week/month take calendar-day multiples.
    let seconds=60;try{const spec=currentSource.resolution?parseInterval(currentSource.resolution):null,days=spec&&spec.kind==='time'&&spec.seconds===null?({day:1,week:7,month:30} as Record<string,number>)[spec.unit]:undefined;seconds=spec?.seconds??(days?days*86400*spec!.multiplier:60);}catch{seconds=60;}
    const result=derivedCalculation(raw,style,options),axis=result.ok?buildDerivedAxis(result.value,seconds||60):null;
    if(pinKey&&derivedStepPin?.key!==pinKey&&result.ok&&result.value.step!==null)derivedStepPin={key:pinKey,step:result.value.step};
    derivedMemo={raw,style,key,result,axis};return derivedMemo;
  };
  /** Calculation rows (original event times): derived styles return CONFIRMED rows only, never standard bars. */
  // User-visible derived chart errors name the chart type by its label; the diagnostic code stays on the error (diagnosticCode), not in the text.
  const chartTypeLabel=(style:string)=>CHART_TYPES.find(([id])=>id===style)?.[1]??'This chart type';
  /** The refusal of a derived type whose construction is unavailable for the current bars (its feed would be empty). */
  const derivedDrawRefusal=():DerivedDrawRefusal|null=>{if(!isDerivedStyle(requestedStyle))return null;const derived=derivedFor(currentBars);if(!derived||derived.result.ok)return null;const diagnostic=derived.result.diagnostic;return new DerivedDrawRefusal(chartTypeLabel(requestedStyle)+' chart cannot be drawn from these bars: '+diagnostic.message,diagnostic);};
  const calculationBars=(raw:readonly Bar[],style:string):Bar[]=>{if(!isDerivedStyle(style))return calculationBarCache(raw,style);const derived=derivedFor(raw,style)!;if(!derived.result.ok)throw Object.assign(new Error(chartTypeLabel(style)+' calculation inputs are unavailable: '+derived.result.diagnostic.message),{diagnosticCode:derived.result.diagnostic.code});return derived.result.value.confirmed.map(({time,open,high,low,close,volume})=>({time,open,high,low,close,volume}));};
  /** The indicators of one chart share one standard-style calculation copy per converted input (the port hands every indicator the same converted array for an unchanged input, and never mutates it). Keyed by that array and the chart type, so a type change rebuilds. Derived types keep their own memo. */
  const feedRowsMemo=new WeakMap<readonly Bar[],{style:string;epoch:object;count:number;tail:Bar|undefined;rows:Bar[]}>();
  // A standard style copies each row on its own ({...bar}), so a live tick reuses the copies of rows that are the same objects as last time.
  let lastFeedRows:{raw:readonly Bar[];style:string;epoch:object;count:number;tail:Bar|undefined;rows:Bar[]}|null=null;
  const sharedFeedRows=(raw:readonly Bar[]):Bar[]=>{if(isDerivedStyle(requestedStyle))return derivedFeedRows(raw);const style=requestedStyle,epoch=vwapSourceEpoch,count=raw.length,tail=raw[count-1],hit=feedRowsMemo.get(raw);if(hit&&hit.style===style&&hit.epoch===epoch&&hit.count===count&&hit.tail===tail)return hit.rows;
    const prior=lastFeedRows;let rows:Bar[];
    if(prior&&prior.style===style&&style!=='heikinashi'){let kept=0;const limit=Math.min(prior.count,count);while(kept<limit){const actual=raw[kept],before=prior.rows[kept];const same=prior.raw===raw?!!before&&Object.is(before.time,actual.time)&&Object.is(before.open,actual.open)&&Object.is(before.high,actual.high)&&Object.is(before.low,actual.low)&&Object.is(before.close,actual.close)&&Object.is(before.volume,actual.volume):actual===prior.raw[kept];if(!same)break;kept++;}rows=prior.rows.slice(0,kept);for(let index=kept;index<count;index++)rows.push({...raw[index]});}
    else rows=derivedFeedRows(raw);
    // A callback during calculation may already have installed a newer source/style cache.
    if(requestedStyle===style&&vwapSourceEpoch===epoch&&raw.length===count&&raw[count-1]===tail){feedRowsMemo.set(raw,{style,epoch,count,tail,rows});lastFeedRows={raw,style,epoch,count,tail,rows};}return rows;};
  /** Rows pushed to vela (indicator plots): derived confirmed row i is re-timed to axis.feed[i].time so plots align with the bars. */
  const derivedFeedRows=(raw:readonly Bar[]):Bar[]=>{if(!isDerivedStyle(requestedStyle))return calculationBarsForStyle(raw,requestedStyle);const rows=calculationBars(raw,requestedStyle),axis=derivedFor(raw)!.axis!;return rows.map((row,index)=>({...row,time:axis.feed[index].time}));};
  /** Renderer feed: the derived logical axis (empty when the construction is unavailable: never standard bars) or the source bars. */
  const velaFeed=(raw:readonly Bar[]):readonly Bar[]=>{const derived=derivedFor(raw);return derived?derived.axis?.feed??[]:raw;};
  const derivedFeedKey=(raw:readonly Bar[])=>{const derived=derivedFor(raw);return derived?derived.style+'|'+derived.key:null;};
  const publishDerivedRendererPayload=(raw:readonly Bar[])=>{
    // The TPO layer reads the instrument tick size (Ticks per row, Auto rounding) from its native-data channel.
    // TPO and Session volume profile also read the declared session calendar, the exchange zone and the resolution.
    if(requestedStyle==='tpo'||requestedStyle==='sessionvp'||requestedStyle==='footprint'){const basis=sourceAxisBasis(currentSource);(rendererHolder.current as unknown as {setNativeData?:(type:string,data:unknown)=>void}|null)?.setNativeData?.(requestedStyle,{tickSize:sourceTickSize(currentSource)??null,calendar:sourcePivotCalendar(basis?.assetClass,basis?.timezone)??null,timeZone:sourceExchangeTimeZone(currentSource)??null,resolution:currentSource.resolution??null});}
    const derived=derivedFor(raw);if(!derived)return;
    const result=derived.result;if(!result.ok){const failure=result.diagnostic;if(!diagnostics.some(row=>row.code===failure.code&&row.feature===failure.feature))diagnostics.push(failure);return;}
    const renderer=rendererHolder.current as unknown as {setNativeData?:(type:string,data:unknown)=>void}|null;
    renderer?.setNativeData?.(derived.style,{style:derived.style,bars:derived.axis!.bars,projectionFrom:derived.axis!.projectionFrom,step:result.value.step});
  };
  const scriptMarketOwner=(basis:ScriptMarketBasis,exactEpoch=true):boolean=>{
   if(disposed||analysisUnavailable||currentSource!==basis.source||currentBars!==basis.bars||requestedStyle!==basis.style||derivedMemo!==basis.memo||exactEpoch&&(currentExecutionIdentity!==basis.execution||vwapSourceEpoch!==basis.epoch))return false;
   return scriptMarketFields.every((key,index)=>{const field=Object.getOwnPropertyDescriptor(basis.source,key);return(!field||Object.hasOwn(field,'value'))&&Object.is(field?.value,basis.facts[index]);});
  };
  const scriptMarketBasis=(raw:readonly Bar[]):ScriptMarketBasis|null=>{
   if(disposed||analysisUnavailable||raw!==currentBars||!isDerivedStyle(requestedStyle))return null;
   const source=currentSource,bars=currentBars,style=requestedStyle,execution=currentExecutionIdentity,epoch=vwapSourceEpoch,memo=derivedMemo;
   if(!memo||memo.raw!==bars||memo.style!==style||!memo.result.ok||!memo.axis)return null;
   const facts=Object.freeze(scriptMarketFields.map(key=>{const field=Object.getOwnPropertyDescriptor(source,key);if(field&&!Object.hasOwn(field,'value'))throw Error('Script input source requires data fields.');const value=field?.value;if(value!==undefined&&!(key==='fixture'?typeof value==='boolean':typeof value==='string'))throw Error('Script input source fields are invalid.');return value;}));
   const basis={source,bars,style,execution,epoch,memo,facts};return scriptMarketOwner(basis)?basis:null;
  };
  const scriptMarketFrameMatches=(basis:ScriptMarketBasis,frame:ScriptMarketAccepted['frame'],current:()=>boolean):boolean=>{
   if(!current()||!basis.memo.result.ok||!basis.memo.axis)return false;const feed=basis.memo.axis.feed;
   if(frame.rows.length!==feed.length)return false;
   // The owner is checked every 256 rows and at the end, not before and after each field: the
   // reads are own data descriptors (no accessor runs), and per-field checks made a 10,000-bar range chart a 400 ms task.
   for(let index=0;index<feed.length;index++){
    if((index&255)===0&&!current())return false;const expected=Object.getOwnPropertyDescriptor(feed,String(index));if(!expected||!Object.hasOwn(expected,'value'))return false;
    const actual=Object.getOwnPropertyDescriptor(frame.rows,String(index));if(!actual||!Object.hasOwn(actual,'value'))return false;
    for(const key of ['time','open','high','low','close','volume'] as const)if(!Object.is(scriptPresentationNumber(expected.value,key),scriptPresentationNumber(actual.value,key,key==='time'?1000:1)))return false;
   }return current();
  };
  const renewScriptMarket=(executionHandoff=false):boolean=>{
   const accepted=acceptedScriptMarket;if(!accepted)return false;
   if(!scriptMarketOwner(accepted,false)){if(acceptedScriptMarket===accepted)acceptedScriptMarket=null;return false;}
   if(marketUpdating||!executionHandoff&&accepted.execution!==currentExecutionIdentity)return false;
   if(!accepted.frame.isCurrent()){if(acceptedScriptMarket===accepted)acceptedScriptMarket=null;return false;}
   if(accepted.execution===currentExecutionIdentity&&accepted.epoch===vwapSourceEpoch)return true;
   const basis={...accepted,execution:currentExecutionIdentity,epoch:vwapSourceEpoch},current=()=>acceptedScriptMarket===accepted&&!marketUpdating&&scriptMarketOwner(basis)&&accepted.frame.isCurrent();
   if(!scriptMarketFrameMatches(basis,accepted.frame,current)){if(acceptedScriptMarket===accepted)acceptedScriptMarket=null;return false;}
   acceptedScriptMarket={...basis,frame:accepted.frame};return true;
  };
  const publishDerivedPayload=(raw:readonly Bar[],command?:DerivedPublishCommand):object|null=>{
   if(command?.kind==='retire-source'){acceptedScriptMarket=null;scriptApplyTicket=null;scriptApplyTickets=new WeakMap();return null;}
   if(command?.kind==='release'){if(command.ticket&&scriptApplyTicket===command.ticket){scriptApplyTickets.delete(command.ticket);scriptApplyTicket=null;}return null;}
   if(!isDerivedStyle(requestedStyle)){
    acceptedScriptMarket=null;scriptApplyTicket=null;scriptApplyTickets=new WeakMap();
    if(!command||command.kind==='commit'&&!command.ticket)publishDerivedRendererPayload(raw);return null;
   }
   if(command?.kind==='prepare'){
    if(!isDerivedStyle(requestedStyle))return null;acceptedScriptMarket=null;scriptApplyTicket=null;scriptApplyTickets=new WeakMap();const basis=scriptMarketBasis(raw);if(!basis)return null;
    const ticket=Object.freeze(Object.create(null)) as object;scriptApplyTicket=ticket;scriptApplyTickets.set(ticket,basis);return ticket;
   }
   if(command?.kind==='commit'){
    if(!command.ticket){if(!isDerivedStyle(requestedStyle))publishDerivedRendererPayload(raw);return null;}
    const basis=scriptApplyTickets.get(command.ticket);if(!basis||scriptApplyTicket!==command.ticket||raw!==basis.bars||!scriptMarketOwner(basis))return null;
    const frame=captureScriptPresentationInputFrame(chart as unknown as object),current=()=>scriptApplyTicket===command.ticket&&scriptApplyTickets.get(command.ticket!)===basis&&scriptMarketOwner(basis)&&!!frame&&frame.isCurrent();
    if(!frame||!scriptMarketFrameMatches(basis,frame,current)){if(current())throw Error('The chart native input is not fully accepted.');return null;}
    const accepted={...basis,frame};acceptedScriptMarket=accepted;try{publishDerivedRendererPayload(raw);}catch(error){if(acceptedScriptMarket===accepted)acceptedScriptMarket=null;throw error;}if(!current()&&acceptedScriptMarket===accepted)acceptedScriptMarket=null;return null;
   }
   if(command?.kind==='renew'){if(isDerivedStyle(requestedStyle))renewScriptMarket();return null;}
   if(command?.kind==='execution'){
    if(disposed||analysisUnavailable||command.expectedExecution!==currentExecutionIdentity||raw!==currentBars||!isDerivedStyle(requestedStyle))return null;
    const source=currentSource,input=currentBars,style=requestedStyle,execution=currentExecutionIdentity,epoch=vwapSourceEpoch,key=derivedFeedKey(raw);
    const current=()=>!disposed&&!analysisUnavailable&&currentSource===source&&currentBars===input&&requestedStyle===style&&currentExecutionIdentity===execution&&vwapSourceEpoch===epoch;if(!current())return null;
    const pending=scriptApplyTicket?scriptApplyTickets.get(scriptApplyTicket):null;
    if(!pending&&key===fedDerivedKey&&renewScriptMarket(true))return null;
    if(pending&&pending.execution===execution&&pending.epoch===epoch&&scriptMarketOwner(pending)&&key===fedDerivedKey)return null;
    if(!current())return null;fedDerivedKey=null;applyRequestedStyle();return null;
   }
   publishDerivedRendererPayload(raw);if(isDerivedStyle(requestedStyle))renewScriptMarket();return null;
  };
  /** Source event time (seconds) for a renderer time (seconds): derived logical axis index, identity for time styles. */
  const axisSourceTime=(seconds:number):number|null=>{const derived=derivedFor(currentBars);if(!derived)return seconds;const axis=derived.axis;if(!axis||!axis.feed.length)return null;return derivedAxisSourceTime(axis,(seconds-axis.feed[0].time)/axis.syntheticStep);};
  // The time-axis ticks and crosshair time chip of a fed derived type show the bricks' source times.
  const derivedSourceMs=new WeakMap<DerivedAxis,number[]>();
  if(rendererHolder.current)setDerivedTimeSource(rendererHolder.current,()=>{if(disposed||fedDerivedKey===null||!isDerivedStyle(requestedStyle))return null;const axis=derivedMemo?.axis;if(!axis||!axis.sourceTimes.length)return null;let ms=derivedSourceMs.get(axis);if(!ms){ms=axis.sourceTimes.map(time=>time*1000);derivedSourceMs.set(axis,ms);}return ms;});
  let requestedStyle='candles';
  let currentSource:ChartSourceContext=sourceContextForInput(sourceContext,bars);
  let statsSourceEpoch:object={};
  const retireStatisticsSource=()=>{statsSourceEpoch={};};
  // A patch that the renderer config already satisfies leaf for leaf is not re-applied (that re-runs the theme,
  // rebuilds the toolbar DOM and repaints on every symbol or interval switch). See rendererPatchIsNoop.
  const applyRendererConfig=(config:Parameters<typeof chart.renderer.applyConfig>[0])=>{retireStatisticsSource();if(typeof chart.renderer.getConfig==='function'&&rendererPatchIsNoop(chart.renderer.getConfig(),config))return;return chart.renderer.applyConfig(config);};
  const retireVwapSource=()=>{vwapSourceEpoch={};try{indicators.invalidateVwap();}catch(error){unavailable('VWAP output retirement failed. Reopen the chart before continuing.');throw error;}};
  const restoreRejectedVwapInput=async(result:Promise<import('./market-queue').MarketOutcome>,epoch:object)=>{const outcome=await result;if(typeof queueSessionPaneRefresh==='function')queueSessionPaneRefresh();if(!outcome.ok&&!disposed&&!analysisUnavailable&&vwapSourceEpoch===epoch){indicators.recompute();renewScriptPresentationPort(scripts);}return outcome;};
  let retainedTypeSettings:ChartSettingsBook={};
  // Heikin Ashi colors are separate from Candles (their own haStyle entry). A book without a heikinashi entry inherits the
  // current candle appearance; the first Heikin Ashi save stores the full entry, after which the two are independent.
  let heikinAshiBook:Record<string,unknown>|null=null;
  const heikinAshiSettings=():Record<string,unknown>=>heikinAshiTypeSettings(heikinAshiBook,lastAppearance);
  const drawingCoordinateContext=()=>({timeCoordinatesAvailable:TIME_AXIS_STYLES.includes(requestedStyle),diagnostic:'Time coordinates are unavailable for this display topology.'});
  const rendererDrawingPort=rendererHolder.current?.userDrawingsPort,originalDrawingSync=rendererDrawingPort?.syncDrawings;
  const drawingUtilitySubscribers=new Set<(value:DrawingUtility)=>void>();
  // Primary-source ownership is separate from derived script publication. Only actual native applications mint it.
  type PrimaryBasisRecord={token:object;core:WeakRef<object>;renderer:WeakRef<object>;source:WeakRef<ChartSourceContext>;raw:WeakRef<readonly Bar[]>;style:string;execution:string;epoch:object;count:number;facts:readonly unknown[]};
  type PrimaryNativeRecord={basis:PrimaryBasisRecord;core:WeakRef<object>;renderer:WeakRef<object>;raw:WeakRef<object>;view:WeakRef<object>;shown:WeakRef<object>;count:number;calendar?:{publication:object;frame:object;tail:number;lease:WeakRef<SeasonalityCalendarAxisHandle>|null;geometry?:Readonly<PrimaryCalendarFrame>}};
  const primaryFields=['datasetId','revision','fixture','label','resolution','basisIdentity','inputIdentity','sessionOverride'] as const;
  let primaryBasis:PrimaryBasisRecord|null=null,primaryNative:PrimaryNativeRecord|null=null,primaryApplication:object|null=null,primaryRetention:object|null=null,primaryBarApplication:object|null=null;
  const primaryInitial={source:new WeakRef(currentSource),raw:new WeakRef(currentBars)};
  const primaryOwn=(value:unknown,key:PropertyKey):any=>{if(!value||typeof value!=='object')throw Error('The native primary frame is unavailable.');const field=Object.getOwnPropertyDescriptor(value,key);if(!field||!Object.hasOwn(field,'value'))throw Error('The native primary frame requires own data.');return field.value;};
  const primaryFact=(value:object,key:string)=>{const field=Object.getOwnPropertyDescriptor(value,key);if(field&&!Object.hasOwn(field,'value'))throw Error('The primary source changed.');return field?.value;};
  const primaryInvocationIdentity=()=>{try{const core=primaryOwn(chart,'orchestrator'),renderer=primaryOwn(core,'renderer');return {core:new WeakRef<object>(core),renderer:new WeakRef<object>(renderer)};}catch{return null;}};
  const primaryInvocationCurrent=(identity:ReturnType<typeof primaryInvocationIdentity>)=>{try{const core=identity?.core.deref(),renderer=identity?.renderer.deref();return !!core&&!!renderer&&primaryOwn(chart,'orchestrator')===core&&primaryOwn(core,'renderer')===renderer;}catch{return false;}};
  const primaryStyle=()=>!isDerivedStyle(requestedStyle);
  const primaryBasisCurrent=(record:PrimaryBasisRecord)=>!disposed&&!analysisUnavailable&&primaryBasis===record&&!!record.core.deref()&&!!record.renderer.deref()&&primaryOwn(chart,'orchestrator')===record.core.deref()&&primaryOwn(record.core.deref(),'renderer')===record.renderer.deref()&&record.source.deref()===currentSource&&record.raw.deref()===currentBars&&record.style===requestedStyle&&record.execution===currentExecutionIdentity&&record.epoch===vwapSourceEpoch&&currentBars.length===record.count&&primaryFields.every((key,index)=>Object.is(primaryFact(currentSource,key),record.facts[index]));
  const primaryCurrent=():PrimaryBasisRecord|null=>{
   if(disposed||analysisUnavailable||!primaryStyle())return null;
   if(primaryBasis&&!primaryBasisCurrent(primaryBasis))primaryBasis=null;
   if(!primaryBasis){const nativeIdentity=primaryInvocationIdentity();if(!nativeIdentity)return null;primaryBasis={token:Object.freeze({}),core:nativeIdentity.core,renderer:nativeIdentity.renderer,source:new WeakRef(currentSource),raw:new WeakRef(currentBars),style:requestedStyle,execution:currentExecutionIdentity,epoch:vwapSourceEpoch,count:currentBars.length,facts:Object.freeze(primaryFields.map(key=>primaryFact(currentSource,key)))};}
   return primaryBasisCurrent(primaryBasis)?primaryBasis:null;
  };
  const primaryNativeCurrent=(record:PrimaryNativeRecord)=>{
   if(!primaryBasisCurrent(record.basis))return false;const core=record.core.deref(),renderer=record.renderer.deref(),raw=record.raw.deref(),view=record.view.deref(),shown=record.shown.deref();
   return !!core&&!!renderer&&!!raw&&!!view&&!!shown&&primaryOwn(chart,'orchestrator')===core&&primaryOwn(core,'renderer')===renderer&&primaryOwn(core,'rawBars')===raw&&primaryOwn(core,'bars')===view&&primaryOwn(renderer,'bars')===shown&&primaryOwn(raw,'length')===record.count&&primaryOwn(view,'length')===record.count&&primaryOwn(shown,'length')===record.count;
  };
  const retirePrimaryCalendar=(record:PrimaryNativeRecord|null)=>{const lease=record?.calendar?.lease?.deref();if(!lease)return;try{lease.dispose();}finally{if(lease.isDetached()&&record?.calendar)record.calendar.lease=null;}};
  const retainPrimaryNative=(basis:PrimaryBasisRecord)=>{
   if(!primaryBasisCurrent(basis))return;
   if(primaryCalendarProducer&&primaryNative?.basis===basis&&primaryNativeCurrent(primaryNative))return;
   const retention={};primaryRetention=retention;const previous=primaryNative;primaryNative=null;
   try{retirePrimaryCalendar(previous);}catch{/* Exact detachment is separately required before source charges can release. */}
   if(primaryRetention!==retention||!primaryBasisCurrent(basis))return;const core=primaryOwn(chart,'orchestrator'),renderer=primaryOwn(core,'renderer'),raw=primaryOwn(core,'rawBars'),view=primaryOwn(core,'bars'),shown=primaryOwn(renderer,'bars');
   if(![raw,view,shown].every(Array.isArray)||[raw,view,shown].some(value=>primaryOwn(value,'length')!==basis.count))return;
   const record:PrimaryNativeRecord={basis,core:new WeakRef(core),renderer:new WeakRef(renderer),raw:new WeakRef(raw),view:new WeakRef(view),shown:new WeakRef(shown),count:basis.count};
   if(primaryCalendarProducer&&basis.count){try{const tail=primaryOwn(primaryOwn(shown,String(basis.count-1)),'time');if(!Number.isSafeInteger(tail))throw Error('The accepted native time is unavailable.');const frame=primaryCalendarProducer.capture(renderer,basis.count,tail);if(primaryRetention!==retention||!primaryNativeCurrent(record))return;const calendar:NonNullable<PrimaryNativeRecord['calendar']>={publication:Object.freeze({}),frame,tail,lease:null};record.calendar=calendar;
    const producer=primaryCalendarProducer,assertCalendar=()=>{if(primaryNative!==record||record.calendar!==calendar||!primaryNativeCurrent(record)||marketUpdating)throw Error('The accepted calendar frame changed.');};
    // One shared compact geometry header per actual native acceptance. Each
    // source consumption still proves its own complete numeric input separately.
    calendar.geometry=Object.freeze({publication:calendar.publication,frame:calendar.frame,count:record.count,tail:calendar.tail/1000,
     captureOrigin(model:object,rendererId:string){assertCalendar();const renderer=record.renderer.deref(),core=record.core.deref();if(!renderer||!core)throw Error('The actual native C origin retired.');const origin=captureSeasonalityNativeOrigin(renderer,core,model,rendererId,record.count,calendar.tail,calendar.frame);try{assertCalendar();if(!origin)throw Error('The actual native C index origin is unavailable.');origin.assertCurrent();return origin;}catch(error){origin?.dispose();throw error;}},
     ...(producer.segments?{installSegments(times:Float64Array,offsets:Float64Array,hold:PrimaryCalendarHold){const pending=hold.pending;hold.pending=true;try{assertCalendar();if(hold.lease!==null){if(!hold.lease.isDetached())throw Error('A prior calendar copy is still retained.');hold.lease=null;}const renderer=record.renderer.deref();if(!renderer)throw Error('The native segment owner retired.');let lease:SeasonalityCalendarAxisHandle|undefined;try{lease=producer.segments!(renderer,calendar.frame,times,offsets);hold.lease=lease;assertCalendar();if(!lease.isCurrent())throw Error('The intraday calendar frame changed during publication.');calendar.lease=new WeakRef(lease);return lease;}catch(error){if(lease){let cleanup:unknown,failed=false;try{lease.dispose();}catch(cause){cleanup=cause;failed=true;}let detached=false;try{detached=lease.isDetached();}catch(cause){cleanup=failed?new AggregateError([cleanup,cause],'Segment cleanup and detachment proof failed.'):cause;failed=true;}if(detached&&hold.lease===lease)hold.lease=null;if(failed)throw new AggregateError([error,cleanup],'Segment installation and cleanup failed.');}throw error;}}finally{hold.pending=pending;}}}:{}),
     install(labels:Float64Array,hold:PrimaryCalendarHold){const pending=hold.pending;hold.pending=true;try{assertCalendar();if(hold.lease!==null){if(!hold.lease.isDetached())throw Error('A prior calendar copy is still retained.');hold.lease=null;}const renderer=record.renderer.deref();if(!renderer)throw Error('The native calendar owner retired.');let lease:SeasonalityCalendarAxisHandle|undefined;try{lease=producer.install(renderer,calendar.frame,labels);hold.lease=lease;assertCalendar();if(!lease.isCurrent())throw Error('The calendar installation changed during publication.');calendar.lease=new WeakRef(lease);return lease;}catch(error){if(lease){let cleanup:unknown,failed=false;try{lease.dispose();}catch(cause){cleanup=cause;failed=true;}let detached=false;try{detached=lease.isDetached();}catch(cause){cleanup=failed?new AggregateError([cleanup,cause],'Calendar cleanup and detachment proof failed.'):cause;failed=true;}if(detached&&hold.lease===lease)hold.lease=null;if(failed)throw new AggregateError([error,cleanup],'Calendar installation and cleanup failed.');}throw error;}}finally{hold.pending=pending;}}});}catch{/* A refused geometry capture grants no optional calendar path. */}}
   if(primaryRetention===retention&&primaryNativeCurrent(record))primaryNative=record;
  };
  function capturePrimarySourceMode():PrimarySourceMode|null{
   try{
    const identity=primaryInvocationIdentity(),context=currentSource,execution=currentExecutionIdentity,epoch=vwapSourceEpoch;
    if(disposed||!identity||!primaryInvocationCurrent(identity))return null;
    // No style/native admission, rows, lengths or price descriptors are read.
    // The source-context private classifier authenticates the exact constructor
    // source separately; this descriptor is only the actual chart ownership fence.
    return Object.freeze({context,execution,assertCurrent(){if(disposed||currentSource!==context||currentExecutionIdentity!==execution||vwapSourceEpoch!==epoch||!primaryInvocationCurrent(identity))throw Error('The descriptive source owner retired.');}});
   }catch{return null;}
  }
  function capturePrimarySourceBasis():PrimarySourceBasis|null{
   try{const record=primaryCurrent();if(!record)return null;const context=currentSource,session=primarySourceSelection.session;
    return Object.freeze({basis:record.token,phase:primaryNative&&primaryNative.basis===record&&primaryNativeCurrent(primaryNative)?'accepted' as const:'pending' as const,context,rows:record.count,style:record.style,execution:record.execution,forming:record.execution!=='ordinary',session,...(record.count?{firstTime:primaryOwn(primaryOwn(currentBars,'0'),'time')}:{}),assertSessionCurrent(){if(primarySourceSelection.session!==session||!primaryBasisCurrent(record))throw Error('The selected primary chart session changed.');},assertCurrent(){if(!primaryBasisCurrent(record))throw Error('The primary source input was replaced.');}});
   }catch{return null;}
  }
  function acceptedPrimarySourceFrame(token:object,liveGeometry?:true):PrimarySourceFrame|null{return liveGeometry===true?acceptedLivePrimarySourceFrame(token):acceptedLegacyPrimarySourceFrame(token);}
  function acceptedLegacyPrimarySourceFrame(token:object):PrimarySourceFrame|null{
   try{const record=primaryNative;if(!record||record.basis.token!==token||!primaryNativeCurrent(record)||marketUpdating)return null;const basis=record.basis,context=currentSource,raw=currentBars,nativeRaw=record.raw.deref() as unknown[],native=record.view.deref() as unknown[],shown=record.shown.deref() as unknown[];
    const arrays=[raw,nativeRaw,native,shown],rows=arrays.map(array=>primaryOwn(array,String(basis.count-1))),keys=['time','open','high','low','close','volume'],values=rows.map(row=>keys.map(key=>primaryOwn(row,key)));let alive=true;
    const assert=()=>{if(!alive)throw Error('The accepted primary frame retired.');try{if(primaryNative!==record||!primaryNativeCurrent(record)||marketUpdating)throw Error('The accepted primary frame changed.');for(let index=0;index<arrays.length;index++)if(primaryOwn(arrays[index],String(basis.count-1))!==rows[index]||keys.some((key,field)=>!Object.is(primaryOwn(rows[index],key),values[index][field])))throw Error('The accepted primary tail changed.');}catch(error){alive=false;throw error;}};
    const geometry=record.calendar?.geometry;
    assert();return Object.freeze({basis:token,context,raw,nativeRaw,native,shown,style:basis.style,execution:basis.execution,forming:basis.execution!=='ordinary',...(geometry?{calendar:geometry}:{}),assertCurrent:assert,presentationReady(){assert();return !analysisPending&&!marketQueue.isPending();}});
   }catch{return null;}
  }
  function acceptedLivePrimarySourceFrame(token:object):PrimarySourceFrame|null{
   try{const record=primaryNative;if(!record||record.basis.token!==token||!primaryNativeCurrent(record)||marketUpdating)return null;const basis=record.basis,context=currentSource,raw=currentBars,nativeRaw=record.raw.deref() as unknown[],native=record.view.deref() as unknown[],shown=record.shown.deref() as unknown[];
    const renderer=record.renderer.deref(),coords=primaryOwn(renderer,'coords'),nativeTimes=primaryOwn(coords,'times');if(!Array.isArray(nativeTimes)||Object.getPrototypeOf(nativeTimes)!==Array.prototype||primaryOwn(nativeTimes,'length')!==basis.count)return null;const firstNativeTime=primaryOwn(nativeTimes,'0'),lastNativeTime=primaryOwn(nativeTimes,String(basis.count-1));
    const arrays=[raw,nativeRaw,native,shown],rows=arrays.map(array=>primaryOwn(array,String(basis.count-1))),keys=['time','open','high','low','close','volume'],values=rows.map(row=>keys.map(key=>primaryOwn(row,key)));let alive=true;
    const assert=()=>{if(!alive)throw Error('The accepted primary frame retired.');try{if(primaryNative!==record||!primaryNativeCurrent(record)||marketUpdating||record.renderer.deref()!==renderer||primaryOwn(renderer,'coords')!==coords||primaryOwn(coords,'times')!==nativeTimes||primaryOwn(nativeTimes,'length')!==basis.count||!Object.is(primaryOwn(nativeTimes,'0'),firstNativeTime)||!Object.is(primaryOwn(nativeTimes,String(basis.count-1)),lastNativeTime))throw Error('The accepted primary frame changed.');for(let index=0;index<arrays.length;index++)if(primaryOwn(arrays[index],String(basis.count-1))!==rows[index]||keys.some((key,field)=>!Object.is(primaryOwn(rows[index],key),values[index][field])))throw Error('The accepted primary tail changed.');}catch(error){alive=false;throw error;}};
    const geometry=record.calendar?.geometry;
    assert();return Object.freeze({basis:token,context,raw,nativeRaw,native,shown,nativeTimes,style:basis.style,execution:basis.execution,forming:basis.execution!=='ordinary',...(geometry?{calendar:geometry}:{}),assertCurrent:assert,presentationReady(){assert();return !analysisPending&&!marketQueue.isPending();}});
   }catch{return null;}
  }
  // Observes the real promise, returns it unchanged, and cannot attribute an old completion to a new source.
  const originalPrimarySetMarket=chart.setMarket;
  const ownedPrimarySetMarket:typeof chart.setMarket=function(this:typeof chart,...args){if(this!==chart)return Reflect.apply(originalPrimarySetMarket,this,args);const ticket={},nativeIdentity=primaryInvocationIdentity();let basis:PrimaryBasisRecord|null=null;try{basis=primaryCurrent();}catch{/* Optional capture cannot change SDK invocation. */}primaryApplication=ticket;const previous=primaryNative;primaryNative=null;primaryRetention=null;try{retirePrimaryCalendar(previous);}catch{/* Optional cleanup cannot change the genuine market invocation. */}notifyPrimarySourceSettled();
   let result:ReturnType<typeof chart.setMarket>;try{result=Reflect.apply(originalPrimarySetMarket,this,args);}catch(error){if(primaryApplication===ticket){primaryApplication=null;notifyPrimarySourceSettled();}throw error;}
   try{Promise.prototype.then.call(result,()=>{if(primaryApplication!==ticket)return;primaryApplication=null;try{if(basis&&primaryBasisCurrent(basis)&&primaryInvocationCurrent(nativeIdentity))retainPrimaryNative(basis);}catch{primaryNative=null;}finally{notifyPrimarySourceSettled();}},()=>{if(primaryApplication===ticket){primaryApplication=null;notifyPrimarySourceSettled();}});}catch{/* Unsupported thenables remain legacy native results and cannot qualify this optional source. */}
   return result;
  };
  chart.setMarket=ownedPrimarySetMarket;
  const primaryTransform=(()=>{
   const core=primaryOwn(chart,'orchestrator') as {syncBarTransform:(style:string)=>unknown},original=core.syncBarTransform;if(typeof original!=='function')return null;const weak=new WeakRef(core);
   const wrapper=function(this:typeof core,...args:Parameters<typeof original>){if(this!==weak.deref())return Reflect.apply(original,this,args);const nativeIdentity=primaryInvocationIdentity(),prior=primaryNative,source=prior?.basis.source.deref(),raw=prior?.basis.raw.deref();const result=Reflect.apply(original,this,args);
    try{if(prior&&weak.deref()===this&&nativeIdentity?.core.deref()===this&&primaryInvocationCurrent(nativeIdentity)&&prior.core.deref()===this&&source===currentSource&&raw===currentBars&&prior.basis.execution===currentExecutionIdentity&&primaryStyle()&&primaryOwn(this,'rawBars')===prior.raw.deref()){const basis=primaryCurrent();if(basis)retainPrimaryNative(basis);}else primaryNative=null;}catch{primaryNative=null;}notifyPrimarySourceSettled();return result;};
   core.syncBarTransform=wrapper;return {owner:weak,original,wrapper};
  })();
  // The real ordinary live-grow path invokes the actual core synchronously. A successful invocation
  // can retain only its captured full source frame; the held/pending gates still prevent early reads.
  const primaryBars=(()=>{
   const core=primaryOwn(chart,'orchestrator') as {applyBar:(...args:unknown[])=>unknown},original=core.applyBar;if(typeof original!=='function')return null;const weak=new WeakRef(core);
   const wrapper=function(this:typeof core,...args:Parameters<typeof original>){if(this!==weak.deref())return Reflect.apply(original,this,args);
    const ticket={},nativeIdentity=primaryInvocationIdentity();let basis:PrimaryBasisRecord|null=null;try{basis=primaryCurrent();}catch{/* Optional observation cannot reject a native invocation. */}primaryBarApplication=ticket;primaryNative=null;notifyPrimarySourceSettled();
    let result:ReturnType<typeof original>;try{result=Reflect.apply(original,this,args);}catch(error){if(primaryBarApplication===ticket){primaryBarApplication=null;notifyPrimarySourceSettled();}throw error;}
    if(primaryBarApplication!==ticket)return result;primaryBarApplication=null;
    try{if(!primaryApplication&&basis&&weak.deref()===this&&nativeIdentity?.core.deref()===this&&primaryInvocationCurrent(nativeIdentity)&&primaryBasisCurrent(basis)&&primaryOwn(primaryOwn(this,'rawBars'),String(basis.count-1))===args[0])retainPrimaryNative(basis);}catch{primaryNative=null;}notifyPrimarySourceSettled();return result;
   };core.applyBar=wrapper;return {owner:weak,original,wrapper};
  })();
  const observePrimaryInitial=()=>{try{if(disposed||primaryInitial.source.deref()!==currentSource||primaryInitial.raw.deref()!==currentBars||!(localCandleSourceInputMatches(currentSource,primaryConstructorSeed.bars.deref())||producerCompletionSourceInputMatches(currentSource,primaryConstructorSeed.bars.deref()))||currentExecutionIdentity!=='ordinary'||!primaryInvocationCurrent(primaryConstructorIdentity))return;const basis=primaryCurrent();if(basis&&!primaryApplication)retainPrimaryNative(basis);}catch{primaryNative=null;}finally{notifyPrimarySourceSettled();}};
  if(primaryConstructorReady)try{Promise.prototype.then.call(primaryConstructorReady,observePrimaryInitial,notifyPrimarySourceSettled);}catch{/* A nonstandard readiness result cannot grant native ownership. */}
  const disposePrimarySource=()=>{primaryApplication=null;primaryRetention=null;primaryBarApplication=null;const previous=primaryNative;primaryNative=null;try{retirePrimaryCalendar(previous);}catch{/* The owning port also attempts exact calendar cleanup and retains unknown charges. */}primaryBasis=null;primarySourceSettled.clear();const control=primarySourceControl;primarySourceControl=null;const failures:unknown[]=[];for(const release of [()=>control?.dispose(),()=>{if(chart.setMarket===ownedPrimarySetMarket)chart.setMarket=originalPrimarySetMarket;},()=>{const core=primaryTransform?.owner.deref();if(core&&primaryTransform&&core.syncBarTransform===primaryTransform.wrapper)core.syncBarTransform=primaryTransform.original;},()=>{const core=primaryBars?.owner.deref();if(core&&primaryBars&&core.applyBar===primaryBars.wrapper)core.applyBar=primaryBars.original;}])try{release();}catch(error){failures.push(error);}if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Primary source disposal was incomplete.');};
  const currentBarInterval=()=>{const n=currentBars.length;if(n>=2){const d=currentBars[n-1].time-currentBars[n-2].time;if(d>0)return d;}try{return currentSource.resolution?parseInterval(currentSource.resolution).seconds??60:60;}catch{return 60;}};
  // viewport-deferral.ts: a viewport set while bars are being written applies to the new bars, not the old.
  const spacingCarry=createIntervalSpacingCarry(typicalBarStep(bars.map(bar=>bar.time)));
  const viewportDeferral=createViewportDeferral(range=>chart.setVisibleRange({from:range.from*1000,to:range.to*1000}));
  const zoom=createZoomController({getRange:()=>{const r=chart.getVisibleRange();return r?{from:r.from/1000,to:r.to/1000}:null;},setRange:range=>{validateViewport(range);chart.setVisibleRange({from:range.from*1000,to:range.to*1000});},barInterval:currentBarInterval});
  let unhideUnlock=createUnhideUnlock();
  const drawingPreview=createDrawingPreview({read:()=>document.all() as Record<string,unknown>[],bars:()=>currentBars,context:drawingCoordinateContext,changed:()=>drawingProjection.refresh()});
  // One overlay source of truth for the renderer projection and the Fib binding attestation.
  const drawingOverlay=()=>({hidden:drawingUtilityState?.drawingsHidden===true,locked:drawingUtilityState?.drawingsLocked===true});
  const drawingProjection=createDrawingVisibilityProjection({overlay:drawingOverlay,read:()=>document.all(),resolution:()=>currentSource.resolution,eligible:row=>!unavailableDrawingIds.has(String(row.id)),push:rows=>{if(!rendererDrawingPort||!originalDrawingSync)throw new Error('Drawing renderer projection unavailable');originalDrawingSync.call(rendererDrawingPort,(typeof derivedDrawings!=='undefined'?rows.map(row=>derivedDrawings.toNativeRow(row)):rows) as unknown as SerializedDrawing[]);},applied:()=>{if(typeof pushDwb3Shapes==='function')pushDwb3Shapes();},preview:row=>drawingPreview.apply(row)});
  if(rendererDrawingPort)rendererDrawingPort.syncDrawings=rows=>drawingProjection.sync(rows as unknown as Record<string,unknown>[]);
  // Renderer gestures (place, drag, edit, clone, draft) arrive in renderer time and are mapped to source time before the
  // drawing store sees them; a derived feed without a usable time map refuses geometry intents instead of storing synthetic times.
  // The controller subscribes with `(intent)=>this.onIntent(intent)`, so an own property on the controller is the seam.
  {const ctrl=(chart.drawings as unknown as {ctrl?:{onIntent?:(intent:unknown)=>void}}).ctrl,onIntent=ctrl?.onIntent;
   if(ctrl&&typeof onIntent==='function'){ctrl.onIntent=(intent:unknown)=>{const mapped=derivedDrawings.intentToSource(intent);if(mapped===null){if(!diagnostics.some(row=>row.code==='DERIVED_DRAWING_REFUSED'))diagnostics.push({code:'DERIVED_DRAWING_REFUSED',feature:'drawings',severity:'unavailable',message:DERIVED_DRAWING_REFUSED});try{drawingProjection.refresh();}catch{/* The next sync repaints the stored rows. */}return;}
    // A multi-selection move arrives as one edit-many intent but emits drawing:edited per
    // drawing; one batch makes it one drawing publication, so the workspace records one undo step for the whole move.
    // typeof: extracted-block harnesses evaluate this body without the drawing batch.
    if(typeof drawingBatch==='number'&&(mapped as {kind?:unknown}|null)?.kind==='edit-many'){drawingBatch++;try{return Reflect.apply(onIntent,ctrl,[mapped]);}finally{drawingBatch--;if(!drawingBatch&&drawingDirty){drawingDirty=false;notifyDrawings();}}}
    return Reflect.apply(onIntent,ctrl,[mapped]);};/* typeof: extracted-block harnesses run without module imports. */if(typeof registerDrawingIntentSeam==='function')registerDrawingIntentSeam(ctrl,ctrl.onIntent);}
   const ghost=rendererDrawingPort?.setExternalGhost;if(rendererDrawingPort&&typeof ghost==='function')rendererDrawingPort.setExternalGhost=(doc:SerializedDrawing|null)=>Reflect.apply(ghost,rendererDrawingPort,[doc&&derivedDrawings.refused()?null:doc&&derivedDrawings.toNativeRow(doc)]);}
  const reprojectDrawings=()=>{if(!rendererDrawingPort)return;const inventory=analysisInventory(),resolved=resolvePortableDrawingDocument(document.serialize(),inventory,knownTypes),priorIds=unavailableDrawingIds,priorDiagnostics=drawingBindingDiagnostics;unavailableDrawingIds=new Set(resolved.unavailableIds);drawingBindingDiagnostics=resolved.diagnostics;try{drawingReservations.apply(document.ids());reprojectPortableDrawingDocument(document,inventory,knownTypes,{nativeRows:chart.drawings.all() as unknown as Record<string,unknown>[],load:value=>chart.drawings.fromJSON(value),sync:rows=>drawingProjection.sync(rows)});}catch(error){unavailableDrawingIds=priorIds;drawingBindingDiagnostics=priorDiagnostics;throw error;}if(typeof pushDwb3Shapes==="function")pushDwb3Shapes();};
  let marketUpdating=false,analysisPending=0,analysisUnavailable='';
  vwapPrefixSource=createOwnedVwapPrefixSource({readBasis:()=>({epoch:vwapSourceEpoch,source:currentSource,bars:currentBars,style:requestedStyle,executionIdentity:currentExecutionIdentity,disposed:disposed||!!analysisUnavailable})});
  const navigationSubscribers=new Set<()=>void>();const navigationChanged=()=>{for(const callback of navigationSubscribers)callback();};
  const writeMarketInput=(input:{bars:Bar[];source:ChartSourceContext})=>{
    publishDerivedPayload(input.bars,{kind:'retire-source'});if(typeof retireSessionPaneRefresh==='function')retireSessionPaneRefresh();retireStatisticsSource();retireVwapSource();scripts.invalidateResults();
    /* typeof: extracted-block harnesses evaluate this body without the module imports. */const sameLive=typeof isLiveInputIdentity==='function'&&typeof sameChartSourceBasis==='function'&&isLiveInputIdentity(input.source.inputIdentity)&&input.source.inputIdentity===currentSource.inputIdentity&&sameChartSourceBasis(currentSource,input.source,true);
    const core=sameLive&&typeof isDerivedStyle==='function'&&!isDerivedStyle(requestedStyle)?liveOrchestrator():null;
    const grown=core?liveGrowthFrom(currentBars,input.bars):null;
    const from=grown!==null&&(grown===currentBars.length-1||liveTailSlots(core!,input.bars.slice(grown,currentBars.length-1)))?grown:null;
    if(from!==null){
      const tail=currentBars.length-1;
      // The queue already authored this incoming clone. A fixed private
      // membership check may preserve its real producer/context ancestry;
      // all numerical original/clone/native checks remain mandatory later.
      // Legacy extracted bodies and unqualified inputs retain their old
      // in-place identity. No caller metadata can qualify a replacement.
      const ownedIncoming=typeof currentExecutionIdentity==='string'&&currentExecutionIdentity==='ordinary'&&typeof profileCloneProducerInputMatches==='function'&&profileCloneProducerInputMatches(input.bars,input.source);
      if(ownedIncoming)currentBars=input.bars;
      else{currentBars.length=from;for(let index=from;index<input.bars.length;index++)currentBars.push(input.bars[index]);}
      calculationBarCache=createCalculationBarCache();derivedMemo=null;livePlan={kind:'grow',from,tail};
      currentSource=input.source;
    }else{
      let range:{from:number;to:number}|null=null;if(sameLive)try{range=chart.getVisibleRange();}catch{range=null;}
      livePlan=sameLive?{kind:'reload',range}:null;currentBars=input.bars;currentSource=input.source;if(!sameLive)lastCrosshair=null;
    }
    /* typeof: extracted-block harnesses evaluate this body without the axis label port. */if(typeof axisLabelPort!=='undefined')axisLabelPort?.refreshPrecision();if(typeof refreshSessionZones!=='undefined')refreshSessionZones();
    queueInlineRefresh();
  };
  // Declared after writeMarketInput (still before any market write runs) so extracted-block harnesses carry them.
  let exactInput:readonly Bar[]|null=bars;
  // A newer snapshot of the same live subscription is growth of the current input: the forming bar is
  // replaced and/or bars are appended. It goes through vela's live-bar path (applyBar -> renderer.updateBar), which keeps
  // the zoom and scroll position and lets native indicators update incrementally, instead of a full setMarket reload.
  // The adapter's own bar array is grown in place so every owner captured against this input stays current.
  // A feed also finalizes the just-closed bar after the next one opened (the Coinbase 1m REST
  // reconcile about once a minute, Alpaca minute bars that arrive late). Revising only the newest LIVE_FINALIZATION_BARS
  // bars is still growth: vela's applyBar drops a bar older than its last (Orchestrator.applyBar 'else return'), so the
  // just-closed bar is replaced in place in vela's raw series and the renderer's array (same objects, as applyBar keeps
  // them), and the following applyBar of the forming bar invalidates the frame and notifies indicator sessions. Older
  // revisions, removed bars, moved times or a vela state that cannot be patched exactly reload as before.
  let livePlan:{kind:'grow';from:number;tail:number}|{kind:'reload';range:{from:number;to:number}|null}|null=null;
  const sameBarValues=(a:Bar,b:Bar)=>a.time===b.time&&a.open===b.open&&a.high===b.high&&a.low===b.low&&a.close===b.close&&a.volume===b.volume;
  const liveGrowthFrom=(prior:readonly Bar[],next:readonly Bar[]):number|null=>{
    const n=prior.length;if(!n||next.length<n||next.length-n>2)return null;
    const settled=Math.max(0,n-2);// LIVE_FINALIZATION_BARS (src/domain/alert-observation.ts); literal for extracted-block harnesses
    for(let index=0;index<settled;index++)if(!sameBarValues(prior[index],next[index]))return null;
    for(let index=settled;index<n;index++)if(next[index].time!==prior[index].time)return null;
    for(let index=n;index<next.length;index++)if(next[index].time<=next[index-1].time)return null;
    return settled<n-1&&!sameBarValues(prior[settled],next[settled])?settled:n-1;
  };
  type LiveCore={applyBar:(bar:Record<string,number>)=>void;rawBars?:unknown;bars?:unknown;barTransform?:unknown;renderer?:{bars?:unknown}};
  /** Indices of `revised` (older than vela's last bar) in vela's raw and renderer arrays, or null when not exactly patchable. */
  const liveTailSlots=(core:LiveCore,revised:readonly Bar[]):Array<[number,number]>|null=>{
    try{
      const raw=core.rawBars,shown=core.renderer?.bars;
      if(!revised.length||!Array.isArray(raw)||!Array.isArray(shown)||core.barTransform||core.bars!==raw||raw.length<revised.length+1)return null;
      const slots:Array<[number,number]>=[];
      for(let k=0;k<revised.length;k++){
        const r=raw.length-1-revised.length+k,v=shown.length-1-revised.length+k,time=revised[k].time*1000;
        if(r<0||v<0||(raw[r] as {time?:unknown})?.time!==time||(shown[v] as {time?:unknown})?.time!==time)return null;
        slots.push([r,v]);
      }
      return slots;
    }catch{return null;}
  };
  const liveOrchestrator=()=>{try{const core=(chart as unknown as {orchestrator?:{applyBar?:unknown}}).orchestrator;return core&&typeof core.applyBar==='function'?core as LiveCore:null;}catch{return null;}};
  const marketAppliedSubscribers=new Set<()=>void>();
  const notifyMarketApplied=()=>{for(const callback of [...marketAppliedSubscribers])try{callback();}catch{/* a subscriber failure never stops the chart */}};
  /* typeof: extracted-block harnesses run this body without the session block. */if(typeof refreshSessionZones!=='undefined')marketAppliedSubscribers.add(refreshSessionZones);
  /** After a new feed, apply the zoom and pan bounds of THIS feed at once. The renderer keeps the previous
   * chart's spacing across a feed and clamps it only at the next viewport write, so a symbol or source with fewer bars (or a
   * live chart left zoomed past its oldest bar) snapped on the first wheel notch: a zoom-out notch zoomed in. */
  const settleViewportBounds=(fresh:boolean)=>{
    try{
      /* typeof: extracted-block harnesses run this body without the renderer holder. */const renderer=typeof rendererHolder==='undefined'?null:rendererHolder.current as unknown as {coords?:{getViewport():{barSpacing:number;rightOffset:number}};clampViewport?(barSpacing:number,rightOffset:number):{barSpacing:number;rightOffset:number};applyViewport?(viewport:{barSpacing:number;rightOffset:number}):void}|null;
      // A new feed opens fitted to its LOADED bars (no blank left third while its first pages load); the history room
      // applies from then on. A same-subscription reload keeps a view that is already past the oldest bar.
      if(fresh&&renderer)(renderer as {lvHistoryRoom?:number}).lvHistoryRoom=0;else syncHistoryRoom();
      const viewport=renderer?.coords?.getViewport();
      if(renderer&&viewport&&typeof renderer.clampViewport==='function'&&typeof renderer.applyViewport==='function'){
        const bounded=renderer.clampViewport(viewport.barSpacing,viewport.rightOffset);
        if(Math.abs(bounded.barSpacing-viewport.barSpacing)>1e-9||Math.abs(bounded.rightOffset-viewport.rightOffset)>1e-9)renderer.applyViewport(bounded);
      }
    }catch{/* the next viewport write bounds it */}
    try{syncHistoryRoom();}catch{/* declared below; the first history check sets it */}
  };
  /** The renderer viewport to put back after a same-subscription reload whose newest bar time is unchanged. */
  const prependKeptViewport=(fed:readonly {time:number}[])=>{
    try{
      /* typeof: extracted-block harnesses run this body without the renderer holder. */const renderer=typeof rendererHolder==='undefined'?null:rendererHolder.current as unknown as {bars?:readonly {time?:unknown}[];coords?:{getViewport():{barSpacing:number;rightOffset:number}};applyViewport?(viewport:{barSpacing:number;rightOffset:number}):void}|null;
      const shown=renderer?.bars,viewport=renderer?.coords?.getViewport(),zoom=renderer as {targetBarSpacing?:unknown;zoomAnchorLogical?:unknown;zoomAnchorX?:unknown;animator?:{active?:unknown};coords?:{barCount?:unknown}}|null;
      if(!renderer||typeof renderer.applyViewport!=='function'||!Array.isArray(shown)||!shown.length||!fed.length||!viewport)return null;
      if(shown[shown.length-1]?.time!==fed[fed.length-1].time||!Number.isFinite(viewport.barSpacing)||!Number.isFinite(viewport.rightOffset))return null;
      // A wheel zoom still easing when the page lands finishes at its target after the restore; its anchor is a logical index
      // from the oldest bar, so it moves by the bars the page added (right-anchored, so nothing on screen shifts).
      const target=zoom?.targetBarSpacing,anchor=zoom?.zoomAnchorLogical,anchorX=zoom?.zoomAnchorX,count=zoom?.coords?.barCount;
      const easing=zoom?.animator?.active===true&&typeof target==='number'&&typeof anchor==='number'&&typeof anchorX==='number'&&typeof count==='number'&&Math.abs(target-viewport.barSpacing)>target*1e-3?{target,anchor,anchorX,count}:null;
      return {renderer:renderer as {applyViewport(viewport:{barSpacing:number;rightOffset:number}):void;zoomTo?(target:number,anchorLogical:number,anchorX:number):void;coords?:{barCount?:number}},viewport:{barSpacing:viewport.barSpacing,rightOffset:viewport.rightOffset},easing};
    }catch{return null;}
  };
  /** A same-subscription reload (a history page, the after-open prefetch, a correction) goes through vela
   * setMarket, whose setBars refits every price scale to auto (reframeKeepZoom). A price scale the user had put in manual
   * (scale drag, price pan) went back to auto with no gesture, while the saved scale controls still said manual, so the next
   * press met "Opening price frame and saved scale controls disagree". The manual windows held before the reload are put
   * back after it, exactly as vela's own setManualScale writes them (the user's scale change is kept, as the time range is).
   * A new subscription (symbol, interval, source switch) still opens on auto. */
  const holdManualScales=()=>{
    type Holder={manualScale?:unknown;scale?:unknown;scaleTarget?:unknown;initialized?:unknown};
    try{
      /* typeof: extracted-block harnesses run this body without the renderer holder. */const renderer=typeof rendererHolder==='undefined'?null:rendererHolder.current as unknown as {scene?:{panes?:unknown;indicatorScales?:unknown};axisScaleButtons?:{reposition?:()=>void};scheduler?:{invalidate?:(flags:number)=>void}}|null;
      const scene=renderer?.scene,maps=[scene?.panes,scene?.indicatorScales];
      if(!renderer||!maps.every(map=>map instanceof Map))return null;
      const held:Array<{map:Map<string,Holder>;id:string;scale:Record<string,unknown>}>=[];
      for(const map of maps as Array<Map<string,Holder>>)for(const [id,holder] of map){const manual=holder?.manualScale;if(manual&&typeof manual==='object')held.push({map,id,scale:{...manual as Record<string,unknown>}});}
      if(!held.length)return null;
      return {restore(){
        let restored=0;
        for(const {map,id,scale} of held){const holder=map.get(id);if(!holder||holder.manualScale!=null)continue;holder.manualScale={...scale};holder.scale={...scale};holder.scaleTarget={...scale};holder.initialized=true;restored++;}
        if(!restored)return;
        try{renderer.axisScaleButtons?.reposition?.();}catch{/* the buttons refresh on the next hover */}
        try{renderer.scheduler?.invalidate?.(4);}catch{/* the next frame paints it */}
      }};
    }catch{return null;}
  };
  const applyMarketInput=async(next:readonly Bar[])=>{
    const plan=livePlan;livePlan=null;
    let reloadPlan:typeof plan=plan;
    if(plan?.kind==='grow'){const core=liveOrchestrator(),revised=currentBars.slice(plan.from,plan.tail),slots=core&&revised.length?liveTailSlots(core,revised):null;
      if(core&&(!revised.length||slots)){marketUpdating=true;try{
        if(slots)for(let k=0;k<slots.length;k++){const bar=revised[k],vela={time:bar.time*1000,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume};(core.rawBars as unknown[])[slots[k][0]]=vela;(core.renderer!.bars as unknown[])[slots[k][1]]=vela;}
        for(let index=plan.tail;index<currentBars.length;index++){const bar=currentBars[index];core.applyBar({time:bar.time*1000,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume});}}finally{marketUpdating=false;}notifyMarketApplied();return;}
      let range:{from:number;to:number}|null=null;try{range=chart.getVisibleRange();}catch{range=null;}reloadPlan={kind:'reload',range};}
    // Vela 0.8.4 reads setMarket({data:[]}) as a symbol-provider load and parks forever, which blocks the
    // market queue for good. An empty feed (no bars, or a derived type that builds nothing yet) is refused instead.
    const fed=toVelaBars(velaFeed(next));if(!fed.length)throw new Error(EMPTY_MARKET_MESSAGE);
    const publication=publishDerivedPayload(next,{kind:'prepare'});retireStatisticsSource();marketUpdating=true;const previousDerivedKey=fedDerivedKey;let deferredStarts:DeferredNativeStarts|null=null;try{fedDerivedKey=derivedFeedKey(next);const fedDerived=typeof derivedDrawings!=='undefined'&&isDerivedStyle(requestedStyle),fedAxis=fedDerived?derivedFor(next)?.axis??null:null;
      // interval-spacing-carry.ts: an interval change keeps the chosen bar spacing at the latest bar.
      const nextStep=typeof spacingCarry==='undefined'?0:typicalBarStep(next.map(bar=>bar.time)),carry=typeof spacingCarry==='undefined'?null:fedDerived||previousDerivedKey!==null||reloadPlan?.kind==='reload'?(spacingCarry.reset(nextStep),null):spacingCarry.begin(rendererHolder.current as unknown as Parameters<typeof spacingCarry.begin>[0],nextStep);
      const keptView=reloadPlan?.kind==='reload'&&typeof prependKeptViewport==='function'?prependKeptViewport(fed):null;
      // A prepend starts its native indicators one per task after this reload (deferNativeStarts, run in finally).
      deferredStarts=keptView&&typeof deferNativeStarts==='function'?deferNativeStarts(chart,keptView.renderer):null;
      // holdManualScales: a same-subscription reload keeps the user's manual price scales.
      const heldScales=reloadPlan?.kind==='reload'&&typeof holdManualScales==='function'?holdManualScales():null;
      try{await chart.setMarket({data:fed});}finally{deferredStarts?.stop();}heldScales?.restore();if(typeof derivedDrawings!=='undefined')derivedDrawings.fed(fedAxis,fedDerived,next,currentBarInterval());publishDerivedPayload(next,{kind:'commit',ticket:publication});reprojectDrawings();
      // A same-subscription reload (a history correction or a derived chart type) keeps the view.
      // A reload that keeps the newest bar (a history page landed, or a correction) puts the exact viewport
      // back: bar spacing and right offset are counted from the newest bar, so neither the view nor the spacing moves. The
      // time range restore (kept for a reload that moved the newest bar) refitted the spacing and dropped the right margin.
      if(keptView)try{keptView.renderer.applyViewport(keptView.viewport);const easing=keptView.easing,added=(keptView.renderer.coords?.barCount??0)-(easing?.count??0);if(easing&&typeof keptView.renderer.zoomTo==='function')keptView.renderer.zoomTo(easing.target,easing.anchor+added,easing.anchorX);}catch{/* the default view stays */}
      else if(reloadPlan?.kind==='reload'&&reloadPlan.range)try{chart.setVisibleRange(reloadPlan.range);}catch{/* the default view stays */}
      // A new derived construction (a switch into a derived type, or its settings) opens fitted like Reset chart
      // view; the time-chart viewport left the bricks squeezed at the right edge. A same-subscription reload keeps its range above.
      // Leaving a derived type (Renko back to Candles) opens fitted too; the time chart kept
      // the brick spacing and showed ~45 candles.
      else if(fedDerived?fedDerivedKey!==previousDerivedKey:previousDerivedKey!==null&&fedDerivedKey===null)try{const renderer=rendererHolder.current as unknown as {resetView?:unknown}|null,reset=renderer?.resetView;if(typeof reset==='function')Reflect.apply(reset,renderer,[]);}catch{/* the default view stays */}
      else if(carry!==null)try{spacingCarry.finish(rendererHolder.current as unknown as Parameters<typeof spacingCarry.finish>[0],carry);}catch{/* the kept spacing stays */}
      /* typeof: extracted-block harnesses run applyMarketInput without the history-room zoom helpers. */if(!keptView&&typeof settleViewportBounds==='function')settleViewportBounds(reloadPlan?.kind!=='reload');
    }finally{if(deferredStarts)await deferredStarts.run();marketUpdating=false;publishDerivedPayload(next,{kind:'release',ticket:publication});}notifyMarketApplied();};
  const marketQueue=createMarketQueue({read:()=>({bars:currentBars,source:currentSource}),write:writeMarketInput,apply:applyMarketInput,disposed:()=>disposed,validate:next=>{if(!next.length)return {code:'MARKET_INPUT_EMPTY',feature:'market input',severity:'unavailable',message:EMPTY_MARKET_MESSAGE};try{indicators.assertCapacity(next.length);}catch(error){return {code:'INDICATOR_CAPACITY',feature:'indicator collection',severity:'unavailable',message:error instanceof Error?error.message:String(error)};}if(requestedStyle!=='volumecandles')return null;const volume=requireVolume(next,requestedStyle);return volume.ok?null:volume.diagnostic;}});
  let lastCrosshair:ReturnType<typeof normalizedCrosshair>|null=null;
  const originalBackground=container.style.background;
  // A live chart panned or zoomed to within LIVE_HISTORY_MARGIN_BARS of its oldest loaded bar asks the
  // open feed for the previous page (the feed pages one request at a time, spaced, and stops at "No more data"). The
  // prepend comes back as a newer snapshot of the same subscription and takes the same-source reload above, which puts
  // the visible time range back, so the view does not move. Imports, synthetic data and derived types never request.
  // The request fires one view width early (less than a screen of history left of the view), so it
  // streams older bars before the edge shows, and a follow-up re-checks after each page (spaced by the pager) while the
  // view still nears the oldest bar. Before, a zoomed-out view loaded one page per gesture and then sat at the edge until
  // the next wheel notch or drag. The follow-up stops at "No more data", after an error, and once enough history is loaded.
  // (1) Prefetch: right after a live chart opens it pages with no gesture until it holds
  // LIVE_HISTORY_PREFETCH_BARS (the 5000-bar cap); past that a page is asked for while less than LIVE_HISTORY_PREFETCH_SCREENS
  // view widths of history are left of the view (was one), so older bars land before the edge shows. (2) Every applied market
  // input re-checks at once, so a landed page asks for the next one without waiting for a timer; the follow-up timer only
  // covers the pager's own spacing (LIVE_HISTORY_MIN_INTERVAL_MS, now 250 ms). (3) History room: while the feed can still
  // page, the renderer lets the view zoom and pan past the oldest loaded bar (vela-input-feel-transform history-room-*), so a
  // zoom-out never hits a wall; the empty area waits for the pages. "No more data" restores the LV-VELA-NAV-1 bounds.
  let historyFollowUp:ReturnType<typeof setTimeout>|null=null;
  const syncHistoryRoom=()=>{
    try{
      /* typeof: extracted-block harnesses run this body without the renderer holder. */const renderer=typeof rendererHolder==='undefined'?null:rendererHolder.current as unknown as {lvHistoryRoom?:number}|null;if(!renderer)return;
      const state=!disposed&&isLiveInputIdentity(currentSource.inputIdentity)&&!isDerivedStyle(requestedStyle)?liveHistoryState(currentSource.datasetId):null;
      renderer.lvHistoryRoom=state&&state.status!=='exhausted'?LIVE_HISTORY_ZOOM_ROOM_BARS:0;
    }catch{/* the plain bounds stay */}
  };
  const scheduleHistoryFollowUp=()=>{
    if(historyFollowUp!==null||disposed)return;
    const state=liveHistoryState(currentSource.datasetId);if(state&&(state.status==='exhausted'||state.status==='error')){syncHistoryRoom();return;}
    historyFollowUp=setTimeout(()=>{historyFollowUp=null;requestOlderHistory(true);},LIVE_HISTORY_MIN_INTERVAL_MS+50);
  };
  // The no-gesture prefetch waits for the chart's first paint, and charts opened together arm 60 ms apart, so a
  // layout switch does not start four history pages (and their merges) inside the build. Without a frame clock it is armed at once.
  let prefetchArmed=typeof requestAnimationFrame!=='function';
  if(!prefetchArmed)requestAnimationFrame(()=>{const at=Math.max(Date.now(),nextPrefetchArm);nextPrefetchArm=at+60;setTimeout(()=>{if(disposed)return;prefetchArmed=true;requestOlderHistory(true);},at-Date.now());});
  /* A range wider than the loaded bars is sticky. Each history page lands with the prepend's own viewport restore, which
   * used to leave the span at the pre-page view; the span is re-applied after every accepted frame until the bars cover it, the feed
   * is exhausted, the user navigates (wheel or press), or 60 s pass.
   * (1) a sticky range outlives a history pause: a rate-limited page waits 60 s (the bridge refuses Coinbase that
   * long), which outlasted the 60 s window, so while the pager is loading or paused the window is extended, never past
   * STICKY_RANGE_CAP_MS after the click. (2) A live range the bars already cover is held for STICKY_SETTLE_MS: a feed reopened from the
   * local bar cache is replaced by its REST refresh (new series and revision) a moment later, and that reload put the previous
   * viewport back, so 5Y on a 1W chart visited before showed 1750 of 1820 days. (3) The range belongs to one feed: another dataset
   * (an interval or symbol switch) drops it, and only a range the bars do not cover yet asks for history. */
  type StickyRange={range:RangePreset;datasetId:typeof currentSource.datasetId;limited:boolean;until:number;cap:number;settle:number};
  let stickyRange:StickyRange|null=null;
  const STICKY_RANGE_MS=60000,STICKY_RANGE_CAP_MS=180000,STICKY_SETTLE_MS=8000;
  const holdRange=(range:RangePreset,fresh:boolean,limited:boolean)=>{
    const now=Date.now(),datasetId=currentSource.datasetId,prior=!fresh&&stickyRange&&stickyRange.datasetId===datasetId?stickyRange:null;
    const next:StickyRange=prior?{...prior,range,limited}:{range,datasetId,limited,until:now+STICKY_RANGE_MS,cap:now+STICKY_RANGE_CAP_MS,settle:now+STICKY_SETTLE_MS};
    stickyRange=isLiveInputIdentity(currentSource.inputIdentity)&&(limited||now<next.settle)?next:null;
  };
  const applyRange=(range:RangePreset,fresh:boolean)=>{
    const last=currentBars.at(-1);if(!last)return {ok:false as const,diagnostic:{code:'DATA_UNAVAILABLE',feature:'date range',message:'No bars are loaded.',severity:'unavailable' as const}};
    const start=rangeStart(last.time,range);if(start===null){chart.setVisibleRangePreset('ALL');navigationChanged();/* All on a live feed keeps widening while pages land, until the feed has no more. */const paging=liveHistoryState(currentSource.datasetId),more=!!paging&&paging.status!=='exhausted'&&isLiveInputIdentity(currentSource.inputIdentity);holdRange(range,fresh,more);if(more&&fresh)requestLiveHistory(currentSource.datasetId);return more?{ok:true as const,limitedByHistory:true}:{ok:true as const};}
    chart.setVisibleRange({from:Math.max(start,currentBars[0].time)*1000,to:last.time*1000});navigationChanged();
    const limited=start<currentBars[0].time,state=limited?liveHistoryState(currentSource.datasetId):null;
    holdRange(range,fresh,limited&&!!state&&state.status!=='exhausted');
    if(stickyRange?.limited&&fresh)requestLiveHistory(currentSource.datasetId);
    return {ok:true as const,limitedByHistory:limited};
  };
  /* A rate-limited page pauses the pager (status 'error') and no frame arrives meanwhile, so a sticky range asks again while it waits. */
  const stickyPoll=setInterval(()=>{if(disposed){clearInterval(stickyPoll);return;}const sticky=stickyRange;if(!sticky)return;if(sticky.datasetId!==currentSource.datasetId){stickyRange=null;return;}const now=Date.now();if(sticky.limited){const status=liveHistoryState(currentSource.datasetId)?.status;if(status==='error'||status==='loading')sticky.until=Math.min(sticky.cap,Math.max(sticky.until,now+10000));}if(now>sticky.until||!sticky.limited&&now>sticky.settle){stickyRange=null;return;}if(sticky.limited)requestLiveHistory(currentSource.datasetId);},2000);
  const reapplyStickyRange=()=>{const sticky=stickyRange;if(!sticky||disposed)return;if(sticky.datasetId!==currentSource.datasetId||Date.now()>sticky.until){stickyRange=null;return;}try{applyRange(sticky.range,false);if(stickyRange?.limited)requestLiveHistory(currentSource.datasetId);}catch{stickyRange=null;}};
  const dropStickyRange=()=>{stickyRange=null;};
  try{container.addEventListener('wheel',dropStickyRange,{passive:true});container.addEventListener('pointerdown',dropStickyRange);}catch{/* harness without a container */}
  const PREFETCH_DWELL_MS=1500;let dwell:{id:typeof currentSource.datasetId;until:number;timer:ReturnType<typeof setTimeout>|null}|null=null;
  const prefetchDwelled=(id:typeof currentSource.datasetId)=>{
    const now=Date.now();if(!dwell||dwell.id!==id){if(dwell?.timer)clearTimeout(dwell.timer);dwell={id,until:now+PREFETCH_DWELL_MS,timer:null};}
    if(now>=dwell.until)return true;
    if(!dwell.timer){const owned=dwell;owned.timer=setTimeout(()=>{owned.timer=null;if(!disposed&&dwell===owned)requestOlderHistory(true);},owned.until-now+10);}
    return false;
  };
  const requestOlderHistory=(followUp?:unknown)=>{
    syncHistoryRoom();
    if(!prefetchArmed)return;
    if(disposed||!isLiveInputIdentity(currentSource.inputIdentity)||isDerivedStyle(requestedStyle))return;
    try{
      const range=chart.getVisibleRange();if(!range)return;const from=range.from/1000,span=Math.max(0,(range.to-range.from)/1000);
      const near=nearHistoryStart(from-LIVE_HISTORY_PREFETCH_SCREENS*span,currentBars);
      if(currentBars.length>=LIVE_HISTORY_PREFETCH_BARS&&!near)return;
      /* The no-gesture prefetch towards 5000 bars waits until a feed has been on screen PREFETCH_DWELL_MS, so a
       * walk through the interval menu pays for each visited chart's first view (backfill plus the page its margin needs), not
       * for 5000 bars of every interval passed through. A view near its oldest bar (open, zoom-out, pan) still pages at once. */
      if(!near&&!prefetchDwelled(currentSource.datasetId))return;
      // A follow-up that lands during a reload (the prepend's own viewport restore) checks again after it settles.
      if(marketUpdating){if(followUp===true)scheduleHistoryFollowUp();return;}
      if(requestLiveHistory(currentSource.datasetId))scheduleHistoryFollowUp();
    }catch{/* history paging never breaks navigation */}
  };
  if(typeof chart.on==='function')chart.on('viewport:changed',requestOlderHistory);
  /* typeof: extracted-block harnesses run this body without the market subscribers. */if(typeof marketAppliedSubscribers!=='undefined')marketAppliedSubscribers.add(()=>{requestOlderHistory(true);reapplyStickyRange();});
  const applyRequestedStyle=()=>{
    retireStatisticsSource();
    const config=chart.renderer.getConfig() as {chartTypes?:Record<string,Record<string,unknown>>};
    const source=['line','linemarkers','step','area','baseline','columns'].includes(requestedStyle)?config.chartTypes?.[requestedStyle]?.source??'close':'close';
    applyRendererConfig({chartTypes:{[APPEARANCE_LAYER]:{lvPriceSource:source,lvTypeSettings:{...(config.chartTypes?.[requestedStyle]??{})}}}});
    // Heikin Ashi paints with its own colors and previous-close choice; every other style gets the appearance candles back.
    const heikinAshi=requestedStyle==='heikinashi'?heikinAshiSettings():null;
    if(lastAppearance){const candleAppearance=heikinAshi?candleAppearanceForStyle('heikinashi',lastAppearance,heikinAshi):lastAppearance;applyRendererConfig({candles:mapAppearance(candleAppearance).config.candles,chartTypes:{[APPEARANCE_LAYER]:Object.fromEntries(Object.entries(candleAppearance).filter(([key])=>key.startsWith('mainSeriesProperties.candleStyle.')))}} as Parameters<typeof applyRendererConfig>[0]);}
    const previousClose=heikinAshi?heikinAshi.previousClose===true:lastAppearance&&appearanceBoolean(lastAppearance['mainSeriesProperties.candleStyle.barColorsOnPrevClose']);
    chart.renderer.set('priceStyle',previousClose&&requestedStyle==='candles'?PREVIOUS_CLOSE_STYLE:previousClose&&requestedStyle==='heikinashi'?PREVIOUS_CLOSE_HA_STYLE:requestedStyle);
    // A style or settings change into, out of or within a derived type re-feeds the renderer (axis feed or source bars).
    if(derivedFeedKey(currentBars)!==fedDerivedKey)void applyMarketInput(currentBars).catch(()=>unavailable(chartTypeLabel(requestedStyle)+' chart could not be drawn from the current bars. Choose another chart type or reload the data.'));else publishDerivedPayload(currentBars);
  };
  const drawingSubscribers=new Set<DrawingSubscriber>();let drawingBatch=0,drawingDirty=false,nativeDrawingReconciliationHold=0,drawingEraseHeld=false;let selectedDrawingIds:string[]=[];
  const recomputeScriptIndicators=indicators.recompute.bind(indicators);let scriptObservedExecution=currentExecutionIdentity;
  const scriptIndicatorRecompute=()=>{
   const source=currentSource,input=currentBars,style=requestedStyle,execution=currentExecutionIdentity,epoch=vwapSourceEpoch,value=recomputeScriptIndicators();
   if(disposed||analysisUnavailable||currentSource!==source||currentBars!==input||requestedStyle!==style||currentExecutionIdentity!==execution||vwapSourceEpoch!==epoch)return value;
   if(scriptObservedExecution!==execution){const previous=scriptObservedExecution;scriptObservedExecution=execution;try{publishDerivedPayload(input,{kind:'execution',expectedExecution:execution});}catch(error){if(currentExecutionIdentity===execution&&vwapSourceEpoch===epoch)scriptObservedExecution=previous;throw error;}}
   else publishDerivedPayload(input,{kind:'renew'});return value;
  };
  indicators.recompute=scriptIndicatorRecompute;
  // held-drawing-publication.ts: a drawing change held back by the routine background autosave hold (a native drag or inline text edit) is remembered and published after the write, not dropped at the release.
  const heldDrawings=createHeldDrawingPublication({publish:()=>notifyDrawings(),live:()=>!disposed,report:error=>{diagnostics.push({code:'DRAWING_HELD_PUBLICATION',feature:'drawing publication',severity:'warning',message:String(error)});}});
  // drawing-edit-transaction.ts: one renderer settings panel session (open to OK/Cancel) is one publication and one undo step.
  const drawingSettings=createDrawingSettingsSession({publish:()=>{if(!disposed)notifyDrawings();},snapshot:()=>document.serialize(),same:sameDrawingData});
  const notifyDrawings=()=>{contextMenus?.retire();if(drawingBatch){drawingDirty=true;/* Held drawing publication; typeof: extracted-line test harnesses evaluate this line without it. */if(typeof heldDrawings!=='undefined')heldDrawings.held();return;}/* Settings panel session; typeof: extracted-line harnesses. */if(typeof drawingSettings!=='undefined'&&drawingSettings.hold())return;if(typeof heldDrawings!=='undefined')heldDrawings.published();if(typeof pushDwb3Shapes==="function")pushDwb3Shapes();publishDrawingSubscribers(drawingSubscribers);};
  /** The current toolbar stamp (syncOn ? syncMode : none). */
  const drawingSyncStamp=()=>drawingUtilityState?currentSyncStamp(drawingUtilityState)??null:null;
  const reconcileNativeDrawings=(recordHistory:boolean)=>document.atomic(()=>{
    if(document.all().some(row=>row.type==='trendline'&&readTrendlineAnnotation(row.text).state==='supported')){
      const source=currentSource,input=currentBars,style=requestedStyle;
      const assertCurrent=()=>{if(disposed||currentSource!==source||currentBars!==input||requestedStyle!==style)throw Error('Native drawing projection source changed');};
      const receipt=captureNativeDrawingProjection(chart.drawings,document,assertCurrent,rows=>drawingProjection.canonicalNativeRows(rows));
      const before=document.all() as Record<string,unknown>[];
      document.mergeRenderable(receipt.rows,knownTypes,recordHistory,unavailableDrawingIds,receipt.authority);
      // The receipt authority requires row identity, so new ids are stamped by a canonical-to-canonical pass in the same atomic block (no history step).
      const after=document.all() as Record<string,unknown>[],stamped=stampNewDrawings(before,after,drawingSyncStamp());
      if(stamped.some((row,index)=>row!==after[index]))document.mergeRenderable(stamped,knownTypes,false,unavailableDrawingIds);
    }else document.mergeRenderable(stampNewDrawings(document.all() as Record<string,unknown>[],drawingProjection.canonicalNativeRows(chart.drawings.all() as unknown as Record<string,unknown>[]),drawingSyncStamp()),knownTypes,recordHistory,unavailableDrawingIds);
    /* typeof: extracted-block test harnesses evaluate this reconciliation without the DWB3 seed state. */
    if(typeof channelSeedPending!=='undefined'&&typeof applyChannelSeeds==='function'&&channelSeedPending.size){const ids=new Set(channelSeedPending);channelSeedPending.clear();applyChannelSeeds(document,ids,knownTypes,unavailableDrawingIds);}
    const captured=commitPortableDrawingBindings(document,analysisInventory(),drawingProjection.nativeRowsSnapshot());drawingReservations.apply(document.ids());return captured;
  });
  const updateDocument = () => {if(nativeDrawingReconciliationHold){drawingDirty=true;return;}try{reconcileNativeDrawings(true);notifyDrawings();}catch(error){const errors:unknown[]=[error];try{const resolved=resolvePortableDrawingDocument(document.serialize(),analysisInventory(),knownTypes);unavailableDrawingIds=new Set(resolved.unavailableIds);drawingBindingDiagnostics=resolved.diagnostics;drawingReservations.apply(document.ids());chart.drawings.fromJSON(resolved.nativeDocument);}catch(recovery){errors.push(recovery);}const message=errors.map(String).join(' | ');diagnostics.push({code:'DRAWING_RECONCILIATION_FAILED',feature:'drawing identity',severity:'unavailable',message});unavailable(message+' Canonical retained drawings were not overwritten. Reopen the chart to recover.');}};
  // Root creation hook: a Bars pattern just placed by the pointer with no usable bars is removed and the
  // reason shown on the cell (drawing command message); otherwise its copied bars are bound to the one loaded dataset that
  // holds them. Both run inside one drawing batch before the canonical document captures the create, so the placement stays
  // one publication (one workspace undo step). Batched paths (duplicate, template, eraser, reconciliation) are left alone.
  // A Parallel channel placed by the pointer is seeded with the level defaults inside the same drawing batch,
  // before the canonical document captures the create, so the placement stays one publication (one undo step). Batched paths (duplicate, template,
  // eraser, reconciliation, load, import, paste) never call it, so a saved channel is untouched.
  const seedCreatedChannel=(id:string)=>{
   if(disposed||drawingBatch||nativeDrawingReconciliationHold||drawingEraseHeld)return;
   let row:Record<string,unknown>|undefined;
   try{row=(chart.drawings.all() as unknown as Array<Record<string,unknown>>).find(item=>String(item.id)===id);}catch{return;}
   if(!row||row.type!=='parallelchannel')return;
   // The native store cannot carry the member (a vela ParallelChannel keeps no props), so the id waits for the reconciliation that captures this create
   // and the defaults are written to the canonical document inside that same atomic block (one publication, one undo step).
   channelSeedPending.add(id);
  };
  let barsPatternDatasets:readonly BarDataset[]|null=null;
  const bindCreatedBarsPattern=(id:string)=>{
   if(disposed||drawingBatch||nativeDrawingReconciliationHold||drawingEraseHeld)return;
   let row:{id?:unknown;type?:unknown;props?:Record<string,unknown>}|undefined;
   try{row=(chart.drawings.all() as unknown as Array<{id?:unknown;type?:unknown;props?:Record<string,unknown>}>).find(item=>String(item.id)===id);}catch{return;}
   if(!row||row.type!==LV_BARS_PATTERN)return;
   const refusal=barsPatternPlacementRefusal(row);
   drawingBatch++;try{
    if(refusal){chart.drawings.remove(id);try{reportDrawingCommandError(refusal);}catch{/* A retired owner reports nothing. */}return;}
    const read=readBarsPattern(row.props);if(read.state!=='supported'||!barsPatternDatasets||read.member.source.instrumentId!==null)return;
    const bound=bindBarsPatternMember(read.member,barsPatternDatasets,{datasetId:currentSource.datasetId,resolution:currentSource.resolution});
    if(bound&&bound!==read.member)chart.drawings.update(id,{props:patchBarsPatternMember(row.props,bound)});
   }catch(error){diagnostics.push({code:'DRAWING_METADATA_UNAVAILABLE',feature:'bars pattern source',severity:'unavailable',message:String(error)});}
   finally{drawingBatch--;if(!drawingBatch&&drawingDirty){drawingDirty=false;notifyDrawings();}}
  };
  const unsubscribes = [chart.on('drawing:selected',({ids})=>{selectedDrawingIds=[...ids];}),/* This chart's tick size and selection reach its Long/Short positions. typeof: extracted-line test harnesses evaluate this list without the hook. */typeof registerPositionChartContext==='function'?registerPositionChartContext(chartPositionContext({container,tickSize:()=>sourceTickSize(currentSource),selectedIds:()=>selectedDrawingIds,hoveredId:()=>rendererHoveredDrawingId(rendererHolder.current)})):()=>{},chart.on('drawing:draft',({doc})=>{const step=unhideUnlockStep(unhideUnlock,doc===null?'create':'draft',drawingUtilityState??defaultDrawingUtility());unhideUnlock=step.state;if(step.changed){drawingUtilityState=step.utility;drawingUtilitySubscribers.forEach(fn=>fn(step.utility));drawingProjection.refresh();}}),chart.on('drawing:created',()=>{/* A one-click placement commits with no draft; a drawing created while a placement tool is still armed is that first mouse-down (SDD#creation.unhideUnlock). Paste, clone, restore and batch loads run with no tool armed or inside a batch. */if(drawingBatch||nativeDrawingReconciliationHold||drawingEraseHeld||typeof chart.drawings.getTool!=='function'||chart.drawings.getTool()==null)return;const step=unhideUnlockStep(unhideUnlock,'placed',drawingUtilityState??defaultDrawingUtility());unhideUnlock=step.state;if(step.changed){drawingUtilityState=step.utility;drawingUtilitySubscribers.forEach(fn=>fn(step.utility));drawingProjection.refresh();}}),chart.on('drawing:created',({id})=>{/* typeof: extracted-line test harnesses (text-placement-hold.test.ts) evaluate this list without the hook. */if(typeof bindCreatedBarsPattern==='function')bindCreatedBarsPattern(String(id));}),chart.on('drawing:created',({id})=>{if(typeof seedCreatedChannel==='function')seedCreatedChannel(String(id));}),chart.on('drawing:created',({id})=>{/* typeof: extracted-line test harnesses evaluate this list without the hook. */if(typeof returnCreatedBrush==='function')returnCreatedBrush(String(id));}),chart.on('drawing:created',({id})=>textPlacementHold.created(String(id),textPlacementType(String(id)),!drawingBatch&&!nativeDrawingReconciliationHold&&!drawingEraseHeld)),chart.on('drawing:created',updateDocument),chart.on('drawing:edited',({id})=>textPlacementHold.beforeChange(String(id))),chart.on('drawing:edited',updateDocument),chart.on('drawing:edited',({id})=>textPlacementHold.edited(String(id))),chart.on('drawing:removed',({id})=>textPlacementHold.beforeChange(String(id))),chart.on('drawing:removed',()=>{if(drawingEraseHeld)return;drawingBatch++;try{const native=new Set(chart.drawings.all().map(row=>row.id));const removed=document.all().filter(row=>knownTypes.has(row.type as DrawingTypeKey)&&!native.has(String(row.id))&&!unavailableDrawingIds.has(String(row.id))).map(row=>String(row.id));try{drawingManager.reconcileRemoved(removed);}catch(error){diagnostics.push({code:'DRAWING_METADATA_UNAVAILABLE',feature:'drawing groups',severity:'unavailable',message:String(error)});}updateDocument();}finally{drawingBatch--;if(!drawingBatch&&drawingDirty){drawingDirty=false;notifyDrawings();}}}),chart.on('drawing:removed',({id})=>textPlacementHold.removed(String(id))),chart.renderer.onCrosshairMove(event=>{lastCrosshair=normalizedCrosshair(event);})];
  unsubscribes.push(disposePrimarySource,marketQueue.subscribeSettled(notifyPrimarySourceSettled));
  unsubscribes.push(()=>{publishDerivedPayload(currentBars,{kind:'retire-source'});if(indicators.recompute===scriptIndicatorRecompute)indicators.recompute=recomputeScriptIndicators;});
  let chartResourcesReleased=false;
  releaseChartResources=()=>{
    if(chartResourcesReleased)return;chartResourcesReleased=true;disposed=true;
    attemptEveryCleanup([...unsubscribes.splice(0),...earlyChartResources.splice(0)],'Chart registered resource cleanup was incomplete');
  };

  // Saved drawing tool defaults (Save as default) reach this chart's renderer tool defaults (drawing-tool-defaults.ts).
  unsubscribes.push(connectToolDefaults(chart.drawings as unknown as ToolDefaultsFacade,callback=>chart.on('drawing:defaults',callback)));
  // One placement = one undo step, as for every other LV tool. Vela places Text/Callout as a create plus, when its inline editor closes, an edit (or a removal of an empty
  // label). The hold keeps that placement in one drawing batch and publishes it once (src/chart/text-placement-hold.ts).
  const textPlacementType=(id:string)=>{try{const row=(chart.drawings.all() as unknown as Array<{id?:unknown;type?:unknown}>).find(item=>String(item.id)===id);return typeof row?.type==='string'?row.type:undefined;}catch{return undefined;}};
  const textPlacementHold=createTextPlacementHold({editing:id=>{const renderer=rendererHolder.current;if(!renderer)return false;const editor=duplicateOwn(duplicateOwn(renderer,'userDrawings'),'textEditor');return !!editor&&typeof editor==='object'&&String((editor as {id?:unknown}).id)===id;},hold:()=>{drawingBatch++;},release:publish=>{drawingBatch--;if(!drawingBatch)drawingDirty=false;if(publish&&!disposed)notifyDrawings();},schedule:(callback,ms)=>setTimeout(callback,ms),cancel:handle=>{if(handle!==null)clearTimeout(handle as ReturnType<typeof setTimeout>);}});unsubscribes.push(()=>textPlacementHold.dispose());
  // Brush and Highlighter return to Cursor after a stroke unless stay-in-drawing mode is on (src/chart/brush-tool-return.ts).
  const returnCreatedBrush=(id:string)=>{if(drawingBatch||nativeDrawingReconciliationHold||drawingEraseHeld||disposed)return;returnBrushToCursor({tool:()=>{const tool=chart.drawings.getTool();return typeof tool==='string'?tool:null;},stay:()=>chart.drawings.getStayMode(),disarm:()=>{if(!disposed)chart.drawings.setTool(null);},defer:callback=>{queueMicrotask(callback);}},textPlacementType(id));};
  const restore = (value:unknown=document.serialize()) => {/* typeof: extracted-block harnesses run this body without the preview. */if(typeof drawingPreview!=="undefined")drawingPreview.clearAll();const resolved=resolvePortableDrawingDocument(value,analysisInventory(),knownTypes);drawingReservations.apply((resolved.document.drawings as Record<string,unknown>[]).map(row=>String(row.id)));document.load(resolved.document);unavailableDrawingIds=new Set(resolved.unavailableIds);drawingBindingDiagnostics=resolved.diagnostics;drawingReservations.apply(document.ids());chart.drawings.fromJSON(resolved.nativeDocument);if(typeof pushDwb3Shapes==="function")pushDwb3Shapes();return resolved.diagnostics;};
  let prepareAnalysis:(request:AnalysisRestoreRequest)=>Promise<PreparedAnalysisLease>=()=>Promise.reject(new Error('Analysis controller is not ready'));
  let prepareConfiguration:(request:ConfigurationEditRequest)=>Promise<PreparedConfigurationEdit<ConfigurationEditResult>>=()=>Promise.reject(new Error('Configuration controller is not ready'));
  let suspendTree:(request:{expected:HistoricalFrameCaptureRequest['expected'];scripts:AnalysisRestoreRequest['scripts']})=>ReturnType<typeof beginChartTreeSuspension>=()=>{throw Error('Tree suspension controller is not ready');};
  let disposeChart=()=>{};let contextMenus:ChartContextPort|null=null;
  const availabilitySubscribers=new Set<(message:string)=>void>();
  const unavailable=(message:string)=>{if(!analysisUnavailable)analysisUnavailable=message;for(const callback of availabilitySubscribers)try{callback(analysisUnavailable);}catch{/* Other observers must still receive the unavailable state. */}};
  if(rendererHolder.current)trendlineAnnotation=installTrendlineAnnotation(rendererHolder.current,chart,{captureOwner(){const source=currentSource,input=currentBars,style=requestedStyle,epoch=statsSourceEpoch;return()=>{if(disposed||currentSource!==source||currentBars!==input||requestedStyle!==style||statsSourceEpoch!==epoch)throw Error('Trendline annotation source changed');};},unavailable,afterPaint:queueInlineRefresh});
  if(rendererHolder.current){
    try{fibTrendLine=installFibTrendLine(rendererHolder.current,chart,{
      document,
      captureOwner(){const source=currentSource,input=currentBars,style=requestedStyle,epoch=statsSourceEpoch,execution=currentExecutionIdentity;return()=>{if(analysisUnavailable&&!disposed)throw Error('Fibonacci trend line is unavailable: the chart is quarantined. Reopen the chart.');if(disposed||analysisUnavailable||currentSource!==source||currentBars!==input||requestedStyle!==style||statsSourceEpoch!==epoch||currentExecutionIdentity!==execution)throw Error('Fibonacci trend-line source changed.');};},
      captureNativeOwner:(canonical,projected,owner,assertSource)=>captureFibTrendLineNativeOwner(chart.drawings,canonical,projected,owner,assertSource),
      capturePresentationNativeOwner:(canonical,projected,owner,assertSource)=>captureFibLevelPresentationNativeOwner(chart.drawings,canonical,projected,owner,assertSource),
      captureLayoutOwner:(paneId,assertSource)=>captureNativeInlineLayoutOwner(rendererHolder.current!,paneId,assertSource),
      // Attest the settings dialog's live-preview members (renderer copy only) to the Fib binding.
      previewMembers:(id:string)=>{if(!drawingPreview.has(id))return undefined;const {id:_id,...members}=drawingPreview.apply({id});return members;},
      // Attest the Lock all overlay (renderer copy only) to the Fib binding.
      overlayMembers:(_id:string)=>drawingOverlay().locked?{locked:true}:undefined,
      // Renderer rows carry synthetic time on a derived chart; bind them in source time (same row on a time chart).
      rendererRowToSource:(row:SerializedDrawing)=>typeof derivedDrawings!=='undefined'?derivedDrawings.toSourceRow(row):row,
      // A Fib whose native copy outlived its commit lag is re-projected from the saved record (outside paint, panel closed).
      resyncDrawing:()=>{if(disposed||analysisUnavailable)return;reprojectDrawings();},
    });}catch{fibTrendLine=null;}
  }
  if(rendererHolder.current)statsSource=createTrendlineStatisticsSource({renderer:rendererHolder.current,readBasis:()=>({epoch:statsSourceEpoch,source:currentSource,bars:currentBars,style:requestedStyle,temporal:drawingCoordinateContext().timeCoordinatesAvailable,disposed})});
  if(rendererHolder.current&&statsSource){
    try{statsPainter=installTrendlineStatistics(rendererHolder.current,chart,{
      document,captureSource:()=>statsSource!.capture(),
      captureNativeOwner:(canonical,projected,owner,assertSource)=>captureTrendlineStatisticsNativeOwner(chart.drawings,canonical,projected,owner,assertSource),
      reportUnavailable(){/* Read current owned diagnostics through the chart and drawing settings; do not quarantine analysis. */},
      rendererRowToSource:(row:SerializedDrawing)=>typeof derivedDrawings!=='undefined'?derivedDrawings.toSourceRow(row):row,
      pipSize:()=>forexPipSize(sourceAxisBasis(currentSource)),
    });}catch{statsPainter=null;}
  }
  // The shape layer paints trendline markers and channel levels from the canonical rows. A consumer flag is on only while its
  // consumer is installed; fib.* and position.* stay off (no consumer yet).
  {
    const renderer=rendererHolder.current as unknown as {setNativeData?:(type:string,data:unknown)=>void}|null;
    let shapeLayer=false;
    if(dwb3LayerRegistered&&typeof renderer?.setNativeData==='function'){
      pushDwb3Shapes=()=>{if(disposed)return;try{renderer!.setNativeData!(DWB3_SHAPE_LAYER,dwb3ShapePayload(document.all().map(row=>derivedDrawings.toNativeRow(row)),drawingProjection.visibleIds()));}catch(error){diagnostics.push({code:'DRAWING_METADATA_UNAVAILABLE',feature:'trendline and channel presentation',severity:'unavailable',message:String(error)});}};
      try{renderer.setNativeData(DWB3_SHAPE_LAYER,dwb3ShapePayload(document.all().map(row=>derivedDrawings.toNativeRow(row)),drawingProjection.visibleIds()));shapeLayer=true;}catch{pushDwb3Shapes=null;}
    }
    for(const name of ['trendline.middlePoint','trendline.priceLabels','channel.levels','channel.extend','channel.background','box.extend'])dwb3Consumers.set(name,shapeLayer);
    // Distance and angle are painted by the statistics painter: they must not stay visible but inert when its installation fails.
    for(const name of ['trendline.distance','trendline.angle','trendline.pips'])dwb3Consumers.set(name,statsPainter!==null);
  }
  const statsEditorStatus=(editor:ReturnType<typeof drawingEditor>)=>{
    if(editor.type==='fibretracement'){
      if(!fibTrendLine){const message='Fibonacci trend line could not start. Reopen the chart to try again. Your settings are kept.';return{...editor,fields:editor.fields.filter(field=>!field.path.startsWith(FIB_TREND_LINE_PREFIX)),fibTrendLine:{state:'unavailable' as const,message},fibTrendLineDiagnostic:editor.fibTrendLineDiagnostic??message};}
      const notices=fibTrendLine.diagnostics();return notices.length?{...editor,fibTrendLineDiagnostic:editor.fibTrendLineDiagnostic??notices.map(row=>row.message).join(' | ').slice(0,2000)}:editor;
    }
    if(editor.type!=='trendline')return editor;
    if(!statsPainter)return{...editor,fields:editor.fields.filter(field=>!isTrendlineStatsPath(field.path)),statsDiagnostic:editor.statsDiagnostic??'Trendline statistics could not start. Reopen this chart to try again. Saved settings are retained.'};
    const notices=statsPainter.diagnostics();return notices.length?{...editor,statsDiagnostic:editor.statsDiagnostic??notices.map(row=>row.message).join(' | ').slice(0,2000)}:editor;
  };
  const analysisInventory=():AnalysisPaneInventory=>{const owned=new Map<string,{kind:'built'|'script'|'comparison';id:string;rendererId:string}>();for(const [kind,rows] of [['built',indicators.list()],['script',scripts.list()],['comparison',comparisons.list()]] as const)for(const row of rows)owned.set(row.rendererId,{kind,id:row.id,rendererId:row.rendererId});const panes=chart.panes.list().map(pane=>{const owners=pane.indicators.map(row=>owned.get(row.id)??{kind:'unknown' as const,id:row.id,rendererId:row.id});return{paneId:pane.id,logicalPaneId:pane.id==='price'?'price':owners.length>0&&owners.every(owner=>owner.kind==='comparison')?null:paneRegistry.logical(pane.id),replaceable:pane.id!=='price'&&owners.length>0&&owners.every(owner=>owner.kind==='built'||owner.kind==='script'),owners};});return{panes,occupiedIds:[...new Set([...panes.flatMap(pane=>[pane.paneId,...pane.logicalPaneId?[pane.logicalPaneId]:[]]),...[...owned.values()].flatMap(row=>[row.id,row.rendererId]),...document.all().map(row=>String(row.id))])]};};
  const recoverNativeDrawingDocument=(value:Record<string,unknown>)=>{
    const resolved=resolvePortableDrawingDocument(value,analysisInventory(),knownTypes);
    drawingReservations.apply((resolved.document.drawings as Record<string,unknown>[]).map(row=>String(row.id)));
    unavailableDrawingIds=new Set(resolved.unavailableIds);drawingBindingDiagnostics=resolved.diagnostics;
    chart.drawings.fromJSON(resolved.nativeDocument);
  };
  // The manager is keyed on the chart identity, not its bars. A live tick on the same feed (same
  // live input identity and source basis, as setMarketData's sameLive) keeps an open manager current; any other source change still retires it.
  const captureDrawingManagerOwner=()=>{const source=currentSource,input=currentBars,style=requestedStyle;const sameChart=()=>currentSource===source&&currentBars===input||typeof isLiveInputIdentity==='function'&&typeof sameChartSourceBasis==='function'&&isLiveInputIdentity(source.inputIdentity)&&currentSource.inputIdentity===source.inputIdentity&&sameChartSourceBasis(source,currentSource,true);const assertCurrent=()=>{if(disposed||analysisUnavailable||analysisPending||marketQueue.isPending()||!sameChart()||requestedStyle!==style)throw Error('Drawing manager chart input changed. Close and reopen this manager.');};assertCurrent();return assertCurrent;};
  const duplicateOwn=(value:unknown,key:string):any=>{if(!value||typeof value!=='object')throw Error('Drawing Duplicate owner unavailable: '+key);const field=Object.getOwnPropertyDescriptor(value,key);if(!field||!Object.hasOwn(field,'value'))throw Error('Drawing Duplicate requires a data member: '+key);return field.value;};
  const drawingChromeOwner=(()=>{const renderer=rendererHolder.current;if(!renderer)return null;const native=duplicateOwn(renderer,'userDrawings'),popup=duplicateOwn(native,'popup');const path:Array<{owner:object;prototype:object|null;field:PropertyDescriptor|undefined}>=[];let contains:((target:EventTarget|null)=>unknown)|undefined;for(let owner:object|null=popup;owner;owner=Object.getPrototypeOf(owner)){if(path.length===32)throw Error('Drawing popup prototype bound exceeded.');const field=Object.getOwnPropertyDescriptor(owner,'contains');path.push({owner,prototype:Object.getPrototypeOf(owner),field});if(field){if(!Object.hasOwn(field,'value')||typeof field.value!=='function')throw Error('Drawing popup containment must be a data method.');contains=field.value;break;}}if(!contains)throw Error('Drawing popup containment unavailable.');return{renderer,native,popup,path,contains};})();
  const isDrawingChromeTarget=(target:EventTarget|null):boolean=>{
    const owned=drawingChromeOwner;if(!owned||disposed||!target)return false;
    const check=()=>{if(disposed||rendererHolder.current!==owned.renderer||duplicateOwn(duplicateOwn(chart,'orchestrator'),'renderer')!==owned.renderer||duplicateOwn(owned.renderer,'userDrawings')!==owned.native||duplicateOwn(owned.native,'popup')!==owned.popup)throw Error('Drawing popup owner changed.');for(const part of owned.path){const field=Object.getOwnPropertyDescriptor(part.owner,'contains');if(Object.getPrototypeOf(part.owner)!==part.prototype||!!field!==!!part.field||field&&(field.value!==part.field?.value||field.get!==part.field?.get||field.set!==part.field?.set||field.writable!==part.field?.writable||field.enumerable!==part.field?.enumerable||field.configurable!==part.field?.configurable))throw Error('Drawing popup containment changed.');}};
    try{check();const answer=Reflect.apply(owned.contains,owned.popup,[target]);check();return answer===true;}catch{return false;}
  };
  type DrawingWorkspaceRegistration={host:DrawingDuplicateWorkspaceHost;active:boolean;methods:Map<string,PropertyDescriptor>};
  let drawingWorkspaceRegistration:DrawingWorkspaceRegistration|null=null;
  const drawingCommandErrorSubscribers=new Set<(message:string)=>void>();
  retireDrawingWorkspaceBinding=()=>{if(drawingWorkspaceRegistration)drawingWorkspaceRegistration.active=false;drawingWorkspaceRegistration=null;drawingCommandErrorSubscribers.clear();};
  const captureDrawingCommandErrorOwner=()=>{const source=currentSource,input=currentBars,style=requestedStyle,execution=currentExecutionIdentity,epoch=vwapSourceEpoch,statistics=statsSourceEpoch,registration=drawingWorkspaceRegistration,renderer=rendererHolder.current;return()=>{if(disposed||currentSource!==source||currentBars!==input||requestedStyle!==style||currentExecutionIdentity!==execution||vwapSourceEpoch!==epoch||statsSourceEpoch!==statistics||drawingWorkspaceRegistration!==registration||rendererHolder.current!==renderer||duplicateOwn(duplicateOwn(chart,'orchestrator'),'renderer')!==renderer)throw Error('Drawing command error owner changed.');};};
  const reportDrawingCommandError=(message:string)=>{const assert=captureDrawingCommandErrorOwner();assert();if(typeof message!=='string')return;const bounded=message.slice(0,900);for(const listener of [...drawingCommandErrorSubscribers]){assert();try{listener(bounded);}catch{/* Other current listeners may still receive the message. */}assert();}};
  const assertDrawingWorkspaceRegistration=(registration:DrawingWorkspaceRegistration)=>{
    if(disposed||drawingWorkspaceRegistration!==registration||!registration.active)throw Error('Drawing workspace binding retired or replaced.');
    for(const[key,expected]of registration.methods){const actual=Object.getOwnPropertyDescriptor(registration.host,key);if(!actual||!Object.hasOwn(actual,'value')||actual.value!==expected.value||actual.writable!==expected.writable||actual.configurable!==expected.configurable||actual.enumerable!==expected.enumerable)throw Error('Drawing workspace host method changed.');}
  };
  const bindDrawingWorkspaceHost=(host:DrawingDuplicateWorkspaceHost):(()=>void)=>{
    if(disposed)throw Error('Drawing chart is disposed.');
    const methods=new Map<string,PropertyDescriptor>();for(const key of ['capture','history','historyStatus']){const field=Object.getOwnPropertyDescriptor(host,key);if(!field||!Object.hasOwn(field,'value')||typeof field.value!=='function')throw Error('Drawing workspace host requires synchronous data callbacks.');methods.set(key,field);}
    if(drawingWorkspaceRegistration)drawingWorkspaceRegistration.active=false;
    const registration={host,active:true,methods};drawingWorkspaceRegistration=registration;
    return()=>{registration.active=false;if(drawingWorkspaceRegistration===registration)drawingWorkspaceRegistration=null;};
  };
  const captureDuplicateSource=()=>{
    const source=currentSource,input=currentBars,style=requestedStyle,execution=currentExecutionIdentity,epoch=vwapSourceEpoch,statistics=statsSourceEpoch,registration=drawingWorkspaceRegistration,renderer=rendererHolder.current;
    if(!registration)throw Error('Drawing Duplicate requires a bound workspace.');
    const assert=()=>{assertDrawingWorkspaceRegistration(registration);if(currentSource!==source||currentBars!==input||requestedStyle!==style||currentExecutionIdentity!==execution||vwapSourceEpoch!==epoch||statsSourceEpoch!==statistics||rendererHolder.current!==renderer)throw Error('Drawing Duplicate source or execution changed.');};assert();return assert;
  };
  const assertDuplicateMutable=(operation='Duplicate')=>{
    if(disposed||analysisUnavailable||analysisPending||marketUpdating||marketQueue.isPending())throw Error('Drawing '+operation+' is unavailable while the chart is busy or unavailable.');
    const editor=inlineEditor;if(editor?.isEditing())throw Error('Finish inline text editing before drawing '+operation+'.');if(inlineEditor!==editor)throw Error('Inline editor ownership changed.');
    const renderer=rendererHolder.current;if(!renderer)throw Error('Drawing Duplicate native renderer is unavailable.');
    const native=duplicateOwn(renderer,'userDrawings'),state=duplicateOwn(duplicateOwn(native,'interaction'),'state'),input=duplicateOwn(renderer,'input'),touches=duplicateOwn(input,'touches');
    if(!(touches instanceof Map)||Object.getPrototypeOf(touches)!==Map.prototype||Reflect.apply(Object.getOwnPropertyDescriptor(Map.prototype,'size')!.get!,touches,[])!==0||duplicateOwn(input,'dragging')!==false||duplicateOwn(state,'kind')!=='idle'||duplicateOwn(native,'activeTool')!==null||duplicateOwn(native,'textEditor')!==null||duplicateOwn(native,'measureMode')!==false)throw Error('Finish the active native gesture or text editor before drawing '+operation+'.');
    // Eraser mode alone (no genuine gesture/editor) gets its own exit instruction for Undo/Redo.
    if(duplicateOwn(native,'eraserMode')!==false)throw Error(operation==='history'?'Press Escape or choose Cursor before using Undo or Redo with the eraser.':'Finish the active native gesture or text editor before drawing '+operation+'.');
  };
  const captureDuplicateWorkspace=(purpose:'duplicate'|'erase'='duplicate'):DrawingDuplicateWorkspaceCommand=>{
    const registration=drawingWorkspaceRegistration;if(!registration)throw Error('Drawing Duplicate requires a bound workspace.');const source=captureDuplicateSource();
    const check=()=>{source();assertDrawingWorkspaceRegistration(registration);};check();const command=registration.host.capture(purpose);check();
    const assertCommand=duplicateOwn(command,'assertCurrent'),prepare=duplicateOwn(command,'prepare');if(typeof assertCommand!=='function'||typeof prepare!=='function')throw Error('Drawing workspace command is unavailable.');
    const current=()=>{check();if(duplicateOwn(command,'assertCurrent')!==assertCommand||duplicateOwn(command,'prepare')!==prepare)throw Error('Drawing workspace command methods changed.');Reflect.apply(assertCommand,command,[]);check();};current();
    return Object.freeze({assertCurrent:current,prepare(candidate:Readonly<Record<string,unknown>>):PreparedDrawingDuplicateWorkspace{current();const prepared=Reflect.apply(prepare,command,[candidate]);current();const assertPrepared=duplicateOwn(prepared,'assertCurrent'),publish=duplicateOwn(prepared,'publish');if(typeof assertPrepared!=='function'||typeof publish!=='function')throw Error('Prepared drawing workspace is unavailable.');const owns=()=>{current();if(duplicateOwn(prepared,'assertCurrent')!==assertPrepared||duplicateOwn(prepared,'publish')!==publish)throw Error('Prepared drawing workspace methods changed.');Reflect.apply(assertPrepared,prepared,[]);current();};owns();return Object.freeze({assertCurrent:owns,publish(mark:()=>void){owns();const result=Reflect.apply(publish,prepared,[mark]);if(result!==undefined)throw Error('Drawing workspace publication must return synchronous void.');current();}});}});
  };
  const captureDuplicateProjection=()=>{
    const source=captureDuplicateSource(),inventory=analysisInventory(),signature=JSON.stringify(inventory.panes),renderer=rendererHolder.current!,scene=duplicateOwn(renderer,'scene'),series=duplicateOwn(scene,'seriesZ');
    if(!(series instanceof Map)||Object.getPrototypeOf(series)!==Map.prototype)throw Error('Drawing native stacking inventory is unavailable.');
    const seriesRows=()=>[...Map.prototype.entries.call(series)] as Array<[unknown,unknown]>;
    const stacking=JSON.stringify(seriesRows());let stackingFloor=0;for(const[,value]of seriesRows()){if(typeof value!=='number'||!Number.isFinite(value))throw Error('Drawing series stacking value is unavailable.');stackingFloor=Math.max(stackingFloor,value);}
    const assertCurrent=()=>{source();if(duplicateOwn(renderer,'scene')!==scene||duplicateOwn(scene,'seriesZ')!==series||JSON.stringify(seriesRows())!==stacking||JSON.stringify(analysisInventory().panes)!==signature)throw Error('Drawing pane, study or stacking inventory changed.');source();};assertCurrent();
    const store=duplicateOwn(duplicateOwn(chart.drawings,'ctrl'),'store'),reserved=()=>{const value=duplicateOwn(store,'reservedIds');if(!(value instanceof Set)||Object.getPrototypeOf(value)!==Set.prototype)throw Error('Drawing reserved IDs are unavailable.');return value as Set<string>;};
    const occupiedIds=[...new Set([...inventory.occupiedIds,...chart.drawings.all().map(row=>row.id),...Set.prototype.values.call(reserved())])];assertCurrent();
    return{occupiedIds,stackingFloor,assertCurrent,assertFreshIds(ids:readonly string[]){assertCurrent();const live=new Set([...chart.drawings.all().map(row=>row.id),...Set.prototype.values.call(reserved())]);assertCurrent();if(ids.some(id=>live.has(id)))throw Error('Drawing Duplicate IDs collided with native or reserved IDs.');},project(value:Record<string,unknown>){assertCurrent();const resolved=resolvePortableDrawingDocument(value,inventory,knownTypes);assertCurrent();if(resolved.unavailableIds.length)throw Error('Drawing Duplicate pane projection is unavailable: '+resolved.diagnostics.map(row=>row.message).join(' | '));return resolved.nativeDocument.drawings as unknown as SerializedDrawing[];}};
  };
  const drawingDuplicatePublisher=createDrawingDuplicatePublisher({
    document,facade:chart.drawings,captureSource:captureDuplicateSource,captureWorkspace:captureDuplicateWorkspace,captureProjection:captureDuplicateProjection,assertMutable:assertDuplicateMutable,
    makeId:()=>`lv-drawing-${crypto.randomUUID()}`,
    begin:()=>{if(drawingBatch||nativeDrawingReconciliationHold)throw Error('Drawing Duplicate cannot nest inside another drawing publication.');drawingBatch++;nativeDrawingReconciliationHold++;let released=false;return{release(){if(released)throw Error('Drawing Duplicate hold already released.');released=true;nativeDrawingReconciliationHold--;drawingBatch--;drawingDirty=false;}};},
    reserve:ids=>drawingReservations.apply(ids),select:ids=>{chart.drawings.select([...ids]);},selection:()=>[...selectedDrawingIds],notify:notifyDrawings,quarantine:unavailable,
  });
  const assertEraseMutable=(arming=false)=>{
    if(disposed||analysisUnavailable||analysisPending||marketUpdating||marketQueue.isPending())throw Error('Eraser is unavailable while the chart is busy or unavailable.');
    const editor=inlineEditor;if(editor?.isEditing())throw Error('Finish inline text editing before erasing.');if(inlineEditor!==editor)throw Error('Inline editor ownership changed.');
    const renderer=rendererHolder.current;if(!renderer)throw Error('Eraser native renderer is unavailable.');
    const native=duplicateOwn(renderer,'userDrawings'),state=duplicateOwn(duplicateOwn(native,'interaction'),'state'),input=duplicateOwn(renderer,'input'),touches=duplicateOwn(input,'touches');
    if(!(touches instanceof Map)||Object.getPrototypeOf(touches)!==Map.prototype||Reflect.apply(Object.getOwnPropertyDescriptor(Map.prototype,'size')!.get!,touches,[])!==0||(arming?duplicateOwn(input,'dragging')!==false:duplicateOwn(input,'dragging')===true&&duplicateOwn(input,'region')!=='drawing')||duplicateOwn(state,'kind')!=='idle'||duplicateOwn(native,'textEditor')!==null||!arming&&(duplicateOwn(native,'activeTool')!==null||duplicateOwn(native,'measureMode')!==false||duplicateOwn(native,'eraserMode')!==true))throw Error('Eraser requires its current mouse gesture and an idle drawing editor.');
  };
  const drawingErasePublisher=createDrawingErasePublisher({
    document,facade:chart.drawings,captureSource:captureDuplicateSource,captureWorkspace:()=>captureDuplicateWorkspace('erase'),captureProjection:captureDuplicateProjection,assertMutable:assertEraseMutable,
    assertEligible:row=>{if(!knownTypes.has(row.type as DrawingTypeKey)||unavailableDrawingIds.has(String(row.id))||row.locked===true)throw Error('This drawing is locked or has no supported native projection.');const visibility=drawingVisibility(row,currentSource.resolution);if(!visibility.visible||visibility.diagnostic)throw Error('This drawing is not visible at the current source interval.');},
    begin:()=>{if(drawingBatch||nativeDrawingReconciliationHold)throw Error('Eraser cannot nest inside another drawing publication.');drawingBatch++;nativeDrawingReconciliationHold++;drawingEraseHeld=true;let released=false;return{release(){if(released)throw Error('Eraser hold already released.');released=true;drawingEraseHeld=false;nativeDrawingReconciliationHold--;drawingBatch--;drawingDirty=false;}};},
    selection:()=>[...selectedDrawingIds],notify:notifyDrawings,quarantine:unavailable,
    // While the toolbar drawing lock is on the Eraser treats every drawing as locked.
    drawingsLocked:()=>drawingUtilityState?.drawingsLocked===true,
  });
  /** The groups the copied rows belong to (names and the copied members only); none when the manager book is unreadable. */
  const copiedGroups=(rows:readonly Record<string,unknown>[])=>{try{return clipboardGroups(drawingManager.state().groups,rows.map(row=>String(row.id)));}catch{return [];}};
  // The LV clipboard is process memory only. It keeps the SOURCE rows (the owned Duplicate route re-reads each source's current canonical value).
  // The clipboard is the window's shared LV clipboard (drawing-object-clipboard), so a copy pastes on any chart cell.
  const pasteClipboard={copy:(rows:readonly Record<string,unknown>[])=>{if(rows.length&&rows.length<=128)sharedObjectClipboard.copy(rows,{owner:document,symbol:currentSource.label||null},false,copiedGroups(rows));},paste:(known:(type:string)=>boolean)=>{const held=sharedObjectClipboard.read(),rows=held?held.rows.map(row=>structuredClone(row)):[];return{rows,refused:rows.some(row=>typeof row.type!=='string'||!known(row.type))};}};
  /** A cut, or rows copied on another chart, are inserted from the snapshot as ONE drawing manager transaction (one
   * workspace undo step) at the same time and price, with fresh ids, on top of this chart's stack. A row whose pane this chart cannot
   * resolve refuses the whole paste. */
  const insertSnapshot=(snapshot:ObjectClipboardSnapshot,assert:()=>void):DrawingDuplicateReceipt=>{
    assert();assertDuplicateMutable('Paste');
    const before=document.serialize(),all=(Array.isArray(before.drawings)?before.drawings:[]) as Record<string,unknown>[];
    // A group paste on its own chart copies each source's current value (as the Duplicate route does) where it still exists.
    const current=new Map(all.map(row=>[String(row.id),row])),sources=snapshot.origin.owner===document&&!snapshot.cut?snapshot.rows.map(row=>current.get(String(row.id))??row):snapshot.rows;
    const rows=preparePastedRows(sources,{occupied:new Set([...all.map(row=>String(row.id)),...document.ids()]),makeId:()=>`lv-drawing-${crypto.randomUUID()}`,floor:stackingFloor(all),known:type=>knownTypes.has(type as DrawingTypeKey),utility:drawingUtilityState});
    const resolved=resolvePortableDrawingDocument({...before,drawings:[...all,...rows]},analysisInventory(),knownTypes);
    if(rows.some(row=>resolved.unavailableIds.includes(String(row.id))))throw Error(OBJECT_PASTE_UNAVAILABLE);
    assert();const ids=drawingManager.insert(rows,pastedGroups(snapshot.groups??[],snapshot.rows.map(row=>String(row.id)),rows.map(row=>String(row.id))));
    return Object.freeze({ids:Object.freeze([...ids]),nativeState:'complete' as const,canonicalAccepted:true,workspaceAcknowledged:true,observersComplete:true});
  };
  const pasteOrInsert=(assert:()=>void):DrawingDuplicateReceipt=>{const held=sharedObjectClipboard.read();if(!held)throw Error(OBJECT_PASTE_EMPTY);return pasteRouteFor(held,document,new Set(document.ids()))==='insert'?insertSnapshot(held,assert):pasteRoute.paste(assert);};
  const pasteRoute=createDrawingPasteRoute({clipboard:pasteClipboard,canonical:()=>document.all(),known:type=>knownTypes.has(type as DrawingTypeKey),duplicate:(ids,assert)=>drawingDuplicatePublisher.duplicate(ids,assert)});
  if(rendererHolder.current)drawingCommands=installDrawingCommandRouter(rendererHolder.current,chart,{
    captureErrorOwner:captureDrawingCommandErrorOwner,reportError:reportDrawingCommandError,
    captureOwner:captureDuplicateSource,assertMutable:()=>{if(disposed||analysisUnavailable||analysisPending||marketUpdating||marketQueue.isPending())throw Error('Drawing commands are unavailable while the chart is busy or unavailable.');},
    duplicate:(ids,assert)=>drawingDuplicatePublisher.duplicate(ids,assert),
    copy:(ids,assert)=>pasteRoute.copy(ids,assert),paste:assert=>pasteOrInsert(assert),drawingsLocked:()=>drawingUtilityState?.drawingsLocked===true,
    assertEraseMutable,erase:(id,assert)=>drawingErasePublisher.erase(id,assert),
    history:(direction,assert)=>{assert();assertDuplicateMutable('history');assert();/* An undo with the settings panel open first publishes its held edit. */if(typeof drawingSettings!=='undefined')drawingSettings.end();const registration=drawingWorkspaceRegistration;if(!registration)throw Error('Drawing history requires a bound workspace.');assertDrawingWorkspaceRegistration(registration);const result=registration.host.history(direction,assert);if(result!==undefined)throw Error('Drawing history dispatch must return synchronous void.');},
    historyStatus:()=>{const registration=drawingWorkspaceRegistration;if(!registration)throw Error('Drawing history requires a bound workspace.');assertDrawingWorkspaceRegistration(registration);const result=registration.host.historyStatus();assertDrawingWorkspaceRegistration(registration);return result;},
  });
  const resetPublisher=createNativeDrawingResetPublisher({
    document,
    assertMutable:()=>{if(disposed||analysisUnavailable||analysisPending||marketQueue.isPending())throw Error('Drawing Reset is unavailable while the chart is busy or unavailable.');},
    begin:()=>{if(drawingBatch||nativeDrawingReconciliationHold)throw Error('Drawing Reset cannot nest inside another drawing publication.');drawingBatch++;nativeDrawingReconciliationHold++;let released=false;return{release(){if(released)throw Error('Drawing Reset hold already released.');released=true;nativeDrawingReconciliationHold--;drawingBatch--;drawingDirty=false;}};},
    notify:notifyDrawings,quarantine:unavailable,
  });
  if(rendererHolder.current)nativeDrawingReset=installNativeDrawingReset(rendererHolder.current,chart,{
    document,
    captureOwner(){const source=currentSource,input=currentBars,style=requestedStyle;return()=>{if(disposed||currentSource!==source||currentBars!==input||requestedStyle!==style)throw Error('Drawing Reset source changed.');};},
    assertMutable:()=>{if(disposed||analysisUnavailable||analysisPending||marketQueue.isPending())throw Error('Drawing Reset is unavailable while the chart is busy or unavailable.');},
    publish:batch=>resetPublisher.publish(batch),unavailable,duplicatePopup:drawingCommands?.popupPort,
    rendererRowToSource:(row:Record<string,unknown>)=>typeof derivedDrawings!=='undefined'?derivedDrawings.toSourceRow(row):row,
  });
  const templateBatches=createDrawingTemplateBatches({
    captureSingleOwner:()=>{const source=currentSource,input=currentBars,style=requestedStyle,selection=[...selectedDrawingIds];return(checkSelection=true)=>{
      if(disposed||currentSource!==source||currentBars!==input||requestedStyle!==style||checkSelection&&JSON.stringify(selectedDrawingIds)!==JSON.stringify(selection))throw Error('Drawing edit chart, source or ordered selection changed.');
    };},
    readEditContext:()=>({bars:currentBars,coordinates:drawingCoordinateContext(),intervalVisibilityAvailable:!!rendererDrawingPort}),
    captureOwner:ids=>{const source=currentSource,input=currentBars,style=requestedStyle,selection=[...ids];if(JSON.stringify(selection)!==JSON.stringify(selectedDrawingIds))throw Error('Template targets must match the current ordered selection.');return(checkSelection=true)=>{
      if(disposed||currentSource!==source||currentBars!==input||requestedStyle!==style||checkSelection&&JSON.stringify(selectedDrawingIds)!==JSON.stringify(selection))throw Error('Drawing template chart, source or ordered selection changed.');
    };},
    assertMutable:()=>{if(disposed||analysisUnavailable||analysisPending||marketQueue.isPending())throw Error('Drawing editing is unavailable while the chart is busy or unavailable.');},
    readDocument:()=>document.serialize(),captureNative:ids=>captureNativeDrawingLease(chart.drawings,ids),prepareEdit:(expected,next)=>document.prepareOwnedEditBatch(expected,next),
    begin:()=>{if(drawingBatch||nativeDrawingReconciliationHold)throw Error('Drawing template cannot nest inside another drawing publication.');drawingBatch++;nativeDrawingReconciliationHold++;},
    end:publish=>{nativeDrawingReconciliationHold--;drawingBatch--;const dirty=drawingDirty;if(!drawingBatch)drawingDirty=false;if(publish&&dirty)notifyDrawings();},
    update:rows=>{chart.drawings.updateMany(rows);drawingDirty=true;},
    quarantine:unavailable,
  });
  let managerNativeTouched=false;
  const drawingManager=createDrawingManager({read:()=>document.serialize(),write:next=>{
    const previous=document.serialize(),withoutManager=(value:Record<string,unknown>)=>{const copy={...value};delete copy.lvDrawingManager;return copy;};
    if(JSON.stringify(withoutManager(previous))===JSON.stringify(withoutManager(next)))document.stageManagerMetadata(previous,next);else document.load(next);
  },known:type=>knownTypes.has(type as DrawingTypeKey),templateBatches,
    update:rows=>{managerNativeTouched=true;chart.drawings.updateMany(rows);},insert:next=>{managerNativeTouched=true;restore(next);},remove:ids=>{managerNativeTouched=true;chart.drawings.removeMany(ids.filter(id=>chart.drawings.all().some(row=>row.id===id)));},select:ids=>chart.drawings.select(ids),front:id=>{managerNativeTouched=true;chart.drawings.bringToFront(id);},back:id=>{managerNativeTouched=true;chart.drawings.sendToBack(id);},changed:notifyDrawings,
    transaction:<T,>(operation:()=>T):T=>{const previous=document.serialize(),priorTouched=managerNativeTouched,source=currentSource,input=currentBars,style=requestedStyle;managerNativeTouched=false;drawingBatch++;let accepted=false;
      try{const result=document.atomic(()=>{try{return operation();}catch(error){if(managerNativeTouched)try{recoverNativeDrawingDocument(previous);}catch(recovery){unavailable('Drawing manager recovery failed. Reopen the chart.');throw new AggregateError([error,recovery],'Drawing manager recovery failed');}throw error;}});accepted=true;return result;}
      finally{managerNativeTouched=priorTouched;drawingBatch--;const dirty=drawingDirty;if(!drawingBatch)drawingDirty=false;if(accepted&&dirty)try{notifyDrawings();}catch(cause){const error=new DrawingManagerPublicationError([cause]);if(!disposed&&currentSource===source&&currentBars===input&&requestedStyle===style)unavailable(error.message);throw error;}}
    }});
  const controller = {
    contextMenu:{capture:(request:ChartContextCaptureRequest):ChartMenuSnapshot=>{if(!contextMenus)throw Error('Native context capture is unavailable');return contextMenus.capture(request);},isCurrent:(snapshot:ChartMenuSnapshot):boolean=>contextMenus?.isCurrent(snapshot)??false,handoff:(snapshot:ChartMenuSnapshot):ChartMenuActionLease=>{if(!contextMenus)throw Error('Context action handoff unavailable');return contextMenus.handoff(snapshot);},retire:()=>contextMenus?.retire()},
    priceScale:priceScaleFacade(()=>priceScalePort),
    /** The time axis right-click menu (Reset time scale, Timezone, Session breaks, label formats); root binds its host. */
    timeScale:timeScaleFacade(()=>timeScalePort),
    /** The pinned native renderer object (pane buttons, LV-VELA-TIME-FORMAT-1). Null on a probe without one. */
    nativeRenderer:():object|null=>rendererHolder.current,
    getAnalysisPaneInventory:analysisInventory,
    captureDrawingManagerOwner,
    bindDrawingWorkspaceHost,
    isDrawingChromeTarget,
    onDrawingCommandError:(listener:(message:string)=>void)=>{if(disposed||typeof listener!=='function')throw Error('Drawing command listener is unavailable.');drawingCommandErrorSubscribers.add(listener);return()=>{drawingCommandErrorSubscribers.delete(listener);};},
    duplicateDrawings:(ids:readonly string[])=>{if(!drawingCommands)throw Error('Drawing Duplicate router is unavailable.');return drawingCommands.duplicate(ids);},
    copyDrawings:(ids:readonly string[])=>{if(!drawingCommands)throw Error('Drawing commands are unavailable');drawingCommands.copy(ids);},
    pasteDrawings:()=>{if(!drawingCommands)throw Error('Drawing commands are unavailable');return drawingCommands.paste();},
    /** Cut: copies the drawings to the shared clipboard, then removes them as one drawing manager step.
     * Refused while Lock all drawings is on, as the native Delete key is. */
    cutDrawings:(ids:readonly string[])=>{if(drawingUtilityState?.drawingsLocked===true)throw Error('Drawings are locked. Turn off Lock all drawings to cut them.');assertDuplicateMutable('Cut');const byId=new Map(document.all().map(row=>[String(row.id),row as unknown as Record<string,unknown>]));const rows=ids.map(id=>{const row=byId.get(id);if(!row)throw Error('A selected drawing no longer exists.');return structuredClone(row);});sharedObjectClipboard.copy(rows,{owner:document,symbol:currentSource.label||null},true,copiedGroups(rows));drawingManager.remove([...ids]);},
    /** How many drawings the shared clipboard holds (0: Paste has nothing to paste). */
    clipboardSize:()=>sharedObjectClipboard.size(),
    bulkPropertyBar,
    beginDrawingEraseGesture:(assertPointerOwner:()=>void)=>{if(!drawingCommands)throw Error('Eraser router is unavailable.');return drawingCommands.beginEraseGesture(assertPointerOwner);},
    waitForAnalysisPlacement:()=>waitPlacement(),
    waitForAnalysisCalculations:()=>indicators.waitForVwap(),
    getExecutionIdentity:()=>currentExecutionIdentity,
    setExecutionIdentity:(identity:string)=>{if(identity===currentExecutionIdentity)return;if(typeof retireSessionPaneRefresh==='function')retireSessionPaneRefresh();retireStatisticsSource();retireVwapSource();if(typeof identity!=='string'||!identity||identity.length>4096)throw Error('Chart execution identity is invalid.');currentExecutionIdentity=identity;indicators.recompute();},
    captureVwapPrefix:(expected:{bars:readonly Bar[];source:ChartSourceContext;style:string},executionIdentity:string)=>{const assert=()=>{if(!controller.isInputCurrent(expected)||currentExecutionIdentity!==executionIdentity)throw Error('VWAP alert input or execution changed.');};assert();if(!vwapPrefixSource)throw Error('VWAP prefix source is not initialized.');const prefix=vwapPrefixSource.capture();assert();prefix.assertCurrent();return prefix;},
    prepareAnalysisSnapshot:(request:AnalysisRestoreRequest)=>prepareAnalysis(request),
    prepareConfigurationEdit:(request:ConfigurationEditRequest)=>prepareConfiguration(request),
    suspendTree:(request:{expected:HistoricalFrameCaptureRequest['expected'];scripts:AnalysisRestoreRequest['scripts']})=>suspendTree(request),
    dispose:()=>disposeChart(),
    captureHistoricalFrame:(request:HistoricalFrameCaptureRequest)=>{if(!controller.isInputCurrent(request.expected))throw Error('Chart input changed or is pending before frame capture');if(!rendererFrames)throw Error('Pinned historical frame capture is unavailable');indicators.assertVwapReady();return rendererFrames.captureHistorical(analysisInventory(),{source:currentSource,style:requestedStyle,calculationFingerprints:request.calculationFingerprints},chart.panes.list().map(({id,order,collapsed,maximized})=>({id,order,collapsed,maximized})));},
    getAnalysisUnavailable:()=>analysisUnavailable,
    reportAnalysisPublicationFailure:(error:AnalysisPublicationError)=>{if(!disposed)unavailable(error.message);},
    onAvailabilityChanged:(callback:(message:string)=>void)=>{availabilitySubscribers.add(callback);return()=>{availabilitySubscribers.delete(callback);};},
    // Ownership survives quarantine so accepted edits can report their failure.
    // This check grants no permission to mutate. Actions still require isInputCurrent.
    /** The exact array last written (a live snapshot owns the same input as its predecessor, see isInputOwned). */
    isInputExact:(input:{bars:readonly Bar[];source:ChartSourceContext;style:string}):boolean=>controller.isInputOwned(input)&&(exactInput===input.bars||!isLiveInputIdentity(currentSource.inputIdentity)),
    /** Called after each market write reaches the renderer (incremental live growth included). */
    onMarketApplied:(callback:()=>void)=>{marketAppliedSubscribers.add(callback);return()=>{marketAppliedSubscribers.delete(callback);};},
    isInputOwned:(input:{bars:readonly Bar[];source:ChartSourceContext;style:string}):boolean=>!disposed&&sameChartSourceBasis(currentSource,input.source)&&currentSource.inputIdentity===barInputIdentity(input.bars)&&requestedStyle===input.style,
    isInputCurrent:(input:{bars:readonly Bar[];source:ChartSourceContext;style:string}):boolean=>!marketQueue.isPending()&&!analysisPending&&!analysisUnavailable&&controller.isInputOwned(input),
    chart,
    indicators,
    scripts,
    comparisons,
    drawingManager,
    drawingPreferences,
    getSourceBars:():Bar[]=>structuredClone(currentBars),
    getSourceContext:():ChartSourceContext=>({...currentSource}),
    /** The loaded workspace datasets a newly placed Bars pattern binds to (null: leave it unbound). */
    setBarsPatternDatasets:(datasets:readonly BarDataset[]|null)=>{barsPatternDatasets=datasets;},
    getViewport:()=>{const range=chart.getVisibleRange();return range?{from:range.from/1000,to:range.to/1000}:null;},
    /** DWUTIL state port. The App pushes the workspace block in; toggles never write history. */
    drawingUtility:{
     apply:(value:DrawingUtility)=>{const hidIndicators=indicatorHideOverlay(drawingUtilityState);drawingUtilityState=value;drawingProjection.refresh();
      // Hide indicators is a render overlay; stored indicator settings are never written, so only the native output is re-rendered.
      if(!disposed&&indicatorHideOverlay(value)!==hidIndicators){try{indicators.recompute();}catch(error){diagnostics.push({code:'INDICATOR_HIDE_UNAVAILABLE',feature:'indicator hide overlay',severity:'unavailable',message:String(error)});}}},
     onChangeFromChart:(fn:(value:DrawingUtility)=>void)=>{drawingUtilitySubscribers.add(fn);return()=>{drawingUtilitySubscribers.delete(fn);};},
     zoomCommit:(from:number,to:number)=>zoom.commit(from,to),zoomOut:()=>zoom.zoomOut(),canZoomOut:()=>zoom.canZoomOut(),
     /** key = symbol|resolution|layoutId; a change clears the stack. */
     observeZoomContext:(key:string)=>zoom.observeContext(key),
     copySelection:()=>{if(selectedDrawingIds.length)controller.copyDrawings(selectedDrawingIds);},
     paste:()=>controller.pasteDrawings(),
     cutSelection:():number=>{if(!selectedDrawingIds.length)return 0;const ids=[...selectedDrawingIds];controller.cutDrawings(ids);return ids.length;},
    },
    setViewport:(range:{from:number;to:number})=>{validateViewport(range);/* typeof: extracted-block harnesses run without the deferral. */if(typeof viewportDeferral==='undefined')chart.setVisibleRange({from:range.from*1000,to:range.to*1000});else viewportDeferral.set(range);},
    onViewportChanged:(fn:()=>void)=>chart.on('viewport:changed',fn),
    onNavigationCommand:(fn:()=>void)=>{navigationSubscribers.add(fn);return()=>navigationSubscribers.delete(fn);},
    onCrosshair:(fn:(event:ReturnType<typeof normalizedCrosshair>)=>void)=>chart.renderer.onCrosshairMove(event=>fn(normalizedCrosshair(event))),
    /** Actual accepted main-series scalars. No history clone or calculation is initiated by capture/read. */
    captureSeriesReadout:():SeriesReadout=>{
     const unavailable=()=>({state:'unavailable' as const,message:'Chart values are waiting for the current accepted source.'});
     try{
      if(disposed||marketUpdating||marketQueue.isPending()||analysisPending||analysisUnavailable||seriesReadoutRetiredBasis?.series===statsSourceEpoch&&seriesReadoutRetiredBasis.input===vwapSourceEpoch)return unavailable();
      if(seriesReadoutLease){try{seriesReadoutLease.lease.assertCurrent();return seriesReadoutLease.view;}catch{seriesReadoutLease=null;}}
      if(seriesReadoutRetiredBasis?.series===statsSourceEpoch&&seriesReadoutRetiredBasis.input===vwapSourceEpoch)return unavailable();
      const source=currentSource,style=requestedStyle,epoch=statsSourceEpoch,inputEpoch=vwapSourceEpoch,execution=currentExecutionIdentity;
      const sourceKeys=['datasetId','revision','fixture','label','resolution','basisIdentity','inputIdentity','sessionOverride'] as const,sourceFacts=sourceKeys.map(key=>{const descriptor=Object.getOwnPropertyDescriptor(source,key);if(descriptor&&!Object.hasOwn(descriptor,'value'))throw Error('Series source requires own data fields.');const value=descriptor?.value;if(value!==undefined&&typeof value!=='string'&&!(key==='fixture'&&typeof value==='boolean'))throw Error('Series source metadata is invalid.');return value;}),resolution=typeof sourceFacts[4]==='string'?sourceFacts[4]:'';
      const core=seriesOwn(chart,'orchestrator'),native=seriesOwn(core,'bars'),nativeRaw=seriesOwn(core,'rawBars'),renderer=seriesOwn(core,'renderer'),shown=seriesOwn(renderer,'bars');
      if(!Array.isArray(native)||!Array.isArray(nativeRaw)||!Array.isArray(shown)||native.length>100000||shown.length!==native.length||!currentBars.length)return unavailable();
      const refs={raw:new WeakRef(currentBars),core:new WeakRef(core as object),native:new WeakRef(native),nativeRaw:new WeakRef(nativeRaw),renderer:new WeakRef(renderer as object),shown:new WeakRef(shown),derived:derivedMemo?new WeakRef(derivedMemo):null};
      const length=native.length,rawLength=currentBars.length,transform=seriesOwn(core,'barTransform'),nativeTail=length?seriesScalarBar(seriesOwn(native,String(length-1)),seriesNumber(seriesOwn(native,String(length-1)),'time')):null;
      const derived=isDerivedStyle(style);if(derived&&(!derivedMemo||derivedMemo.raw!==currentBars||!derivedMemo.result.ok||!derivedMemo.axis))return unavailable();
      const nativeCount=derived?derivedMemo!.axis!.projectionFrom:length;
      if(!derived&&(nativeRaw.length!==currentBars.length||native.length!==currentBars.length))return unavailable();
      const zone=controller.getChartOptions().timezone;if(!seriesDayReader||seriesDayReader.zone!==zone)seriesDayReader={zone,read:createSeriesDayCloseReader(zone)};const dayClose=seriesDayReader.read;let alive=true;
      const assertCurrent=()=>{try{
       if(alive&&!disposed&&!analysisUnavailable&&(marketUpdating||marketQueue.isPending()||analysisPending))throw new SeriesReadoutPendingError('The main series is updating.');
       if(!alive||disposed||analysisUnavailable||currentSource!==source||requestedStyle!==style||statsSourceEpoch!==epoch||vwapSourceEpoch!==inputEpoch||currentExecutionIdentity!==execution||currentBars!==refs.raw.deref()||currentBars.length!==rawLength)throw Error('The main series source changed.');
       for(let index=0;index<sourceKeys.length;index++){const descriptor=Object.getOwnPropertyDescriptor(source,sourceKeys[index]);if(descriptor&&!Object.hasOwn(descriptor,'value')||!Object.is(descriptor?.value,sourceFacts[index]))throw Error('The main-series source facts changed.');}
       const actualCore=refs.core.deref(),actual=refs.native.deref(),actualRenderer=refs.renderer.deref(),actualShown=refs.shown.deref();
       if(!actualCore||!actual||!actualRenderer||!actualShown||seriesOwn(chart,'orchestrator')!==actualCore||seriesOwn(actualCore,'bars')!==actual||seriesOwn(actualCore,'rawBars')!==refs.nativeRaw.deref()||seriesOwn(actualCore,'barTransform')!==transform||seriesOwn(actualCore,'renderer')!==actualRenderer||seriesOwn(actualRenderer,'bars')!==actualShown||actual.length!==length||actualShown.length!==length||controller.getChartOptions().timezone!==zone)throw Error('The native main series was replaced.');
       if(nativeTail){const now=seriesScalarBar(seriesOwn(actual,String(length-1)),seriesNumber(seriesOwn(actual,String(length-1)),'time'));for(const key of ['time','open','high','low','close','volume'] as const)if(!Object.is(now[key],nativeTail[key]))throw Error('The native main-series frame changed.');}
       if(derived&&(derivedMemo!==refs.derived?.deref()||derivedMemo?.raw!==currentBars||!derivedMemo.result.ok||!derivedMemo.axis||derivedMemo.axis.projectionFrom!==nativeCount))throw Error('The logical main series changed.');
      }catch(error){if(!(error instanceof SeriesReadoutPendingError)){alive=false;if(statsSourceEpoch===epoch&&vwapSourceEpoch===inputEpoch)seriesReadoutRetiredBasis={series:epoch,input:inputEpoch};}throw error;}};
      const readPosition=(address:SeriesReadoutPosition)=>{
       // Query shape is validated before touching an origin; a bad address does not retire a valid view.
       const kind=seriesOwn(address,'kind');if(kind!=='latest'&&kind!=='axis-time'&&kind!=='unavailable')throw new SeriesReadoutQueryError('No main-series cursor address is available.');
       const fields=Reflect.ownKeys(address);if(fields.length!==(kind==='axis-time'?2:1)||fields.some(key=>key!=='kind'&&key!=='time'))throw new SeriesReadoutQueryError('The cursor address is invalid.');
       if(kind==='unavailable')throw new SeriesReadoutQueryError('There is no observed bar at this cursor.');
       const time=kind==='axis-time'?seriesOwn(address,'time'):null;if(time!==null&&(typeof time!=='number'||!Number.isFinite(time)))throw new SeriesReadoutQueryError('The cursor time is invalid.');
       assertCurrent();const actual=refs.native.deref()!,displayed=refs.shown.deref()!,raw=refs.raw.deref()!;let index:number;
       if(kind==='latest')index=nativeCount-1;
       else if(derived){const axis=derivedMemo!.axis!,first=axis.feed[0]?.time??NaN,position=((time as number)-first)/axis.syntheticStep;index=Number.isSafeInteger(position)?position:-1;}
       else index=seriesFloor(rawLength,time as number,i=>seriesNumber(seriesOwn(raw,String(i)),'time'));
       if(index<0||index>=nativeCount)throw new SeriesReadoutQueryError('This position has no confirmed main-series bar.');
       const rowAt=(position:number)=>{
        assertCurrent();const nativeRow=seriesOwn(actual,String(position)),shownRow=seriesOwn(displayed,String(position)),axisTime=seriesNumber(nativeRow,'time')/1000;
        const eventTime=derived?derivedMemo!.axis!.sourceTimes[position]:seriesNumber(seriesOwn(raw,String(position)),'time');
        const expected=derived?derivedMemo!.axis!.feed[position]:style==='heikinashi'?null:seriesOwn(raw,String(position));
        if(!Number.isFinite(eventTime)||derived&&axisTime!==seriesNumber(expected,'time')||!derived&&axisTime!==eventTime)throw Error('The main-series time mapping changed.');
        const inputExpected=derived?derivedMemo!.axis!.feed[position]:seriesOwn(raw,String(position)),nativeInput=seriesOwn(refs.nativeRaw.deref()!,String(position)),inputValue=seriesScalarBar(inputExpected,eventTime),nativeInputValue=seriesScalarBar(nativeInput,eventTime);
        if(seriesNumber(nativeInput,'time')/1000!==axisTime)throw Error('The native raw main-series position changed.');
        for(const key of ['open','high','low','close','volume'] as const)if(!Object.is(inputValue[key],nativeInputValue[key]))throw Error('The native raw main-series units changed.');
        const value=seriesScalarBar(nativeRow,eventTime),painted=seriesScalarBar(shownRow,eventTime);
        if(seriesNumber(shownRow,'time')/1000!==axisTime)throw Error('The displayed main-series position changed.');
        const expectedValue=expected?seriesScalarBar(expected,eventTime):null;
        for(const key of ['open','high','low','close','volume'] as const){if(!Object.is(value[key],painted[key]))throw Error('The displayed main-series units changed.');if(expectedValue&&!Object.is(value[key],expectedValue[key]))throw Error('The main series no longer matches its accepted input.');}
        assertCurrent();return{value,axisTime};
       };
       try{const selected=rowAt(index),previous=index>0?rowAt(index-1).value:null,previousSessionClose=dayClose(nativeCount,index,resolution,i=>{const value=rowAt(i).value;return{time:value.time,close:value.close};});assertCurrent();return Object.freeze({eventTime:selected.value.time,axisTime:selected.axisTime,logicalIndex:index,bar:selected.value,previousBar:previous,previousSessionClose});}catch(error){if(!(error instanceof SeriesReadoutQueryError)&&!(error instanceof SeriesReadoutPendingError)){alive=false;if(statsSourceEpoch===epoch&&vwapSourceEpoch===inputEpoch)seriesReadoutRetiredBasis={series:epoch,input:inputEpoch};}throw error;}
      };
      assertCurrent();const lease=Object.freeze({state:'ready' as const,assertCurrent,readPosition}),view=weakMainSeriesReadout(lease);seriesReadoutLease={lease,view};return view;
     }catch{return unavailable();}
    },
    getDataWindow:()=>({pending:marketUpdating||marketQueue.isPending()||analysisPending>0||!!analysisUnavailable,source:{...currentSource},series:{count:currentBars.length,firstTime:currentBars[0]?.time??null,lastTime:currentBars.at(-1)?.time??null,style:requestedStyle},readout:chart.renderer.dataWindowReadout(),crosshair:lastCrosshair?{...lastCrosshair,values:new Map(lastCrosshair.values)}:null,...(()=>{const hovered=lastCrosshair?.ohlc?.time??null,derived=derivedFor(currentBars);if(!derived)return{standard:inspectedBar(currentBars,hovered),displayed:inspectedBar(calculationBars(currentBars,requestedStyle),hovered)};
      /* The crosshair reports the synthetic axis time; the data window shows the display bar at that logical index with its original source event time. */
      const axis=derived.axis,index=!axis?-1:hovered===null?axis.bars.length-1:axis.feed.findIndex(row=>row.time===hovered),sourceTime=axis&&index>=0?derivedAxisSourceTime(axis,index):null,row=axis&&index>=0?axis.bars[index]:null;
      return{standard:inspectedBar(currentBars,sourceTime),displayed:{index,bar:row&&sourceTime!==null?{time:sourceTime,open:row.open,high:row.high,low:row.low,close:row.close,volume:row.volume}:null,hovered:hovered!==null&&index>=0}};})()}),
    /** `overlay` paints over the chart pixels before the caption (trading.visibilityOnScreenshotTitle: the
     *  virtual order, position and execution layer). It gets the canvas, the export scale and the price pane in container px. */
    exportChartImage:(options?:{overlay?:ChartExportOverlay;footer?:ChartExportFooter})=>{try{if(typeof assertSessionPaneRefresh==='function')assertSessionPaneRefresh();const native=chart.renderer.screenshotCanvas();if(!native)return{ok:false as const,diagnostic:{code:'IMAGE_EXPORT_UNAVAILABLE',feature:'chart export',severity:'unavailable' as const,message:'The renderer has no usable chart export surface.'}};const ratio=window.devicePixelRatio||1,overlay=options?.overlay,paint=overlay?(ctx:CanvasRenderingContext2D)=>{const box=container.getBoundingClientRect(),projection=pricePaneProjectionOf(rendererHolder.current as unknown as Parameters<typeof pricePaneProjectionOf>[0],container);if(!projection||!(box.width>0&&box.height>0&&projection.width>0&&projection.height>0))throw Error('The chart geometry is updating. Try the snapshot again after it finishes.');const coords=(rendererHolder.current as unknown as {coords?:TimeAxisCoords}|null)?.coords,timeAxis=TIME_AXIS_STYLES.includes(requestedStyle);overlay(ctx,{scale:native.width/box.width,viewport:{left:box.left,top:box.top,width:box.width,height:box.height},plot:{left:projection.left-box.left,top:projection.top-box.top,width:projection.width,height:projection.height},priceToY:price=>projection.priceToY(price)-box.top,timeToX:seconds=>{const x=timeToClientX(coords,box.left,seconds,timeAxis);return x===null?null:x-box.left;}});}:undefined;const image=composeChartExport(native,lastAppearance,currentSource,()=>window.document.createElement('canvas'),ratio,paint,options?.footer);if(typeof assertSessionPaneRefresh==='function')assertSessionPaneRefresh();return{ok:true as const,dataUrl:chartExportPngDataUrl(image),width:image.width,height:image.height,policies:['User-requested chart export only; no diagnostic capture is saved.','Native crosshair is excluded; native legends are rasterized on a best-effort basis.','Export includes the original OpenCandle background and a synthetic/local-import provenance caption.']};}catch(error){return{ok:false as const,diagnostic:{code:'IMAGE_EXPORT_UNAVAILABLE',feature:'chart export',severity:'unavailable' as const,message:String(error)}};}},
    ready: () => chart.ready(),
    setBars:(next:readonly Bar[],context?:ChartSourceContext)=>{retireStatisticsSource();retireVwapSource();const epoch=vwapSourceEpoch,source=sourceContextForInput(context??currentSource,next),live=typeof isLiveInputIdentity==='function'&&isLiveInputIdentity(source.inputIdentity);/* Every live input waits for a hold, not only growth of the shown subscription. A cached snapshot's REST refresh (a new revision) or a reopened feed refused here showed "Chart unavailable: Error: The chart input is held by an owned workspace transition." during a background save; it is now written once the hold ends and the last good bars stay meanwhile. */return restoreRejectedVwapInput((typeof viewportDeferral==='undefined'?<T,>(write:Promise<T>)=>write:viewportDeferral.track)(marketQueue.set(next,source,undefined,()=>{exactInput=next;},{deferWhileHeld:live})),epoch);},
    setBarsWithRollback:(next:readonly Bar[],context?:ChartSourceContext)=>{retireStatisticsSource();retireVwapSource();const epoch=vwapSourceEpoch,transaction=marketQueue.setWithRollback(next,sourceContextForInput(context??currentSource,next));return{result:restoreRejectedVwapInput((typeof viewportDeferral==='undefined'?<T,>(write:Promise<T>)=>write:viewportDeferral.track)(transaction.result),epoch),rollback:()=>{retireStatisticsSource();retireVwapSource();return restoreRejectedVwapInput(transaction.rollback(),vwapSourceEpoch);}};},
    setStyle: (style: string) => {
      if(typeof retireSessionPaneRefresh==='function')retireSessionPaneRefresh();
      retireStatisticsSource();retireVwapSource();
      const available = chartTypes().some(type=>type.id===style) || ['candles','bars','line','area','baseline','heikinashi'].includes(style);
      if (!available){indicators.recompute();return { ok:false as const, diagnostic:{code:'CHART_TYPE_UNAVAILABLE',feature:style,message:'This chart renderer has no verified implementation for this chart type.',severity:'unavailable' as const} };}
      if(style==='volumecandles'){const volume=requireVolume(currentBars,style);if(!volume.ok){indicators.recompute();return volume;}}
      // An unavailable chart is not restyled (every step would throw, and so would the rollback: the old
      // "rollback was incomplete" error). A derived type that builds nothing from these bars is refused before any native
      // change and the prior style stays drawn (commitChartStyle check).
      if(analysisUnavailable){return {ok:false as const,diagnostic:{code:'CHART_UNAVAILABLE',feature:style,message:analysisUnavailable,severity:'unavailable' as const}};}
      try{commitChartStyle(style,{read:()=>requestedStyle,write:value=>{retireStatisticsSource();retireVwapSource();requestedStyle=value;},check:()=>{/* typeof: extracted-block harnesses run setStyle without the derived helpers. */const refusal=typeof derivedDrawRefusal==='function'?derivedDrawRefusal():null;if(refusal)throw refusal;},apply:applyRequestedStyle,recompute:()=>{indicators.recompute();},invalidate:()=>{scripts.invalidateResults();}});}
      catch(error){if(typeof DerivedDrawRefusal==='function'&&error instanceof DerivedDrawRefusal)return {ok:false as const,diagnostic:error.diagnostic};throw error;}
      return {ok:true as const};
    },
    setRange: (range:RangePreset) => applyRange(range,true),
    /** Bars the plot can show at its 0.5 px spacing floor (price scale margin allowed for). */
    maxVisibleBars:()=>{const width=container.clientWidth;return width>0?Math.floor(Math.max(0,width-72)*2):null;},
    chartTypes:CHART_TYPES,
    getStyle:()=>requestedStyle,
    // A derived type already maps its confirmed rows to fresh plain rows; only the shared standard-style cache is cloned.
    getCalculationBars:():Bar[]=>/* typeof: extracted-line harnesses lack the import. */typeof isDerivedStyle==='function'&&isDerivedStyle(requestedStyle)?calculationBars(currentBars,requestedStyle):structuredClone(calculationBars(currentBars,requestedStyle)),
    /** Calculation-only receipt: a hold permits reading a fully accepted frame, never an early paint/readout. */
    // One switch asked for the same receipt 3-4 times (Runner memo, layout save, tree hold), each a full
    // pass over up to 10,000 rows. A receipt proven for this accepted frame and derived memo is handed out again while it is
    // still current (its own isCurrent: the same owner, frame and memo checks); any change retires it and a fresh proof runs.
    captureScriptCalculationInput:(()=>{const proven=new WeakMap<object,{derived:object;receipt:Readonly<{bars:readonly Bar[];isCurrent:()=>boolean}>}>();return(expected:{input:{bars:readonly Bar[];source:ChartSourceContext;style:string};execution:string}):Readonly<{bars:readonly Bar[];isCurrent:()=>boolean}>|null=>{
     try{
      if(disposed||analysisUnavailable||marketUpdating||!isDerivedStyle(requestedStyle)||!sameChartSourceBasis(currentSource,expected.input.source,true)||!controller.isInputExact(expected.input)||expected.execution!==currentExecutionIdentity)return null;
      const source=currentSource,input=currentBars,style=requestedStyle,execution=currentExecutionIdentity,epoch=vwapSourceEpoch,derived=derivedMemo;
      publishDerivedPayload(currentBars,{kind:'renew'});const accepted=acceptedScriptMarket;
      if(!accepted||accepted.source!==source||accepted.bars!==input||accepted.style!==style||accepted.memo!==derived||accepted.execution!==execution||accepted.epoch!==epoch||!accepted.frame.isCurrent())return null;
      if(!derived||derived.raw!==input||derived.style!==style||!derived.result.ok||!derived.axis)return null;{const hit=proven.get(accepted);if(hit&&hit.derived===derived&&hit.receipt.isCurrent())return hit.receipt;}/* No row cap here. Over 5,000 confirmed rows the receipt still settles, so the runtime reports the visible execution limit (as standard styles do) and tree holds are not refused forever. */
      const axis=derived.axis,feed=axis.feed,confirmed=derived.result.value.confirmed,frame=captureScriptPresentationInputFrame(chart as unknown as object);
      if(!frame||frame.rows.length!==feed.length)return null;let alive=true;
      const sourceKeys=['datasetId','revision','fixture','label','resolution','basisIdentity','inputIdentity','sessionOverride'] as const;
      const sourceValues=sourceKeys.map(key=>{const field=Object.getOwnPropertyDescriptor(source,key);if(field&&!Object.hasOwn(field,'value'))throw Error('Script calculation source must be data.');return field?.value;});
      const current=()=>{if(!alive)return false;try{const ok=!disposed&&!analysisUnavailable&&!marketUpdating&&currentSource===source&&currentBars===input&&requestedStyle===style&&currentExecutionIdentity===execution&&vwapSourceEpoch===epoch&&acceptedScriptMarket===accepted&&accepted.frame.isCurrent()&&derivedMemo===derived&&derived.axis===axis&&axis.feed===feed&&derived.result.ok&&derived.result.value.confirmed===confirmed&&frame.isCurrent()&&sourceKeys.every((key,index)=>{const field=Object.getOwnPropertyDescriptor(source,key);return(!field||Object.hasOwn(field,'value'))&&Object.is(field?.value,sourceValues[index]);});if(!ok)alive=false;return ok;}catch{alive=false;return false;}};
      // Rows are own data descriptors (no accessor runs while they are read), so the owner is checked every
      // 256 rows and after each pass instead of around every field: 24 checks per row made a 10,000-bar range
      // chart a 600-800 ms task, several times per switch. Any change still fails the final checks, and retires the receipt.
      const row=(rows:readonly unknown[],index:number)=>{if((index&255)===0&&!current())throw Error('Script calculation owner changed.');const field=Object.getOwnPropertyDescriptor(rows,String(index));if(!field||!Object.hasOwn(field,'value'))throw Error('Script calculation frame must be dense data.');return field.value as unknown;};
      const same=(a:unknown,b:unknown,scale:number)=>{for(const key of ['time','open','high','low','close','volume'] as const)if(!Object.is(scriptPresentationNumber(a,key),scriptPresentationNumber(b,key,key==='time'?scale:1)))return false;return true;};
      // Full native feed, including projection geometry, proves completion. Projection is never returned as input.
      // The accepted frame was proven row by row against this memo when it was minted (scriptMarketFrameMatches); the same live
      // native array (constant-space isCurrent: identity, length, tail) is not walked again.
      if(frame.rows!==accepted.frame.rows)for(let index=0;index<feed.length;index++)if(!same(row(feed,index),row(frame.rows,index),1000))return null;
      if(!current())return null;const rows=controller.getCalculationBars();if(!current()||rows.length!==confirmed.length)return null;
      for(let index=0;index<rows.length;index++){if(!same(row(rows,index),row(confirmed,index),1))return null;Object.freeze(rows[index]);}
      Object.freeze(rows);if(!current())return null;const receipt=Object.freeze({bars:rows,isCurrent:current});proven.set(accepted,{derived,receipt});return receipt;
     }catch{return null;}
    };})(),

    getDisplayedPriceValues:()=>{
      const config=chart.renderer.getConfig() as {chartTypes?:Record<string,Record<string,unknown>>};
      const source=(config.chartTypes?.[requestedStyle]?.source??'close') as ChartOptions['source'];
      const bars=requestedStyle==='heikinashi'?chartType('heikinashi')!.barTransform!.full(toVelaBars(currentBars)):currentBars;
      return bars.map(bar=>selectedPrice(bar,source));
    },
    chartSettingsSchema,
    getChartSettings:(id:string)=>id==='heikinashi'?heikinAshiSettings():({...settingsDefaults(id),...(chartSettingsSchema(id).sharedAppearance?appearanceTypeSettings(lastAppearance):{}),...((chart.renderer.getConfig() as {chartTypes?:Record<string,Record<string,unknown>>})?.chartTypes?.[id]??{})}),
    getChartSettingsBook:()=>structuredClone(retainedTypeSettings),
    applyChartSettingsBook:(book:ChartSettingsBook)=>{retireStatisticsSource();const checked=validatedSettingsBook(book);const {heikinashi,...rendered}=checked.applicable;
      // Settings that leave the shown derived type with nothing to draw are refused and undone before the
      // renderer is re-fed, so the chart keeps its last good bars instead of going unavailable.
      const typeConfig=(chart.renderer.getConfig() as {chartTypes?:Record<string,unknown>}).chartTypes?.[requestedStyle],priorType=isDerivedStyle(requestedStyle)&&Object.hasOwn(rendered,requestedStyle)?structuredClone(typeConfig??{}):null;
      applyRendererConfig({chartTypes:rendered});
      if(priorType){const refusal=derivedDrawRefusal();if(refusal){applyRendererConfig({chartTypes:{[requestedStyle]:priorType}} as Parameters<typeof applyRendererConfig>[0]);throw refusal;}}
      retainedTypeSettings=checked.retained;heikinAshiBook=heikinashi?{...heikinashi}:null;applyRequestedStyle();return checked;},
    setChartSettings:(id:string,settings:Record<string,unknown>)=>{
      retireStatisticsSource();
      validateTypeSettings(id,settings);if(chartSettingsSchema(id).sharedAppearance){if(!lastAppearance)throw new Error('No current appearance is available');const next=appearanceWithTypeSettings(lastAppearance,settings);controller.applyAppearance(next);return{book:controller.getChartSettingsBook(),appearance:next};}
      const previous=controller.getChartSettingsBook();previous[id]={...(id==='heikinashi'&&!previous[id]?heikinAshiSettings():{}),...previous[id],...settings};controller.applyChartSettingsBook(previous);return{book:controller.getChartSettingsBook(),appearance:null};
    },
    getChartOptions:():ChartOptions=>{
      const config=chart.renderer.getConfig() as {priceScale:{mode:string;log:boolean;invert:boolean};timeScale:{timezone:string};chartTypes:Record<string,Record<string,unknown>>};
      return {source:(config.chartTypes[requestedStyle]?.source??'close') as ChartOptions['source'],scale:config.priceScale.log?'logarithmic':config.priceScale.mode==='percent'?'percent':config.priceScale.mode==='indexed'?'indexed':'linear',invert:config.priceScale.invert,auto:chart.renderer.get('autoScale')!==false,timezone:config.timeScale.timezone};
    },
    applyChartOptions:(options:ChartOptions)=>{
      retireStatisticsSource();
      validateChartOptions(options);const sourceStyles=['line','linemarkers','step','area','baseline','columns'];
      if(sourceStyles.includes(requestedStyle))applyRendererConfig({chartTypes:{[requestedStyle]:{source:options.source},[APPEARANCE_LAYER]:{lvPriceSource:options.source}}});
      applyRendererConfig({priceScale:{mode:options.scale==='percent'?'percent':options.scale==='indexed'?'indexed':'price',log:options.scale==='logarithmic',invert:options.invert},timeScale:{timezone:options.timezone}});
      chart.renderer.set('autoScale',options.auto);if(rendererHolder.current)reconcileManualScales(rendererHolder.current);applyRequestedStyle();return chart.renderer.getConfig();
    },
    /** Gap 9: 'extended' shades pre/post-market bars; 'regular' clears the shading (the input then carries regular hours). */
    setSessionMode:(mode:SessionMode)=>{if(mode!=='regular'&&mode!=='extended')throw new Error('Session mode must be regular or extended.');chartSessionMode=mode;primarySourceSelection.session=mode;refreshSessionZones();notifyPrimarySourceSettled();},
    sessionMode:():SessionMode=>chartSessionMode,
    /** Session breaks: dashed vertical lines at session breaks of intraday US equity charts (hidden on daily and longer). */
    setSessionBreaks:(on:boolean):void=>{if(typeof on!=='boolean')throw new Error('Session breaks must be true or false.');if(on===sessionBreaksOn)return;sessionBreaksOn=on;invalidateAxis();},
    sessionBreaks:():boolean=>sessionBreaksOn,
    /** Scales.symbolLabelsLines second line. 'pricePercent' paints the change percentage under the last price chip. */
    setLastValueMode:(mode:'scale'|'pricePercent'):void=>{if(mode!=='scale'&&mode!=='pricePercent')throw new Error('The last value display must be scale or pricePercent.');if(mode===lastValueMode)return;lastValueMode=mode;invalidateAxis();},
    lastValueMode:():'scale'|'pricePercent'=>lastValueMode,
    /** One collision layout for the price-axis tags. The DOM overlays read the canvas-owned fixed ranges
     * (last price chip, indicator tags) of the last frame and publish their placed tags, which the canvas labels then avoid. Pane-relative px. */
    axisTags:{
      fixed:():[number,number][]=>{const top=pricePaneTop();return top===null||disposed?[]:nativeAxisFixed.map(([a,b])=>[a-top,b-top]);},
      noOverlap:():boolean=>axisLabelPort?.settings().labels.noOverlap??true,
      publish:(owner:string,ranges:readonly (readonly [number,number])[]):void=>{
        if(disposed||typeof owner!=='string'||!owner)return;const clean=Array.isArray(ranges)?ranges.filter(row=>Array.isArray(row)&&row.length===2&&row.every(Number.isFinite)).map(([a,b])=>[Math.min(a,b),Math.max(a,b)] as const):[];
        const before=JSON.stringify(overlayAxisTags.get(owner)??[]);if(clean.length)overlayAxisTags.set(owner,clean);else overlayAxisTags.delete(owner);if(JSON.stringify(clean)!==before)invalidateAxis();
      },
    },
    /** The latest pre-market or post-market price (null: none). Label and line follow the price scale settings. */
    setPrePostPrice:(value:{price:number;phase:'pre'|'post';color:string}|null):void=>{
      const next=value&&Number.isFinite(value.price)&&(value.phase==='pre'||value.phase==='post')&&typeof value.color==='string'?{price:value.price,phase:value.phase,color:value.color}:null;
      if(JSON.stringify(next)===JSON.stringify(prePostPrice))return;prePostPrice=next;invalidateAxis();
    },
    /** The live best bid and ask (null: none). Labels and lines follow the price scale Bid and ask settings. */
    setBidAskPrice:(value:{bid:{price:number;color:string}|null;ask:{price:number;color:string}|null}|null):void=>{
      const mark=(row:{price:number;color:string}|null|undefined)=>row&&Number.isFinite(row.price)&&row.price>0&&typeof row.color==='string'?{price:row.price,color:row.color}:null;
      const bid=mark(value?.bid),ask=mark(value?.ask),next=bid||ask?{bid,ask}:null;
      if(JSON.stringify(next)===JSON.stringify(bidAskPrice))return;bidAskPrice=next;invalidateAxis();
    },
    /** Main series visibility through the renderer's own candleVisible config (bars, price line and chip). */
    setSeriesVisible:(visible:boolean):void=>{if(typeof visible!=='boolean')throw new Error('Series visibility must be true or false.');chart.renderer.set('candleVisible',visible);},
    seriesVisible:():boolean=>{const scene=(rendererHolder.current as unknown as {scene?:{candlesHidden?:unknown}}|null)?.scene;return scene?.candlesHidden!==true;},
    /** Pane tops and heights (CSS px from the chart host top) for the per-pane legend groups. */
    paneGeometry:()=>rendererHolder.current?paneGeometryOf((rendererHolder.current as unknown as {scene?:unknown}).scene):[],
    pan:(fraction:number)=>{if(!Number.isFinite(fraction))throw new Error('Pan fraction must be finite');chart.panBy(fraction);navigationChanged();},
    zoom:(factor:number)=>{if(!Number.isFinite(factor)||factor<=0)throw new Error('Zoom factor must be positive');const range=chart.getVisibleRange();if(!range)return;const middle=(range.from+range.to)/2,half=(range.to-range.from)/(2*factor);chart.setVisibleRange({from:middle-half,to:middle+half});navigationChanged();},
    goToDate:(seconds:number)=>{if(!Number.isFinite(seconds))throw new Error('Date must be finite Unix seconds');const range=chart.getVisibleRange();if(!range)return{ok:false as const,diagnostic:{code:'DATE_NAVIGATION_UNAVAILABLE',feature:'go to date',severity:'unavailable' as const,message:'No visible chart range is available.'}};const target=centeredDateRange(range.from/1000,range.to/1000,seconds);chart.setVisibleRange({from:target.from*1000,to:target.to*1000});navigationChanged();return{ok:true as const,requestedTime:seconds,withinHistory:!!currentBars.length&&seconds>=currentBars[0].time&&seconds<=currentBars.at(-1)!.time,policy:'Center the selected Unix time at the existing visible span. Native pan limits may constrain empty future/past space; no missing history is invented.'};},
    applyAppearance: (settings: AppearanceSettings) => {
      retireStatisticsSource();
      const displayOptions=indicatorDisplayOptionsFromAppearance(settings),previousAppearance=lastAppearance,previousConfig=structuredClone(chart.renderer.getConfig()),previousBackground=container.style.background,previousDiagnostics=diagnostics;
      const mapped=mapAppearance(settings);try{indicatorDisplay?.setOptions(gateIndicatorLabels(displayOptions));lastAppearance=mapped.retainedSettings;
      const gradient=settings['paneProperties.backgroundType']==='gradient';
      container.style.background=gradient?`linear-gradient(to bottom, ${String(settings['paneProperties.backgroundGradientStartColor'])}, ${String(settings['paneProperties.backgroundGradientEndColor'])})`:String(settings['paneProperties.background']);
      const config=mapped.config as Record<string,any>;
      if(gradient)config.layout.background='rgba(0, 0, 0, 0)';
      config.chartTypes={[APPEARANCE_LAYER]:settings};config.priceScale.currentPriceLine=false;
      diagnostics=[];
      if(appearanceBoolean(settings['mainSeriesProperties.candleStyle.barColorsOnPrevClose']))diagnostics.push({code:'REFERENCE_EQUAL_CLOSE_UNRESOLVED',feature:'previous-close coloring',message:'OpenCandle uses the up color for equality and compares the first bar with its own open. These reference boundary rules are unresolved.',severity:'warning'});
      if(appearanceBoolean(settings['mainSeriesProperties.highLowAvgPrice.highLowPriceLinesVisible']))diagnostics.push({code:'REFERENCE_HIGH_LOW_SCOPE_UNRESOLVED',feature:'high/low price lines',message:'OpenCandle displays extremes of visible bars. Reference range scope remains unresolved.',severity:'warning'});
      applyRendererConfig(config);applyRequestedStyle();return {...mapped,diagnostics};
      }catch(error){lastAppearance=previousAppearance;diagnostics=previousDiagnostics;container.style.background=previousBackground;try{attemptEveryCleanup([()=>indicatorDisplay?.setOptions(gateIndicatorLabels(indicatorDisplayOptionsFromAppearance(previousAppearance??{}))),()=>applyRendererConfig(previousConfig)],'Chart appearance recovery failed');}catch(recovery){unavailable('Chart appearance recovery failed. Reopen the chart.');throw new AggregateError([error,recovery],'Chart appearance recovery failed');}throw error;}
    },
    getAppearance: () => lastAppearance ? structuredClone(lastAppearance) : null,
    getDiagnostics: () => [...diagnostics,...indicatorDisplay?.diagnostics()??[],...trendlineAnnotation?.diagnostics()??[],...statsPainter?.diagnostics()??[],...fibTrendLine?.diagnostics()??[],...nativeDrawingReset?.diagnostics()??[],...document.diagnostics(knownTypes),...drawingProjection.diagnostics(),...drawingBindingDiagnostics,...analysisUnavailable?[{code:'ANALYSIS_RESTORE_UNAVAILABLE',feature:'analysis snapshot',severity:'unavailable' as const,message:analysisUnavailable}]:[]],
    inspect: () => chart.inspect(),
    async runCapabilityProbe() {
      await chart.ready();
      const sample=[{time:1000,open:100,high:110,low:90,close:104,volume:10},{time:2000,open:110,high:120,low:100,close:116,volume:20}];
      const ha=chartType('heikinashi')?.barTransform?.full(sample);
      const expected=[{...sample[0],open:102,close:101},{...sample[1],open:101.5,close:111.5}];
      const original=chart.drawings.toJSON();
      const draw=chart.drawings.add('trendline',{paneId:'price',anchors:[{time:currentBars[0]?.time*1000||1000,price:100},{time:currentBars[1]?.time*1000||2000,price:110}],style:{lineColor:'#31bb9c',lineWidth:2,lineStyle:'dashed'}});
      const created=draw?.serialize();
      if(draw)chart.drawings.update(draw.id,{locked:true});
      const edited=chart.drawings.all().find(row=>row.id===draw?.id);
      if(draw)chart.drawings.remove(draw.id);
      chart.drawings.fromJSON(original);
      return {renderer:chart.renderer.name,capabilities:chart.renderer.capabilities,offline:chart.market.offline,
        syntheticProbe:true,haNumerical:{passed:JSON.stringify(ha)===JSON.stringify(expected),actual:ha,expected},
        drawingCreateEdit:{passed:!!created&&edited?.locked===true,created,edited},
        distinctDerivedIdentity:identifyDisplayBars([sample[0],sample[0]],{datasetId:'synthetic-gate',revision:'1',transformId:'derived'},[[0,0],[0,0]]).map(row=>({id:row.id,index:row.logicalIndex,time:row.sourceTime})),
        topologyRenderer:'unverified: renderer uses time coordinates; duplicate-time derived axis requires LV-owned logical mapping',
        drawingPaint:'unverified: custom model registration does not establish native paint dispatch',
        appearanceDiagnostics:diagnostics,
      };
    },
    getConfig: () => chart.renderer.getConfig(),
    applyConfig: (config: unknown) => applyRendererConfig(config),
    /** A container resize reaches the renderer twice in one ResizeObserver delivery: its own observer
     * resizes and repaints first (it was created first), then the host's observer calls this for the very same size. That
     * second full resize repaints identical pixels (the first already cleared the crosshair), so it is skipped when it comes
     * within 2 ms of the renderer's own resize at an unchanged wrapper size and pixel ratio. Any other call resizes as before. */
    resize: () => {const last=lvResize.native;lvResize.native=null;if(last&&performance.now()-last.at<2)try{const wrapper=(rendererHolder.current as unknown as {wrapper?:HTMLElement}|null)?.wrapper;if(wrapper&&wrapper.clientWidth===last.w&&wrapper.clientHeight===last.h&&(window.devicePixelRatio||1)===last.dpr)return;}catch{/* resized below as before */}lvResize.forwarding=true;try{chart.resize();}finally{lvResize.forwarding=false;}},
    setTool: (type: DrawingTypeKey | null) => { if(type&&!knownTypes.has(type))throw new Error(`Unsupported drawing type: ${type}`); chart.drawings.setTool(type);chart.renderer.focus(); },
    /** Reference drawRightThere (Alt + H/J/V/C): place a single-point line at the last price-pane crosshair point.
     * Same history and publication path as a pointer placement: drawings.add records history and emits drawing:created,
     * which updateDocument publishes. Refused while busy, while a gesture/editor is active, a tool is armed or the eraser is on. */
    placeAtCrosshair:(type:'hline'|'hray'|'vline'|'crossline'):{ok:true;id:string}|{ok:false;message:string}=>{
      if(!['hline','hray','vline','crossline'].includes(type)||!knownTypes.has(type))throw Error('Only single-point line tools can be placed at the pointer.');
      assertDuplicateMutable('placement');
      const point=lastCrosshair;
      /* Any pane (place-at-crosshair.ts); a sub-pane line sits on that pane's scale. */const target=crosshairPlacement(type,point,(rendererHolder.current as unknown as {scene?:Parameters<typeof crosshairPlacement>[2]}|null)?.scene,currentBars.at(-1)?.close??null);
      if(!target.ok||!point||point.time===null)return{ok:false,message:target.ok?PLACE_POINTER_MESSAGE:target.message};
      /* typeof: extracted-block harnesses run this body without the lens. */const sourceTime=typeof derivedDrawings!=='undefined'?derivedDrawings.toSourceSeconds(point.time):point.time;if(sourceTime===null)return{ok:false,message:DERIVED_DRAWING_REFUSED};
      const created=chart.drawings.add(type,{paneId:target.paneId,anchors:[{time:sourceTime*1000,price:target.price}]});
      if(!created)throw Error('The chart renderer refused the drawing.');
      return{ok:true,id:created.id};
    },
    /** The price pane in client pixels for the virtual order and position lines (a DOM overlay, never drawing rows). Null while unreadable.
     *  The data area starts at the input element (after any left scale gutter); scaleSide is the main price scale side. */
    pricePaneProjection:():PricePaneProjection|null=>disposed?null:pricePaneProjectionOf(rendererHolder.current as unknown as Parameters<typeof pricePaneProjectionOf>[0],container),
    /** Client-pixel x of a Unix-seconds time on the current viewport (the drawing edit bar is placed near a
     * drawing's anchors). Null while the renderer geometry is unreadable, for a non-finite time, and on derived (non-time) chart types. */
    timeToX:(time:number):number|null=>{
      if(disposed)return null;
      const coords=(rendererHolder.current as unknown as {coords?:TimeAxisCoords}|null)?.coords;
      if(derivedDrawings.derived()){const native=derivedDrawings.toNativeSeconds(time);return native===null?null:timeToClientX(coords,container.getBoundingClientRect().left,native,true);}
      return timeToClientX(coords,container.getBoundingClientRect().left,time,TIME_AXIS_STYLES.includes(requestedStyle));
    },
    /** The chart settings right margin (canvas.rightMarginBars, bars). Moves the view only while it sits at the old margin; never a navigation command (no undo step, first open included). */
    setRightMargin:(bars:number):boolean=>disposed?false:applyRightMargin(rendererHolder.current as unknown as RightMarginRenderer|null,bars),
    /** The latest bar is off the right edge (renderer bars, so derived types and
     * weekend gaps count bars, not calendar seconds). Null when the renderer viewport is unreadable. */
    latestBarHidden:():boolean|null=>{if(disposed)return null;const coords=(rendererHolder.current as unknown as RightMarginRenderer|null)?.coords;try{const vp=coords?.getViewport();if(!coords||!vp||!Number.isFinite(vp.rightOffset))return null;return coords.barCount>0&&vp.rightOffset<-0.5;}catch{return null;}},
    /** Scroll to the most recent bar: the latest bar sits at the chart's right margin (Chart settings, bars), zoom kept. A navigation command. */
    scrollToLatest:():boolean=>{if(disposed)return false;const renderer=rendererHolder.current as unknown as RightMarginRenderer|null,coords=renderer?.coords,vp=coords?.getViewport(),margin=renderer?.scene?.style?.margins?.right;if(!renderer||!coords?.barCount||!vp||typeof renderer.applyViewport!=='function')return false;renderer.applyViewport({barSpacing:vp.barSpacing,rightOffset:typeof margin==='number'&&Number.isFinite(margin)?margin:3});navigationChanged();return true;},
    /** Where an imported image goes - the visible price-pane centre at the latest bar (the last close when the renderer geometry is unreadable). */
    imagePlacement:():{ok:true;placement:{paneId:string;time:number;price:number;maxWidth:number;maxHeight:number}}|{ok:false;message:string}=>{
      const last=currentBars[currentBars.length-1];
      if(!last)return{ok:false,message:'Load some bars before adding an image.'};
      const renderer=rendererHolder.current as unknown as {scene?:{panes?:Map<string,{bounds:{top:number;height:number};scale:unknown}>};coords?:{width:number;yToPrice?:(y:number,scale:unknown,bounds:unknown)=>number}}|null;
      const pane=renderer?.scene?.panes?.get('price');let price=last.close;
      try{if(pane&&typeof renderer?.coords?.yToPrice==='function'){const mid=renderer.coords.yToPrice(pane.bounds.top+pane.bounds.height/2,pane.scale,pane.bounds);if(Number.isFinite(mid))price=mid;}}catch{/* keep the last close */}
      return{ok:true,placement:{paneId:'price',time:last.time*1000,price,maxWidth:Math.max(1,renderer?.coords?.width??400),maxHeight:Math.max(1,pane?.bounds.height??300)}};
    },
    /** Adds an image drawing from a record built by createImageDrawingRecord (same history and publication path as a pointer placement). */
    placeImage:(record:{paneId:string;anchors:{time:number;price:number}[];props?:Record<string,unknown>}):{ok:true;id:string}|{ok:false;message:string}=>{
      if(!knownTypes.has('lvimage' as DrawingTypeKey))return{ok:false,message:'Images are not available in this build.'};
      assertDuplicateMutable('placement');
      const created=chart.drawings.add('lvimage' as DrawingTypeKey,{paneId:record.paneId,anchors:record.anchors,props:record.props});
      return created?{ok:true,id:created.id}:{ok:false,message:'The chart renderer refused the image.'};
    },
    setDrawingMode: (mode: 'measure'|'eraser'|null) => { const owner=captureDrawingCommandErrorOwner();owner();if(mode==='eraser'){const source=captureDuplicateSource();assertEraseMutable(true);source();captureDuplicateWorkspace('erase').assertCurrent();source();assertEraseMutable(true);source();}chart.drawings.setMode(mode);owner();if(mode)chart.renderer.focus(); },
    onToolChanged:(callback:(type:string|null)=>void)=>chart.on('drawing:tool',({type})=>callback(type)),
    onDrawingModeChanged:(callback:(mode:'measure'|'eraser'|null)=>void)=>chart.on('drawing:mode',({mode})=>callback(mode)),
    drawings: chart.drawings,
    drawingCatalog,
    onDrawingSelection:(callback:(ids:string[])=>void)=>chart.on('drawing:selected',({ids})=>callback(ids)),
    onDrawingsChanged:(callback:DrawingSubscriber)=>{drawingSubscribers.add(callback);return()=>{drawingSubscribers.delete(callback);};},
    /** Told each time the routine background autosave hold holds back a drawing publication (a native drag or inline text edit made during the write). */
    onHeldDrawingChange:(callback:()=>void)=>heldDrawings.subscribe(callback),
    /** Publishes a drawing change held back by that hold once it has ended (one workspace change and undo step). false: nothing was held. */
    publishHeldDrawings:()=>heldDrawings.flush(),
    finishInlineText:()=>inlineEditor?.commit()??true,
    captureInlineTextSourceOwner:()=>{const source=currentSource,input=currentBars,style=requestedStyle;const assertCurrent=()=>{if(disposed||currentSource!==source||currentBars!==input||requestedStyle!==style)throw Error('Inline text settings source changed.');};assertCurrent();return assertCurrent;},
    getDrawingEditor:(id:string)=>{const record=document.all().find(row=>row.id===id)??chart.drawings.all().find(row=>row.id===id);if(!record)throw new Error(`Drawing not found: ${id}`);return {...statsEditorStatus(drawingEditor(record as unknown as SerializedDrawing,currentBars,drawingCoordinateContext(),{consumers:dwb3Consumers,priceScaleLog:(()=>{try{return (chart.renderer.getConfig() as {priceScale?:{log?:boolean}}).priceScale?.log===true;}catch{return false;}})()})),recordFingerprint:JSON.stringify(record),intervalVisibility:structuredClone((record as Record<string,unknown>).lvIntervalVisibility),sourceResolution:currentSource.resolution,visibilityDiagnostic:drawingVisibility(record as unknown as Record<string,unknown>,currentSource.resolution).diagnostic};},
    updateDrawingProperties:(id:string,patch:Record<string,unknown>)=>controller.updateDrawingEdit(id,patch),
    updateDrawingCoordinates:(id:string,coordinates:readonly Partial<DrawingCoordinate>[],priceOffset?:number)=>controller.updateDrawingEdit(id,{},coordinates,priceOffset),
    updateDrawingEdit:(id:string,patch:Record<string,unknown>,coordinates?:readonly Partial<DrawingCoordinate>[],priceOffset?:number,intervalVisibility?:DrawingVisibilityRule)=>{
      const receipt=templateBatches.commit(templateBatches.prepareDrawingEdit(id,patch,coordinates,priceOffset,intervalVisibility));
      return{accepted:receipt.accepted,changed:receipt.changed};
    },
    /** The settings dialog's live preview, painted on the renderer copy only (never the document, undo or capture). */
    previewDrawingEdit:(id:string,patch:Record<string,unknown>,coordinates?:readonly Partial<DrawingCoordinate>[],priceOffset?:number)=>drawingPreview.show(id,patch,coordinates,priceOffset),
    clearDrawingPreview:(id:string)=>drawingPreview.clear(id),
    loadDrawings: (doc: unknown) => restore(doc),
    saveDrawings: () => drawingErasePublisher.captureReadOnly()??drawingDuplicatePublisher.captureReadOnly()??resetPublisher.captureReadOnly()??templateBatches.captureReadOnly()??reconcileNativeDrawings(false),
    /** The adjacent panes a drawing can move to, and the move itself (one change notification, one undo step). */
    drawingMoveTargets:(id:string)=>{const row=document.all().find(item=>String(item.id)===id);if(!row||!rendererDrawingPort)return{above:null,below:null};const current=String(row.paneId??'');return drawingMoveTargets(analysisInventory().panes.map(pane=>pane.paneId),current);},
    moveDrawingsToPane:(ids:readonly string[],paneId:string)=>{if(!rendererDrawingPort)throw new Error('Moving drawings is unavailable: renderer projection port is missing');const pane=analysisInventory().panes.find(item=>item.paneId===paneId);if(!pane)throw new Error('That pane is no longer on the chart.');return commitDrawingPaneMove({read:()=>document.serialize(),write:next=>document.load(next),project:reprojectDrawings,notify:notifyDrawings},ids,paneId,drawingPaneBinding(pane));},
    setDrawingIntervalVisibility:(ids:readonly string[],rule:DrawingVisibilityRule)=>{if(!rendererDrawingPort)throw new Error('Drawing interval visibility is unavailable: renderer projection port is missing');return commitDrawingVisibility({read:()=>document.serialize(),write:next=>document.load(next),project:reprojectDrawings,notify:notifyDrawings,known:type=>knownTypes.has(type as DrawingTypeKey)},ids,rule);},
    sourceContext:()=>({...currentSource}),
    displayBars: () => {const derived=derivedFor(currentBars);if(derived?.axis&&derived.result.ok)return derivedDisplayBars(derived.axis,derived.result.value,{datasetId:currentSource.datasetId,revision:currentSource.revision});return identifyDisplayBars(calculationBars(currentBars,requestedStyle),{datasetId:currentSource.datasetId,revision:currentSource.revision,transformId:calculationTransformId(requestedStyle)});},
    /** Original source event time (seconds) for a renderer time; derived styles map their logical axis, time styles return it unchanged. */
    axisSourceTime,
  };
  if(rendererHolder.current){
    const renderer=rendererHolder.current;
    const assertInstallation=()=>{if(disposed||rendererHolder.current!==renderer)throw Error('Inline chart installation retired.');};
    const captureSourceOwner=()=>{const source=currentSource,input=currentBars,style=requestedStyle;return()=>{assertInstallation();if(currentSource!==source||currentBars!==input||requestedStyle!==style)throw Error('Inline chart source changed.');};};
    const assertMutable=()=>{assertInstallation();if(analysisUnavailable||analysisPending||marketUpdating||marketQueue.isPending())throw Error('Inline text editing is unavailable while the chart is busy or unavailable.');};
    try{
      const ports=captureNativeInlineDOMPorts(renderer,assertInstallation);
      inlineGeometry=installOwnedTrendlineInlineGeometry(renderer,{
        captureDrawingOwner:(id,record)=>captureInlineDrawingOwner(document,chart.drawings,id,record,captureSourceOwner(),row=>typeof derivedDrawings!=='undefined'?derivedDrawings.toSourceRow(row):row),
        captureLayoutOwner:paneId=>captureNativeInlineLayoutOwner(renderer,paneId,captureSourceOwner()),
        resolveInheritedDirection:canvas=>{if(!(canvas instanceof HTMLCanvasElement))throw Error('Inline text canvas is unavailable.');const direction=canvas.ownerDocument.defaultView?.getComputedStyle(canvas).direction;if(direction!=='ltr'&&direction!=='rtl')throw Error('Inline text direction is unavailable.');return direction;},
      });
      inlineEditor=installTrendlineInlineEditor({
        geometry:inlineGeometry,surface:ports.surface,overlayHost:ports.overlayHost,captureSourceOwner,
        captureLayoutOwner:paneId=>captureNativeInlineLayoutOwner(renderer,paneId,captureSourceOwner()),readViewport:()=>ports.readViewport(),
        canEnter:()=>{try{assertMutable();return ports.canEnter();}catch{return false;}},
        captureOpening:id=>captureTrendlineInlineOpening({document,facade:chart.drawings,assertSource:captureSourceOwner(),assertMutable,update:controller.updateDrawingEdit},id),
        repaint:()=>ports.repaint(),isAcceptedFailure:error=>error instanceof DrawingEditRecoveryError&&error.accepted,
        reportError:(error,{accepted})=>{assertInstallation();const source=currentSource,input=currentBars,style=requestedStyle;let message='Inline text editing failed; details are unavailable.';try{message=String(error);}catch{/* Formatting must not bypass the retained source check. */}assertInstallation();if(currentSource!==source||currentBars!==input||requestedStyle!==style)return;diagnostics=diagnostics.filter(row=>row.code!=='INLINE_TEXT_EDIT');diagnostics.push({code:'INLINE_TEXT_EDIT',feature:'Trendline inline text',severity:accepted?'unavailable':'warning',message});if(accepted)unavailable('The annotation changed, but inline publication or cleanup failed. Reopen this chart. '+message);},
      });
    }catch(error){
      const failures:unknown[]=[error];try{inlineEditor?.dispose();}catch(cleanup){failures.push(cleanup);}inlineEditor=null;try{inlineGeometry?.dispose();}catch(cleanup){failures.push(cleanup);}inlineGeometry=null;
      diagnostics.push({code:'INLINE_TEXT_UNAVAILABLE',feature:'Trendline inline text',severity:'unavailable',message:failures.map(String).join(' | ')});
    }
  }
  if(rendererHolder.current)contextMenus=createChartContextPort(controller,createRendererContextPort(rendererHolder.current,coreModelAbsence(chart,rendererHolder.current)),()=>disposed);
  const nextInput=(request:AnalysisRestoreRequest)=>request.next?{source:request.next.source,bars:request.next.bars,style:request.next.style}:{source:currentSource,bars:currentBars,style:requestedStyle};
  const inputCopies=new WeakMap<AnalysisRestoreRequest,Bar[]>();
  const waitPlacement=async()=>{for(let attempt=0;attempt<200;attempt++){if(disposed)throw new Error('Chart disposed during analysis setup');const instances=new Map(indicators.list().map(row=>[row.id,row.rendererId])),nativePanes=new Map(chart.panes.list().flatMap(pane=>pane.indicators.map(row=>[row.id,pane.id] as const))),logicalPanes=new Map(paneRegistry.snapshot().map(row=>[row.logical,row.native]));const built=indicators.serialize().every(saved=>!!saved.paneId&&logicalPanes.get(saved.paneId)===nativePanes.get(instances.get(saved.id)??'')),script=scripts.placementStatus();if(built&&!indicators.pinsPending?.()&&script.ready){await indicators.waitForVwap();if(disposed)throw Error('Chart disposed during calculation setup');indicators.assertVwapReady();return;}await new Promise<void>(resolve=>setTimeout(resolve,10));}throw new Error('Native analysis initialization or pane placement did not complete within the local two-second bound');};
  const remapDrawings=(doc:Record<string,unknown>,_inventory:AnalysisPaneInventory)=>doc;
  const captureAnalysis=()=>({input:{bars:structuredClone(currentBars),source:{...currentSource},style:requestedStyle},drawings:controller.saveDrawings(),indicators:indicators.serialize(),scripts:scripts.captureAcceptedResults(),appearance:lastAppearance?structuredClone(lastAppearance):null,diagnostics:structuredClone(diagnostics),nativeConfig:structuredClone(chart.renderer.getConfig()),background:container.style.background,options:controller.getChartOptions(),settings:controller.getChartSettingsBook(),comparisons:comparisons.list().map(({rendererId,...settings})=>settings),viewport:controller.getViewport(),inventory:analysisInventory(),paneLayout:structuredClone(chart.panes.list()),frame:rendererFrames!.capture(analysisInventory())});
  const unchangedAnalysis=(request:AnalysisRestoreRequest)=>{indicators.assertVwapReady();const target=nextInput(request),a=request.analysis;return request.scripts.changed===false&&sameChartSourceBasis(target.source,currentSource,true)&&target.source.inputIdentity===currentSource.inputIdentity&&target.style===requestedStyle&&JSON.stringify(a.drawings)===JSON.stringify(controller.saveDrawings())&&JSON.stringify(a.indicators)===JSON.stringify(indicators.serialize())&&(!a.appearance||JSON.stringify(a.appearance)===JSON.stringify(lastAppearance))&&(!a.chartOptions||JSON.stringify(a.chartOptions)===JSON.stringify(controller.getChartOptions()))&&(!a.chartTypeSettings||JSON.stringify(a.chartTypeSettings)===JSON.stringify(retainedTypeSettings))&&(!a.viewport||JSON.stringify(a.viewport)===JSON.stringify(controller.getViewport()))&&(!a.comparisons||JSON.stringify(a.comparisons)===JSON.stringify(comparisons.list().map(({rendererId,...settings})=>settings)))&&(!a.frame||JSON.stringify(a.frame)===JSON.stringify(rendererFrames!.captureHistorical(analysisInventory(),{source:currentSource,style:requestedStyle,calculationFingerprints:request.calculationFingerprints??{}},chart.panes.list().map(({id,order,collapsed,maximized})=>({id,order,collapsed,maximized})))));};
  const holdAnalysisNotifications=(owner?:{isCurrent:()=>boolean})=>{const holds=acquireNotificationHolds([()=>indicators.beginExternalTransaction(),()=>scripts.beginExternalTransaction(),()=>comparisons.beginExternalTransaction()]);drawingBatch++;let released=false;return{release(publish:boolean,proof?:AnalysisPublicationProof){if(released)throw new Error('Analysis notification hold already released');released=true;drawingBatch--;const failures:unknown[]=[];try{holds.release(publish,{...proof,...owner?{ownerCurrent:owner.isCurrent}:{}});}catch(error){failures.push(error);}const dirty=drawingDirty;drawingDirty=false;if(publish&&dirty)try{notifyDrawings();}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'Analysis notification publication failed');}};};
  const sessionPaneExclusive:typeof marketQueue.exclusive=async(operation,guard)=>{try{return await marketQueue.exclusive(operation,guard);}finally{queueSessionPaneRefresh();}};
  const engine=createAnalysisTransactionEngine<AnalysisRestoreRequest,ReturnType<typeof captureAnalysis>>({
    exclusive:sessionPaneExclusive,
    validate:request=>{if(analysisPending||analysisUnavailable)throw new Error('Chart analysis is busy or unavailable');if(!sameChartSourceBasis(currentSource,request.expected.source,true)||currentSource.inputIdentity!==barInputIdentity(request.expected.bars)||requestedStyle!==request.expected.style)throw new Error('Chart source, information prefix or style changed before analysis setup');validateIndicatorSnapshots(request.analysis.indicators);const check=new LosslessDrawingDocument();check.load(request.analysis.drawings);if(request.analysis.chartOptions)validateChartOptions(request.analysis.chartOptions);if(request.analysis.chartTypeSettings)validatedSettingsBook(request.analysis.chartTypeSettings);if(request.analysis.comparisons)request.analysis.comparisons.forEach(validateComparisonSettings);if(request.analysis.appearance)mapAppearance(request.analysis.appearance);if(request.analysis.viewport)validateViewport(request.analysis.viewport);const target=nextInput(request);validateChartSourceBasisIdentity(target.source.basisIdentity);if(request.analysis.frame){if(!request.calculationFingerprints)throw Error('Historical frame requires independently computed owner fingerprints');assertHistoricalFrameCompatible(request.analysis.frame,{source:target.source,style:target.style,calculationFingerprints:request.calculationFingerprints});}if(!CHART_TYPES.slice(0,13).some(row=>row[0]===target.style))throw new Error('This chart topology cannot accept an analysis snapshot');if(target.style==='volumecandles'){const volume=requireVolume(target.bars,target.style);if(!volume.ok)throw new Error(volume.diagnostic.message);}const changesStudies=JSON.stringify(indicators.serialize())!==JSON.stringify(request.analysis.indicators)||request.scripts.changed!==false,changesSource=target.source.inputIdentity!==currentSource.inputIdentity||!sameChartSourceBasis(target.source,currentSource)||target.style!==requestedStyle;for(const pane of analysisInventory().panes){if(pane.paneId==='price')continue;const ownsReplaced=pane.owners.some(owner=>owner.kind==='built'||owner.kind==='script');if(changesStudies&&ownsReplaced&&!pane.replaceable)throw new Error('Analysis restore cannot replace mixed or opaque pane ownership');if(changesSource&&check.all().some(row=>row.paneId===pane.paneId)&&!pane.replaceable)throw new Error('Source-changing restore cannot prove an unaffected drawing pane remains mounted');}if(!unchangedAnalysis(request)){if(!rendererFrames)throw new Error('Pinned native renderer frame capability is unavailable');rendererFrames.assertAvailable(analysisInventory());}},
    noOp:unchangedAnalysis,
    capture:captureAnalysis,
    hold:holdAnalysisNotifications,
    apply:async request=>{if(request.next&&(!sameChartSourceBasis(request.next.source,currentSource)||request.next.source.inputIdentity!==currentSource.inputIdentity)){writeMarketInput({source:request.next.source,bars:inputCopies.get(request)??structuredClone([...request.next.bars])});await applyMarketInput(currentBars);}const target=nextInput(request);if(target.style!==requestedStyle){const style=controller.setStyle(target.style);if(!style.ok)throw new Error(style.diagnostic.message);}if(request.analysis.appearance)controller.applyAppearance(request.analysis.appearance);if(request.analysis.chartTypeSettings)controller.applyChartSettingsBook(request.analysis.chartTypeSettings);if(request.analysis.chartOptions&&JSON.stringify(request.analysis.chartOptions)!==JSON.stringify(controller.getChartOptions()))controller.applyChartOptions(request.analysis.chartOptions);indicators.restore(request.analysis.indicators);if(request.analysis.comparisons)comparisons.restore(request.analysis.comparisons);},
    settle:async request=>{await waitPlacement();controller.loadDrawings(remapDrawings(request.analysis.drawings,analysisInventory()));reprojectDrawings();/* The saved viewport is the bar-clamped visible range, so re-applying an unchanged one drops the right offset and zoom; only a different viewport is applied. */if(request.analysis.viewport){const view=request.analysis.viewport,now=controller.getViewport();if(!now||Math.abs(now.from-view.from)>1e-6||Math.abs(now.to-view.to)>1e-6)controller.setViewport(view);}if(request.analysis.frame)applyHistorical(request.analysis.frame,request.calculationFingerprints!);},
    restore:async prior=>{retireStatisticsSource();retireVwapSource();const inputChanged=!sameChartSourceBasis(currentSource,prior.input.source)||currentSource.inputIdentity!==prior.input.source.inputIdentity;requestedStyle=prior.input.style;applyRequestedStyle();if(inputChanged){writeMarketInput({bars:prior.input.bars,source:prior.input.source});await applyMarketInput(currentBars);}indicators.restore(prior.indicators);comparisons.restore(prior.comparisons);scripts.restoreAcceptedResults(prior.scripts);await waitPlacement();controller.loadDrawings(remapDrawings(prior.drawings,prior.inventory));applyRendererConfig(remapAnalysisStacking(prior.nativeConfig as ChartConfig,prior.inventory,analysisInventory()));chart.renderer.set('autoScale',prior.options.auto);lastAppearance=prior.appearance;indicatorDisplay?.setOptions(gateIndicatorLabels(indicatorDisplayOptionsFromAppearance(prior.appearance??{})));diagnostics=prior.diagnostics;container.style.background=prior.background;retainedTypeSettings=prior.settings;const paneIds=rendererFrames!.paneIds(prior.frame,analysisInventory()),mapped=prior.paneLayout.map(pane=>({...pane,id:paneIds.get(pane.id)!}));chart.panes.maximize(null);for(const pane of mapped){if(pane.id!=='price'){let index=chart.panes.list().findIndex(row=>row.id===pane.id);while(index>pane.order){chart.panes.move(pane.id,'up');const next=chart.panes.list().findIndex(row=>row.id===pane.id);if(next===index)throw new Error('Native pane order could not be restored');index=next;}chart.panes.collapse(pane.id,pane.collapsed);}}const maximized=mapped.find(pane=>pane.maximized);if(maximized)chart.panes.maximize(maximized.id);if(prior.viewport)controller.setViewport(prior.viewport);applyRequestedStyle();indicators.recompute();await indicators.waitForVwap();reprojectDrawings();rendererFrames!.restore(prior.frame,analysisInventory());},
    scripts:request=>request.scripts,pending:active=>{analysisPending+=active?1:-1;if(!active)if(typeof queueSessionPaneRefresh==='function')queueSessionPaneRefresh();},broken:unavailable,
  });
  const applyPaneLayout=(rows:Array<{id:string;order:number;collapsed:boolean;maximized:boolean}>)=>{chart.panes.maximize(null);for(const pane of [...rows].sort((a,b)=>a.order-b.order)){let index=chart.panes.list().findIndex(row=>row.id===pane.id);while(index!==pane.order){if(index<0)throw Error('Native pane is missing during order restore');chart.panes.move(pane.id,index>pane.order?'up':'down');const next=chart.panes.list().findIndex(row=>row.id===pane.id);if(next===index)throw Error('Native pane order could not be restored');index=next;}chart.panes.collapse(pane.id,pane.collapsed);}const maximized=rows.find(pane=>pane.maximized);if(maximized)chart.panes.maximize(maximized.id);};
  const nativeHistoricalLayout=()=>chart.panes.list().map(({id,order,collapsed,maximized})=>({id,order,collapsed,maximized}));
  const applyHistorical=(frame:HistoricalChartFrame,fingerprints:Record<string,string>)=>{indicators.assertVwapReady();if(!rendererFrames)throw Error('Historical native frame is unavailable');const context={source:currentSource,style:requestedStyle,calculationFingerprints:fingerprints},ids=rendererFrames.historicalPaneIds(frame,analysisInventory(),context);applyPaneLayout(frame.panes.map(pane=>({id:ids.get(historicalPaneKey(pane.key))!,order:pane.order,collapsed:pane.collapsed,maximized:frame.maximized!==null&&historicalPaneKey(frame.maximized)===historicalPaneKey(pane.key)})));rendererFrames.applyHistorical(frame,analysisInventory(),context);if(typeof queueSessionPaneRefresh==='function')queueSessionPaneRefresh();};
  const captureConfiguration=()=>({inventory:analysisInventory(),frame:rendererFrames!.capture(analysisInventory()),paneLayout:nativeHistoricalLayout(),nativeConfig:structuredClone(chart.renderer.getConfig()),options:controller.getChartOptions(),settings:structuredClone(retainedTypeSettings),appearance:lastAppearance?structuredClone(lastAppearance):null,diagnostics:structuredClone(diagnostics),background:container.style.background,viewport:controller.getViewport()});
  const configurationEditor=createConfigurationEditor<ConfigurationEditRequest,ReturnType<typeof captureConfiguration>,ConfigurationEditResult>({exclusive:sessionPaneExclusive,validate:request=>{if(analysisPending||analysisUnavailable||disposed)throw Error('Chart configuration is busy or unavailable');indicators.assertVwapReady();if(!sameChartSourceBasis(currentSource,request.expected.source,true)||currentSource.inputIdentity!==request.expected.source.inputIdentity||requestedStyle!==request.expected.style)throw Error('Chart source, prefix or style changed before configuration Apply');if(request.calculationFingerprints)validateHistoricalCalculationFingerprints(request.calculationFingerprints);if(request.kind==='options')validateChartOptions(request.options);else if(request.kind==='type'){if(request.style!==requestedStyle)throw Error('Chart type changed before settings Apply');validateTypeSettings(request.style,request.settings);}else{if(!rendererFrames)throw Error('Historical native frame is unavailable');rendererFrames.historicalPaneIds(request.frame,analysisInventory(),{source:currentSource,style:requestedStyle,calculationFingerprints:request.calculationFingerprints});}if(!rendererFrames)throw Error('Pinned renderer configuration recovery is unavailable');rendererFrames.assertAvailable(analysisInventory());},capture:captureConfiguration,hold:holdAnalysisNotifications,pending:active=>{analysisPending+=active?1:-1;if(!active)if(typeof queueSessionPaneRefresh==='function')queueSessionPaneRefresh();},broken:unavailable,apply:request=>{const openingFrame=request.calculationFingerprints?rendererFrames!.captureHistorical(analysisInventory(),{source:currentSource,style:requestedStyle,calculationFingerprints:request.calculationFingerprints},nativeHistoricalLayout()):undefined;if(request.kind==='options')controller.applyChartOptions(request.options);else if(request.kind==='type'){const oldSource=controller.getChartOptions().source;controller.setChartSettings(request.style,request.settings);if(controller.getChartOptions().source!==oldSource)chart.renderer.set('autoScale',true);}else applyHistorical(request.frame,request.calculationFingerprints);return{...(request.calculationFingerprints?{openingFrame,frame:rendererFrames!.captureHistorical(analysisInventory(),{source:currentSource,style:requestedStyle,calculationFingerprints:request.calculationFingerprints},nativeHistoricalLayout())}:{}),chartOptions:controller.getChartOptions(),config:structuredClone(chart.renderer.getConfig()) as ChartConfig,book:controller.getChartSettingsBook(),appearance:lastAppearance?structuredClone(lastAppearance):null};},restore:prior=>{applyRendererConfig(prior.nativeConfig);chart.renderer.set('autoScale',prior.options.auto);retainedTypeSettings=prior.settings;lastAppearance=prior.appearance;indicatorDisplay?.setOptions(gateIndicatorLabels(indicatorDisplayOptionsFromAppearance(prior.appearance??{})));diagnostics=prior.diagnostics;container.style.background=prior.background;if(prior.viewport)controller.setViewport(prior.viewport);applyRequestedStyle();reprojectDrawings();applyPaneLayout(prior.paneLayout);rendererFrames!.restore(prior.frame,analysisInventory());}});
  prepareConfiguration=request=>configurationEditor.prepare(structuredClone(request));
  suspendTree=request=>beginChartTreeSuspension({assert:()=>{if(!controller.isInputCurrent(request.expected))throw Error('Chart input changed before tree suspension');},reserve:()=>{const lease=marketQueue.reserve();return{release:()=>{lease.release();if(typeof queueSessionPaneRefresh==='function')queueSessionPaneRefresh();},isCurrent:()=>lease.isCurrent()&&sameChartSourceBasis(currentSource,request.expected.source,true)&&currentSource.inputIdentity===barInputIdentity(request.expected.bars)&&requestedStyle===request.expected.style};},hold:owner=>{/* A drawing change still held when this routine hold ends (release publish=false clears it) is remembered for publication after the write. */const held=heldDrawings.hold();let analysis:ReturnType<typeof holdAnalysisNotifications>;try{analysis=holdAnalysisNotifications(owner);}catch(error){held.release(false);throw error;}return{release:(publish:boolean,proof?:AnalysisPublicationProof)=>{const dirty=!publish&&drawingDirty;try{analysis.release(publish,proof);}finally{held.release(dirty&&owner.isCurrent());}}};},script:request.scripts,pending:active=>{analysisPending+=active?1:-1;if(!active)if(typeof queueSessionPaneRefresh==='function')queueSessionPaneRefresh();},broken:unavailable,dispose:()=>disposeChart()});
  prepareAnalysis=request=>{const captured:AnalysisRestoreRequest={...request,expected:{...request.expected,source:{...request.expected.source}},next:request.next?{...request.next,source:sourceContextForInput(request.next.source,request.next.bars)}:undefined,analysis:structuredClone(request.analysis)};if(request.next)inputCopies.set(captured,structuredClone([...request.next.bars]));return engine.prepare(captured);};
  // Time axis menu. Disposed with the unsubscribes.
  // The renderer's drawing settings panel (userDrawings.popup.panel) runs as one publication session.
  if(rendererHolder.current){try{const popup=(rendererHolder.current as unknown as {userDrawings?:{popup?:{panel?:unknown}}}).userDrawings?.popup;unsubscribes.push(installDrawingSettingsSession(popup?.panel,drawingSettings));unsubscribes.push(installTrendlineStatsFold(popup?.panel,{editor:id=>controller.getDrawingEditor(id),update:(id,patch)=>controller.updateDrawingProperties(id,patch)}));/* The panel Show on fold reads and writes the saved bands (native-show-on-readback.ts); released first, so the settings-session wrapper under it is put back before its own release. */unsubscribes.unshift(installNativeShowOn(popup?.panel,{read:id=>savedShowOnBands(document.all().find(row=>String(row.id)===id) as unknown as Record<string,unknown>|undefined),write:(id,bands)=>{const previous=document.serialize() as unknown as Record<string,unknown>,next=withShowOn(previous,id,bands);if(next===previous)return;document.load(next);try{reprojectDrawings();}catch(error){document.load(previous);reprojectDrawings();throw error;}notifyDrawings();}}));}catch{/* Renderer without a settings panel: per-edit publication stays. */}}
  // A pointer leaving the plot drops the drawing hover, so no handle stays drawn on an unselected drawing (drawing-hover-leave.ts).
  if(rendererHolder.current&&typeof installDrawingHoverLeave==='function')unsubscribes.push(installDrawingHoverLeave(rendererHolder.current));
  // A new Text with no color takes black or white ink from the painted background (solid or both gradient ends),
  // not the transparent layout color a gradient leaves the renderer (drawing-text-ink.ts).
  if(rendererHolder.current)unsubscribes.push(installTextInkDefault(rendererHolder.current,()=>paintedBackgrounds(lastAppearance),(type,ink)=>{forgetPickedInk(chart.drawings,type,ink);}));
  let timeScalePort:TimeScalePort|null=null;if(rendererHolder.current){const ownedTimeScale=installTimeScalePort({renderer:rendererHolder.current,container,availability:()=>disposed?'This chart is closed.':analysisUnavailable?analysisUnavailable:analysisPending||marketQueue.isPending()?'The chart is updating. Try again in a moment.':null});timeScalePort=ownedTimeScale;unsubscribes.push(()=>{timeScalePort=null;ownedTimeScale.dispose();});}
  // Price scale: menu on the price axis, Alt+I/P/L/R, axis A/L buttons, price-to-bar lock. Disposed with the unsubscribes.
  const readSessionPane=(owner:IndicatorPresentationOwner|undefined):TradingSessionPaneTarget|null=>{
   if(!owner||owner.nativeId===null||owner.nativeIncarnation===null)return null;owner.assertCurrent();
   const renderer=rendererHolder.current;if(!renderer||duplicateOwn(duplicateOwn(chart,'orchestrator'),'renderer')!==renderer)throw Error('Indicator pane renderer changed.');
   const scene=duplicateOwn(renderer,'scene'),models=duplicateOwn(scene,'indicators'),panes=duplicateOwn(scene,'panes');
   if(!(models instanceof Map)||Object.getPrototypeOf(models)!==Map.prototype||!(panes instanceof Map)||Object.getPrototypeOf(panes)!==Map.prototype)throw Error('Indicator pane ownership is unavailable.');
   const model=Map.prototype.get.call(models,owner.nativeId);if(!model)throw Error('Indicator native model is unavailable.');
   const paneId=duplicateOwn(model,'paneId');if(typeof paneId!=='string'||!paneId||paneId.length>4096)throw Error('Indicator pane identity is unavailable.');
   const pane=Map.prototype.get.call(panes,paneId);if(!pane){owner.assertCurrent();return null;}
   const kind=duplicateOwn(pane,'kind'),field=kind==='price'?Object.getOwnPropertyDescriptor(scene,'invertScale'):Object.getOwnPropertyDescriptor(pane,'invert');
   if(field&&(!Object.hasOwn(field,'value')||typeof field.value!=='boolean')||kind==='price'&&!field)throw Error('Indicator pane orientation must be a boolean data field.');
   const inverted=field?.value??false;const orientationCurrent=()=>{const now=kind==='price'?Object.getOwnPropertyDescriptor(scene,'invertScale'):Object.getOwnPropertyDescriptor(pane,'invert');if(duplicateOwn(pane,'kind')!==kind||!!now!==!!field||now&&(!Object.hasOwn(now,'value')||now.value!==inverted))throw Error('Indicator pane orientation changed.');};owner.assertCurrent();orientationCurrent();
   if(rendererHolder.current!==renderer||duplicateOwn(duplicateOwn(chart,'orchestrator'),'renderer')!==renderer||Map.prototype.get.call(models,owner.nativeId)!==model||duplicateOwn(model,'paneId')!==paneId||Map.prototype.get.call(panes,paneId)!==pane)throw Error('Indicator pane changed during orientation read.');
   return{instanceOwner:owner.instanceOwner,nativeId:owner.nativeId,nativeIncarnation:owner.nativeIncarnation,paneId,inverted,id:'',assertCurrent:()=>{owner.assertCurrent();orientationCurrent();if(rendererHolder.current!==renderer||Map.prototype.get.call(models,owner.nativeId)!==model||duplicateOwn(model,'paneId')!==paneId||Map.prototype.get.call(panes,paneId)!==pane)throw Error('Indicator pane retired.');}};
  };
  const sessionPaneTarget=(id:string):TradingSessionPaneTarget|null=>{const row=indicators.list().find(item=>item.id===id);if(!row||!row.visible||row.kind!=='tradingsessions')return null;const owner=indicators.capturePresentationOwner(id),target=owner?readSessionPane(owner):null;return target?{...target,id}:null;};
  const sessionPaneRefresh=createTradingSessionPaneRefresh({captureOwner:()=>{const owner=analysisPublication.captureOwner(),renderer=rendererHolder.current,expected=controller;return{isCurrent:()=>owner.isCurrent()&&!disposed&&rendererHolder.current===renderer&&controller===expected};},busy:()=>analysisPending>0||marketUpdating||marketQueue.isPending(),targets:()=>indicators.list().filter(row=>row.visible&&row.kind==='tradingsessions').map(row=>{const target=sessionPaneTarget(row.id);if(!target)throw Error('Trading session chart pane is not ready.');return target;}),target:sessionPaneTarget,refresh:id=>{const owner=indicators.recomputeInstance(id),target=owner?readSessionPane(owner):null;return target?{...target,id}:null;},defer:callback=>queueMicrotask(callback),accepted:()=>{diagnostics=diagnostics.filter(row=>row.code!=='SESSION_LABEL_PANE');},report:error=>{diagnostics=diagnostics.filter(row=>row.code!=='SESSION_LABEL_PANE');diagnostics.push({code:'SESSION_LABEL_PANE',feature:'Trading session labels',severity:'unavailable',message:'Trading session label placement could not follow its chart pane. Reopen the chart if it remains unavailable.'});}});
  queueSessionPaneRefresh=sessionPaneRefresh.request;retireSessionPaneRefresh=sessionPaneRefresh.retire;assertSessionPaneRefresh=sessionPaneRefresh.assertSettled;

  const sessionPaneUnsubscribes:Array<()=>void>=[];
  const sessionPaneCleanup:ChartResourceCleanup=(()=>{
   let closed=false,scale:PriceScalePort|null=null;
   const cleanup=()=>{if(closed)return;closed=true;scale=null;const callbacks=[()=>sessionPaneRefresh.dispose(),...sessionPaneUnsubscribes.splice(0)],errors:unknown[]=[];for(const off of callbacks)try{off();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Trading session subscription cleanup was incomplete');};
   return Object.assign(cleanup,{onPriceScaleCreated(port:PriceScalePort){if(closed)throw Error('Trading session resources are closed.');if(scale===port)return;if(scale)throw Error('Trading session price scale was already installed.');try{sessionPaneUnsubscribes.push(port.subscribe(queueSessionPaneRefresh));scale=port;}catch(error){try{port.dispose();}catch(failure){throw new AggregateError([error,failure],'Price scale subscription and cleanup failed');}throw error;}}});
  })();
  unsubscribes.push(sessionPaneCleanup);
  try{
   if(typeof chart.renderer.onConfigChanged==='function')sessionPaneUnsubscribes.push(chart.renderer.onConfigChanged(queueSessionPaneRefresh));
   for(const event of ['indicator:added','indicator:moved','indicator:removed'] as const)sessionPaneUnsubscribes.push(chart.on(event,queueSessionPaneRefresh));
   sessionPaneUnsubscribes.push(indicators.subscribe(()=>{if(!sessionPaneRefresh.isRefreshing())if(typeof queueSessionPaneRefresh==='function')queueSessionPaneRefresh();}));
  }catch(error){try{sessionPaneCleanup();}catch(cleanup){throw new AggregateError([error,cleanup],'Trading session initialization and cleanup failed');}throw error;}
  let priceScalePort:PriceScalePort|null=null;if(rendererHolder.current){priceScalePort=installPriceScalePort({renderer:rendererHolder.current,features:chart.renderer as unknown as {get(key:string):unknown;set(key:string,value:unknown):void},onViewportChanged:listener=>chart.on('viewport:changed',listener),container,availability:()=>disposed?'This chart is closed.':analysisUnavailable?analysisUnavailable:analysisPending||marketQueue.isPending()?'The chart is updating. Try again in a moment.':null,appearance:()=>lastAppearance,
   tickSize:()=>sourceTickSize(currentSource),
   instrument:()=>({symbol:sourceAxisBasis(currentSource)?.symbol||null,last:currentBars.at(-1)?.close??null,paperRefusal:derivedPaperRefusal({datasetId:currentSource?.datasetId})}),
   // Merge all scales into one pins each stacked indicator back to its pane scale through the port (saved like Pin to scale).
   mergeScales:rendererIds=>{const rows=indicators.list();for(const rendererId of rendererIds){const row=rows.find(item=>item.rendererId===rendererId);if(!row)throw Error('A price scale on this pane does not belong to an OpenCandle indicator, so the scales cannot merge.');indicators.setScale(row.id,'shared');}},
   drawHorizontalLine:price=>{try{if(disposed)return{ok:false,message:'This chart is closed.'};assertDuplicateMutable('placement');const last=currentBars.at(-1);if(!last||!knownTypes.has('hline'))return{ok:false,message:'The chart has no bars to anchor a horizontal line yet.'};const created=chart.drawings.add('hline',{paneId:'price',anchors:[{time:last.time*1000,price}]});return created?{ok:true}:{ok:false,message:'The chart renderer refused the drawing.'};}catch(error){return{ok:false,message:error instanceof Error?error.message:String(error)};}}});
   const ownedPriceScale=priceScalePort;axisLabelPort=ownedPriceScale;for(const cleanup of unsubscribes as ChartResourceCleanup[])cleanup.onPriceScaleCreated?.(ownedPriceScale);
   // Gap 4: re-gate the indicator value tags when the menu toggles them.
   let gatedIndicatorLabels=ownedPriceScale.settings().labels.indValue;const offIndicatorGate=ownedPriceScale.subscribe(()=>{const next=ownedPriceScale.settings().labels.indValue;if(next===gatedIndicatorLabels)return;gatedIndicatorLabels=next;try{indicatorDisplay?.setOptions(gateIndicatorLabels(indicatorDisplayOptionsFromAppearance(lastAppearance??{})));}catch(error){diagnostics.push({code:'INDICATOR_DISPLAY_UNAVAILABLE',feature:'indicator value labels',severity:'unavailable',message:String(error)});}});
   // "Indicators and financials name labels" (labels.indName) turns the indicator name chips on and off.
   let shownIndicatorNames:boolean|null=null;const syncIndicatorNames=()=>{const next=ownedPriceScale.settings().labels.indName===true;if(next===shownIndicatorNames)return;shownIndicatorNames=next;try{indicatorDisplay?.setNameLabels(next);}catch(error){shownIndicatorNames=null;diagnostics.push({code:'INDICATOR_DISPLAY_UNAVAILABLE',feature:'indicator name labels',severity:'unavailable',message:String(error)});}};
   syncIndicatorNames();const offIndicatorNames=ownedPriceScale.subscribe(syncIndicatorNames);
   unsubscribes.push(()=>{axisLabelPort=null;try{offIndicatorGate();}finally{try{offIndicatorNames();}finally{ownedPriceScale.dispose();}}});}
  disposeChart=()=>{if(disposed)return;disposed=true;seriesReadoutLease=null;seriesDayReader=null;dwb3Consumers.dispose();retireDrawingWorkspaceBinding();navigationSubscribers.clear();drawingSubscribers.clear();availabilitySubscribers.clear();attemptEveryCleanup([()=>vwapPrefixSource?.dispose(),()=>fullModels?.dispose(),()=>statsSource?.dispose(),()=>statsPainter?.dispose(),()=>fibTrendLine?.dispose(),()=>inlineEditor?.dispose(),()=>inlineGeometry?.dispose(),()=>nativeDrawingReset?.dispose(),()=>drawingCommands?.dispose(),()=>trendlineAnnotation?.dispose(),()=>indicatorDisplay?.dispose(),()=>disposeAppearancePainters?.(),...unsubscribes.splice(0),()=>contextMenus?.dispose(),()=>drawingPreferences.dispose(),()=>indicators.dispose(),()=>scripts.dispose(),()=>comparisons.dispose(),()=>{if(rendererDrawingPort&&originalDrawingSync)rendererDrawingPort.syncDrawings=originalDrawingSync;},()=>chart.destroy(),()=>{container.style.background=originalBackground;}],'Retired chart cleanup was incomplete');};return {controller,dispose:disposeChart};
  } catch(error) {
    try {attemptEveryCleanup([()=>dwb3Consumers.dispose(),()=>retireDrawingWorkspaceBinding(),()=>vwapPrefixSource?.dispose(),()=>fullModels?.dispose(),()=>statsSource?.dispose(),()=>statsPainter?.dispose(),()=>fibTrendLine?.dispose(),()=>inlineEditor?.dispose(),()=>inlineGeometry?.dispose(),()=>nativeDrawingReset?.dispose(),()=>drawingCommands?.dispose(),()=>trendlineAnnotation?.dispose(),()=>indicatorDisplay?.dispose(),()=>disposeAppearancePainters?.(),()=>chart.destroy()],'Failed chart initialization cleanup was incomplete');}
    catch(cleanup) {throw new AggregateError([error,cleanup],'Chart initialization and cleanup failed');}
    throw error;
  }
}
export type ChartController = ReturnType<typeof createChartProbe>['controller'];
