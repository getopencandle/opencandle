import {COINBASE_PROVIDER_ID} from '../domain/coinbase-live';
import type {BarDataset} from '../domain/types';

/** First run: a brand-new profile opens on something that works with no setup at all.
 *
 * - A fresh profile (nothing ever saved, no copied LarryVision data) turns on Coinbase public data, which needs no account or
 *   key, and opens a live BTC-USD daily chart. Alpaca is not mentioned: its setup waits in Settings > Data sources and on the
 *   card a stock chart shows until a key is saved.
 * - If Coinbase cannot be reached (offline, blocked, no bars after FIRST_RUN_LIVE_WAIT_MS), the chart moves to the built-in
 *   example data on BTC, says so in one line and offers to try live again. Never a blank or error-only screen.
 * - Any saved workspace (an existing user, a migrated profile, a reset) never comes here: its choices are untouched.
 *
 * Pure model code; the app wires it in (App.tsx loadStoredWorkspace and the first-run effect). */
export const FIRST_RUN_PRODUCT='BTC-USD';
/** The example ticker the fallback shows (one of EXAMPLE_SYMBOLS). */
export const FIRST_RUN_EXAMPLE_SYMBOL='BTC';
/** The factory chart interval (1D), so a first-run chart and a factory chart agree. One Coinbase request fills it. */
export const FIRST_RUN_INTERVAL='1D';
export const FIRST_RUN_DATASET_ID=`live:${COINBASE_PROVIDER_ID}:${FIRST_RUN_PRODUCT}:${FIRST_RUN_INTERVAL}`;
/** How long the first live chart may stay without bars before the example data takes over. */
export const FIRST_RUN_LIVE_WAIT_MS=6000;
/** How long after the load the live chart may take to open at all (the app first waits up to 8 s for the Alpaca key check). */
export const FIRST_RUN_OPEN_WAIT_MS=10000;

export const FIRST_RUN_LIVE_MESSAGE=`Live ${FIRST_RUN_PRODUCT} from Coinbase. Search for a symbol to change the chart.`;
export const FIRST_RUN_FALLBACK_MESSAGE='Could not reach Coinbase, so this chart shows example data for now.';
/** The example banner's text and button while the first-run fallback is showing. */
export const FIRST_RUN_BANNER_TEXT='Example data. Coinbase could not be reached, so these prices are invented.';
export const FIRST_RUN_RETRY_LABEL='Try live again';

/** What storage returned at launch (window.lv.loadWorkspace value). */
export interface StoredWorkspaceLoad {revision:number;savedAt:string|null;data:unknown}

/** True only for a profile that has never saved a workspace: revision 0, no save time, no data. A migrated LarryVision
 * profile carries its saved workspace (revision 1 or more), and a reset or emptied workspace has been saved, so neither is
 * fresh. A layout window is never a first run (the main window owns the workspace). */
export function isFreshProfile(load:StoredWorkspaceLoad|null|undefined,secondaryWindow:boolean):boolean{
 if(secondaryWindow||!load)return false;
 return load.revision===0&&load.savedAt===null&&(load.data===null||load.data===undefined);
}

/** The factory workspace with Coinbase public data turned on (no Alpaca symbols, no key). Every other field is the factory's. */
export function withFirstRunLiveData<W extends {liveData?:unknown}>(workspace:W):W{
 return{...workspace,liveData:{coinbase:true,alpacaSymbols:[]}};
}

export type FirstRunPhase='idle'|'opening'|'fallback'|'done';
export type FirstRunVerdict='wait'|'live'|'fallback'|'abandon';

/** The first live chart's progress.
 * - `live`: the live chart has bars (live or cached).
 * - `fallback`: Coinbase failed (an error with no bars), the live chart stayed empty for FIRST_RUN_LIVE_WAIT_MS, or it never
 *   opened at all within FIRST_RUN_OPEN_WAIT_MS of the load (the chart is still the BTC placeholder).
 * - `abandon`: the chart is on something else (the user, or a startup symbol, moved it), so nothing changes under them.
 * `elapsedMs` counts from the live chart opening when `opened`, else from the workspace load. */
export function firstRunVerdict(input:{chartSourceId:string|null;placeholder:boolean;dataset:Pick<BarDataset,'bars'|'provenance'>|null|undefined;elapsedMs:number;opened:boolean}):FirstRunVerdict{
 if(input.chartSourceId!==FIRST_RUN_DATASET_ID){
  if(!input.placeholder)return 'abandon';
  return input.elapsedMs>=(input.opened?FIRST_RUN_LIVE_WAIT_MS:FIRST_RUN_OPEN_WAIT_MS)?'fallback':'wait';
 }
 const data=input.dataset,own=!!data&&data.provenance.datasetId===FIRST_RUN_DATASET_ID;
 if(own&&data!.bars.length>0)return 'live';
 if(own&&(data!.provenance.state==='error'||data!.provenance.state==='unavailable'))return 'fallback';
 return input.elapsedMs>=FIRST_RUN_LIVE_WAIT_MS?'fallback':'wait';
}
