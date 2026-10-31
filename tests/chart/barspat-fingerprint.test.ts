import {describe,expect,it} from 'vitest';
import {readBarsPattern,type BarsPatternMember} from '../../src/chart/lv-types/bars-pattern-data';
import {bindBarsPatternMember,placementMember,resampleBarsPattern} from '../../src/chart/lv-types/bars-pattern-source';
import {intervalDatasetKey} from '../../src/domain/intervals';
import type {BarDataset} from '../../src/domain/types';
import {daily,dailyBars,dataset} from '../helpers/barspat-fixture';

// Content identity. Local imports always carry revision '1' (src/domain/data.ts:106), so a re-import of different content
// under the same key keeps the same revision: the saved choice also stores a content fingerprint (bar count, first
// and last time, sampled closes). SYNTHETIC datasets only.
const chart={datasetId:'syn-1d',resolution:'1D'};
const dailyB=(shift=0)=>dataset('syn-1d-b','1D',dailyBars(0,30).map(b=>({...b,open:b.open+shift,high:b.high+shift,low:b.low+shift,close:b.close+shift})));
function bound(datasets:BarDataset[]):BarsPatternMember{
 const placed=placementMember(dailyBars(2,9).map(({volume:_v,...bar})=>bar),100);if(!placed.ok)throw Error(placed.message);
 return bindBarsPatternMember(placed.member,datasets,chart)!;
}
const must=(result:ReturnType<typeof resampleBarsPattern>)=>{if(!result.ok)throw Error(result.code+': '+result.message);return result.member;};
const chosen=()=>must(resampleBarsPattern(bound([daily(),dailyB()]),{datasets:[daily(),dailyB()],chart},{target:'1W',sourceKey:intervalDatasetKey(dailyB())}));
const props=(member:BarsPatternMember)=>({lvBarsPattern:member});

describe('saved source content fingerprint',()=>{
 it('is stored with the choice and survives a save and reload',()=>{
  const member=chosen(),fp=member.source.sourceFingerprint;
  expect(typeof fp).toBe('string');
  const reloaded=readBarsPattern(JSON.parse(JSON.stringify(props(member))));
  expect(reloaded.state==='supported'&&reloaded.member.source.sourceFingerprint).toBe(fp);
 });
 it('same key, same revision, different content: the choice has changed and the user is asked again',()=>{
  const reimported=[daily(),dailyB(50)];
  expect(reimported[1].provenance.revision).toBe(dailyB().provenance.revision);
  const asked=resampleBarsPattern(chosen(),{datasets:reimported,chart},{target:'1D'});
  expect(asked).toMatchObject({ok:false,code:'AMBIGUOUS'});expect(!asked.ok&&asked.message).toContain('The source you chose earlier has changed.');
 });
 it('identical content is reused with no question',()=>{
  expect(resampleBarsPattern(chosen(),{datasets:[daily(),dailyB()],chart},{target:'1D'}).ok).toBe(true);
 });
 it('an old saved pattern without the field still loads and re-samples as before',()=>{
  const member=chosen(),{sourceFingerprint:_f,...oldSource}=member.source as unknown as Record<string,unknown>;
  const old={...member,source:oldSource};
  const read=readBarsPattern(props(old as unknown as BarsPatternMember));
  expect(read.state).toBe('supported');
  expect(resampleBarsPattern(old as unknown as BarsPatternMember,{datasets:[daily(),dailyB()],chart},{target:'1D'}).ok).toBe(true);
 });
 it('a malformed fingerprint makes the data unavailable',()=>{
  const member=chosen();
  expect(readBarsPattern(props({...member,source:{...member.source,sourceFingerprint:42}} as unknown as BarsPatternMember)).state).toBe('unavailable');
  expect(readBarsPattern(props({...member,source:{...member.source,sourceFingerprint:''}} as unknown as BarsPatternMember)).state).toBe('unavailable');
 });
});
