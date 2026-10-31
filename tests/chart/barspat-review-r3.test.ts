import {describe,expect,it} from 'vitest';
import {columnsToBars,readBarsPattern,type BarsPatternMember} from '../../src/chart/lv-types/bars-pattern-data';
import {bindBarsPatternMember,describeBarsPattern,placementMember,resampleBarsPattern} from '../../src/chart/lv-types/bars-pattern-source';
import {intervalDatasetKey} from '../../src/domain/intervals';
import type {Bar} from '../../src/domain/types';
import {daily,dailyBars,dataset,day,minuteBars} from '../helpers/barspat-fixture';

// Re-review BSR-1 (finer/equal path builds from in-span data only), BSR-2 (leading bucket trimmed, not dropped), BSR-3 (covered
// range from the input data, trimmed recorded). SYNTHETIC datasets only.
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
const bars=(member:BarsPatternMember)=>{const read=readBarsPattern({lvBarsPattern:member});if(read.state!=='supported')throw Error('unreadable');return columnsToBars(read.columns);};
const span=(member:BarsPatternMember)=>[member.source.spanStart,member.source.spanEnd];

describe('BSR-1: the finer-or-equal path never reads rows after the span end',()=>{
 it('an exact dataset whose last bar straddles the span end is refused with Use available range, not returned whole',()=>{
  // Pattern on 1W (Mon..Sun x 2, span day 0..14) to an exact 3D dataset: the bar opening day 12 runs to day 15.
  const wk=weekly(),placed=placementMember(wk.bars.slice(0,2).map(({volume:_v,...bar})=>bar),100);if(!placed.ok)throw Error('placement');
  const member=bindBarsPatternMember(placed.member,[wk],{datasetId:'wk-a',resolution:'1W'})!;
  expect(span(member)).toEqual([day(0),day(14)]);
  const threeDay=dataset('syn-3d','3D',Array.from({length:10},(_,i)=>({...dailyBars(0,1)[0],time:day(i*3)})));
  const result=resampleBarsPattern(member,{datasets:[wk,threeDay],chart:{datasetId:'wk-a',resolution:'1W'}},{target:'3D'});
  expect(result).toMatchObject({ok:false,code:'PARTIAL',covered:{start:day(0),end:day(12)}});
  expect(!result.ok&&result.message).toContain('cannot be trimmed');
  const narrowed=resampleBarsPattern(member,{datasets:[wk,threeDay],chart:{datasetId:'wk-a',resolution:'1W'}},{target:'3D',range:'available'});
  expect(narrowed.ok&&span(narrowed.member)).toEqual([day(0),day(12)]);expect(narrowed.ok&&narrowed.summary.count).toBe(4);
 });
 it('with finer data loaded the straddling bar is rebuilt from in-span rows and trimmed',()=>{
  const wk=weekly(),placed=placementMember(wk.bars.slice(0,2).map(({volume:_v,...bar})=>bar),100);if(!placed.ok)throw Error('placement');
  const member=bindBarsPatternMember(placed.member,[wk],{datasetId:'wk-a',resolution:'1W'})!;
  const threeDay=dataset('syn-3d','3D',Array.from({length:10},(_,i)=>({...dailyBars(0,1)[0],time:day(i*3)})));
  const result=resampleBarsPattern(member,{datasets:[wk,threeDay,daily()],chart:{datasetId:'wk-a',resolution:'1W'}},{target:'3D'});
  expect(result.ok).toBe(true);if(!result.ok)return;
  const last=bars(result.member).at(-1)!;
  expect(last.close).toBe(dailyBars(13,14)[0].close);expect(result.member.source).toMatchObject({trimmed:true,derived:true});
 });
 it('an explicitly chosen source is aggregated over the span only',()=>{
  const wk=weekly(),placed=placementMember(wk.bars.slice(0,2).map(({volume:_v,...bar})=>bar),100);if(!placed.ok)throw Error('placement');
  const member=bindBarsPatternMember(placed.member,[wk],{datasetId:'wk-a',resolution:'1W'})!;
  const d=daily();
  const result=resampleBarsPattern(member,{datasets:[wk,d],chart:{datasetId:'wk-a',resolution:'1W'}},{target:'3D',sourceKey:intervalDatasetKey(d)});
  expect(result.ok).toBe(true);if(!result.ok)return;
  const got=bars(result.member);
  expect(got.at(-1)!.close).toBe(dailyBars(13,14)[0].close);expect(got.at(-1)!.high).toBeLessThan(Math.max(...dailyBars(12,15).map(b=>b.high))+1e-9);
  expect(got.at(-1)!.time).toBeLessThan(day(14));
 });
});

describe('BSR-2: a leading bucket that opens before the span is built from in-span bars and flagged trimmed',()=>{
 it('Wed..Tue daily to 1W gives two trimmed weekly bars',()=>{
  const result=resampleBarsPattern(bound(2,9),{datasets:[daily()],chart},{target:'1W'});
  expect(result.ok).toBe(true);if(!result.ok)return;
  const got=bars(result.member),first=dailyBars(2,7),second=dailyBars(7,9);
  expect(got).toHaveLength(2);
  expect(got[0]).toMatchObject({time:day(2),open:first[0].open,close:first[4].close,high:Math.max(...first.map(b=>b.high)),low:Math.min(...first.map(b=>b.low))});
  expect(got[1]).toMatchObject({time:day(7),open:second[0].open,close:second[1].close,high:Math.max(...second.map(b=>b.high))});
  expect(result.member.source).toMatchObject({trimmed:true,derived:true,resolution:'1W'});expect(span(result.member)).toEqual([day(2),day(9)]);
  expect(result.summary).toMatchObject({count:2,trimmed:true,trimmedFirst:true});
  expect(describeBarsPattern(result.member,result.summary)).toContain('edge bars trimmed to the original span');
 });
 it('a mid-month pattern to 1M is one trimmed bar, not refused as empty',()=>{
  const result=resampleBarsPattern(bound(5,17),{datasets:[daily()],chart},{target:'1M'});
  expect(result.ok).toBe(true);if(!result.ok)return;
  const days=dailyBars(5,17),got=bars(result.member);
  expect(got).toHaveLength(1);expect(got[0]).toMatchObject({open:days[0].open,close:days.at(-1)!.close});expect(result.member.source.trimmed).toBe(true);
 });
 it('exact coarse data only: a leading straddling bar is refused with Use available range from the first whole bucket', ()=>{
  // Wed day 2 to the Tuesday after next (day 15), exact weekly only.
  const refused=resampleBarsPattern(bound(2,16),{datasets:[weekly()],chart},{target:'1W'});
  expect(refused).toMatchObject({ok:false,code:'PARTIAL',covered:{start:day(7),end:day(14)}});
  expect(!refused.ok&&refused.message).toContain('first and last');
  const narrowed=resampleBarsPattern(bound(2,16),{datasets:[weekly()],chart},{target:'1W',range:'available'});
  expect(narrowed.ok&&span(narrowed.member)).toEqual([day(7),day(14)]);expect(narrowed.ok&&narrowed.summary.count).toBe(1);expect(narrowed.ok&&narrowed.member.source.trimmed).toBe(false);
  // A mid-month pattern with only a monthly dataset is a visible partial, never an empty result.
  const monthly=dataset('syn-1mo','1M',[{...dailyBars(0,1)[0],time:Date.UTC(2026,2,1)/1000},{...dailyBars(0,1)[0],time:Date.UTC(2026,3,1)/1000}]);
  expect(resampleBarsPattern(bound(5,17),{datasets:[monthly],chart},{target:'1M'})).toMatchObject({ok:false,code:'PARTIAL'});
 });
});

describe('BSR-3: Use available range takes the covered range from the actual input data',()=>{
 it('coarser target over partial finer data reports input coverage and records trimmed',()=>{
  const partial=dataset('m-part','1m',minuteBars(2,10)),member=bound(2,16);
  const refused=resampleBarsPattern(member,{datasets:[partial],chart},{target:'1W'});
  expect(refused).toMatchObject({ok:false,code:'PARTIAL',covered:{start:day(2),end:day(10)},message:'1 week data covers 2026-03-04 to 2026-03-11 of 2026-03-04 to 2026-03-17. The current pattern is kept.'});
  const narrowed=resampleBarsPattern(member,{datasets:[partial],chart},{target:'1W',range:'available'});
  expect(narrowed.ok).toBe(true);if(!narrowed.ok)return;
  expect(span(narrowed.member)).toEqual([day(2),day(10)]);expect(narrowed.summary).toMatchObject({narrowed:true,count:2,trimmed:true});
  expect(narrowed.member.source.trimmed).toBe(true);
  expect(bars(narrowed.member).at(-1)!.close).toBe(minuteBars(9,10).at(-1)!.close);
 });
 it('trimmed stays false when the narrowed range ends on a bucket edge', ()=>{
  const partial=dataset('m-wk','1m',minuteBars(0,7)),member=bound(0,14);
  const narrowed=resampleBarsPattern(member,{datasets:[partial],chart},{target:'1W',range:'available'});
  expect(narrowed.ok&&span(narrowed.member)).toEqual([day(0),day(7)]);expect(narrowed.ok&&narrowed.member.source.trimmed).toBe(false);
 });
});

describe('width and anchors are span-defined: switching timeframes never changes the stored span, only the bars',()=>{
 it('1D -> 1m -> 1W -> 1D -> 2D keeps the span on every step',()=>{
  const ds=[daily(),dataset('m-all','1m',minuteBars(0,30))];let member=bound(2,9);const start=span(member);
  for(const target of ['1W','1D','2D','300m','1W','1D']){
   const result=resampleBarsPattern(member,{datasets:ds,chart},{target});
   expect(result.ok,target).toBe(true);if(!result.ok)return;
   expect(span(result.member)).toEqual(start);member=result.member;
  }
 });
});
