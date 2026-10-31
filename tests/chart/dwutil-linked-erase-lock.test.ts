import {expect,it} from 'vitest';
import {drawingErasePublicationFixture as fixture} from './drawing-erase-publication-harness';

// (spec 3.3, phase 3): while the drawing lock is on the Eraser treats every drawing
// as locked and removes nothing. The predicate is injected by the adapter's drawingUtility port.
it('LINKED.ERASER.LOCK removes nothing while the drawing lock predicate is on, and erases again once it is off',async()=>{
 const f=await fixture();
 try{
  let locked=true;(f.host as any).drawingsLocked=()=>locked;
  const before=f.document.serialize(),saved=f.state().workspace;
  expect(()=>f.run()).toThrow('Locked or hidden drawings cannot be erased.');
  expect(f.document.serialize()).toEqual(before);expect(f.native.controller.all()).toHaveLength(2);expect(f.state().workspace).toBe(saved);
  expect(f.history.status().undo).toBe(0);expect(f.state()).toMatchObject({holds:0,notifications:0,quarantines:0});
  locked=false;f.run();expect(f.native.controller.all()).toHaveLength(1);expect(f.history.status().undo).toBe(1);
 }finally{f.dispose();}
});
