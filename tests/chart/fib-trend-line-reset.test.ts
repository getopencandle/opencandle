import {createDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {expect,it} from 'vitest';
import {nativeFibTrendLineDefaults} from '../../src/chart/fib-level-format-native';
import {readFibTrendLine} from '../../src/chart/fib-trend-line-data';
import {nativeResetHarness} from './native-drawing-reset-harness';
import {annotationRecord} from './trendline-annotation-native-harness';
import {fibBaselineHarness} from './fib-trend-line-painter-harness';
import {installNativeDrawingReset} from '../../src/chart/native-drawing-reset';
import {createNativeDrawingResetPublisher} from '../../src/chart/native-drawing-reset-publication';
import {realVelaChart} from '../helpers/real-vela-chart';
// the recorded facts (trendline visible true, linewidth 2, linestyle 2 = dashed, color #808080): Reset restores the fresh Fib's trend line.
const FRESH_FIB_TREND_LINE={schemaVersion:1,enabled:true,color:'#808080',width:2,style:'dashed'};
it.each([
 ['own undefined',undefined],
 ['extra own undefined',{schemaVersion:1,enabled:true,color:'#123456',width:2,style:'solid',future:undefined}],
 ['nested unknown',{schemaVersion:2,future:{empty:undefined,zero:-0}}],
] as const)('native popup Reset retains %s baseline exactly while resetting eligible settings',async(_label,member)=>{
 const row=createDrawing('fibretracement',{id:'SYNTHETIC baseline Reset',paneId:'price',createdAt:1,anchors:[{time:1000,price:100},{time:2000,price:200}],style:{lineColor:'#abcdef',lineWidth:7,lineStyle:'dotted'},text:{value:'SYNTHETIC reset text'} as NonNullable<SerializedDrawing['text']>,props:{lvFibTrendLine:member}})!.serialize(),f=await nativeResetHarness([row]);
 try{
  const before=f.document.serialize(),opening=f.document.all()[0],nativeBefore=f.core.controller.all()[0];
  expect(Object.hasOwn(opening.props!,'lvFibTrendLine')).toBe(true);expect((opening.props as Record<string,unknown>).lvFibTrendLine).toStrictEqual(member);expect((nativeBefore.props as Record<string,unknown>).lvFibTrendLine).toStrictEqual(member);expect(readFibTrendLine(opening.props,nativeFibTrendLineDefaults()).state).toBe('unavailable');
  f.open().actions.resetSettings();const after=f.document.all()[0];
  expect(Object.hasOwn(after.props!,'lvFibTrendLine')).toBe(true);expect((after.props as Record<string,unknown>).lvFibTrendLine).toStrictEqual(member);expect((f.core.controller.all()[0].props as Record<string,unknown>).lvFibTrendLine).toStrictEqual(member);expect(readFibTrendLine(after.props,nativeFibTrendLineDefaults()).state).toBe('unavailable');
  expect(after.text).toBeUndefined();expect(after.anchors).toStrictEqual(row.anchors);expect(after.style).toStrictEqual(createDrawing('fibretracement',{paneId:'price',createdAt:0})!.serialize().style);expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toStrictEqual(before);expect(f.document.undo()).toBe(false);
 }finally{f.dispose();}
});
it('known baseline-only native Reset writes explicit disabled defaults once even with default native style/text',async()=>{
 const defaults=nativeFibTrendLineDefaults(),row=createDrawing('fibretracement',{id:'SYNTHETIC known baseline Reset',paneId:'price',createdAt:1,anchors:[{time:1000,price:100},{time:2000,price:200}],props:{lvFibTrendLine:{...defaults,enabled:true,color:'#abcdef',width:7,style:'dotted'}}})!.serialize(),f=await nativeResetHarness([row]);
 try{const before=f.document.serialize();f.open().actions.resetSettings();expect((f.document.all()[0].props as Record<string,unknown>).lvFibTrendLine).toStrictEqual(FRESH_FIB_TREND_LINE);expect((f.core.controller.all()[0].props as Record<string,unknown>).lvFibTrendLine).toStrictEqual(FRESH_FIB_TREND_LINE);expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toStrictEqual(before);expect(f.document.undo()).toBe(false);}finally{f.dispose();}
});
it('mixed owned Trendline and Fib Reset publishes one complete canonical command',async()=>{
 const fib=createDrawing('fibretracement',{id:'SYNTHETIC mixed baseline Reset',paneId:'price',createdAt:1,anchors:[{time:1000,price:100},{time:2000,price:200}],props:{lvFibTrendLine:{...nativeFibTrendLineDefaults(),enabled:true}}})!.serialize(),line=annotationRecord(false),f=await nativeResetHarness([line,fib]);
 try{const before=f.document.serialize();f.open().actions.resetSettings();expect(f.document.all()[0].text).toBeUndefined();expect((f.document.all()[1].props as Record<string,unknown>).lvFibTrendLine).toStrictEqual(FRESH_FIB_TREND_LINE);expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toStrictEqual(before);expect(f.document.undo()).toBe(false);}finally{f.dispose();}
});
it('refuses default-level topology replacement before publication and restores the exact nondefault drawing',async()=>{
 const row=createDrawing('fibretracement',{id:'SYNTHETIC nondefault topology Reset',paneId:'price',createdAt:1,anchors:[{time:1000,price:100},{time:2000,price:200}],props:{lvFibTrendLine:{...nativeFibTrendLineDefaults(),enabled:true},levels:[{ratio:.2,color:'#abcdef',enabled:true,future:{kept:true}},{ratio:.7,color:'#123456',enabled:false}]}})!.serialize(),f=await nativeResetHarness([row]);
 try{const before=f.document.serialize(),native=f.core.controller.all();expect(()=>f.open().actions.resetSettings()).toThrow(/topology|Reset/i);expect(f.document.serialize()).toStrictEqual(before);expect(f.core.controller.all()).toStrictEqual(native);expect(f.document.undo()).toBe(false);}finally{f.dispose();}
});
it('owned native Reset clears interleaved cached baseline strokes through the actual scheduler',async()=>{
 const f=await fibBaselineHarness();let reset:ReturnType<typeof installNativeDrawingReset>|undefined;
 try{
  let popup:any=null,notifications=0;const notices:string[]=[];
  f.controller.popup=Object.create({syncPanel(){},isOpen(){return popup!==null;},close(){popup=null;},contains(){return false;},open(drawings:unknown,anchor:unknown,actions:unknown){popup={drawings,anchor,actions};}});
  f.controller.popupMulti=false;const real=await realVelaChart({renderer:f.renderer,core:f.core.controller,orchestrator:(f.chart as any).orchestrator});f.controller.intentCb=(intent:any)=>f.core.controller.onIntent(intent);
  const select=f.core.controller.port.setSelection;f.core.controller.port.setSelection=(ids:string[])=>{select(ids);f.controller.setSelection(ids);};
  const publisher=createNativeDrawingResetPublisher({document:f.document,assertMutable(){},begin:()=>({release(){}}),notify(){notifications++;return true;},quarantine:message=>notices.push(message)});
  reset=installNativeDrawingReset(f.renderer,real.chart,{document:f.document,captureOwner:f.host.captureOwner,assertMutable(){},publish:batch=>publisher.publish(batch),unavailable:message=>notices.push(message)});
  const row=createDrawing('fibretracement',{id:'SYNTHETIC cached baseline Reset',paneId:'price',createdAt:1,zIndex:5,anchors:[{time:1000000,price:100},{time:1240000,price:200}],props:{lvFibTrendLine:{...nativeFibTrendLineDefaults(),enabled:true,color:'#abcdef',width:5,style:'dashed'}}})!.serialize();
  (row as any).lvPaneBinding={schemaVersion:1,target:{kind:'price'}};
  f.setBoundary([10]);f.sync([row]);f.drain();const extra=()=>f.slices.at(-1)!.commands.filter(command=>command.op==='setLineDash'&&JSON.stringify(command.values[0])==='[20,15]');expect(extra().length).toBeGreaterThan(0);
  f.controller.openSettingsById(row.id,0,0);popup.actions.resetSettings();expect(notifications).toBe(1);f.drain();expect(extra()).toEqual([]);expect((f.document.all()[0].props as Record<string,unknown>).lvFibTrendLine).toStrictEqual(FRESH_FIB_TREND_LINE);expect(notices).toEqual([]);
  expect(f.document.undo()).toBe(true);expect((f.document.all()[0].props as any).lvFibTrendLine.enabled).toBe(true);expect(f.document.undo()).toBe(false);
 }finally{try{reset?.dispose();}finally{f.cleanup();}}
});
