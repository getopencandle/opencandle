import {expect,it} from 'vitest';
import {createDrawing,deserializeDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {drawingEditor,patchDrawingProperties,patchDrawingCoordinates} from '../../src/chart/drawing-port';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {nativeDrawingHarness,drawingProjection} from '../chart/drawing-native-harness';
const bars=[1000,1060,1240].map(time=>({time,open:100,high:200,low:90,close:150,volume:10}));
const record=()=>createDrawing('fibretracement',{id:'independent-fib',paneId:'price',anchors:[{time:1000000,price:100},{time:1240000,price:200}]})!.serialize();
it('first custom label creates a complete native-readable level tuple without flipping fresh reversal',async()=>{
 const original=record();delete original.props;const before=deserializeDrawing(original) as any,next=patchDrawingProperties(original,{'levels.0.label':'SYNTHETIC review label'}),test=await nativeDrawingHarness();
 try{test.controller.fromJSON({version:1,drawings:[original]});test.controller.updateMany([{id:original.id,patch:next}]);const actual=test.controller.store.get(original.id);
 expect(next.props!.reverse).toBe(false);expect((next.props!.levels as any[]).every(level=>typeof level.ratio==='number'&&typeof level.color==='string'&&typeof level.enabled==='boolean')).toBe(true);
 expect(actual.editableLevels()[0].label).toBe('SYNTHETIC review label');expect(actual.levelLines(drawingProjection).map((row:any)=>row.price)).toEqual(before.levelLines(drawingProjection).map((row:any)=>row.price));expect(test.paint(original.id).some((command:any)=>command.op==='fillText'&&command.values[0]==='SYNTHETIC review label')).toBe(true);
 }finally{test.dispose();}
});
it('a custom label in a legacy empty props bag keeps omitted reverse and its native true meaning',()=>{
 const original={...record(),props:{}},next=patchDrawingProperties(original,{'levels.1.label':'SYNTHETIC legacy'}),native=deserializeDrawing(next) as any;
 expect(Object.hasOwn(next.props!,'reverse')).toBe(false);expect(native.reverse).toBe(true);expect(native.editableLevels()[1].label).toBe('SYNTHETIC legacy');
});
it('a failed staged edit preserves pre-existing canonical Undo and Redo ownership',()=>{
 const original=record(),first=patchDrawingProperties(original,{'style.lineWidth':4}),second=patchDrawingProperties(first,{'style.lineWidth':5}),failed=patchDrawingProperties(first,{'style.lineWidth':6}),document=new LosslessDrawingDocument();
 document.load({version:1,drawings:[original]});document.stageEditedRecord(original as any,first as any);document.stageEditedRecord(first as any,second as any);expect(document.undo()).toBe(true);
 expect(()=>document.atomic(()=>{document.stageEditedRecord(first as any,failed as any);throw Error('independent rejected native update');})).toThrow('rejected native');
 expect(document.all()[0]).toEqual(first);expect(document.undo()).toBe(true);expect(document.all()[0]).toEqual(original);expect(document.redo()).toBe(true);expect(document.all()[0]).toEqual(first);expect(document.redo()).toBe(true);expect(document.all()[0]).toEqual(second);expect(document.redo()).toBe(false);
});
it('accessor metadata cannot execute while opening a native property editor',()=>{
 const original=record();let reads=0;Object.defineProperty(original.props!,'reverse',{enumerable:true,get(){reads++;return false;}});expect(()=>drawingEditor(original,bars)).toThrow();expect(reads).toBe(0);
});
it('finite ratio edits cannot introduce unrepresentable native level geometry',()=>{
 const original=record(),before=structuredClone(original);expect(()=>patchDrawingProperties(original,{'levels.0.ratio':Number.MAX_VALUE})).toThrow(/overflow|finite|representable/i);expect(original).toEqual(before);
});
it('a retained extra anchor never becomes an editable coordinate merely because the tool is known',()=>{
 const original=createDrawing('trendline',{id:'independent-extra-anchor',paneId:'price',anchors:[{time:1000000,price:100},{time:1240000,price:200}]})!.serialize();original.anchors.push({time:1300000,price:300});const before=structuredClone(original);
 expect(()=>patchDrawingCoordinates(original,bars,[{},{},{price:400}])).toThrow(/unsupported|schema|anchor/i);expect(original).toEqual(before);
});
it('finite Fibonacci anchor edits cannot commit overflowing derived levels',()=>{
 const original=record(),before=structuredClone(original);expect(()=>patchDrawingCoordinates(original,bars,[{price:-1e308},{price:1e308}])).toThrow(/overflow|finite|representable/i);expect(original).toEqual(before);
});
