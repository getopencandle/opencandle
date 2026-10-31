import {describe,expect,it} from 'vitest';
import {columnsToBars,readBarsPattern,type BarsPatternMember} from '../../src/chart/lv-types/bars-pattern-data';
import {bindBarsPatternMember,placementMember,resampleBarsPattern} from '../../src/chart/lv-types/bars-pattern-source';
import {intervalDatasetKey} from '../../src/domain/intervals';
import type {Bar} from '../../src/domain/types';
import {daily,dailyBars,dataset,day,minuteBars} from '../helpers/barspat-fixture';

// Review dw-batch1 BARSPAT-R1 (coarser re-sample must never leak bars after the span end; decision A3: trim the last bar to the
// original span, or refuse visibly with Use available range when it cannot be trimmed honestly) and BARSPAT-R2 (partial-coverage
// rule). SYNTHETIC datasets only.
const chart={datasetId:'syn-1d',resolution:'1D'};
function bound(from:number,to:number):BarsPatternMember{
 const placed=placementMember(dailyBars(from,to).map(({volume:_v,...bar})=>bar),100);if(!placed.ok)throw Error(placed.message);
 return bindBarsPatternMember(placed.member,[daily()],chart)!;
}
/** Weekly bars (Monday opens) aggregated from the SYNTHETIC daily bars: the exact coarse source of the repro. */
function weekly(id:string){
 const days=dailyBars(0,28),out:Bar[]=[];
 for(let w=0;w<4;w++){const rows=days.slice(w*7,w*7+7);out.push({time:day(w*7),open:rows[0].open,high:Math.max(...rows.map(r=>r.high)),low:Math.min(...rows.map(r=>r.low)),close:rows[6].close,volume:1});}
 return dataset(id,'1W',out);
}
const bars=(member:BarsPatternMember)=>{const read=readBarsPattern({lvBarsPattern:member});if(read.state!=='supported')throw Error('unreadable');return columnsToBars(read.columns);};
const inSpanClose=dailyBars(9,10)[0].close,sundayClose=dailyBars(13,14)[0].close;

describe('BARSPAT-R1: a coarser re-sample never leaks data after the span end',()=>{
 it('two weekly sources plus finer daily data, Mon-Wed pattern: the trimmed in-span bar, no source question',()=>{
  const result=resampleBarsPattern(bound(7,10),{datasets:[daily(),weekly('wk-a'),weekly('wk-b')],chart},{target:'1W'});
  expect(result.ok).toBe(true);if(!result.ok)return;
  const [week]=bars(result.member);
  expect(bars(result.member)).toHaveLength(1);expect(week.close).toBe(inSpanClose);expect(week.close).not.toBe(sundayClose);
  expect(result.member.source).toMatchObject({trimmed:true,derived:true});
 });
 it('an explicitly chosen weekly source cannot be trimmed: refused visibly, nothing leaks',()=>{
  const datasets=[daily(),weekly('wk-a'),weekly('wk-b')];
  const result=resampleBarsPattern(bound(7,10),{datasets,chart},{target:'1W',sourceKey:intervalDatasetKey(datasets[1])});
  expect(result.ok).toBe(false);if(result.ok)return;
  expect(result.code).toBe('PARTIAL');expect(result.message).toContain('cannot be trimmed');expect(result.available).toBeUndefined();
 });
 it('no finer data loaded: a straddling weekly bar is refused, Use available range keeps only whole in-span weeks',()=>{
  const short=resampleBarsPattern(bound(7,10),{datasets:[weekly('wk-a')],chart},{target:'1W'});
  expect(short).toMatchObject({ok:false,code:'PARTIAL'});expect(!short.ok&&short.available).toBeUndefined();
  const long=resampleBarsPattern(bound(7,17),{datasets:[weekly('wk-a')],chart},{target:'1W'});
  expect(long).toMatchObject({ok:false,code:'PARTIAL',covered:{start:day(7),end:day(14)}});
  const narrowed=resampleBarsPattern(bound(7,17),{datasets:[weekly('wk-a')],chart},{target:'1W',range:'available'});
  expect(narrowed.ok&&narrowed.summary).toMatchObject({count:1,narrowed:true,spanStart:day(7),spanEnd:day(14)});
  expect(narrowed.ok&&bars(narrowed.member)[0].close).toBe(sundayClose);
 });
});

describe('BARSPAT-R2: partial coverage follows the current pattern bars, not fixed +1/-2 target-bar thresholds',()=>{
 const session=(from:number,to:number)=>dataset('syn-1m-rth','1m',minuteBars(from,to).filter(bar=>{const s=(bar.time%86400);return s>=52200&&s<75600;}));
 it('session-only 1m data (14:30 to 21:00 UTC) fully covers a 1D pattern (spec 3.5 literal thresholds would refuse it)',()=>{
  const result=resampleBarsPattern(bound(5,10),{datasets:[daily(),session(5,10)],chart},{target:'1m'});
  expect(result.ok&&result.summary.count).toBe(5*390);
 });
 it('1m data missing the last pattern day is partial',()=>{
  expect(resampleBarsPattern(bound(5,10),{datasets:[daily(),session(5,9)],chart},{target:'1m'})).toMatchObject({ok:false,code:'PARTIAL',covered:{start:day(5)+52200,end:day(8)+75600}});
 });
});
