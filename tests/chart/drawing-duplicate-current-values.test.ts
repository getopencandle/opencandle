import {it,expect} from 'vitest';
import {createDrawing,deserializeDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {prepareNativeDrawingInsert} from '../../src/chart/drawing-duplicate-native';
import {nativeDrawingHarness} from './drawing-native-harness';

it('proves mixed-tool accepted current values without freezing native data or losing canonical opaque copies',async()=>{
 const native=await nativeDrawingHarness(),document=new LosslessDrawingDocument();
 const types=['fibretracement','parallelchannel','position','text'] as const;
 const rows=types.map((type,index)=>({...createDrawing(type,{id:`SYNTHETIC-mixed-current-${index}`,paneId:'price',zIndex:index+1,anchors:[{time:1000000,price:100},{time:1240000,price:type==='position'?90:200},{time:1240000,price:120}],text:{value:'SYNTHETIC mixed current values',color:'#123456',size:'normal',hAlign:'left',vAlign:'top'}})!.serialize(),future:{omitted:undefined,minusZero:-0}}));
 document.load({version:1,drawings:rows});native.controller.fromJSON({version:1,drawings:rows});
 const originals=document.all(),copies=originals.map((row,index)=>({...structuredClone(row),id:`SYNTHETIC-mixed-copy-${index}`,zIndex:20+index}));
 const canonical=document.prepareOwnedInsertBatch(originals,copies);let assertCanonical=()=>canonical.assertCurrent();
 const helper=prepareNativeDrawingInsert({ctrl:native.controller},copies.map(row=>deserializeDrawing(row as unknown as SerializedDrawing)!.serialize()),{assertCurrent(){assertCanonical();},assertWorkspaceCapacity(){}});
 try{
  const history=native.controller.history.undoStack;canonical.stage();expect(helper.insert().state).toBe('complete');const accepted=canonical.accept();assertCanonical=()=>accepted.assertCurrent();
  const receipt=helper.captureAcceptedValueOwner();helper.dispose();const before=native.controller.all();
  receipt.assertCurrent();receipt.assertCurrent();expect(native.controller.all()).toEqual(before);expect(native.controller.history.undoStack).toBe(history);expect(document.all().slice(rows.length)).toEqual(copies);
  for(const row of copies){const model=native.controller.store.get(row.id);expect(Object.isFrozen(model)).toBe(false);expect(Object.isFrozen(model.style)).toBe(false);expect(Object.hasOwn((row as any).future,'omitted')).toBe(true);expect(Object.is((row as any).future.minusZero,-0)).toBe(true);}
 }finally{helper.dispose();native.dispose();}
});
