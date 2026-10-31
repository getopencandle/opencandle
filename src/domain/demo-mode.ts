import {DEMO_SYMBOLS} from './fixtures';

/**
 * Where the built-in synthetic (demo) prices may appear.
 *
 * - 'legacy': the module default. Everything behaves as before example mode existed: the 12 demo symbols are in the source universe and every
 *   demo chart has generated bars. Tests and audit harnesses that import modules directly rely on it.
 * - 'off': the desktop app's normal mode (src/main.tsx sets it before the first render). No generated price reaches a chart, the
 *   watchlist, search, the screener or any other panel. A chart with no live source keeps its saved identity but holds no bars
 *   (a placeholder), and the chart says it needs live data.
 * - 'example': the example screen the user opens with "Load example data". Generated prices exist only for EXAMPLE_SYMBOLS and are
 *   labelled as example data. Leaving it returns to 'off'. Session only: never saved.
 *
 * The synthetic provider itself (fixtures.ts) is unchanged.
 */
export type DemoDataMode='legacy'|'off'|'example';
/** The tickers the example screen holds, in watchlist order. */
export const EXAMPLE_SYMBOLS:readonly string[]=Object.freeze(['BTC','ETH','SPY','GME','AAPL']);
export const EXAMPLE_DEFAULT_SYMBOL='GME';
let mode:DemoDataMode='legacy';
const listeners=new Set<(mode:DemoDataMode)=>void>();
export function demoDataMode():DemoDataMode{return mode;}
export function setDemoDataMode(next:DemoDataMode):void{
 if(next!=='legacy'&&next!=='off'&&next!=='example')throw new Error('Unknown demo data mode.');
 if(next===mode)return;mode=next;for(const listener of [...listeners])listener(mode);
}
export function subscribeDemoDataMode(listener:(mode:DemoDataMode)=>void):()=>void{listeners.add(listener);return()=>{listeners.delete(listener);};}
/** True when a chart or row for `symbol` may show generated prices in the current mode. */
export function demoSymbolAllowed(symbol:string):boolean{
 if(mode==='legacy')return true;if(mode==='off')return false;
 return EXAMPLE_SYMBOLS.includes(String(symbol??'').trim().toUpperCase());
}
/** The demo symbols every source universe carries in the current mode. */
export function universeDemoSymbols():readonly string[]{return mode==='legacy'?DEMO_SYMBOLS:mode==='example'?EXAMPLE_SYMBOLS:[];}
/** True when generated prices are hidden (normal app use). */
export const demoDataHidden=():boolean=>mode==='off';
/** The label panels put on built-in generated data. The legacy mode keeps "Demo data"; the app says "Example data"
 * (in normal use such data never reaches a panel). */
export const demoDataLabel=():string=>mode==='legacy'?'Demo data':'Example data';
