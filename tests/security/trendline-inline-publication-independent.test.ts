import {expect,it} from 'vitest';
import {captureTrendlineInlineOpening} from '../../src/chart/trendline-inline-publication';
import {DrawingEditRecoveryError} from '../../src/chart/drawing-edit-transaction';
import {templateAdapterHarness} from '../chart/drawing-template-adapter-harness';
import {annotationRecord} from '../chart/trendline-annotation-native-harness';

it('a publication observer replacing the canonical/native document cannot be rolled back or quarantined by the old opening',async()=>{
 const record=annotationRecord(true),f=await templateAdapterHarness([record]);
 try{
  const opening=captureTrendlineInlineOpening({document:f.document,facade:{ctrl:f.native.controller},assertSource(){},assertMutable(){},update:f.edit},record.id);
  const replacement=f.document.serialize();(replacement.drawings as any[])[0].text.value='SYNTHETIC newer replacement';let acceptedReplacement:unknown;
  const off=f.subscribe(()=>{off();f.load(replacement);acceptedReplacement=f.document.serialize();throw Error('SYNTHETIC old subscriber failure');});
  expect(()=>opening.commit('SYNTHETIC accepted old text')).toThrow(DrawingEditRecoveryError);
  expect(acceptedReplacement).toBeDefined();expect(f.document.serialize()).toEqual(acceptedReplacement);expect(f.native.controller.store.get(record.id)!.serialize().text!.value).toBe('SYNTHETIC newer replacement');
  expect(f.state().analysisUnavailable).toBe('');expect(()=>opening.commit('stale retry')).toThrow();
 }finally{f.native.dispose();}
});

it('native queue eligibility changing after the opening check rejects without consuming the still-owned draft',async()=>{
 const record=annotationRecord(true),f=await templateAdapterHarness([record]);let arm=false;
 try{
  const opening=captureTrendlineInlineOpening({document:f.document,facade:{ctrl:f.native.controller},assertSource(){if(arm){arm=false;f.queue(true);}},assertMutable(){},update:f.edit},record.id),before=f.document.serialize();
  arm=true;expect(()=>opening.commit('SYNTHETIC pending')).toThrow();expect(f.document.serialize()).toEqual(before);opening.assertCurrent();
  f.queue(false);expect(opening.commit('SYNTHETIC accepted retry')).toEqual({accepted:true,changed:true});expect((f.document.all()[0].text as any).value).toBe('SYNTHETIC accepted retry');expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toEqual(before);
 }finally{f.native.dispose();}
});
