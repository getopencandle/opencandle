import {describe,expect,it} from 'vitest';
import type {BarsPatternMember} from '../../src/chart/lv-types/bars-pattern-data';
import {bindBarsPatternMember,placementMember,resampleBarsPattern,type ResampleRequest} from '../../src/chart/lv-types/bars-pattern-source';
import {intervalDatasetKey} from '../../src/domain/intervals';
import type {Bar,BarDataset} from '../../src/domain/types';
import {daily,dailyBars,dataset,day,minuteBars} from '../helpers/barspat-fixture';

// No future data may ever influence a pattern (decision). Every case re-samples a Wed..Tue 1D pattern twice: once from the
// SYNTHETIC datasets and once from copies whose rows at or after the cutoff (the span end, or the replay clock) are all mutated.
// The two results must be identical on every path. SYNTHETIC data only.
const chart={datasetId:'syn-1d',resolution:'1D'};
function pattern(from=2,to=9):BarsPatternMember{
 const placed=placementMember(dailyBars(from,to).map(({volume:_v,...bar})=>bar),100);if(!placed.ok)throw Error(placed.message);
 return bindBarsPatternMember(placed.member,[daily()],chart)!;
}
function weekly(id='wk-a'){
 const days=dailyBars(0,28),out:Bar[]=[];
 for(let w=0;w<4;w++){const rows=days.slice(w*7,w*7+7);out.push({time:day(w*7),open:rows[0].open,high:Math.max(...rows.map(r=>r.high)),low:Math.min(...rows.map(r=>r.low)),close:rows[6].close,volume:1});}
 return dataset(id,'1W',out);
}
const allMinutes=(id='syn-1m-all',from=0)=>dataset(id,'1m',minuteBars(from,30));
/** Mutates every row at or after `cutoff` (Unix seconds). */
function mutated(rows:readonly BarDataset[],cutoff:number):BarDataset[]{
 return rows.map(item=>({...item,bars:item.bars.map((bar,i)=>bar.time>=cutoff?{...bar,open:bar.open+400+i%7,high:bar.high+900+i%11,low:bar.low-300-i%5,close:bar.close+650+i%13,volume:bar.volume*3+1}:bar)}));
}
const fiveHour=()=>dataset('syn-5h','300m',Array.from({length:30*24/5},(_,i)=>({...dailyBars(0,1)[0],time:day(0)+i*18000})));
type Case={name:string;datasets:()=>BarDataset[];request:(datasets:BarDataset[])=>ResampleRequest;member?:BarsPatternMember};
const cases:Case[]=[
 {name:'finer: 1m exact',datasets:()=>[daily(),allMinutes()],request:()=>({target:'1m'})},
 {name:'finer: 5h built from 1m',datasets:()=>[daily(),allMinutes()],request:()=>({target:'300m'})},
 {name:'finer: 5h exact dataset whose last bar straddles the span end',datasets:()=>[daily(),fiveHour()],request:()=>({target:'300m'})},
 {name:'equal: 1D exact',datasets:()=>[daily()],request:()=>({target:'1D'})},
 {name:'coarser: 1W from daily',datasets:()=>[daily()],request:()=>({target:'1W'})},
 {name:'coarser: 1W from 1m and daily',datasets:()=>[daily(),allMinutes()],request:()=>({target:'1W'})},
 {name:'coarser: 1W with an exact weekly dataset beside daily',datasets:()=>[daily(),weekly()],request:()=>({target:'1W'})},
 {name:'coarser: 1W from the exact weekly dataset only',datasets:()=>[weekly()],request:()=>({target:'1W'})},
 {name:'coarser: 1M',datasets:()=>[daily()],request:()=>({target:'1M'})},
 {name:'coarser: 2D',datasets:()=>[daily()],request:()=>({target:'2D'})},
 {name:'explicit source: 1m into 1W',datasets:()=>[daily(),allMinutes()],request:ds=>({target:'1W',sourceKey:intervalDatasetKey(ds[1])})},
 {name:'explicit source: 1m into 5h',datasets:()=>[daily(),allMinutes()],request:ds=>({target:'300m',sourceKey:intervalDatasetKey(ds[1])})},
 {name:'explicit source: daily into 3D',datasets:()=>[daily(),allMinutes()],request:ds=>({target:'3D',sourceKey:intervalDatasetKey(ds[0])})},
 {name:'explicit source: exact weekly',datasets:()=>[daily(),weekly()],request:ds=>({target:'1W',sourceKey:intervalDatasetKey(ds[1])})},
 {name:'exact dataset: one of two 1m sources chosen',datasets:()=>[daily(),allMinutes('m-a'),allMinutes('m-b')],request:ds=>({target:'1m',sourceKey:intervalDatasetKey(ds[2])})},
 {name:'use available range: 1m missing the first day',datasets:()=>[daily(),allMinutes('m-late',3)],request:()=>({target:'1m',range:'available'})},
 {name:'use available range: 1W from the exact weekly dataset on a longer pattern',member:pattern(2,16),datasets:()=>[weekly()],request:()=>({target:'1W',range:'available'})},
 {name:'use available range: 1W from partial 1m',datasets:()=>[daily(),dataset('m-part','1m',minuteBars(2,6))],request:()=>({target:'1W',range:'available'})},
];

describe('no future data influences a pattern (every path)',()=>{
 for(const item of cases){
  it(item.name+': rows at or after the span end are irrelevant',()=>{
   const member=item.member??pattern(),spanEnd=member.source.spanEnd;
   const base=item.datasets(),future=mutated(base,spanEnd);
   expect(future.some((d,i)=>JSON.stringify(d.bars)!==JSON.stringify(base[i].bars))).toBe(true);
   const a=resampleBarsPattern(member,{datasets:base,chart},item.request(base)),b=resampleBarsPattern(member,{datasets:future,chart},item.request(future));
   expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
 }
 it('the cases produce real results or visible refusals, not empty failures',()=>{
  const outcomes=cases.map(item=>{const ds=item.datasets();const r=resampleBarsPattern(item.member??pattern(),{datasets:ds,chart},item.request(ds));return r.ok?'ok':r.code;});
  expect(outcomes.filter(code=>code==='ok').length).toBeGreaterThanOrEqual(10);
  expect(outcomes.filter(code=>code==='INVALID'||code==='UNBOUND'||code==='NO_SOURCE'||code==='EMPTY')).toEqual([]);
 });
});

describe('replay: rows not complete at the replay clock never influence a pattern',()=>{
 // The clock sits inside the span, as when a pattern is re-sampled while a replay is paused mid-pattern.
 const clock=day(6);
 const replayCases:Array<[string,()=>BarDataset[],ResampleRequest]>=[
  ['1m exact',()=>[daily(),allMinutes()],{target:'1m'}],
  ['1m, use available range',()=>[daily(),allMinutes()],{target:'1m',range:'available'}],
  ['5h built from 1m, use available range',()=>[daily(),allMinutes()],{target:'300m',range:'available'}],
  ['1W built from daily, use available range',()=>[daily()],{target:'1W',range:'available'}],
  ['1D exact, use available range',()=>[daily()],{target:'1D',range:'available'}],
 ];
 for(const [name,make,request] of replayCases){
  it(name,()=>{
   const member=pattern(),base=make(),future=mutated(base,clock);
   const a=resampleBarsPattern(member,{datasets:base,chart,asOf:clock},request),b=resampleBarsPattern(member,{datasets:future,chart,asOf:clock},request);
   expect(JSON.stringify(b)).toBe(JSON.stringify(a));
   if(a.ok)expect(a.member.source.spanEnd).toBeLessThanOrEqual(clock);
  });
 }
 it('with a clock inside the span the full range is refused as partial, and Use available range ends at the clock',()=>{
  const member=pattern(),ds=[daily(),allMinutes()];
  const refused=resampleBarsPattern(member,{datasets:ds,chart,asOf:clock},{target:'1m'});
  expect(refused).toMatchObject({ok:false,code:'PARTIAL',covered:{start:day(2),end:clock}});
  const narrowed=resampleBarsPattern(member,{datasets:ds,chart,asOf:clock},{target:'1m',range:'available'});
  expect(narrowed.ok&&narrowed.member.source.spanEnd).toBe(clock);
  expect(narrowed.ok&&narrowed.summary.count).toBe(4*1440);
 });
 it('a pattern whose last bar is a replay forming bar does not bind, so it cannot pull later rows',()=>{
  const bars=dailyBars(2,9).map(({volume:_v,...bar})=>bar);bars[bars.length-1]={...bars[bars.length-1],close:bars[bars.length-1].close+0.37};
  const placed=placementMember(bars,100);if(!placed.ok)throw Error(placed.message);
  expect(resampleBarsPattern(placed.member,{datasets:[daily(),allMinutes()],chart,asOf:day(9)-3600},{target:'1m'})).toMatchObject({ok:false,code:'UNBOUND'});
 });
});

// Datasets derived from MINUTE data, with the future mutated in the minutes first: exact coarse bars that open before the cutoff
// but run past it (a week, a 3D bar, a month) then carry the future themselves. A path that returns such a bar, or builds from a
// finer row that straddles the cutoff, differs between the two runs.
import {aggregateInterval} from '../../src/domain/intervals';
function family(minutes:Bar[]){
 const m=dataset('fam-1m','1m',minutes),from=(res:string,id:string)=>dataset(id,res,aggregateInterval(m,res).dataset.bars);
 return{m,d:from('1D','fam-1d'),w:from('1W','fam-1w'),d3:from('3D','fam-3d'),h5:from('300m','fam-5h'),mo:from('1M','fam-1mo')};
}
const mutatedMinutes=(cutoff:number)=>minuteBars(0,30).map((bar,i)=>bar.time>=cutoff?{...bar,open:bar.open+400+i%7,high:bar.high+900+i%11,low:bar.low+i%5,close:bar.close+650+i%13}:bar);
describe('no future data: every dataset derived from minute data that was mutated after the cutoff',()=>{
 type Pick=(f:ReturnType<typeof family>)=>BarDataset[];
 const famCases:Array<[string,Pick,(f:ReturnType<typeof family>)=>ResampleRequest]>=[
  ['weekly original only into 1M',f=>[f.w],()=>({target:'1M'})],
  ['weekly original only into 1M, Use available range',f=>[f.w],()=>({target:'1M',range:'available'})],
  ['exact weekly beside 1m into 1W',f=>[f.w,f.m],()=>({target:'1W'})],
  ['exact weekly only into 1W, Use available range',f=>[f.w],()=>({target:'1W',range:'available'})],
  ['exact 3D only into 3D',f=>[f.d3],()=>({target:'3D'})],
  ['exact 3D only into 3D, Use available range',f=>[f.d3],()=>({target:'3D',range:'available'})],
  ['exact 5h only into 5h',f=>[f.h5],()=>({target:'300m'})],
  ['exact monthly only into 1M',f=>[f.mo],()=>({target:'1M'})],
  ['3D original into 1M',f=>[f.d3],()=>({target:'1M',range:'available'})],
  ['daily into 1W',f=>[f.d],()=>({target:'1W'})],
  ['explicit weekly into 1M',f=>[f.w,f.m],f=>({target:'1M',sourceKey:intervalDatasetKey(f.w)})],
 ];
 for(const [name,pick,request] of famCases){
  it(name,()=>{
   const base=family(minuteBars(0,30)),future=family(mutatedMinutes(day(9)));
   expect(JSON.stringify(future.w.bars)).not.toBe(JSON.stringify(base.w.bars));
   const member=pattern();
   const a=resampleBarsPattern(member,{datasets:pick(base),chart},request(base)),b=resampleBarsPattern(member,{datasets:pick(future),chart},request(future));
   expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
 }
});

// Every stored span field is a lookahead boundary. A narrowed pattern keeps a wider choice span; a replay clock inside that
// wider span (past the narrowed end) must not let rows after the clock reach the saved-choice comparison.
describe('replay clock inside each stored span: rows after the clock are irrelevant to the saved choice',()=>{
 const dailyB=(cut?:number)=>{const d=dataset('syn-1d-b','1D',dailyBars(0,30));return cut===undefined?d:{...d,bars:d.bars.map(b=>b.time>=cut?{...b,open:b.open+400,high:b.high+900,close:b.close+650}:b)};};
 const key=()=>intervalDatasetKey(dailyB());
 function narrowedUnderReplay(){
  const ds=[daily(),dailyB()],member=pattern();
  const chosen=resampleBarsPattern(member,{datasets:ds,chart},{target:'1D',sourceKey:key()});if(!chosen.ok)throw Error(chosen.message);
  const narrowed=resampleBarsPattern(chosen.member,{datasets:ds,chart,asOf:day(5)},{target:'1D',range:'available'});if(!narrowed.ok)throw Error(narrowed.message);
  return narrowed.member;
 }
 const clocks:Array<[string,number]>=[['inside the narrowed span',day(4)],['past the narrowed end, inside the choice span',day(7)+12*3600],['at the choice span end',day(9)]];
 for(const [name,clock] of clocks){
  for(const target of ['1W','1D','1m']){
   it(`${name}, target ${target}`,()=>{
    const member=narrowedUnderReplay(),extra=[dataset('lk-1m','1m',minuteBars(0,30))];
    const a=resampleBarsPattern(member,{datasets:[daily(),dailyB(),...extra],chart,asOf:clock},{target});
    const futureMinutes=extra.map(d=>({...d,bars:d.bars.map(b=>b.time>=clock?{...b,open:b.open+400,high:b.high+900,close:b.close+650}:b)}));
    const b=resampleBarsPattern(member,{datasets:[mutatedDaily(clock),dailyB(clock),...futureMinutes],chart,asOf:clock},{target});
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
   });
  }
 }
 function mutatedDaily(clock:number){const d=daily();return{...d,bars:d.bars.map(b=>b.time>=clock?{...b,open:b.open+400,high:b.high+900,close:b.close+650}:b)};}
});
