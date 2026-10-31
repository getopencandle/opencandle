import {describe,expect,it} from 'vitest';
import {NYSE_EARLY_CLOSES,NYSE_HOLIDAYS,NYSE_CALENDAR_YEARS,usEquitySessionBucket,usMarketSession,usSessionDay,usSessionSegment,newYorkWallTime} from '../../src/domain/us-market-hours';

// NYSE full-day closures and 13:00 early closes 2015-2028, from the NYSE Group
// calendar releases and the NYSE hours page (sources per year in Dates only; no network.
const holidays=(year:number)=>[...NYSE_HOLIDAYS].filter(date=>date.startsWith(year+'-')).sort();
const earlies=(year:number)=>[...NYSE_EARLY_CLOSES].filter(date=>date.startsWith(year+'-')).sort();
const at=(date:string,minute:number)=>newYorkWallTime(date,minute)*1000;

describe('NYSE calendar 2015-2028',()=>{
 it('covers every year from 2015 through 2028',()=>{
  expect(NYSE_CALENDAR_YEARS).toEqual({first:2015,last:2028});
  for(let year=2015;year<=2028;year++)expect(holidays(year).length,String(year)).toBeGreaterThanOrEqual(9);
 });
 it('lists the published full-day closures for each year',()=>{
  expect(holidays(2015)).toEqual(['2015-01-01','2015-01-19','2015-02-16','2015-04-03','2015-05-25','2015-07-03','2015-09-07','2015-11-26','2015-12-25']);
  expect(holidays(2016)).toEqual(['2016-01-01','2016-01-18','2016-02-15','2016-03-25','2016-05-30','2016-07-04','2016-09-05','2016-11-24','2016-12-26']);
  expect(holidays(2017)).toEqual(['2017-01-02','2017-01-16','2017-02-20','2017-04-14','2017-05-29','2017-07-04','2017-09-04','2017-11-23','2017-12-25']);
  expect(holidays(2018)).toEqual(['2018-01-01','2018-01-15','2018-02-19','2018-03-30','2018-05-28','2018-07-04','2018-09-03','2018-11-22','2018-12-05','2018-12-25']);
  expect(holidays(2019)).toEqual(['2019-01-01','2019-01-21','2019-02-18','2019-04-19','2019-05-27','2019-07-04','2019-09-02','2019-11-28','2019-12-25']);
  expect(holidays(2020)).toEqual(['2020-01-01','2020-01-20','2020-02-17','2020-04-10','2020-05-25','2020-07-03','2020-09-07','2020-11-26','2020-12-25']);
  expect(holidays(2021)).toEqual(['2021-01-01','2021-01-18','2021-02-15','2021-04-02','2021-05-31','2021-07-05','2021-09-06','2021-11-25','2021-12-24']);
  expect(holidays(2022)).toEqual(['2022-01-17','2022-02-21','2022-04-15','2022-05-30','2022-06-20','2022-07-04','2022-09-05','2022-11-24','2022-12-26']);
  expect(holidays(2023)).toEqual(['2023-01-02','2023-01-16','2023-02-20','2023-04-07','2023-05-29','2023-06-19','2023-07-04','2023-09-04','2023-11-23','2023-12-25']);
  expect(holidays(2024)).toEqual(['2024-01-01','2024-01-15','2024-02-19','2024-03-29','2024-05-27','2024-06-19','2024-07-04','2024-09-02','2024-11-28','2024-12-25']);
  expect(holidays(2025)).toEqual(['2025-01-01','2025-01-09','2025-01-20','2025-02-17','2025-04-18','2025-05-26','2025-06-19','2025-07-04','2025-09-01','2025-11-27','2025-12-25']);
  expect(holidays(2028)).toEqual(['2028-01-17','2028-02-21','2028-04-14','2028-05-29','2028-06-19','2028-07-04','2028-09-04','2028-11-23','2028-12-25']);
 });
 it('lists the published 13:00 early closes for each year',()=>{
  expect(earlies(2015)).toEqual(['2015-11-27','2015-12-24']);
  expect(earlies(2016)).toEqual(['2016-11-25']);
  expect(earlies(2017)).toEqual(['2017-07-03','2017-11-24']);
  expect(earlies(2018)).toEqual(['2018-07-03','2018-11-23','2018-12-24']);
  expect(earlies(2019)).toEqual(['2019-07-03','2019-11-29','2019-12-24']);
  expect(earlies(2020)).toEqual(['2020-11-27','2020-12-24']);
  expect(earlies(2021)).toEqual(['2021-11-26']);
  expect(earlies(2022)).toEqual(['2022-11-25']);
  expect(earlies(2023)).toEqual(['2023-07-03','2023-11-24']);
  expect(earlies(2024)).toEqual(['2024-07-03','2024-11-29','2024-12-24']);
  expect(earlies(2025)).toEqual(['2025-07-03','2025-11-28','2025-12-24']);
  expect(earlies(2026)).toEqual(['2026-11-27','2026-12-24']);
  expect(earlies(2027)).toEqual(['2027-11-26']);
  expect(earlies(2028)).toEqual(['2028-07-03','2028-11-24']);
 });
 it('every listed date is a weekday, and no date is both a closure and an early close',()=>{
  for(const date of [...NYSE_HOLIDAYS,...NYSE_EARLY_CLOSES]){const day=usSessionDay(date);expect(day.weekend,date).toBe(false);}
  for(const date of NYSE_EARLY_CLOSES)expect(NYSE_HOLIDAYS.has(date),date).toBe(false);
 });
 it('2022-01-01 (a Saturday) and 2028-01-01 (a Saturday) have no observed New Year holiday',()=>{
  expect(NYSE_HOLIDAYS.has('2021-12-31')).toBe(false);expect(NYSE_HOLIDAYS.has('2027-12-31')).toBe(false);
  expect(usMarketSession(at('2021-12-31',600))).toBe('regular');expect(usMarketSession(at('2027-12-31',600))).toBe('regular');
 });
 it('known closures read closed all day: the GME split month, national days of mourning, Juneteenth',()=>{
  for(const date of ['2018-12-05','2025-01-09','2022-06-20','2015-07-03','2021-12-24'])expect(usMarketSession(at(date,600)),date).toBe('closed');
  // GME's 4:1 split took effect on 2022-07-22, an ordinary trading day.
  expect(usMarketSession(at('2022-07-22',600))).toBe('regular');
 });
 it('2025 early closes end the regular session at 13:00 and after-hours at 17:00',()=>{
  for(const date of ['2025-07-03','2025-11-28','2025-12-24']){
   const day=usSessionDay(date);expect(day).toMatchObject({earlyClose:true,close:780,postClose:1020});
   expect(usMarketSession(at(date,779))).toBe('regular');expect(usMarketSession(at(date,780))).toBe('extended');expect(usMarketSession(at(date,1020))).toBe('closed');
   expect(usSessionSegment(newYorkWallTime(date,800))).toMatchObject({phase:'post',start:newYorkWallTime(date,780),end:newYorkWallTime(date,1020)});
  }
 });
 it('the last 1h regular bucket of an early-close day is 12:30-13:00',()=>{
  const bucket=usEquitySessionBucket(newYorkWallTime('2019-12-24',760),60);
  expect(bucket).toEqual({start:newYorkWallTime('2019-12-24',750),end:newYorkWallTime('2019-12-24',780)});
 });
 it('an ordinary day before 2026 keeps the full 16:00 close',()=>{
  expect(usSessionDay('2016-12-23')).toMatchObject({earlyClose:false,holiday:false,close:960});
  expect(usSessionDay('2022-12-23')).toMatchObject({earlyClose:false,holiday:false,close:960});
 });
});
