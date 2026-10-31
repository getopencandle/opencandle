/**
 * GUARDRAIL 1: reference values.
 *
 * Expected outputs come from scripts/reference/generate_reference.py: the original author's published definition,
 * TA-Lib (cross-checked inside the generator) or StockCharts ChartSchool, in that order of preference. Where sources
 * disagree, the expected value follows the convention OpenCandle documents (its catalog provenance and policies) and
 * the disagreement is recorded in the case `notes` and in tests/fixtures/reference/coverage.json, not as a failure.
 *
 * Every defined bar is compared (no tail-only comparisons): null must match null, and finite values agree within
 * 1e-6 relative (absolute floor 1). The comparison starts at bar 0, so seeds and warm-up lengths are tested too.
 *
 * KNOWN_FAILURES: a case that currently differs is listed with its finding id and runs as `it.fails`, so the suite
 * stays green while the fix is routed. Remove the entry when the fix lands (the `it.fails` then fails and says so).
 */
import {describe,expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import {optionsFor} from './context';
import {BARS,EXPECTED,defaultInputs,firstMismatch,describeMismatch,type ReferenceCase} from './harness';

export const KNOWN_FAILURES:Record<string,string>={
};
const run=(c:ReferenceCase)=>{
 // Defaults are passed explicitly (what a new instance stores); see guardrail R-DEFAULTS for the omitted-input path.
 const result=calculateIndicator(c.indicator,BARS.daily,{...defaultInputs(c.indicator),...c.inputs} as Record<string,unknown>,optionsFor(c.indicator,BARS.daily));
 expect(result.diagnostics,c.id+' diagnostics').toEqual([]);
 const problems:string[]=[];
 for(const [plot,expected] of Object.entries(c.plots)){
  const series=result.series.find(row=>row.id===plot);
  if(!series){problems.push(`${plot}: plot missing`);continue;}
  const mismatch=firstMismatch(series.values,expected,c.warmup??0,c.tol);
  if(mismatch)problems.push(`${plot}: ${describeMismatch(mismatch,BARS.daily)}`);
 }
 expect(problems,`${c.id} vs ${c.source} (${c.cite})`).toEqual([]);
};
describe('reference values (daily fixture, 300 bars)',()=>{
 it('the fixture was cross-checked against TA-Lib',()=>{expect(EXPECTED.crosschecked.length).toBeGreaterThanOrEqual(15);});
 for(const c of EXPECTED.cases){
  const finding=KNOWN_FAILURES[c.id];
  (finding?it.fails:it)(`${c.id} (${c.indicator})${finding?' [known failure '+finding+']':''}`,()=>run(c));
 }
});
