import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import React from 'react';
import {mountControlledComponent} from '../helpers/alert-dialog-harness';
import {runIdleSteps} from '../../src/ui/startup-idle';
import {ChartBottomToolbar,lazyServedRows,type ChartBottomToolbarProps} from '../../src/ui/bottom-toolbar';
import {BOTTOM_RANGES} from '../../src/chart/bottom-toolbar';
import {StartupDeferred} from '../../src/ui/StartupDeferred';
import {chartBuildStaggered,noteChartMounting,staggerNextChartBuild} from '../../src/ui/chart-build-queue';
import {runInSeparateTasks,startupPrewarmSteps} from '../../src/ui/startup-prewarm';
import {DEMO_SYMBOLS} from '../../src/domain/fixtures';

// Startup splits its long tasks and paints the chart before the rail panel and the range tooltips.
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

describe('runIdleSteps',()=>{
 it('runs every step in order, skips a throwing one, then calls done',async()=>{
  const order:string[]=[];const done=vi.fn();
  runIdleSteps([()=>order.push('a'),()=>{throw new Error('synthetic');},()=>order.push('c')],done);
  expect(order).toEqual([]);
  await vi.waitFor(()=>expect(done).toHaveBeenCalledOnce());
  expect(order).toEqual(['a','c']);
 });
 it('packs steps into an idle callback while it has time left and stops when cancelled',()=>{
  const queued:Array<(deadline:{timeRemaining():number})=>void>=[];let left=20;
  vi.stubGlobal('requestIdleCallback',(run:(deadline:{timeRemaining():number})=>void)=>{queued.push(run);return queued.length;});
  vi.stubGlobal('cancelIdleCallback',vi.fn());
  const ran:number[]=[];const done=vi.fn();
  const steps=[0,1,2,3].map(index=>()=>{ran.push(index);left-=10;});
  const cancel=runIdleSteps(steps,done,{sliceMs:6});
  queued.shift()!({timeRemaining:()=>left});
  expect(ran).toEqual([0,1]);expect(done).not.toHaveBeenCalled();
  cancel();expect(queued.length).toBe(1);left=100;queued.shift()!({timeRemaining:()=>left});
  expect(ran).toEqual([0,1]);expect(done).not.toHaveBeenCalled();
 });
});

describe('lazy range tooltips',()=>{
 const base:ChartBottomToolbarProps={chartReady:false,timezone:'UTC',adjustment:'split-adjusted',now:()=>0,onRange:()=>{},onGoTo:()=>{},onTimezone:()=>{}};
 it('are not evaluated while rendering, resolve once a chart is open, and match the eager map',async()=>{
  const calls:string[]=[];
  const answer=(preset:string)=>preset==='1D'?null:{interval:'1W',tooltip:preset+' in 1 week intervals'};
  const lazy=lazyServedRows(BOTTOM_RANGES.map(row=>[row.preset,()=>{calls.push(row.preset);return answer(row.preset);}] as const));
  let props:ChartBottomToolbarProps={...base,served:lazy};
  const view=mountControlledComponent(()=>ChartBottomToolbar(props));view.settle();
  const button=(preset:string)=>view.find(node=>node.type==='button'&&node.props['data-name']===BOTTOM_RANGES.find(row=>row.preset===preset)!.dataName);
  expect(calls).toEqual([]);
  expect(button('5Y').props.title).toBe(BOTTOM_RANGES.find(row=>row.preset==='5Y')!.tooltip);
  props={...props,chartReady:true};view.settle();
  await vi.waitFor(()=>{view.settle();expect(calls.length).toBe(BOTTOM_RANGES.length);});
  view.settle();
  expect(button('5Y').props.title).toBe('5Y in 1 week intervals');
  expect(button('1D').props.disabled).toBe(true);
  // The plain map App used to pass still renders the same way, synchronously.
  const eager:ChartBottomToolbarProps={...base,chartReady:true,served:Object.fromEntries(BOTTOM_RANGES.map(row=>[row.preset,answer(row.preset)]))};
  const plain=mountControlledComponent(()=>ChartBottomToolbar(eager));plain.settle();
  const plainButton=(preset:string)=>plain.find(node=>node.type==='button'&&node.props['data-name']===BOTTOM_RANGES.find(row=>row.preset===preset)!.dataName);
  expect(plainButton('5Y').props.title).toBe('5Y in 1 week intervals');expect(plainButton('1D').props.disabled).toBe(true);
 });
});

describe('StartupDeferred',()=>{
 it('renders nothing while held, mounts on an idle slice after the hold clears, then stays mounted',async()=>{
  let hold=true;const child=React.createElement('span',{'data-probe':'rail'},'Rail');
  const view=mountControlledComponent(()=>StartupDeferred({hold,children:child}));view.settle();
  expect(view.text()).toBe('');
  hold=false;view.settle();
  await vi.waitFor(()=>{view.settle();expect(view.text()).toBe('Rail');});
  hold=true;view.settle();expect(view.text()).toBe('Rail');
 });
 it('mounts after maxWaitMs when the startup never reaches a chart',()=>{
  vi.useFakeTimers();
  const view=mountControlledComponent(()=>StartupDeferred({hold:true,maxWaitMs:3000,children:'Rail'}));view.settle();
  vi.advanceTimersByTime(2999);view.settle();expect(view.text()).toBe('');
  vi.advanceTimersByTime(1);view.settle();expect(view.text()).toBe('Rail');
 });
});

describe('startup chart build and prewarm',()=>{
 it('staggerNextChartBuild queues only the next lone mount',()=>{
  staggerNextChartBuild();noteChartMounting();expect(chartBuildStaggered()).toBe(true);
  noteChartMounting();expect(chartBuildStaggered()).toBe(false);
 });
 it('runs the demo prewarm one step per task, then the render',async()=>{
  expect(startupPrewarmSteps()).toHaveLength(DEMO_SYMBOLS.length+1);
  const order:string[]=[];let then=false;
  runInSeparateTasks([()=>order.push('a'),()=>{throw new Error('synthetic');},()=>order.push('c')],()=>{then=true;});
  expect(order).toEqual([]);
  await vi.waitFor(()=>expect(then).toBe(true));
  expect(order).toEqual(['a','c']);
 });
 it('wiring: main.tsx, App and the lv scheme',()=>{
  const main=readFileSync('src/main.tsx','utf8'),app=readFileSync('src/ui/App.tsx','utf8'),electron=readFileSync('electron/main.cjs','utf8');
  expect(main).toContain('staggerNextChartBuild();');expect(main).toContain('runInSeparateTasks(startupPrewarmSteps(),()=>createRoot(');
  expect(app).toContain("<StartupDeferred hold={loaded?!chart:startupView.phase==='loading'}>{activeRailPanel?.render()}<LazySurfacesPrefetch/><IntervalMenuPrewarm datasets={intervalUniverse} current={chartIdentity} state={workspace.intervals}/></StartupDeferred>"); // The lazy-dialog prefetch and the interval-menu prewarm share the slot
  expect(app).toContain('return lazyServedRows(BOTTOM_RANGES.map(row=>[row.preset,()=>fittedBottomRange(row,servable,bottomCapacity)] as const));');
  expect(electron).toContain("privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, codeCache: true }");
 });
});
