import {expect,it} from 'vitest';
import {captureInlineDrawingOwner} from '../../src/chart/drawing-inline-owner';
import {templateAdapterHarness} from '../chart/drawing-template-adapter-harness';

it('a supported native replacement inside the source assertion cannot lend ownership to the old bridge',async()=>{
 const f=await templateAdapterHarness();try{
  const id=f.rows[0].id,facade={ctrl:f.native.controller};let action=()=>{};
  const owned=captureInlineDrawingOwner(f.document,facade,id,f.projection()[0],()=>action());
  action=()=>{action=()=>{};f.native.controller.fromJSON(f.document.serialize());};expect(owned).toThrow(/changed|identity/);expect(owned).toThrow(/retired/);
  captureInlineDrawingOwner(f.document,facade,id,f.projection()[0],()=>{})();
 }finally{f.native.dispose();}
});

it('owned model-field accessor replacement is detected before a getter and cannot revive by restoration',async()=>{
 const f=await templateAdapterHarness();try{
  const id=f.rows[0].id,model=f.native.controller.store.get(id),descriptor=Object.getOwnPropertyDescriptor(model,'paneId')!,owned=captureInlineDrawingOwner(f.document,{ctrl:f.native.controller},id,f.projection()[0],()=>{});let reads=0;
  Object.defineProperty(model,'paneId',{configurable:true,enumerable:true,get(){reads++;return'price';}});
  expect(owned).toThrow(/changed/);expect(reads).toBe(0);Object.defineProperty(model,'paneId',descriptor);expect(owned).toThrow(/retired/);
 }finally{f.native.dispose();}
});
