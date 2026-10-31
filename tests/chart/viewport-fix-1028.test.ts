import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {createIntervalSpacingCarry,typicalBarStep} from '../../src/chart/interval-spacing-carry';
import {createViewportDeferral} from '../../src/chart/viewport-deferral';
import {refitViewportForInterval} from '../../src/ui/workspace-intervals';

const DAY=86400,WIDTH=1200,MARGIN=6;
const source=(path:string)=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const times=(count:number,step:number)=>Array.from({length:count},(_,index)=>1_700_000_000+index*step);
const series={'1D':times(500,DAY),'1W':times(101,7*DAY),'1M':times(24,30*DAY)} as const;
type Interval=keyof typeof series;

/** A renderer with vela's LV zoom-out bound: spacing never shows more than all bars plus MARGIN. A feed keeps the spacing. */
function fakeRenderer(){
 let bars=500,viewport={barSpacing:6,rightOffset:3};
 const clamp=(barSpacing:number)=>Math.max(WIDTH/(bars+MARGIN),barSpacing);
 const renderer={coords:{getViewport:()=>viewport},scene:{style:{margins:{right:3}}},
  applyViewport:(next:{barSpacing:number;rightOffset:number})=>{viewport={barSpacing:clamp(next.barSpacing),rightOffset:next.rightOffset};},
  feed:(count:number)=>{bars=count;viewport={barSpacing:viewport.barSpacing,rightOffset:3};},
  /** Any later interaction applies the bound (what the desk showed on 1W). */
  interact:()=>renderer.applyViewport(viewport),
  zoom:(barSpacing:number)=>renderer.applyViewport({barSpacing,rightOffset:3}),
  visibleBars:()=>Math.min(bars,Math.round(WIDTH/viewport.barSpacing))};
 return renderer;
}
/** The adapter's applyMarketInput order: begin before the feed, finish after it. */
function switcher(){
 const renderer=fakeRenderer(),carry=createIntervalSpacingCarry(typicalBarStep(series['1D']));
 return {renderer,to(interval:Interval){const next=series[interval],kept=carry.begin(renderer,typicalBarStep(next));renderer.feed(next.length);if(kept!==null)carry.finish(renderer,kept);renderer.interact();return renderer.visibleBars();},
  derived(interval:Interval){carry.reset(typicalBarStep(series[interval]));}};
}

describe('interval round trips keep the bar spacing (#3)',()=>{
 it('1D <-> 1W three times comes back to the same 200 daily bars',()=>{
  const chart=switcher();expect(chart.renderer.visibleBars()).toBe(200);
  for(let trip=0;trip<3;trip++){expect(chart.to('1W')).toBe(101);expect(chart.to('1D')).toBe(200);}
 });
 it('1D <-> 1M (24 bars) also returns to 200 daily bars, twice',()=>{
  const chart=switcher();
  for(let trip=0;trip<2;trip++){expect(chart.to('1M')).toBe(24);expect(chart.to('1D')).toBe(200);}
  expect(chart.to('1W')).toBe(101);expect(chart.to('1M')).toBe(24);expect(chart.to('1D')).toBe(200);
 });
 it('a zoom the user makes on the coarse interval is the spacing carried back',()=>{
  const chart=switcher();chart.to('1W');chart.renderer.zoom(30);expect(chart.to('1D')).toBe(40);
 });
 it('a derived visit starts a new spacing history without losing the bar step',()=>{
  const chart=switcher();chart.to('1W');chart.derived('1W');chart.renderer.zoom(20);expect(chart.to('1D')).toBe(60);
 });
 it('the same interval (a symbol change, a reload) leaves the spacing alone',()=>{
  const carry=createIntervalSpacingCarry(DAY),renderer=fakeRenderer();expect(carry.begin(renderer,DAY)).toBeNull();
  expect(createIntervalSpacingCarry().begin(renderer,DAY)).toBeNull();
 });
 it('a view at the latest bar drops its saved range; a view scrolled back keeps its bar count and end',()=>{
  const days=series['1D'],weeks=series['1W'];
  expect(refitViewportForInterval({from:days[300],to:days[499]},days,weeks)).toBeNull();
  // The clamped weekly range (all 101 bars) no longer halves the daily view on the way back.
  expect(refitViewportForInterval({from:weeks[0],to:weeks[100]},weeks,days)).toBeNull();
  const back=refitViewportForInterval({from:days[100],to:days[199]},days,weeks)!,end=weeks.filter(time=>time<=days[199]).length-1;
  expect(back.to).toBe(weeks[end]);expect(back.from).toBe(weeks[Math.max(0,end-99)]);
 });
});

describe('a viewport set during a bar write applies to the new bars (#3)',()=>{
 it('waits for the write, then applies the newest range once',async()=>{
  const applied:unknown[]=[],deferral=createViewportDeferral(range=>applied.push(range));
  let finish!:(value:string)=>void;const write=deferral.track(new Promise<string>(resolve=>{finish=resolve;}));
  deferral.set({from:1,to:2});deferral.set({from:3,to:4});expect(applied).toEqual([]);expect(deferral.pending()).toEqual({from:3,to:4});
  let seen:unknown[]|null=null;const outer=write.then(()=>{seen=[...applied];});finish('ok');await outer;
  expect(seen).toEqual([{from:3,to:4}]);expect(deferral.pending()).toBeNull();
  deferral.set({from:5,to:6});expect(applied).toEqual([{from:3,to:4},{from:5,to:6}]);
 });
 it('applies after a failed write too, and only after the last of two writes',async()=>{
  const applied:unknown[]=[],deferral=createViewportDeferral(range=>applied.push(range));
  let fail!:(error:Error)=>void,done!:()=>void;
  const first=deferral.track(new Promise<void>((_,reject)=>{fail=reject;})),second=deferral.track(new Promise<void>(resolve=>{done=resolve;}));
  deferral.set({from:1,to:2});fail(new Error('x'));await first.catch(()=>{});expect(applied).toEqual([]);
  done();await second;expect(applied).toEqual([{from:1,to:2}]);
 });
 it('the adapter routes setViewport and both bar writes through it',()=>{
  const text=source('src/chart/adapter.ts');
  expect(text).toMatch(/setViewport:\(range:\{from:number;to:number\}\)=>\{validateViewport\(range\);[^\n]*else viewportDeferral\.set\(range\);\}/);
  expect(text).toMatch(/viewportDeferral\.track\)\(marketQueue\.set\(/);expect(text).toMatch(/viewportDeferral\.track\)\(transaction\.result\)/);
 });
});

describe('leaving a derived type opens fitted (#4)',()=>{
 it('Renko or Kagi back to a time chart runs resetView; entering one still does',()=>{
  const text=source('src/chart/adapter.ts');
  expect(text).toMatch(/else if\(fedDerived\?fedDerivedKey!==previousDerivedKey:previousDerivedKey!==null&&fedDerivedKey===null\)try\{[^\n]*resetView/);
  expect(text).toMatch(/spacingCarry\.reset\(nextStep\)/);
 });
});
