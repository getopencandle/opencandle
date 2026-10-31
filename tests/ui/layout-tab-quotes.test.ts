import {describe,expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {duplicateSavedLayout,type LayoutLibrary} from '../../src/ui/layout-library';
import {inactiveTabQuote,layoutTabFeeds,layoutTabLiveSource,layoutTabsView} from '../../src/ui/LayoutTabs';
import {wickStripSnapshot} from '../../src/ui/wick-mode';
import type {BarDataset} from '../../src/domain/types';

// Every layout tab shows its own main chart's live quote. SYNTHETIC fixtures only (generated bars relabelled as live feeds).
function find(node:any,predicate:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))node.forEach(child=>find(child,predicate,out));else if(node?.props){if(predicate(node))out.push(node);find(node.props.children,predicate,out);}return out;}
const text=(node:any):string=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
const live=(symbol:string,resolution:string,provider='alpaca-iex'):BarDataset=>{const base=fixtureDataset(symbol,300);return{...base,resolution,provenance:{...base.provenance,providerId:provider,datasetId:'live:'+provider+':'+symbol+':'+resolution,fixture:false}};};
/** A library of tabs, each one layout whose selected cell shows `datasetId` for `symbol`. */
function library(rows:Array<[string,string]>):{book:LayoutLibrary;open:string[];grid:any}{
 const state=createInitialWorkspace();let book=state.layoutLibrary!,n=0;const open=[book.activeId];
 const cellOf=(grid:any,symbol:string,datasetId:string)=>{const cellId=grid.layout.activeCellId;return{...grid,layout:{...grid.layout,cells:grid.layout.cells.map((row:any)=>row.id===cellId?{...row,symbol}:row)},cells:{...grid.cells,[cellId]:{...grid.cells[cellId],datasetId}}};};
 for(const [symbol,datasetId] of rows){const made=duplicateSavedLayout(book,state.grid!,cellOf(state.grid!,symbol,datasetId),symbol+' layout',100,()=>'tab-'+(++n));book=made.library;open.push(made.entry.id);}
 return{book:{...book,activeId:open[0]},open,grid:state.grid!};
}

describe('per-tab quotes',()=>{
 it('a tab reads its selected cell: live stock and crypto charts have a source, demo charts have none',()=>{
  const {book,open}=library([['GME','live:alpaca-iex:GME:5m'],['BTC-USD','live:coinbase-public:BTC-USD:1D'],['SPY','fixture:SPY']]);
  const entry=(id:string)=>book.entries.find(row=>row.id===id)!;
  expect(layoutTabLiveSource(entry(open[1]))).toEqual({providerId:'alpaca-iex',symbol:'GME',datasetIds:['live:alpaca-iex:GME:5m','live:alpaca-iex:GME:1D']});
  expect(layoutTabLiveSource(entry(open[2]))).toEqual({providerId:'coinbase-public',symbol:'BTC-USD',datasetIds:['live:coinbase-public:BTC-USD:1D']});
  expect(layoutTabLiveSource(entry(open[3]))).toBeNull();
 });
 it('an inactive tab shows its price and change from an open feed, and its plain label when none is open',()=>{
  const {book,open,grid}=library([['GME','live:alpaca-iex:GME:5m'],['SPY','fixture:SPY']]);
  const daily=live('GME','1D'),entry=book.entries.find(row=>row.id===open[1])!;
  const quote=inactiveTabQuote(entry,[daily])!;expect(quote.symbol).toBe('GME');expect(quote.priceText).toMatch(/^[0-9,]+\.[0-9]{2}$/);expect(quote.changePercent).not.toBeNull();
  expect(inactiveTabQuote(entry,[])).toBeNull();
  const view=layoutTabsView({library:book,grid,open,ui:{},quotes:{[open[1]]:quote,[open[2]]:null},onUi:()=>{},onSwitch:()=>{},onClose:()=>{},onRename:()=>{},onMove:()=>{}});
  const tabs=find(view,node=>node.props?.role==='tab');
  expect(find(tabs[1],node=>node.props?.className==='lv-layout-tab-price').length).toBe(1);
  expect(text(find(tabs[1],node=>node.props?.className==='lv-layout-tab-symbol'))).toBe('GME');
  expect(tabs[1].props.title).toContain('GME '+quote.priceText);
  expect(find(tabs[2],node=>node.props?.className==='lv-layout-tab-price')).toHaveLength(0);
  const snapshot=wickStripSnapshot({library:book,grid,open,quotes:{[open[1]]:quote},theme:{}})!;
  expect(snapshot.tabs[1]).toMatchObject({symbol:'GME',price:quote.priceText});expect(snapshot.tabs[2].price).toBeUndefined();
 });
 it('plans one background daily feed per inactive live tab, after everything else, never past the Alpaca limit',()=>{
  const {book,open}=library([['GME','live:alpaca-iex:GME:5m'],['AAPL','live:alpaca-iex:AAPL:1D'],['BTC-USD','live:coinbase-public:BTC-USD:1m'],['SPY','fixture:SPY']]);
  const feeds=layoutTabFeeds({library:book,open,taken:new Set(),planned:[],charted:new Set()});
  expect(feeds.map(feed=>feed.datasetId)).toEqual(['live:alpaca-iex:GME:1D','live:alpaca-iex:AAPL:1D','live:coinbase-public:BTC-USD:1D']);
  expect(feeds.every(feed=>feed.marketKey.startsWith('layout-tab:')&&feed.priority==='watch')).toBe(true);
  // 29 slots used by charts and the watchlist: one tab stock fits, the next gets no price; crypto is not counted.
  const taken=new Set(Array.from({length:28},(_,i)=>'S'+i)),planned=[{datasetId:'live:alpaca-iex:W:1D',providerId:'alpaca-iex',symbol:'W',resolution:'1D',priority:'watch' as const,marketKey:'X:W'}];
  expect(layoutTabFeeds({library:book,open,taken,planned,charted:new Set()}).map(feed=>feed.symbol)).toEqual(['GME','BTC-USD']);
  // A symbol already streaming costs no slot; a feed already open is not planned twice; the active tab is not planned.
  expect(layoutTabFeeds({library:book,open,taken:new Set([...taken,'X','AAPL']),planned,charted:new Set(['live:alpaca-iex:GME:1D'])}).map(feed=>feed.symbol)).toEqual(['AAPL','BTC-USD']);
  expect(layoutTabFeeds({library:{...book,activeId:open[1]},open:[open[1]],taken:new Set(),planned:[],charted:new Set()})).toEqual([]);
 });
});
