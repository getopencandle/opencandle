import {describe,expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {Bar,BarDataset} from '../../src/domain/types';
import {calculateWatchAdvanced,createWatchAdvancedState,type AdvancedMetric} from '../../src/watchlists/advanced';
import type {WatchList} from '../../src/watchlists/model';
import {createWatchBook} from '../../src/watchlists/model';
import {watchListMenu} from '../../src/watchlists/menus';
import {normalizeCompanyFacts,type FactsDocument} from '../../src/fundamentals/company-facts';
import type {ScreenerFundamentalsSource} from '../../src/domain/screener-fundamentals';
import {calculateIndicator} from '../../src/domain/indicators';
import {indicatorDefaults,indicatorLegacyDefaults,indicatorInputSchema} from '../../src/chart/indicator-settings';
import {tpoMergeChoiceAt} from '../../src/chart/tpo-merge-menu';
import {tpoProfilesForSettings} from '../../src/chart/tpo';
import {chartMenuEntries} from '../../src/ui/ChartContextMenu';
import {requireTechnicalChart} from '../../src/ui/technical-alert-catalog';
import {sourceContextForDataset} from '../../src/chart/source-context';
import type {ChartMenuSnapshot} from '../../src/chart/context-menu';

// SYNTHETIC data only. Expectations are hand-worked from the fixtures below.
const day=86400,start=Date.UTC(2026,6,1)/1000,now=Date.UTC(2027,6,14,16)/1000;
function dataset(symbol:string,closes:number[]):BarDataset{const value=fixtureDataset(symbol,closes.length);value.instrument={...value.instrument,id:'TEST:'+symbol,symbol,exchange:'TEST',currency:'USD',name:'Synthetic '+symbol};value.provenance={...value.provenance,providerId:'unit-test',providerName:'Synthetic supplied input',datasetId:'test:'+symbol,revision:'1',session:'regular',coverage:'Synthetic original daily history',asOf:now,notes:[]};value.resolution='1D';value.bars=closes.map((close,index)=>({time:start+index*day,open:close,high:close+1,low:close-1,close,volume:1000}));return value;}
const list=(sources:BarDataset[]):WatchList=>({id:'watch',name:'Synthetic watchlist',favorite:false,sort:null,rows:sources.map((source,index)=>({id:'row'+index,kind:'symbol',reference:{exchange:source.instrument.exchange,symbol:source.instrument.symbol,synthetic:source.provenance.fixture,datasetId:source.provenance.datasetId,dailyDatasetId:null}}))});
function input(sources:BarDataset[],mode:'price'|'financials'|'technicals',extra:{benchmarkDatasetId?:string|null;fundamentals?:ScreenerFundamentalsSource|null}={}){const state=createWatchAdvancedState();state.settings.mode=mode;return{list:list(sources),datasets:sources,settings:state.settings,data:state.data,now,...extra};}
// Synthetic facts: 100 shares outstanding, four 0.20 quarterly dividends declared in 2024 (0.80 TTM).
function facts():FactsDocument{
 const raw:any={cik:9999,entityName:'Synthetic Widgets',facts:{'us-gaap':{Revenues:{units:{USD:[{start:'2024-01-01',end:'2024-12-31',val:1200,filed:'2025-02-20',form:'10-K',fy:2024,fp:'FY'}]}},CommonStockDividendsPerShareDeclared:{units:{'USD/shares':[['01-01','03-31','2024-04-25'],['04-01','06-30','2024-07-25'],['07-01','09-30','2024-10-25'],['10-01','12-31','2025-02-20']].map(([s,e,filed])=>({start:'2024-'+s,end:'2024-'+e,val:0.2,filed,form:'10-Q'}))}}},dei:{EntityCommonStockSharesOutstanding:{units:{shares:[{end:'2025-01-31',val:100,filed:'2025-02-20',form:'10-K'}]}}}}};
 return{id:'doc-synth',facts:normalizeCompanyFacts(raw),source:{kind:'synthetic',label:'Synthetic fixture',retrievedAt:'2025-03-01T00:00:00Z',sourceUrl:null,sha256:null}};
}
const fundamentals=(symbol:string):ScreenerFundamentalsSource=>({documents:[facts()],links:[{exchange:'TEST',symbol,synthetic:true,documentId:'doc-synth'}],cutoff:null,revisions:'latest'});

describe('G1-SMALLS watchlist Advanced View columns',()=>{
 it('market cap and dividend yield come from saved SEC facts (cap 110 x 100 = 11000, yield 0.8 / 110 = 0.7273%)',()=>{
  const a=dataset('A',[100,105,110]),cells=calculateWatchAdvanced(input([a],'price',{fundamentals:fundamentals('A')})).rows[0].cells;
  expect(cells.marketCap.value).toBe(11000);expect(cells.marketCap.currency).toBe('USD');expect(cells.marketCap.calculation).toBe('local');expect(cells.marketCap.reason).toMatch(/SEC company facts/);
  const fin=calculateWatchAdvanced(input([a],'financials',{fundamentals:fundamentals('A')})).rows[0].cells;expect(fin.yield.value).toBeCloseTo(0.8/110*100,10);expect(fin.yield.unit).toBe('percent');
 });
 it('an unlinked symbol shows no value with the reason, and no fundamentals input keeps the old cell',()=>{
  const b=dataset('B',[10,11]);
  const unlinked=calculateWatchAdvanced(input([b],'price',{fundamentals:fundamentals('A')})).rows[0].cells.marketCap;expect(unlinked.value).toBeNull();expect(unlinked.reason).toMatch(/No saved company facts are linked to TEST:B/);
  const plain=calculateWatchAdvanced(input([b],'price')).rows[0].cells.marketCap;expect(plain.value).toBeNull();expect(plain.reason).toMatch(/supplied observation/);
 });
 it('Financials beta uses the chosen benchmark (a doubled return series has beta 2) and stays empty without one',()=>{
  const closes=Array.from({length:260},(_,i)=>100+10*Math.sin(i/7)+i*0.05),bench=dataset('SPY',closes),twice=dataset('X',closes.map((close,i)=>i===0?close:0));
  for(let i=1;i<closes.length;i++)twice.bars[i]={...twice.bars[i],close:twice.bars[i-1].close*(1+2*(closes[i]/closes[i-1]-1))};for(const bar of twice.bars){bar.open=bar.close;bar.high=bar.close+1;bar.low=bar.close-1;}
  const beta=calculateWatchAdvanced(input([twice,bench],'financials',{benchmarkDatasetId:'test:SPY'})).rows[0].cells.beta;expect(beta.value).toBeCloseTo(2,8);expect(beta.calculation).toBe('local');
  expect(calculateWatchAdvanced(input([twice,bench],'financials')).rows[0].cells.beta.value).toBeNull();
 });
 it('MA and oscillator ratings equal the screener Technical ratings indicator on the same bars',()=>{
  const closes=Array.from({length:260},(_,i)=>50+i*0.2+3*Math.sin(i/5)),a=dataset('A',closes),cells=calculateWatchAdvanced(input([a],'technicals')).rows[0].cells;
  const reference=calculateIndicator('techrating',a.bars,{ratingsUse:'All'}),last=(id:string)=>reference.series.find(series=>series.id===id)!.values.at(-1);
  const map:Record<string,string>={ratingAll:'rating',ratingMa:'ma',ratingOscillator:'osc'};
  for(const metric of ['ratingAll','ratingMa','ratingOscillator'] as AdvancedMetric[]){expect(cells[metric].value).toBe(last(map[metric]));expect(cells[metric].reason).toMatch(/Strong buy|Buy|Neutral|Sell/);}
  const short=calculateWatchAdvanced(input([dataset('S',[5,6,7])],'technicals')).rows[0].cells;expect(short.ratingMa.value).toBeNull();expect(short.ratingMa.reason).toMatch(/200 rows/);
 });
 it('the Hotlists list-menu row is enabled only when the view can open Markets hotlists',()=>{
  const book=createWatchBook(['GME']),row=(options={})=>watchListMenu(book,options).flatMap(group=>group.items).find(item=>item.id==='hotlists')!;
  expect(row().disabled).toBeTruthy();expect(row({hotlists:true}).disabled).toBeNull();expect(row({hotlists:true}).label).toMatch(/loaded symbols/);
 });
});

describe('G1-SMALLS indicators: CCI smoothing and Keltner ATR bands',()=>{
 const bars:Bar[]=Array.from({length:60},(_,i)=>{const close=100+5*Math.sin(i/4)+i*0.1;return{time:start+i*day,open:close-0.5,high:close+1+(i%3),low:close-1-(i%2),close,volume:1000+i};});
 // reference Desktop's CCI defaults are source hlc3 and a CCI-based MA (SMA 14), so NEW instances get those; saved CCIs keep close / no MA.
 it('CCI new-instance defaults are hlc3 + SMA 14 (reference) and saved CCIs keep their exact input keys',()=>{
  expect(indicatorInputSchema('cci').map(row=>[row.key,row.defval])).toEqual([['length',20],['source','hlc3'],['maType','SMA'],['maLength',14],['bbMult',2]]);
  expect(Object.keys(indicatorLegacyDefaults.cci)).toEqual(['length','source']);expect(indicatorDefaults.cci).toMatchObject({source:'hlc3',maType:'SMA',maLength:14,bbMult:2});
  const plain=calculateIndicator('cci',bars,{length:20,source:'close'}),none=calculateIndicator('cci',bars,{length:20,source:'close',maType:'None',maLength:14,bbMult:2});
  expect(none.series.find(s=>s.id==='cci')!.values).toEqual(plain.series.find(s=>s.id==='cci')!.values);expect(plain.series.find(s=>s.id==='ma')!.values.every(value=>value===null)).toBe(true);
 });
 it('SMA + Bollinger Bands: the CCI-based MA is the SMA of the CCI, bands are +/- k population deviations',()=>{
  const result=calculateIndicator('cci',bars,{length:10,source:'close',maType:'SMA + Bollinger Bands',maLength:4,bbMult:2}),of=(id:string)=>result.series.find(s=>s.id===id)!.values;
  const cci=of('cci') as number[],i=bars.length-1,window=cci.slice(i-3,i+1),mean=window.reduce((a,b)=>a+b,0)/4,sd=Math.sqrt(window.reduce((a,b)=>a+(b-mean)**2,0)/4);
  expect(of('ma')[i]).toBeCloseTo(mean,10);expect(of('bbUpper')[i]).toBeCloseTo(mean+2*sd,10);expect(of('bbLower')[i]).toBeCloseTo(mean-2*sd,10);
  const ema=calculateIndicator('cci',bars,{length:10,source:'close',maType:'EMA',maLength:4,bbMult:2});expect(ema.series.find(s=>s.id==='bbUpper')!.values.every(value=>value===null)).toBe(true);
 });
 it('KC Bands style Average True Range with ATR length 10 is the new default; saved KCs keep true range',()=>{
  const field=indicatorInputSchema('kc').find(row=>row.key==='bandsStyle')!;expect(field).toMatchObject({defval:'average true range',options:['average true range','true range','range']});
  expect(indicatorInputSchema('kc').find(row=>row.key==='atrLength')).toMatchObject({defval:10});
  expect(indicatorLegacyDefaults.kc).toEqual({length:20,multiplier:1,source:'close',exponential:true,bandsStyle:'true range'});expect(indicatorDefaults.kc).toMatchObject({bandsStyle:'average true range',atrLength:10});
  const kc=calculateIndicator('kc',bars,{length:20,multiplier:1.5,source:'close',exponential:true,bandsStyle:'average true range',atrLength:10}),atr=calculateIndicator('atr',bars,{length:10,smoothing:'RMA'}).series[0].values;
  const upper=kc.series.find(s=>s.id==='upper')!.values,basis=kc.series.find(s=>s.id==='basis')!.values;
  for(const i of [25,40,59])expect((upper[i] as number)-(basis[i] as number)).toBeCloseTo(1.5*(atr[i] as number),10);
  const saved={length:20,multiplier:1,source:'close',exponential:true,bandsStyle:'true range'};expect(calculateIndicator('kc',bars,saved).series).toEqual(calculateIndicator('kc',bars,{...saved,atrLength:3}).series);
 });
});

describe('G1-SMALLS TPO merge gesture and SVP alerts',()=>{
 // Two UTC days of 30-minute bars: two TPO profiles.
 const bars:Bar[]=Array.from({length:96},(_,i)=>{const close=100+(i%10)*0.5;return{time:Date.UTC(2026,9,26)/1000+i*1800,open:close,high:close+0.5,low:close-0.5,close,volume:100};});
 it('the second profile merges into the first, then unmerges; the first profile cannot merge',()=>{
  const profiles=tpoProfilesForSettings(bars,{},null);expect(profiles).toHaveLength(2);
  const second=profiles[1].start,inSecond=bars[60].time;
  const choice=tpoMergeChoiceAt(bars,{},null,inSecond)!;expect(choice.start).toBe(second);expect(choice.merge).toEqual({mergePoints:[second]});expect(choice.unmerge).toBeNull();
  expect(tpoMergeChoiceAt(bars,{},null,bars[5].time)!.merge).toBeNull();
  const merged=tpoMergeChoiceAt(bars,{mergePoints:[second]},null,inSecond)!;expect(merged.merge).toBeNull();expect(merged.unmerge).toEqual({mergePoints:[]});
  expect(tpoProfilesForSettings(bars,{mergePoints:[second]},null)).toHaveLength(1);
 });
 it('the chart menu offers the rows only on a TPO chart with the handlers connected',()=>{
  const snapshot=(style:string,mergePoints:number[]=[])=>({entity:{kind:'chart'},point:{price:null,barTime:bars[60].time,barIndex:60,logical:60,unit:null,pane:null},input:{bars,style,source:null},controller:{getChartSettingsBook:()=>({tpo:{mergePoints}}),contextMenu:{isCurrent:()=>true,handoff:()=>({release(){}})}}}) as unknown as ChartMenuSnapshot;
  const actions={'tpo-merge':()=>true,'tpo-unmerge':()=>true};
  expect(chartMenuEntries(snapshot('tpo'),actions).map(row=>row.label)).toEqual(['Merge with previous profile']);
  expect(chartMenuEntries(snapshot('tpo',[bars[48].time]),actions).map(row=>row.label)).toEqual(['Unmerge profile']);
  expect(chartMenuEntries(snapshot('candles'),actions)).toEqual([]);
 });
 it('a comparison series names its own market on the note row',()=>{
  const snap={entity:{kind:'series',owner:{kind:'comparison',id:'cmp-1'}},point:{price:null,barTime:null,barIndex:null,logical:null,unit:null,pane:null},controller:{comparisons:{list:()=>[{id:'cmp-1',dataset:{instrument:{symbol:'SPY'}}}]},contextMenu:{isCurrent:()=>true,handoff:()=>({release(){}})}}} as unknown as ChartMenuSnapshot;
  expect(chartMenuEntries(snap,{note:()=>true}).map(row=>row.label)).toEqual(['Note for SPY']);
 });
 it('a session volume profile chart is an eligible technical alert source like candles',()=>{
  const data=fixtureDataset('GME',3),source=sourceContextForDataset(data);let style='sessionvp';
  const chart:any={getAnalysisUnavailable:()=>'',getSourceContext:()=>source,getStyle:()=>style,getDataWindow:()=>({pending:false,series:{count:data.bars.length,firstTime:data.bars[0].time,lastTime:data.bars.at(-1)!.time,style}})};
  expect(requireTechnicalChart(chart,data,data.bars)).toBe(chart);style='renko';expect(()=>requireTechnicalChart(chart,data,data.bars)).toThrow('not yet an eligible');
 });
});
