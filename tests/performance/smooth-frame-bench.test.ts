// SMOOTH lane benchmark (SYNTHETIC 5,000 and 100,000 bars): where a pending saved frame spends its time after a pan,
// live growth, interval or symbol change, before GridCell may show the restored frame as interactive. The cell is no longer
// hidden for that window (see grid-frame-initialization-ownership SMOOTH test); this bench attributes the window itself.
// Timing is opt-in (LV_BENCH=1) like the / benches; numbers are printed once, assertions are relative.
import {expect,it} from 'vitest';
import {performance} from 'node:perf_hooks';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {createMultiChartState} from '../../src/ui/MultiChartGrid';
import {createFrameFingerprintCalculator} from '../../src/ui/frame-fingerprints';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {calculationBarsForStyle} from '../../src/chart/calculation-bars';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';

const benchEnabled=!!process.env.LV_BENCH;
const median=async(runs:number,work:(run:number)=>unknown)=>{const times:number[]=[];for(let run=0;run<runs;run++){const start=performance.now();await work(run);times.push(performance.now()-start);}times.sort((a,b)=>a-b);return +times[Math.floor(times.length/2)].toFixed(3);};

it.skipIf(!benchEnabled)('SMOOTH pending-frame cost attribution at 5,000 and 100,000 bars',async()=>{
 const report:Record<string,Record<string,number>>={};
 for(const count of [5000,100000]){
  const gme=fixtureDataset('GME',count),spy=fixtureDataset('SPY',count),state=createMultiChartState(gme,{appearance:defaultTheme.appearance});
  const base=state.cells[state.layout.cells[0].id],indicators=(['sma','ema','rsi','macd','vwap'] as const).map((kind,index)=>({id:'smooth-'+index,kind,...factoryIndicatorDefault(kind),paneId:'price'}));
  const cell={...base,indicators} as typeof base;
  const calculator=createFrameFingerprintCalculator(),row:Record<string,number>={};
  // Every pan/growth/switch hands the cell a new datasets array, so the WeakMap cache misses each time.
  row.fingerprintNewDatasetsMs=await median(9,()=>calculator(cell,[gme,spy].slice()));
  const held=[gme,spy];await calculator(cell,held);row.fingerprintCachedMs=await median(9,()=>calculator(cell,held));
  row.sourceContextMs=await median(9,()=>sourceContextForDataset(gme));
  row.candleCalculationBarsMs=await median(9,()=>calculationBarsForStyle(gme.bars,'candles'));
  row.heikinCalculationBarsMs=await median(9,()=>calculationBarsForStyle(gme.bars,'heikinashi'));
  row.restorePauseQuantumMs=20;// initial-historical-frame pause(): one setTimeout(20) per not-yet-ready poll
  report[count]=row;
 }
 console.log('SMOOTH bench '+JSON.stringify(report));
 // The fingerprint never reads bars: 20x more bars must not cost 20x more.
 expect(report[100000].fingerprintNewDatasetsMs).toBeLessThan(Math.max(5,report[5000].fingerprintNewDatasetsMs*5));
},120000);
