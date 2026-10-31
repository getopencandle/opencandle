import {describe,expect,it} from 'vitest';
import type {BarsPatternMember} from '../../src/chart/lv-types/bars-pattern-data';
import {bindBarsPatternMember,datasetFingerprint,placementMember,resampleBarsPattern} from '../../src/chart/lv-types/bars-pattern-source';
import {intervalDatasetKey} from '../../src/domain/intervals';
import type {Bar,BarDataset} from '../../src/domain/types';
import {daily,dailyBars,dataset,day,minuteBars} from '../helpers/barspat-fixture';

// Re-review rounds 6 and 7: BSR-13 (rows that end after the span are excluded from the fingerprint), BSR-14 (Use available range
// recomputes it at the new span), BSR-15 (only rows inside the span count), BSR-16 (the choice carries its own revision and
// fingerprint, checked whichever dataset was used last). SYNTHETIC datasets only.
const chart={datasetId:'syn-1d',resolution:'1D'};
const dailyB=(from=0,shift=0)=>dataset('syn-1d-b','1D',dailyBars(from,30).map(b=>({...b,open:b.open+shift,high:b.high+shift,low:b.low+shift,close:b.close+shift})));
function bound(datasets:BarDataset[]):BarsPatternMember{
 const placed=placementMember(dailyBars(2,9).map(({volume:_v,...bar})=>bar),100);if(!placed.ok)throw Error(placed.message);
 return bindBarsPatternMember(placed.member,datasets,chart)!;
}
const must=(result:ReturnType<typeof resampleBarsPattern>)=>{if(!result.ok)throw Error(result.code+': '+result.message);return result.member;};
const keyB=()=>intervalDatasetKey(dailyB());
const chooseB=(extra:BarDataset[]=[])=>must(resampleBarsPattern(bound([daily(),dailyB(),...extra]),{datasets:[daily(),dailyB(),...extra],chart},{target:'1W',sourceKey:keyB()}));
const weeks=():BarDataset=>{const days=dailyBars(0,28),out:Bar[]=[];for(let w=0;w<4;w++){const r=days.slice(w*7,w*7+7);out.push({time:day(w*7),open:r[0].open,high:Math.max(...r.map(x=>x.high)),low:Math.min(...r.map(x=>x.low)),close:r[6].close,volume:1});}return dataset('wk','1W',out);};

describe('BSR-13 and BSR-15: the fingerprint covers only rows inside the span',()=>{
 it('a row that opens in the span but ends after it is excluded; an in-span row changes it',()=>{
  const w=weeks(),base=datasetFingerprint(w,day(2),day(9));
  const straddle={...w,bars:w.bars.map(b=>b.time===day(7)?{...b,close:b.close+3,high:b.high+3}:b)};
  expect(datasetFingerprint(straddle,day(2),day(9))).toBe(base);
  const d=daily(),inSpan={...d,bars:d.bars.map(b=>b.time===day(4)?{...b,close:b.close+0.01,high:b.high+0.01}:b)};
  expect(datasetFingerprint(inSpan,day(2),day(9))).not.toBe(datasetFingerprint(d,day(2),day(9)));
 });
 it('trimming earlier history of the chosen source does not make the choice look changed',()=>{
  const week=chooseB();
  expect(resampleBarsPattern(week,{datasets:[daily(),dailyB(1)],chart},{target:'1D'}).ok).toBe(true);
 });
 it('adding later history does not either',()=>{
  const week=chooseB();
  const longer=dataset('syn-1d-b','1D',dailyBars(0,30));
  expect(resampleBarsPattern(week,{datasets:[daily(),{...longer,bars:longer.bars.slice(0,28)}],chart},{target:'1D'}).ok).toBe(true);
 });
});

describe('BSR-14: Use available range under replay keeps the choice valid after the replay',()=>{
 it('choose B, narrow under a replay clock, end the replay with unchanged data, then switch: no "has changed"',()=>{
  const ds=[daily(),dailyB()],chosen=must(resampleBarsPattern(bound(ds),{datasets:ds,chart},{target:'1D',sourceKey:keyB()})),clock=day(5);
  const narrowed=resampleBarsPattern(chosen,{datasets:ds,chart,asOf:clock},{target:'1D',range:'available'});
  expect(narrowed.ok).toBe(true);if(!narrowed.ok)return;
  expect(narrowed.member.source.spanEnd).toBe(clock);
  const after=resampleBarsPattern(narrowed.member,{datasets:ds,chart},{target:'1W'});
  expect(after.ok,!after.ok?after.message:'').toBe(true);
 });
});

describe('BSR-16: the choice carries its own revision and fingerprint',()=>{
 it('choose B for 1W, switch to 1m, re-import B with other content, switch back: asked again',()=>{
  const m=dataset('m','1m',minuteBars(0,30)),pool=[daily(),dailyB(),m];
  const week=chooseB([m]);
  const minute=must(resampleBarsPattern(week,{datasets:pool,chart},{target:'1m'}));
  const reimported=[daily(),dailyB(0,50),m];
  const asked=resampleBarsPattern(minute,{datasets:reimported,chart},{target:'1W'});
  expect(asked).toMatchObject({ok:false,code:'AMBIGUOUS'});expect(!asked.ok&&asked.message).toContain('has changed');
  expect(resampleBarsPattern(minute,{datasets:pool,chart},{target:'1W'}).ok).toBe(true);
 });
});

describe('older saved patterns keep loading',()=>{
 it('a pattern saved with the round-7 fingerprint format and no choice fields is compared by revision only',()=>{
  const member=chooseB(),{choiceRevision:_r,choiceFingerprint:_f,...rest}=member.source as unknown as Record<string,unknown>;
  const old={...member,source:{...rest,sourceFingerprint:'lv1:1:2:3:abc'}} as unknown as BarsPatternMember;
  expect(resampleBarsPattern(old,{datasets:[daily(),dailyB(0,50)],chart},{target:'1D'}).ok).toBe(true);
  const changedRevision=dailyB(0,50);changedRevision.provenance.revision='r2';
  expect(resampleBarsPattern(old,{datasets:[daily(),changedRevision],chart},{target:'1D'})).toMatchObject({ok:false,code:'AMBIGUOUS'});
 });
});

describe('BSR-17: a replay that skipped the fingerprint comparison does not bless changed content',()=>{
 it('B re-imported with other content and the same revision, Use available range under replay, then the next switch says changed',()=>{
  const ds=[daily(),dailyB()],chosen=must(resampleBarsPattern(bound(ds),{datasets:ds,chart},{target:'1D',sourceKey:keyB()}));
  const changedB=dailyB(0,50);expect(changedB.provenance.revision).toBe(dailyB().provenance.revision);
  const clock=day(5),reimported=[daily(),changedB];
  const narrowed=resampleBarsPattern(chosen,{datasets:reimported,chart,asOf:clock},{target:'1D',range:'available'});
  expect(narrowed.ok).toBe(true);if(!narrowed.ok)return;
  const asked=resampleBarsPattern(narrowed.member,{datasets:reimported,chart},{target:'1W'});
  expect(asked).toMatchObject({ok:false,code:'AMBIGUOUS'});expect(!asked.ok&&asked.message).toContain('has changed');
 });
 it('the original content is not refused after the same replay narrowing',()=>{
  const ds=[daily(),dailyB()],chosen=must(resampleBarsPattern(bound(ds),{datasets:ds,chart},{target:'1D',sourceKey:keyB()}));
  const narrowed=resampleBarsPattern(chosen,{datasets:ds,chart,asOf:day(5)},{target:'1D',range:'available'});
  expect(narrowed.ok).toBe(true);if(!narrowed.ok)return;
  expect(narrowed.member.source.spanEnd).toBe(day(5));
  const after=resampleBarsPattern(narrowed.member,{datasets:ds,chart},{target:'1W'});
  expect(after.ok,!after.ok?after.message:'').toBe(true);
 });
});
