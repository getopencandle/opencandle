import {afterEach,expect,it,vi} from 'vitest';
import * as calendar from '../../src/domain/us-market-hours';
import {compileSeasonalityMonths,type SeasonalityCompilerInput,type SeasonalitySourcePoint} from '../../src/domain/indicators-ext/seasonality-months';
import {calculateSeasonality} from '../../src/domain/indicators-ext/seasonality';
import {settings,stamp} from '../fixtures/seasonality-pure';
const instant=(value:string)=>Date.parse(value)/1000;
afterEach(()=>vi.restoreAllMocks());
const point=(date:string,close:number,availableAt:string,finalized=true):SeasonalitySourcePoint=>({time:stamp(date),close,availableAt:instant(availableAt),finalized});
function input():SeasonalityCompilerInput{return{sourceKeyDescription:'SYNTHETIC declared UTC daily closes. No ownership grant.',contract:{calendar:'utc-continuous',session:'continuous',kind:'daily',dateLabels:'utc-date'},settings:settings(),asOf:stamp('2023-01-20'),points:[]};}
function compiled(value:SeasonalityCompilerInput){const result=compileSeasonalityMonths(value);expect(result.status).toBe('ready');if(result.status!=='ready')throw Error(result.diagnostic);return result;}
const frame=(value:ReturnType<typeof compiled>,key:string)=>value.input.months.find(row=>row.month===key)!;

it('literal monthly source endpoints compile independently into frozen230 and latest30percent without intraday history',()=>{
 const value=input();value.contract.kind='monthly';value.points=[
  point('2020-12-01',100,'2021-01-01T00:00:00Z'),point('2021-01-01',110,'2021-02-01T00:00:00Z'),point('2021-12-01',100,'2022-01-01T00:00:00Z'),point('2022-01-01',120,'2022-02-01T00:00:00Z'),point('2022-12-01',200,'2023-01-01T00:00:00Z'),point('2023-01-01',260,'2023-01-15T00:00:00Z',false),
 ];
 const result=compiled(value);expect(frame(result,'2023-01')).toMatchObject({completion:'developing',close:260,coverage:'unknown',expectedSessions:null,observedSessions:1});
 const model=calculateSeasonality(result.input);expect(model.status).toBe('ready');if(model.status!=='ready')throw Error(model.diagnostic);
 expect(model.scene.projections.find(row=>row.month==='2023-01')!.price).toBeCloseTo(230,12);expect(model.scene.years[2].cells[0].value).toBeCloseTo(30,12);expect(model.scene.summaries[0]).toMatchObject({count:3,unknownCoverageCount:3});
 expect(model.scene.years[0].cells[1]).toMatchObject({state:'absent',value:null,observedSessions:0});
 expect(result.usage.calendarCacheSlots).toBe(100002);expect(result.input.settings.externalNumericSlots).toBe(value.points.length*2+100002);expect(model.usage.numericSlots).toBeGreaterThanOrEqual(100002+value.points.length*2);expect(Object.isFrozen(result.input.months)).toBe(true);
});
it('UTC leap-day endpoint remains February2024 and sparse interior coverage is explicit',()=>{
 const value=input();value.settings.startYear=2024;value.settings.endYear=2024;value.asOf=stamp('2024-03-02');value.points=[point('2024-02-01',100,'2024-02-02T00:00:00Z'),point('2024-02-29',120,'2024-03-01T00:00:00Z')];
 expect(frame(compiled(value),'2024-02')).toMatchObject({completion:'closed',close:120,expectedSessions:29,observedSessions:2,coverage:'sparse'});
});
it('UTC-midnight labels naming NY trading dates never migrate to the previous local month',()=>{
 const value=input();value.settings.startYear=2023;value.settings.endYear=2023;value.contract={calendar:'nyse',session:'regular',kind:'daily',dateLabels:'utc-date'};value.asOf=instant('2023-12-01T05:00:00Z');value.points=[
  point('2023-11-01',100,'2023-11-01T20:00:00Z'),point('2023-11-24',110,'2023-11-24T18:00:00Z'),point('2023-11-30',130,'2023-11-30T21:00:00Z'),
 ];const result=compiled(value),november=frame(result,'2023-11');
 expect(november).toMatchObject({openingTime:instant('2023-11-01T04:00:00Z'),nextOpeningTime:instant('2023-12-01T05:00:00Z'),labelOpeningTime:stamp('2023-11-01'),nextLabelOpeningTime:stamp('2023-12-01'),close:130,completion:'closed',expectedSessions:21,observedSessions:3,coverage:'sparse'});
 expect(result.input.samples[0].month).toBe('2023-11');expect(november.firstTime).toBe(stamp('2023-11-01'));
});
it('actual New York midnight date labels preserve the DST change and reject an undeclared UTC-label convention',()=>{
 const value=input();value.settings.startYear=2023;value.settings.endYear=2023;value.contract={calendar:'nyse',session:'regular',kind:'daily',dateLabels:'calendar-midnight'};value.asOf=instant('2023-12-01T05:00:00Z');value.points=[
  {time:instant('2023-11-01T04:00:00Z'),close:100,availableAt:instant('2023-11-01T20:00:00Z'),finalized:true},{time:instant('2023-11-30T05:00:00Z'),close:130,availableAt:instant('2023-11-30T21:00:00Z'),finalized:true},
 ];expect(frame(compiled(value),'2023-11').labelOpeningTime).toBe(instant('2023-11-01T04:00:00Z'));
 value.points=[point('2023-11-01',100,'2023-11-01T20:00:00Z')];expect(compileSeasonalityMonths(value)).toMatchObject({status:'unavailable',input:null});
});
it('missing the actual last NY session cannot substitute an earlier close, while sparse real endpoints can form a return',()=>{
 const value=input();value.settings.startYear=2024;value.settings.endYear=2024;value.contract={calendar:'nyse',session:'regular',kind:'daily',dateLabels:'utc-date'};value.asOf=instant('2024-07-01T04:00:00Z');value.points=[point('2024-05-31',100,'2024-05-31T20:00:00Z'),point('2024-06-27',80,'2024-06-27T20:00:00Z')];
 expect(frame(compiled(value),'2024-06')).toMatchObject({completion:'unavailable',close:null,coverage:'sparse'});
 value.points=[...value.points,point('2024-06-28',90,'2024-06-28T20:00:00Z')];const result=compiled(value);expect(frame(result,'2024-06')).toMatchObject({completion:'closed',close:90,coverage:'sparse',firstTime:null});
 const model=calculateSeasonality(result.input);expect(model.status).toBe('ready');if(model.status==='ready')expect(model.scene.years[0].cells[5]).toMatchObject({state:'closed',value:expect.closeTo(-10,12),coverage:'sparse'});
});
it('session-specific early close and extended close are explicit completion cutoffs',()=>{
 const value=input();value.settings.startYear=2023;value.settings.endYear=2023;value.contract={calendar:'nyse',session:'regular',kind:'daily',dateLabels:'utc-date'};value.asOf=instant('2023-11-24T18:00:00Z');value.points=[point('2023-11-24',100,'2023-11-24T18:00:00Z')];expect(compileSeasonalityMonths(value).status).toBe('ready');
 value.contract.session='extended';expect(compileSeasonalityMonths(value)).toMatchObject({status:'unavailable',input:null});value.points=[point('2023-11-24',100,'2023-11-24T22:00:00Z')];value.asOf=instant('2023-11-24T22:00:00Z');expect(compileSeasonalityMonths(value).status).toBe('ready');
});
it('unknown calendars and out-of-range NYSE years refuse instead of using weekends-only fallback',()=>{
 const value=input();value.contract={calendar:'nyse',session:'regular',kind:'daily',dateLabels:'utc-date'};
 for(const year of [2014,2029]){value.settings.startYear=year;value.settings.endYear=year;expect(compileSeasonalityMonths(value)).toMatchObject({status:'unavailable',input:null,diagnostic:expect.stringMatching(/2015 through 2028/)});}
 value.contract.calendar='unknown' as any;expect(compileSeasonalityMonths(value).status).toBe('unavailable');
});
it('forming or unavailable future observations never finalize the earlier accepted prefix',()=>{
 const value=input();value.contract.kind='monthly';value.points=[point('2022-12-01',200,'2023-01-01T00:00:00Z'),point('2023-01-01',260,'2023-02-01T00:00:00Z')];const first=compiled(value);
 expect(frame(first,'2023-01')).toMatchObject({completion:'unavailable',close:null,observedSessions:0});expect(first.input.samples).toHaveLength(1);
 value.points=[...value.points,point('2023-02-01',1000,'2023-03-01T00:00:00Z')];const appended=compiled(value);expect(appended.input.months).toEqual(first.input.months);expect(appended.input.samples).toEqual(first.input.samples);
});
it('a finalized monthly declaration cannot precede the actual month end and daily calendar conflicts refuse',()=>{
 const value=input();value.contract.kind='monthly';value.points=[point('2023-01-01',100,'2023-01-05T00:00:00Z')];expect(compileSeasonalityMonths(value)).toMatchObject({status:'unavailable',input:null});
 value.contract={calendar:'nyse',session:'regular',kind:'daily',dateLabels:'utc-date'};value.settings.startYear=2025;value.settings.endYear=2025;value.asOf=stamp('2025-02-01');value.points=[point('2025-01-09',100,'2025-01-09T21:00:00Z')];expect(compileSeasonalityMonths(value)).toMatchObject({status:'unavailable',input:null,diagnostic:expect.stringMatching(/calendar/)});
});
it('duplicate labels, intraday kinds, malformed completion and accessors never manufacture a month',()=>{
 const value=input(),one=point('2023-01-01',100,'2023-01-02T00:00:00Z');value.points=[one,one];expect(compileSeasonalityMonths(value).status).toBe('unavailable');value.points=[];value.contract.kind='intraday' as any;expect(compileSeasonalityMonths(value).status).toBe('unavailable');
 const accessor=input();let reads=0;const row=point('2023-01-01',100,'2023-01-02T00:00:00Z');Object.defineProperty(row,'finalized',{enumerable:true,get(){reads++;return true;}});accessor.points=[row];expect(compileSeasonalityMonths(accessor).status).toBe('unavailable');expect(reads).toBe(0);
});
it('compiler cache reservation refuses a near2M NYSE batch before any calendar or Intl cache work',()=>{
 const value=input();value.contract={calendar:'nyse',session:'regular',kind:'daily',dateLabels:'calendar-midnight'};value.settings.startYear=2023;value.settings.endYear=2023;value.settings.externalNumericSlots=1950000;
 const clock=vi.spyOn(calendar,'newYorkClock'),wall=vi.spyOn(calendar,'newYorkWallTime'),day=vi.spyOn(calendar,'usSessionDay'),result=compileSeasonalityMonths(value);
 expect({status:result.status,calendarReads:clock.mock.calls.length+wall.mock.calls.length+day.mock.calls.length}).toEqual({status:'unavailable',calendarReads:0});
 expect(result).toMatchObject({status:'unavailable',input:null,usage:null,diagnostic:expect.stringMatching(/budget/)});
});
