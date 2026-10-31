import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import React from 'react';
import {WatchlistPanel} from '../../src/ui/WatchlistPanel';
import {SymbolDetails} from '../../src/ui/SymbolDetails';
import {ObjectTreePanel} from '../../src/ui/ObjectTreePanel';
import {PaperOrderTicket} from '../../src/ui/PaperOrderTicket';
import {MultiChartGrid,createMultiChartState} from '../../src/ui/MultiChartGrid';
import {StreamStatusLine} from '../../src/ui/LiveDataSettings';
import * as appPreferences from '../../src/ui/AppPreferencesSection';
import {DataSourcesPanel} from '../../src/ui/data-sources-panel';
import {activeWatchList,createWatchBook,referenceFromDataset,setWatchColumnVisible} from '../../src/watchlists/model';
import {addWatchMembers} from '../../src/watchlists/membership';
import {fixtureDataset} from '../../src/domain/fixtures';
import {liveQuotes,LIVE_QUOTE_STALE_MS} from '../../src/domain/live-quotes';
import {createPaperAccount,processPaperQuote} from '../../src/domain/paper';
import {stampLiveLineage} from '../../src/chart/bar-input-identity';
import {clearLiveDatasets,registerLiveDataset} from '../../src/ui/live-registry';
import {timezoneOptions} from '../../src/chart/chart-settings-facts';
import {APP_PREFERENCE_DEFAULTS} from '../../src/ui/app-preferences';
import {defaultTheme} from '../../src/ui/themes';
import {objectTreeHarness,find as findTree,event as treeEvent} from './object-tree-panel-harness';
import type {BarDataset,Instrument,Quote} from '../../src/domain/types';

// Real components under controlled hooks (useState/useRef/useMemo positional; an effect runs when its deps
// change, unless `filter` says otherwise). SYNTHETIC data only; no DOM, paint or packaged GUI claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,cleanups:new Map<number,()=>void>(),filter:null as null|((fn:()=>unknown)=>boolean)}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const same=(a:any[],b:any[])=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const effect=(fn:()=>any,deps?:any[])=>{const i=hooks.cursor++;if(deps&&(i in hooks.cells)&&same(hooks.cells[i],deps))return;hooks.cells[i]=deps??null;if(hooks.filter&&!hooks.filter(fn))return;hooks.cleanups.get(i)?.();hooks.cleanups.delete(i);const cleanup=fn();if(typeof cleanup==='function')hooks.cleanups.set(i,cleanup);};
 const memo=(fn:()=>any,deps:any[])=>{const i=hooks.cursor++;if(!(i in hooks.cells)||!same(hooks.cells[i].deps,deps))hooks.cells[i]={deps,value:fn()};return hooks.cells[i].value;};
 return{...actual,
  useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
  useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},
  useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:effect,useLayoutEffect:effect,
  useSyncExternalStore:(_subscribe:any,snapshot:()=>any)=>{hooks.cursor++;return snapshot();}};
});
const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function findAll(node:any,test:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))node.forEach(child=>findAll(child,test,out));else if(node?.props){if(test(node))out.push(node);findAll(node.props.children,test,out);}return out;}
const find=(node:any,test:(node:any)=>boolean)=>findAll(node,test)[0]??null;
const reset=()=>{for(const cleanup of hooks.cleanups.values())try{cleanup();}catch{/* a disposed harness */}hooks.cleanups.clear();hooks.cells=[];hooks.cursor=0;hooks.filter=null;};
beforeEach(()=>{reset();vi.useFakeTimers();liveQuotes.reset();clearLiveDatasets();vi.stubGlobal('document',{querySelector:()=>null,addEventListener:vi.fn(),removeEventListener:vi.fn(),activeElement:null});vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});});
afterEach(()=>{reset();vi.useRealTimers();vi.unstubAllGlobals();liveQuotes.reset();clearLiveDatasets();});

// ---- 1. WatchlistPanel clock -------------------------------------------------------------------------------------------
const ET=(h:number,m=0,s=0)=>Date.UTC(2026,9,21,h+4,m,s); // ms, EDT, Wednesday 2026-10-21
const ny=(symbol:string,closes:number[]):BarDataset=>{const base=fixtureDataset(symbol,closes.length);return{...base,resolution:'1D',instrument:{...base.instrument,id:'NYSE:'+symbol,exchange:'NYSE',timezone:'America/New_York',assetClass:'stock'},provenance:{...base.provenance,providerId:'r35-test',providerName:'Synthetic test provider',datasetId:'r35:'+symbol,fixture:false,session:'regular'},bars:closes.map((close,index)=>({time:1767225600+index*86400,open:close,high:close,low:close,close,volume:100}))};};
let ids=0;const id=()=>'r35-'+(++ids);
function watch(columns:string[]=[]){
 const gme=ny('GME',[10,12]);let book=createWatchBook([]);book=addWatchMembers(book,activeWatchList(book).id,[referenceFromDataset(gme)],id).book;
 for(const column of columns)book=setWatchColumnVisible(book,column as never,true);
 const props:any={book,datasets:[gme],onChange:vi.fn(()=>true),onOpen:vi.fn(()=>true),onOpenAll:vi.fn(()=>true)};
 const render=()=>{hooks.cursor=0;return WatchlistPanel(props);},row=activeWatchList(book).rows[0]!.id;
 const cells=()=>find(render(),node=>node.type==='tr'&&node.key===row).props.children as any[];
 const cell=(column:string)=>cells().find((node:any)=>node.key===column);
 const dot=()=>find(cell('symbol'),(node:any)=>node.props?.className==='wl-status')?.props['data-state'];
 const status=()=>{const details=find(render(),node=>node.type===SymbolDetails);return details?.props.snapshot.blocks.summary.find((field:any)=>field.label==='Current market status')?.value;};
 return{gme,props,render,row,cell,dot,status,select:()=>find(render(),node=>node.type==='tr'&&node.key===row).props.onClick({ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,detail:1,clientX:1,clientY:1,preventDefault:vi.fn(),stopPropagation:vi.fn()})};
}

it('the watchlist market-status dot and the details "Current market status" change at 09:30 without a new quote',()=>{
 vi.setSystemTime(ET(9,29,30));const ui=watch();ui.select();
 expect(ui.dot()).toBe('pre');expect(ui.status()).toBe('Pre-market, OpenCandle calendar');
 vi.advanceTimersByTime(31_000);ui.render(); // 09:30:01: one timeout fired, no quote arrived
 expect(ui.dot(),'the dot follows the session boundary').toBe('open');
 expect(ui.status(),'the details memo follows the clock').toBe('Regular session open, OpenCandle calendar');
});

it('watchlist Bid and Ask clear when the live quote turns stale, with no new quote and no other render',()=>{
 vi.setSystemTime(ET(10,0,20));const receivedAt=Date.now();
 liveQuotes.publish({instrumentId:'NYSE:GME',symbol:'GME',providerId:'r35-test',feed:'iex',bid:11.9,ask:12.1,bidSize:1,askSize:1,time:receivedAt/1000,receivedAt,synthetic:true});
 const ui=watch(['bid','ask']);
 expect(text(ui.cell('bid'))).toContain('11.9');
 const staleAt=receivedAt+LIVE_QUOTE_STALE_MS;
 // Only the panel's own timeouts drive renders here (each fire is followed by the render React would do).
 for(let step=0;step<20&&Date.now()<=staleAt;step++){vi.advanceTimersToNextTimer();ui.render();}
 expect(Date.now()-staleAt,'a timeout fired right after the quote turned stale').toBeLessThanOrEqual(1);
 expect(text(ui.cell('bid')),'Bid is no longer shown').not.toContain('11.9');
 expect(text(ui.cell('ask'))).not.toContain('12.1');
});

it(' guard: the watchlist clock is still one timeout at a time (no repeating timer)',()=>{
 vi.setSystemTime(ET(10,0,20));const ui=watch();ui.render();
 expect(vi.getTimerCount()).toBe(1);vi.runAllTimers();expect(vi.getTimerCount(),'runAllTimers terminates: nothing re-arms without a render').toBe(0);
});

// ---- 2. GridCell pre/post-market label ---------------------------------------------------------------------------------
it('the grid cell pre/post-market label follows the streamed live bars, not the dataset prop',()=>{
 const at=(h:number,m:number)=>ET(h,m)/1000,bar=(time:number,close:number)=>({time,open:close,high:close,low:close,close,volume:1});
 const base=fixtureDataset('ETHX',2),instrument:Instrument={...base.instrument,id:'SYNTHETIC:ETHX',symbol:'ETHX',exchange:'NYSE',assetClass:'stock',timezone:'America/New_York'};
 const first=[bar(at(15,50),11),bar(at(15,55),11.1)],next=[...first,bar(at(16,5),11.4)];
 stampLiveLineage(first,'live:r35-ethx|1',1);stampLiveLineage(next,'live:r35-ethx|1',2);
 const dataset:BarDataset={...base,instrument,resolution:'5',bars:first,provenance:{...base.provenance,datasetId:'live:r35-ethx',fixture:true}};
 registerLiveDataset({...dataset,bars:next}); // the feed already streamed a post-market bar; App has not re-rendered the cell
 const state=createMultiChartState(dataset,{appearance:defaultTheme.appearance});
 hooks.cursor=0;const grid=MultiChartGrid({state,datasets:[dataset],activeBars:first,activeDatasetId:dataset.provenance.datasetId,activeExecutionIdentity:'ordinary',appearance:defaultTheme.appearance,onReady:()=>{},onActiveCell:()=>{},onChange:()=>true,onOpenSettings:()=>{},zoomArmed:false,zoomTimeAt:()=>null,zoomBarInterval:()=>60,zoomRange:()=>{},zoomCancel:()=>{},newChartTimezone:()=>'UTC',onDrawingSyncChange:()=>{},drawingSyncOn:false} as any);
 const cell=findAll(grid,node=>typeof node.type==='function'&&node.type.name==='GridCell')[0];expect(cell).toBeTruthy();
 // The cell in its own hook scope: its chart is a SYNTHETIC stand-in, and only the live-bars and pre/post effects run.
 reset();const prices:any[]=[];hooks.cells[0]={setPrePostPrice:(value:unknown)=>prices.push(value)};
 hooks.filter=fn=>/setPrePostPrice|subscribeLiveDataset/.test(String(fn));
 const renderCell=()=>{hooks.cursor=0;return cell.type(cell.props);};
 renderCell();renderCell();
 expect(prices.at(-1),'the post-market price of the streamed 16:05 bar').toMatchObject({price:11.4,phase:'post'});
});

// ---- 3. ObjectTreePanel cache keyed by interval ------------------------------------------------------------------------
it('the object tree re-reads "hidden on this interval" after an interval switch that keeps the native drawings',async()=>{
 const h=await objectTreeHarness();
 try{
  const list=h.manager.list.bind(h.manager);
  (h.chart as any).drawingManager={...h.manager,list:()=>list().map((row:any)=>row.id==='line-a'?{...row,lvIntervalVisibility:{schemaVersion:1,mode:'include',resolutions:['60m']}}:row),state:()=>h.manager.state()};
  const dataset={instrument:{id:'synthetic',symbol:'SYNTH',name:'SYNTHETIC fixture',exchange:'LOCAL',currency:'USD',assetClass:'stock' as const,tickSize:0.01,lotSize:1,timezone:'UTC'},resolution:'60m'};
  // A renderer whose native objects keep their identity (the real adapter's; this facade returns fresh objects per call).
  const natives=h.facade.all();(h.chart as any).drawings=new Proxy(h.facade,{get:(target,key)=>key==='all'?()=>natives:Reflect.get(target,key)});
  const props:any={chart:h.chart,dataset,indicators:[],onError:vi.fn()};
  const render=()=>{hooks.cursor=0;return ObjectTreePanel(props);};
  const hidden=()=>{const row=findTree(render(),node=>node.props?.['data-node-key']==='drawing:line-a');return findTree(row,node=>node.type==='button'&&node.props['data-name']==='hide').props['aria-label'];};
  render();const shown=hidden();
  props.dataset={...dataset,resolution:'1D'};
  expect(hidden(),'the eye follows the new interval').not.toBe(shown);
  props.dataset={...dataset,resolution:'60m'};expect(hidden()).toBe(shown);
  void treeEvent;
 }finally{reset();h.dispose();}
});

// ---- 4. PaperOrderTicket review follows quoteSource --------------------------------------------------------------------
it('the order ticket review follows a quote source that turns stale',()=>{
 const instrument:Instrument={id:'SYNTHETIC:TKT',symbol:'TKT',name:'Synthetic ticket',exchange:'SYNTHETIC',currency:'USD',assetClass:'stock',timezone:'America/New_York',tickSize:0.01,lotSize:1};
 const now=ET(11)/1000,quote:Quote={instrumentId:instrument.id,bid:9.99,ask:10,eventTime:now,receivedAt:now,availableAt:now,sequence:1,fixture:true,session:'regular'} as Quote;
 const account=processPaperQuote(createPaperAccount({initialBalance:1000,now}),quote,now,undefined,instrument).account;
 const props:any={account,instrument,quote,quoteSource:{key:'SYNTHETIC ticket source',state:'ready'},now,side:'buy',tab:'market',onAccountChange:()=>true,onDone:()=>{}};
 const render=()=>{hooks.cursor=0;return PaperOrderTicket(props);};
 const submit=()=>findAll(render(),node=>node.type==='button'&&node.props.type==='submit')[0];
 expect(submit().props.disabled).toBe(false);
 props.quoteSource={key:'SYNTHETIC ticket source',state:'stale'};
 expect(submit().props.disabled,'a stale source cannot be priced').toBe(true);
 expect(text(render())).toContain('Selected quote source is stale.');
});

// ---- 5. Data sources clock reads ---------------------------------------------------------------------------------------
it('the connected stream line re-renders at 20:00 to say "Market closed" while the panel stays open',()=>{
 // The line reads the clock while it renders, so the fix is a scheduled re-render: one timeout at the next whole minute.
 vi.setSystemTime(ET(19,59,30));
 const props={status:{schemaVersion:1,state:'ready',feed:'iex',attempt:0,lastMessageAt:null,liveMessages:true,lastError:null,counters:{},symbols:[]} as any};
 const render=()=>{hooks.cursor=0;return StreamStatusLine(props);};
 expect(text(render())).toBe('Live stream connected (IEX).');
 expect(vi.getTimerCount(),'a re-render is scheduled').toBe(1);
 vi.advanceTimersToNextTimer();
 expect(Date.now()-ET(20),'at the minute boundary').toBeLessThan(1000);expect(Date.now()).toBeGreaterThanOrEqual(ET(20));
 expect(hooks.cells[0],'the tick state moved, so React re-renders the line').toBe(1);
 expect(text(render())).toContain('Market closed');
 expect(vi.getTimerCount(),'re-armed by that render, one at a time').toBe(1);
 props.status={...props.status,state:'connecting'};render();expect(vi.getTimerCount(),'no timer unless connected').toBe(0);
});

it('the Default chart timezone labels change at a DST change while the General tab stays open',()=>{
 const Clocked=(appPreferences as any).ClockedAppPreferencesSection;expect(Clocked,'a clocked General section exists').toBeTypeOf('function');
 // Europe/London leaves BST at 01:00 UTC on 2026-10-25.
 vi.setSystemTime(Date.UTC(2026,9,25,0,59,30));
 const props={preferences:{...APP_PREFERENCE_DEFAULTS},trayAvailable:true,onChange:()=>undefined};
 const london=()=>{hooks.cursor=0;const section=Clocked(props);hooks.cursor=50;const tree=section.type(section.props);return findAll(tree,node=>node.type==='option'&&node.props.value==='Europe/London')[0]?.props.children;};
 expect(london()).toBe('(UTC+1) London');
 expect(vi.getTimerCount(),'a re-render is scheduled').toBe(1);vi.advanceTimersToNextTimer();
 expect(Date.now()-Date.UTC(2026,9,25,1)).toBeLessThan(1000);expect(hooks.cells[0],'the tick state moved').toBe(1);
 expect(london(),'relabelled after the change').toBe('(UTC) London');
 // Data sources no longer renders the preferences; the General tab does.
 const panel=DataSourcesPanel({live:{} as any,storage:{} as any});
 expect(findAll(panel,node=>node.type===Clocked)).toHaveLength(0);
});

it('timezone offsets are recomputed on a half-hour UTC DST change (Australia/Adelaide, 16:30 UTC)',()=>{
 // Adelaide starts daylight time at 02:00 ACST (UTC+9:30) on 2026-10-04 = 16:30 UTC on 2026-10-03.
 const label=(ms:number)=>timezoneOptions(new Date(ms)).find(row=>row.value==='Australia/Adelaide')?.label;
 expect(label(Date.UTC(2026,9,3,16,10))).toBe('(UTC+9:30) Adelaide');
 expect(label(Date.UTC(2026,9,3,16,40)),'same UTC hour, after the change').toBe('(UTC+10:30) Adelaide');
});

it(' guard: the Default chart timezone section still renders statically',()=>{
 const html=renderToStaticMarkup(React.createElement(appPreferences.AppPreferencesSection,{preferences:{...APP_PREFERENCE_DEFAULTS},trayAvailable:true,onChange:()=>undefined,at:new Date(Date.UTC(2026,9,22,12))}));
 expect(html).toContain('London');
});
