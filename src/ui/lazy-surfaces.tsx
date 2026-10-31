/** Dialogs that are closed at startup load as separate chunks, so the startup bundle compiles and evaluates less.
 * Each export renders the real dialog with the same props. After the first chart, LazySurfacesPrefetch (mounted by App in the
 * PERF10 StartupDeferred slot) loads every chunk, one per idle slice, so a first open renders at once without a fallback frame:
 * a loaded chunk hands React.lazy a synchronous thenable. Under Vitest (MODE test) every export IS the eager component, so the
 * App-render tests that look dialogs up by type keep their identity. */
import React,{useEffect} from 'react';
import {runIdleSteps} from './startup-idle';
import type {KeyboardShortcutsDialog as KeyboardShortcutsDialogType} from './KeyboardShortcutsDialog';
import type {ChartSettingsDialog as ChartSettingsDialogType} from './chart-settings-dialog';
import type {IndicatorDialog as IndicatorDialogType} from './IndicatorDialog';
import type {IndicatorTemplatesDialog as IndicatorTemplatesDialogType} from './IndicatorTemplatesDialog';
import type {LayoutLibraryDialog as LayoutLibraryDialogType} from './LayoutLibraryDialog';
import type {DrawingDialog as DrawingDialogType} from './DrawingDialog';
import type {DrawingManagerDialog as DrawingManagerDialogType} from './DrawingManagerDialog';
import type {SymbolSearchDialog as SymbolSearchDialogType} from './SymbolSearchDialog';
import type {QuickSearchDialog as QuickSearchDialogType} from './QuickSearchDialog';
import type {TableViewDialog as TableViewDialogType} from './TableViewDialog';
import type {IntervalDialog as IntervalDialogType} from './IntervalDialog';
import type {NotesDialog as NotesDialogType} from './NotesDialog';
import type {WatchlistAdvancedDialog as WatchlistAdvancedDialogType} from './WatchlistAdvancedDialog';
import type {ImportDialog as ImportDialogType} from './ImportDialog';
import type {HeatmapDialog as HeatmapDialogType} from './HeatmapDialog';
import type {PortfolioDialog as PortfolioDialogType} from './PortfolioDialog';
import type {MarketViewsDialog as MarketViewsDialogType} from './MarketViewsDialog';
import type {CalendarDialog as CalendarDialogType} from './CalendarDialog';
import type {FundamentalsDialog as FundamentalsDialogType} from './FundamentalsDialog';
import type {NewsDialog as NewsDialogType} from './NewsDialog';
import type {DateNavigationDialog as DateNavigationDialogType} from './DateNavigationDialog';
import type {SymbolInfoDialog as SymbolInfoDialogType} from './SymbolInfoDialog';
import type {ComparisonDialog as ComparisonDialogType} from './ComparisonDialog';
import type {ListAlertDialog as ListAlertDialogType} from './ListAlertDialog';

type Loaded=React.ComponentType<any>;
const eager=import.meta.env.MODE==='test';
const loaders:Array<()=>Promise<unknown>>=[];
export function lazySurface(load:()=>Promise<Loaded>):Loaded&{prefetch:()=>Promise<Loaded>}{
 let loaded:Loaded|null=null,pending:Promise<Loaded>|null=null;
 const fetch=()=>pending??=load().then(component=>loaded=component,error=>{pending=null;throw error;});
 // A synchronous thenable lets React.lazy resolve on the first render when the chunk is already here (no suspend, no fallback).
 const Lazy=React.lazy(()=>loaded?({then:(resolve:(value:{default:Loaded})=>void)=>resolve({default:loaded!})} as unknown as Promise<{default:Loaded}>):fetch().then(component=>({default:component})));
 loaders.push(fetch);
 const surface=function LazySurface(props:any){return React.createElement(React.Suspense,{fallback:null},React.createElement(Lazy,props));};
 return Object.assign(surface,{prefetch:fetch});
}
export const KeyboardShortcutsDialog:typeof KeyboardShortcutsDialogType=eager?(await import('./KeyboardShortcutsDialog')).KeyboardShortcutsDialog:lazySurface(()=>import('./KeyboardShortcutsDialog').then(module=>module.KeyboardShortcutsDialog as Loaded)) as any;
export const ChartSettingsDialog:typeof ChartSettingsDialogType=eager?(await import('./chart-settings-dialog')).ChartSettingsDialog:lazySurface(()=>import('./chart-settings-dialog').then(module=>module.ChartSettingsDialog as Loaded)) as any;
export const IndicatorDialog:typeof IndicatorDialogType=eager?(await import('./IndicatorDialog')).IndicatorDialog:lazySurface(()=>import('./IndicatorDialog').then(module=>module.IndicatorDialog as Loaded)) as any;
export const IndicatorTemplatesDialog:typeof IndicatorTemplatesDialogType=eager?(await import('./IndicatorTemplatesDialog')).IndicatorTemplatesDialog:lazySurface(()=>import('./IndicatorTemplatesDialog').then(module=>module.IndicatorTemplatesDialog as Loaded)) as any;
export const LayoutLibraryDialog:typeof LayoutLibraryDialogType=eager?(await import('./LayoutLibraryDialog')).LayoutLibraryDialog:lazySurface(()=>import('./LayoutLibraryDialog').then(module=>module.LayoutLibraryDialog as Loaded)) as any;
export const DrawingDialog:typeof DrawingDialogType=eager?(await import('./DrawingDialog')).DrawingDialog:lazySurface(()=>import('./DrawingDialog').then(module=>module.DrawingDialog as Loaded)) as any;
export const DrawingManagerDialog:typeof DrawingManagerDialogType=eager?(await import('./DrawingManagerDialog')).DrawingManagerDialog:lazySurface(()=>import('./DrawingManagerDialog').then(module=>module.DrawingManagerDialog as Loaded)) as any;
export const SymbolSearchDialog:typeof SymbolSearchDialogType=eager?(await import('./SymbolSearchDialog')).SymbolSearchDialog:lazySurface(()=>import('./SymbolSearchDialog').then(module=>module.SymbolSearchDialog as Loaded)) as any;
export const QuickSearchDialog:typeof QuickSearchDialogType=eager?(await import('./QuickSearchDialog')).QuickSearchDialog:lazySurface(()=>import('./QuickSearchDialog').then(module=>module.QuickSearchDialog as Loaded)) as any;
export const TableViewDialog:typeof TableViewDialogType=eager?(await import('./TableViewDialog')).TableViewDialog:lazySurface(()=>import('./TableViewDialog').then(module=>module.TableViewDialog as Loaded)) as any;
export const IntervalDialog:typeof IntervalDialogType=eager?(await import('./IntervalDialog')).IntervalDialog:lazySurface(()=>import('./IntervalDialog').then(module=>module.IntervalDialog as Loaded)) as any;
export const NotesDialog:typeof NotesDialogType=eager?(await import('./NotesDialog')).NotesDialog:lazySurface(()=>import('./NotesDialog').then(module=>module.NotesDialog as Loaded)) as any;
export const WatchlistAdvancedDialog:typeof WatchlistAdvancedDialogType=eager?(await import('./WatchlistAdvancedDialog')).WatchlistAdvancedDialog:lazySurface(()=>import('./WatchlistAdvancedDialog').then(module=>module.WatchlistAdvancedDialog as Loaded)) as any;
export const ImportDialog:typeof ImportDialogType=eager?(await import('./ImportDialog')).ImportDialog:lazySurface(()=>import('./ImportDialog').then(module=>module.ImportDialog as Loaded)) as any;
export const HeatmapDialog:typeof HeatmapDialogType=eager?(await import('./HeatmapDialog')).HeatmapDialog:lazySurface(()=>import('./HeatmapDialog').then(module=>module.HeatmapDialog as Loaded)) as any;
export const PortfolioDialog:typeof PortfolioDialogType=eager?(await import('./PortfolioDialog')).PortfolioDialog:lazySurface(()=>import('./PortfolioDialog').then(module=>module.PortfolioDialog as Loaded)) as any;
export const MarketViewsDialog:typeof MarketViewsDialogType=eager?(await import('./MarketViewsDialog')).MarketViewsDialog:lazySurface(()=>import('./MarketViewsDialog').then(module=>module.MarketViewsDialog as Loaded)) as any;
export const CalendarDialog:typeof CalendarDialogType=eager?(await import('./CalendarDialog')).CalendarDialog:lazySurface(()=>import('./CalendarDialog').then(module=>module.CalendarDialog as Loaded)) as any;
export const FundamentalsDialog:typeof FundamentalsDialogType=eager?(await import('./FundamentalsDialog')).FundamentalsDialog:lazySurface(()=>import('./FundamentalsDialog').then(module=>module.FundamentalsDialog as Loaded)) as any;
export const NewsDialog:typeof NewsDialogType=eager?(await import('./NewsDialog')).NewsDialog:lazySurface(()=>import('./NewsDialog').then(module=>module.NewsDialog as Loaded)) as any;
export const DateNavigationDialog:typeof DateNavigationDialogType=eager?(await import('./DateNavigationDialog')).DateNavigationDialog:lazySurface(()=>import('./DateNavigationDialog').then(module=>module.DateNavigationDialog as Loaded)) as any;
export const SymbolInfoDialog:typeof SymbolInfoDialogType=eager?(await import('./SymbolInfoDialog')).SymbolInfoDialog:lazySurface(()=>import('./SymbolInfoDialog').then(module=>module.SymbolInfoDialog as Loaded)) as any;
export const ComparisonDialog:typeof ComparisonDialogType=eager?(await import('./ComparisonDialog')).ComparisonDialog:lazySurface(()=>import('./ComparisonDialog').then(module=>module.ComparisonDialog as Loaded)) as any;
export const ListAlertDialog:typeof ListAlertDialogType=eager?(await import('./ListAlertDialog')).ListAlertDialog:lazySurface(()=>import('./ListAlertDialog').then(module=>module.ListAlertDialog as Loaded)) as any;

let prefetched=false;
/** Loads every lazy dialog chunk, one per idle slice (each chunk compiles and evaluates in a short task of its own). */
export function prefetchLazySurfaces():()=>void{
 if(eager||prefetched)return()=>{};
 prefetched=true;let index=0,cancel=()=>{},stopped=false;
 const next=()=>{if(stopped||index>=loaders.length)return;const load=loaders[index++];cancel=runIdleSteps([()=>{load().catch(()=>{/* a failed chunk loads again on open */}).finally(next);}],()=>{},{timeout:1000});};
 next();
 return()=>{stopped=true;cancel();};
}
/** Mounted after the first chart (StartupDeferred); renders nothing. */
export function LazySurfacesPrefetch(){useEffect(()=>{prefetchLazySurfaces();},[]);return null;}
