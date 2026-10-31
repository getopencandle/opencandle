import {describe,expect,it} from 'vitest';
import type {Bar} from '../../src/domain/types';
import {autoAnchorPeriod,autoAnchorStart,buildVolumeProfile,hdRowHeight,profilePeriods,sessionProfilePeriods,PROFILE_MAX_ROWS} from '../../src/domain/volume-profile';
import {calculateIndicator} from '../../src/domain/indicators';
import {catalogDefinition} from '../../src/domain/indicator-catalog';
import {selectorView} from '../../src/domain/indicator-selector-catalog';
import {indicatorAlertBlock} from '../../src/domain/indicator-alertability';
import {captureIndicatorAlertSource,evaluateTechnicalAlertSources,technicalSourceKey} from '../../src/domain/technical-alerts';
import {defaultIndicatorPresentation,indicatorDefaults,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {profileDetailNotice} from '../../src/chart/vp-visible-range-presentation';
import type {IndicatorId} from '../../src/domain/indicators';

// numerical oracles. Every fixture is SYNTHETIC (hand-made bars, not market data); expected values are
// hand-computed from the rules in src/domain/volume-profile.ts (to 6, to 5).
const bar=(time:number,open:number,high:number,low:number,close:number,volume:number):Bar=>({time,open,high,low,close,volume});
const DAY=86400,T0=1767225600;// 2026-01-01T00:00:00Z, a Thursday
/** New York EST (UTC-5) time on 2026-03-<day>. */
const ny=(day:number,h:number,m:number)=>Date.UTC(2026,2,day,h+5,m)/1000;
const US={resolution:'30m',calendar:'us-equity' as const};
/** SYNTHETIC two trading dates. Day 2: A 08:00 pre-market 10-12 up 100; B 09:30 regular 11-12 down 300.
 *  Day 3: C 09:30 regular 20-22 up 200; D 17:00 after-hours 21-22 down 50. */
const TWO_DAYS=[bar(ny(2,8,0),10,12,10,12,100),bar(ny(2,9,30),12,12,11,11,300),bar(ny(3,9,30),20,22,20,22,200),bar(ny(3,17,0),22,22,21,21,50)];
const settings=(kind:IndicatorId,inputs:Record<string,unknown>={},id='p1'):IndicatorInstanceSettings=>({id,kind,inputs:{...indicatorDefaults[kind],...inputs} as never,plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation(kind)});
const values=(result:ReturnType<typeof calculateIndicator>,id:string)=>result.series.find(row=>row.id===id)!.values;

describe(' Session volume profile (SYNTHETIC)',()=>{
 it('sessions: Regular keeps regular hours of each trading date, Extended every loaded bar of it',()=>{
  expect(sessionProfilePeriods(TWO_DAYS,'Regular',US)).toEqual([{from:1,to:1},{from:2,to:2}]);
  expect(sessionProfilePeriods(TWO_DAYS,'Extended',US)).toEqual([{from:0,to:1},{from:2,to:3}]);
  // They are the Periodic profile's Session and Day periods.
  expect(sessionProfilePeriods(TWO_DAYS,'Regular',US)).toEqual(profilePeriods(TWO_DAYS,'Session',US));
  expect(sessionProfilePeriods(TWO_DAYS,'Extended',US)).toEqual(profilePeriods(TWO_DAYS,'Day',US));
  // Daily bars: Regular equals Extended, one profile per date.
  const days=Array.from({length:3},(_,i)=>bar(T0+i*DAY,10,11,9,10.5,100));
  expect(sessionProfilePeriods(days,'Regular',{resolution:'1D',calendar:'us-equity'})).toEqual([{from:0,to:0},{from:1,to:1},{from:2,to:2}]);
  expect(sessionProfilePeriods(days,'Extended',{resolution:'1D',calendar:'us-equity'})).toEqual(sessionProfilePeriods(days,'Regular',{resolution:'1D',calendar:'us-equity'}));
  expect(()=>sessionProfilePeriods(days,'Overnight' as never)).toThrow(/Regular or Extended/);
 });
 it('Extended, 2 rows: day 2 rows [10,11] 50 and [11,12] 350, POC 11.5, value area the POC row (hand oracle)',()=>{
  const result=calculateIndicator('svp',TWO_DAYS,{rowSize:2},US);
  expect(result.diagnostics).toEqual([]);
  expect(result.profiles!.map(p=>[p.from,p.to])).toEqual([[0,1],[2,3]]);
  const day2=result.profiles![0];
  expect(day2.rows.map(row=>[row.low,row.high,row.up,row.down])).toEqual([[10,11,50,0],[11,12,50,300]]);
  // target 70% of 400 = 280; the POC row alone holds 350.
  expect([day2.pocPrice,day2.vah,day2.val]).toEqual([11.5,12,11]);
  // Day 3: C spreads 100/100 over [20,21],[21,22]; D adds 50 down to [21,22]. POC 21.5; target 175, POC row 150, add [20,21].
  expect([values(result,'poc')[2],values(result,'vah')[3],values(result,'val')[3]]).toEqual([21.5,22,20]);
  expect(values(result,'poc')).toEqual([11.5,11.5,21.5,21.5]);
 });
 it('Regular, 2 rows: only B on day 2; equal rows tie at the middle, so the lower row is the POC (hand oracle)',()=>{
  const result=calculateIndicator('svp',TWO_DAYS,{rowSize:2,session:'Regular'},US);
  expect(result.profiles!.map(p=>[p.from,p.to])).toEqual([[1,1],[2,2]]);
  // B: [11,11.5] and [11.5,12] hold 150 each. Target 210: the upper row is added, VA 11-12.
  expect(values(result,'poc')).toEqual([null,11.25,20.5,null]);// day 3: C alone, [20,21] and [21,22] tie, the lower row
  expect([values(result,'vah')[1],values(result,'val')[1]]).toEqual([12,11]);
 });
 it('defaults, names and the Profiles tab',()=>{
  const svp=catalogDefinition('svp')!,hd=catalogDefinition('svphd')!,auto=catalogDefinition('aavp')!;
  expect([svp.name,hd.name,auto.name]).toEqual(['Session volume profile','Session volume profile HD','Auto anchored volume profile']);
  expect(Object.fromEntries(svp.inputs.map(row=>[row.key,row.defval]))).toEqual({rowsLayout:'Number Of Rows',rowSize:24,volume:'Up/Down',valueAreaVolume:70,session:'Extended',placement:'Left',widthPct:30,developingPoc:false,developingVa:false,extendPocRight:false,rowValues:false});
  expect(Object.fromEntries(hd.inputs.map(row=>[row.key,row.defval]))).toMatchObject({rowsLayout:'Number Of Rows',rowSize:100,session:'Extended'});
  expect(Object.fromEntries(auto.inputs.map(row=>[row.key,row.defval]))).toMatchObject({anchor:'Auto',length:20,rowsLayout:'Number Of Rows',rowSize:24,placement:'Left'});
  for(const definition of [svp,hd,auto]){
   expect(definition.profile).toBe(true);expect(definition.plots.map(row=>[row.id,row.visible])).toEqual(catalogDefinition('pvp')!.plots.map(row=>[row.id,row.visible]));
   expect(definition.unknownDefaults!.join(' ')).toMatch(/OpenCandle-defined/);
  }
  expect([svp.viewport,hd.viewport,auto.viewport]).toEqual([undefined,true,undefined]);
  const indicators=['vrvp','pvp','svp','svphd','aavp'].map(id=>({id,name:catalogDefinition(id)!.name,acronym:catalogDefinition(id)!.acronym}));
  expect(selectorView({indicators,scripts:[]},{item:'built-ins',tab:'profiles',query:''}).entries.map(row=>row.label)).toEqual(['Auto anchored volume profile','Periodic volume profile','Session volume profile','Session volume profile HD','Visible range volume profile']);
 });
});

describe(' Session volume profile HD (SYNTHETIC)',()=>{
 it('the row height is the visible price range over Row Size, shared by every session, and finer when zoomed in',()=>{
  const sessions=[{from:0,to:1},{from:2,to:3}];
  expect(hdRowHeight(TWO_DAYS,null,6,sessions)).toBe(2);// 10..22 over 6 rows
  expect(hdRowHeight(TWO_DAYS,{from:2,to:3},4,sessions)).toBe(0.5);// zoomed to day 3: 20..22 over 4 rows
  // A session needing more than the row limit raises the height.
  const wide=[bar(T0,0,10000,0,10000,1),bar(T0+DAY,5,6,5,6,1)];
  expect(hdRowHeight(wide,{from:1,to:1},10,[{from:0,to:0},{from:1,to:1}])).toBeCloseTo(10000/(PROFILE_MAX_ROWS-2),12);
  expect(hdRowHeight([bar(T0,5,5,5,5,1)],null,10,[{from:0,to:0}])).toBeNull();
 });
 it('every session is binned on the one shared grid; zooming in gives finer rows',()=>{
  const all=calculateIndicator('svphd',TWO_DAYS,{rowSize:6},US);
  expect(all.profiles!.map(p=>p.rowHeight)).toEqual([2,2]);
  // Rows sit on multiples of 2; a high exactly on a boundary opens one more (empty) row, as Ticks Per Row does.
  expect(all.profiles![0].rows.map(row=>[row.low,row.high,row.up+row.down])).toEqual([[10,12,400],[12,14,0]]);
  expect(all.profiles![1].rows.map(row=>[row.low,row.high,row.up+row.down])).toEqual([[20,22,250],[22,24,0]]);
  // Visible: day 3 only (20..22 over 6 rows = 1/3 each). Day 2 uses the same 1/3 grid.
  const zoomed=calculateIndicator('svphd',TWO_DAYS,{rowSize:6},{...US,visibleRange:{from:ny(3,9,30),to:ny(3,17,0)}});
  expect(zoomed.profiles!.map(p=>p.rowHeight)).toEqual([1/3,1/3]);
  expect(zoomed.profiles![1].rows.length).toBe(7);
  // The shared grid gives the same profile as Ticks Per Row with that height as the tick.
  const direct=buildVolumeProfile(TWO_DAYS,0,1,{rowsLayout:'Ticks Per Row',rowSize:1,tickSize:1/3,valueAreaPct:70})!;
  expect(zoomed.profiles![0].pocPrice).toBe(direct.pocPrice);expect(values(zoomed,'vah')[0]).toBe(direct.vah);
 });
});

describe(' Auto anchored volume profile (SYNTHETIC)',()=>{
 /** SYNTHETIC daily bars 2026-01-26 .. 2026-02-04 (10 bars). Highs, lows and volumes chosen so each extreme is unique,
  *  except a tie for the highest high on bars 3 and 6. */
 const START=Date.UTC(2026,0,26)/1000;
 const HIGH=[15,16,14,19,13,12,19,11,12,13],LOW=[9,8,7,10,6,9,9,8,7,10],VOL=[100,900,200,300,400,500,100,800,150,250];
 const days=HIGH.map((high,i)=>bar(START+i*DAY,(high+LOW[i])/2,high,LOW[i],(high+LOW[i])/2+0.5,VOL[i]));
 const D={resolution:'1D',calendar:'utc' as const};
 it('Auto follows the chart interval',()=>{
  expect(['1m','30m','4h','1D','2D','1W','2W','1M','3M'].map(resolution=>autoAnchorPeriod(days,resolution))).toEqual(['Session','Session','Session','Month','Month','Quarter','Quarter','Year','Year']);
  expect(autoAnchorPeriod(days,null)).toBe('Month');// daily spacing
  expect(autoAnchorPeriod(TWO_DAYS,null)).toBe('Session');
 });
 it('extreme anchors look back Length bars; ties take the latest bar',()=>{
  expect(autoAnchorStart(days,'Highest High',10,D)).toBe(6);// 19 on bars 3 and 6
  expect(autoAnchorStart(days,'Highest High',3,D)).toBe(9);// window 7..9: 11, 12, 13
  expect(autoAnchorStart(days,'Lowest Low',10,D)).toBe(4);
  expect(autoAnchorStart(days,'Highest Volume',10,D)).toBe(1);
  expect(autoAnchorStart(days,'Highest Volume',5,D)).toBe(7);
  expect(autoAnchorStart(days,'Highest Volume',1000,D)).toBe(1);// longer than the history: every bar
  expect(()=>autoAnchorStart(days,'Highest High',0,D)).toThrow(/Length/);
  expect(()=>autoAnchorStart(days,'Earnings' as never,10,D)).toThrow(/Anchor/);
  expect(autoAnchorStart([],'Auto',10,D)).toBeNull();
 });
 it('period anchors start at the first bar of the period holding the last bar',()=>{
  expect(autoAnchorStart(days,'Month',20,D)).toBe(6);// 2026-02-01
  expect(autoAnchorStart(days,'Auto',20,D)).toBe(6);// 1D: Month
  expect(autoAnchorStart(days,'Week',20,D)).toBe(7);// Monday 2026-02-02
  expect(autoAnchorStart(days,'Quarter',20,D)).toBe(0);
  expect(autoAnchorStart(days,'Year',20,D)).toBe(0);
  expect(autoAnchorStart(days,'Session',20,D)).toBe(9);
  expect(autoAnchorStart(TWO_DAYS,'Auto',20,US)).toBe(2);// 30m: the last trading date, extended bars included
 });
 it('one profile from the anchor through the last bar; levels only on those bars',()=>{
  const result=calculateIndicator('aavp',days,{anchor:'Highest Volume',length:5,rowSize:4},D);
  expect(result.profiles!.map(p=>[p.from,p.to])).toEqual([[7,9]]);
  const direct=buildVolumeProfile(days,7,9,{rowsLayout:'Number Of Rows',rowSize:4,valueAreaPct:70})!;
  expect(values(result,'poc')).toEqual([...Array(7).fill(null),direct.pocPrice,direct.pocPrice,direct.pocPrice]);
  expect(values(result,'vah')[9]).toBe(direct.vah);expect(values(result,'val')[9]).toBe(direct.val);
  // Bars 7..9 hold 800 + 150 + 250 = 1200, all of it binned.
  expect(direct.total).toBe(1200);
  expect(direct.rows.map(row=>row.up+row.down).reduce((a,b)=>a+b,0)).toBeCloseTo(1200,9);
 });
 it('the anchored profile moves with new bars (it recalculates on each prefix)',()=>{
  const first=calculateIndicator('aavp',days.slice(0,7),{anchor:'Highest Volume',length:3},D);
  expect(first.profiles!.map(p=>[p.from,p.to])).toEqual([[5,6]]);// window 4..6: 400, 500, 100
  const later=calculateIndicator('aavp',days,{anchor:'Highest Volume',length:3},D);
  expect(later.profiles!.map(p=>[p.from,p.to])).toEqual([[7,9]]);// window 7..9: 800, 150, 250
 });
});

describe(' alerts and the finer-bar notice (SYNTHETIC)',()=>{
 it('Session, Auto anchored and Periodic profiles are alertable with Number Of Rows; HD and Visible range are not',()=>{
  for(const kind of ['svp','aavp','pvp'])expect(indicatorAlertBlock(kind,{rowsLayout:'Number Of Rows'}),kind).toBeNull();
  for(const kind of ['svp','aavp','pvp'])expect(indicatorAlertBlock(kind,{rowsLayout:'Ticks Per Row'}),kind).toMatch(/tick size/);
  for(const kind of ['svphd','vrvp'])expect(indicatorAlertBlock(kind),kind).toMatch(/cannot be alerted on\.$/);
  expect(()=>captureIndicatorAlertSource(settings('svp',{rowsLayout:'Ticks Per Row'}),'poc','standard','snap')).toThrow(/tick size/);
 });
 it('a Session volume profile POC alert evaluates to the chart calculation at the endpoint',async()=>{
  const facts={resolution:'30m',calendar:'us-equity' as const};
  const sources=(['poc','vah','val'] as const).map(plot=>captureIndicatorAlertSource(settings('svp',{rowSize:2}),plot,'standard','snap-'+plot));
  const batch=await evaluateTechnicalAlertSources(TWO_DAYS,sources,'USD',facts);
  expect(sources.map(source=>batch.results.get(technicalSourceKey(source))!.sample.value)).toEqual([21.5,22,20]);
 });
 it('the chart says when the histogram fell back to each bar\'s own range',()=>{
  const p=(from:number,to:number,lower:number)=>({...buildVolumeProfile(TWO_DAYS,from,to,{rowsLayout:'Number Of Rows',rowSize:2,valueAreaPct:70})!,lowerTimeframeBars:lower});
  expect(profileDetailNotice([p(0,1,2),p(2,3,2)])).toBeNull();
  expect(profileDetailNotice([p(0,1,0),p(2,3,0)])).toMatch(/No shorter interval of this symbol is loaded/);
  expect(profileDetailNotice([p(0,1,2),p(2,3,0)])).toBe('Volume at each price comes from finer bars for 2 of 4 profile bars. No finer bars are loaded for the rest, so their volume is spread evenly over their high-low range.');
  expect(profileDetailNotice([])).toBeNull();
  // Presentation: the new kinds carry the notice; finer bars of the same instrument remove it.
  const plain=calculateIndicator('svp',TWO_DAYS,{rowSize:2},US);
  expect(renderIndicatorPresentation(settings('svp',{rowSize:2}),plain,TWO_DAYS,{resolution:'30m',calendar:'us-equity'}).diagnostics.join(' ')).toMatch(/No shorter interval/);
  const fine=TWO_DAYS.flatMap(row=>[0,900].map(offset=>({...row,time:row.time+offset,volume:row.volume/2})));
  const detailed=calculateIndicator('svp',TWO_DAYS,{rowSize:2},{...US,lowerTimeframe:{interval:'15m',bars:fine}});
  expect(detailed.profiles!.every(row=>row.lowerTimeframeBars===row.to-row.from+1)).toBe(true);
  expect(renderIndicatorPresentation(settings('svp',{rowSize:2}),detailed,TWO_DAYS,{resolution:'30m',calendar:'us-equity'}).diagnostics.join(' ')).not.toMatch(/finer bars|shorter interval/);
 });
});
