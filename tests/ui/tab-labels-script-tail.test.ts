import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {ReactElement} from 'react';
import {fixtureDataset} from '../../src/domain/fixtures';
import {coinbaseInstrument,COINBASE_PROVIDER_ID} from '../../src/domain/coinbase-live';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {duplicateSavedLayout} from '../../src/ui/layout-library';
import {inactiveTabQuote} from '../../src/ui/LayoutTabs';
import {layoutTabPrice,layoutTabQuote} from '../../src/ui/layout-tab-quote';
import {demoIntradaySources} from '../../src/ui/workspace-grid';
import {setDemoDataMode} from '../../src/domain/demo-mode';
import {revealTab,tabStripWheel} from '../../src/ui/wick-mode';
import {watchQuote} from '../../src/watchlists/quotes';
import {ScriptLibraryPanel} from '../../src/ui/ScriptLibraryPanel';
import {createScriptLibrary,type ScriptBinding} from '../../src/ui/script-library';
import {initialScript} from '../../src/ui/ScriptPanel';
import {SCRIPT_TAIL_NOTE,scriptRunCount,scriptTailNote} from '../../src/ui/script-jobs';
import type {Bar,BarDataset} from '../../src/domain/types';

// Tab labels (example-data tabs, crypto daily change, scrolling row) and the 5,000-bar note. SYNTHETIC data only.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const effect=(fn:()=>void|(()=>void),deps:any[]=[])=>{const at=hooks.cursor++,old=hooks.cells[at];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i]))){old?.cleanup?.();const cleanup=fn();hooks.cells[at]={deps,cleanup};}};return {...actual,useState:(initial:any)=>{const at=hooks.cursor++;if(!(at in hooks.cells))hooks.cells[at]=typeof initial==='function'?initial():initial;return[hooks.cells[at],(value:any)=>{hooks.cells[at]=typeof value==='function'?value(hooks.cells[at]):value;}];},useRef:(initial:any)=>{const at=hooks.cursor++;if(!(at in hooks.cells))hooks.cells[at]={current:initial};return hooks.cells[at];},useMemo:(fn:()=>any)=>fn(),useCallback:(fn:any)=>fn,useEffect:effect,useLayoutEffect:effect};});
const text=(value:any):string=>typeof value==='string'?value:typeof value==='number'?String(value):Array.isArray(value)?value.map(text).join(''):value?.props?text(value.props.children):'';
function findAll(tree:any,match:(node:ReactElement<any>)=>boolean):ReactElement<any>[]{const found:ReactElement<any>[]=[];const visit=(node:any)=>{if(Array.isArray(node)){node.forEach(visit);return;}if(!node?.props)return;if(match(node))found.push(node);visit(node.props.children);};visit(tree);return found;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});

let made=0;
/** One inactive tab whose selected cell shows `datasetId` for `symbol`. */
function tabFor(symbol:string,datasetId:string){
 const state=createInitialWorkspace(),book=state.layoutLibrary!,grid:any=state.grid!,cellId=grid.layout.activeCellId;
 const cell={...grid,layout:{...grid.layout,cells:grid.layout.cells.map((row:any)=>row.id===cellId?{...row,symbol}:row)},cells:{...grid.cells,[cellId]:{...grid.cells[cellId],datasetId}}};
 return duplicateSavedLayout(book,grid,cell,symbol+' layout',100,()=>'tab-'+(++made)).entry;
}

describe('inactive example-data tab',()=>{
 it('shows its main chart\'s last close (and change when known), not the plain "SPY / Unnamed" label',()=>{
  const spy=fixtureDataset('SPY',300),entry=tabFor('SPY',spy.provenance.datasetId);
  const quote=inactiveTabQuote(entry,[spy],{})!;
  expect(quote.symbol).toBe('SPY');expect(quote.priceText).toMatch(/^[0-9,]+\.[0-9]{2}$/);
  // The same quote the active tab shows for that chart.
  expect(quote).toEqual(layoutTabQuote(spy,[spy],null));
  // Not loaded: the plain label; a cell showing another symbol's data is never labelled with it.
  expect(inactiveTabQuote(entry,[],{})).toBeNull();
  expect(inactiveTabQuote(tabFor('QQQ',spy.provenance.datasetId),[spy],{})).toBeNull();
 });
 it('on an intraday interval (5m, 1h) shows the intraday last price and the daily change, though its series is not in the universe',()=>{
  const daily=fixtureDataset('SPY',300),dailyChange=layoutTabQuote(daily,[daily],null)!.changePercent;expect(dailyChange).not.toBeNull();
  for(const resolution of ['5m','60m']){
   const series=demoIntradaySources('SPY').find(row=>row.resolution===resolution)!,quote=inactiveTabQuote(tabFor('SPY',series.provenance.datasetId),[daily],{})!;
   expect(quote.symbol).toBe('SPY');expect(quote.priceText).toBe(layoutTabPrice(series.bars.at(-1)!.close,series.instrument.tickSize));
   expect(quote.changePercent).toBe(dailyChange);
  }
  // Example data hidden: the intraday placeholder has no bars, so the tab keeps its plain label.
  setDemoDataMode('off');try{expect(inactiveTabQuote(tabFor('SPY','lv-synthetic-v1:SPY:60m'),[],{})).toBeNull();}finally{setDemoDataMode('legacy');}
 });
});

describe('crypto daily change',()=>{
 const day=86400,today=Date.UTC(2026,9,31)/1000;
 const bar=(time:number,close:number):Bar=>({time,open:close,high:close,low:close,close,volume:1});
 const series=(resolution:string,bars:Bar[]):BarDataset=>({instrument:coinbaseInstrument('BTC-USD' as any),resolution,bars,provenance:{providerId:COINBASE_PROVIDER_ID,providerName:'Coinbase',datasetId:'live:'+COINBASE_PROVIDER_ID+':BTC-USD:'+resolution,fixture:false} as any});
 const ref=(dataset:BarDataset)=>({symbol:'BTC-USD',exchange:'COINBASE',datasetId:dataset.provenance.datasetId,dailyDatasetId:null,synthetic:false}) as any;
 it('compares Last with the previous UTC daily close all day (a 5m chart never reads 0.00% after New York midnight)',()=>{
  // 14:00 UTC (10:00 New York): the UTC day's daily bar is open and tracks Last.
  const now=today+14*3600,daily=series('1D',[bar(today-2*day,98),bar(today-day,100),bar(today,110)]),intraday=series('5m',[bar(now-300,109),bar(now,110)]);
  const quote=watchQuote(ref(intraday),[intraday,daily]);
  expect(quote.changePercent).toBeCloseTo(10,6);expect(quote.previousClose).toBe(100);
  expect(layoutTabQuote(intraday,[intraday,daily])!.changePercent).toBeCloseTo(10,6);
  // 02:00 UTC (22:00 New York the day before): still against the previous UTC close.
  const early=series('5m',[bar(today+2*3600,105)]);
  expect(watchQuote(ref(early),[early,series('1D',[bar(today-day,100),bar(today,105)])]).changePercent).toBeCloseTo(5,6);
 });
});

describe('tab row scrolling',()=>{
 it('turns the wheel into a sideways scroll only when the row overflows',()=>{
  const strip={scrollLeft:0,scrollWidth:900,clientWidth:400};
  tabStripWheel({deltaX:0,deltaY:120,currentTarget:strip});expect(strip.scrollLeft).toBe(120);
  tabStripWheel({deltaX:40,deltaY:10,currentTarget:strip});expect(strip.scrollLeft).toBe(120);
  const fits={scrollLeft:0,scrollWidth:400,clientWidth:400};tabStripWheel({deltaX:0,deltaY:120,currentTarget:fits});expect(fits.scrollLeft).toBe(0);
  const scrollIntoView=vi.fn();revealTab({scrollIntoView});expect(scrollIntoView).toHaveBeenCalledWith({block:'nearest',inline:'nearest'});revealTab(null);
 });
});

describe('5,000-bar note',()=>{
 const binding:ScriptBinding={id:'bound',documentId:'doc',version:1,name:'Daily ATR panel',source:'({onBar(){}})',pane:'price',visible:true,plots:{},paneId:null,ownScale:false};
 const base={open:true,onClose:vi.fn(),chart:null,fixture:true,identity:'Synthetic tail',library:createScriptLibrary(initialScript),onChange:vi.fn(),bindings:[binding],onBindingsChange:vi.fn()};
 const bars=(count:number)=>Array.from({length:count},(_,index)=>({time:index*300,open:1,high:1,low:1,close:1,volume:1}));
 const notes=(tree:any)=>findAll(tree,node=>node.props.className==='lv-script-tail-note');
 it('stays beside each script on this chart while the chart has more than 5,000 bars',()=>{
  expect(scriptTailNote(7800)).toBe(SCRIPT_TAIL_NOTE);expect(scriptTailNote(5000)).toBe('');expect(scriptRunCount(7800)).toBe(5000);expect(scriptRunCount(120)).toBe(120);
  const long=notes(ScriptLibraryPanel({...base,bars:bars(7800)}));expect(long).toHaveLength(1);expect(text(long[0])).toBe('Calculated on the latest 5,000 bars.');
  hooks.cells=[];hooks.cursor=0;expect(notes(ScriptLibraryPanel({...base,bars:bars(5000)}))).toHaveLength(0);
 });
});
