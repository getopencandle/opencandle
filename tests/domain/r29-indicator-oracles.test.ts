import {describe,expect,it} from 'vitest';
import {calculateIndicator,indicatorVwapBandSettings} from '../../src/domain/indicators';
import {catalogDefinition} from '../../src/domain/indicator-catalog';
import {R29_INDICATOR_IDS,chopZoneBucket,CHOP_ZONE_COLORS} from '../../src/domain/indicators-ext/r29-catalog';
import {woodiesTrendStates} from '../../src/domain/indicators-ext/r27-catalog';
import {createVwapDeviationAccumulator,vwapDeviationBounds} from '../../src/domain/vwap-stdev-bands';
import {calculateVwapWorkerMessage} from '../../src/vwap/worker-core';
import {renderIndicatorPresentation,POINT_PALETTE_POLICY} from '../../src/chart/indicator-presentation';
import {defaultIndicatorPresentation,indicatorInputSchema} from '../../src/chart/indicator-settings';
import {indicatorColorOpacity} from '../../src/chart/indicator-opacity';
import type {Bar} from '../../src/domain/types';
import type {LineLikeSeries} from '@luxalgo/vela';

// Hand-computed oracles for MA Cross, Volatility stop, Chop zone, Woodies trend coloring and VWAP
// Standard Deviation bands. All bars are SYNTHETIC fixtures made up for these tests (no market data). Each expected value
// is worked out in the comment next to it from the formula cited in the definition.
const D0=19700*86400;
const bar=(i:number,open:number,high:number,low:number,close:number,volume=100):Bar=>({time:D0+i*86400,open,high,low,close,volume});
const fromCloses=(closes:number[])=>closes.map((close,i)=>bar(i,close,close+1,close-1,close));
const values=(kind:string,bars:readonly Bar[],inputs:Record<string,unknown>={},plot?:string)=>{
 const result=calculateIndicator(kind,bars,inputs);expect(result.diagnostics,kind).toEqual([]);
 return result.series.find(row=>row.id===(plot??result.series[0].id))!.values;
};
const close=(got:readonly (number|null)[],want:readonly (number|null)[])=>{expect(got.length).toBe(want.length);want.forEach((value,i)=>{if(value===null)expect(got[i],'index '+i).toBeNull();else expect(got[i] as number,'index '+i).toBeCloseTo(value,9);});};

describe(' catalog shape (SYNTHETIC)',()=>{
 it('MA Cross, Volatility stop and Chop zone are built-ins with provenance and OpenCandle-defined unknowns',()=>{
  expect([...R29_INDICATOR_IDS]).toEqual(['macross','volstop','chopzone']);
  for(const kind of R29_INDICATOR_IDS){const definition=catalogDefinition(kind)!;expect(definition,kind).toBeDefined();expect(definition.provenance.length,kind).toBeGreaterThan(0);expect(definition.unknownDefaults!.join(' '),kind).toMatch(/OpenCandle-defined/);}
  expect(catalogDefinition('woodiescci')!.unknownDefaults!.join(' ')).not.toMatch(/not implemented/);
 });
 it('every kind calculates its defaults on 400 synthetic bars without diagnostics',()=>{
  const bars=Array.from({length:400},(_,i)=>{const c=100+10*Math.sin(i/9)+i*0.02;return {time:D0+i*3600,open:c-0.3,high:c+1+(i%3)*0.2,low:c-1-(i%4)*0.1,close:c,volume:500+(i*37)%250};});
  for(const kind of R29_INDICATOR_IDS){const result=calculateIndicator(kind,bars,{});expect(result.diagnostics,kind).toEqual([]);
   for(const plot of catalogDefinition(kind)!.plots)expect(result.series.find(row=>row.id===plot.id)!.values.some(value=>value!==null),kind+'.'+plot.id).toBe(true);}
 });
});

describe('MA Cross (SYNTHETIC)',()=>{
 it('short and long SMAs, with a marker on the short average where short - long changes sign',()=>{
  // short 1 = close; long 2: null, 1.5, 2.5, 2.5, 1.5, 1.5, 2.5. d = short - long: -, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5
  // crosses: bar 3 (0.5 -> -0.5) at 2, bar 5 (-0.5 -> 0.5) at 2.
  const b=fromCloses([1,2,3,2,1,2,3]),inputs={shortLength:1,longLength:2};
  close(values('macross',b,inputs,'long'),[null,1.5,2.5,2.5,1.5,1.5,2.5]);
  close(values('macross',b,inputs,'cross'),[null,null,null,2,null,2,null]);
 });
 it('a touch from 0 counts as a cross only when it leaves 0',()=>{
  // long 2 of 2, 2, 2, 3: null, 2, 2, 2.5 -> d: -, 0, 0, 0.5 -> cross at bar 3 (0 -> 0.5) at 3.
  close(values('macross',fromCloses([2,2,2,3]),{shortLength:1,longLength:2},'cross'),[null,null,null,3]);
 });
});

describe('Volatility stop (SYNTHETIC)',()=>{
 it('Wilder trailing stop on ATR: the extreme close -/+ multiplier x ATR, reversing on the previous stop',()=>{
  // h = c + 1, l = c - 1. TR: 2; max(2,|13-10|,|11-10|) = 3; max(2,0,2) = 2; max(2,|9-11|,|7-11|) = 4; 2; max(2,|14-9|,|12-9|) = 5.
  // Length 1 so ATR = TR; multiplier 1.
  // 0: up, ext 10, stop 8. 1: ext 12, stop 9. 2: ext 12, stop 10. 3: 8 < 10 -> down, ext 8, stop 12.
  // 4: 9 > 12? no, ext 8, stop 10. 5: 13 > 10 -> up, ext 13, stop 8.
  const b=fromCloses([10,12,11,8,9,13]),inputs={length:1,multiplier:1};
  close(values('volstop',b,inputs,'up'),[8,9,10,null,null,8]);
  close(values('volstop',b,inputs,'down'),[null,null,null,12,10,null]);
 });
 it('defaults are the author values (ATR 7, constant 3)',()=>{
  const inputs=Object.fromEntries(catalogDefinition('volstop')!.inputs.map(row=>[row.key,row.defval]));
  expect(inputs).toEqual({length:7,source:'close',multiplier:3});
 });
});

describe('Chop zone (SYNTHETIC)',()=>{
 it('slope = 100 x EMA change / range, one column per bar colored by the OpenCandle-defined buckets',()=>{
  // EMA 1 = close; range over 2 bars of h = c + 1, l = c - 1.
  // 1: 100 x 1 / (12 - 9) = 33.33 -> bucket 0. 2: 0 / (12 - 10) = 0 -> 4. 3: -0.1 x 100 / (12 - 9.9) = -4.7619 -> 8.
  const b=fromCloses([10,11,11,10.9]),inputs={emaLength:1,rangeLength:2};
  close(values('chopzone',b,inputs,'slope'),[null,100/3,0,-10/2.1]);
  close(values('chopzone',b,inputs,'zone'),[null,1,1,1]);
  expect(values('chopzone',b,inputs,'slope').map(chopZoneBucket)).toEqual([null,0,4,8]);
 });
 it('buckets are symmetric: an edge belongs to the stronger bucket on both sides',()=>{
  expect([5,4,3,2,1.5,1,0.7,0.5,0.2,0,-0.2,-0.5,-0.7,-1,-1.5,-2,-3,-4,-9].map(chopZoneBucket)).toEqual([0,0,1,1,2,2,3,3,4,4,4,5,5,6,6,7,7,8,8]);
  expect(chopZoneBucket(null)).toBeNull();expect(CHOP_ZONE_COLORS).toHaveLength(9);
 });
 it('the presentation colors each column from its bucket, at the plot opacity',()=>{
  const b=fromCloses([10,11,11,10.9]),inputs={emaLength:1,rangeLength:2},result=calculateIndicator('chopzone',b,inputs);
  const shown=renderIndicatorPresentation({id:'c1',kind:'chopzone',inputs,plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation('chopzone')},result,b,{resolution:'1D'});
  const zone=shown.output.series![0] as LineLikeSeries;
  expect(zone.points.slice(1).map(point=>point.color)).toEqual([0,4,8].map(k=>indicatorColorOpacity(CHOP_ZONE_COLORS[k],100)));
  expect(shown.policies).toContain(POINT_PALETTE_POLICY);
 });
});

describe('Woodies CCI trend coloring (SYNTHETIC)',()=>{
 it('six bars on one side of zero start a trend; a zero or a gap restarts the count',()=>{
  expect(woodiesTrendStates([1,1,1,1,1,1,1,-1,-1])).toEqual([null,null,null,null,null,0,0,null,null]);
  expect(woodiesTrendStates([-1,-2,-3,-4,-5,-6,0,-1])).toEqual([null,null,null,null,null,1,null,null]);
  expect(woodiesTrendStates([1,1,1,null,1,1,1,1,1,1])).toEqual([null,null,null,null,null,null,null,null,null,0]);
 });
 it('the histogram is green in an up trend and keeps its own color before the trend forms',()=>{
  const b=Array.from({length:30},(_,i)=>bar(i,100+i,101+i+(i%2),99+i,100+i));
  const inputs={cciLength:3,turboLength:2},result=calculateIndicator('woodiescci',b,inputs);
  const cci=result.series.find(row=>row.id==='cci')!.values,states=woodiesTrendStates(cci);
  expect(states.includes(0)).toBe(true);
  const shown=renderIndicatorPresentation({id:'w1',kind:'woodiescci',inputs,plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation('woodiescci')},result,b,{resolution:'1D'});
  const histogram=shown.output.series![0] as LineLikeSeries,green=indicatorColorOpacity('#43a047',100);
  states.forEach((state,i)=>{if(state===0)expect(histogram.points[i].color,'bar '+i).toBe(green);else expect(histogram.points[i].color,'bar '+i).not.toBe(green);});
 });
});

describe('VWAP Standard Deviation bands (SYNTHETIC)',()=>{
 const tuple=(extra:Record<string,unknown>={})=>({bandMode:'Standard Deviation',band1Enabled:true,band1Multiplier:1,band2Enabled:true,band2Multiplier:2,band3Enabled:false,band3Multiplier:3,...extra});
 it('the mode is offered and accepted next to Percentage',()=>{
  expect(indicatorInputSchema('vwap').find(row=>row.key==='bandMode')!.options).toEqual(['Percentage','Standard Deviation']);
  expect(indicatorVwapBandSettings(tuple()).bandMode).toBe('Standard Deviation');
  expect(()=>indicatorVwapBandSettings(tuple({bandMode:'Median'}))).toThrow();
 });
 it('volume-weighted population deviation around the anchored VWAP (the contract fixture: prices 10, 20 with volumes 1, 3)',()=>{
  // docs/reference/vwap-controls-next-contract.md:52: VWAP 10 then 17.5; volume-weighted deviation sqrt(18.75) on bar 2.
  // ((10 - 17.5)^2 x 1 + (20 - 17.5)^2 x 3) / 4 = (56.25 + 18.75) / 4 = 18.75.
  const b=[bar(0,10,10,10,10,1),bar(1,20,20,20,20,3)],inputs={source:'close',anchor:'Century',timezone:'UTC',...tuple()};
  close(values('vwap',b,inputs,'vwap'),[10,17.5]);
  close(values('vwap',b,inputs,'upper1'),[10,17.5+Math.sqrt(18.75)]);
  close(values('vwap',b,inputs,'lower2'),[10,17.5-2*Math.sqrt(18.75)]);
  expect(calculateIndicator('vwap',b,inputs).policies.join(' ')).toMatch(/volume-weighted population deviation/);
 });
 it('the deviation restarts with the anchor, and a period with no volume yet has no band',()=>{
  // Session anchor in UTC: bars 0-1 on day 0, bars 2-3 on day 1. Day 1 starts with zero volume.
  const at=(time:number,price:number,volume:number):Bar=>({time,open:price,high:price,low:price,close:price,volume});
  const b=[at(D0,10,1),at(D0+60,20,1),at(D0+86400,30,0),at(D0+86460,40,2)];
  const inputs={source:'close',anchor:'Session',timezone:'UTC',...tuple()};
  // day 0: sd bar 0 = 0, bar 1 = 5 around 15. day 1: no volume -> no VWAP and no band; then 40 alone -> sd 0.
  close(values('vwap',b,inputs,'upper1'),[10,20,null,40]);
 });
 it('the worker kernel (version 2) gives the same bands as the inline kernel',()=>{
  const rows:Bar[]=Array.from({length:40},(_,i)=>{const price=100+(i*7)%23;return {time:1700000000+i*60,open:price,high:price,low:price,close:price,volume:1+(i*5)%9};});
  const settings={kernelVersion:2,source:'close',anchor:'Century',timezone:'UTC',transform:'standard',...tuple()};
  const message=calculateVwapWorkerMessage({v:1,type:'calculate',job:'r29',rows:rows.length,settings,buffer:new Float64Array(rows.flatMap(row=>[row.time,row.open,row.high,row.low,row.close,row.volume])).buffer});
  expect(message.plotIds).toEqual(['vwap','upper1','lower1','upper2','lower2']);
  const all=Array.from(new Float64Array(message.values)),column=(k:number)=>all.slice(k*rows.length,(k+1)*rows.length);
  const inline=calculateIndicator('vwap',rows,{source:'close',anchor:'Century',timezone:'UTC',...tuple()});
  ['upper1','lower1','upper2','lower2'].forEach((id,k)=>close(column(k+1),inline.series.find(row=>row.id===id)!.values));
 });
 it('West\'s update is exact on a large-offset fixture where the naive sum of squares loses everything',()=>{
  const accumulator=createVwapDeviationAccumulator();accumulator.push(1e9+4,1,true);accumulator.push(1e9+7,1,false);accumulator.push(1e9+13,1,false);
  // values 4, 7, 13 around 8: (16 + 1 + 25) / 3 = 14.
  expect(accumulator.push(1e9+16,0,false)).toBeCloseTo(Math.sqrt(14),6);
  expect(vwapDeviationBounds(10,null,1)).toBeNull();expect(()=>vwapDeviationBounds(1e308,1e308,10)).toThrow(/overflowed/);
 });
});
