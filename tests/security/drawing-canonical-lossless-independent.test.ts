import {createDrawing,deserializeDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {expect,it} from 'vitest';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {projectNativeDrawingRecord} from '../../src/chart/drawing-canonical';
import {measureWorkspaceJSON,prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {templateAdapterHarness} from '../chart/drawing-template-adapter-harness';
import {reprojectPortableDrawingDocument} from '../../src/chart/drawing-document-bindings';

function record(){
 const row=createDrawing('trendline',{id:'SYNTHETIC canonical exact data',paneId:'price',zIndex:1,anchors:[{time:1000000,price:10},{time:1240000,price:20}]})!.serialize();
 row.props={future:{label:'SYNTHETIC opaque retained data',omission:undefined,minus:-0}};
 row.style.arrowLeft=undefined;
 (row.anchors[0] as unknown as Record<string,unknown>).future={omission:undefined,minus:-0};
 return row;
}
function assertExactOpaque(row:Record<string,unknown>){
 const props=row.props as any,anchor=(row.anchors as any[])[0];
 expect(Object.hasOwn(props.future,'omission')).toBe(true);expect(props.future.omission).toBeUndefined();expect(Object.is(props.future.minus,-0)).toBe(true);
 expect(Object.hasOwn(anchor.future,'omission')).toBe(true);expect(Object.is(anchor.future.minus,-0)).toBe(true);
 expect(Object.hasOwn(row.style as object,'arrowLeft')).toBe(true);expect((row.style as any).arrowLeft).toBeUndefined();
}

it('retains canonical own undefined throughout native omission reconciliation after an unrelated color edit',()=>{
 const prior=record(),model=deserializeDrawing(prior)!;model.applySettings({'style.lineColor':'#abcdef'});
 const native=model.serialize(),projected=projectNativeDrawingRecord(prior as unknown as Record<string,unknown>,native as unknown as Record<string,unknown>);
 expect((projected.style as any).lineColor).toBe('#abcdef');assertExactOpaque(projected);
 assertExactOpaque(prior as unknown as Record<string,unknown>);
});

it('does not let the native serializer own undefined props erase opaque canonical property data',()=>{
 const prior=record(),model=deserializeDrawing(prior)!;model.applySettings({'style.lineColor':'#abcdef'});const native=model.serialize();
 expect(Object.hasOwn(native,'props')).toBe(true);expect(native.props).toBeUndefined();
 const projected=projectNativeDrawingRecord(prior as unknown as Record<string,unknown>,native as unknown as Record<string,unknown>);
 expect((projected.props as any).future.label).toBe('SYNTHETIC opaque retained data');expect(Object.is((projected.props as any).future.minus,-0)).toBe(true);
});

it('actual owned canonical edit stage and Undo Redo preserve unchanged undefined independently of projection',()=>{
 const document=new LosslessDrawingDocument(),prior=record();document.load({version:1,drawings:[prior]});
 const opening=document.all()[0],next=structuredClone(opening);(next.style as any).lineColor='#abcdef';
 const lease=document.prepareOwnedEditBatch([opening],[next]);lease.stage();const receipt=lease.accept();receipt.assertCurrent();
 assertExactOpaque(document.all()[0]);expect((document.all()[0].style as any).lineColor).toBe('#abcdef');
 expect(document.undo()).toBe(true);assertExactOpaque(document.all()[0]);expect(document.redo()).toBe(true);assertExactOpaque(document.all()[0]);
});

it('keeps persistence normalization explicitly separate from in-memory exact canonical data',()=>{
 const prior=record();expect(()=>measureWorkspaceJSON({row:prior})).not.toThrow();
 const normalized=prepareWorkspaceJSON({row:prior}).row as any;
 expect(Object.hasOwn(normalized.props.future,'omission')).toBe(false);expect(Object.hasOwn(normalized.style,'arrowLeft')).toBe(false);expect(Object.is(normalized.props.future.minus,-0)).toBe(true);
 assertExactOpaque(prior as unknown as Record<string,unknown>);
});

it.each(['single','template'] as const)('actual adapter %s edit and accepted save callback retain exact canonical omissions',async kind=>{
 const prior=record(),f=await templateAdapterHarness([prior]),observed:Record<string,unknown>[]=[];
 try{
  // Establish an exact canonical in-memory owner independently of the import
  // normalization boundary; the actual native row already has the same state.
  f.document.load({...f.document.serialize(),drawings:[structuredClone(prior)]});f.select([prior.id]);
  assertExactOpaque(f.document.all()[0]);f.subscribe(()=>{observed.push(f.save());});
  const receipt=kind==='single'?f.edit(prior.id,{'style.lineColor':'#abcdef'}):f.batches.commit(f.batches.prepare([prior.id],'synthetic-template'));
  expect(receipt).toMatchObject({accepted:true,changed:true});expect(observed).toHaveLength(1);
  assertExactOpaque((observed[0].drawings as Record<string,unknown>[])[0]);assertExactOpaque(f.document.all()[0]);
  const saved=f.save();assertExactOpaque((saved.drawings as Record<string,unknown>[])[0]);
  expect((f.document.all()[0].style as any).lineColor).toBe('#abcdef');expect(f.state().analysisUnavailable).toBe('');
 }finally{f.native.dispose();}
});

it.each(['own undefined','negative zero'] as const)('rejects an expected canonical row differing only by %s before staging',kind=>{
 const document=new LosslessDrawingDocument();document.load({version:1,drawings:[record()]});
 const opening=document.all()[0],wrong=structuredClone(opening),next=structuredClone(opening),prior=document.serialize();
 if(kind==='own undefined')delete (wrong.props as any).future.omission;else (wrong.props as any).future.minus=0;
 (next.style as any).lineColor='#abcdef';expect(JSON.stringify(wrong)).toBe(JSON.stringify(opening));
 expect(()=>document.prepareOwnedEditBatch([wrong],[next])).toThrow(/canonical|match|changed/i);
 expect(document.serialize()).toEqual(prior);assertExactOpaque(document.all()[0]);expect(document.undo()).toBe(false);
});

it('records an intentional exact undefined and signed-zero tuple change once and restores both tuples with Undo Redo',()=>{
 const document=new LosslessDrawingDocument();document.load({version:1,drawings:[record()]});
 const opening=document.all()[0],next=structuredClone(opening);delete (next.props as any).future.omission;(next.props as any).future.minus=0;
 expect(JSON.stringify(next)).toBe(JSON.stringify(opening));
 const lease=document.prepareOwnedEditBatch([opening],[next]);lease.stage();lease.accept().assertCurrent();
 const accepted=()=>{const value=(document.all()[0].props as any).future;expect(Object.hasOwn(value,'omission')).toBe(false);expect(Object.is(value.minus,0)).toBe(true);expect(Object.is(value.minus,-0)).toBe(false);};
 accepted();expect(document.undo()).toBe(true);assertExactOpaque(document.all()[0]);expect(document.undo()).toBe(false);
 expect(document.redo()).toBe(true);accepted();expect(document.redo()).toBe(false);
});

it('internal pane reprojection preserves exact canonical data while normalized native rows stay a separate view',()=>{
 const document=new LosslessDrawingDocument(),prior=record();document.load({version:1,drawings:[prior]});
 const nativeRows=[deserializeDrawing(prior)!.serialize()] as unknown as Record<string,unknown>[],inventory={panes:[{paneId:'price',logicalPaneId:'price',replaceable:false,owners:[]}],occupiedIds:[]};let syncs=0,loads=0;
 reprojectPortableDrawingDocument(document,inventory,new Set(['trendline']),{nativeRows,load(){loads++;},sync(){syncs++;}});
 expect(syncs).toBe(1);expect(loads).toBe(0);assertExactOpaque(document.all()[0]);expect(document.all()[0].lvPaneBinding).toEqual({schemaVersion:1,target:{kind:'price'}});expect(document.undo()).toBe(false);
});

it.each(['undefined','negative zero'] as const)('binding-only enrichment rejects unrelated %s data changes and preserves canonical history',kind=>{
 const document=new LosslessDrawingDocument();document.load({version:1,drawings:[record()]});const prior=document.serialize(),next=structuredClone(prior),row=(next.drawings as any[])[0];row.lvPaneBinding={schemaVersion:1,target:{kind:'price'}};
 if(kind==='undefined')delete row.props.future.omission;else row.props.future.minus=0;
 expect(()=>document.enrichPaneBindings(prior,next)).toThrow(/metadata|geometry|binding|changed/i);assertExactOpaque(document.all()[0]);expect(document.undo()).toBe(false);
});
