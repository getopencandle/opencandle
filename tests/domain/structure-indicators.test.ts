// Hand-computed oracles for Support and resistance zones, Adaptive trend channel, Auto fib multi-scale, Auto fib range
// volume profile and the Lookback window mode of Auto fib retracement. All bars are SYNTHETIC fixtures made up for these
// tests (no market data); expected values are worked out in the comments from the rules in the definitions, and the channel
// is checked against a direct least-squares computation written here, independent of the prefix-sum kernel.
import {describe,expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import {catalogDefinition,ALL_CATALOG_INDICATOR_IDS} from '../../src/domain/indicator-catalog';
import {STRUCTURE_INDICATOR_IDS,srZones,srZoneBoxes,adaptiveChannel,adaptiveChannelLines} from '../../src/domain/indicators-ext/structure-catalog';
import {lookbackFibSwing,rollingFibSwings} from '../../src/domain/indicators-ext/fib-swing';
import {indicatorAlertBlock} from '../../src/domain/indicator-alertability';
import {isProfileIndicator,selectorCategoryOf} from '../../src/domain/indicator-selector-catalog';
import {INDICATOR_KINDS,defaultIndicatorPresentation,indicatorDefaults,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {scaleDrawingSet} from '../../src/chart/indicator-pattern-layout';
import {filterIndicatorCatalog} from '../../src/ui/indicator-dialog-model';
import type {Bar} from '../../src/domain/types';

const DAY=86400,D0=19700*DAY,N=null;
const ohlc=(rows:readonly (readonly [number,number,number,number])[]):Bar[]=>rows.map(([open,high,low,close],i)=>({time:D0+i*DAY,open,high,low,close,volume:100+i}));
/** high as given, low = high - 2, open = close = high - 1. */
const fromHighs=(highs:readonly number[])=>ohlc(highs.map(h=>[h-1,h,h-2,h-1] as const));
const calc=(kind:string,rows:readonly Bar[],inputs:Record<string,unknown>={})=>{const result=calculateIndicator(kind as never,rows,inputs as never);expect(result.diagnostics,kind).toEqual([]);return result;};
const plot=(result:ReturnType<typeof calc>,id:string)=>result.series.find(row=>row.id===id)!.values;
const settings=(kind:string,inputs:Record<string,unknown>={}):IndicatorInstanceSettings=>({id:'a1',kind:kind as never,inputs:{...(indicatorDefaults as Record<string,Record<string,unknown>>)[kind],...inputs} as never,plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation(kind as never)});
const wave=(count:number)=>Array.from({length:count},(_,i)=>100+10*Math.sin(i/9)+4*Math.sin(i/2.3)+i*0.08);
const waveBars=(count:number)=>ohlc(wave(count).map((c,i)=>[c-0.3*Math.sin(i),c+1+0.5*Math.cos(i/3),c-1-0.4*Math.sin(i/5),c] as const));

describe('market structure catalog shape (SYNTHETIC)',()=>{
 it('the four kinds are registered with provenance, OpenCandle-defined rules, alert operands and clean visible text',()=>{
  expect([...STRUCTURE_INDICATOR_IDS]).toEqual(['srzones','adaptivechannel','autofibmulti','autofibvp']);
  for(const kind of STRUCTURE_INDICATOR_IDS){
   const definition=catalogDefinition(kind)!;expect(definition,kind).toBeDefined();expect(ALL_CATALOG_INDICATOR_IDS).toContain(kind);expect(INDICATOR_KINDS).toContain(kind);
   expect(definition.overlay).toBe(true);expect(definition.provenance.length).toBeGreaterThan(0);expect(definition.unknownDefaults!.join(' ')).toMatch(/OpenCandle-defined/);
   expect(indicatorAlertBlock(kind,{}),kind).toBeNull();
   const visible=[definition.name,definition.acronym,...definition.plots.map(row=>row.label),...definition.inputs.map(row=>row.title),...definition.policies,...definition.unknownDefaults!].join(' ');
   expect(visible).not.toMatch(/—|TradingView/);
  }
  expect(isProfileIndicator('autofibvp')).toBe(true);expect(selectorCategoryOf({id:'autofibvp'})).toBe('profiles');
  for(const kind of ['srzones','adaptivechannel','autofibmulti'])expect(selectorCategoryOf({id:kind})).toBe('indicators');
  expect(isProfileIndicator('aavp')).toBe(true);// the existing profiles stay listed
 });
 it('search finds each kind by its keywords',()=>{
  const catalog=[...INDICATOR_KINDS];
  for(const [query,kind] of [['support','srzones'],['resistance','srzones'],['pearson','adaptivechannel'],['regression channel','adaptivechannel'],['multi-scale','autofibmulti'],['fib volume profile','autofibvp']] as const)
   expect(filterIndicatorCatalog(catalog,'All',[],query).rows,query).toContain(kind);
 });
});

describe('Support and resistance zones (SYNTHETIC)',()=>{
 // Pivot high at bar 3 (15 above 11, 12 | 12, 11), pivot low at bar 6 (low 8 below 9, 10 | 9, 10), pivot high at bar 9 (15.6).
 // left = right = 2, constant ATR 2 and width 0.25: half-height 0.5.
 const highs=[10,11,12,15,12,11,10,11,12,15.6,12,11,10,9],bars=fromHighs(highs),atr=bars.map(()=>2);
 it('zones appear on the confirming bar, merge on overlap and report the nearest support and resistance',()=>{
  const r=srZones(bars,atr,{left:2,right:2,mode:'ATR',width:0.25,maxZones:8});
  // Zone A [14.5, 15.5] confirmed at bar 5 (close 10 below: resistance); zone L [7.5, 8.5] at bar 8 (close 11 above: support).
  // Bar 9 enters A (touch 2). Zone B [15.1, 16.1] at bar 11 overlaps A: merged [14.5, 16.1] with 3 touches, not a new zone.
  expect(r.zone).toEqual([0,0,0,0,0,1,0,0,1,0,0,0,0,0]);expect(r.broken.every(v=>v===0)).toBe(true);
  expect(r.resistance).toEqual([N,N,N,N,N,14.5,14.5,14.5,14.5,14.5,14.5,14.5,14.5,14.5]);
  expect(r.support).toEqual([N,N,N,N,N,N,N,N,8.5,8.5,8.5,8.5,8.5,8.5]);
  expect(r.active.map(z=>[z.bottom,z.top,z.from,z.touches])).toEqual([[14.5,16.1,3,3],[7.5,8.5,6,2]]);// bar 12 enters L (touch 2); bar 13 stays inside
 });
 it('ranking by touches limits the shown zones (later confirmed first on a tie)',()=>{
  const r=srZones(bars,atr,{left:2,right:2,mode:'ATR',width:0.25,maxZones:1});
  expect(r.resistance[5]).toBe(14.5);// only A exists
  expect([r.support[8],r.resistance[8]]).toEqual([8.5,N]);// A and L tie at 1 touch: L is newer
  expect([r.support[9],r.resistance[9]]).toEqual([N,14.5]);// bar 9 touches A (2 touches)
  expect([r.support[13],r.resistance[13]]).toEqual([N,14.5]);// merged A (3) over L (2)
 });
 it('a close beyond the far side breaks a zone; broken zones stop and are drawn faded, open ones extend right',()=>{
  const more=fromHighs([...highs,7]);// bar 14: close 6 below L's bottom 7.5
  const r=srZones(more,more.map(()=>2),{left:2,right:2,mode:'ATR',width:0.25,maxZones:8});
  expect(r.broken[14]).toBe(1);expect(r.support[14]).toBeNull();expect(r.resistance[14]).toBe(14.5);
  expect(srZoneBoxes(r,8,true)).toEqual([
   {plot:'broken',from:{index:6,price:8.5},to:{index:14,price:7.5}},
   {plot:'zone',from:{index:3,price:16.1},to:{index:11,price:14.5},extendRight:true}]);
  expect(srZoneBoxes(r,8,false).map(box=>box.plot)).toEqual(['zone']);
 });
 it('wick to body zones span the pivot wick; a close above resistance breaks it (catalog kind)',()=>{
  const rows=ohlc([[10,11,9,10],[10,12,9.5,11],[11,13,10,12],[12,15,11,13],[13,14,11,12],[12,13,10,11],[11,12,9,10],[14,17,14,16]]);
  // Pivot high at bar 3 (left = right = 2): wick 13..15, confirmed at bar 5 (close 11 below: resistance 13). Bar 7 closes 16 > 15.
  const result=calc('srzones',rows,{left:2,right:2,zoneMode:'Wick to body'});
  expect(plot(result,'resistance')).toEqual([N,N,N,N,N,13,13,N]);expect(plot(result,'zone')).toEqual([0,0,0,0,0,1,0,0]);expect(plot(result,'broken')).toEqual([0,0,0,0,0,0,0,1]);
  expect(result.marks!.boxes).toEqual([{plot:'broken',from:{index:3,price:15},to:{index:7,price:13}}]);
 });
 it('values are causal: every prefix equals the full series on its bars',()=>{
  const rows=waveBars(260),inputs={left:5,right:5},full=calc('srzones',rows,inputs);
  for(const cut of [30,90,171,259]){const part=calc('srzones',rows.slice(0,cut),inputs);
   for(const id of ['support','resistance','zone','broken'])expect(plot(part,id),id+' at '+cut).toEqual(plot(full,id).slice(0,cut));}
  expect(plot(full,'zone').filter(v=>v===1).length).toBeGreaterThan(3);
 });
 it('zone boxes render as native boxes and an open zone counts toward the price scale only over its anchored bars',()=>{
  const rows=waveBars(260),result=calc('srzones',rows),painted=renderIndicatorPresentation(settings('srzones'),result,rows,{resolution:'1D'});
  const boxes=(painted.output as {boxes?:{id:string;extend:string;left:number;right:number}[]}).boxes!;expect(boxes.length).toBeGreaterThan(0);
  expect((painted.output.series??[]).every(series=>series.display?.pane===false)).toBe(true);// plots stay legend and data window values
  const open=boxes.find(box=>box.extend==='right')!,logical=(_:string,x:number)=>rows.findIndex(bar=>bar.time*1000===x);
  const a=logical('',open.left),b=logical('',open.right);
  expect(scaleDrawingSet({lines:[],boxes:[open]},b+5,b+20,0,logical).boxes).toEqual([]);// window right of its anchored span: no scale
  expect(scaleDrawingSet({lines:[],boxes:[open]},a,b,0,logical).boxes).toEqual([{...open,extend:'none'}]);
  const plain={...open,id:'user-box',extend:'right'};expect(scaleDrawingSet({lines:[],boxes:[plain]},b+5,b+20,0,logical).boxes).toEqual([plain]);// other boxes unchanged
 });
});

describe('Adaptive trend channel (SYNTHETIC)',()=>{
 /** Direct least squares of ln(close) over the window ending at i, independent of the prefix-sum kernel. */
 function direct(bars:readonly Bar[],i:number,L:number){
  const y=bars.slice(i-L+1,i+1).map(bar=>Math.log(bar.close)),mx=(L-1)/2,my=y.reduce((a,b)=>a+b,0)/L;let sxy=0,sxx=0,syy=0;
  y.forEach((v,x)=>{sxy+=(x-mx)*(v-my);sxx+=(x-mx)**2;syy+=(v-my)**2;});
  const slope=sxy/sxx,intercept=my-slope*mx,r=sxy/Math.sqrt(sxx*syy);let ss=0;y.forEach((v,x)=>{ss+=(v-(intercept+slope*x))**2;});
  return {r,end:intercept+slope*(L-1),sd:Math.sqrt(ss/L)};
 }
 it('picks the length with the largest |r| and matches a direct least-squares fit',()=>{
  const rows=waveBars(320),result=adaptiveChannel(rows,20,200,2);
  for(const i of [19,57,140,250,319]){
   let best=-1,bestL=0;for(let L=20;L<=Math.min(200,i+1);L++){const f=direct(rows,i,L);if(Math.abs(f.r)>best+1e-12){best=Math.abs(f.r);bestL=L;}}
   const f=direct(rows,i,bestL);
   expect(result.length[i],'bar '+i).toBe(bestL);expect(result.r[i]!).toBeCloseTo(f.r,9);
   expect(result.mid[i]!).toBeCloseTo(Math.exp(f.end),7);expect(result.upper[i]!).toBeCloseTo(Math.exp(f.end+2*f.sd),7);expect(result.lower[i]!).toBeCloseTo(Math.exp(f.end-2*f.sd),7);
  }
  expect(result.length.slice(0,19).every(v=>v===null)).toBe(true);// fewer bars than the shortest candidate
 });
 it('an exact exponential trend gives r = 1, a zero-width channel through the closes, and chords that follow the curve',()=>{
  const rows=ohlc(Array.from({length:60},(_,i)=>{const c=50*Math.exp(0.02*i);return [c,c*1.01,c*0.99,c] as const;}));
  const result=adaptiveChannel(rows,20,200,2),fit=result.last!;
  expect(result.r[59]!).toBeCloseTo(1,9);expect(result.mid[59]!).toBeCloseTo(rows[59].close,6);expect(result.upper[59]!-result.lower[59]!).toBeLessThan(1e-6);
  const lines=adaptiveChannelLines(fit,2),mids=lines.filter(line=>line.plot==='mid');
  expect(lines.length).toBe(3*Math.min(32,fit.length-1));expect(mids.at(-1)!.to.index).toBe(59);
  for(const line of mids)expect(line.from.price).toBeCloseTo(rows[line.from.index].close,6);
 });
 it('a missing close blocks the windows that hold it; Long tries 300 to 1200 bars',()=>{
  const rows=waveBars(260).map((bar,i)=>i===200?{...bar,close:NaN}:bar),result=adaptiveChannel(rows,20,200,2);
  expect(result.mid[200]).toBeNull();expect(result.length.slice(201,220).every(v=>v===null)).toBe(true);expect(result.length[220]).toBe(20);// only the 20-bar window avoids bar 200
  expect(result.length[230]!).toBeLessThanOrEqual(30);
  const long=calc('adaptivechannel',waveBars(320),{term:'Long'});expect(plot(long,'length').slice(0,299).every(v=>v===null)).toBe(true);
  const n=plot(long,'length')[319]!;expect(n).toBeGreaterThanOrEqual(300);expect(n).toBeLessThanOrEqual(320);
 });
 it('the catalog kind is causal and draws the latest channel as lines',()=>{
  const rows=waveBars(240),full=calc('adaptivechannel',rows);
  for(const cut of [25,120,239]){const part=calc('adaptivechannel',rows.slice(0,cut));for(const id of ['mid','upper','lower','length','r'])expect(plot(part,id)).toEqual(plot(full,id).slice(0,cut));}
  expect(full.marks!.lines.length).toBeGreaterThan(0);expect(new Set(full.marks!.lines.map(line=>line.plot))).toEqual(new Set(['upper','mid','lower']));
 });
});

describe('Auto fib multi-scale and the lookback swing (SYNTHETIC)',()=>{
 // highs 10 12 11 13 9, lows 8 9 7 10 6.
 const bars=ohlc([[9,10,8,9],[10,12,9,11],[10,11,7,8],[11,13,10,12],[8,9,6,7]]);
 it('the lookback swing runs from the earlier extreme to the later one; the rolling swings equal it per bar',()=>{
  expect(lookbackFibSwing(bars,0,2)).toEqual({start:{index:1,price:12},end:{index:2,price:7}});// falling
  expect(lookbackFibSwing(bars,1,3)).toEqual({start:{index:2,price:7},end:{index:3,price:13}});// rising
  const tie=ohlc([[5,6,4,5],[5,6,4,5]]);expect(lookbackFibSwing(tie,0,1)).toEqual({start:{index:1,price:4},end:{index:1,price:6}});// latest wins a tie
  const rows=waveBars(300);for(const length of [1,7,50]){const rolling=rollingFibSwings(rows,length);rolling.forEach((swing,i)=>expect(swing,`L${length} bar ${i}`).toEqual(lookbackFibSwing(rows,i-length+1,i)));}
 });
 it('each set is that bar\'s own lookback retracement; hidden sets have no values; the latest window draws extended lines',()=>{
  const result=calc('autofibmulti',bars,{shortLength:3,showMedium:false});
  // Bar 2: 12 (bar 1) to 7 (bar 2): level 0 = 7, 1 = 12, 0.5 = 9.5. Bar 3: 7 to 13 rising: 0.236 = 13 - 6 x 0.236 = 11.584.
  // Bar 4: 13 (bar 3) to 6 (bar 4): 0.618 = 6 + 7 x 0.618 = 10.326. Bar 0 alone: 10 is the later... same bar, rising 8 to 10.
  expect(plot(result,'s0').slice(0,3)).toEqual([10,12,7]);expect(plot(result,'s1')[2]).toBe(12);expect(plot(result,'s5')[2]).toBeCloseTo(9.5,12);
  expect(plot(result,'s236')[3]).toBeCloseTo(11.584,12);expect(plot(result,'s618')[4]).toBeCloseTo(10.326,12);
  expect(plot(result,'m0').every(v=>v===null)).toBe(true);
  expect(plot(result,'l0')[4]).toBe(6);expect(plot(result,'l1')[4]).toBe(13);// Long 400 uses every bar so far
  const short=result.marks!.lines.filter(line=>line.plot.startsWith('s'));expect(short).toHaveLength(7);
  expect(short.find(line=>line.plot==='s618')).toEqual({plot:'s618',from:{index:3,price:6+7*0.618},to:{index:4,price:6+7*0.618},extendRight:true});
  expect(result.marks!.lines.some(line=>line.plot.startsWith('m'))).toBe(false);
  expect(plot(calc('autofibmulti',bars,{shortLength:3,reverse:true}),'s0')[2]).toBe(12);
 });
 it('Auto fib retracement keeps its zig zag default; the Lookback window mode uses the window extremes',()=>{
  const rows=waveBars(200),def=calc('autofib',rows),explicit=calc('autofib',rows,{swingMode:'Zig zag',lookback:5});
  for(const id of ['l0','l618','l1'])expect(plot(def,id)).toEqual(plot(explicit,id));
  const r=calc('autofib',bars,{swingMode:'Lookback window',lookback:3});
  // Bars 2..4: 13 at bar 3 to 6 at bar 4 (falling): level 0 = 6, 1 = 13, values from the swing start (bar 3).
  expect(plot(r,'l0')).toEqual([N,N,N,6,6]);expect(plot(r,'l1')).toEqual([N,N,N,13,13]);expect(plot(r,'l618')[4]).toBeCloseTo(10.326,12);
  expect(catalogDefinition('autofib')!.inputs.find(row=>row.key==='swingMode')!.defval).toBe('Zig zag');
 });
});

describe('Auto fib range volume profile (SYNTHETIC)',()=>{
 it('profiles the bars from the chosen swing start through the last bar, over the swing range',()=>{
  const rows=waveBars(120),result=calc('autofibvp',rows,{range:'Short',shortLength:50});
  const swing=lookbackFibSwing(rows,70,119)!,poc=plot(result,'poc');
  expect(result.profiles).toHaveLength(1);const profile=result.profiles![0];
  expect([profile.from,profile.to]).toEqual([swing.start.index,119]);
  expect(Math.min(...profile.rows.map(row=>row.low))).toBeCloseTo(Math.min(swing.start.price,swing.end.price),9);
  expect(Math.max(...profile.rows.map(row=>row.high))).toBeCloseTo(Math.max(swing.start.price,swing.end.price),9);
  expect(poc.slice(0,swing.start.index).every(v=>v===null)).toBe(true);expect(poc[119]).toBe(profile.pocPrice);
  const zz=calc('autofibvp',rows,{range:'Zig zag'});expect(zz.profiles!.length).toBeLessThanOrEqual(1);
  expect(indicatorAlertBlock('autofibvp',{rowsLayout:'Ticks Per Row'})).toMatch(/Ticks Per Row/);
 });
});

describe('market structure readouts (SYNTHETIC)',()=>{
 it('Length reads as an integer and Pearson r with 3 decimals under automatic precision; explicit precision still wins',async()=>{
  const {formatIndicatorValue,indicatorPlotTextAt}=await import('../../src/ui/data-window-model');
  expect(formatIndicatorValue(137,'adaptivechannel' as never,'auto',0.01,'length')).toBe('137');
  expect(formatIndicatorValue(0.987654,'adaptivechannel' as never,'auto',0.01,'r')).toBe('0.988');
  expect(formatIndicatorValue(0.987654,'adaptivechannel' as never,4 as never,0.01,'r')).toBe('0.9877');
  expect(formatIndicatorValue(101.256,'adaptivechannel' as never,'auto',0.01,'mid')).toBe(formatIndicatorValue(101.256,'adaptivechannel' as never,'auto',0.01));// price plots keep the tick rule
  expect(indicatorPlotTextAt([0.5,-0.91234],null,{kind:'adaptivechannel' as never,precision:'auto',plot:'r'},0.01)).toBe('-0.912');
 });
 it('the legend reader receives each plot id',async()=>{
  const {indicatorLegendTexts}=await import('../../src/chart/legend-pane-model');
  const port={values:()=>({series:[{id:'length',values:[40]},{id:'r',values:[0.5]}]})},seen:string[]=[];
  indicatorLegendTexts(port,{id:'a1',kind:'adaptivechannel'},null,()=>({color:'#fff',visible:true}) as never,(_values,_bar,plot)=>{seen.push(plot);return '';});
  expect(seen).toEqual(['length','r']);
 });
 it('Auto fib range volume profile shows the finer-data notice like Auto anchored volume profile',async()=>{
  const {VP_DETAIL_NOTICE_IDS}=await import('../../src/domain/indicators-ext/vp-catalog');
  expect(VP_DETAIL_NOTICE_IDS).toEqual(['svp','svphd','aavp','autofibvp']);
 });
});
