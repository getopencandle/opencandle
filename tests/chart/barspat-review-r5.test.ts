import {describe,expect,it} from 'vitest';
import {readBarsPattern,type BarsPatternMember} from '../../src/chart/lv-types/bars-pattern-data';
import {bindBarsPatternMember,placementMember,resampleBarsPattern} from '../../src/chart/lv-types/bars-pattern-source';
import {intervalDatasetKey} from '../../src/domain/intervals';
import type {BarDataset} from '../../src/domain/types';
import {daily,dailyBars,dataset,minuteBars} from '../helpers/barspat-fixture';

// Re-review round 4 BSR-9 (a chosen source is reused) and BSR-10 (two datasets at the placed timeframe are never skipped for a
// finer source). SYNTHETIC datasets only.
const chart={datasetId:'syn-1d',resolution:'1D'};
const dailyB=()=>dataset('syn-1d-b','1D',dailyBars(0,30));
function bound(datasets:BarDataset[]):BarsPatternMember{
 const placed=placementMember(dailyBars(2,9).map(({volume:_v,...bar})=>bar),100);if(!placed.ok)throw Error(placed.message);
 return bindBarsPatternMember(placed.member,datasets,chart)!;
}
const must=(result:ReturnType<typeof resampleBarsPattern>)=>{if(!result.ok)throw Error(result.code+': '+result.message);return result.member;};
const stored=(member:BarsPatternMember)=>{const read=readBarsPattern({lvBarsPattern:member});return read.state==='supported'?read.member.source:null;};

describe('BSR-10: two datasets at the placed timeframe are asked about, even when a finer source exists',()=>{
 it('two 1D sources plus a 1m source covering only part of the span: AMBIGUOUS listing the two 1D sources',()=>{
  const ds=[daily(),dailyB(),dataset('late-1m','1m',minuteBars(7,30))];
  const result=resampleBarsPattern(bound(ds),{datasets:ds,chart},{target:'1W'});
  expect(result).toMatchObject({ok:false,code:'AMBIGUOUS'});
  expect(!result.ok&&result.candidates!.map(c=>c.resolution)).toEqual(['1D','1D']);
 });
 it('with one 1D source the same switch still succeeds',()=>{
  const ds=[daily(),dataset('late-1m','1m',minuteBars(7,30))];
  expect(resampleBarsPattern(bound(ds),{datasets:ds,chart},{target:'1W'}).ok).toBe(true);
 });
});

describe('BSR-9: a chosen source is reused until it is gone',()=>{
 const ds=()=>[daily(),dailyB()];
 const keyB=()=>intervalDatasetKey(dailyB());
 it('1D to 1W (choose B) to 1D to 1W: the user is asked once',()=>{
  const start=bound(ds());
  expect(resampleBarsPattern(start,{datasets:ds(),chart},{target:'1W'})).toMatchObject({ok:false,code:'AMBIGUOUS'});
  const week=must(resampleBarsPattern(start,{datasets:ds(),chart},{target:'1W',sourceKey:keyB()}));
  expect(stored(week)!.sourceKey).toBe(keyB());
  const back=resampleBarsPattern(week,{datasets:ds(),chart},{target:'1D'});
  expect(back.ok).toBe(true);if(!back.ok)return;
  expect(stored(back.member)).toMatchObject({sourceKey:keyB(),resolution:'1D'});
  expect(resampleBarsPattern(back.member,{datasets:ds(),chart},{target:'1W'}).ok).toBe(true);
 });
 it('a stored choice that cannot serve the target (a 1D source for 1m) falls back to the normal rule and is kept',()=>{
  const all=[...ds(),dataset('m','1m',minuteBars(0,30))];
  const week=must(resampleBarsPattern(bound(all),{datasets:all,chart},{target:'1W',sourceKey:keyB()}));
  const minute=resampleBarsPattern(week,{datasets:all,chart},{target:'1m'});
  expect(minute.ok).toBe(true);if(!minute.ok)return;
  expect(stored(minute.member)!.sourceKey).toBe(keyB());
 });
 it('when the chosen source is no longer loaded the user is asked again with a plain reason',()=>{
  const three=[daily(),dailyB(),dataset('syn-1d-c','1D',dailyBars(0,30))];
  const week=must(resampleBarsPattern(bound(three),{datasets:three,chart},{target:'1W',sourceKey:keyB()}));
  const without=[three[0],three[2]];
  const asked=resampleBarsPattern(week,{datasets:without,chart},{target:'1D'});
  expect(asked).toMatchObject({ok:false,code:'AMBIGUOUS'});
  expect(!asked.ok&&asked.message).toContain('The source you chose earlier is no longer loaded.');
  expect(!asked.ok&&/syn-|SYNTHETIC:/.test(asked.message.replace(/SYNTHETIC/g,''))).toBe(false);
 });
});
