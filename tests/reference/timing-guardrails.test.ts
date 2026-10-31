/**
 * GUARDRAIL 2: the right data at the right time, for EVERY built-in (the ten original kinds plus every catalog id),
 * data-driven over the catalog with new-instance default inputs, on tests/fixtures/reference/bars.json (dailyEdge:
 * trends, price gaps, weekend time gaps, a 20-bar flat zero-volume stretch, zero-volume bars, unchanged closes).
 *
 *  a. No look-ahead / no repaint: the values computed on bars[0..t] equal the full-series values on bars 0..t, for every
 *     t. Only the kinds in REPAINT_EXEMPT may differ, each with its reason and confirmation delay; the exemption list is
 *     checked against the code's own metadata (catalog policies or the projects flag), every exemption must actually be
 *     needed, and a kind with a bounded delay must be final once that many later bars exist. Forward-shifted plots must
 *     project exactly the values the later bars show (right future offset).
 *  R-DEFAULTS. Omitted inputs mean the defaults: calculateIndicator(id, bars, {}) equals the call with every default.
 *
 * KNOWN_FAILURES entries run as `it.fails` with their finding id; remove an entry when the fix lands.
 */
import {describe,expect,it} from 'vitest';
import {calculateIndicator,type IndicatorResult} from '../../src/domain/indicators';
import {ALL_IDS,BARS,defaultInputs,definitionOf,describeMismatch,finite} from './harness';
import {optionsFor} from './context';
import {REPAINT_EXEMPT,HEADLESS_UNAVAILABLE,INTRADAY_EXEMPT} from './exemptions';
import type {Bar} from '../../src/domain/types';

const bars=BARS.dailyEdge;
interface Chart {bars:readonly Bar[];resolution:string;calendar:'utc'|'us-equity'}
const DAILY:Chart={bars,resolution:'1D',calendar:'utc'};
const INTRADAY:Record<string,Chart>={'US equity 30m extended hours (New York)':{bars:BARS.us30m,resolution:'30m',calendar:'us-equity'},'crypto 1h (UTC)':{bars:BARS.crypto1h,resolution:'60m',calendar:'utc'}};
const calc=(id:string,rows:readonly Bar[]=bars,inputs=defaultInputs(id),chart:Chart=DAILY)=>calculateIndicator(id,rows,inputs as Record<string,unknown>,optionsFor(id,rows,chart.resolution,chart.calendar));
const close=(a:unknown,b:unknown)=>a===null&&b===null||finite(a)&&finite(b)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b));
export const KNOWN_FAILURES:Record<string,string>={
 // R1: calculateIndicator reads an omitted Source as close instead of the catalog default.
 'defaults:cci':'R1','defaults:median':'R1','defaults:twap':'R1',
 // R2: Periodic / Session volume profile POC, VAH and VAL show the whole period's levels on its earlier bars.
 '2a-intraday:pvp':'R2','2a-intraday:svp':'R2',
};
function plotsOf(result:IndicatorResult):Map<string,readonly (number|null)[]>{return new Map(result.series.map(row=>[row.id,row.values]));}
/** First (t, plot, bar) where the prefix calculation disagrees with the full one on bars <= t - delay. */
function prefixViolation(id:string,delay:number,chart:Chart=DAILY):string|null{
 const bars=chart.bars,full=plotsOf(calc(id,bars,defaultInputs(id),chart));
 for(let t=0;t<bars.length;t++){
  const prefix=calc(id,bars.slice(0,t+1),defaultInputs(id),chart);if(prefix.diagnostics.length&&!prefix.series.length)continue;// too few bars to calculate yet
  for(const [plot,values] of plotsOf(prefix)){
   const reference=full.get(plot);if(!reference)return `t=${t}: plot ${plot} only exists on the prefix`;
   for(let s=0;s<=t-delay;s++)if(!close(values[s],reference[s]))return `prefix 0..${t}, plot ${plot}, ${describeMismatch({index:s,actual:values[s],expected:reference[s]},bars)}`;
  }
 }
 return null;
}
describe('guardrail 2a: no look-ahead, no repaint (bars[0..t] vs full series)',()=>{
 const tested=ALL_IDS.filter(id=>!HEADLESS_UNAVAILABLE[id]);
 for(const id of tested){
  const exempt=REPAINT_EXEMPT[id],finding=KNOWN_FAILURES['2a:'+id];
  (finding?it.fails:it)(`${id}${exempt?' (exempt: '+exempt.why+')':''}${finding?' [known failure '+finding+']':''}`,()=>{
   const full=calc(id);
   expect(full.series.some(row=>row.values.some(value=>value!==null))||!!full.marks,id+' produces values').toBe(true);
   if(!exempt){expect(prefixViolation(id,0)).toBeNull();return;}
   // The exemption is real: the strict check fails ...
   expect(prefixViolation(id,0),id+' is exempt but never revises a value; remove it from REPAINT_EXEMPT').not.toBeNull();
   // ... the code documents it ...
   const definition=definitionOf(id)!;expect(definition.policies.some(text=>exempt.reason.test(text))||definition.projects===true||definition.viewport===true,id+' repaints without saying so in its catalog policies').toBe(true);
   // ... and a bounded delay holds.
   if(exempt.delay!==null)expect(prefixViolation(id,exempt.delay)).toBeNull();
  },120000);
 }
 it('every kind is either tested here or listed as headless-unavailable with a reason',()=>{
  for(const id of Object.keys(HEADLESS_UNAVAILABLE))expect(ALL_IDS).toContain(id);
  for(const id of Object.keys(REPAINT_EXEMPT))expect(ALL_IDS).toContain(id);
 });
});
describe('guardrail 2a on intraday charts (sessions, DST, 24/7): no look-ahead, no repaint',()=>{
 for(const [name,chart] of Object.entries(INTRADAY))for(const id of ALL_IDS.filter(id=>!HEADLESS_UNAVAILABLE[id]&&!REPAINT_EXEMPT[id]&&!definitionOf(id)?.finerBars&&!definitionOf(id)?.dailyHistory)){
  const exempt=INTRADAY_EXEMPT[id],finding=KNOWN_FAILURES['2a-intraday:'+id];
  (finding?it.fails:it)(`${name}: ${id}${exempt?' (exempt: '+exempt.why+')':''}${finding?' [known failure '+finding+']':''}`,()=>{
   if(!exempt){expect(prefixViolation(id,0,chart)).toBeNull();return;}
   expect(prefixViolation(id,0,chart),id+' is exempt on intraday charts but never revises a value').not.toBeNull();
   expect(definitionOf(id)!.policies.some(text=>exempt.reason.test(text)),id+' repaints without saying so in its catalog policies').toBe(true);
  },120000);
 }
});
describe('guardrail 2a: forward-shifted plots project the values later bars show',()=>{
 const projecting=ALL_IDS.filter(id=>definitionOf(id)?.projects);
 it('the projecting kinds are known',()=>{expect(projecting.sort()).toEqual(['alligator','ichimoku']);});
 for(const id of projecting)it(id,()=>{
  const full=plotsOf(calc(id));let checked=0;
  for(const t of [120,180,240,270]){
   const prefix=calc(id,bars.slice(0,t+1));expect(prefix.projection,id+' projects').toBeTruthy();
   for(const [plot,future] of Object.entries(prefix.projection!)){
    future.forEach((value,k)=>{const at=t+1+k;if(at>=bars.length)return;checked++;
     expect(close(value,full.get(plot)![at]),`${id}.${plot} projected from bar ${t} at +${k+1}: ${value} vs ${full.get(plot)![at]}`).toBe(true);});
   }
  }
  expect(checked).toBeGreaterThan(20);
 });
});
describe('R-DEFAULTS: omitted inputs equal the documented defaults',()=>{
 for(const id of ALL_IDS.filter(id=>definitionOf(id)&&!HEADLESS_UNAVAILABLE[id])){
  const finding=KNOWN_FAILURES['defaults:'+id];
  (finding?it.fails:it)(`${id}${finding?' [known failure '+finding+']':''}`,()=>{
   // legacyOmit inputs keep their saved-instance meaning when absent by design, so they are left out on both sides.
   const stored=Object.fromEntries(definitionOf(id)!.inputs.filter(input=>!input.legacyOmit).map(input=>[input.key,input.defval]));
   const omitted=plotsOf(calculateIndicator(id,bars,{},optionsFor(id,bars))),explicit=plotsOf(calc(id,bars,stored));
   for(const [plot,values] of explicit){const other=omitted.get(plot)!;expect(other,plot).toBeTruthy();
    const index=values.findIndex((value,i)=>!close(other[i],value));expect(index,`${id}.${plot} with omitted inputs first differs at bar ${index}: ${other[index]} vs ${values[index]}`).toBe(-1);}
  });
 }
});
