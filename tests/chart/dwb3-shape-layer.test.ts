// root wiring: the shape layer payload reads canonical rows only; a saved (pre-wave) drawing contributes nothing. SYNTHETIC fixtures.
import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {dwb3ShapePayload,logicalIndexOf} from '../../src/chart/dwb3-shape-layer';
import {patchTrendlineMarkers} from '../../src/chart/trendline-stats-data';
import {seedNewChannel} from '../../src/chart/channel-levels-data';
import {trendline,channel} from './dwb3-helpers';

describe('dwb3 shape layer payload',()=>{
 it('leaves out saved trendlines and channels (absent member = no painting)',()=>{
  expect(dwb3ShapePayload([trendline() as never,channel() as never]).rows).toEqual([]);
 });
 it('includes a trendline once a marker is on, and a seeded channel',()=>{
  const marked=patchTrendlineMarkers(trendline(),{schemaVersion:1,middlePoint:true,priceLabels:false,distance:false,angle:false});
  const rows=dwb3ShapePayload([marked as never,seedNewChannel(channel()) as never]).rows;
  expect(rows.map(row=>row.kind)).toEqual(['trendline','channel']);
 });
 it('skips hidden rows and other panes',()=>{
  const marked={...patchTrendlineMarkers(trendline(),{schemaVersion:1,middlePoint:true,priceLabels:true,distance:false,angle:false})};
  expect(dwb3ShapePayload([{...marked,visible:false} as never,{...marked,paneId:'pane-2'} as never]).rows).toEqual([]);
 });
 it('maps epoch ms to a fractional logical index',()=>{
  const bars=[{time:1000},{time:2000},{time:3000}];
  expect(logicalIndexOf(bars,1500)).toBe(0.5);expect(logicalIndexOf(bars,3000)).toBe(2);expect(logicalIndexOf(bars,500)).toBe(-0.5);expect(logicalIndexOf(bars,NaN)).toBeNull();
 });
 it('the adapter turns on the trendline and channel consumer flags only; fib and position stay off',()=>{
  const source=readFileSync('src/chart/adapter.ts','utf8');
  const named=[...source.matchAll(/'((?:trendline|channel|fib|position)\.[A-Za-z]+)'/g)].map(match=>match[1]).sort();
  expect(named).toEqual(['channel.background','channel.extend','channel.levels','trendline.angle','trendline.distance','trendline.middlePoint','trendline.pips','trendline.priceLabels']);/* Trendline.pips */
 });
});
