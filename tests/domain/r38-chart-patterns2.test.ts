import {describe,expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import {catalogDefinition} from '../../src/domain/indicator-catalog';
import {CHART_PATTERN_INDICATOR_IDS} from '../../src/domain/indicators-ext/patterns-catalog';
import {CHART_PATTERNS,detectChartPatterns} from '../../src/domain/indicators-ext/patterns-chart';
import {selectorView} from '../../src/domain/indicator-selector-catalog';
import {INDICATOR_KINDS} from '../../src/chart/indicator-settings';
import {indicatorNames} from '../../src/ui/indicator-dialog-model';
import {captureIndicatorAlertSource,evaluateTechnicalAlertSources,technicalSourceKey} from '../../src/domain/technical-alerts';
import {defaultIndicatorPresentation,indicatorDefaults,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import type {IndicatorId} from '../../src/domain/indicators';
import type {Bar} from '../../src/domain/types';

// Oracle tests for the flag, pennant and cup and handle detectors. All bars are SYNTHETIC.
// Flags and pennants use straight 8-bar legs between hand-chosen turning points (each bar spans close +- 0.5, open = close),
// as in r36-chart-patterns.test.ts. Cups use a rounded (parabolic) bowl between two rims. Pivot length 5, tolerance 2%.
const D0=19700*86400,LEG=8;
const toBars=(closes:readonly number[]):Bar[]=>closes.map((close,i)=>({time:D0+i*86400,open:close,high:close+0.5,low:close-0.5,close,volume:100}));
function path(turns:readonly number[]):{bars:Bar[];at:number[]}{
 const closes=[turns[0]],at=[0];
 for(let k=1;k<turns.length;k++){for(let s=1;s<=LEG;s++)closes.push(turns[k-1]+(turns[k]-turns[k-1])*s/LEG);at.push(closes.length-1);}
 return {bars:toBars(closes),at};
}
/** Lead-in leg to the left rim, a parabolic bowl of `cup` bars to the right rim, the handle leg, then the exit leg. */
function cupPath(start:number,rimLeft:number,bottom:number,rimRight:number,handle:number,exit:number,cup=32):{bars:Bar[];at:number[]}{
 const closes=[start];for(let s=1;s<=LEG;s++)closes.push(start+(rimLeft-start)*s/LEG);const a=closes.length-1;
 for(let s=1;s<=cup;s++){const t=s/cup,rim=rimLeft+(rimRight-rimLeft)*t;closes.push(bottom+(rim-bottom)*(2*t-1)**2);}const c=closes.length-1;
 for(let s=1;s<=LEG;s++)closes.push(rimRight+(handle-rimRight)*s/LEG);const d=closes.length-1;
 for(let s=1;s<=LEG;s++)closes.push(handle+(exit-handle)*s/LEG);
 return {bars:toBars(closes),at:[a,a+cup/2,c,d]};
}
const ones=(values:readonly (number|null)[])=>values.flatMap((value,i)=>value===1?[i]:[]);
const run=(kind:string,bars:readonly Bar[],inputs:Record<string,unknown>={})=>{const result=calculateIndicator(kind,bars,inputs);expect(result.diagnostics,kind).toEqual([]);return result;};
const signal=(kind:string,bars:readonly Bar[],plot:string)=>ones(run(kind,bars).series.find(row=>row.id===plot)!.values);

const BULL_FLAG=[110,100,130,122,128,120,135],BULL_PENNANT=[110,100,130,120,127,123,135];
const BEAR_FLAG=[90,100,70,78,72,80,65],BEAR_PENNANT=[90,100,70,80,73,77,65];
/** [entry, plot, bars, index of the last pivot, why]. */
const CASES:ReadonlyArray<readonly [string,'bullish'|'bearish',{bars:Bar[];at:number[]},number,string]>=[
 ['chpbullflag','bullish',path(BULL_FLAG),5,'pole 99.5 to 130.5; flag highs 130.5, 128.5 and lows 121.5, 119.5 drift down in parallel, above the pole midpoint 115'],
 ['chpbearflag','bearish',path(BEAR_FLAG),5,'pole 100.5 to 69.5; flag lows 69.5, 71.5 and highs 78.5, 80.5 drift up in parallel, below the pole midpoint 85'],
 ['chpbullpennant','bullish',path(BULL_PENNANT),5,'pole 99.5 to 130.5; highs fall 2.3% (130.5 to 127.5) and lows rise 2.5% (119.5 to 122.5): converging'],
 ['chpbearpennant','bearish',path(BEAR_PENNANT),5,'pole 100.5 to 69.5; lows rise 4.3% (69.5 to 72.5) and highs fall 3.7% (80.5 to 77.5): converging'],
 ['chpcuphandle','bullish',cupPath(100,120,100,120.3,114,125),3,'rims 120.5 and 120.8 equal; rounded bowl to 99.5; handle low 113.5 in the upper half, 8 bars against a 32-bar cup'],
 ['chpinvcuphandle','bearish',cupPath(120,100,120,99.7,106,95),3,'the mirror on highs: rims 99.5 and 99.2, dome to 120.5, handle high 106.5 in the lower half'],
];
const NEW_IDS=['chpbearflag','chpbullflag','chpcuphandle','chpinvcuphandle','chpbearpennant','chpbullpennant'];

describe(' flag, pennant and cup and handle entries (SYNTHETIC)',()=>{
 it('the six entries are chart pattern overlays with captured names and OpenCandle-defined rules',()=>{
  for(const kind of NEW_IDS){
   const definition=catalogDefinition(kind)!;expect(definition,kind).toBeDefined();expect(definition.pattern,kind).toBe('chart');expect(definition.overlay,kind).toBe(true);
   expect(definition.provenance.some(row=>row.url.startsWith('indicator-list:patterns')),kind).toBe(true);
   expect(definition.unknownDefaults!.join(' '),kind).toMatch(/OpenCandle-defined/);
   expect(CHART_PATTERN_INDICATOR_IDS).toContain(kind);
  }
  expect(NEW_IDS.map(kind=>catalogDefinition(kind)!.name)).toEqual(['Bearish flag chart pattern','Bullish flag chart pattern','Cup and handle chart pattern','Inverted cup and handle chart pattern','Bearish pennant chart pattern','Bullish pennant chart pattern']);
 });
 it.each(CASES.map(row=>[...row] as const))('%s (%s) is confirmed 5 bars after its last pivot',(kind,plot,{bars,at},last,why)=>{
  const result=run(kind,bars);
  expect(ones(result.series.find(row=>row.id===plot)!.values),why).toEqual([at[last]+5]);
  const marker=result.marks!.markers.find(row=>row.plot===plot)!;expect(marker.index).toBe(at[last]);
  expect(marker.text).toBe(CHART_PATTERNS.find(row=>'chp'+row.id===kind)!.name);
  expect(result.marks!.lines.length).toBeGreaterThan(0);
  for(const line of result.marks!.lines){expect(line.to.index).toBeLessThanOrEqual(at[last]+5);expect(line.from.index).toBeLessThan(line.to.index);}
 });
 it('flags and pennants exclude each other: parallel is a flag, converging is a pennant',()=>{
  expect(signal('chpbullpennant',path(BULL_FLAG).bars,'bullish')).toEqual([]);
  expect(signal('chpbullflag',path(BULL_PENNANT).bars,'bullish')).toEqual([]);
  expect(signal('chpbearpennant',path(BEAR_FLAG).bars,'bearish')).toEqual([]);
  expect(signal('chpbearflag',path(BEAR_PENNANT).bars,'bearish')).toEqual([]);
 });
 it('a flag that retraces below the pole midpoint, or a flag rising with its pole, is not a flag',()=>{
  expect(signal('chpbullflag',path([110,100,130,112,128,110,135]).bars,'bullish')).toEqual([]);// lows 111.5, 109.5 under 115
  expect(signal('chpbullflag',path([110,100,130,124,134,128,140]).bars,'bullish')).toEqual([]);// highs rise 3.1% (130.5 to 134.5): drifts with the pole
  expect(signal('chpbullflag',path([110,107,110,109.3,109.9,109.1,112]).bars,'bullish')).toEqual([]);// pole 4 (3.8%) is under 3 x tolerance
 });
 it('a V-shaped cup is not a cup and handle; a handle deeper than half the cup is not either',()=>{
  expect(signal('chpcuphandle',path([100,120,100,120.3,114,125]).bars,'bullish')).toEqual([]);
  expect(signal('chpcuphandle',cupPath(100,120,100,120.3,106,125).bars,'bullish')).toEqual([]);// handle low 105.5 under the midpoint 110
  expect(signal('chpcuphandle',cupPath(100,120,100,120.3,114,125,12).bars,'bullish')).toEqual([]);// 12-bar cup, 8-bar handle: handle too long
  expect(signal('chpinvcuphandle',path([120,100,120,99.7,106,95]).bars,'bearish')).toEqual([]);
 });
 it('detection is causal: a prefix that ends before the confirmation bar reports nothing',()=>{
  for(const [kind,plot,{bars,at},last] of CASES){const confirm=at[last]+5;
   expect(signal(kind,bars.slice(0,confirm),plot),kind).toEqual([]);expect(signal(kind,bars.slice(0,confirm+1),plot),kind).toEqual([confirm]);}
 });
 it('All chart patterns includes the new detectors',()=>{
  const ids=new Set(CASES.flatMap(([,,{bars}])=>detectChartPatterns(bars,CHART_PATTERNS.map(row=>row.id),5,2).map(hit=>hit.id)));
  for(const id of ['bullflag','bearflag','bullpennant','bearpennant','cuphandle','invcuphandle'])expect(ids.has(id as never),id).toBe(true);
  const {bars,at}=cupPath(100,120,100,120.3,114,125),result=run('chpall',bars);
  expect(ones(result.series.find(row=>row.id==='bullish')!.values)).toContain(at[3]+5);
  expect(result.marks!.markers.some(row=>row.text.split('\n').includes('Cup and handle'))).toBe(true);
 });
 it('the chart draws the marker and the boundary lines; the frozen alert source reads 1 on the confirmation bar',async()=>{
  const {bars,at}=path(BULL_FLAG),kind='chpbullflag' as IndicatorId;
  const row:IndicatorInstanceSettings={id:'p1',kind,inputs:{...indicatorDefaults[kind]} as never,plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation(kind)};
  const {output,diagnostics}=renderIndicatorPresentation(row,calculateIndicator(kind,bars,row.inputs),bars,{resolution:'1D'});
  expect(diagnostics).toEqual([]);
  expect(output.labels!.map(label=>[label.text,label.x,label.yloc])).toEqual([['Bullish flag',bars[at[5]].time*1000,'belowbar']]);
  // Pole p0-h1, then the upper (h1-h2) and lower (l1-l2) flag lines continued to the confirmation bar.
  expect(output.lines!.map(line=>[line.x1/1000,line.y1,line.x2/1000,line.y2])).toEqual([[bars[at[1]].time,99.5,bars[at[2]].time,130.5],[bars[at[2]].time,130.5,bars[at[5]+5].time,126.875],[bars[at[3]].time,121.5,bars[at[5]+5].time,118.875]]);
  const source=captureIndicatorAlertSource(row,'bullish','standard','snap-1'),key=technicalSourceKey(source),confirm=at[5]+5;
  const value=async(end:number)=>(await evaluateTechnicalAlertSources(bars.slice(0,end),[source],'USD')).results.get(key)!.sample.value;
  expect([await value(confirm),await value(confirm+1),await value(confirm+2)]).toEqual([0,1,0]);
 });
 it('the Patterns tab lists the chart entries in the captured order (Elliott wave left out)',()=>{
  const source={indicators:INDICATOR_KINDS.map(kind=>({id:kind,name:indicatorNames[kind],acronym:kind})),scripts:[]};
  const view=selectorView(source,{item:'built-ins',tab:'patterns',query:''});
  expect(view.entries.filter(row=>row.section==='Chart patterns').map(row=>row.label)).toEqual(['All chart patterns','Bearish flag chart pattern','Bullish flag chart pattern','Cup and handle chart pattern','Inverted cup and handle chart pattern','Double bottom chart pattern','Double top chart pattern','Head and shoulders chart pattern','Inverted head and shoulders chart pattern','Bearish pennant chart pattern','Bullish pennant chart pattern','Rectangle chart pattern','Triangle chart pattern','Triple bottom chart pattern','Triple top chart pattern','Falling wedge chart pattern','Rising wedge chart pattern']);
  expect(selectorView(source,{item:'built-ins',tab:'patterns',query:'pennant'}).entries.map(row=>row.id)).toEqual(['chpbearpennant','chpbullpennant']);
 });
});
