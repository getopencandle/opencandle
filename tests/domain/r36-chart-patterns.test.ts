import {describe,expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import {catalogDefinition} from '../../src/domain/indicator-catalog';
import {CHART_PATTERN_INDICATOR_IDS} from '../../src/domain/indicators-ext/patterns-catalog';
import {detectChartPatterns,zigzagPivots,CHART_PATTERNS} from '../../src/domain/indicators-ext/patterns-chart';
import type {Bar} from '../../src/domain/types';

// Oracle tests for the chart pattern detectors. All bars are SYNTHETIC: closes run in straight
// 8-bar legs between hand-chosen turning points, each bar spans close +- 0.5 (open = close). With the default pivot length
// 5, every turning point is a pivot (its high or low is strictly beyond the 5 bars before and at least the 5 after), and it is
// confirmed 5 bars later. Tolerance is the default 2%.
const D0=19700*86400,LEG=8;
function path(turns:readonly number[]):{bars:Bar[];at:number[]}{
 const closes=[turns[0]],at=[0];
 for(let k=1;k<turns.length;k++){for(let s=1;s<=LEG;s++)closes.push(turns[k-1]+(turns[k]-turns[k-1])*s/LEG);at.push(closes.length-1);}
 return {bars:closes.map((close,i)=>({time:D0+i*86400,open:close,high:close+0.5,low:close-0.5,close,volume:100})),at};
}
const ones=(values:readonly (number|null)[])=>values.flatMap((value,i)=>value===1?[i]:[]);
const run=(kind:string,bars:readonly Bar[],inputs:Record<string,unknown>={})=>{const result=calculateIndicator(kind,bars,inputs);expect(result.diagnostics,kind).toEqual([]);return result;};

/** [entry, plot, turning points, index of the turning point that completes it, why]. */
const CASES:ReadonlyArray<readonly [string,'bullish'|'bearish'|'neutral',readonly number[],number,string]>=[
 ['chpdoubletop','bearish',[100,120,110,120.3,105],3,'highs 120.5 and 120.8 within 2%; the low 109.5 is more than 2% below 120.5'],
 ['chpdoublebottom','bullish',[120,100,110,99.7,115],3,'lows 99.5 and 99.2 within 2%; the high 110.5 is more than 2% above 99.5'],
 ['chptripletop','bearish',[100,120,110,120.3,110.5,120.1,100],5,'highs 120.5, 120.8, 120.6 within 2%; both lows more than 2% below the lowest high'],
 ['chptriplebottom','bullish',[120,100,110,99.8,109.5,100.1,115],5,'lows 99.5, 99.3, 99.6 within 2%; both highs more than 2% above the highest low'],
 ['chpheadshoulders','bearish',[100,115,105,125,105.5,115.3,95],5,'head 125.5 above both shoulders (115.5, 115.8) by more than 2%; shoulders within 2%; both lows below the shoulders'],
 ['chpinvheadshoulders','bullish',[130,115,125,105,124.5,115.3,135],5,'the mirror on lows: head 104.5 more than 2% below shoulders 114.5 and 114.8'],
 ['chptriangle','neutral',[100,120,105,116,108,113],4,'second high 116.5 falls 3.3% from 120.5, second low 107.5 rises 2.9% from 104.5, the width narrows'],
 ['chprectangle','neutral',[100,120,110,120.2,110.3,115],4,'highs 120.5 and 120.7 flat, lows 109.5 and 109.8 flat, lows well below highs'],
 ['chprisingwedge','bearish',[100,110,104,114,111,116],4,'highs rise 3.6% (110.5 to 114.5), lows rise faster, 7.2% (103.5 to 110.5), the width narrows'],
 ['chpfallingwedge','bullish',[100,120,110,114,107,112],4,'highs fall 5% (120.5 to 114.5), lows fall less, 2.7% (109.5 to 106.5), the width narrows'],
];

describe(' chart pattern entries (SYNTHETIC)',()=>{
 it('every chart entry is a Patterns tab overlay with an oracle case',()=>{
  expect(CHART_PATTERN_INDICATOR_IDS.length).toBe(17);expect(CHART_PATTERNS.length).toBe(16);
  // The flag, pennant and cup entries have their oracle cases in r38-chart-patterns2.test.ts.
  const covered=new Set([...CASES.map(row=>row[0]),'chpbearflag','chpbullflag','chpcuphandle','chpinvcuphandle','chpbearpennant','chpbullpennant']);
  for(const kind of CHART_PATTERN_INDICATOR_IDS){const definition=catalogDefinition(kind)!;expect(definition.pattern,kind).toBe('chart');expect(definition.overlay).toBe(true);if(kind!=='chpall')expect(covered.has(kind),kind).toBe(true);}
 });
 it('pivots are the turning points, each known five bars later',()=>{
  const {bars,at}=path([100,120,110,120.3,105]);
  expect(zigzagPivots(bars,5)).toEqual([{index:at[1],price:120.5,kind:'high'},{index:at[2],price:109.5,kind:'low'},{index:at[3],price:120.8,kind:'high'}]);
 });
 it.each(CASES.map(row=>[...row] as const))('%s (%s) is confirmed 5 bars after its last pivot',(kind,plot,turns,last,why)=>{
  const {bars,at}=path(turns);const result=run(kind,bars);
  expect(ones(result.series.find(row=>row.id===plot)!.values),why).toEqual([at[last]+5]);
  const marker=result.marks!.markers.find(row=>row.plot===plot)!;expect(marker.index).toBe(at[last]);
  expect(marker.text).toBe(CHART_PATTERNS.find(row=>'chp'+row.id===kind)!.name);
  expect(result.marks!.lines.length).toBeGreaterThan(0);
  for(const line of result.marks!.lines){expect(line.to.index).toBeLessThanOrEqual(at[last]+5);expect(line.from.index).toBeLessThan(line.to.index);}
 });
 it('detection is causal: a prefix that ends before the confirmation bar reports nothing, later bars do not move it',()=>{
  const {bars,at}=path([100,115,105,125,105.5,115.3,95]);const confirm=at[5]+5;
  expect(ones(run('chpheadshoulders',bars.slice(0,confirm)).series[0].values)).toEqual([]);
  expect(ones(run('chpheadshoulders',bars.slice(0,confirm+1)).series[0].values)).toEqual([confirm]);
  expect(ones(run('chpheadshoulders',bars).series[0].values)).toEqual([confirm]);
 });
 it('tolerance decides equality: shoulders 3% apart are not a head and shoulders at 2%, but are at 4%',()=>{
  const {bars}=path([100,115,105,125,105.5,119,95]);// shoulders 115.5 and 119.5
  expect(ones(run('chpheadshoulders',bars).series[0].values)).toEqual([]);
  expect(ones(run('chpheadshoulders',bars,{tolerance:4}).series[0].values)).toHaveLength(1);
 });
 it('All chart patterns runs every detector on one zigzag',()=>{
  const {bars,at}=path([100,115,105,125,105.5,115.3,95]);
  const ids=detectChartPatterns(bars,CHART_PATTERNS.map(row=>row.id),5,2).map(hit=>hit.id);expect(ids).toContain('headshoulders');
  const result=run('chpall',bars);expect(ones(result.series.find(row=>row.id==='bearish')!.values)).toContain(at[5]+5);
  expect(result.marks!.markers.some(row=>row.text.split('\n').includes('Head and shoulders'))).toBe(true);
 });
 it('flat or missing data gives no pattern and no error',()=>{
  const flat=Array.from({length:60},(_,i)=>({time:D0+i*86400,open:100,high:100.5,low:99.5,close:100,volume:1}));
  expect(ones(run('chpall',flat).series[0].values)).toEqual([]);
  const {bars}=path([100,120,110,120.3,105]);bars[12]={...bars[12],high:Number.NaN};
  expect(run('chpdoubletop',bars).diagnostics).toEqual([]);
 });
});
