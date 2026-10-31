import {expect,it} from 'vitest';
import {calculateSeasonality,type SeasonalityInput} from '../../src/domain/indicators-ext/seasonality';
import {parseSeasonalityExclusions} from '../../src/domain/indicators-ext/seasonality-types';
import {januaryFixture,month,stamp} from '../fixtures/seasonality-pure';
function ready(input:SeasonalityInput){const result=calculateSeasonality(input);expect(result.status).toBe('ready');if(result.status!=='ready')throw Error(result.diagnostic);return result.scene;}
const january=(scene:ReturnType<typeof ready>,key:string)=>scene.projections.find(row=>row.month===key)!;

it('literal2021/22 returns freeze January2022 at110 and January2023 at230 before the developing30percent return',()=>{
 const scene=ready(januaryFixture()),first=january(scene,'2022-01'),next=january(scene,'2023-01');
 expect(first.price).toBeCloseTo(110,12);expect(first.statistics).toMatchObject({count:1,mean:expect.closeTo(10,12),deviation:0,positiveFrequency:100});
 expect(next.price).toBeCloseTo(230,12);expect(next.statistics).toMatchObject({count:2,mean:expect.closeTo(15,12),deviation:expect.closeTo(5,12),positiveFrequency:100});
 expect(next.geometry).toEqual({left:stamp('2023-01-01'),right:stamp('2023-02-01'),baseline:200,price:expect.closeTo(230,12)});
 expect(scene.series[0]).toEqual([expect.closeTo(110,12),expect.closeTo(230,12),expect.closeTo(230,12)]);
 expect(scene.series[1]).toEqual([expect.closeTo(10,12),expect.closeTo(15,12),expect.closeTo(15,12)]);expect(scene.series[3]).toEqual([1,2,2]);
 expect(scene.years[2].cells[0]).toMatchObject({state:'developing',value:expect.closeTo(30,12)});
 expect(scene.summaries[0]).toMatchObject({count:3,mean:expect.closeTo(20,12),deviation:expect.closeTo(Math.sqrt(200/3),12),positiveFrequency:100,developingCount:1});
 expect(january(scene,'2021-01').state).toBe('no-history');
});
it('latest-table developing participation is explicit and never changes an opening snapshot',()=>{
 const input=januaryFixture();input.settings.includeDevelopingInSummaries=false;const scene=ready(input);
 expect(scene.summaries[0]).toMatchObject({count:2,mean:expect.closeTo(15,12),deviation:expect.closeTo(5,12),developingCount:0});expect(january(scene,'2023-01').price).toBeCloseTo(230,12);expect(scene.years[2].cells[0].state).toBe('developing');
 input.settings.includeDevelopingInSummaries=true;input.asOf=stamp('2023-02-20');input.asOfMonth='2023-02';const unfinished=ready(input);expect(unfinished.years[2].cells[0].state).toBe('unavailable');expect(unfinished.summaries[0].developingCount).toBe(0);
});
it('February negative10 and zero produce meannegative5, deviation5 and projected247 from260',()=>{
 const input=januaryFixture();input.asOf=stamp('2023-02-20');input.asOfMonth='2023-02';input.months=[...input.months.slice(0,-1),month('2023-01',260),month('2023-02',247,'developing')];input.samples=[...input.samples,{time:stamp('2023-02-01'),month:'2023-02'}];const scene=ready(input),projection=january(scene,'2023-02');
 expect(projection.statistics).toMatchObject({count:2,mean:expect.closeTo(-5,12),deviation:expect.closeTo(5,12),positiveFrequency:0});expect(projection.price).toBeCloseTo(247,12);expect(projection.geometry).toMatchObject({baseline:260,price:expect.closeTo(247,12)});
});
it('ignored month masks its return and projection but its actual close remains the next baseline',()=>{
 const input=januaryFixture();input.settings.excludedMonths='2022-01, 2022-01';const scene=ready(input);
 expect(scene.exclusions).toEqual(['2022-01']);expect(january(scene,'2022-01').state).toBe('excluded');expect(scene.series[0][0]).toBeNull();expect(scene.series[3][0]).toBeNull();
 expect(january(scene,'2023-01').price).toBeCloseTo(220,12);expect(january(scene,'2023-01').statistics.count).toBe(1);expect(scene.years[1].cells[1]).toMatchObject({state:'closed',value:0});
});
it('a missing February endpoint makes March unavailable instead of manufacturing a January-to-March return',()=>{
 const input=januaryFixture();input.months=input.months.filter(row=>row.month!=='2021-02');input.months=[...input.months,month('2023-03',300,'developing')];input.asOf=stamp('2023-03-20');input.asOfMonth='2023-03';const scene=ready(input);
 expect(scene.years[0].cells[2]).toMatchObject({state:'absent',value:null});expect(scene.years[2].cells[2]).toMatchObject({state:'unavailable',value:null});expect(scene.summaries[2].count).toBe(0);
});
it('late availability withholds the older return until it was actually known at an opening',()=>{
 const input=januaryFixture();input.months.find(row=>row.month==='2021-01')!.availableAt=stamp('2022-02-01');const scene=ready(input);
 expect(january(scene,'2022-01').state).toBe('no-history');expect(january(scene,'2022-01').price).toBeNull();expect(january(scene,'2023-01').statistics.count).toBe(2);expect(january(scene,'2023-01').price).toBeCloseTo(230,12);
});
it('a genuine zero mean is a flat positive-price projection, and zero observations are not positive returns',()=>{
 const input=januaryFixture();input.months.find(row=>row.month==='2022-01')!.close=90;const scene=ready(input),projection=january(scene,'2023-01');
 expect(projection.statistics.mean).toBeCloseTo(0,12);expect(projection.statistics.positiveFrequency).toBe(50);expect(projection.price).toBeCloseTo(200,12);expect(projection.geometry).not.toBeNull();
 const zero=januaryFixture();zero.months.find(row=>row.month==='2021-01')!.close=100;expect(january(ready(zero),'2022-01').statistics).toMatchObject({count:1,mean:0,deviation:0,positiveFrequency:0});
});
it('future years cannot rewrite earlier opening values even when the later accepted prefix is loaded',()=>{
 const input=januaryFixture(),before=ready(input),expanded=januaryFixture();expanded.asOf=stamp('2025-02-20');expanded.asOfMonth='2025-02';expanded.settings.endYear=2025;
 expanded.months=[...expanded.months.slice(0,-1),month('2023-01',260),month('2023-12',400),month('2024-01',800),month('2024-12',1000),month('2025-01',1)];
 const after=ready(expanded);expect(january(after,'2022-01')).toEqual(january(before,'2022-01'));expect(january(after,'2023-01')).toEqual(january(before,'2023-01'));expect(after.series).toEqual(before.series);
});
it('source descriptions never grant data authority and corrections create new immutable results',()=>{
 const input=januaryFixture(),scene=ready(input);input.sourceKeyDescription='SYNTHETIC arbitrary text is not an ownership token.';expect(ready(input).series).toEqual(scene.series);
 input.months.find(row=>row.month==='2021-01')!.close=130;const corrected=ready(input);expect(january(corrected,'2023-01').price).toBeCloseTo(250,12);expect(january(scene,'2023-01').price).toBeCloseTo(230,12);expect(Object.isFrozen(scene.series[0])).toBe(true);expect(Object.isFrozen(scene.projections[0].statistics)).toBe(true);
});
it('nonpositive baselines are unavailable and sparse or unknown coverage stays inspectable',()=>{
 const input=januaryFixture();input.months.find(row=>row.month==='2021-01')!.coverage='sparse';input.months.find(row=>row.month==='2022-01')!.coverage='unknown';const scene=ready(input);expect(january(scene,'2023-01').statistics).toMatchObject({sparseCount:1,unknownCoverageCount:1});
 input.months.find(row=>row.month==='2022-12')!.close=0;const unavailable=ready(input);expect(january(unavailable,'2023-01').state).toBe('missing-baseline');expect(unavailable.series[0][1]).toBeNull();expect(unavailable.series[1][1]).toBeCloseTo(15,12);
});
it('strict exclusions reject invalid drafts atomically while deduplicating valid whole tokens',()=>{
 expect(parseSeasonalityExclusions('2023-02,2021-01 2023-02')).toEqual(['2021-01','2023-02']);
 for(const value of ['2021-1','0000-01','2021-13','2021-01 junk','2021-01;2022-01','x'.repeat(201)])expect(()=>parseSeasonalityExclusions(value)).toThrow();
 const input=januaryFixture(),before=ready(input);input.settings.excludedMonths='2022-01 garbage';expect(calculateSeasonality(input)).toMatchObject({status:'unavailable',scene:null});expect(january(before,'2023-01').price).toBeCloseTo(230,12);
});
it('accessor, hole, duplicate and calendar-label mismatches refuse without conversion or getter calls',()=>{
 let reads=0;const input=januaryFixture();Object.defineProperty(input.months[0],'close',{enumerable:true,get(){reads++;return 100;}});expect(calculateSeasonality(input).status).toBe('unavailable');expect(reads).toBe(0);
 const duplicate=januaryFixture();duplicate.months=[duplicate.months[0],duplicate.months[0]];expect(calculateSeasonality(duplicate).status).toBe('unavailable');
 const holes=januaryFixture();holes.samples=Array(2);expect(calculateSeasonality(holes).status).toBe('unavailable');
 const mislabeled=januaryFixture();mislabeled.samples=[{time:stamp('2021-01-01'),month:'2023-01'}];expect(calculateSeasonality(mislabeled).status).toBe('unavailable');
});
it('observed first-bar facts cannot lie after cutoff or after known monthly price availability',()=>{
 for(const at of ['2023-01-29','2023-01-19']){const input=januaryFixture();input.months.find(row=>row.month==='2023-01')!.firstTime=stamp(at);expect(calculateSeasonality(input)).toMatchObject({status:'unavailable',scene:null});}
 const ordinary=ready(januaryFixture()),current=january(ordinary,'2023-01');expect(current.geometry).toMatchObject({left:stamp('2023-01-01'),right:stamp('2023-02-01'),price:expect.closeTo(230,12)});expect(current.geometry!.right).toBeGreaterThan(ordinary.asOf);
});
it('observed future samples are refused while a declared future projection boundary stays eligible',()=>{
 const input=januaryFixture();input.samples=[...input.samples,{time:stamp('2023-01-29'),month:'2023-01'}];expect(calculateSeasonality(input)).toMatchObject({status:'unavailable',scene:null});
});
