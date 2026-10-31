import {describe,expect,it} from 'vitest';
import {columnsToBars,makeBarsPatternMember,readBarsPattern,type BarsPatternMember} from '../../src/chart/lv-types/bars-pattern-data';
import {barsPatternResolutionChoices,bindBarsPatternMember,describeBarsPattern,periodEnd,placementMember,resampleBarsPattern} from '../../src/chart/lv-types/bars-pattern-source';
import {intervalDatasetKey} from '../../src/domain/intervals';
import {DAY,D0,INSTRUMENT,daily,dailyBars,dataset,day,minuteBars,oneMinute,secondBars} from '../helpers/barspat-fixture';

// Original source-resolution re-sample (deliberate divergence LV..BARS_PATTERN.SOURCE_RESOLUTION; user request
// decisions 2026-10-16). SYNTHETIC datasets only (tests/helpers/barspat-fixture.ts).
const chart={datasetId:'syn-1d',resolution:'1D'};
function placed(from:number,to:number):BarsPatternMember{
 const result=placementMember(dailyBars(from,to).map(({volume:_v,...bar})=>bar),dailyBars(from,from+1)[0].close);
 if(!result.ok)throw Error(result.message);return result.member;
}
const bars=(member:BarsPatternMember)=>{const read=readBarsPattern({lvBarsPattern:member});if(read.state!=='supported')throw Error('unreadable');return columnsToBars(read.columns);};

describe('Bars pattern source span and binding',()=>{
 it('spanEnd is the last open plus the source duration, UTC calendar for D/W/M',()=>{
  expect(periodEnd(day(9),'1D')).toBe(day(10));
  expect(periodEnd(day(7),'1W')).toBe(day(14));
  expect(periodEnd(Date.UTC(2026,0,1)/1000,'1M')).toBe(Date.UTC(2026,1,1)/1000);
  expect(periodEnd(Date.UTC(2026,1,1)/1000,'1M')).toBe(Date.UTC(2026,2,1)/1000);
  expect(periodEnd(day(1),'1m')).toBe(day(1)+60);
 });
 it('binds an unbound placement to the one dataset holding exactly those bars (chart dataset wins)',()=>{
  const member=placed(5,10);expect(member.source.instrumentId).toBeNull();
  const bound=bindBarsPatternMember(member,[daily(),oneMinute()],chart)!;
  expect(bound.source).toMatchObject({instrumentId:INSTRUMENT,symbol:'BARSPAT',fixture:true,resolution:'1D',placedResolution:'1D',spanStart:day(5),spanEnd:day(10),datasetKey:intervalDatasetKey(daily()),derived:false});
  expect(bars(bound)).toEqual(bars(member));
  // A transformed chart (bars that match no supplied data) stays unbound.
  expect(bindBarsPatternMember(member,[dataset('other','1D',dailyBars(0,30).map(bar=>({...bar,close:bar.close+0.01,high:bar.high+0.01})))],chart)).toBeNull();
 });
});

describe('Bars pattern re-sample (same span, finer or coarser, cap 50,000)',()=>{
 const context={datasets:[daily(),oneMinute()],chart};
 it('1D to 1m picks exactly the bars in [spanStart, spanEnd) and keeps the stored reference price',()=>{
  const member=placed(5,10),result=resampleBarsPattern(member,context,{target:'1m'});
  expect(result.ok).toBe(true);if(!result.ok)return;
  const got=bars(result.member);
  expect(got).toHaveLength(5*1440);expect(got[0].time).toBe(day(5));expect(got[got.length-1].time).toBe(day(10)-60);
  expect(got).toEqual(minuteBars(5,10).map(({volume:_v,...bar})=>bar));
  expect(result.member.source).toMatchObject({resolution:'1m',placedResolution:'1D',spanStart:day(5),spanEnd:day(10),refPrice:member.source.refPrice,derived:false,trimmed:false});
  expect(describeBarsPattern(result.member,result.summary)).toBe('Source: BARSPAT · SYNTHETIC · 1 minute · 7,200 bars · 2026-03-07 to 2026-03-11 (UTC)');
  // Back to 1D: the exact supplied daily bars (last bar ends on the span end, nothing to trim).
  const back=resampleBarsPattern(result.member,context,{target:'1D'});
  expect(back.ok&&bars(back.member)).toEqual(dailyBars(5,10).map(({volume:_v,...bar})=>bar));
  expect(back.ok&&back.member.source.derived).toBe(false);
 });
 it('a coarser target trims its last bar to the original span (built only from in-span source bars)',()=>{
  const member=bindBarsPatternMember(placed(7,10),[daily()],chart)!; // Monday to Wednesday
  const result=resampleBarsPattern(member,{datasets:[daily()],chart},{target:'1W'});
  expect(result.ok).toBe(true);if(!result.ok)return;
  const [week]=bars(result.member),days=dailyBars(7,10),fullWeek=dailyBars(7,14);
  expect(bars(result.member)).toHaveLength(1);expect(week.time).toBe(day(7));
  expect(week.high).toBe(Math.max(...days.map(bar=>bar.high)));expect(week.close).toBe(days[2].close);
  expect(week.close).not.toBe(fullWeek[6].close);
  expect(result.member.source).toMatchObject({trimmed:true,derived:true,resolution:'1W'});
  expect(describeBarsPattern(result.member,result.summary)).toContain('last bar trimmed to the original span');
 });
 it('a target built from a finer original is marked derived',()=>{
  const result=resampleBarsPattern(placed(5,10),context,{target:'5m'});
  expect(result.ok&&result.summary.count).toBe(5*288);expect(result.ok&&result.member.source.derived).toBe(true);
 });
 it('refuses with coded results and keeps nothing: no source, zero bars, partial, over cap, ambiguous, fixture mismatch',()=>{
  const none=resampleBarsPattern(placed(5,10),context,{target:'1s'});
  expect(none).toMatchObject({ok:false,code:'NO_SOURCE'});expect(!none.ok&&none.message).toContain('The current pattern is kept.');
  expect(resampleBarsPattern(placed(20,23),context,{target:'1m'})).toMatchObject({ok:false,code:'EMPTY',message:expect.stringContaining('No 1 minute bars inside')});
  const partial=resampleBarsPattern(placed(3,10),context,{target:'1m'});
  expect(partial).toMatchObject({ok:false,code:'PARTIAL',covered:{start:day(5),end:day(10)},message:'1 minute data covers 2026-03-07 to 2026-03-11 of 2026-03-05 to 2026-03-11. The current pattern is kept.'});
  expect(!partial.ok&&partial.available?.member.source).toMatchObject({spanStart:day(5),spanEnd:day(10)});
  const narrowed=resampleBarsPattern(placed(3,10),context,{target:'1m',range:'available'});
  expect(narrowed.ok&&narrowed.summary).toMatchObject({count:7200,narrowed:true,spanStart:day(5),spanEnd:day(10)});
  const cap=resampleBarsPattern(placed(5,6),{datasets:[daily(),dataset('syn-1s','1s',secondBars(5))],chart},{target:'1s'});
  expect(cap).toMatchObject({ok:false,code:'OVER_CAP',needs:DAY,limit:50_000,message:'Needs 86,400 bars at 1 second; the limit is 50,000. Choose 5 seconds or coarser. The current pattern is kept.'});
  const twice=resampleBarsPattern(placed(5,10),{datasets:[daily(),oneMinute(),dataset('syn-1m-b','1m',minuteBars(5,15))],chart},{target:'1m'});
  expect(twice).toMatchObject({ok:false,code:'AMBIGUOUS'});expect(!twice.ok&&twice.candidates!.length).toBeGreaterThanOrEqual(2);
  const chosen=resampleBarsPattern(placed(5,10),{datasets:[daily(),oneMinute(),dataset('syn-1m-b','1m',minuteBars(5,15))],chart},{target:'1m',sourceKey:intervalDatasetKey(oneMinute())});
  expect(chosen.ok&&chosen.member.source.sourceKey).toBe(intervalDatasetKey(oneMinute()));
  // A LOCAL import of the same instrument never feeds a SYNTHETIC pattern.
  expect(resampleBarsPattern(placed(5,10),{datasets:[daily(),dataset('local-1m','1m',minuteBars(5,15),{fixture:false})],chart},{target:'1m'})).toMatchObject({ok:false,code:'NO_SOURCE'});
  expect(resampleBarsPattern(placed(5,10),{datasets:[],chart},{target:'1m'})).toMatchObject({ok:false,code:'UNBOUND'});
 });
 it('lists every standard time resolution, disabled with a reason when no exact or finer data is loaded',()=>{
  const choices=barsPatternResolutionChoices(placed(5,10),context);
  expect(choices.find(choice=>choice.value==='1m')).toMatchObject({available:true,label:'1 minute'});
  expect(choices.find(choice=>choice.value==='1D')).toMatchObject({available:true});
  expect(choices.find(choice=>choice.value==='1s')).toMatchObject({available:false,reason:expect.stringContaining('No 1 second or finer data')});
  expect(choices.some(choice=>/T|R/.test(choice.value.slice(-1)))).toBe(false);
  expect(D0).toBe(Date.UTC(2026,2,2)/1000);
  expect(makeBarsPatternMember).toBeTypeOf('function');
 });
});
