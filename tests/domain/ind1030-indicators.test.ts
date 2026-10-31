// Hand-computed oracles for Sequential 9-13 and Hull Suite. All bars are SYNTHETIC fixtures made up for these
// tests (no market data). Expected counts are worked out in the comments from the rules in the definition; the Hull values
// are checked against a direct reference computation written here, independent of the production toolkit.
import {describe,expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import {catalogDefinition,ALL_CATALOG_INDICATOR_IDS} from '../../src/domain/indicator-catalog';
import {IND1030_INDICATOR_IDS,sequentialSeries,sequentialMarkers} from '../../src/domain/indicators-ext/ind1030-catalog';
import {indicatorAlertBlock} from '../../src/domain/indicator-alertability';
import {INDICATOR_KINDS,defaultIndicatorPresentation,indicatorDefaults,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {filterIndicatorCatalog} from '../../src/ui/indicator-dialog-model';
import type {Bar} from '../../src/domain/types';

const DAY=86400,D0=19700*DAY,N=null;
/** high = close + 0.5, low = close - 0.5 unless overridden. */
const bars=(closes:readonly number[],lows:Record<number,number>={})=>closes.map((c,i):Bar=>({time:D0+i*DAY,open:c,high:c+0.5,low:lows[i]??c-0.5,close:c,volume:100}));
const calc=(kind:string,rows:readonly Bar[],inputs:Record<string,unknown>={})=>{const result=calculateIndicator(kind as never,rows,inputs as never);expect(result.diagnostics,kind).toEqual([]);return result;};
const plot=(result:ReturnType<typeof calc>,id:string)=>result.series.find(row=>row.id===id)!.values;
const near=(got:readonly (number|null)[],want:readonly (number|null)[])=>{expect(got.length).toBe(want.length);want.forEach((value,i)=>{if(value===null)expect(got[i],'index '+i).toBeNull();else expect(got[i] as number,'index '+i).toBeCloseTo(value,9);});};
const settings=(kind:string,inputs:Record<string,unknown>={}):IndicatorInstanceSettings=>({id:'a1',kind:kind as never,inputs:{...(indicatorDefaults as Record<string,Record<string,unknown>>)[kind],...inputs} as never,plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation(kind as never)});
const wave=(count:number)=>Array.from({length:count},(_,i)=>100+10*Math.sin(i/7)+4*Math.sin(i/2.1)+i*0.05);

// Rising 10..15 on bars 0-5, then nine falling closes 9..1 on bars 6-14 (each below the close four bars earlier).
const RISE=[10,11,12,13,14,15],FALL9=[9,8,7,6,5,4,3,2,1];

describe('IND-ADD-1030 catalog shape (SYNTHETIC)',()=>{
 it('both kinds are registered overlays with provenance, OpenCandle-defined unknowns, alert operands and no trademark names',()=>{
  expect([...IND1030_INDICATOR_IDS]).toEqual(['seq913','hullsuite','kdj']);
  for(const kind of IND1030_INDICATOR_IDS){
   const definition=catalogDefinition(kind)!;expect(definition,kind).toBeDefined();expect(ALL_CATALOG_INDICATOR_IDS).toContain(kind);expect(INDICATOR_KINDS).toContain(kind);
   expect(definition.overlay).toBe(kind!=='kdj');expect(definition.provenance.length).toBeGreaterThan(0);expect(definition.unknownDefaults!.join(' ')).toMatch(/OpenCandle-defined/);
   expect(indicatorAlertBlock(kind),kind).toBeNull();
   const visible=[definition.name,definition.acronym,...definition.plots.map(row=>row.label),...definition.inputs.map(row=>row.title),...definition.policies,...definition.unknownDefaults!].join(' ');
   expect(visible).not.toMatch(/—|TD Sequential|DeMark/);
  }
  expect(catalogDefinition('seq913')!.name).toBe('Sequential 9-13');expect(catalogDefinition('hullsuite')!.name).toBe('Hull Suite');
 });
 it('search keywords find Sequential 9-13 by TD, sequential and 9 count; Hull Suite by EHMA',()=>{
  const catalog=[...INDICATOR_KINDS];
  for(const query of ['TD','sequential','9 count','13 count','countdown'])expect(filterIndicatorCatalog(catalog,'All',[],query).rows,query).toContain('seq913');
  expect(filterIndicatorCatalog(catalog,'All',[],'ehma').rows).toContain('hullsuite');
  for(const query of ['KDJ','random index','stochastic'])expect(filterIndicatorCatalog(catalog,'All',[],query).rows,query).toContain('kdj');
  expect(filterIndicatorCatalog(catalog,'All',[],'hull suite').rows[0]).toBe('hullsuite');
 });
});

describe('Sequential 9-13 setup (SYNTHETIC)',()=>{
 it('a buy setup 9 forms after a price flip and the count stops at 9',()=>{
  // Bar 6: 9 < close[2]=12 and the prior bar 15 > close[1]=11 (flip): count 1. Bars 7-14 keep closing below close[i-4]: 2..9.
  const s=sequentialSeries(bars([...RISE,...FALL9,0]),4,2);
  expect(s.buySetup).toEqual([N,N,N,N,0,0,1,2,3,4,5,6,7,8,9,0]);// bar 15 still falls but needs a new flip after the 9
  expect(s.buy9.map((v,i)=>v===1?i:-1).filter(i=>i>=0)).toEqual([14]);
  expect(s.sellSetup.slice(4).every(v=>v===0)).toBe(true);// a steady rise without a flip never starts a sell setup
  expect(s.buyPerfected[14]).toBe(1);// low 8 (1.5) and low 9 (0.5) are below the lows of bars 6 and 7 (3.5, 2.5)
 });
 it('no flip, no setup: a decline from the first bar never counts',()=>{
  // Bar 5: 15 < 19 but the prior bar 16 is not above close[0]=20, and so on for every bar.
  const s=sequentialSeries(bars([20,19,18,17,16,15,14,13,12,11,10,9,8]),4,2);
  expect(s.buySetup.slice(4).every(v=>v===0)).toBe(true);expect(s.buy9.every(v=>v!==1)).toBe(true);
 });
 it('a bar that fails the comparison resets the count; the next flip restarts at 1',()=>{
  // Bars 6-10 count 1..5. Bar 11 closes 20, above close[7]=8: the buy count resets (and a sell setup starts: prior 5 < close[6]=9).
  // Bar 12 closes 4 < close[8]=7 with the prior bar 20 > close[7]=8: a new buy setup at 1.
  const s=sequentialSeries(bars([...RISE,9,8,7,6,5,20,4]),4,2);
  expect(s.buySetup.slice(6)).toEqual([1,2,3,4,5,0,1]);expect(s.sellSetup.slice(6)).toEqual([0,0,0,0,0,1,0]);
 });
 it('perfection fails when bars 8 and 9 stay above the lows of bars 6 and 7',()=>{
  const s=sequentialSeries(bars([...RISE,...FALL9],{11:-10,12:-10}),4,2);expect(s.buy9[14]).toBe(1);expect(s.buyPerfected[14]).toBe(0);
 });
 it('sell setups mirror buy setups',()=>{
  const s=sequentialSeries(bars([15,14,13,12,11,10,16,17,18,19,20,21,22,23,24]),4,2);
  expect(s.sellSetup.slice(6)).toEqual([1,2,3,4,5,6,7,8,9]);expect(s.sell9[14]).toBe(1);expect(s.buySetup.slice(4).every(v=>v===0)).toBe(true);
 });
});

describe('Sequential 9-13 countdown (SYNTHETIC)',()=>{
 it('counts 13 bars, not necessarily consecutive, from the setup bar; a second buy setup does not restart it',()=>{
  // Countdown bars close at or below the low two bars earlier (close - 0.5). Bars 14-16 count 1..3. Bar 17 (close 5) is above
  // low[15] = -0.5: no count (and starts a sell setup). Bar 18 (-2) <= low[16] = -1.5: 4, then bars 19-27 count 5..13.
  // Bar 18 also flips into a new buy setup that completes on bar 26; the running countdown is kept (no recycle).
  const closes=[...RISE,...FALL9,0,-1,5,-2,-3,-4,-5,-6,-7,-8,-9,-10,-11,-12];
  const s=sequentialSeries(bars(closes),4,2);
  expect(s.buyCountdown.slice(14)).toEqual([1,2,3,0,4,5,6,7,8,9,10,11,12,13,0]);
  expect(s.buy13.map((v,i)=>v===1?i:-1).filter(i=>i>=0)).toEqual([27]);
  expect(s.buy9.map((v,i)=>v===1?i:-1).filter(i=>i>=0)).toEqual([14,26]);
 });
 it('a completed sell setup cancels the buy countdown and starts a sell countdown',()=>{
  // Buy setup 9 on bar 14 (countdown 1: close 1 <= low[12] = 2.5). Bar 15 closes 10 > close[11] = 4 with the prior bar 1 below
  // close[10] = 5: sell setup 1; bars 15-23 (10..18) complete a sell 9 on bar 23 (18 >= high[21] = 16.5: sell countdown 1).
  // Bars 24-25 fall hard, which would count a live buy countdown; it was cancelled.
  const closes=[...RISE,...FALL9,10,11,12,13,14,15,16,17,18,0,-1];
  const s=sequentialSeries(bars(closes),4,2);
  expect(s.sell9[23]).toBe(1);expect(s.buyCountdown.slice(14)).toEqual([1,0,0,0,0,0,0,0,0,0,0,0]);
  expect(s.sellCountdown[23]).toBe(1);expect(s.sellCountdown.slice(15,23).every(v=>v===0)).toBe(true);
 });
 it('markers follow the show settings: setup numbers from 7, a perfected arrow, countdown on the other side',()=>{
  const s=sequentialSeries(bars([...RISE,...FALL9,0]),4,2);
  const all=sequentialMarkers(s,{showSetup:true,showCountdown:true,showFrom:7,perfected:true});
  const setup=all.filter(row=>row.plot==='buySetup'||row.plot==='buy9');
  expect(setup.map(row=>[row.index,row.text,row.position])).toEqual([[12,'7','below'],[13,'8','below'],[14,'9▲','below']]);
  expect(all.filter(row=>row.plot==='buyCountdown').map(row=>[row.index,row.text,row.position])).toEqual([[14,'1','above'],[15,'2','above']]);
  expect(sequentialMarkers(s,{showSetup:false,showCountdown:false,showFrom:1,perfected:true})).toEqual([]);
  expect(sequentialMarkers(s,{showSetup:true,showCountdown:false,showFrom:1,perfected:false}).find(row=>row.plot==='buy9')!.text).toBe('9');
 });
 it('replay: the calculation never reads later bars (every prefix equals the full run truncated)',()=>{
  const rows=bars(wave(220)),full=calc('seq913',rows);
  for(const cut of [17,60,133,219]){const part=calc('seq913',rows.slice(0,cut));
   for(const row of full.series)expect(plot(part,row.id),row.id+'@'+cut).toEqual(row.values.slice(0,cut));
   expect(part.marks!.markers).toEqual(full.marks!.markers.filter(m=>m.index<cut));}
  expect(full.series.find(row=>row.id==='buy9')!.values.some(v=>v===1)||full.series.find(row=>row.id==='sell9')!.values.some(v=>v===1)).toBe(true);
 });
});

// ---- Hull Suite reference arithmetic (direct, written for the test) ----
const refWma=(src:readonly (number|null)[],n:number)=>src.map((_,i)=>{if(i<n-1)return null;let s=0;for(let k=0;k<n;k++){const v=src[i-n+1+k];if(v===null)return null;s+=v*(k+1);}return s/(n*(n+1)/2);});
const refEma=(src:readonly (number|null)[],n:number)=>{let prev:number|null=null,sum=0,count=0;const a=2/(n+1);return src.map(v=>{if(v===null)return null;if(prev===null){sum+=v;count++;if(count===n)prev=sum/n;return prev;}prev=a*v+(1-a)*prev;return prev;});};
const comb=(f:(...xs:number[])=>number,...series:(number|null)[][])=>series[0].map((_,i)=>series.every(s=>s[i]!==null)?f(...series.map(s=>s[i] as number)):null);

describe('Hull Suite (SYNTHETIC)',()=>{
 const src=wave(60),rows=bars(src);
 it('HMA, EHMA and THMA equal the direct reference computation, with warm-up bars unavailable',()=>{
  const n=9,half=4,root=3;// round(sqrt 9) = 3
  const hma=refWma(comb((a,b)=>2*a-b,refWma(src,half),refWma(src,n)),root);
  near(plot(calc('hullsuite',rows,{length:n,mode:'HMA'}),'upper'),hma);expect(hma.findIndex(v=>v!==null)).toBe(10);// 9 - 1 + 3 - 1
  const ehma=refEma(comb((a,b)=>2*a-b,refEma(src,half),refEma(src,n)),root);
  near(plot(calc('hullsuite',rows,{length:n,mode:'EHMA'}),'upper'),ehma);expect(ehma.findIndex(v=>v!==null)).toBe(10);
  const thma=refWma(comb((a,b,c)=>3*a-b-c,refWma(src,3),refWma(src,half),refWma(src,n)),n);
  near(plot(calc('hullsuite',rows,{length:n,mode:'THMA'}),'upper'),thma);expect(thma.findIndex(v=>v!==null)).toBe(16);// 9 - 1 + 9 - 1
  // Length 7: round(sqrt 7) = 3 (the plain HMA built-in truncates to 2); the multiplier 1.5 with length 6 gives 9.
  near(plot(calc('hullsuite',rows,{length:7}),'upper'),refWma(comb((a,b)=>2*a-b,refWma(src,3),refWma(src,7)),3));
  near(plot(calc('hullsuite',rows,{length:6,lengthMult:1.5}),'upper'),hma);
 });
 it('the band line is the Hull two bars earlier; trend is 1 rising and -1 falling and flips the color state',()=>{
  // Rising then falling closes: the Hull rises, then turns down a few bars after the top.
  const closes=[...Array.from({length:20},(_,i)=>10+i),...Array.from({length:20},(_,i)=>29-2*i)],r=calc('hullsuite',bars(closes),{length:4});
  const hull=plot(r,'upper'),lower=plot(r,'lower'),trend=plot(r,'trend');
  hull.forEach((v,i)=>{if(i>=2)expect(lower[i]).toBe(hull[i-2]);if(v!==null&&hull[i-2]!=null)expect(trend[i]).toBe(v>(hull[i-2] as number)?1:-1);else expect(trend[i]).toBeNull();});
  expect(trend[15]).toBe(1);expect(trend[39]).toBe(-1);
  const flip=trend.findIndex((v,i)=>i>0&&v===-1&&trend[i-1]===1);expect(flip).toBeGreaterThan(20);
  const state=catalogDefinition('hullsuite')!.pointPalette!.state(id=>plot(r,id));expect(state[15]).toBe(0);expect(state[39]).toBe(1);
  expect(catalogDefinition('hullsuite')!.pointPalette!.colors).toEqual(['#4CAF50','#F23645']);
  expect(catalogDefinition('hullsuite')!.fill).toEqual({color:'#4CAF50',opacity:50});expect(catalogDefinition('hullsuite')!.bearishFill).toEqual({color:'#F23645',opacity:50});
 });
 it('show as band off removes the second line; color by trend off leaves the trend state unavailable',()=>{
  const r=calc('hullsuite',rows,{showBand:false,colorByTrend:false,length:9});
  expect(plot(r,'lower').every(v=>v===null)).toBe(true);expect(plot(r,'trend').every(v=>v===null)).toBe(true);
  expect(plot(r,'upper').some(v=>v!==null)).toBe(true);
 });
 it('replay: every prefix equals the full run truncated',()=>{
  const full=calc('hullsuite',rows,{length:9,mode:'EHMA'});
  for(const cut of [5,12,31,59]){const part=calc('hullsuite',rows.slice(0,cut),{length:9,mode:'EHMA'});for(const row of full.series)near(plot(part,row.id),row.values.slice(0,cut));}
 });
});

describe('IND-ADD-1030 presentation (SYNTHETIC)',()=>{
 it('Sequential draws its numbers as labels; Hull Suite draws a two-color band and trend-colored points',()=>{
  const seqBars=bars([...RISE,...FALL9,0]),seq=renderIndicatorPresentation(settings('seq913'),calc('seq913',seqBars),seqBars,{resolution:'1D'});
  expect(seq.diagnostics).toEqual([]);expect(seq.output.labels!.map(row=>row.text)).toEqual(['1','2','3','4','5','6','7','8','9▲','1','2']);
  const closes=[...Array.from({length:20},(_,i)=>10+i),...Array.from({length:20},(_,i)=>29-2*i)],hullBars=bars(closes),result=calc('hullsuite',hullBars,{length:4});
  const hull=renderIndicatorPresentation(settings('hullsuite',{length:4}),result,hullBars,{resolution:'1D'});
  expect(hull.diagnostics).toEqual([]);expect(hull.output.fills!.length).toBe(1);const colors=hull.output.fills![0].colors!;
  expect(colors[15]).toMatch(/76, ?175, ?80|4caf50/i);expect(colors[38]).toMatch(/242, ?54, ?69|f23645/i);
  const line=hull.output.series!.find(row=>row.title==='Hull') as {points:{color?:string}[]};expect(line.points[15].color).toMatch(/76, ?175, ?80|4caf50/i);expect(line.points[39].color).toMatch(/242, ?54, ?69|f23645/i);
  // Turning trend colors off on the same instance redraws the line in its own color (no reused, recolored points).
  const plain=renderIndicatorPresentation(settings('hullsuite',{length:4,colorByTrend:false}),calc('hullsuite',hullBars,{length:4,colorByTrend:false}),hullBars,{resolution:'1D'});
  expect((plain.output.series!.find(row=>row.title==='Hull') as {points:{color?:string}[]}).points.every(point=>point.color===undefined)).toBe(true);
 });
});

describe('KDJ (SYNTHETIC)',()=>{
 const hlc=(rows:readonly [number,number,number][]):Bar[]=>rows.map(([h,l,c],i)=>({time:D0+i*DAY,open:c,high:h,low:l,close:c,volume:100}));
 it('hand-computed K, D and J from the 50 seed (period 2, smoothing 3/3), with a zero-range bar carrying the previous RSV',()=>{
  // i=1: window high 12, low 8, RSV = 100 x 3/4 = 75; K = (2 x 50 + 75)/3 = 58.3333; D = (2 x 50 + K)/3 = 52.7778; J = 3K - 2D = 69.4444.
  // i=2: high 12, low 9, RSV = 33.3333; K = (2 x 58.3333 + 33.3333)/3 = 50; D = (2 x 52.7778 + 50)/3 = 51.8519; J = 46.2963.
  // i=3: high 11, low 10, RSV = 0; K = 33.3333; D = 45.6790; J = 8.6420. i=4: zero range, RSV carries 0: K = 22.2222; D = 37.8601; J = -8.6420.
  const r=calc('kdj',hlc([[10,8,9],[12,9,11],[11,10,10],[10,10,10],[10,10,10]]),{period:2});
  const k1=175/3,d1=(100+k1)/3,k2=50,d2=(2*d1+k2)/3,k3=100/3,d3=(2*d2+k3)/3,k4=200/9,d4=(2*d3+k4)/3;
  near(plot(r,'k'),[N,k1,k2,k3,k4]);near(plot(r,'d'),[N,d1,d2,d3,d4]);near(plot(r,'j'),[N,3*k1-2*d1,3*k2-2*d2,3*k3-2*d3,3*k4-2*d4]);
  expect(plot(r,'j')[4]!).toBeLessThan(0);// J is not clipped to 0..100
 });
 it('a zero range before any RSV reads 50, so a flat series stays at the seed; warm-up bars are unavailable',()=>{
  const r=calc('kdj',hlc(Array.from({length:12},()=>[5,5,5] as [number,number,number])));
  near(plot(r,'k'),[N,N,N,N,N,N,N,N,50,50,50,50]);near(plot(r,'j'),[N,N,N,N,N,N,N,N,50,50,50,50]);
  const g=catalogDefinition('kdj')!.guides!;expect(g.map(row=>row.value)).toEqual([80,20]);
 });
 it('replay: every prefix equals the full run truncated',()=>{
  const rows=bars(wave(80)),full=calc('kdj',rows);
  for(const cut of [3,9,40,79]){const part=calc('kdj',rows.slice(0,cut));for(const row of full.series)near(plot(part,row.id),row.values.slice(0,cut));}
 });
});
