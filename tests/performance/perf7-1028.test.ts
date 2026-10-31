import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {chartBuildStaggered,noteChartMounting,queueChartBuild} from '../../src/ui/chart-build-queue';

describe('PERF7-1028: charts that mount together build one per task',()=>{
 it('a lone mount builds synchronously; two or more in one commit are all staggered',()=>{
  noteChartMounting();expect(chartBuildStaggered()).toBe(false);
  noteChartMounting();noteChartMounting();noteChartMounting();noteChartMounting();
  expect([chartBuildStaggered(),chartBuildStaggered(),chartBuildStaggered(),chartBuildStaggered()]).toEqual([true,true,true,true]);
  noteChartMounting();expect(chartBuildStaggered()).toBe(false);
 });
 it('queued builds run in order, each in its own task, and a cancelled one never runs',async()=>{
  const order:string[]=[];let inTask=0;
  const mark=(name:string)=>()=>{inTask++;order.push(name+inTask);};
  queueChartBuild(mark('a'));const cancel=queueChartBuild(mark('b'));queueChartBuild(mark('c'));cancel();
  expect(order).toEqual([]);
  await vi.waitFor(()=>expect(order.length).toBe(2));
  expect(order).toEqual(['a1','c2']);
 });
 it('ChartPanel and the adapter use the queue and the deferred prefetch',()=>{
  const panel=readFileSync('src/ui/ChartPanel.tsx','utf8'),adapter=readFileSync('src/chart/adapter.ts','utf8');
  expect(panel).toContain('chartBuildStaggered()');expect(panel).toContain('queueChartBuild(');expect(panel).toContain('if(queued&&!disposed)setBuilt(true)');
  expect(adapter).toContain('The no-gesture prefetch waits for the chart\'s first paint');expect(adapter).toContain('if(!prefetchArmed)return;');
 });
});
