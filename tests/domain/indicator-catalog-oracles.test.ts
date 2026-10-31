import {expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import {CATALOG_INDICATORS} from '../../src/domain/indicator-catalog';

// L1 phase 2: literal oracles for the extended built-ins. Every expected value below was computed by hand from the
// cited formula (see src/domain/indicator-catalog.ts provenance), independent of the production arithmetic.
type Row=[number,number,number,number,number?];// high, low, close, volume, open
const bars=(rows:Row[])=>rows.map(([high,low,close,volume,open],i)=>({time:1704067200+i*86400,open:open??close,high,low,close,volume}));
const flat=(closes:number[])=>bars(closes.map(close=>[close,close,close,100] as Row));
const series=(kind:string,data:ReturnType<typeof bars>,inputs:Record<string,unknown>,plot:string)=>{const result=calculateIndicator(kind,data,inputs);expect(result.diagnostics).toEqual([]);return result.series.find(row=>row.id===plot)!.values;};
const near=(actual:(number|null)[],expected:(number|null)[])=>{expect(actual.map(value=>value===null)).toEqual(expected.map(value=>value===null));actual.forEach((value,i)=>{if(value!==null)expect(value).toBeCloseTo(expected[i]!,10);});};
const C=flat([10,12,11,13,16]);
// Bars B: H/L/C/V. True range (first = H-L): [2,3,2,5,4]
const B=bars([[10,8,9,100],[12,9,11,200],[11,9,10,150],[15,11,14,300],[16,12,13,250]]);

it('MOM / ROC: difference and percent change versus Length bars earlier',()=>{
 near(series('mom',C,{length:2,source:'close'},'mom'),[null,null,1,1,5]);// 11-10, 13-12, 16-11
 near(series('roc',C,{length:2,source:'close'},'roc'),[null,null,10,100/12,500/11]);// (11-10)/10, (13-12)/12, (16-11)/11, x100
 near(series('roc',flat([0,1,2]),{length:1,source:'close'},'roc'),[null,null,100]);// zero base is unavailable
});
it('WMA / SMMA / HMA / LSMA moving averages',()=>{
 near(series('wma',C,{length:3,source:'close'},'wma'),[null,null,67/6,73/6,85/6]);// (1x10+2x12+3x11)/6 ...
 near(series('smma',C,{length:3,source:'close'},'smma'),[null,null,11,35/3,118/9]);// SMA seed 11, then (2x11+13)/3, (2x35/3+16)/3
 near(series('hma',C,{length:4,source:'close'},'hma'),[null,null,null,null,1361/90]);// WMA2 i3=37/3,i4=15; WMA4 i3=11.9,i4=13.7; raw 383/30,163/10; WMA2 of raw
 near(series('lsma',C,{length:3,regressionOffset:0,source:'close'},'lsma'),[null,null,11.5,12.5,95/6]);// least-squares line at x=2
 near(series('lsma',C,{length:3,regressionOffset:1,source:'close'},'lsma'),[null,null,11,12,40/3]);// same line at x=1
});
it('ENV / DC / KC channels',()=>{
 near(series('env',C,{length:3,upperPercent:10,lowerPercent:10,source:'close',exponential:false},'upper'),[null,null,12.1,13.2,44/3]);// SMA3 11,12,40/3 x1.1
 near(series('env',C,{length:3,upperPercent:10,lowerPercent:10,source:'close',exponential:false},'lower'),[null,null,9.9,10.8,12]);// x0.9
 near(series('dc',B,{length:3},'upper'),[null,null,12,15,16]);near(series('dc',B,{length:3},'lower'),[null,null,8,9,9]);near(series('dc',B,{length:3},'basis'),[null,null,10,12,12.5]);
 const kc=(trueRange:boolean,plot:string)=>series('kc',B,{length:2,multiplier:1,source:'close',exponential:false,trueRange},plot);
 near(kc(true,'basis'),[null,10,10.5,12,13.5]);near(kc(true,'upper'),[null,12.5,13,15.5,18]);near(kc(true,'lower'),[null,7.5,8,8.5,9]);// SMA2 of TR [2,3,2,5,4] = 2.5,2.5,3.5,4.5
 near(kc(false,'upper'),[null,12.5,13,15,17.5]);// SMA2 of high-low [2,3,2,4,4] = 2.5,2.5,3,4
});
it('CCI / Williams %R / Aroon / Awesome Oscillator',()=>{
 near(series('cci',C,{length:3,source:'close'},'cci'),[null,null,0,100,100]);// (13-12)/(0.015x2/3); (16-40/3)/(0.015x16/9)
 near(series('willr',B,{length:3,source:'close'},'r'),[null,null,-50,-100/6,-300/7]);// (12-10)/4, (15-14)/6, (16-13)/7, x-100
 near(series('aroon',B,{length:2},'up'),[null,null,50,100,100]);near(series('aroon',B,{length:2},'down'),[null,null,0,50,0]);// ties use the most recent low
 near(series('ao',B,{fast:2,slow:3},'histogram'),[null,null,1.25/3,1/3,3.5/3]);// SMA2(hl2) - SMA3(hl2), hl2 = 9,10.5,10,13,14
});
it('MFI / CMF volume indicators',()=>{
 near(series('mfi',B,{length:2},'mfi'),[null,null,6400/109,800/11,100]);// TP 9,32/3,10,40/3,41/3; flows +6400/3,-1500,+4000,+10250/3
 near(series('cmf',B,{length:2},'cmf'),[null,2/9,4/21,1/3,1/22]);// money flow volume 0,200/3,0,150,-125
 expect(calculateIndicator('mfi',B.map(bar=>({...bar,volume:NaN})),{length:2}).diagnostics[0]).toMatch(/volume/);
});
it('DMI / ADX with Wilder smoothing',()=>{
 // +DM 2,0,2,0,2; -DM 0,2,0,2,0; TR 3,4,5,6,7 (from the second bar)
 const D=bars([[10,8,9,1],[12,9,11,1],[11,7,8,1],[13,8,12,1],[12,6,7,1],[14,9,13,1]]),inputs={adxSmoothing:2,diLength:2};
 near(series('dmi',D,inputs,'plusDI'),[null,null,200/7,600/17,600/41,2200/97]);
 near(series('dmi',D,inputs,'minusDI'),[null,null,200/7,200/17,1000/41,1000/97]);
 near(series('dmi',D,inputs,'adx'),[null,null,null,25,25,31.25]);// DX 0,50,25,37.5
 near(series('adx',D,inputs,'adx'),[null,null,null,25,25,31.25]);
});
it('Parabolic SAR: initial direction, AF growth, clamping and reversal',()=>{
 const P=bars([[10,9,9.5,1],[11,10,10.5,1],[12,11,11.5,1],[13,12,12.5,1],[12.5,8,8.5,1],[9,7,7.5,1],[8,6.5,7,1]]);
 near(series('psar',P,{start:0.02,increment:0.02,maximum:0.2},'sar'),[null,9,9,9.12,13,13,12.76]);
});
it('Supertrend: final bands, trend rules and split up/down plots',()=>{
 const inputs={atrLength:2,factor:1};// Wilder ATR2 = 2.5, 2.25, 3.625, 3.8125
 near(series('supertrend',B,inputs,'upTrend'),[null,null,null,9.375,10.1875]);
 near(series('supertrend',B,inputs,'downTrend'),[null,13,12.25,null,null]);
});
it('Stochastic RSI scaled to 0-100',()=>{
 const S=flat([10,12,11,13,16,15]);// RSI2 = 200/3, 600/7, 1800/19, 200/3
 near(series('stochrsi',S,{smoothK:1,smoothD:2,rsiLength:2,stochLength:2,source:'close'},'k'),[null,null,null,100,100,0]);
 near(series('stochrsi',S,{smoothK:1,smoothD:2,rsiLength:2,stochLength:2,source:'close'},'d'),[null,null,null,null,100,50]);
});
it('every extended built-in has a cited source and documented-or-flagged defaults',()=>{
 for(const definition of CATALOG_INDICATORS){expect(definition.provenance.length).toBeGreaterThan(0);for(const row of definition.provenance)expect(row.url).toMatch(/^(public-indicator-definition:|builtin-defaults:|indicator-list:|drawing-defaults:fixed-range-volume-profile|lv-defined:)/);/* The profile kinds cite the fixed-range volume profile study fact */expect(definition.plots.length).toBeGreaterThan(0);}
 expect(CATALOG_INDICATORS.find(row=>row.id==='supertrend')!.unknownDefaults!.join(' ')).toMatch(/placeholders/);
});
