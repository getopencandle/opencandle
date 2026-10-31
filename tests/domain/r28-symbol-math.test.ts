import {describe,expect,it} from 'vitest';
import {combineSymbolMathBars,evaluateSymbolMath,isSymbolMathText,parseSymbolMath} from '../../src/domain/symbol-math';
import {SymbolMathProvider,SYMBOL_MATH_PROVIDER_ID,symbolMathPlaceholder,staticComponentHandle,symbolMathCapError,symbolMathDatasetId,symbolMathRefOf,SYNTHETIC_DERIVED_MIX_REFUSAL} from '../../src/domain/symbol-math-live';
import {selectAlpacaSyntheticStub} from '../../src/domain/alpaca-live';
import type {LiveHandle} from '../../src/domain/live-provider';
import {isLiveDatasetId,isFormingLiveDataset} from '../../src/domain/live-provider';
import {liveLineageOf,newerLiveBars} from '../../src/chart/bar-input-identity';
import {comparisonSourceTag} from '../../src/chart/compare-port';
import {liveChartPlaceholder,liveRefOfDatasetId,liveSourceEnabled,restoreLiveCharts,symbolMathIntervals,liveSiblings} from '../../src/ui/live-workspace';
import {searchSymbols,symbolMathCandidates,syntheticGenerationCandidate} from '../../src/ui/symbol-search';
import {planBackgroundAlertFeeds} from '../../src/ui/background-alert-plan';
import {liveShapeOf} from '../../src/domain/interval-switch';
import {ALPACA_SHAPE,COINBASE_SHAPE} from '../../src/domain/live-intervals';
import type {Bar,BarDataset} from '../../src/domain/types';

// Symbol math (spread and ratio symbols). Every bar below is a SYNTHETIC fixture made up for these tests (no
// market data, no network, no key). Component feeds are mock LiveHandles.
const bar=(time:number,open:number,high:number,low:number,close:number,volume=10):Bar=>({time,open,high,low,close,volume});
const canonical=(text:string)=>{const parsed=parseSymbolMath(text);if(!parsed.ok)throw new Error(parsed.error);return parsed.expression.canonical;};
const error=(text:string)=>{const parsed=parseSymbolMath(text);expect(parsed.ok,text).toBe(false);return parsed.ok?'':parsed.error;};

describe(' symbol math parser (no eval)',()=>{
 it('reads the owner examples and prints one canonical form',()=>{
  expect(canonical('GME/SPY')).toBe('GME/SPY');
  expect(canonical(' gme - spy ')).toBe('GME-SPY');
  expect(canonical('GME*2')).toBe('GME*2');
  expect(canonical('(GME+SPY)/2')).toBe('(GME+SPY)/2');
  expect(canonical('GME.WS/GME')).toBe('GME.WS/GME');
  const parsed=parseSymbolMath('(gme + spy) / 2');expect(parsed.ok&&parsed.expression.symbols).toEqual(['GME','SPY']);
 });
 it('keeps precedence and needed parentheses only',()=>{
  expect(canonical('GME-(SPY-QQQ)')).toBe('GME-(SPY-QQQ)');
  expect(canonical('(GME-SPY)-QQQ')).toBe('GME-SPY-QQQ');
  expect(canonical('GME/(SPY*2)')).toBe('GME/(SPY*2)');
  expect(canonical('2*(GME+SPY)')).toBe('2*(GME+SPY)');
  expect(canonical('((GME))/SPY')).toBe('GME/SPY');
  expect(canonical('-GME+SPY')).toBe('-GME+SPY');
  expect(canonical('-(GME-SPY)')).toBe('-(GME-SPY)');
  for(const text of ['GME/SPY','GME-(SPY-QQQ)','2*(GME+SPY)','-(GME-SPY)','GME.WS/GME*0.5'])expect(canonical(canonical(text))).toBe(canonical(text));
 });
 it('takes known dash tickers whole and quoted tickers literally',()=>{
  const coin=parseSymbolMath('BTC-USD/ETH-USD');expect(coin.ok&&coin.expression.symbols).toEqual(['BTC-USD','ETH-USD']);
  expect(canonical('BTC-USD/ETH-USD')).toBe('BTC-USD/ETH-USD');
  const quoted=parseSymbolMath('"BRK-B"/SPY');expect(quoted.ok&&quoted.expression.symbols).toEqual(['BRK-B','SPY']);
  expect(canonical('"brk-b"/spy')).toBe('"BRK-B"/SPY');
  const known=parseSymbolMath('BRK-B/SPY',symbol=>symbol==='BRK-B');expect(known.ok&&known.expression.symbols).toEqual(['BRK-B','SPY']);
  const unknown=parseSymbolMath('BRK-B/SPY');expect(unknown.ok&&unknown.expression.symbols).toEqual(['BRK','B','SPY']);
 });
 it('a bare ticker is not an expression',()=>{
  for(const text of ['GME','BTC-USD','(GME)','GME.WS'])expect(isSymbolMathText(text),text).toBe(false);
  for(const text of ['GME/SPY','GME-SPY','GME*2','-GME'])expect(isSymbolMathText(text),text).toBe(true);
 });
 it('refuses anything outside the grammar with a plain reason',()=>{
  expect(error('GME/')).toMatch(/ends too early/);
  expect(error('(GME/SPY')).toMatch(/not closed/);
  expect(error('GME/SPY)')).toMatch(/closing parenthesis/);
  expect(error('NASDAQ:GME/SPY')).toMatch(/EXCHANGE: prefix/);
  expect(error('GME;SPY')).toMatch(/cannot be used/);
  expect(error('alert(1)')).toMatch(/operator between/);
  expect(error('GME SPY')).toMatch(/operator between/);
  expect(error('2*3')).toMatch(/at least one ticker/);
  expect(error('A/B/C/D/E/F/G/H/I/J/K')).toMatch(/at most 10 tickers/);
  expect(error('G'.repeat(81))).toMatch(/at most 80/);
  expect(error('"BRK-B/SPY')).toMatch(/not closed/);
 });
 it('evaluates with null for division by zero and missing values',()=>{
  const parsed=parseSymbolMath('(A+B)/2-C*0.5');if(!parsed.ok)throw new Error();
  expect(evaluateSymbolMath(parsed.expression.ast,s=>({A:10,B:20,C:4} as Record<string,number>)[s])).toBe(13);// (10+20)/2 - 4*0.5 = 15 - 2
  const ratio=parseSymbolMath('A/B');if(!ratio.ok)throw new Error();
  expect(evaluateSymbolMath(ratio.expression.ast,s=>s==='A'?1:0)).toBeNull();
  expect(evaluateSymbolMath(ratio.expression.ast,s=>s==='A'?1:undefined)).toBeNull();
 });
});

describe(' derived bars (SYNTHETIC)',()=>{
 it('aligns on exact times, applies the expression per field and keeps open/close inside high/low',()=>{
  const parsed=parseSymbolMath('GME/SPY');if(!parsed.ok)throw new Error();
  const gme=[bar(1,10,12,9,11),bar(2,20,24,18,22),bar(3,30,33,27,30)];
  const spy=[bar(2,10,12,8,11),bar(3,10,10,10,10),bar(4,5,5,5,5)];
  const out=combineSymbolMathBars(parsed.expression.ast,new Map([['GME',gme],['SPY',spy]]));
  expect(out.map(row=>row.time)).toEqual([2,3]);
  // t=2: open 20/10=2, high-of-highs 24/12=2, low-of-lows 18/8=2.25, close 22/11=2 -> high 2.25, low 2
  expect(out[0]).toMatchObject({open:2,close:2,high:2.25,low:2});
  // t=3: 30/10=3, 33/10=3.3, 27/10=2.7, 30/10=3
  expect(out[1]).toMatchObject({open:3,close:3,high:3.3,low:2.7});
  expect(Number.isNaN(out[0].volume)).toBe(true);
 });
 it('spreads can be negative and a zero divisor drops the bar',()=>{
  const spread=parseSymbolMath('GME-SPY*2'),ratio=parseSymbolMath('GME/SPY');if(!spread.ok||!ratio.ok)throw new Error();
  const gme=[bar(1,10,10,10,10),bar(2,10,10,10,10)],spy=[bar(1,6,6,6,6),bar(2,0,0,0,0)];
  expect(combineSymbolMathBars(spread.expression.ast,new Map([['GME',gme],['SPY',spy]])).map(row=>row.close)).toEqual([-2,10]);// 10-12, 10-0
  expect(combineSymbolMathBars(ratio.expression.ast,new Map([['GME',gme],['SPY',spy]])).map(row=>row.time)).toEqual([1]);
 });
});

/** A mock component feed. */
function feed(symbol:string,bars:Bar[],options:{providerName?:string;providerId?:string;fixture?:boolean;forming?:boolean}={}){
 const listeners=new Set<(dataset:BarDataset)=>void>();let closed=0,current:BarDataset;
 const build=(rows:Bar[]):BarDataset=>({instrument:{id:'US:'+symbol,symbol,name:symbol,exchange:'US',currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'America/New_York'},bars:rows,resolution:'1D',
  provenance:{providerId:options.providerId??'alpaca-iex',providerName:options.providerName??'Alpaca IEX',datasetId:`live:alpaca-iex:${symbol}:1D`,fixture:options.fixture??false,coverage:'c',asOf:rows.at(-1)?.time??0,delaySeconds:0,adjustment:'split-adjusted',session:'unknown',timezone:'America/New_York',state:'ready',license:'L',revision:'live-v1:x:'+symbol,notes:[]}});
 current=build(bars);
 const handle:LiveHandle={datasetId:current.provenance.datasetId,dataset:()=>current,formingTime:()=>options.forming?current.bars.at(-1)?.time??null:null,onChange:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},close:()=>{closed++;}};
 return{handle,push(rows:Bar[]){current=build(rows);for(const listener of listeners)listener(current);},closed:()=>closed};
}

describe(' SymbolMathProvider (mock feeds, SYNTHETIC bars)',()=>{
 it('opens each component, labels the source Derived, and each component update recomputes the series',()=>{
  const gme=feed('GME',[bar(1,10,10,10,10),bar(2,20,20,20,20)],{forming:true}),spy=feed('SPY',[bar(1,5,5,5,5),bar(2,5,5,5,5)]);
  const opened:string[]=[];
  const provider=new SymbolMathProvider((symbol)=>{opened.push(symbol);return symbol==='GME'?gme.handle:spy.handle;});
  const handle=provider.open('gme / spy','1D');
  expect(opened).toEqual(['GME','SPY']);
  expect(handle.datasetId).toBe(symbolMathDatasetId('GME/SPY','1D'));
  const first=handle.dataset();
  expect(first.instrument.symbol).toBe('GME/SPY');
  // the stand-in and the live series are one instrument (sessions apply to a US-ticker expression)
  expect(first.instrument).toEqual(symbolMathPlaceholder('GME/SPY','1D','loading').instrument);
  expect(first.instrument).toMatchObject({assetClass:'stock',timezone:'America/New_York',exchange:'DERIVED',name:'Derived: GME/SPY'});
  expect(first.provenance.providerId).toBe(SYMBOL_MATH_PROVIDER_ID);
  expect(first.provenance.providerName).toBe('Derived: GME/SPY from Alpaca IEX');
  expect(first.provenance.fixture).toBe(false);
  expect(comparisonSourceTag(first)).toBe('LIVE');
  expect(isLiveDatasetId(first.provenance.datasetId)).toBe(true);
  expect(isFormingLiveDataset(first)).toBe(true);
  expect(first.bars.map(row=>row.close)).toEqual([2,4]);
  expect(handle.formingTime()).toBe(2);
  expect(handle.dataset()).toBe(first);// identity is stable until a component changes
  const seen:BarDataset[]=[];handle.onChange(dataset=>seen.push(dataset));
  spy.push([bar(1,5,5,5,5),bar(2,4,4,4,4),bar(3,4,4,4,4)]);
  gme.push([bar(1,10,10,10,10),bar(2,20,20,20,20),bar(3,12,12,12,12)]);
  expect(seen.map(row=>row.bars.map(item=>item.close))).toEqual([[2,5],[2,5,3]]);
  expect(liveLineageOf(seen[1].bars)?.key.startsWith(handle.datasetId+'|')).toBe(true);
  expect(newerLiveBars(first.bars,seen[1].bars)).toBe(true);
  handle.close();expect(gme.closed()).toBe(1);expect(spy.closed()).toBe(1);
 });
 it('says SYNTHETIC when every component is the keyless stub, and refuses a synthetic/real mix ',()=>{
  const stubOf=(symbol:string)=>feed(symbol,[bar(1,1,1,1,1)],{providerId:'alpaca-stub',providerName:'SYNTHETIC Alpaca stub (invented prices)'});
  selectAlpacaSyntheticStub(true);
  try{
   const stub=stubOf('GME'),stubSpy=stubOf('SPY');
   const handle=new SymbolMathProvider(symbol=>symbol==='GME'?stub.handle:stubSpy.handle).open('GME-SPY','1D');
   expect(handle.dataset().provenance.providerName).toMatch(/^SYNTHETIC · Derived: GME-SPY from /);
   expect(handle.dataset().provenance.fixture).toBe(true);
   expect(comparisonSourceTag(handle.dataset())).toBe('SYNTHETIC');
   // Before a stub GME with a real SPY opened as SYNTHETIC; now the mix is refused and both components close.
   const mixed=stubOf('GME'),spy=feed('SPY',[bar(1,1,1,1,1)]);
   expect(()=>new SymbolMathProvider(symbol=>symbol==='GME'?mixed.handle:spy.handle).open('GME-SPY','1D')).toThrow('GME-SPY: '+SYNTHETIC_DERIVED_MIX_REFUSAL);
   expect(mixed.closed()).toBe(1);expect(spy.closed()).toBe(1);
  }finally{selectAlpacaSyntheticStub(false);}
  // A component claiming the stub outside a stub run is not the labelled stub of this run: refused too.
  const stray=stubOf('GME'),stray2=stubOf('SPY');
  expect(()=>new SymbolMathProvider(symbol=>symbol==='GME'?stray.handle:stray2.handle).open('GME-SPY','1D')).toThrow(SYNTHETIC_DERIVED_MIX_REFUSAL);
 });
 it('an import is a static component',()=>{
  const imported:BarDataset={...feed('AAA',[bar(1,4,4,4,4)]).handle.dataset(),provenance:{...feed('AAA',[]).handle.dataset().provenance,providerId:'local-import',providerName:'Local import',datasetId:'import:AAA'}};
  const spy=feed('SPY',[bar(1,2,2,2,2)]);
  const handle=new SymbolMathProvider(symbol=>symbol==='AAA'?staticComponentHandle(imported):spy.handle).open('AAA*2/SPY','1D');
  expect(handle.dataset().bars.map(row=>row.close)).toEqual([4]);// 4*2/2
  expect(handle.dataset().provenance.providerName).toBe('Derived: AAA*2/SPY from Local import + Alpaca IEX');
 });
 it('a component that cannot open closes the ones already opened and names it',()=>{
  const gme=feed('GME',[]);
  const provider=new SymbolMathProvider(symbol=>{if(symbol==='ZZZ')throw new Error('Unknown ticker.');return gme.handle;});
  expect(()=>provider.open('GME/ZZZ','1D')).toThrow('GME/ZZZ: ZZZ could not be opened. Unknown ticker.');
  expect(gme.closed()).toBe(1);
 });
 it('shares one computation per expression and interval; the last close releases the components',()=>{
  const a=feed('GME',[bar(1,1,1,1,1)]),b=feed('SPY',[bar(1,1,1,1,1)]);let opens=0;
  const provider=new SymbolMathProvider(symbol=>{opens++;return symbol==='GME'?a.handle:b.handle;});
  const one=provider.open('GME/SPY','1D'),two=provider.open('GME / SPY','1D');
  expect(opens).toBe(2);expect(provider.componentSymbols()).toEqual(['GME','SPY']);
  one.close();expect(a.closed()).toBe(0);two.close();expect(a.closed()).toBe(1);expect(provider.componentSymbols()).toEqual([]);
 });
 it('counts every component against the 30-symbol Alpaca limit before opening anything',()=>{
  const open=new Set(Array.from({length:29},(_,i)=>'S'+String.fromCharCode(65+(i%26))+(i>=26?'X':'')));
  expect(open.size).toBe(29);
  expect(symbolMathCapError('GME/SPY',['GME','SPY'],open)).toMatch(/GME\/SPY needs 2 Alpaca symbols \(GME, SPY\); 2 more would go above the limit\. The Alpaca Basic plan streams at most 30 symbols at once\./);
  expect(symbolMathCapError('GME*2',['GME'],open)).toBeNull();
  expect(symbolMathCapError('SA/GME',['SA','GME'],open)).toBeNull();// SA already streams
  let opened=0;
  const provider=new SymbolMathProvider(()=>{opened++;return feed('X',[]).handle;},{alpacaComponents:symbols=>[...symbols],openAlpacaSymbols:()=>open});
  expect(()=>provider.open('GME/SPY','1D')).toThrow(/above the limit/);expect(opened).toBe(0);
 });
});

describe(' derived charts in the workspace, search and background alerts',()=>{
 it('a derived dataset id is a saved live chart reference and has a labelled stand-in',()=>{
  const id=symbolMathDatasetId('GME/SPY','1D');
  expect(symbolMathRefOf(id)?.expression.symbols).toEqual(['GME','SPY']);
  const ref=liveRefOfDatasetId(id);expect(ref).toEqual({providerId:SYMBOL_MATH_PROVIDER_ID,symbol:'GME/SPY',interval:'1D'});
  expect(restoreLiveCharts({c1:ref})).toEqual({c1:ref});
  expect(()=>restoreLiveCharts({c1:{...ref,symbol:'GME / SPY'}})).toThrow();// only the canonical form is saved
  const holder=liveChartPlaceholder(ref!,false)!;
  expect(holder.provenance.datasetId).toBe(id);expect(holder.bars).toEqual([]);expect(holder.provenance.state).toBe('disconnected');
  expect(holder.provenance.notes[0]).toBe('GME/SPY is a derived chart, and a data source it uses is turned off. Open Data sources to turn it on.');
  expect(liveSourceEnabled(SYMBOL_MATH_PROVIDER_ID,{coinbase:false,alpacaKey:true},'GME/SPY')).toBe(true);
  expect(liveSourceEnabled(SYMBOL_MATH_PROVIDER_ID,{coinbase:false,alpacaKey:true},'BTC-USD/GME')).toBe(false);
  expect(symbolMathIntervals('BTC-USD/ETH-USD')).toEqual(['1m','5m','15m','60m','360m','1D']);
  expect(symbolMathIntervals('BTC-USD/GME')).toEqual(['1m','5m','15m','60m','1D']);// Coinbase and Alpaca intervals intersect
  expect(liveShapeOf(holder)).toBe(ALPACA_SHAPE);
  expect(liveShapeOf(liveChartPlaceholder({providerId:SYMBOL_MATH_PROVIDER_ID,symbol:'BTC-USD/ETH-USD',interval:'360m'},true)!)).toBe(COINBASE_SHAPE);
  expect(liveChartPlaceholder({providerId:SYMBOL_MATH_PROVIDER_ID,symbol:'GME/SPY',interval:'360m'},true)?.resolution).toBe('360m');// Alpaca folds 6h bars
  expect(liveChartPlaceholder({providerId:SYMBOL_MATH_PROVIDER_ID,symbol:'GME/SPY',interval:'2s'},true)).toBeNull();// no live feed for seconds
  const siblings=liveSiblings({...holder,provenance:{...holder.provenance,state:'ready'}});
  expect(siblings.length).toBeGreaterThan(0);expect(siblings.every(row=>row.instrument.symbol==='GME/SPY'&&row.resolution!=='1D')).toBe(true);
 });
 it('symbol search offers one Derived row for typed math, and explains a broken one',()=>{
  const [row]=symbolMathCandidates('gme / spy','1D');
  expect(row).toMatchObject({symbol:'GME/SPY',sourceKind:'expression',openable:true,providerId:SYMBOL_MATH_PROVIDER_ID,datasetId:symbolMathDatasetId('GME/SPY','1D'),synthetic:false});
  expect(searchSymbols([row],'gme / spy').rows).toEqual([row]);
  expect(searchSymbols([row],'gme / spy',{assetClass:'all',source:'synthetic'}).rows).toEqual([]);
  expect(syntheticGenerationCandidate('GME-SPY',symbolMathCandidates('GME-SPY','1D'))).toBeNull();
  const [bad]=symbolMathCandidates('GME/','1D');expect(bad.openable).toBe(false);expect(bad.unavailableReason).toMatch(/ends too early/);
  expect(symbolMathCandidates('GME','1D')).toEqual([]);
  expect(symbolMathCandidates('BRK-B','1D',symbol=>symbol==='BRK-B')).toEqual([]);
  expect(symbolMathCandidates('BTC-USD','1D')).toEqual([]);
 });
 it('a background alert on a derived chart opens the derived feed and counts its Alpaca components',()=>{
  const alert=(id:string,datasetId:string)=>({status:'active',definition:{id,mode:'ordinary',instrumentId:'DERIVED:'+id,observationBinding:{schemaVersion:2,datasetKey:JSON.stringify([0,0,0,0,0,0,0,0,0,datasetId]),source:{kind:'price'}}}}) as never;
  const plan=planBackgroundAlertFeeds({alerts:[alert('a',symbolMathDatasetId('GME/SPY','1D'))],activeInstrumentId:'x',openAlpacaSymbols:new Set(['SPY'])});
  expect(plan.feeds).toEqual([{datasetId:symbolMathDatasetId('GME/SPY','1D'),providerId:SYMBOL_MATH_PROVIDER_ID,symbol:'GME/SPY',resolution:'1D',instrumentId:'DERIVED:a',alertIds:['a']}]);
  const full=planBackgroundAlertFeeds({alerts:[alert('b',symbolMathDatasetId('GME/QQQ','1D'))],activeInstrumentId:'x',openAlpacaSymbols:new Set(['SPY']),maxAlpacaSymbols:2});
  expect(full.feeds).toEqual([]);expect(full.skipped[0].reason).toMatch(/needs 2 more/);
 });
});
