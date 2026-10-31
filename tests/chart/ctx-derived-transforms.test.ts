// Synthetic fixtures only (labelled synthetic). Hand-computed expectations for the LV derived transforms.
import {describe,it,expect} from 'vitest';
import type {Bar} from '../../src/domain/types';
import {lastAtr,resolveStep,ohlcPath} from '../../src/chart/derived/common';
import {renko} from '../../src/chart/derived/renko';
import {kagi} from '../../src/chart/derived/kagi';
import {pointFigure} from '../../src/chart/derived/pointfigure';
import {lineBreak} from '../../src/chart/derived/linebreak';
import {rangeBars} from '../../src/chart/derived/range';
import {computeDerived} from '../../src/chart/derived';

const closes=(values:number[]):Bar[]=>values.map((close,index)=>({time:1000+index*60,open:close,high:close,low:close,close,volume:1}));
const ohlc=(rows:[number,number,number,number][]):Bar[]=>rows.map(([open,high,low,close],index)=>({time:1000+index*60,open,high,low,close,volume:1}));
const body=(rows:{open:number;close:number;high:number;low:number;direction:string;span:[number,number];time:number}[])=>rows.map(({open,close,high,low,direction,span,time})=>({open,close,high,low,direction,span,time}));
function ok<T extends {ok:boolean}>(result:T){if(!result.ok)throw Error(JSON.stringify(result));return (result as unknown as {value:import('../../src/chart/derived/common').DerivedSeries}).value;}

describe('synthetic ATR and step resolution',()=>{
  it('ATR is Wilder RMA of true range seeded by the simple mean; first true range is high minus low',()=>{
    const bars=ohlc([[10,11,9,10],[10,12,10,11],[11,11,8,9],[9,10,9,10]]);
    // TR = 2, max(2,|12-10|,|10-10|)=2, max(3,|11-11|,|8-11|)=3, max(1,|10-9|,|9-9|)=1. Seed(3)=(2+2+3)/3=7/3; next=(7/3*2+1)/3=17/9.
    expect(lastAtr(bars,3)).toBeCloseTo(17/9,12);
    expect(lastAtr(bars,5)).toBeNull();
  });
  it('step methods: Traditional fixed, Percentage of last close, ATR, and structured unavailable states',()=>{
    const bars=closes([100,200]);
    expect(resolveStep('renko',bars,'Traditional',{atrLength:14,fixed:3,percentage:1})).toEqual({ok:true,value:3});
    expect(resolveStep('renko',bars,'Percentage',{atrLength:14,fixed:3,percentage:1})).toEqual({ok:true,value:2});
    expect(resolveStep('renko',bars,'ATR',{atrLength:14,fixed:3,percentage:1})).toMatchObject({ok:false,diagnostic:{code:'DERIVED_ATR_UNAVAILABLE',severity:'unavailable'}});
    expect(resolveStep('renko',[],'Traditional',{atrLength:14,fixed:3,percentage:1})).toMatchObject({ok:false,diagnostic:{code:'DERIVED_INPUT_EMPTY'}});
    expect(resolveStep('renko',bars,'Traditional',{atrLength:14,fixed:0,percentage:1})).toMatchObject({ok:false,diagnostic:{code:'DERIVED_STEP_UNAVAILABLE'}});
  });
  it('OHLC path approximation: rising O-L-H-C, falling O-H-L-C',()=>{
    expect(ohlcPath({time:0,open:1,high:3,low:0,close:2,volume:0})).toEqual([1,0,3,2]);
    expect(ohlcPath({time:0,open:2,high:3,low:0,close:1,volume:0})).toEqual([2,3,0,1]);
  });
});

describe('synthetic Renko',()=>{
  const bars=closes([10,11,12.5,15,13,11.9,9.5]);
  const settings={boxMethod:'Traditional',boxSize:2,atrLength:14,percentage:1,source:'close',wicks:true};
  it('bricks, two-box reversal, wicks and projection (hand computed)',()=>{
    const value=ok(renko(bars,settings));
    expect(value.step).toBe(2);expect(value.construction).toBe('source-close');
    expect(body(value.confirmed)).toEqual([
      {open:10,close:12,high:12,low:10,direction:'up',span:[0,2],time:1120},
      {open:12,close:14,high:14,low:12,direction:'up',span:[2,3],time:1180},
      {open:12,close:10,high:15,low:10,direction:'down',span:[3,6],time:1360},
    ]);
    expect(body(value.projection)).toEqual([{open:10,close:9.5,high:10,low:9.5,direction:'down',span:[6,6],time:1360}]);
    expect(value.projection[0].projection).toBe(true);expect(value.confirmed.every(bar=>!bar.projection&&Number.isNaN(bar.volume))).toBe(true);
  });
  it('wicks off keeps bodies only; one source event can build several distinct bricks',()=>{
    const value=ok(renko(bars,{...settings,wicks:false}));
    expect(value.confirmed[2]).toMatchObject({high:12,low:10});
    const jump=ok(renko(closes([10,16.5]),settings));
    expect(body(jump.confirmed).map(row=>[row.open,row.close,row.span])).toEqual([[10,12,[0,1]],[12,14,[1,1]],[14,16,[1,1]]]);
    expect(jump.transformId).toMatch(/^renko:/);
  });
  it('OHLC source uses the declared intrabar path approximation',()=>{
    const value=ok(renko(ohlc([[10,10,10,10],[10,13,9,12]]),{...settings,source:'ohlc'}));
    // Bar 1 rising path 10,9,13,12: 13 builds 10->12; reversal needs <=8.
    expect(value.construction).toBe('ohlc-path-approximation');
    expect(body(value.confirmed)).toEqual([{open:10,close:12,high:12,low:9,direction:'up',span:[0,1],time:1060}]);
  });
});

describe('synthetic Kagi',()=>{
  it('reversal segments with yang/yin switches at shoulders and waists (hand computed)',()=>{
    const value=ok(kagi(closes([10,11,13,12,10.5,9,10,11.5,14]),{reversalMethod:'Traditional',reversalAmount:2,atrLength:14,percentage:1}));
    expect(value.confirmed.map(bar=>[bar.open,bar.close,bar.direction,bar.span,bar.yangStart,bar.yangEnd,bar.switchPrice])).toEqual([
      [10,13,'up',[0,2],true,true,null],
      [13,9,'down',[2,5],true,false,10],
    ]);
    expect(value.projection.map(bar=>[bar.open,bar.close,bar.direction,bar.span,bar.yangStart,bar.yangEnd,bar.switchPrice,bar.projection])).toEqual([[9,14,'up',[5,8],false,true,13,true]]);
  });
  it('source close is the default; highlow walks the OHLC path (synthetic: flat closes, a 3-point spike)',()=>{
    const bars=ohlc([[10,10,10,10],[10,13,10,10]]),base={reversalMethod:'Traditional',reversalAmount:2,atrLength:14,percentage:1};
    const close=ok(kagi(bars,base));
    expect([close.confirmed.length,close.projection.length,close.construction]).toEqual([0,0,'source-close']);
    expect(ok(kagi(bars,{...base,source:'close'})).transformId).toBe(close.transformId);
    const high=ok(kagi(bars,{...base,source:'highlow'}));
    expect(high.construction).toBe('high-low-approximation');
    expect(high.confirmed.map(bar=>[bar.open,bar.close,bar.direction,bar.span])).toEqual([[10,13,'up',[0,1]]]);
    expect(high.transformId).not.toBe(close.transformId);
    expect(kagi(bars,{...base,source:'bogus'}).ok).toBe(false);
  });
});

describe('synthetic Point and figure',()=>{
  const settings={boxMethod:'Traditional',boxSize:1,reversalAmount:3,atrLength:14,percentage:1,source:'close'};
  it('X/O columns with three-box reversal on a zero-anchored box grid (hand computed)',()=>{
    const value=ok(pointFigure(closes([10.2,11.5,12.9,13.1,11,10,9.9,12,13.5]),settings));
    // One box-row grid, so the O column (boxes 12..10) is one row below the X column (boxes 11..13): rows [9,12].
    expect(value.confirmed.map(bar=>[bar.direction,bar.open,bar.close,bar.boxes,bar.span])).toEqual([['up',10,13,3,[0,3]],['down',12,9,3,[3,5]]]);
    expect(value.projection.map(bar=>[bar.direction,bar.open,bar.close,bar.boxes,bar.span])).toEqual([['up',10,13,3,[5,8]]]);
  });
  it('high/low source checks the trend side first',()=>{
    // X column 10->13 from highs; bar 2 high 13.2 (no extension) low 9.9 -> ceil 10 <= 13-3: reversal.
    const value=ok(pointFigure(ohlc([[10.2,10.2,10.2,10.2],[12,13.4,11,13],[12,13.2,9.9,10]]),{...settings,source:'highlow'}));
    expect(value.construction).toBe('high-low-approximation');
    expect(value.confirmed.map(bar=>[bar.direction,bar.open,bar.close])).toEqual([['up',10,13]]);
    expect(value.projection.map(bar=>[bar.direction,bar.open,bar.close])).toEqual([['down',12,9]]);
  });
});

describe('synthetic Line break',()=>{
  it('three-line break continuation and reversals (hand computed)',()=>{
    const value=ok(lineBreak(closes([10,11,12,11.5,13,9.5,10.9,9,14]),{lines:3}));
    expect(value.confirmed.map(bar=>[bar.open,bar.close,bar.direction,bar.span])).toEqual([
      [10,11,'up',[0,1]],[11,12,'up',[2,2]],[12,13,'up',[3,4]],[12,9.5,'down',[5,5]],[9.5,9,'down',[6,7]],[9.5,14,'up',[8,8]],
    ]);
    expect(value.projection).toEqual([]);
  });
  it('lastBarOpen moves bars completed by the last source bar into projection',()=>{
    const value=ok(computeDerived('linebreak',closes([10,11,12,11.5,13,9.5,10.9,9,14]),{lines:3},{lastBarOpen:true}));
    expect(value.confirmed).toHaveLength(5);expect(value.projection.map(bar=>[bar.open,bar.close,bar.projection])).toEqual([[9.5,14,true]]);
  });
});

describe('synthetic Range',()=>{
  const bars=ohlc([[10,11,9.5,10.5],[13,13.5,12.5,12.6]]);
  it('requires an explicit instrument tick size',()=>{
    expect(rangeBars(bars,{range:4,phantomBars:false},{})).toMatchObject({ok:false,diagnostic:{code:'DERIVED_TICK_SIZE_UNAVAILABLE'}});
  });
  it('phantom bars off: a gap closes the forming bar at its last price (hand computed)',()=>{
    const value=ok(rangeBars(bars,{range:4,phantomBars:false},{tickSize:0.5}));
    expect(value.step).toBe(2);
    // Confirmed by the gap at bar 1's open: stamped with bar 1's time, never earlier (no lookahead).
    expect(body(value.confirmed)).toEqual([{open:10,close:10.5,high:11,low:9.5,direction:'up',span:[0,0],time:1060}]);
    expect(value.confirmed[0].confirmedAt).toBe(1);
    expect(body(value.projection)).toEqual([{open:13,close:12.6,high:13.5,low:12.5,direction:'down',span:[1,1],time:1060}]);
  });
  it('phantom bars on: the gap is filled and bars completed inside it are phantom (hand computed)',()=>{
    const value=ok(rangeBars(bars,{range:4,phantomBars:true},{tickSize:0.5}));
    expect(value.confirmed.map(bar=>[bar.open,bar.high,bar.low,bar.close,bar.phantom,bar.span])).toEqual([[10,11.5,9.5,11.5,true,[0,1]],[11.5,13.5,11.5,13.5,false,[1,1]]]);
    expect(value.projection.map(bar=>[bar.open,bar.high,bar.low,bar.close])).toEqual([[13.5,13.5,12.5,12.6]]);
  });
});

describe('synthetic dispatcher',()=>{
  it('rejects invalid source bars and unknown styles with structured diagnostics',()=>{
    expect(computeDerived('renko',[{time:1,open:1,high:0,low:1,close:1,volume:0}],{boxMethod:'Traditional',boxSize:1,atrLength:14,percentage:1,source:'close',wicks:true})).toMatchObject({ok:false,diagnostic:{code:'DERIVED_INPUT_INVALID'}});
    expect(computeDerived('candles' as never,closes([1]),{})).toMatchObject({ok:false,diagnostic:{code:'DERIVED_STYLE_UNKNOWN'}});
  });
  it('is deterministic and does not mutate its input',()=>{
    const bars=closes([10,11,12.5,15,13,11.9,9.5]),before=structuredClone(bars),settings={boxMethod:'Traditional',boxSize:2,atrLength:14,percentage:1,source:'close',wicks:true};
    expect(computeDerived('renko',bars,settings)).toEqual(computeDerived('renko',bars,settings));expect(bars).toEqual(before);
  });
});

describe('synthetic confirmation timing and forming last bar (review CTX-1, CTX-2)',()=>{
  const kagiSettings={reversalMethod:'Traditional',reversalAmount:1,atrLength:14,percentage:1};
  const pnfSettings={boxMethod:'Traditional',boxSize:1,reversalAmount:3,atrLength:14,percentage:1,source:'close'};
  it('Kagi: a segment confirmed only by the forming bar is not confirmed',()=>{
    const bars=closes([10,12,13,11.5]);
    expect(ok(computeDerived('kagi',bars,kagiSettings,{lastBarOpen:true})).confirmed).toHaveLength(0);
    const closed=ok(computeDerived('kagi',bars,kagiSettings));
    // Extreme at bar 2 (t=1120); the reversal that confirms it happens at bar 3 (t=1180).
    expect(closed.confirmed.map(bar=>[bar.open,bar.close,bar.span,bar.confirmedAt,bar.time])).toEqual([[10,13,[0,2],3,1180]]);
    expect(closed.projection.map(bar=>bar.time)).toEqual([1180]);
  });
  it('Point and figure: a column confirmed only by the forming bar is not confirmed; time is the reversal bar',()=>{
    const bars=closes([10.2,11.5,12.9,13.1,11,10]);
    expect(ok(computeDerived('pointfigure',bars,pnfSettings,{lastBarOpen:true})).confirmed).toHaveLength(0);
    const closed=ok(computeDerived('pointfigure',bars,pnfSettings));
    expect(closed.confirmed.map(bar=>[bar.span,bar.confirmedAt,bar.time])).toEqual([[[0,3],5,1300]]);
    expect(closed.projection.map(bar=>bar.time)).toEqual([1300]);
  });
  it('Renko, Line break and Range: confirmation is the completing bar, and forming-bar confirmations move to projection',()=>{
    const renkoSettings={boxMethod:'Traditional',boxSize:2,atrLength:14,percentage:1,source:'close',wicks:true};
    expect(ok(computeDerived('renko',closes([10,16.5]),renkoSettings,{lastBarOpen:true})).confirmed).toHaveLength(0);
    expect(ok(computeDerived('renko',closes([10,16.5]),renkoSettings)).confirmed.every(bar=>bar.confirmedAt===1&&bar.time===1060)).toBe(true);
    expect(ok(computeDerived('linebreak',closes([10,11,12]),{lines:3},{lastBarOpen:true})).confirmed.map(bar=>bar.confirmedAt)).toEqual([1]);
    const gap=ohlc([[10,11,9.5,10.5],[13,13.5,12.5,12.6]]);
    expect(ok(computeDerived('range',gap,{range:4,phantomBars:false},{tickSize:0.5,lastBarOpen:true})).confirmed).toHaveLength(0);
  });
});
