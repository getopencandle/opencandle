import {describe,expect,it} from 'vitest';
import {TechnicalAlertCatalog,dailyTimeframeAlertRefusal} from '../../src/ui/technical-alert-catalog';
import {captureIndicatorAlertSource} from '../../src/domain/technical-alerts';
import {alertDatasetWithPrefix} from '../../src/domain/alert-observation';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import type {Bar,BarDataset} from '../../src/domain/types';

// An own-timeframe indicator either reaches the qualified 1D alert route or gets a
// refusal that names what to change. SYNTHETIC bars only; the qualified route itself is covered by nyse-mtf-alert-*.
const T0=Date.parse('2024-03-11T13:30:00Z')/1000;
const bars:Bar[]=Array.from({length:40},(_,i)=>({time:T0+i*900,open:100+i,high:102+i,low:99+i,close:101+i,volume:10}));
function dataset(over:{exchange?:string;assetClass?:string;timezone?:string;resolution?:string;state?:string}={}):BarDataset{
 return {instrument:{id:'US:SYN',symbol:'SYN',name:'Synthetic',exchange:over.exchange??'US',currency:'USD',assetClass:over.assetClass??'stock',tickSize:0.01,lotSize:1,timezone:over.timezone??'America/New_York'} as BarDataset['instrument'],bars,resolution:over.resolution??'15m',
  provenance:{providerId:'synthetic-provider',providerName:'Synthetic fixture',datasetId:'synthetic:SYN:15m',fixture:true,coverage:'synthetic',asOf:0,delaySeconds:null,adjustment:'unknown',session:'unknown',timezone:'America/New_York',state:over.state??'ready',license:'local',revision:'r1',notes:[]} as unknown as BarDataset['provenance']};
}
const sma=(interval:string|null)=>{const base=factoryIndicatorDefault('sma');return {id:'sma-1',kind:'sma' as const,paneId:'price',...base,presentation:{...base.presentation!,timeframe:{schemaVersion:1 as const,interval,waitForClose:true}}};};
const chart={getExecutionIdentity:()=>'ordinary'} as never;
function choice(interval:string|null,data=dataset()){
 const mock={getAnalysisUnavailable:()=>null,getExecutionIdentity:()=>'ordinary',getSourceContext:()=>sourceContextForDataset(alertDatasetWithPrefix(data,bars),bars),getDataWindow:()=>({pending:false,series:{count:bars.length,firstTime:bars[0].time,lastTime:bars.at(-1)!.time,style:'candles'}}),getStyle:()=>'candles',indicators:{serialize:()=>[sma(interval)]},saveDrawings:()=>({drawings:[]}),getChartOptions:()=>({scale:'linear'}),scripts:{}} as never;
 return new TechnicalAlertCatalog((()=>{let n=0;return()=>'snapshot-'+(++n);})()).capture(mock,data,bars,[]).find(row=>row.id==='indicator:sma-1:sma')!;
}
describe('L4 own-timeframe alert reasons (SYNTHETIC)',()=>{
 it('still captures a Chart-timeframe instance',()=>{expect(choice(null).source).toMatchObject({kind:'indicator',indicator:'sma'});});
 it('names the 1D, 1W and 1M route for other own timeframes instead of only offering Chart',()=>{
  const row=choice('240m');expect(row.source).toBeNull();
  expect(row.disabledReason).toBe('Alerts are unavailable for an indicator calculated on its own 240m timeframe. Own-timeframe alerts support 1D, 1W and 1M timeframes on US stock and ETF intraday charts with live or replay data. Set its timeframe to 1D, 1W, 1M or Chart to create an alert.');
  expect(()=>captureIndicatorAlertSource((({paneId,...rest})=>rest)(sma('1W')) as never,'sma','standard','s')).toThrow('Set its timeframe to Chart to create an alert.');
 });
 it('does not call a source without session completion "waiting"',()=>{
  const row=choice('1D');expect(row.source).toBeNull();expect(row.disabledReason).not.toMatch(/waiting/);
  expect(row.disabledReason).toBe('This chart\'s data source does not report confirmed session closes, so a 1D indicator timeframe alert cannot tell when each day is complete. Use a live or replay chart, or set this indicator\'s timeframe to Chart.');
 });
 it('says waiting only while the source is loading',()=>{expect(dailyTimeframeAlertRefusal(chart,dataset({state:'loading'}),bars)).toBe('This 1D indicator timeframe alert is waiting for the chart source to finish loading.');});
 it('refuses non-US-equity instruments and off-grid chart intervals with the reason',()=>{
  expect(dailyTimeframeAlertRefusal(chart,dataset({assetClass:'crypto',exchange:'COINBASE',timezone:'UTC'}),bars)).toMatch(/US stocks and ETFs only/);
  expect(dailyTimeframeAlertRefusal(chart,dataset({resolution:'45m'}),bars)).toMatch(/divides the New York regular session/);
  expect(dailyTimeframeAlertRefusal(chart,dataset({resolution:'1D'}),bars)).toMatch(/divides the New York regular session/);
 });
});
