// fix 1 (batch-1019b review): a channel placed after the update gets its LV level defaults in the canonical document, in the same undo step as the
// placement, and they survive save/reload and later native captures that do not carry the member. SYNTHETIC rows; the real LosslessDrawingDocument runs.
import {describe,expect,it} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {applyChannelSeeds} from '../../src/chart/channel-seed';
import {readChannelLevels} from '../../src/chart/channel-levels-data';
import {channel} from './dwb3-helpers';

const known=new Set(['parallelchannel','trendline']);
const native=(id:string)=>({...channel(),id}) as unknown as Record<string,unknown>;
const channelRow=(document:LosslessDrawingDocument,id:string)=>document.all().find(row=>row.id===id)!;
// What the native store hands back after a place: the vela ParallelChannel keeps no props member, so the row never carries lvChannel.
const placed=()=>{const document=new LosslessDrawingDocument();document.mergeRenderable([native('c1')],known,true);return document;};

describe('channel seeding lands in the canonical document',()=>{
 it('the native placement alone leaves the channel legacy; seeding makes it supported in the same history step',()=>{
  const document=placed();
  expect(readChannelLevels(channelRow(document,'c1').props).state).toBe('legacy');
  expect(applyChannelSeeds(document,new Set(['c1']),known,new Set())).toBe(true);
  const state=readChannelLevels(channelRow(document,'c1').props);
  expect(state.state).toBe('supported');
  if(state.state==='supported'){expect(state.settings.levels[0]).toMatchObject({enabled:true,ratio:0.5});expect(state.settings.background.enabled).toBe(true);}
  // One undo removes the placement and the seed together; no separate seed step remains.
  expect(document.undo()).toBe(true);expect(document.all()).toEqual([]);expect(document.undo()).toBe(false);
 });
 it('survives save and reload, and a later native capture that lacks the member',()=>{
  const document=placed();applyChannelSeeds(document,new Set(['c1']),known,new Set());
  const reloaded=new LosslessDrawingDocument();reloaded.load(JSON.parse(JSON.stringify(document.serialize())));
  expect(readChannelLevels(channelRow(reloaded,'c1').props).state).toBe('supported');
  const moved=native('c1');(moved.anchors as Array<{price:number}>)[0].price=101;
  document.mergeRenderable([moved],known,true);
  expect(readChannelLevels(channelRow(document,'c1').props).state).toBe('supported');
 });
 it('only the listed legacy channels change; saved channels, other ids and other types are untouched',()=>{
  const document=new LosslessDrawingDocument();document.mergeRenderable([native('c1'),native('c2')],known,true);
  const before=channelRow(document,'c2');
  applyChannelSeeds(document,new Set(['c1']),known,new Set());
  expect(channelRow(document,'c2')).toEqual(before);
  expect(applyChannelSeeds(document,new Set(['c1']),known,new Set())).toBe(false);
  expect(applyChannelSeeds(document,new Set(['nope']),known,new Set())).toBe(false);
 });
 it('a retained (unavailable) channel is never rewritten',()=>{
  const document=placed(),before=channelRow(document,'c1');
  expect(applyChannelSeeds(document,new Set(['c1']),known,new Set(['c1']))).toBe(false);expect(channelRow(document,'c1')).toEqual(before);
 });
});
