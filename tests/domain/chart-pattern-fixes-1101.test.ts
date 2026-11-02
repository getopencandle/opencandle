import {describe,expect,it} from 'vitest';
import {CHART_PATTERNS,detectChartPatterns,type ChartPatternHit,type ChartPatternId} from '../../src/domain/indicators-ext/patterns-chart';
import type {Bar} from '../../src/domain/types';

// Regression tests for five chart pattern detector fixes (apex breakouts, converging test, drawn breakout level, signal-bar close,
// overlapping reports). Every series here is SYNTHETIC: hand-built paths, and seeded random walks (WALK) made by `walk` below. No market data.
const D0=19700*86400,LEG=8;
const toBars=(closes:readonly number[]):Bar[]=>closes.map((close,i)=>({time:D0+i*86400,open:close,high:close+0.5,low:close-0.5,close,volume:100}));
/** Straight 8-bar legs between hand-chosen turning points (each bar spans close +- 0.5). */
function path(turns:readonly number[]):{bars:Bar[];at:number[]}{
 const closes=[turns[0]],at=[0];
 for(let k=1;k<turns.length;k++){for(let s=1;s<=LEG;s++)closes.push(turns[k-1]+(turns[k]-turns[k-1])*s/LEG);at.push(closes.length-1);}
 return {bars:toBars(closes),at};
}
/** Lead-in leg to the left rim, a parabolic bowl of `cup` bars to the right rim, the handle leg, then the exit leg. */
function cupPath(start:number,rimLeft:number,bottom:number,rimRight:number,handle:number,exit:number,cup=32):Bar[]{
 const closes=[start];for(let s=1;s<=LEG;s++)closes.push(start+(rimLeft-start)*s/LEG);
 for(let s=1;s<=cup;s++){const t=s/cup,rim=rimLeft+(rimRight-rimLeft)*t;closes.push(bottom+(rim-bottom)*(2*t-1)**2);}
 for(let s=1;s<=LEG;s++)closes.push(rimRight+(handle-rimRight)*s/LEG);
 for(let s=1;s<=LEG;s++)closes.push(handle+(exit-handle)*s/LEG);
 return toBars(closes);
}
const ids=(...list:ChartPatternId[])=>list;
/** A seeded synthetic daily series: a cyclic drift plus noise, rounded to cents (swings of 18 to 32 bars, so every pattern family appears). */
function walk(seed:number,count:number):Bar[]{
 let state=seed|0;const random=()=>{state=state+0x6D2B79F5|0;let t=Math.imul(state^state>>>15,1|state);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
 const period=18+Math.floor(random()*14),phase=random()*6.28,cent=(value:number)=>Math.round(value*100)/100,bars:Bar[]=[];let price=50;
 for(let i=0;i<count;i++){
  const open=price,drift=0.012*Math.sin(i*2*Math.PI/period+phase)+0.003*Math.sin(i*2*Math.PI/(period*3.7)),close=Math.max(1,open*(1+drift+(random()-0.5)*0.03));
  bars.push({time:D0+i*86400,open:cent(open),high:cent(Math.max(open,close)*(1+random()*0.01)),low:cent(Math.min(open,close)*(1-random()*0.01)),close:cent(close),volume:100});price=close;
 }
 return bars;
}
const all=CHART_PATTERNS.map(row=>row.id);
const ON={breakout:true};
const tag=(hits:readonly ChartPatternHit[])=>hits.map(hit=>`${hit.id}@${hit.confirmedAt}${hit.breakout?':'+hit.breakout:''}`);
const lastLine=(hit:ChartPatternHit)=>hit.lines[hit.lines.length-1];

describe('breakouts stop at the apex (Bulkowski; ChartSchool: triangles and wedges break out before the apex) (SYNTHETIC)',()=>{
 // Triangle highs 120.5 and 116.5, lows 104.5 and 107.5 (the lines meet at bar 48), then closes creep up inside the lines to
 // 110.5 and sit there. Past the apex the upper line is below the lower one, so a flat close "clears" it without leaving the pattern.
 const closes=path([100,120,105,116,108,113]).bars.map(bar=>bar.close).slice(0,33);
 for(let k=33;k<=47;k++)closes.push(108+(110.5-108)*(k-32)/15);
 for(let k=48;k<=56;k++)closes.push(110.5);
 it('a close past the apex is not a triangle breakout',()=>{
  expect(tag(detectChartPatterns(toBars(closes),ids('triangle'),5,2,ON))).toEqual([]);
  expect(tag(detectChartPatterns(toBars(closes),ids('triangle'),5,2))).toContain('triangle@37');// still known on its pivot bar
 });
 it('a break before the apex still counts',()=>{
  expect(tag(detectChartPatterns(path([100,120,105,116,108,113]).bars,ids('triangle'),5,2,ON))).toEqual(['triangle@40:up']);
 });
});

describe('converging means the gap shrinks between the first and last pivot bars; slopes are per bar (Bulkowski) (SYNTHETIC)',()=>{
 // Highs 100.1 (bar 10) and 104.1 (bar 30) rise 0.20 a bar; lows 89.9 (bar 20) and 94.9 (bar 70) rise 0.10 a bar: the gap widens.
 const widening=toBars(Array(80).fill(97));
 widening[10]={...widening[10],high:100.1};widening[20]={...widening[20],low:89.9};widening[30]={...widening[30],high:104.1};widening[70]={...widening[70],low:94.9};
 const mirror=widening.map(bar=>({...bar,open:200-bar.open,high:200-bar.low,low:200-bar.high,close:200-bar.close}));
 it('a widening rising or falling wedge is not a wedge, or a triangle',()=>{
  for(const bars of [widening,mirror])expect(tag(detectChartPatterns(bars,ids('risingwedge','fallingwedge','triangle'),3,2))).toEqual([]);
 });
 it('the textbook shapes still classify',()=>{
  expect(tag(detectChartPatterns(path([100,110,104,114,111,116]).bars,ids('risingwedge','fallingwedge','triangle'),5,2))).toEqual(['risingwedge@37']);
  expect(tag(detectChartPatterns(path([100,120,110,114,107,112]).bars,ids('risingwedge','fallingwedge','triangle'),5,2))).toEqual(['fallingwedge@37']);
 });
});

describe('the drawn line is the level the breakout rule tests (SYNTHETIC)',()=>{
 it('triple top: flat at the lowest valley, triple bottom: flat at the highest peak',()=>{
  const top=path([100,120,110,120.3,110.5,120.1,100]),[hit]=detectChartPatterns(top.bars,ids('tripletop'),5,2,ON);
  expect(lastLine(hit)).toEqual({from:{index:top.at[2],price:109.5},to:{index:hit.confirmedAt,price:109.5}});// valleys 109.5 and 110
  expect(hit.breakout).toBe('down');expect(top.bars[hit.confirmedAt].close).toBeLessThan(109.5);
  const bottom=path([120,100,110,99.8,109.5,100.1,115]),[mirror]=detectChartPatterns(bottom.bars,ids('triplebottom'),5,2,ON);
  expect(lastLine(mirror)).toEqual({from:{index:bottom.at[2],price:110.5},to:{index:mirror.confirmedAt,price:110.5}});// peaks 110.5 and 110
  expect(mirror.breakout).toBe('up');expect(bottom.bars[mirror.confirmedAt].close).toBeGreaterThan(110.5);
  const [unconfirmed]=detectChartPatterns(top.bars,ids('tripletop'),5,2);expect(lastLine(unconfirmed).from.price).toBe(lastLine(unconfirmed).to.price);
 });
 it('cup and handle: flat at the higher rim; inverted: flat at the lower rim',()=>{
  const cup=cupPath(100,120,100,120.3,114,125),[hit]=detectChartPatterns(cup,ids('cuphandle'),5,2,ON);// rims 120.5 and 120.8
  expect(lastLine(hit).from).toEqual({index:hit.pivots[2].index,price:120.8});expect(lastLine(hit).to).toEqual({index:hit.confirmedAt,price:120.8});
  expect(hit.breakout).toBe('up');expect(cup[hit.confirmedAt].close).toBeGreaterThan(120.8);
  const dome=cupPath(120,100,120,99.7,106,95),[mirror]=detectChartPatterns(dome,ids('invcuphandle'),5,2,ON);// rims 99.5 and 99.2
  expect(lastLine(mirror).from.price).toBe(99.2);expect(lastLine(mirror).to).toEqual({index:mirror.confirmedAt,price:99.2});
  expect(mirror.breakout).toBe('down');expect(dome[mirror.confirmedAt].close).toBeLessThan(99.2);
 });
 it('head and shoulders keeps its sloped neckline',()=>{
  const [hit]=detectChartPatterns(path([100,115,105,125,105.5,115.3,95]).bars,ids('headshoulders'),5,2);
  expect(lastLine(hit).from.price).not.toBe(lastLine(hit).to.price);
 });
});

describe('the signal bar closes beyond the line (SYNTHETIC)',()=>{
 // Double top 120.5, 109.5, 120.8 (last high at bar 24, known on bar 29). The close breaks the valley on bar 27 but is back above it on bar 29.
 const head=path([100,120,110,120.3]).bars.map(bar=>bar.close),tail=[118,114,108,109,111];
 it('a break before the pattern is known, with the close back inside on the known bar, is not reported then',()=>{
  expect(tag(detectChartPatterns(toBars([...head,...tail,112,112,112,112,112,112,112,112,112,112,112]),ids('doubletop'),5,2,ON))).toEqual([]);
 });
 it('it is reported on the first later bar whose own close is below the valley',()=>{
  const bars=toBars([...head,...tail,109,108,106,104,104,104,104,104,104,104,104]),[hit]=detectChartPatterns(bars,ids('doubletop'),5,2,ON);
  expect(hit).toMatchObject({confirmedAt:30,breakout:'down'});expect(bars[30].close).toBeLessThan(109.5);
 });
 it('a break before the pattern is known that holds on the known bar is reported on the known bar',()=>{
  const bars=toBars([...head,118,114,108,107,106,105,105,105,105,105,105]),[hit]=detectChartPatterns(bars,ids('doubletop'),5,2,ON);
  expect(hit).toMatchObject({confirmedAt:29,breakout:'down'});
 });
});

describe('one range is reported once, and a real breakout is never lost to a hit that did not fire',()=>{
 // The pivots at bars 8 to 48 converge; the window rolls over them, so two triangles are known before the same down-break on bar 47.
 const {bars}=path([100,120,105,117,108,114,109.5,112.5,110.5,125]);
 it('with breakout confirmation the earlier hit is kept and the one breaking out on the same bar and side is dropped',()=>{
  const hits=detectChartPatterns(bars,ids('triangle'),5,2,ON);
  expect(tag(hits)).toEqual(['triangle@47:down','triangle@55:up']);
  expect(hits[0].pivots.map(pivot=>pivot.index)).toEqual([8,16,24,32]);
  expect(hits[1].pivots.map(pivot=>pivot.index)).toEqual([24,32,40,48]);// shares pivots with the first, but that one broke out earlier
 });
 it('without breakout confirmation, hits of one id that share pivots and the reporting bar are reported once (outside bar)',()=>{
  const closes=path([100,120,105,116,108]).bars.map(bar=>bar.close);
  for(let k=33;k<=39;k++)closes.push(108+(111.5-108)*(k-32)/8);
  for(let k=40;k<=47;k++)closes.push(111.5);
  const outside=toBars(closes);outside[40]={...outside[40],high:114,low:108.2};// bar 40 is a pivot high and a pivot low
  expect(tag(detectChartPatterns(outside,ids('triangle'),5,2))).toEqual(['triangle@37','triangle@45']);
 });
 // Seeded walk 49 (pivot length 3): the triangle on pivots [69,76,88,90] breaks down on bar 94 and the next window [76,88,90,92] (three of four pivots
 // shared, its last pivot before that break) breaks down on bar 95: one consolidation, one report.
 it('a window rolled one pivot that breaks out a bar after the earlier hit on the same range is dropped',()=>{
  const bars=walk(49,300);
  expect(tag(detectChartPatterns(bars,ids('triangle'),3,2,ON)).filter(row=>/^triangle@(94|95):/.test(row))).toEqual(['triangle@94:down']);
  expect(tag(detectChartPatterns(bars,ids('triangle'),3,2)).length).toBeGreaterThan(2);
 });
 // A double top whose earlier window (pivots 8, 16, 24) never breaks its valley must not hide the rolled window (24, 32, 40), which breaks down on bar 48.
 it('a double top is not hidden by an earlier hit of the same id that never fired (pivot lengths 3 and 5)',()=>{
  const {bars}=path([100,120,110,120.3,112,120.1,111]);
  for(const pivotLength of [3,5]){
   const hits=detectChartPatterns(bars,ids('doubletop'),pivotLength,2,ON);
   expect(hits.map(hit=>[hit.pivots.map(pivot=>pivot.index),hit.confirmedAt,hit.breakout]),'pivot length '+pivotLength).toContainEqual([[24,32,40],48,'down']);
   expect(hits.some(hit=>hit.pivots[0].index===8),'the earlier window never fired').toBe(false);
  }
 });
});

/** 300 daily bars as "open high low close", comma separated. */
const real=walk(23,300);

describe('seeded synthetic series (WALK 23): causal, and every breakout is on a bar that is beyond its drawn line',()=>{
 for(const pivotLength of [3,5])for(const breakout of [true,false]){
  it(`pivot length ${pivotLength}, breakout ${breakout}: a prefix reports exactly the full run's hits known on it`,()=>{
   const full=detectChartPatterns(real,all,pivotLength,2,{breakout});expect(full.length).toBeGreaterThan(10);
   for(let end=20;end<=real.length;end+=3)expect(detectChartPatterns(real.slice(0,end),all,pivotLength,2,{breakout}),'prefix '+end).toEqual(full.filter(hit=>hit.confirmedAt<end));
  });
 }
 it('breakout hits: triangles and wedges before the apex and beyond a line, flat levels for doubles, triples and cups',()=>{
  let checked=0;
  for(const pivotLength of [3,5])for(const hit of detectChartPatterns(real,all,pivotLength,2,ON)){
   const close=real[hit.confirmedAt].close,label=`${hit.id}@${hit.confirmedAt} pl${pivotLength}`;
   if(hit.id==='triangle'||hit.id==='risingwedge'||hit.id==='fallingwedge'){
    const [upper,lower]=hit.lines;expect(upper.to.price,label).toBeGreaterThan(lower.to.price);
    if(hit.breakout==='up')expect(close,label).toBeGreaterThan(upper.to.price);else expect(close,label).toBeLessThan(lower.to.price);checked++;
   }
   if(hit.id==='doubletop'||hit.id==='doublebottom'||hit.id==='tripletop'||hit.id==='triplebottom'||hit.id==='cuphandle'||hit.id==='invcuphandle'){
    const line=lastLine(hit);expect(line.from.price,label).toBe(line.to.price);
    if(hit.breakout==='up')expect(close,label).toBeGreaterThan(line.to.price);else expect(close,label).toBeLessThan(line.to.price);checked++;
   }
  }
  expect(checked).toBeGreaterThan(10);
 });
 it('without breakout confirmation no two hits of one id share a pivot on one reporting bar',()=>{
  for(const pivotLength of [3,5]){
   const hits=detectChartPatterns(real,all,pivotLength,2);
   for(const [i,hit] of hits.entries())for(const other of hits.slice(0,i))
    if(other.id===hit.id&&other.confirmedAt===hit.confirmedAt)expect(other.pivots.some(p=>hit.pivots.some(q=>q.index===p.index)),`${hit.id}@${hit.confirmedAt}`).toBe(false);
  }
 });
});
