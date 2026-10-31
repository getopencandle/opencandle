import {describe,expect,it} from 'vitest';
import {calculateIndicator,indicatorActivePlotIds} from '../../src/domain/indicators';
import {RSI_DIVERGENCE_POLICY,RSI_DIVERGENCE_TOOLTIP,rsiDivergence,rsiDivergencePairQualifies,rsiDivergenceSeparationAccepted,rsiDivergenceDisplayValues} from '../../src/domain/rsi-divergence';
import type {Bar} from '../../src/domain/types';

// SYNTHETIC hand-built fixtures (not market data). The rule is LV's own design decision
// the reference rule is not in recorded facts, so nothing here is a reference comparison.
const N=230;
/** Flat RSI of 50 (no strict pivot on a plateau) with hand-placed dips and peaks. */
function fixture(){
 const rsi:(number|null)[]=Array(N).fill(50);
 const low:number[]=Array(N).fill(100),high:number[]=Array(N).fill(110);
 const dip=(index:number,value:number,price:number)=>{rsi[index]=value;low[index]=price;};
 const peak=(index:number,value:number,price:number)=>{rsi[index]=value;high[index]=price;};
 dip(10,20,90);dip(20,30,85);// bullish: lower price low, higher RSI low; 9 bars between
 peak(30,80,120);peak(40,70,125);// bearish: higher price high, lower RSI high
 dip(50,25,80);dip(60,25,75);// tie: equal RSI lows are not a divergence
 dip(70,20,90);dip(76,30,85);// exactly 5 bars between: accepted
 dip(86,20,90);dip(148,30,80);// 61 bars between: rejected
 dip(209,40,70);// 60 bars between 148 and 209: accepted
 const bars:Bar[]=rsi.map((_,i)=>({time:1700000000+i*60,open:105,high:high[i],low:low[i],close:105,volume:10}));
 return {rsi,bars};
}
const segmentsOf=(kind:string,result:ReturnType<typeof rsiDivergence>)=>result.segments.filter(row=>row.kind===kind).map(row=>[row.fromIndex,row.toIndex,row.confirmIndex]);

describe('RSI divergence rule (OpenCandle design)',()=>{
 it('the policy constants are OpenCandle-chosen and the tooltip names OpenCandle, not the reference',()=>{
  expect(RSI_DIVERGENCE_POLICY).toEqual({left:5,right:5,minBetween:5,maxBetween:60});
  expect(Object.isFrozen(RSI_DIVERGENCE_POLICY)).toBe(true);
  expect(RSI_DIVERGENCE_TOOLTIP).toBe('Divergence uses OpenCandle pivot rules (5 bars each side, 5 to 60 bars apart).');
  expect(RSI_DIVERGENCE_TOOLTIP).not.toMatch(/INDREST|DD-1|—/);
 });
 it('finds one bullish case, one bearish case, a 5-between acceptance and a 60-between acceptance; rejects tie and 61 between',()=>{
  const {rsi,bars}=fixture(),result=rsiDivergence(rsi,bars);
  expect(segmentsOf('bullish',result)).toEqual([[10,20,25],[70,76,81],[148,209,214]]);
  expect(segmentsOf('bearish',result)).toEqual([[30,40,45]]);
  // tie (50 -> 60), 61 between (86 -> 148): nothing at those confirmation bars
  expect(result.bullish[65]).toBeNull();expect(result.bullish[153]).toBeNull();
 });
 it('the separation predicate: 4 between rejected, 5 and 60 accepted, 61 rejected', ()=>{
  expect(rsiDivergenceSeparationAccepted(10,15)).toBe(false);// 4 bars between
  expect(rsiDivergenceSeparationAccepted(10,16)).toBe(true);// 5 bars between
  expect(rsiDivergenceSeparationAccepted(10,71)).toBe(true);// 60 bars between
  expect(rsiDivergenceSeparationAccepted(10,72)).toBe(false);// 61 bars between
 });
 it('two pivots five bars apart cannot both be strict five-bar pivots, so no divergence is produced there', ()=>{
  const rsi:(number|null)[]=Array(40).fill(50);rsi[10]=20;rsi[15]=30;
  const bars:Bar[]=rsi.map((_,i)=>({time:1700000000+i*60,open:105,high:110,low:i===10?90:i===15?85:100,close:105,volume:10}));
  const result=rsiDivergence(rsi,bars);expect(result.segments).toEqual([]);
 });
 it('equal prices or equal RSI never qualify in either direction', ()=>{
  expect(rsiDivergencePairQualifies('bullish',{price:90,rsi:20},{price:90,rsi:30})).toBe(false);
  expect(rsiDivergencePairQualifies('bullish',{price:90,rsi:20},{price:85,rsi:20})).toBe(false);
  expect(rsiDivergencePairQualifies('bullish',{price:90,rsi:20},{price:85,rsi:30})).toBe(true);
  expect(rsiDivergencePairQualifies('bearish',{price:120,rsi:80},{price:125,rsi:70})).toBe(true);
  expect(rsiDivergencePairQualifies('bearish',{price:120,rsi:80},{price:120,rsi:70})).toBe(false);
  expect(rsiDivergencePairQualifies('bearish',{price:120,rsi:80},{price:125,rsi:80})).toBe(false);
 });
 it('confirmation timing: the marker is on the bar where the right confirmation completes, never on the pivot bar or earlier', ()=>{
  const {rsi,bars}=fixture(),result=rsiDivergence(rsi,bars);
  expect(result.bullish[20]).toBeNull();expect(result.bullish[24]).toBeNull();expect(result.bullish[25]).toBe(30);expect(result.bullish[26]).toBeNull();
  expect(result.bearish[40]).toBeNull();expect(result.bearish[44]).toBeNull();expect(result.bearish[45]).toBe(70);
  // Prefix invariance: a consumer that has only seen bars up to m sees exactly the segments confirmed before m.
  const full=result.segments;
  for(const m of [24,25,26,45,46,81,82,214,215]){
   const prefix=rsiDivergence(rsi.slice(0,m),bars.slice(0,m));
   expect(prefix.segments,`prefix ${m}`).toEqual(full.filter(row=>row.confirmIndex<m));
   expect(prefix.bullish).toEqual(result.bullish.slice(0,m));expect(prefix.bearish).toEqual(result.bearish.slice(0,m));
  }
 });
 it('display values draw straight segments between the two RSI pivots and nothing outside them', ()=>{
  const {rsi,bars}=fixture(),result=rsiDivergence(rsi,bars),shown=rsiDivergenceDisplayValues(result.segments,'bullish',N);
  expect(shown[9]).toBeNull();expect(shown[10]).toBe(20);expect(shown[15]).toBe(25);expect(shown[20]).toBe(30);expect(shown[21]).toBeNull();
  expect(rsiDivergenceDisplayValues(result.segments,'bearish',N)[35]).toBe(75);
  expect(result.bullish.filter(v=>v!==null)).toHaveLength(3);// the marker series (calculation output) stays sparse
 });
 it('missing RSI inside a confirmation window disables that pivot', ()=>{
  const {rsi,bars}=fixture();rsi[22]=null;
  expect(segmentsOf('bullish',rsiDivergence(rsi,bars)).some(row=>row[1]===20)).toBe(false);
 });
});

describe('RSI divergence through the calculator',()=>{
 // SYNTHETIC closes: a steep fall, a bounce, then a gentler fall to a lower low (lower price, higher RSI), plus mirrored highs.
 const closes:number[]=[];
 for(let i=0;i<25;i++)closes.push(120+Math.sin(i/2)*0.5);
 for(let i=0;i<10;i++)closes.push(120-i*3.5);// steep fall to 88.5
 for(let i=1;i<=14;i++)closes.push(88.5+i*1.5);// bounce
 for(let i=0;i<18;i++)closes.push(108-i*1.25);// gentler fall to 86.75: a lower price low with a higher RSI low
 for(let i=1;i<=20;i++)closes.push(86.75+i*0.9);
 const bars:Bar[]=closes.map((close,i)=>({time:1700000000+i*86400,open:close+0.2,high:close+1,low:close-1,close,volume:1000}));
 it('the toggle defaults off: no divergence plots, no extra inputs, identical RSI values', ()=>{
  const off=calculateIndicator('rsi',bars,{length:14});
  expect(off.series.map(row=>row.id)).toEqual(['rsi']);expect((off as any).divergence).toBeUndefined();
  expect(indicatorActivePlotIds('rsi',{})).toEqual(['rsi']);
  const explicit=calculateIndicator('rsi',bars,{length:14,divergence:false});
  expect(explicit.series).toEqual(off.series);expect(explicit.diagnostics).toEqual([]);
  const on=calculateIndicator('rsi',bars,{length:14,divergence:true});
  expect(on.diagnostics).toEqual([]);expect(on.series.map(row=>row.id)).toEqual(['rsi','divergenceBullish','divergenceBearish']);
  expect(on.series[0].values).toEqual(off.series[0].values);
  expect(indicatorActivePlotIds('rsi',{divergence:true})).toEqual(['rsi','divergenceBullish','divergenceBearish']);
 });
 it('the calculator output equals the pure rule applied to its own RSI, with no value before the confirmation bar', ()=>{
  const on=calculateIndicator('rsi',bars,{length:14,divergence:true}),pure=rsiDivergence(on.series[0].values,bars);
  expect(on.series[1].values).toEqual(pure.bullish);expect(on.series[2].values).toEqual(pure.bearish);
  expect(pure.segments.length).toBeGreaterThan(0);
  for(const segment of pure.segments){
   const marker=segment.kind==='bullish'?on.series[1].values:on.series[2].values;
   expect(marker[segment.toIndex]).toBeNull();expect(marker[segment.confirmIndex]).toBe(segment.toRsi);
   expect(segment.confirmIndex-segment.toIndex).toBe(5);
  }
  expect((on as any).divergence.segments).toEqual(pure.segments);
  expect(on.policies.join(' ')).toContain('INDREST-DD-1');
  expect(on.policies.join(' ')).not.toContain('Divergence remains unimplemented');
 });
 it('divergence works with smoothing: plots keep the smoothing plots in front, ids stay in the active order', ()=>{
  const on=calculateIndicator('rsi',bars,{length:14,smoothingType:'SMA',smoothingLength:5,smoothingMultiplier:2,divergence:true});
  expect(on.diagnostics).toEqual([]);
  expect(on.series.map(row=>row.id)).toEqual(indicatorActivePlotIds('rsi',{smoothingType:'SMA',smoothingLength:5,smoothingMultiplier:2,divergence:true}));
  expect(on.series.map(row=>row.id)).toEqual(['rsi','smooth','divergenceBullish','divergenceBearish']);
 });
 it('only a boolean is accepted and only RSI takes the input', ()=>{
  expect(calculateIndicator('rsi',bars,{divergence:'yes'}).diagnostics.join(' ')).toMatch(/divergence/i);
  expect(calculateIndicator('sma',bars,{divergence:true}).diagnostics).toEqual(['Unsupported indicator calculation input.']);
 });
});
