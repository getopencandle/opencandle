import {describe,expect,it} from 'vitest';
import type {BarsPatternMember} from '../../src/chart/lv-types/bars-pattern-data';
import {bindBarsPatternMember,placementMember,resampleBarsPattern} from '../../src/chart/lv-types/bars-pattern-source';
import type {Bar} from '../../src/domain/types';
import {daily,dailyBars,dataset,day,minuteBars} from '../helpers/barspat-fixture';

// Re-review round 3 findings BSR-7 (clamped leading time must not feed the next re-sample's window math), BSR-8 (a finer row
// that straddles the span end must not feed a coarser bar) and the asOf coverage nit. SYNTHETIC datasets only.
const chart={datasetId:'syn-1d',resolution:'1D'};
function bound(from:number,to:number):BarsPatternMember{
 const placed=placementMember(dailyBars(from,to).map(({volume:_v,...bar})=>bar),100);if(!placed.ok)throw Error(placed.message);
 return bindBarsPatternMember(placed.member,[daily()],chart)!;
}
function weekly(id='wk-a'){
 const days=dailyBars(0,28),out:Bar[]=[];
 for(let w=0;w<4;w++){const rows=days.slice(w*7,w*7+7);out.push({time:day(w*7),open:rows[0].open,high:Math.max(...rows.map(r=>r.high)),low:Math.min(...rows.map(r=>r.low)),close:rows[6].close,volume:1});}
 return dataset(id,'1W',out);
}
const must=(result:ReturnType<typeof resampleBarsPattern>)=>{if(!result.ok)throw Error(result.code+': '+result.message);return result.member;};

describe('BSR-7: a coarser step never hides a partial refusal in the next step',()=>{
 const late=()=>dataset('m-late','1m',minuteBars(7,30));
 const direct=()=>resampleBarsPattern(bound(2,9),{datasets:[daily(),late()],chart},{target:'1m'});
 it('direct 1D to 1m with 1m data starting Monday is partial (baseline)',()=>{
  expect(direct()).toMatchObject({ok:false,code:'PARTIAL',covered:{start:day(7),end:day(9)}});
 });
 it('1D to 1W to 1m is refused exactly like the direct step',()=>{
  const week=must(resampleBarsPattern(bound(2,9),{datasets:[daily()],chart},{target:'1W'}));
  const chained=resampleBarsPattern(week,{datasets:[daily(),late()],chart},{target:'1m'});
  expect(chained).toMatchObject({ok:false,code:'PARTIAL',covered:{start:day(7),end:day(9)}});
  expect(JSON.stringify(chained)).toBe(JSON.stringify(direct()));
 });
 it('1D to 1W to 1D to 1m and 1D to 1M to 1D to 1m are refused exactly like the direct step',()=>{
  for(const mid of ['1W','1M']){
   const a=must(resampleBarsPattern(bound(2,9),{datasets:[daily()],chart},{target:mid}));
   const back=must(resampleBarsPattern(a,{datasets:[daily()],chart},{target:'1D'}));
   const chained=resampleBarsPattern(back,{datasets:[daily(),late()],chart},{target:'1m'});
   expect(JSON.stringify(chained),mid).toBe(JSON.stringify(direct()));
  }
 });
});

describe('BSR-8: a finer source row that opens inside the span but ends after it never feeds a coarser bar',()=>{
 it('Wed..Tue 1D pattern, only a 1W source, target 1M: refused as partial, no bar built from the straddling week',()=>{
  const result=resampleBarsPattern(bound(2,9),{datasets:[weekly()],chart},{target:'1M'});
  expect(result).toMatchObject({ok:false,code:'PARTIAL'});
  expect(!result.ok&&result.available).toBeUndefined();
  expect(resampleBarsPattern(bound(2,9),{datasets:[weekly()],chart},{target:'1M',range:'available'}).ok).toBe(false);
 });
 it('a whole week inside the span still builds, and the straddling week is left out',()=>{
  const result=resampleBarsPattern(bound(2,16),{datasets:[weekly()],chart},{target:'1M',range:'available'});
  expect(result.ok).toBe(true);if(!result.ok)return;
  const wk=weekly().bars[1];
  expect(result.member.source).toMatchObject({spanStart:day(7),spanEnd:day(14),trimmed:true});
  expect(result.summary.count).toBe(1);
 });
});

describe('asOf: a replay clock inside the pattern makes the full span partial',()=>{
 const ds=()=>[daily(),dataset('m-all','1m',minuteBars(0,30))];
 const clocks:Array<[string,number]>=[['mid-span',day(5)+13*3600+17*60],['mid-last-bar',day(8)+12*3600],['one minute in',day(2)+60]];
 for(const [name,clock] of clocks){
  it(name,()=>{
   const member=bound(2,9);
   const refused=resampleBarsPattern(member,{datasets:ds(),chart,asOf:clock},{target:'1m'});
   expect(refused).toMatchObject({ok:false,code:'PARTIAL',covered:{start:day(2),end:clock}});
   const narrowed=resampleBarsPattern(member,{datasets:ds(),chart,asOf:clock},{target:'1m',range:'available'});
   expect(narrowed.ok&&narrowed.member.source.spanEnd).toBe(clock);
   expect(narrowed.ok&&narrowed.summary.count).toBe((clock-day(2))/60);
  });
 }
 it('a clock at or after the span end changes nothing',()=>{
  const member=bound(2,9),a=resampleBarsPattern(member,{datasets:ds(),chart},{target:'1m'}),b=resampleBarsPattern(member,{datasets:ds(),chart,asOf:day(9)},{target:'1m'});
  expect(JSON.stringify(b)).toBe(JSON.stringify(a));
 });
});
