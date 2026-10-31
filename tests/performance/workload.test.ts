import {afterAll,describe,it,expect} from 'vitest';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {makeFixture,fixtureInstrument} from '../../src/domain/fixtures';
import {calculateIndicator} from '../../src/domain/indicators';
import {parseCsv,barsToCsv} from '../../src/domain/data';
import {backtestStrategy} from '../../src/domain/strategy';
import {evaluateDomainIndicator} from '../../src/chart/indicator-port';
import {indicatorEstimatedWork,INDICATOR_WORK_LIMIT} from '../../src/chart/indicator-settings';
const measurements:Record<string,unknown>[]=[];
describe('documented local calculation workloads',()=>{
 it('evaluates the revised admitted Bollinger WMA workload within the unchanged 2000ms threshold',()=>{
  const inputs={length:1000,basisType:'WMA'};
  // The archived 4900-row workload formerly cost 19661800; it now exceeds the same 20m limit.
  expect(indicatorEstimatedWork('bb',4900,inputs)).toBe(27463800);
  const inaccessible=new Proxy(new Array(4900),{get(target,key,receiver){if(key==='length')return target.length;throw new Error('REFUSED WORKLOAD MUST NOT READ BARS');}});
  const refused=evaluateDomainIndicator('bb',inaccessible,inputs);
  expect(refused.series).toEqual([]);
  expect(refused.diagnostics[0]).toContain('operation limit');
  const bars=makeFixture('PERFORMANCE',3838),work=indicatorEstimatedWork('bb',bars.length,inputs);
  expect(work).toBe(19995816);
  expect(work).toBeLessThan(INDICATOR_WORK_LIMIT);
  expect(indicatorEstimatedWork('bb',3839,inputs)).toBe(20002848);
  expect(indicatorEstimatedWork('bb',3839,inputs)).toBeGreaterThan(INDICATOR_WORK_LIMIT);
  const start=performance.now(),result=evaluateDomainIndicator('bb',bars,inputs),milliseconds=performance.now()-start;
  expect(result.diagnostics).toEqual([]);
  expect(result.series[0].values).toHaveLength(3838);
  measurements.push({workload:'Bollinger WMA length 1000 over 3838 synthetic daily bars',estimatedOperations:work,milliseconds,targetMilliseconds:2000,policyMigration:{priorRows:4900,priorEstimatedOperations:19661800,currentPriorEstimatedOperations:27463800,priorWorkloadNowRefused:true,claim:'Distinct admitted workload; not a repair of a prior latency failure.'}});
  expect(milliseconds).toBeLessThan(2000);
 });
 it('calculates the ten built-ins over 10000 bars within a 2000ms budget',()=>{const bars=makeFixture('PERFORMANCE',10000);const start=performance.now();for(const id of ['volume','sma','ema','rsi','macd','bb','vwap','stochastic','atr','obv']){const result=calculateIndicator(id,bars);expect(result.diagnostics).toEqual([]);for(const plot of result.series)expect(plot.values).toHaveLength(bars.length);}const milliseconds=performance.now()-start;measurements.push({workload:'ten indicators over 10000 synthetic daily bars',milliseconds,targetMilliseconds:2000});expect(milliseconds).toBeLessThan(2000);});
 it('imports 100000 valid CSV bars within 3000ms',()=>{const csv=barsToCsv(makeFixture('PERFORMANCE',100000));const start=performance.now();const result=parseCsv(csv,fixtureInstrument('PERFORMANCE'));const milliseconds=performance.now()-start;expect(result.ok).toBe(true);expect(result.bars).toHaveLength(100000);measurements.push({workload:'parse and validate 100000 CSV rows',bytes:new TextEncoder().encode(csv).length,milliseconds,targetMilliseconds:3000});expect(milliseconds).toBeLessThan(3000);});
 it('simulates 10000 bars and 100 scheduled market intents within 3000ms',()=>{const bars=makeFixture('PERFORMANCE',10000),signals=Array.from({length:100},(_,index)=>({barIndex:index*99,orders:[{action:index%2?'sell' as const:'buy' as const,quantity:1}]}));const start=performance.now();const result=backtestStrategy({bars,signals});const milliseconds=performance.now()-start;expect(result.ok).toBe(true);expect(result.fills).toHaveLength(100);measurements.push({workload:'10000-bar OHLC strategy with 100 market intents',milliseconds,targetMilliseconds:3000});expect(milliseconds).toBeLessThan(3000);});
});
afterAll(async()=>{const paths=['src/domain/fixtures.ts','src/domain/data.ts','src/domain/indicators.ts','src/domain/strategy.ts','src/chart/indicator-port.ts','src/chart/indicator-settings.ts'];const hashes=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));await mkdir('reports',{recursive:true});await writeFile('reports/performance.json',JSON.stringify({at:new Date().toISOString(),kind:'CPU domain workload only; no packaged rendering or interaction measurement',fixture:true,node:process.version,platform:process.platform,architecture:process.arch,sourceHashes:hashes,measurements},null,2)+'\n');});
