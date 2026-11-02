import {describe,expect,it} from 'vitest';
import type {Bar} from '../../src/domain/types';
import {calculateIndicator} from '../../src/domain/indicators';
import {catalogDefinition} from '../../src/domain/indicator-catalog';
import {CHART_PATTERN_INDICATOR_IDS,textbookPolicy} from '../../src/domain/indicators-ext/patterns-catalog';
import {CHART_PATTERNS,chartBarsAreDaily,detectChartPatterns,priorTrend,type ChartPatternId} from '../../src/domain/indicators-ext/patterns-chart';
import {indicatorDefaults} from '../../src/chart/indicator-settings';
import type {IndicatorId} from '../../src/domain/indicators';

// Textbook size rules (opt-in): double top and bottom depth and spacing, a prior trend for reversals, a minimum span for triangles, rectangles
// and wedges, daily and longer bars only. Every series here is SYNTHETIC (hand-built legs, or the seeded walk below). No market data.
const D0=19700*86400,DAY=86400;
const TB={textbook:true},OFF={textbook:false};
/** Straight legs through (price, bars) steps from a start price; each bar is flat (open = high = low = close) so a pivot is exactly a turning price. */
function legs(start:number,steps:readonly (readonly [number,number])[],spacing=DAY):Bar[]{
 const closes=[start];let from=start;
 for(const [to,count] of steps){for(let s=1;s<=count;s++)closes.push(from+(to-from)*s/count);from=to;}
 return closes.map((close,i)=>({time:D0+i*spacing,open:close,high:close,low:close,close,volume:100}));
}
/** The mirror image of a series about 200 (tops become bottoms). */
const mirror=(bars:readonly Bar[]):Bar[]=>bars.map(row=>({...row,open:200-row.open,high:200-row.low,low:200-row.high,close:200-row.close}));
const count=(bars:readonly Bar[],id:ChartPatternId,options:{textbook?:boolean;breakout?:boolean}=TB,pivotLength=2)=>detectChartPatterns(bars,[id],pivotLength,2,options).length;
/** Both directions of a reversal pattern: the series and its mirror (a top becomes a bottom). */
const both=(bars:Bar[],top:ChartPatternId,bottom:ChartPatternId)=>[[bars,top],[mirror(bars),bottom]] as const;

describe('double top and bottom: the valley is at least 10% of the first top (Bulkowski, ChartSchool) (SYNTHETIC)',()=>{
 // Tops 100 and 100 at bars 5 and 10 (5 bars apart is too close, so use 6 + 5 = 11), valley set by `valley`, a rising lead-in from 70 (prior uptrend).
 const double=(valley:number,there=6,back=5)=>legs(70,[[100,10],[valley,there],[100,back],[95,4]]);
 it('a 10.0% valley passes and a 9.9% valley does not, for tops and (mirrored) bottoms',()=>{
  for(const [bars,id] of both(double(90),'doubletop','doublebottom'))expect(count(bars,id),id+' at 10.0%').toBe(1);
  for(const [bars,id] of both(double(90.1),'doubletop','doublebottom'))expect(count(bars,id),id+' at 9.9%').toBe(0);
 });
 it('with the rule off the 9.9% valley is still reported (today\'s behaviour)',()=>{
  for(const [bars,id] of both(double(90.1),'doubletop','doublebottom')){expect(count(bars,id,OFF),id).toBe(1);expect(count(bars,id,{}),id).toBe(1);}
 });
 it('the valley is measured from the first top',()=>{
  const bars=legs(70,[[100,10],[90.5,6],[101,5],[95,4]]);// tops 100 and 101 (equal within 2%); 9.5% below the first top, 10.4% below the second
  expect(count(bars,'doubletop')).toBe(0);
 });
});

describe('double top and bottom: the tops are at least 10 bars apart (Bulkowski tested a two-week minimum) (SYNTHETIC)',()=>{
 const double=(there:number,back:number)=>legs(70,[[100,10],[88,there],[100,back],[95,4]]);
 it('10 bars apart passes, 9 bars apart does not',()=>{
  for(const [bars,id] of both(double(5,5),'doubletop','doublebottom'))expect(count(bars,id),id+' 10 bars').toBe(1);
  for(const [bars,id] of both(double(5,4),'doubletop','doublebottom'))expect(count(bars,id),id+' 9 bars').toBe(0);
 });
 it('with the rule off the 9-bar pattern is reported',()=>{
  for(const [bars,id] of both(double(5,4),'doubletop','doublebottom'))expect(count(bars,id,OFF),id).toBe(1);
 });
});

describe('reversal patterns need a prior trend (Bulkowski glossary; ChartSchool) (SYNTHETIC)',()=>{
 // A rise into the pattern starts at 70; a fall into it starts at 140, sinks to 95 and bounces to the first top (100), so the first bar that leaves the range going back is above it.
 const into=(lead:'rise'|'fall',rest:readonly (readonly [number,number])[])=>lead==='rise'?legs(70,[[100,10],...rest]):legs(140,[[95,10],[100,4],...rest]);
 const shapes:readonly (readonly [string,ChartPatternId,ChartPatternId,(lead:'rise'|'fall')=>Bar[]])[]=[
  ['double',  'doubletop','doublebottom',lead=>into(lead,[[88,6],[100,6],[95,4]])],
  ['triple',  'tripletop','triplebottom',lead=>into(lead,[[90,5],[100,5],[90,5],[100,5],[95,4]])],
  ['head and shoulders','headshoulders','invheadshoulders',lead=>into(lead,[[90,5],[110,5],[90,5],[100,5],[95,4]])],
 ];
 for(const [name,top,bottom,build] of shapes){
  it(`${name}: a rise into the top (fall into the bottom) passes; the opposite trend does not`,()=>{
   const rising=build('rise'),falling=build('fall');
   expect(count(rising,top),name+' top, prior rise').toBe(1);expect(count(falling,top),name+' top, prior fall').toBe(0);
   expect(count(mirror(rising),bottom),name+' bottom, prior fall').toBe(1);expect(count(mirror(falling),bottom),name+' bottom, prior rise').toBe(0);
  });
  it(`${name}: with the rule off both trends are reported`,()=>{
   for(const lead of ['rise','fall'] as const){expect(count(build(lead),top,OFF),name).toBe(1);expect(count(mirror(build(lead)),bottom,OFF),name).toBe(1);}
  });
 }
 it('no bar before the pattern leaves its range: the trend is unknown and the pattern is not reported',()=>{
  expect(count(legs(95,[[100,10],[88,6],[100,6],[95,4]]),'doubletop')).toBe(0);// the series opens inside the range
 });
 it('the first bar outside the range decides; one bar outside on both sides is undecided; a retest of a higher peak reads as a fall (the known quirk)',()=>{
  const flat=legs(95,[[95,10]]);
  expect(priorTrend(flat,10,100,90)).toBe(null);
  const below=flat.map((row,i)=>i===4?{...row,low:80}:row);expect(priorTrend(below,10,100,90)).toBe('up');
  const above=flat.map((row,i)=>i===4?{...row,high:120}:row);expect(priorTrend(above,10,100,90)).toBe('down');
  const wide=flat.map((row,i)=>i===4?{...row,low:80,high:120}:row);expect(priorTrend(wide,10,100,90)).toBe(null);
  // A rally to an earlier peak at 101, then a drift back inside the pattern's range before a first top at 100: going back, 101 is met before any lower bar.
  const retest=legs(60,[[101,10],[95,4],[100,4]]);expect(priorTrend(retest,18,100,88)).toBe('down');
 });
});

describe('the prior trend is causal: it reads only bars before the first pivot (SYNTHETIC)',()=>{
 // A seeded walk of 400 daily bars with swings of 18 to 32 bars.
 const series=walk(23,400);
 it('the trend of any window is the same on the bars up to its first pivot as on the full series',()=>{
  let checked=0;
  for(let first=5;first<series.length;first+=7)for(const [high,low] of [[60,50],[55,45],[70,40]]){
   expect(priorTrend(series.slice(0,first),first,high,low)).toBe(priorTrend(series,first,high,low));checked++;
  }
  expect(checked).toBeGreaterThan(50);
 });
 for(const pivotLength of [3,5])for(const breakout of [true,false])it(`pivot length ${pivotLength}, breakout ${breakout}: a prefix reports exactly the full run's hits known on it`,()=>{
  const all=CHART_PATTERNS.map(row=>row.id),full=detectChartPatterns(series,all,pivotLength,2,{breakout,textbook:true});expect(full.length).toBeGreaterThan(5);
  expect(full,'the rules change the output').not.toEqual(detectChartPatterns(series,all,pivotLength,2,{breakout}));
  for(let end=20;end<=series.length;end+=3)expect(detectChartPatterns(series.slice(0,end),all,pivotLength,2,{breakout,textbook:true}),'prefix '+end).toEqual(full.filter(hit=>hit.confirmedAt<end));
 });
 it('a reversal that fires on its breakout bar is still reported there (the pattern is tested again on that bar)',()=>{
  const bars=legs(70,[[100,10],[88,6],[100,6],[80,8]]),hits=detectChartPatterns(bars,['doubletop'],2,2,{breakout:true,textbook:true});
  expect(hits.map(hit=>[hit.pivots.map(pivot=>pivot.index),hit.breakout])).toEqual([[[10,16,22],'down']]);
  expect(detectChartPatterns(legs(140,[[95,10],[100,4],[88,6],[100,6],[80,8]]),['doubletop'],2,2,{breakout:true,textbook:true}),'a prior fall refuses it').toEqual([]);
 });
});

describe('triangle, rectangle, rising wedge and falling wedge span at least 15 bars (Bulkowski; ChartSchool) (SYNTHETIC)',()=>{
 // Four pivots (high, low, high, low) after a lead-in; the three legs between them add up to `span` bars.
 const shapes:readonly (readonly [ChartPatternId,number,number,number])[]=[// id, second high, first low, second low (first high 110)
  ['rectangle',110,100,100],['triangle',107,100,100],['risingwedge',114,100,108],['fallingwedge',104,100,97]];
 const build=(second:number,low1:number,low2:number,span:number)=>{const a=Math.floor(span/3),b=Math.floor((span-a)/2),c=span-a-b;return legs(100,[[110,10],[low1,a],[second,b],[low2,c],[low2+8,4]]);};
 for(const [id,second,low1,low2] of shapes){
  it(`${id}: 15 bars from the first to the last pivot passes, 14 does not`,()=>{
   expect(count(build(second,low1,low2,15),id),id+' 15').toBeGreaterThan(0);
   expect(count(build(second,low1,low2,14),id),id+' 14').toBe(0);
  });
  it(`${id}: with the rule off the 14-bar shape is reported`,()=>{
   expect(count(build(second,low1,low2,14),id,OFF),id).toBeGreaterThan(0);
  });
 }
});

describe('the rules apply only on daily and longer bars, read from the bars themselves (SYNTHETIC)',()=>{
 const spaced=(bars:readonly Bar[],spacing:number)=>bars.map((row,i)=>({...row,time:D0+i*spacing}));
 const shallow=legs(70,[[100,10],[90.1,6],[100,5],[95,4]]),opposite=legs(140,[[100,10],[88,6],[100,6],[95,4]]);
 it('median bar spacing of 20 hours or more is daily; hourly bars with overnight gaps are not',()=>{
  expect(chartBarsAreDaily(shallow)).toBe(true);
  expect(chartBarsAreDaily(spaced(shallow,20*3600))).toBe(true);expect(chartBarsAreDaily(spaced(shallow,20*3600-1))).toBe(false);
  expect(chartBarsAreDaily(spaced(shallow,7*DAY))).toBe(true);
  const session=Array.from({length:60},(_,i)=>({...shallow[0],time:D0+Math.floor(i/7)*DAY+(i%7)*3600}));
  expect(chartBarsAreDaily(session)).toBe(false);expect(chartBarsAreDaily(shallow.slice(0,1))).toBe(false);
 });
 it('weekend gaps do not make daily bars intraday',()=>{
  const week=shallow.map((row,i)=>({...row,time:D0+(i+2*Math.floor(i/5))*DAY}));
  expect(chartBarsAreDaily(week)).toBe(true);expect(count(week,'doubletop')).toBe(0);
 });
 it('weekly bars get the same rules; hourly, 15-minute and 4-hour bars keep today\'s output exactly',()=>{
  expect(count(spaced(shallow,7*DAY),'doubletop')).toBe(0);
  for(const spacing of [3600,900,4*3600])for(const bars of [shallow,opposite,walk(23,300)]){
   const intraday=spaced(bars,spacing),ids=CHART_PATTERNS.map(row=>row.id);
   for(const breakout of [true,false])expect(detectChartPatterns(intraday,ids,3,2,{breakout,textbook:true}),spacing+' '+breakout).toEqual(detectChartPatterns(intraday,ids,3,2,{breakout}));
  }
  expect(count(spaced(shallow,3600),'doubletop')).toBe(1);// the 9.9% double top that the daily series refuses
 });
});

describe('textbook off is today\'s output exactly (SYNTHETIC walk)',()=>{
 const series=walk(23,300),all=CHART_PATTERNS.map(row=>row.id);
 const fingerprint=(value:unknown)=>{let hash=2166136261;for(const char of JSON.stringify(value))hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;return hash;};
 it('absent, undefined and false give the same hits, and they are the hits the detector reported before the option existed',()=>{
  const seen:Record<string,number>={};
  for(const pivotLength of [3,5])for(const breakout of [true,false]){
   const plain=detectChartPatterns(series,all,pivotLength,2,{breakout});
   expect(detectChartPatterns(series,all,pivotLength,2,{breakout,textbook:false})).toEqual(plain);
   expect(detectChartPatterns(series,all,pivotLength,2,{breakout,textbook:undefined})).toEqual(plain);
   seen[`${pivotLength}:${breakout}`]=fingerprint(plain);
  }
  // Pinned from the detector as it stood before this option (geometry fixes included), so a drift in the off path is caught.
  expect(seen).toEqual(PINNED_OFF);
 });
 it('turned on, the daily series loses hits',()=>{
  for(const pivotLength of [3,5]){
   const off=detectChartPatterns(series,all,pivotLength,2,{breakout:true}),on=detectChartPatterns(series,all,pivotLength,2,{breakout:true,textbook:true});
   expect(on.length).toBeLessThan(off.length);
   for(const hit of on)expect(['doubletop','doublebottom','tripletop','triplebottom','headshoulders','invheadshoulders','triangle','rectangle','risingwedge','fallingwedge','bullflag','bearflag','bullpennant','bearpennant','cuphandle','invcuphandle']).toContain(hit.id);
  }
 });
});

describe('catalog: every chart entry offers Textbook size rules, on for new instances and off for saved ones (SYNTHETIC)',()=>{
 const double=legs(70,[[100,10],[90.1,6],[100,5],[95,4]]);
 const run=(kind:string,bars:readonly Bar[],inputs:Record<string,unknown>)=>calculateIndicator(kind as never,bars,inputs).series.flatMap(row=>row.values.map((value,i)=>value===1?row.id+'@'+i:null).filter(Boolean));
 it('all 17 entries carry the input, modelled on the breakout input',()=>{
  expect(CHART_PATTERN_INDICATOR_IDS).toHaveLength(17);
  for(const kind of CHART_PATTERN_INDICATOR_IDS){
   expect(catalogDefinition(kind as never)!.inputs.find(row=>row.key==='textbook'),kind).toMatchObject({title:'Textbook size rules',type:'bool',defval:true,legacyOmit:true,legacyDefval:false});
   expect(indicatorDefaults[kind as IndicatorId],kind).toMatchObject({textbook:true});
  }
 });
 it('a new instance applies the rules; a saved instance with no key and an explicit false do not',()=>{
  const base={pivotLength:2,breakout:false};
  expect(run('chpdoubletop',double,{...base,textbook:true})).toEqual([]);
  expect(run('chpdoubletop',double,{...base,textbook:false})).toHaveLength(1);
  expect(run('chpdoubletop',double,base)).toEqual(run('chpdoubletop',double,{...base,textbook:false}));// keyless saved instance: today's behaviour
  expect(run('chpall',double,base)).toEqual(run('chpall',double,{...base,textbook:false}));
  expect(run('chpall',double,{...base,textbook:true})).not.toEqual(run('chpall',double,base));
 });
 it('the policy text explains the rules with their sources, only the rules that touch the pattern, with no em dash',()=>{
  const policy=(kind:string)=>catalogDefinition(kind as never)!.policies!.find(row=>row.startsWith('Textbook size rules'))!;
  expect(policy('chpdoubletop')).toMatch(/at least 10% below the first top/);expect(policy('chpdoubletop')).toMatch(/10 bars apart/);
  expect(policy('chpdoubletop')).toMatch(/Bulkowski/);expect(policy('chpdoubletop')).toMatch(/ChartSchool/);expect(policy('chpdoubletop')).toMatch(/prior trend/);
  expect(policy('chpdoubletop')).toMatch(/retest of a slightly higher earlier peak/);expect(policy('chpdoubletop')).not.toMatch(/at least 15 bars/);
  expect(policy('chptripletop')).toMatch(/prior trend/);expect(policy('chptripletop')).not.toMatch(/10 bars apart/);
  for(const kind of ['chptriangle','chprectangle','chprisingwedge','chpfallingwedge'])expect(policy(kind),kind).toMatch(/at least 15 bars/);
  for(const kind of ['chpbullflag','chpcuphandle'])expect(policy(kind),kind).toMatch(/does not change this pattern/);
  expect(policy('chpall')).toMatch(/10 bars apart/);expect(policy('chpall')).toMatch(/prior trend/);expect(policy('chpall')).toMatch(/at least 15 bars/);expect(policy('chpall')).toMatch(/Flags, pennants and cups are unchanged/);
  for(const kind of CHART_PATTERN_INDICATOR_IDS){const text=policy(kind);expect(text,kind).toMatch(/on for new instances; off for instances saved before it existed/);expect(text,kind).toMatch(/daily and longer bars/);expect(text,kind).not.toContain('—');}
  expect(textbookPolicy(CHART_PATTERNS.map(row=>row.id))).toBe(policy('chpall'));
 });
});

// The pinned off-path fingerprints (FNV-1a of the JSON of every hit) of walk(23,300) with all patterns, tolerance 2, keyed "pivotLength:breakout".
const PINNED_OFF:Record<string,number>={'3:true':1736738233,'3:false':788409402,'5:true':552277751,'5:false':3691848736};

/** A seeded synthetic daily series (the same generator as chart-pattern-fixes-1101.test.ts): cyclic drift plus noise, rounded to cents. */
function walk(seed:number,count:number):Bar[]{
 let state=seed|0;const random=()=>{state=state+0x6D2B79F5|0;let t=Math.imul(state^state>>>15,1|state);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
 const period=18+Math.floor(random()*14),phase=random()*6.28,cent=(value:number)=>Math.round(value*100)/100,bars:Bar[]=[];let price=50;
 for(let i=0;i<count;i++){
  const open=price,drift=0.012*Math.sin(i*2*Math.PI/period+phase)+0.003*Math.sin(i*2*Math.PI/(period*3.7)),close=Math.max(1,open*(1+drift+(random()-0.5)*0.03));
  bars.push({time:D0+i*DAY,open:cent(open),high:cent(Math.max(open,close)*(1+random()*0.01)),low:cent(Math.min(open,close)*(1-random()*0.01)),close:cent(close),volume:100});price=close;
 }
 return bars;
}
