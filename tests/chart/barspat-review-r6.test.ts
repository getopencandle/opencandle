import {describe,expect,it} from 'vitest';
import {readBarsPattern,type BarsPatternMember} from '../../src/chart/lv-types/bars-pattern-data';
import {bindBarsPatternMember,placementMember,resampleBarsPattern} from '../../src/chart/lv-types/bars-pattern-source';
import {intervalDatasetKey} from '../../src/domain/intervals';
import type {BarDataset} from '../../src/domain/types';
import {daily,dailyBars,dataset,minuteBars} from '../helpers/barspat-fixture';

// Re-review round 5: BSR-11 (a lost saved source is never replaced silently) and BSR-12 (the saved choice identifies content,
// not just the key). SYNTHETIC datasets only.
const chart={datasetId:'syn-1d',resolution:'1D'};
const dailyB=(revision='r1',shift=0)=>{const d=dataset('syn-1d-b','1D',dailyBars(0,30).map(b=>({...b,open:b.open+shift,high:b.high+shift,low:b.low+shift,close:b.close+shift})));d.provenance.revision=revision;return d;};
function bound(datasets:BarDataset[]):BarsPatternMember{
 const placed=placementMember(dailyBars(2,9).map(({volume:_v,...bar})=>bar),100);if(!placed.ok)throw Error(placed.message);
 return bindBarsPatternMember(placed.member,datasets,chart)!;
}
const must=(result:ReturnType<typeof resampleBarsPattern>)=>{if(!result.ok)throw Error(result.code+': '+result.message);return result.member;};
const chosenB=()=>must(resampleBarsPattern(bound([daily(),dailyB()]),{datasets:[daily(),dailyB()],chart},{target:'1W',sourceKey:intervalDatasetKey(dailyB())}));

describe('BSR-11: a lost chosen source asks again, even with one candidate left',()=>{
 it('only A left: refused once with the notice and A listed; choosing A proceeds',()=>{
  const week=chosenB();
  const asked=resampleBarsPattern(week,{datasets:[daily()],chart},{target:'1D'});
  expect(asked).toMatchObject({ok:false,code:'AMBIGUOUS'});
  expect(!asked.ok&&asked.message).toContain('The source you chose earlier is no longer loaded.');
  expect(!asked.ok&&asked.candidates!.map(c=>c.key)).toEqual([intervalDatasetKey(daily())]);
  const again=resampleBarsPattern(week,{datasets:[daily()],chart},{target:'1D',sourceKey:intervalDatasetKey(daily())});
  expect(again.ok&&readBarsPattern({lvBarsPattern:again.member}).state).toBe('supported');
  expect(again.ok&&again.member.source.sourceKey).toBe(intervalDatasetKey(daily()));
 });
 it('A plus a finer 1m left: still asked (both can serve a 1W target)',()=>{
  const ds=[daily(),dataset('m','1m',minuteBars(0,30))];
  const asked=resampleBarsPattern(chosenB(),{datasets:ds,chart},{target:'1W'});
  expect(asked).toMatchObject({ok:false,code:'AMBIGUOUS'});expect(!asked.ok&&asked.message).toContain('no longer loaded');
 });
 it('nothing can serve the target: the normal no-source refusal, not an empty question',()=>{
  expect(resampleBarsPattern(chosenB(),{datasets:[daily()],chart},{target:'1s'})).toMatchObject({ok:false,code:'NO_SOURCE'});
 });
});

describe('BSR-12: the saved choice identifies content',()=>{
 it('the same key re-imported with a different revision counts as changed and is asked again',()=>{
  const week=chosenB(),reimported=[daily(),dailyB('r2',50)];
  const asked=resampleBarsPattern(week,{datasets:reimported,chart},{target:'1D'});
  expect(asked).toMatchObject({ok:false,code:'AMBIGUOUS'});
  expect(!asked.ok&&asked.message).toContain('The source you chose earlier has changed.');
  expect(!asked.ok&&asked.candidates!.length).toBe(2);
 });
 it('an unchanged revision keeps being reused with no question',()=>{
  expect(resampleBarsPattern(chosenB(),{datasets:[daily(),dailyB()],chart},{target:'1D'}).ok).toBe(true);
 });
 it('two loaded datasets sharing the chosen key are reported as ambiguous, not as unavailable',()=>{
  const dup=[daily(),dailyB(),dailyB('r9',5)];
  const result=resampleBarsPattern(bound([daily(),dailyB()]),{datasets:dup,chart},{target:'1W',sourceKey:intervalDatasetKey(dailyB())});
  expect(result).toMatchObject({ok:false,code:'AMBIGUOUS'});
  expect(!result.ok&&result.message).toContain('More than one loaded source has this identity');
  expect(!result.ok&&result.message).not.toContain('no longer available');
 });
});
