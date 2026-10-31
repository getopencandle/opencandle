import {afterEach,describe,expect,it} from 'vitest';
import type {Bar,BarDataset} from '../../src/domain/types';
import {calculateIndicator} from '../../src/domain/indicators';
import {replayChartFrame,type ReplaySession} from '../../src/domain/replay-session';
import {closedChartRows,indicatorHistoryLookup,replayClippedResolver,replayHistoryClock} from '../../src/chart/indicator-history-lookup';
import {evaluateIndicatorOnTimeframe} from '../../src/chart/indicator-timeframe';
import {createDatasetRequestResolver,installScriptRequestResolver} from '../../src/ui/script-requests';
import type {IndicatorResult} from '../../src/domain/indicators';

// 0.8.1 end-to-end timing checks. Every bar is SYNTHETIC (hand-built, not market data).
const T0=1767225600;// 2026-01-01T00:00:00Z
const H14=T0+14*3600,H15=T0+15*3600;
const bar=(time:number,open:number,high:number,low:number,close:number,volume:number):Bar=>({time,open,high,low,close,volume});
function dataset(resolution:string,bars:Bar[]):BarDataset{
 return {instrument:{id:'inst-synth',symbol:'SYN',name:'Synthetic',exchange:'LV',currency:'USD',assetClass:'crypto',tickSize:0.01,lotSize:1,timezone:'UTC'} as BarDataset['instrument'],bars,resolution,
  provenance:{providerId:'synthetic-provider',providerName:'Synthetic fixture',datasetId:'synthetic:SYN:'+resolution,fixture:true,coverage:'synthetic',asOf:0,delaySeconds:null,adjustment:'unknown',session:'unknown',timezone:'UTC',state:'ready',license:'local',revision:'r1',notes:[]}} as unknown as BarDataset;
}

describe('Bar Replay on a 1h chart stepping by 1m (SYNTHETIC)',()=>{
 let uninstall:(()=>void)|null=null;afterEach(()=>{uninstall?.();uninstall=null;});
 // Minutes 14:00..15:59, alternating up and down closes, volume 1..120.
 const minutes=Array.from({length:120},(_,k)=>bar(H14+k*60,100,100.5,99.5,k%2?100.2:99.8,k+1));
 const hourly=[0,1].map(h=>{const rows=minutes.slice(h*60,h*60+60);return bar(H14+h*3600,rows[0].open,Math.max(...rows.map(r=>r.high)),Math.min(...rows.map(r=>r.low)),rows.at(-1)!.close,rows.reduce((s,r)=>s+r.volume,0));});
 const chart=dataset('1h',hourly),step=dataset('1m',minutes);
 it('the forming bar\'s Up/Down volume equals the volume of the revealed minutes (the replay frame\'s own forming bar)',()=>{
  const clock=H15+25*60;// minutes 15:00..15:24 revealed
  const frame=replayChartFrame(chart,clock,step);
  expect(frame.bars.length).toBe(2);expect(frame.completeBars).toBe(1);
  const revealed=minutes.slice(60,85).reduce((s,r)=>s+r.volume,0);expect(frame.bars[1].volume).toBe(revealed);
  const session={phase:'active',clock,participants:[{cellId:'c1',instrumentId:'inst-synth',symbol:'SYN',interval:'1h',chartType:'candles',datasetId:chart.provenance.datasetId,revision:'r1'}]} as unknown as ReplaySession;
  // The App-level wiring: the dataset resolver wrapped with the replay clock of the session's participants.
  uninstall=installScriptRequestResolver(replayClippedResolver(createDatasetRequestResolver({datasets:[chart,step]}),replayHistoryClock(session)));
  const lookup=indicatorHistoryLookup(chart.provenance.datasetId,'1h')!;
  const result=calculateIndicator('updownvolume',frame.bars,{useCustomTimeframe:true,timeframe:'1m'},{resolution:'1h',finerBars:lookup});
  const up=result.series.find(s=>s.id==='up')!.values,down=result.series.find(s=>s.id==='down')!.values;
  expect(up[1]!-down[1]!).toBe(revealed);
  expect(up[0]!-down[0]!).toBe(hourly[0].volume);
  // The forming 1h bar is not closed at the replay clock.
  expect(closedChartRows(frame.bars,'1h',chart.provenance.datasetId)).toBe(1);
 });
 it('without an active replay the full history is read',()=>{
  uninstall=installScriptRequestResolver(replayClippedResolver(createDatasetRequestResolver({datasets:[chart,step]}),replayHistoryClock(null)));
  expect(indicatorHistoryLookup(chart.provenance.datasetId,'1h')!('1m').bars!.length).toBe(120);
 });
});

describe('live Wait for timeframe closes with a forming last bar (SYNTHETIC)',()=>{
 // 1h bars 12:00..15:00 UTC: one 4h bucket ending 16:00. The wall clock is 15:30, so the 15:00 bar is forming.
 const raw=[0,1,2,3].map(k=>bar(T0+12*3600+k*3600,100+k,101+k,99+k,100.5+k,10));
 const settings={kind:'synthetic-close',inputs:{},presentation:{timeframe:{schemaVersion:1 as const,interval:'4h',waitForClose:true}}};
 const evaluate=(bars:readonly Bar[]):IndicatorResult=>({id:'synthetic-close',series:[{id:'close',values:bars.map(row=>row.close)}] as IndicatorResult['series'],diagnostics:[],policies:[]});
 const run=(now:number,waitForClose=true)=>{const completeRows=closedChartRows(raw,'1h',undefined,now);return evaluateIndicatorOnTimeframe({...settings,presentation:{timeframe:{...settings.presentation.timeframe,waitForClose}}},'1h',raw,raw,bars=>bars.map(row=>({...row})),evaluate,undefined,'utc',completeRows).series[0].values;};
 it('the developing 4h value is not shown under wait-for-close while 15:00 is forming',()=>{
  expect(run(T0+15.5*3600)).toEqual([null,null,null,null]);
  // Not waiting: only the latest bar shows the developing value.
  expect(run(T0+15.5*3600,false)).toEqual([null,null,null,103.5]);
 });
 it('once 16:00 passes, the bucket confirms on the 15:00 bar',()=>{
  expect(run(T0+16*3600)).toEqual([null,null,null,103.5]);
 });
});
