import {describe,expect,it} from 'vitest';
import type {Bar} from '../../src/domain/types';
import {buildVolumeProfile,logicalOfTime,profilePeriods,visibleProfileSpan,PROFILE_MAX_ROWS} from '../../src/domain/volume-profile';
import {calculateIndicator} from '../../src/domain/indicators';
import {catalogDefinition} from '../../src/domain/indicator-catalog';
import {selectorView} from '../../src/domain/indicator-selector-catalog';

// numerical oracles. Every fixture is SYNTHETIC (hand-made bars, not market data); expected values are
// hand-computed from the rules in src/domain/volume-profile.ts (to).
const bar=(time:number,open:number,high:number,low:number,close:number,volume:number):Bar=>({time,open,high,low,close,volume});
const T0=1767225600;// 2026-01-01T00:00:00Z
/** SYNTHETIC: A spans 10-14 up 400; B spans 11-12 down 300; C has no range at 12, up 50. */
const ABC=[bar(T0,10,14,10,14,400),bar(T0+86400,12,12,11,11,300),bar(T0+2*86400,12,12,12,12,50)];
const NROWS={rowsLayout:'Number Of Rows' as const,rowSize:4,valueAreaPct:70};

describe(' profile rows, POC, VAH and VAL (SYNTHETIC)',()=>{
 it('Number Of Rows: volume spread by range overlap, POC on the heaviest row, value area by the two-row rule',()=>{
  const p=buildVolumeProfile(ABC,0,2,NROWS)!;
  expect(p.rows.map(row=>[row.low,row.high])).toEqual([[10,11],[11,12],[12,13],[13,14]]);
  expect(p.rows.map(row=>[row.up,row.down])).toEqual([[100,0],[100,300],[150,0],[100,0]]);
  expect(p.total).toBe(750);expect(p.maxRow).toBe(400);
  expect(p.poc).toBe(1);expect(p.pocPrice).toBe(11.5);
  // target 525: start 400 at the POC; above pair 150+100=250 beats below 100, so the value area is rows 1..3 (650).
  expect([p.vaFrom,p.vaTo]).toEqual([1,3]);expect(p.vah).toBe(14);expect(p.val).toBe(11);
 });
 it('Value Area Volume 0 keeps only the POC row; 100 takes every row',()=>{
  const none=buildVolumeProfile(ABC,0,2,{...NROWS,valueAreaPct:0})!;expect([none.val,none.vah]).toEqual([11,12]);
  const all=buildVolumeProfile(ABC,0,2,{...NROWS,valueAreaPct:100})!;expect([all.val,all.vah]).toEqual([10,14]);
 });
 it('the lower pair is added when it holds more volume',()=>{
  // SYNTHETIC: rows 10-11 (500 up), 11-12 (600 POC), 12-13 (100) over Number Of Rows 3.
  const bars=[bar(T0,10,11,10,11,500),bar(T0+60,11,12,11,12,600),bar(T0+120,12,13,12,13,100)];
  const p=buildVolumeProfile(bars,0,2,{rowsLayout:'Number Of Rows',rowSize:3,valueAreaPct:70})!;
  expect(p.poc).toBe(1);expect([p.vaFrom,p.vaTo]).toEqual([0,1]);expect([p.val,p.vah]).toEqual([10,12]);
 });
 it('POC tie: the row closest to the middle of the range wins, then the lower row',()=>{
  const bars=[bar(T0,10,13,10,13,300)];// 3 equal rows of 100
  expect(buildVolumeProfile(bars,0,0,{rowsLayout:'Number Of Rows',rowSize:3,valueAreaPct:70})!.poc).toBe(1);
  expect(buildVolumeProfile(bars,0,0,{rowsLayout:'Number Of Rows',rowSize:2,valueAreaPct:70})!.poc).toBe(0);
 });
 it('Ticks Per Row: rows of Row Size x tick, aligned to multiples of the row height; it needs a tick size',()=>{
  const p=buildVolumeProfile(ABC,0,2,{rowsLayout:'Ticks Per Row',rowSize:2,valueAreaPct:70,tickSize:0.5})!;
  expect(p.rowHeight).toBe(1);expect(p.rows[0].low).toBe(10);expect(p.rows).toHaveLength(5);expect(p.rows[4].up+p.rows[4].down).toBe(0);
  expect(p.pocPrice).toBe(11.5);
  const aligned=buildVolumeProfile([bar(T0,10.3,10.9,10.3,10.9,10)],0,0,{rowsLayout:'Ticks Per Row',rowSize:4,valueAreaPct:70,tickSize:0.25})!;
  expect(aligned.rows.map(row=>row.low)).toEqual([10]);expect(aligned.rows[0].up).toBeCloseTo(10,12);
  expect(()=>buildVolumeProfile(ABC,0,2,{rowsLayout:'Ticks Per Row',rowSize:2,valueAreaPct:70})).toThrow(/tick size/);
  expect(()=>buildVolumeProfile(ABC,0,2,{rowsLayout:'Ticks Per Row',rowSize:1,valueAreaPct:70,tickSize:0.0001})).toThrow(new RegExp(String(PROFILE_MAX_ROWS)));
 });
 it('a span without volume has no profile',()=>{
  expect(buildVolumeProfile([bar(T0,1,2,1,2,0)],0,0,NROWS)).toBeNull();
 });
 it('lower-timeframe bars replace the chart bar they fall inside; other bars use their own range',()=>{
  // SYNTHETIC 1h chart bars 10-14 (vol 400) and 10-14 (vol 400); 15m bars only inside the first hour, all at 13-14.
  const chart=[bar(T0,10,14,10,14,400),bar(T0+3600,10,14,10,14,400)];
  const fine=[0,900,1800,2700].map(dt=>bar(T0+dt,13,14,13,14,100));
  const p=buildVolumeProfile(chart,0,1,{...NROWS,resolution:'1h',lowerTimeframe:{interval:'15m',bars:fine}})!;
  expect(p.lowerTimeframeBars).toBe(1);
  expect(p.rows.map(row=>row.up)).toEqual([100,100,100,500]);expect(p.poc).toBe(3);expect(p.pocPrice).toBe(13.5);
  // A lower timeframe that is not finer than the chart is ignored.
  const same=buildVolumeProfile(chart,0,1,{...NROWS,resolution:'1h',lowerTimeframe:{interval:'1h',bars:fine}})!;
  expect(same.lowerTimeframeBars).toBe(0);expect(same.rows.map(row=>row.up)).toEqual([200,200,200,200]);
 });
});

describe(' visible span and periods (SYNTHETIC)',()=>{
 const days=Array.from({length:10},(_,i)=>bar(T0+i*86400,10+i,11+i,9+i,10.5+i,100+i));
 it('logical mapping matches the renderer rule, with extrapolation past the last bar',()=>{
  expect(logicalOfTime(days,T0+2*86400)).toBe(2);expect(logicalOfTime(days,T0+2.5*86400)).toBe(2.5);
  expect(logicalOfTime(days,T0+11*86400)).toBe(11);expect(logicalOfTime(days,T0-86400)).toBe(-1);
 });
 it('the visible span keeps every bar whose slot overlaps the pane; no range means every bar',()=>{
  expect(visibleProfileSpan(days,{from:T0+2.6*86400,to:T0+6.4*86400})).toEqual({from:3,to:6,left:2.6,right:6.4});
  expect(visibleProfileSpan(days,{from:T0+2.4*86400,to:T0+6.6*86400})).toMatchObject({from:2,to:7});
  expect(visibleProfileSpan(days,{from:T0+8*86400,to:T0+20*86400})).toMatchObject({from:8,to:9,right:20});
  expect(visibleProfileSpan(days,null)).toEqual({from:0,to:9,left:-0.5,right:9.5});
  expect(visibleProfileSpan(days,{from:T0+30*86400,to:T0+40*86400})).toBeNull();
 });
 it('Session keeps regular New York hours; Day includes extended hours; Week groups Monday weeks',()=>{
  // SYNTHETIC 2026-03-02 (Mon) and 03-03: 08:00 pre-market, 09:30 and 15:30 regular, 17:00 after-hours New York (EST, UTC-5).
  const ny=(day:number,h:number,m:number)=>Date.UTC(2026,2,day,h+5,m)/1000;
  const bars=[ny(2,8,0),ny(2,9,30),ny(2,15,30),ny(2,17,0),ny(3,8,0),ny(3,9,30),ny(3,15,30)].map(time=>bar(time,10,11,9,10.5,100));
  expect(profilePeriods(bars,'Session',{resolution:'30m',calendar:'us-equity'})).toEqual([{from:1,to:2},{from:5,to:6}]);
  expect(profilePeriods(bars,'Day',{resolution:'30m',calendar:'us-equity'})).toEqual([{from:0,to:3},{from:4,to:6}]);
  expect(profilePeriods(bars,'Week',{resolution:'30m',calendar:'us-equity'})).toEqual([{from:0,to:6}]);
  expect(profilePeriods(days,'Month',{resolution:'1D',calendar:'utc'})).toEqual([{from:0,to:9}]);
  expect(()=>profilePeriods(days,'Year' as never)).toThrow();
 });
});

describe(' indicator kinds (SYNTHETIC)',()=>{
 const days=Array.from({length:10},(_,i)=>bar(T0+i*86400,10+i,11+i,9+i,10.5+i,100));
 it('VRVP: POC, VAH and VAL cover the visible bars only and follow the visible range',()=>{
  const result=calculateIndicator('vrvp',days,{},{visibleRange:{from:T0+2.6*86400,to:T0+6.4*86400},resolution:'1D'});
  expect(result.diagnostics).toEqual([]);
  const poc=result.series.find(row=>row.id==='poc')!.values;
  expect(poc.map(value=>value!==null)).toEqual([false,false,false,true,true,true,true,false,false,false]);
  const direct=buildVolumeProfile(days,3,6,{rowsLayout:'Number Of Rows',rowSize:24,valueAreaPct:70})!;
  expect(poc[3]).toBe(direct.pocPrice);expect(result.series.find(row=>row.id==='vah')!.values[4]).toBe(direct.vah);expect(result.series.find(row=>row.id==='val')!.values[5]).toBe(direct.val);
  expect(result.profiles).toHaveLength(1);expect(result.profiles![0]).toMatchObject({from:3,to:6,left:2.6,right:6.4});
  const moved=calculateIndicator('vrvp',days,{},{visibleRange:{from:T0+5.6*86400,to:T0+9.4*86400},resolution:'1D'});
  expect(moved.profiles![0]).toMatchObject({from:6,to:9});
 });
 it('VRVP without a visible range covers every loaded bar',()=>{
  const result=calculateIndicator('vrvp',days,{});expect(result.profiles![0]).toMatchObject({from:0,to:9});
 });
 it('PVP: one profile per period; the per-bar POC develops and reaches the profile POC on its last bar',()=>{
  const result=calculateIndicator('pvp',days,{period:'Week'},{resolution:'1D',calendar:'utc'});
  // 2026-01-01 is a Thursday: Jan 1-4, Jan 5-10.
  expect(result.profiles!.map(p=>[p.from,p.to])).toEqual([[0,3],[4,9]]);
  const poc=result.series.find(row=>row.id==='poc')!.values;
  // 0.8.1 (R2): causal per-bar levels (no look-ahead into later bars of the week); the histogram keeps the whole week.
  for(const p of result.profiles!)expect(poc[p.to]).toBe(p.pocPrice);
  expect(poc[3]).not.toBe(poc[9]);
  const prefix=calculateIndicator('pvp',days.slice(0,6),{period:'Week'},{resolution:'1D',calendar:'utc'}).series.find(row=>row.id==='poc')!.values;expect(prefix).toEqual(poc.slice(0,6));
 });
 it('missing volume is unavailable, never zero',()=>{
  const result=calculateIndicator('vrvp',days.map(row=>({...row,volume:NaN})),{});
  expect(result.series).toEqual([]);expect(result.diagnostics.join(' ')).toMatch(/volume/);
 });
 it('defaults: the fact values, VAH and VAL hidden; names from the Profiles tab fact',()=>{
  const vrvp=catalogDefinition('vrvp')!,pvp=catalogDefinition('pvp')!;
  expect(vrvp.name).toBe('Visible range volume profile');expect(pvp.name).toBe('Periodic volume profile');
  expect(Object.fromEntries(vrvp.inputs.map(row=>[row.key,row.defval]))).toEqual({rowsLayout:'Number Of Rows',rowSize:24,volume:'Up/Down',valueAreaVolume:70,placement:'Right',widthPct:30,developingPoc:false,developingVa:false,extendPocRight:false,rowValues:false});// Four extras, all off
  expect(Object.fromEntries(pvp.inputs.map(row=>[row.key,row.defval]))).toEqual({rowsLayout:'Number Of Rows',rowSize:24,volume:'Up/Down',valueAreaVolume:70,period:'Auto',placement:'Left',widthPct:30,developingPoc:false,developingVa:false,extendPocRight:false,rowValues:false});
  expect(vrvp.plots.map(row=>[row.id,row.visible])).toEqual([['poc',true],['vah',false],['val',false],['devPoc',undefined],['devVah',undefined],['devVal',undefined]]);// developing plots (shown; empty while their input is off)
  expect(vrvp.viewport).toBe(true);expect(pvp.viewport).toBeUndefined();
  for(const definition of [vrvp,pvp])expect(definition.unknownDefaults!.join(' ')).toMatch(/OpenCandle-defined/);
 });
 it('the Profiles tab lists both kinds; the Indicators tab does not',()=>{
  const indicators=[{id:'sma',name:'Simple Moving Average',acronym:'SMA'},{id:'vrvp',name:'Visible range volume profile',acronym:'VRVP'},{id:'pvp',name:'Periodic volume profile',acronym:'PVP'}];
  expect(selectorView({indicators,scripts:[]},{item:'built-ins',tab:'profiles',query:''}).entries.map(row=>row.label)).toEqual(['Periodic volume profile','Visible range volume profile']);
  expect(selectorView({indicators,scripts:[]},{item:'built-ins',tab:'indicators',query:''}).entries.map(row=>row.id)).toEqual(['sma']);
 });
});
