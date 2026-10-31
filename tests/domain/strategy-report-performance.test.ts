import {expect,it} from 'vitest';
import {backtestStrategy,type StrategySignal} from '../../src/domain/strategy';
import {buildStrategyReportAsync,STRATEGY_REPORT_LIMITS} from '../../src/domain/strategy-report';
import type {Bar} from '../../src/domain/types';

// Host-model timing only. Packaged responsiveness, memory and UI timing remain separate.
// Flat synthetic prices make the numerical outcome independent of the report implementation.
for(const [rows,closedTrades] of [[50000,10000],[200000,0]] as const){
 it('measures bounded report workload '+rows+' rows / '+closedTrades+' closed trades',async()=>{
  const bars:Bar[]=Array.from({length:rows},(_,index)=>({time:1000+index*60,open:100,high:100,low:100,close:100,volume:1})),barIds=bars.map((_,index)=>'synthetic-perf:'+index),signals:StrategySignal[]=[];
  for(let index=0;index<closedTrades;index++){signals.push({barIndex:index*5,orders:[{id:'entry:'+index,action:'buy',quantity:1}]},{barIndex:index*5+1,orders:[{id:'exit:'+index,action:'close'}]});}
  const engineStart=performance.now(),result=backtestStrategy({bars,barIds,signals,config:{initialCapital:1000000}}),engineMs=performance.now()-engineStart;expect(result.ok).toBe(true);
  const started=performance.now(),pending=buildStrategyReportAsync({result,bars,barIds,context:{executionId:'synthetic-performance:'+rows,sourceLabel:'Synthetic constant100; no actual market data',currency:null,timezone:'UTC'}});
  const blockingStartMs=performance.now()-started,report=await pending,reportMs=performance.now()-started;
  expect(report.equity).toHaveLength(rows);expect(report.trades).toHaveLength(closedTrades);expect(report.metrics.all.finalEquity.value).toBe(1000000);
  expect(report.metrics.all.closedNet.value).toBe(0);expect(report.work).toBeLessThanOrEqual(STRATEGY_REPORT_LIMITS.work);
  // Twenty seconds is an explicit host-model acceptance ceiling, not a native-frame promise.
  expect(reportMs).toBeLessThan(20000);
  console.info('STRATEGY_REPORT_PERFORMANCE '+JSON.stringify({rows,closedTrades,engineMs,blockingStartMs,reportMs,work:report.work,workLimit:STRATEGY_REPORT_LIMITS.work,host:process.version,kind:'synthetic host model; no GUI'}));
 },30000);
}
