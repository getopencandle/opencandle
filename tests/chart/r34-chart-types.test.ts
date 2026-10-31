// Non-time chart type gaps against the reference app. Synthetic fixtures only (labelled synthetic). Every
// expectation below is hand worked in the comments; construction rules without a the recorded facts are our own choice.
import {describe,it,expect} from 'vitest';
import type {Bar} from '../../src/domain/types';
import {computeDerived,derivedStepPinKey,DERIVED_SLICE_APPROXIMATIONS,type DerivedSeries} from '../../src/chart/derived';
import {pointFigure} from '../../src/chart/derived/pointfigure';
import {pnfCells} from '../../src/chart/derived/paint';
import {DERIVED_SETTING_FIELDS,DERIVED_UNRESOLVED,derivedSettingsDefaults,validateDerivedSettings} from '../../src/chart/derived/derived-settings';
import {factoryAppearance,factoryPriceScale,findRow,type ChartSettingsSources} from '../../src/chart/chart-settings-bindings';
import {defaultChartSettingsDocument} from '../../src/chart/chart-settings-document';
import {settingsDefaults} from '../../src/chart/chart-settings';
import {heikinAshiBars} from '../../src/chart/calculation-bars';

const closes=(values:number[]):Bar[]=>values.map((close,index)=>({time:1000+index*60,open:close,high:close,low:close,close,volume:1}));
const ohlc=(rows:[number,number,number,number][]):Bar[]=>rows.map(([open,high,low,close],index)=>({time:1000+index*60,open,high,low,close,volume:1}));
function ok(result:{ok:boolean}):DerivedSeries{if(!result.ok)throw Error(JSON.stringify(result));return (result as unknown as {value:DerivedSeries}).value;}
const cols=(rows:readonly {direction:string;open:number;close:number;boxes?:number;span:[number,number]}[])=>rows.map(bar=>[bar.direction,bar.open,bar.close,bar.boxes,bar.span]);

describe(' Point and figure: box rows are one grid for X and O columns',()=>{
 const settings={boxMethod:'Traditional',boxSize:1,reversalAmount:3,atrLength:14,percentage:1,source:'close',oneStepBackBuilding:false};
 // Box label L is the row [(L-1)*box, L*box]. An X box L fills when price >= L*box; an O box L fills when price <= L*box.
 // 10.2: first X box is 11 (needs >= 11), first O box is 10 (needs <= 10).
 // 11.5, 12.9, 13.1: X boxes 11..13, rows [10,13]. 11: no reversal (needs <= 13-3 = 10). 10: reversal, O boxes 12..10, rows [9,12].
 // 9.9: O does not extend (ceil 10). 12: X reversal needs >= 10+3 = 13, no. 13.5: X boxes 11..13 again, rows [10,13].
 it('the reversal column starts one box below the previous top (hand worked)',()=>{
  const value=ok(pointFigure(closes([10.2,11.5,12.9,13.1,11,10,9.9,12,13.5]),settings));
  expect(cols(value.confirmed)).toEqual([['up',10,13,3,[0,3]],['down',12,9,3,[3,5]]]);
  expect(cols(value.projection)).toEqual([['up',10,13,3,[5,8]]]);
  // The painted cells: the O column top row [11,12] is one row below the X column top row [12,13].
  const [x,o]=value.confirmed;
  expect(pnfCells(x,1).map(cell=>cell.high)).toEqual([11,12,13]);
  expect(pnfCells(o,1).map(cell=>cell.high)).toEqual([10,11,12]);
 });
 it('a first O column starts at the first box below the first price (hand worked)',()=>{
  // 10.2 -> 10: O box 10 fills (<= 10); 9.4 -> ceil 10, no extension; 8.7 -> O box 9. Rows [8,10].
  const value=ok(pointFigure(closes([10.2,10,9.4,8.7]),settings));
  expect(cols(value.projection)).toEqual([['down',10,8,2,[0,3]]]);
  // An on-grid first price needs a whole box: 10 -> 9.5 (ceil 10, O box 9 needs <= 9) stays empty.
  expect(ok(pointFigure(closes([10,9.5]),settings)).projection).toEqual([]);
 });
 it('high/low source: rows follow the same grid (hand worked)',()=>{
  // Bar 1 high 13.4: X boxes 11..13. Bar 2 high 13.2 does not extend; low 9.9 -> ceil 10 <= 10: O boxes 12..10.
  const value=ok(pointFigure(ohlc([[10.2,10.2,10.2,10.2],[12,13.4,11,13],[12,13.2,9.9,10]]),{...settings,source:'highlow'}));
  expect(cols(value.confirmed)).toEqual([['up',10,13,3,[0,1]]]);
  expect(cols(value.projection)).toEqual([['down',12,9,3,[1,2]]]);
 });
 it('one step back building: the reversal column starts in the row of the previous extreme (OpenCandle-defined, hand worked)',()=>{
  // Same series. Reversal at 10: O boxes 13..10 (rows [9,13], 4 boxes). Reversal at 13.5: X boxes 10..13 (rows [9,13], 4 boxes).
  const value=ok(pointFigure(closes([10.2,11.5,12.9,13.1,11,10,9.9,12,13.5]),{...settings,oneStepBackBuilding:true}));
  expect(cols(value.confirmed)).toEqual([['up',10,13,3,[0,3]],['down',13,9,4,[3,5]]]);
  expect(cols(value.projection)).toEqual([['up',9,13,4,[5,8]]]);
  expect(value.transformId).toContain('oneStepBack');
  expect(pointFigure(closes([10.2,11.5]),{...settings,oneStepBackBuilding:'yes'})).toMatchObject({ok:false,diagnostic:{code:'DERIVED_SETTING_INVALID'}});
 });
 it('the setting is the fact input',()=>{
  expect(DERIVED_SETTING_FIELDS.pointfigure.find(field=>field.key==='oneStepBackBuilding')).toMatchObject({label:'One step back building',kind:'boolean'});
  expect(derivedSettingsDefaults('pointfigure').oneStepBackBuilding).toBe(false);expect(settingsDefaults('pointfigure').oneStepBackBuilding).toBe(false);
  expect(validateDerivedSettings('pointfigure',{oneStepBackBuilding:true})).toEqual({oneStepBackBuilding:true});
  expect(DERIVED_UNRESOLVED.pointfigure.join(' ')).not.toMatch(/not offered/);
  expect(DERIVED_SLICE_APPROXIMATIONS.some(row=>row.id==='R34-SA-2'&&row.styles.includes('pointfigure'))).toBe(true);
  // The old default run keeps working when a saved book has no value for the new key.
  expect(computeDerived('pointfigure',closes([10.2,11.5]),{boxMethod:'Traditional',boxSize:1,reversalAmount:3,atrLength:14,percentage:1,source:'close'}).ok).toBe(true);
 });
});

describe(' live updates: the forming bar never moves the box size',()=>{
 // Three closed bars with true range 2, then a forming bar with true range 10.
 // ATR(3) on the closed bars = (2+2+2)/3 = 2. With the forming bar: (2*2+10)/3 = 14/3.
 const bars=ohlc([[10,11,9,10],[10,11,9,10],[10,11,9,10],[10,20,10,19]]);
 const renko={boxMethod:'ATR',atrLength:3,boxSize:3,percentage:1,source:'close',wicks:true};
 it('ATR is read on the completed bars while the last bar is forming (OpenCandle-defined)',()=>{
  expect(ok(computeDerived('renko',bars,renko)).step).toBeCloseTo(14/3,12);
  const forming=ok(computeDerived('renko',bars,renko,{lastBarOpen:true}));
  expect(forming.step).toBe(2);
  // Base 10, box 2: the forming close 19 completes bricks 10-12, 12-14, 14-16, 16-18 (projection, the forming bar confirms them).
  expect(forming.confirmed).toEqual([]);expect(forming.projection.map(bar=>[bar.open,bar.close])).toEqual([[10,12],[12,14],[14,16],[16,18],[18,19]]);
  for(const [style,settings] of [['kagi',{reversalMethod:'ATR',atrLength:3,reversalAmount:1,percentage:1}],['pointfigure',{boxMethod:'ATR',atrLength:3,boxSize:1,reversalAmount:3,percentage:1,source:'close'}]] as const)
   expect(ok(computeDerived(style,bars,settings,{lastBarOpen:true})).step,style).toBe(2);
 });
 it('Percentage reads the last completed close while the last bar is forming (OpenCandle-defined)',()=>{
  const settings={...renko,boxMethod:'Percentage',percentage:1};
  expect(ok(computeDerived('renko',closes([100,200]),settings)).step).toBe(2);
  expect(ok(computeDerived('renko',closes([100,200]),settings,{lastBarOpen:true})).step).toBe(1);
 });
 it('falls back to every bar when the completed bars cannot resolve a step',()=>{
  expect(ok(computeDerived('renko',ohlc([[10,11,9,10],[10,11,9,10],[10,20,10,19]]),renko,{lastBarOpen:true})).step).toBeCloseTo(14/3,12);
 });
 it('a pinned step wins for ATR and Percentage, never for Traditional',()=>{
  expect(ok(computeDerived('renko',bars,renko,{lastBarOpen:true,pinnedStep:5})).step).toBe(5);
  expect(ok(computeDerived('renko',bars,{...renko,boxMethod:'Traditional'},{pinnedStep:5})).step).toBe(3);
  expect(ok(computeDerived('linebreak',bars,{lines:3},{pinnedStep:5})).step).toBeNull();
  expect(computeDerived('renko',bars,renko,{pinnedStep:-1})).toMatchObject({ok:false,diagnostic:{code:'DERIVED_STEP_UNAVAILABLE'}});
 });
 it('pin keys: only ATR and Percentage steps of one live subscription and one setting set are pinned',()=>{
  const key=derivedStepPinKey('renko',renko,'live:abc');
  expect(key).toBeTypeOf('string');
  expect(derivedStepPinKey('renko',renko,'live:abc')).toBe(key);
  expect(derivedStepPinKey('renko',{...renko,atrLength:4},'live:abc')).not.toBe(key);
  expect(derivedStepPinKey('renko',renko,'live:other')).not.toBe(key);
  expect(derivedStepPinKey('kagi',{reversalMethod:'Percentage'},'live:abc')).toBeTypeOf('string');
  expect(derivedStepPinKey('renko',{...renko,boxMethod:'Traditional'},'live:abc')).toBeNull();
  expect(derivedStepPinKey('range',{range:10},'live:abc')).toBeNull();
  expect(derivedStepPinKey('renko',renko,null)).toBeNull();
 });
});

describe(' settings dialog option labels',()=>{
 const typed=(style:string):ChartSettingsSources=>({appearance:factoryAppearance(),document:defaultChartSettingsDocument(),documentConnected:true,priceScale:factoryPriceScale(),ratio:0.5,style,typeSettings:settingsDefaults(style),timezone:'UTC',exchangeTimezone:null,scaleMode:{scale:'linear',invert:false,auto:true}});
 const labels=(style:string,key:string)=>(findRow('symbol',typed(style),key) as {options?:{value:string;label:string}[]}|null)?.options?.map(option=>option.label);
 it('Renko and P&F sources and the Range bar style read as words, not ids',()=>{
  expect(labels('renko','type.renko.source')).toEqual(['Close','OHLC']);
  expect(labels('pointfigure','type.pointfigure.source')).toEqual(['Close','High/Low']);
  expect(labels('range','type.range.rangeStyle')).toEqual(['Bars','Candles']);
  expect(labels('pointfigure','type.pointfigure.boxMethod')).toEqual(['ATR','Traditional','Percentage (last traded price)']);
 });
});

describe(' Heikin Ashi recurrence oracle',()=>{
 it('HA close = OHLC/4, HA open = previous (HA open + HA close)/2, first open = (O+C)/2 (hand worked)',()=>{
  const ha=heikinAshiBars(ohlc([[10,12,9,11],[11,14,10,13]]));
  // Bar 0: close (10+12+9+11)/4 = 10.5, open (10+11)/2 = 10.5, high max(12,10.5,10.5) = 12, low 9.
  // Bar 1: close (11+14+10+13)/4 = 12, open (10.5+10.5)/2 = 10.5, high 14, low 10.
  expect(ha.map(bar=>[bar.open,bar.high,bar.low,bar.close])).toEqual([[10.5,12,9,10.5],[10.5,14,10,12]]);
 });
});
