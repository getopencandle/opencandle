import {createDrawing,type SerializedDrawing,type Vela} from '@luxalgo/vela';
import {expect,it,vi} from 'vitest';
import {TRENDLINE_STATS_DEFAULTS} from '../../src/chart/trendline-stats-data';
import {createNativeDrawingResetPublisher,NativeDrawingResetPublicationError} from '../../src/chart/native-drawing-reset-publication';
import {installNativeDrawingReset} from '../../src/chart/native-drawing-reset';
import {annotationRecord} from './trendline-annotation-native-harness';
import {nativeResetHarness} from './native-drawing-reset-harness';
import {resetAdapterFixture} from './native-drawing-reset-adapter-harness';
import {statsPainterHarness} from './trendline-stats-painter-harness';
import {realVelaChart} from '../helpers/real-vela-chart';

const enabled={schemaVersion:1,priceRange:true,percentChange:true,barsRange:true,dateTimeRange:true,alwaysShow:true,position:'below'};
const topStats=(f:any)=>{f.top.commands.length=0;f.render();return f.top.commands.filter((command:any)=>command.op==='fillText'&&/^(Price|Change|Bars|Time):/.test(command.values[0])).map((command:any)=>command.values[0]);};
function statsOnly(member:unknown=enabled):SerializedDrawing{
 const row=annotationRecord(false),fresh=createDrawing('trendline',{paneId:'price'})!.serialize();
 row.style=structuredClone(fresh.style);delete row.text;
 row.props={lvTrendlineStats:structuredClone(member),futureSibling:{label:'SYNTHETIC retained'}};
 return row;
}

it('actual native popup Reset changes canonical Stats even when native style and text already equal defaults',async()=>{
 const row=statsOnly(),f=await nativeResetHarness([row]);try{
  const nativeBefore=f.core.controller.all(),publish=vi.fn(f.publishDefault);f.setPublish(publish);
  f.open().actions.resetSettings();
  expect((f.document.all()[0].props as any).lvTrendlineStats).toEqual(TRENDLINE_STATS_DEFAULTS);
  expect((f.document.all()[0].props as any).futureSibling).toEqual(row.props!.futureSibling);
  expect(f.core.controller.all()).toEqual(nativeBefore);expect(publish).toHaveBeenCalledTimes(1);
  expect(publish.mock.calls[0][0].changedCount).toBe(1);
  expect(f.document.all()[0].anchors).toEqual(row.anchors);
 }finally{f.dispose();}
});

it('actual adapter Reset saves complete Stats defaults once and canonical Undo/Redo keeps the exact prior member',async()=>{
 const f=await resetAdapterFixture();try{
  const before=f.document.serialize() as any;before.drawings[0].props={lvTrendlineStats:structuredClone(enabled),futureSibling:{kept:true}};f.document.load(before);
  let saved:unknown;f.subscribe(()=>{saved=f.save();return true;});
  f.open().actions.resetSettings();const after=f.document.serialize() as any;
  expect(after.drawings[0].props).toEqual({lvTrendlineStats:TRENDLINE_STATS_DEFAULTS,futureSibling:{kept:true}});
  expect(after.drawings[0].text).toBeUndefined();expect(saved).toEqual(after);
  expect(f.state()).toEqual({notifications:1,reconciliations:0,drawingBatch:0,nativeDrawingReconciliationHold:0,analysisUnavailable:''});
  expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toEqual(before);expect(f.document.undo()).toBe(false);
  expect(f.document.redo()).toBe(true);expect(f.document.serialize()).toEqual(after);expect(f.document.redo()).toBe(false);
  expect(f.core.controller.history.undoStack).toHaveLength(1);
 }finally{f.dispose();}
});

it('multi-target actual Reset changes supported Stats but retains legacy omission and opaque future or invalid members',async()=>{
 const known=annotationRecord(false),legacy={...annotationRecord(false),id:'SYNTHETIC legacy Stats reset'},opaque={...annotationRecord(false),id:'SYNTHETIC future Stats reset'},invalid={...annotationRecord(false),id:'SYNTHETIC invalid Stats reset'};
 delete legacy.props;
 known.props={lvTrendlineStats:structuredClone(enabled),other:{keep:1}};
 opaque.props={lvTrendlineStats:{schemaVersion:2,range:{future:true}},other:{keep:2}};
 invalid.props={lvTrendlineStats:{...enabled,priceRange:'invalid'},other:{keep:3}};
 const rows=[known,legacy,opaque,invalid],f=await nativeResetHarness(rows);try{
  f.open().actions.resetSettings();const after=f.document.all();
  expect(after[0].props).toEqual({lvTrendlineStats:TRENDLINE_STATS_DEFAULTS,other:{keep:1}});
  expect(Object.hasOwn(after[1],'props')).toBe(Object.hasOwn(legacy,'props'));
  expect(after[2].props).toEqual(opaque.props);expect(after[3].props).toEqual(invalid.props);
  expect(after.every(row=>row.text===undefined)).toBe(true);
  expect(after.map(row=>row.id)).toEqual(rows.map(row=>row.id));
  expect(f.document.undo()).toBe(true);expect(f.document.all()).toEqual(rows);expect(f.document.undo()).toBe(false);
 }finally{f.dispose();}
});

it('all-off supported Stats and native default settings make repeat Reset a genuine no-op',async()=>{
 const row=statsOnly(TRENDLINE_STATS_DEFAULTS),f=await nativeResetHarness([row]);try{
  const before=f.document.serialize(),native=f.core.controller.all(),publish=vi.fn(f.publishDefault);f.setPublish(publish);
  f.open().actions.resetSettings();expect(publish).not.toHaveBeenCalled();expect(f.document.serialize()).toEqual(before);
  expect(f.core.controller.all()).toEqual(native);expect(f.document.undo()).toBe(false);expect(f.core.controller.canUndo()).toBe(false);
 }finally{f.dispose();}
});

it('a rejected or source-retired Stats Reset does not add a canonical command or alter native defaults',async()=>{
 for(const kind of ['rejected','retired']){const row=statsOnly(),f=await nativeResetHarness([row]);try{
  const before=f.document.serialize(),native=f.core.controller.all(),defaults=f.core.controller.toolDefaults();
  f.setPublish(batch=>{if(kind==='rejected')throw Error('SYNTHETIC reset rejection');f.retire();f.publishDefault(batch);});
  expect(()=>f.open().actions.resetSettings()).toThrow();expect(f.document.serialize()).toEqual(before);
  expect(f.core.controller.all()).toEqual(native);expect(f.core.controller.toolDefaults()).toEqual(defaults);
  expect(f.document.undo()).toBe(false);expect(f.core.controller.canUndo()).toBe(false);
 }finally{f.dispose();}}
});

it('accepted Stats Reset survives workspace observer rejection with its complete canonical command',async()=>{
 const f=await resetAdapterFixture();try{
  const before=f.document.serialize() as any;before.drawings[0].props={lvTrendlineStats:structuredClone(enabled)};f.document.load(before);
  let saved:any;f.subscribe(()=>{saved=f.save();return false;});
  expect(()=>f.open().actions.resetSettings()).toThrow(NativeDrawingResetPublicationError);
  expect(saved.drawings[0].props.lvTrendlineStats).toEqual(TRENDLINE_STATS_DEFAULTS);
  expect(f.document.serialize()).toEqual(saved);expect(f.state().analysisUnavailable).toContain('accepted');
  expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toEqual(before);
 }finally{f.dispose();}
});

it('replacement canonical state during accepted Stats notification remains authoritative',async()=>{
 const f=await resetAdapterFixture();try{
  const before=f.document.serialize() as any;before.drawings[0].props={lvTrendlineStats:structuredClone(enabled)};f.document.load(before);
  const replacement={...before,futureDocument:{label:'SYNTHETIC newer owner'}};
  f.subscribe(()=>{f.document.load(replacement);return true;});
  expect(()=>f.open().actions.resetSettings()).toThrow();expect(f.document.serialize()).toEqual(replacement);
  expect(f.document.undo()).toBe(false);expect(f.state().analysisUnavailable).toBe('');
 }finally{f.dispose();}
});

it('accepted Stats-only native Reset clears actual scheduled cached labels even when its final observer rejects',async()=>{
 for(const reject of [false,true]){
  const row=statsOnly();(row as any).lvPaneBinding={schemaVersion:1,target:{kind:'price'}};
  const f=await statsPainterHarness([row]);let reset:ReturnType<typeof installNativeDrawingReset>|undefined;
  try{
   let popup:any=null;const notices:string[]=[];
   f.controller.popup=Object.create({syncPanel(){},isOpen(){return popup!==null;},close(){popup=null;},contains(){return false;},open(drawings:any[],anchor:unknown,actions:any){popup={drawings,anchor,actions};}});
   f.controller.popupMulti=false;const real=await realVelaChart({renderer:f.renderer,core:f.core.controller,orchestrator:(f.chart as any).orchestrator});
   f.controller.intentCb=(intent:any)=>f.core.controller.onIntent(intent);
   const selection=f.core.controller.port.setSelection;
   f.core.controller.port.setSelection=(ids:string[])=>{selection(ids);f.controller.setSelection(ids);};
   let acceptedSave:any,notifications=0;
   const publisher=createNativeDrawingResetPublisher({document:f.document,assertMutable(){},begin:()=>({release(){}}),notify(){notifications++;acceptedSave=publisher.captureReadOnly();if(reject)throw Error('SYNTHETIC late observer rejection');},quarantine:message=>notices.push(message)});
   reset=installNativeDrawingReset(f.renderer,real.chart,{document:f.document,captureOwner:f.host.captureOwner,assertMutable(){},publish:batch=>publisher.publish(batch),unavailable:message=>notices.push(message)});
   f.setBoundary([10]);f.drain();expect(f.composites.at(-1)).toEqual([]);const shown=topStats(f);expect(shown).toHaveLength(4);
   expect(shown.slice(0,3)).toEqual(['Price: +100.00','Change: +100.00%','Bars: 2']);
   const before=f.composites.length;f.controller.openSettingsById(row.id,0,0);
   if(reject)expect(()=>popup.actions.resetSettings()).toThrow();else popup.actions.resetSettings();
   expect(acceptedSave.drawings[0].props.lvTrendlineStats).toEqual(TRENDLINE_STATS_DEFAULTS);
   expect(notifications).toBe(1);f.drain();expect(f.composites.length).toBeGreaterThan(before);expect(f.composites.at(-1)).toEqual([]);expect(topStats(f)).toEqual([]);
   expect((f.document.all()[0].props as any).lvTrendlineStats).toEqual(TRENDLINE_STATS_DEFAULTS);
   expect(f.document.undo()).toBe(true);expect((f.document.all()[0].props as any).lvTrendlineStats).toEqual(enabled);
   expect(f.document.undo()).toBe(false);if(reject)expect(notices.join(' ')).toContain('accepted');else expect(notices).toEqual([]);
  }finally{reset?.dispose();f.cleanup();}
 }
});

it('nonportable opaque Stats refuse before preview instead of losing explicit or nested own undefined',async()=>{
 for(const member of [undefined,{schemaVersion:2,future:undefined}]){
  const row=annotationRecord(false);row.props={lvTrendlineStats:member};const f=await nativeResetHarness([row]);try{
   const before=f.document.serialize(),native=f.core.controller.all(),opening=f.open(),commands=f.paint.top.commands.length;
   expect(()=>opening.actions.resetSettings()).toThrow(/statistics|Stats/i);
   expect(f.document.serialize()).toStrictEqual(before);expect(f.core.controller.all()).toStrictEqual(native);
   expect(f.paint.top.commands).toHaveLength(commands);expect(f.document.undo()).toBe(false);expect(f.core.controller.canUndo()).toBe(false);
  }finally{f.dispose();}
 }
});

it('opaque negative zero remains exact while eligible native style and text reset',async()=>{
 const row=annotationRecord(false);row.props={lvTrendlineStats:{schemaVersion:2,future:-0}};
 const f=await nativeResetHarness([row]);try{
  f.open().actions.resetSettings();const after=f.document.all()[0];
  expect(after.text).toBeUndefined();expect(Object.is((after.props as any).lvTrendlineStats.future,-0)).toBe(true);
  expect(f.document.undo()).toBe(true);expect(f.document.all()).toStrictEqual([row]);
 }finally{f.dispose();}
});
