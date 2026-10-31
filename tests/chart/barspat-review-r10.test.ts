import {describe,expect,it} from 'vitest';
import type {BarsPatternMember} from '../../src/chart/lv-types/bars-pattern-data';
import {bindBarsPatternMember,placementMember,resampleBarsPattern} from '../../src/chart/lv-types/bars-pattern-source';
import {intervalDatasetKey} from '../../src/domain/intervals';
import {daily,dailyBars,dataset,day} from '../helpers/barspat-fixture';

// The saved choice span fields are validated together; anything inconsistent is an invalid saved choice (ask again, never
// crash). SYNTHETIC datasets only.
const chart={datasetId:'syn-1d',resolution:'1D'};
const dailyB=()=>dataset('syn-1d-b','1D',dailyBars(0,30));
const ds=()=>[daily(),dailyB()];
function chosen():BarsPatternMember{
 const placed=placementMember(dailyBars(2,9).map(({volume:_v,...bar})=>bar),100);if(!placed.ok)throw Error(placed.message);
 const member=bindBarsPatternMember(placed.member,ds(),chart)!;
 const result=resampleBarsPattern(member,{datasets:ds(),chart},{target:'1W',sourceKey:intervalDatasetKey(dailyB())});if(!result.ok)throw Error(result.message);
 return result.member;
}
const withSpan=(patch:Record<string,unknown>)=>{const m=chosen();return{...m,source:{...m.source,...patch}} as unknown as BarsPatternMember;};
describe('BSR-19: inconsistent saved choice spans ask again',()=>{
 const cases:Array<[string,Record<string,unknown>]>=[
  ['only a start',{choiceSpanStart:day(2),choiceSpanEnd:null}],
  ['only an end',{choiceSpanStart:null,choiceSpanEnd:day(9)}],
  ['start not before end',{choiceSpanStart:day(9),choiceSpanEnd:day(9)}],
  ['a span that does not contain the current span',{choiceSpanStart:day(3),choiceSpanEnd:day(5)}],
 ];
 for(const [name,patch] of cases){
  it(name,()=>{
   const result=resampleBarsPattern(withSpan(patch),{datasets:ds(),chart},{target:'1D'});
   expect(result).toMatchObject({ok:false,code:'AMBIGUOUS'});expect(!result.ok&&result.message).toContain('has changed');
  });
 }
 it('a consistent span (equal to, or wider than, the current span) is accepted',()=>{
  expect(resampleBarsPattern(withSpan({}),{datasets:ds(),chart},{target:'1D'}).ok).toBe(true);
  const m=chosen(),wide={choiceSpanStart:m.source.spanStart-86400,choiceSpanEnd:m.source.spanEnd+86400};
  // A wider span covers other rows, so the stored fingerprint no longer matches: still a plain ask, never a crash.
  expect(()=>resampleBarsPattern(withSpan(wide),{datasets:ds(),chart},{target:'1D'})).not.toThrow();
 });
});

describe('round 11: when the saved choice is the reason a cut cannot be trimmed, the message says so',()=>{
 it('B saved, span narrowed mid-day, 1m loaded, switch to 1D: the chosen source is blamed, Use available range stays, 1m is offered',()=>{
  const m1=dataset('lk-1m','1m',Array.from({length:30*1440},(_,i)=>({...dailyBars(0,1)[0],time:day(0)+i*60})));
  const all=[daily(),dailyB(),m1],start=(()=>{const placed=placementMember(dailyBars(2,9).map(({volume:_v,...bar})=>bar),100);if(!placed.ok)throw Error('p');return bindBarsPatternMember(placed.member,all,chart)!;})();
  const mid=resampleBarsPattern(start,{datasets:all,chart,asOf:day(5)+12*3600},{target:'1m',sourceKey:intervalDatasetKey(m1),range:'available'});
  expect(mid.ok).toBe(true);if(!mid.ok)return;
  expect(mid.member.source.spanEnd).toBe(day(5)+12*3600);
  const saved={...mid.member,source:{...mid.member.source,sourceKey:intervalDatasetKey(dailyB()),choiceRevision:null,choiceFingerprint:null,choiceSpanStart:null,choiceSpanEnd:null}} as unknown as BarsPatternMember;
  const result=resampleBarsPattern(saved,{datasets:all,chart},{target:'1D'});
  expect(result).toMatchObject({ok:false,code:'PARTIAL'});if(result.ok)return;
  expect(result.message).toContain('The chosen source cannot build this timeframe for the full range:');
  expect(result.message).not.toContain('no finer data is loaded');
  expect(result.available).toBeDefined();
  expect(result.candidates?.map(c=>c.key)).toEqual([intervalDatasetKey(m1)]);
 });
});
