import {describe,expect,it} from 'vitest';
import {PAPER_DERIVED_REFUSAL,derivedPaperRefusal,isDerivedInstrument,symbolMathDatasetId,symbolMathInstrument,SYMBOL_MATH_PROVIDER_ID} from '../../src/domain/symbol-math-live';
import {isCanonicalSymbolMath,isMarketSymbol} from '../../src/domain/symbol-math';
import {pricePlusMenu} from '../../src/chart/price-scale-plus';
import {tradeSubmenuEntries} from '../../src/ui/ChartContextMenu';
import {createWatchBook,importWatchText,restoreWatchBook,restoreWatchReference,activeWatchList} from '../../src/watchlists/model';
import {derivedWatchReference,planWatchFeeds} from '../../src/watchlists/live-watch';
import {readRecentSymbols,recentSymbolRows,rememberRecentSymbol} from '../../src/ui/symbol-search';
import {secondSymbolDemand,secondSymbolKey} from '../../src/ui/second-symbol-demand';
import {fixtureInstrument} from '../../src/domain/fixtures';

// follow-ups (paper refusal, watchlists and recents, second-symbol demand). All data is SYNTHETIC and made up
// for these tests; no feed opens, no key is read.

describe(' follow-up 1: paper trading is refused on derived symbols',()=>{
 it('names the derived instrument and dataset, never a ticker',()=>{
  expect(PAPER_DERIVED_REFUSAL).toBe('Paper trading is not available on derived symbols.');
  expect(isDerivedInstrument(symbolMathInstrument('GME/SPY'))).toBe(true);
  expect(isDerivedInstrument(fixtureInstrument('GME'))).toBe(false);
  expect(derivedPaperRefusal({datasetId:symbolMathDatasetId('GME/SPY','1D')})).toBe(PAPER_DERIVED_REFUSAL);
  expect(derivedPaperRefusal({instrument:fixtureInstrument('GME'),datasetId:'live:alpaca-iex:GME:1D'})).toBeNull();
 });
 it('the + menu keeps alert and line rows but disables both order rows with the reason',()=>{
  const rows=pricePlusMenu({price:10,text:'10.00',last:9,symbol:'GME/SPY',host:true,line:true,paperRefusal:PAPER_DERIVED_REFUSAL});
  expect(rows.map(row=>[row.id,row.disabled??null])).toEqual([['alert',null],['sell-limit',PAPER_DERIVED_REFUSAL],['buy-stop',PAPER_DERIVED_REFUSAL],['hline',null]]);
  expect(pricePlusMenu({price:10,text:'10.00',last:9,symbol:'GME',host:true,line:true}).every(row=>!row.disabled)).toBe(true);
 });
 it('the context menu Trade submenu has no order rows on a derived symbol',()=>{
  const snapshot=(instrument:object)=>({instrument,point:{price:10},input:{bars:[{close:9}]}}) as never;
  expect(tradeSubmenuEntries(snapshot(symbolMathInstrument('GME/SPY')))).toEqual([]);
  expect(tradeSubmenuEntries(snapshot(fixtureInstrument('GME'))).length).toBe(4);// two orders, the ticket and the strategy GUI's Open DOM row
 });
});

describe(' follow-up 3: derived symbols in watchlists and recents',()=>{
 it('a watchlist row may hold a canonical expression on the DERIVED exchange only',()=>{
  const reference=derivedWatchReference(' gme / spy ')!;
  expect(reference).toEqual({symbol:'GME/SPY',exchange:'DERIVED',datasetId:symbolMathDatasetId('GME/SPY','1D'),dailyDatasetId:null,synthetic:false});
  expect(restoreWatchReference(reference)).toEqual(reference);
  expect(()=>restoreWatchReference({...reference,exchange:'NASDAQ'})).toThrow();
  expect(()=>restoreWatchReference({...reference,symbol:'GME / SPY'})).toThrow();
  expect(derivedWatchReference('GME')).toBeNull();
  expect(isMarketSymbol('GME/SPY')).toBe(true);expect(isMarketSymbol('GME/SPY','US')).toBe(false);expect(isCanonicalSymbolMath('GME')).toBe(false);
 });
 it('a derived row survives a watch book round trip and streams its derived daily feed, counting its Alpaca components',()=>{
  const base=createWatchBook(['GME']),list=activeWatchList(base);
  const book=restoreWatchBook({...base,lists:[{...list,rows:[...list.rows,{id:'d1',kind:'symbol',reference:derivedWatchReference('GME/SPY')}]}]});
  expect(activeWatchList(book).rows.at(-1)).toMatchObject({kind:'symbol',reference:{symbol:'GME/SPY',exchange:'DERIVED'}});
  const plan=planWatchFeeds({book,taken:new Set()});
  expect(plan.feeds).toEqual([{datasetId:symbolMathDatasetId('GME/SPY','1D'),providerId:SYMBOL_MATH_PROVIDER_ID,symbol:'GME/SPY',resolution:'1D',priority:'watch',marketKey:'DERIVED:GME/SPY'}]);
  const full=planWatchFeeds({book,taken:new Set(['AAA']),max:2});// GME and SPY would make 3
  expect(full.feeds).toEqual([]);expect(full.notes.get('DERIVED:GME/SPY')?.text).toBe('NO LIVE');
 });
 it('watchlist text import accepts DERIVED:<expression>',()=>{
  const book=importWatchText(createWatchBook(['GME']),'US:GME,DERIVED:GME/SPY,DERIVED:GME-SPY','l2','Spreads',(()=>{let i=0;return()=>'r'+(++i);})());
  const rows=book.lists.find(row=>row.id==='l2')!.rows.map(row=>row.kind==='symbol'?[row.reference.exchange,row.reference.symbol,row.reference.datasetId]:null);
  expect(rows).toEqual([['US','GME',null],['DERIVED','GME/SPY',symbolMathDatasetId('GME/SPY','1D')],['DERIVED','GME-SPY',symbolMathDatasetId('GME-SPY','1D')]]);
 });
 it('recent symbols keep derived expressions and list them as Derived rows',()=>{
  const store=new Map<string,string>(),storage={getItem:(key:string)=>store.get(key)??null,setItem:(key:string,value:string)=>{store.set(key,value);}};
  rememberRecentSymbol(storage,'GME');rememberRecentSymbol(storage,'GME/SPY');rememberRecentSymbol(storage,'GME / SPY');// non-canonical text is not stored
  expect(readRecentSymbols(storage)).toEqual(['GME/SPY','GME']);
  const rows=recentSymbolRows([],readRecentSymbols(storage),'1D');
  expect(rows.map(row=>[row.symbol,row.sourceKind,row.openable])).toEqual([['GME/SPY','expression',true]]);
 });
});

describe(' follow-up 4: second-symbol feeds follow indicator use',()=>{
 it('names each two-symbol indicator series on the charts, at its own timeframe or the chart interval',()=>{
  const grid={layout:{cells:[{id:'a',interval:'60m'},{id:'b',interval:'1D'}]},cells:{
   a:{indicators:[{kind:'correlation',inputs:{}},{kind:'spread',inputs:{symbol:'qqq'},presentation:{timeframe:{schemaVersion:1,interval:'1D',waitForClose:true}}},{kind:'rsi',inputs:{}}]},
   b:{indicators:[{kind:'relstrength',inputs:{symbol:'gme / spy'}},{kind:'spread',inputs:{symbol:'GME/'}}]}}} as never;
  expect([...secondSymbolDemand(grid)].sort()).toEqual([secondSymbolKey('GME/SPY','1D'),secondSymbolKey('QQQ','1D'),secondSymbolKey('SPY','60m')].sort());
  expect(secondSymbolDemand(null).size).toBe(0);
 });
});
