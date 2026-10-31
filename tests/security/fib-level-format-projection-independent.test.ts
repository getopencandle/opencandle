import {createDrawing,deserializeDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {expect,it} from 'vitest';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {drawingEditor} from '../../src/chart/drawing-port';
import {nativeDrawingHarness} from '../chart/drawing-native-harness';

const field='lvFibLevelFormat';

it('reconciles an actual native own-undefined format update as a meaningful unavailable state, with one reversible canonical edit',async()=>{
 const native=await nativeDrawingHarness();
 try{
  const opening=createDrawing('fibretracement',{id:'SYNTHETIC native format presence edit',paneId:'price',createdAt:1,zIndex:4,anchors:[{time:1000000,price:100},{time:1240000,price:200}]})!.serialize();
  opening.props={...opening.props,reverse:false,showRatios:true,showPrices:true,levels:[
   {ratio:.236,color:'#123456',enabled:true,label:'SYNTHETIC first'},
   {ratio:.618,color:'#abcdef',enabled:true,label:'SYNTHETIC second'},
  ]};
  delete opening.props[field];
  const document=new LosslessDrawingDocument();document.load({version:1,drawings:[opening]});
  native.controller.fromJSON({version:1,drawings:[opening]});
  const nativeBefore=native.controller.store.get(opening.id).serialize();delete nativeBefore.props[field];
  expect(nativeBefore).toStrictEqual(opening);
  expect(Object.hasOwn(document.all()[0].props as object,field)).toBe(false);
  const unsubscribe=native.on('drawing:edited',()=>document.mergeRenderable(native.controller.all(),new Set(['fibretracement'])));
  // The native retracement reader changes reverse when a props patch omits it.
  // Supply unchanged original props so ONLY semantic format presence changes.
  try{native.controller.update(opening.id,{props:{...opening.props,[field]:undefined}});}finally{unsubscribe();}
  const actual=native.controller.store.get(opening.id),serialized=actual.serialize();
  expect(Object.hasOwn(serialized.props,field)).toBe(true);expect(serialized.props[field]).toBeUndefined();
  const nativeAfter=structuredClone(serialized);delete nativeAfter.props[field];expect(nativeAfter).toStrictEqual(opening);
  expect(actual.levelText(.618,123)).toBe('123.00');
  const retained=document.all()[0] as unknown as SerializedDrawing;
  expect(Object.hasOwn(retained.props!,field)).toBe(true);expect(retained.props![field]).toBeUndefined();
  expect(retained.anchors).toStrictEqual(opening.anchors);expect(retained.props!.levels).toStrictEqual(opening.props.levels);
  expect((deserializeDrawing(retained)! as unknown as {levelText(ratio:number,price:number):string}).levelText(.618,123)).toBe('123.00');
  const editor=drawingEditor(retained,[]);
  expect(editor.fields.some(item=>item.path===field)).toBe(false);
  expect((editor as unknown as {fibFormatDiagnostic?:string}).fibFormatDiagnostic).toMatch(/unsupported|retained/i);
  expect(document.undo()).toBe(true);expect(Object.hasOwn(document.all()[0].props as object,field)).toBe(false);
  expect(document.undo()).toBe(false);expect(document.redo()).toBe(true);
  expect(Object.hasOwn(document.all()[0].props as object,field)).toBe(true);
 }finally{native.dispose();}
});
