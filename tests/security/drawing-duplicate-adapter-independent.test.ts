import {expect,it} from 'vitest';
import {duplicateAdapterFixture} from '../chart/drawing-duplicate-adapter-harness';
import {DrawingDuplicatePublicationError} from '../../src/chart/drawing-duplicate-publication';

it('adapter retains an acknowledged copy after workspace registration replacement without selecting or quarantining the replacement',async()=>{
 const f=await duplicateAdapterFixture();try{
  const unregister=f.controller.bindDrawingWorkspaceHost(f.host);let replacementUnregister:(()=>void)|undefined;
  f.afterWrite(()=>{replacementUnregister=f.controller.bindDrawingWorkspaceHost({...f.host});});
  let failure:unknown;try{f.controller.duplicateDrawings([f.rows[0].id]);}catch(error){failure=error;}
  expect(failure).toBeInstanceOf(DrawingDuplicatePublicationError);
  const receipt=(failure as DrawingDuplicatePublicationError).receipt;
  expect(receipt).toMatchObject({canonicalAccepted:true,workspaceAcknowledged:true,nativeState:'complete',observersComplete:false});
  expect(f.workspace().drawings).toEqual(f.f.document.serialize());expect(f.f.document.all()).toHaveLength(2);expect(f.f.native.controller.all()).toHaveLength(2);expect(f.history.status().undo).toBe(1);
  expect(f.state()).toMatchObject({notifications:0,reconciliations:0,drawingBatch:0,nativeDrawingReconciliationHold:0,analysisUnavailable:''});
  expect(f.state().selectedDrawingIds).not.toEqual(receipt.ids);
  unregister();f.afterWrite(()=>{});
  expect(f.controller.duplicateDrawings([f.rows[0].id]).workspaceAcknowledged).toBe(true);
  replacementUnregister?.();
 }finally{f.dispose();}
});

it('adapter keeps acknowledged values but suppresses an old execution selection and quarantine',async()=>{
 const f=await duplicateAdapterFixture();try{
  f.controller.bindDrawingWorkspaceHost(f.host);f.afterWrite(()=>f.execution());
  let failure:unknown;try{f.controller.duplicateDrawings([f.rows[0].id]);}catch(error){failure=error;}
  expect(failure).toBeInstanceOf(DrawingDuplicatePublicationError);
  const receipt=(failure as DrawingDuplicatePublicationError).receipt;
  expect(receipt).toMatchObject({canonicalAccepted:true,workspaceAcknowledged:true,nativeState:'complete',observersComplete:false});
  expect(f.workspace().drawings).toEqual(f.f.document.serialize());expect(f.f.native.controller.all()).toHaveLength(2);expect(f.history.status().undo).toBe(1);
  expect(f.state()).toMatchObject({notifications:0,reconciliations:0,drawingBatch:0,nativeDrawingReconciliationHold:0,analysisUnavailable:''});
  expect(f.state().selectedDrawingIds).not.toEqual(receipt.ids);
 }finally{f.dispose();}
});

it('adapter rejects pane inventory drift during workspace preflight before canonical or native insertion',async()=>{
 const f=await duplicateAdapterFixture();try{
  f.controller.bindDrawingWorkspaceHost(f.host);const before=f.f.document.serialize();
  f.prepare(()=>f.panes({panes:[{paneId:'price',logicalPaneId:'price',replaceable:false,owners:[]},{paneId:'SYNTHETIC extra pane',logicalPaneId:'SYNTHETIC logical',replaceable:true,owners:[{kind:'built',id:'SYNTHETIC study',rendererId:'SYNTHETIC native'}]}],occupiedIds:['SYNTHETIC native']}));
  expect(()=>f.controller.duplicateDrawings([f.rows[0].id])).toThrow();
  expect(f.f.document.serialize()).toEqual(before);expect(f.f.native.controller.all()).toHaveLength(1);expect(f.history.status().undo).toBe(0);
  expect(f.state()).toMatchObject({notifications:0,reconciliations:0,drawingBatch:0,nativeDrawingReconciliationHold:0,analysisUnavailable:''});
 }finally{f.dispose();}
});
