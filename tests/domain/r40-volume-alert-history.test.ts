import {describe,expect,it} from 'vitest';
import {indicatorAlertBlock} from '../../src/domain/indicator-alertability';
import {captureIndicatorAlertSource,evaluateTechnicalAlertSources,technicalSourceKey} from '../../src/domain/technical-alerts';
import {indicatorDefaults,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {TechnicalAlertCatalog} from '../../src/ui/technical-alert-catalog';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {alertDatasetWithPrefix} from '../../src/domain/alert-observation';
import {liveLike} from '../helpers/background-alert-fixtures';
import type {Bar,BarDataset} from '../../src/domain/types';

// SYNTHETIC daily history with literal range maxima 20 through 28; no resolver, account or network.
const T=1767225600,D=86400;
const bars:Bar[]=Array.from({length:9},(_,i)=>({time:T+i*D,open:10,high:20+i,low:5,close:10,volume:1}));
const settings:IndicatorInstanceSettings={id:'synthetic-range',kind:'w52hl',inputs:{...indicatorDefaults.w52hl,weeks:1},plots:{},offset:0,visible:true};
describe(' daily-history alert boundaries (synthetic)',()=>{
 it('refuses intraday range alerts while preserving daily/coarser/legacy unspecified calculations',()=>{
  expect(indicatorAlertBlock('w52hl',settings.inputs,'60m')).toMatch(/needs daily history.*cannot be alerted on/);
  expect(indicatorAlertBlock('w52hl',settings.inputs,'1D')).toBeNull();
  expect(indicatorAlertBlock('w52hl',settings.inputs,'1W')).toBeNull();
  expect(indicatorAlertBlock('w52hl',settings.inputs)).toBeNull();
 });
 it('an existing saved intraday source reports the missing daily feed; a daily source still returns 28',async()=>{
  const source=captureIndicatorAlertSource(settings,'high','standard','synthetic-snapshot'),key=technicalSourceKey(source);
  const intraday=await evaluateTechnicalAlertSources(bars,[source],'USD',{resolution:'60m'}),refused=intraday.results.get(key)!;
  expect(refused.sample.value).toBeNull();expect(refused.diagnostics.join(' ')).toMatch(/needs daily history.*cannot be alerted on/);
  const daily=await evaluateTechnicalAlertSources(bars,[source],'USD',{resolution:'1D'});
  expect(daily.results.get(key)!.sample.value).toBe(28);expect(daily.results.get(key)!.diagnostics).toEqual([]);
 });
 it('the source picker disables intraday daily-history plots before capture, while daily plots stay enabled',()=>{
  const rows=(resolution:string)=>{
   const data={...liveLike('SYN',resolution),bars} as BarDataset;
   const chart={getAnalysisUnavailable:()=>null,getSourceContext:()=>sourceContextForDataset(alertDatasetWithPrefix(data,bars),bars),getDataWindow:()=>({pending:false,series:{count:bars.length,firstTime:bars[0].time,lastTime:bars.at(-1)!.time,style:'candles'}}),getStyle:()=>'candles',indicators:{serialize:()=>[{...settings,paneId:'price'}]},saveDrawings:()=>({drawings:[]}),getChartOptions:()=>({scale:'linear'}),scripts:{}} as any;
   return new TechnicalAlertCatalog(()=> 'synthetic-snapshot').capture(chart,data,bars,[]).filter(item=>item.id.startsWith('indicator:'));
  };
  const intraday=rows('60m');expect(intraday).toHaveLength(2);
  for(const item of intraday){expect(item.source).toBeNull();expect(item.disabledReason).toMatch(/daily history.*cannot be alerted on/);}
  expect(rows('1D').every(item=>item.source!==null)).toBe(true);
 });
});
