import {createDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {expect,it,vi} from 'vitest';
import {TRENDLINE_STATS_DEFAULTS} from '../../src/chart/trendline-stats-data';
import {annotationRecord} from '../chart/trendline-annotation-native-harness';
import {nativeResetHarness} from '../chart/native-drawing-reset-harness';

// Actual native popup callback, preview, controller/store/history and owned canonical
// publisher execute. DOM presentation and canvas recording remain controlled.
const active={...TRENDLINE_STATS_DEFAULTS,priceRange:true,alwaysShow:true,position:'below' as const};
const statsOf=(row:Record<string,unknown>):unknown=>(row.props as Record<string,unknown>|undefined)?.lvTrendlineStats;
function record(id:string,...members:unknown[]):SerializedDrawing{
 const member=members.length?members[0]:active;
 const row=annotationRecord(false),factory=createDrawing('trendline',{paneId:'price'})!.serialize();
 row.id=id;row.style=structuredClone(factory.style);delete row.text;
 row.props={lvTrendlineStats:structuredClone(member),futureSibling:{label:'SYNTHETIC retained sibling'}};
 return row;
}

it('a later selected nonportable Stats member refuses the entire batch before any preview and preserves existing Redo',async()=>{
 for(const member of [undefined,{schemaVersion:2,nested:{future:undefined}}]){
  const rows=[record('SYNTHETIC valid first'),record('SYNTHETIC opaque second',member)],f=await nativeResetHarness(rows);
  try{
   const initial=f.document.serialize();
   f.document.stageManagerMetadata(initial,{...initial,lvDrawingManager:{label:'SYNTHETIC pending redo'}});
   const prior=f.document.serialize();expect(f.document.undo()).toBe(true);
   const before=f.document.serialize(),native=f.core.controller.all(),defaults=f.core.controller.toolDefaults();
   const opening=f.open(),commands=f.paint.top.commands.length,intents=structuredClone(f.intents),publish=vi.fn(f.publishDefault);f.setPublish(publish);
   expect(()=>opening.actions.resetSettings()).toThrow(/statistics|Stats/i);
   expect(f.paint.top.commands).toHaveLength(commands);expect(f.intents).toEqual(intents);expect(publish).not.toHaveBeenCalled();
   expect(f.document.serialize()).toStrictEqual(before);expect(f.core.controller.all()).toStrictEqual(native);
   expect(f.core.controller.toolDefaults()).toStrictEqual(defaults);expect(f.core.controller.canUndo()).toBe(false);
   expect(f.document.redo()).toBe(true);expect(f.document.serialize()).toStrictEqual(prior);
   expect(f.document.redo()).toBe(false);
  }finally{f.dispose();}
 }
});

it('a selected supported reset preserves an unselected nonportable opaque Stats member exactly',async()=>{
 const opaque={schemaVersion:2,nested:{future:undefined},negativeZero:-0};
 const rows=[record('SYNTHETIC selected'),record('SYNTHETIC unselected',opaque)],f=await nativeResetHarness(rows);
 try{
  const before=f.document.serialize(),native=f.core.controller.all(),publish=vi.fn(f.publishDefault);f.setPublish(publish);
  f.open([rows[0].id]).actions.resetSettings();const after=f.document.all();
  expect(statsOf(after[0])).toEqual(TRENDLINE_STATS_DEFAULTS);
  expect(after[1]).toStrictEqual(rows[1]);expect(Object.hasOwn((statsOf(after[1]) as typeof opaque).nested,'future')).toBe(true);
  expect(Object.is((statsOf(after[1]) as typeof opaque).negativeZero,-0)).toBe(true);
  expect(f.core.controller.all()).toStrictEqual(native);expect(publish).toHaveBeenCalledTimes(1);
  expect(publish.mock.calls[0][0].count).toBe(1);expect(publish.mock.calls[0][0].changedCount).toBe(1);
  expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toStrictEqual(before);
 }finally{f.dispose();}
});

it('Stats-only Reset appends one canonical command after existing history and does not interpret extra version-one fields',async()=>{
 const opaque={...active,futureSetting:{value:7}},rows=[record('SYNTHETIC known'),record('SYNTHETIC extended version one',opaque)],f=await nativeResetHarness(rows);
 try{
  const original=f.document.serialize();
  f.document.stageManagerMetadata(original,{...original,lvDrawingManager:{label:'SYNTHETIC earlier command'}});
  const first=f.document.serialize(),opaqueBefore=f.document.all()[1];
  const obsolete={...first,lvDrawingManager:{label:'SYNTHETIC abandoned redo'}};
  f.document.stageManagerMetadata(first,obsolete);expect(f.document.undo()).toBe(true);
  const publish=vi.fn(f.publishDefault);f.setPublish(publish);f.open().actions.resetSettings();
  const accepted=f.document.serialize();expect(statsOf(f.document.all()[0])).toEqual(TRENDLINE_STATS_DEFAULTS);
  expect(f.document.all()[1]).toStrictEqual(opaqueBefore);expect(statsOf(f.document.all()[1])).toStrictEqual(opaque);expect(publish).toHaveBeenCalledTimes(1);
  expect(publish.mock.calls[0][0].count).toBe(2);expect(publish.mock.calls[0][0].changedCount).toBe(1);
  expect(f.document.redo()).toBe(false);
  expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toStrictEqual(first);
  expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toStrictEqual(original);expect(f.document.undo()).toBe(false);
  expect(f.document.redo()).toBe(true);expect(f.document.serialize()).toStrictEqual(first);
  expect(f.document.redo()).toBe(true);expect(f.document.serialize()).toStrictEqual(accepted);expect(f.document.redo()).toBe(false);
 }finally{f.dispose();}
});

it('retained Stats Reset callbacks cannot mutate after source or ordered-selection retirement, and a fresh selection remains usable',async()=>{
 for(const retirement of ['source','selection']){
  const rows=[record('SYNTHETIC old target'),record('SYNTHETIC current target')],f=await nativeResetHarness(rows);
  try{
   const opening=f.open([rows[0].id]),before=f.document.serialize(),native=f.core.controller.all(),publish=vi.fn(f.publishDefault);f.setPublish(publish);
   if(retirement==='source')f.retire();else f.core.controller.setSelection([rows[1].id]);
   const commands=f.paint.top.commands.length;
   expect(()=>opening.actions.resetSettings()).toThrow();expect(f.paint.top.commands).toHaveLength(commands);
   expect(publish).not.toHaveBeenCalled();expect(f.document.serialize()).toStrictEqual(before);
   expect(f.core.controller.all()).toStrictEqual(native);expect(f.document.undo()).toBe(false);
   if(retirement==='selection'){
    f.open([rows[1].id]).actions.resetSettings();expect(publish).toHaveBeenCalledTimes(1);
    expect(f.document.all()[0]).toStrictEqual(rows[0]);expect(statsOf(f.document.all()[1])).toEqual(TRENDLINE_STATS_DEFAULTS);
   }
  }finally{f.dispose();}
 }
});
