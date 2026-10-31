import {createDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {expect,it} from 'vitest';
import {drawingDraftChanges,drawingEditor,patchDrawingProperties} from '../../src/chart/drawing-port';
import {templateProperties} from '../../src/chart/drawing-manager';
import {fibLevelColor,fibLevelColorValues} from '../../src/ui/fib-level-colors';
import {nativeDrawingHarness,drawingProjection} from '../chart/drawing-native-harness';
import {templateAdapterHarness} from '../chart/drawing-template-adapter-harness';
import {duplicateAdapterFixture} from '../chart/drawing-duplicate-adapter-harness';
// the recorded facts (trendline visible true, linewidth 2, linestyle 2 = dashed, color #808080): the trend line of the fresh Fib fixtures below.
const FRESH_FIB_TREND_LINE={schemaVersion:1,enabled:true,color:'#808080',width:2,style:'dashed'};

// Independent source/model/painter pipeline evidence. The actual bulk draft
// helper runs, but this file does not mount DrawingDialog or claim GUI pixels.
const bars=[1000,1060,1120,1180,1240].map(time=>({time,open:100,high:200,low:90,close:150,volume:10}));
const chosen='rgba(29,93,177,0.35)';
function fib(defaultLevels=false):SerializedDrawing {
 const row=createDrawing('fibretracement',{id:'SYNTHETIC independent one-color Fib',paneId:'price',zIndex:4,anchors:[{time:1000000,price:100},{time:1240000,price:200}]})!.serialize();
 const levels=defaultLevels?(row.props!.levels as any[]):[-.5,0,.5,1.5].map((ratio,index)=>({ratio,color:index%2?'#00ff00':'#ff0000',enabled:index!==1,label:'SYNTHETIC level '+index}));
 row.props={...row.props,reverse:false,levels:levels.map((level,index)=>({...level,color:index%2?'#00ff00':'#ff0000',enabled:index%4!==1,futureOrdinal:{index,missing:undefined,negativeZero:-0}}))};
 (row as any).futureRecord={retained:'SYNTHETIC',missing:undefined,negativeZero:-0};
 (row.anchors[0] as any).futureAnchor={retained:'SYNTHETIC'};
 return row;
}
function colorPatch(row:SerializedDrawing,color=chosen){
 const editor=drawingEditor(row,bars),values=fibLevelColorValues(editor,editor.values,color);
 return{editor,values,properties:drawingDraftChanges(editor,values,editor.anchors).properties};
}
function assertOnlyColorsChanged(before:SerializedDrawing,next:SerializedDrawing,color:string){
 const expected=structuredClone(before);
 for(const level of expected.props!.levels as any[])level.color=color;
 expected.props!.lvFibTrendLine={...FRESH_FIB_TREND_LINE,color};
 expect(next).toStrictEqual(expected);
 for(const level of next.props!.levels as any[]){expect(Object.hasOwn(level.futureOrdinal,'missing')).toBe(true);expect(Object.is(level.futureOrdinal.negativeZero,-0)).toBe(true);}
}

it('bulk draft changes every retained default slot including disabled, preserving exact unrelated data',()=>{
 const row=fib(true),before=structuredClone(row),{editor,values,properties}=colorPatch(row);
 expect(editor.levels).toHaveLength(24);expect(fibLevelColor(editor,editor.values)).toBe('');expect(fibLevelColor(editor,values)).toBe(chosen);
 expect(Object.keys(properties)).toHaveLength(25);expect(Object.keys(properties).filter(key=>/^levels\.\d+\.color$/.test(key))).toHaveLength(24);expect(properties['lvFibTrendLine.color']).toBe(chosen);
 expect(row).toStrictEqual(before);expect(editor.values).not.toBe(values);
 const next=patchDrawingProperties(row,properties);assertOnlyColorsChanged(row,next,chosen);
 expect((next.props!.levels as any[]).some(level=>!level.enabled)).toBe(true);
});

it.each(['rgba(29,93,177,0)','rgba(29,93,177,0.35)','rgba(29,93,177,1)'])('actual native strokes, text and fills consume the selected %s without changing level geometry',async color=>{
 const native=await nativeDrawingHarness();try{
  const row=fib(),next=patchDrawingProperties(row,colorPatch(row,color).properties);
  native.controller.fromJSON({version:1,drawings:[row]});const prices=native.controller.store.get(row.id).levelLines(drawingProjection).map((level:any)=>level.price);
  native.controller.updateMany([{id:row.id,patch:next}]);const model=native.controller.store.get(row.id),commands=native.paint(row.id),enabled=(next.props!.levels as any[]).filter(level=>level.enabled);
  expect(model.levelLines(drawingProjection).map((level:any)=>level.price)).toEqual(prices);
  expect(model.levels.map((level:any)=>level.color)).toEqual(Array(4).fill(color));
  const strokes=commands.filter(command=>command.op==='stroke'),fills=commands.filter(command=>command.op==='fillRect'),texts=commands.filter(command=>command.op==='fillText');
  expect(strokes).toHaveLength(enabled.length);expect(strokes.every(command=>command.color===color&&command.alpha===1)).toBe(true);
  expect(fills).toHaveLength(enabled.length-1);expect(fills.every(command=>command.color===color&&command.alpha===0.06)).toBe(true);
  expect(texts.length).toBeGreaterThanOrEqual(enabled.length);expect(texts.every(command=>command.color===color)).toBe(true);
  expect(texts.some(command=>command.values[0]==='SYNTHETIC level 1')).toBe(false);
 }finally{native.dispose();}
});

it('actual owned single edit creates one command, repeats as no-op, and reopens committed colors',async()=>{
 const f=await templateAdapterHarness([fib()],undefined,{bars});try{
  const row=f.document.all()[0] as unknown as SerializedDrawing,before=f.document.serialize(),{properties}=colorPatch(row);
  expect(f.edit(row.id,properties)).toEqual({accepted:true,changed:true});const accepted=f.document.serialize(),next=f.document.all()[0] as unknown as SerializedDrawing;
  // The fixture enters through the public import/binding boundary, which
  // deliberately omits own undefined. Preserve the actual opened canonical
  // values exactly; direct in-memory patch coverage above keeps the raw checks.
  const openedLevels=row.props!.levels as any[];
  expect(openedLevels.every(level=>!Object.hasOwn(level.futureOrdinal,'missing'))).toBe(true);
  expect(openedLevels.every(level=>Object.is(level.futureOrdinal.negativeZero,-0))).toBe(true);
  const expected=structuredClone(row);for(const level of expected.props!.levels as any[])level.color=chosen;
 expected.props!.lvFibTrendLine={...FRESH_FIB_TREND_LINE,color:chosen};
  expect(next).toStrictEqual(expected);expect(f.state()).toMatchObject({notifications:1,nativeEdited:1,reconciliations:0,analysisUnavailable:''});
  const state=f.state();expect(f.edit(row.id,colorPatch(next).properties)).toEqual({accepted:true,changed:false});expect(f.state()).toEqual(state);
  expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toStrictEqual(before);expect(f.document.undo()).toBe(false);
  expect(f.document.redo()).toBe(true);expect(f.document.serialize()).toStrictEqual(accepted);
  const saved=f.save();f.load(saved);expect(f.document.serialize()).toStrictEqual(saved);
  expect(f.native.controller.store.get(row.id).levels.map((level:any)=>level.color)).toEqual(Array(4).fill(chosen));
 }finally{f.native.dispose();}
});

it('the accepted common colors propagate through the existing owned template batch without copying source geometry or opaque metadata',async()=>{
 const source=fib(),colored=patchDrawingProperties(source,colorPatch(source).properties),target={...fib(),id:'SYNTHETIC independent template target',anchors:[{time:1060000,price:110},{time:1180000,price:190}]} as SerializedDrawing;
 (target.props!.levels as any[])[0].futureOrdinal={targetOnly:'SYNTHETIC',missing:undefined,negativeZero:-0};
 const f=await templateAdapterHarness([source,target],templateProperties(colored),{bars});try{
  f.select([target.id]);const before=f.document.serialize(),expectedTarget=f.document.all()[1];
  expect(f.batches.commit(f.batches.prepare([target.id],'synthetic-template')).changed).toBe(true);
  const changed=f.document.all()[1];expect(changed.anchors).toEqual(expectedTarget.anchors);expect((changed.props as any).levels.map((level:any)=>level.color)).toEqual(Array(4).fill(chosen));
  expect((changed.props as any).levels[0].futureOrdinal).toStrictEqual((expectedTarget.props as any).levels[0].futureOrdinal);
  expect(f.document.all()[0]).toStrictEqual((before.drawings as any[])[0]);expect(f.state()).toMatchObject({notifications:1,nativeEdited:1,analysisUnavailable:''});
  const state=f.state();expect(f.batches.commit(f.batches.prepare([target.id],'synthetic-template')).changed).toBe(false);expect(f.state()).toEqual(state);
  expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toStrictEqual(before);expect(f.document.undo()).toBe(false);
 }finally{f.native.dispose();}
});

it('actual Duplicate retains committed colors and ordinal metadata in the copied canonical and native records',async()=>{
 const row=fib(),colored=patchDrawingProperties(row,colorPatch(row).properties),f=await duplicateAdapterFixture([colored]);try{
  f.controller.bindDrawingWorkspaceHost(f.host);const result=f.controller.duplicateDrawings([row.id]);
  expect(result).toMatchObject({canonicalAccepted:true,workspaceAcknowledged:true,observersComplete:true,nativeState:'complete'});
  const copy=f.f.document.all().find((candidate:any)=>candidate.id===result.ids[0])!;
  expect(copy.props).toStrictEqual(f.f.document.all()[0].props);expect(copy.anchors).toStrictEqual(colored.anchors);
  expect(f.f.native.controller.store.get(result.ids[0]).levels.map((level:any)=>level.color)).toEqual(Array(4).fill(chosen));
  expect(f.history.status().undo).toBe(1);expect(f.state().analysisUnavailable).toBe('');
 }finally{f.dispose();}
});

it('refuses invalid colors and other Fib tools without changing the original draft',()=>{
 const editor=drawingEditor(fib(),bars),before=structuredClone(editor.values);
 for(const color of ['', 'Mixed','not a color','rgba(1,2,3,Infinity)'])expect(()=>fibLevelColorValues(editor,editor.values,color)).toThrow();
 expect(editor.values).toStrictEqual(before);
 const other=drawingEditor(createDrawing('trendline',{id:'SYNTHETIC other tool',paneId:'price',anchors:[{time:1000000,price:100},{time:1240000,price:200}]})!.serialize(),bars);
 expect(fibLevelColor(other,other.values)).toBeUndefined();expect(()=>fibLevelColorValues(other,other.values,chosen)).toThrow();
});
