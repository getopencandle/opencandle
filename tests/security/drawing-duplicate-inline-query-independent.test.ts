import {expect,it} from 'vitest';
import {inlineEditorFixture,input,event} from './inline-editor-controlled-harness';

it('editing queries preserve draft, composition, selection, native muting and callbacks',()=>{
 const f=inlineEditorFixture();try{
  expect(f.editor.isEditing()).toBe(false);f.editor.edit(f.target);input(f,'SYNTHETIC unsaved\ncomplete draft');
  const text=f.textarea();text.setSelectionRange(3,12);event(text,'compositionstart');
  const before={value:text.value,selection:[text.selectionStart,text.selectionEnd],repaints:f.repaints,layout:f.layoutCalls.length};
  for(let count=0;count<5;count++)expect(f.editor.isEditing()).toBe(true);
  expect({value:text.value,selection:[text.selectionStart,text.selectionEnd],repaints:f.repaints,layout:f.layoutCalls.length}).toEqual(before);
  expect(f.commits).toEqual([]);expect(f.muted).toBe(true);expect(f.overlay()).toBeDefined();
 }finally{f.cleanup();}
});

it('acquisition and publication callbacks observe editing before a fully mounted draft exists',()=>{
 let f:ReturnType<typeof inlineEditorFixture>;const observed:boolean[]=[];
 f=inlineEditorFixture('SYNTHETIC initial',host=>{
  const eligible=host.canEnter,capture=host.captureOpening;
  host.canEnter=()=>{observed.push(f.editor.isEditing());return eligible();};
  host.captureOpening=id=>{observed.push(f.editor.isEditing());const opened=capture(id);return{...opened,commit(value){observed.push(f.editor.isEditing());return opened.commit(value);}};};
 });
 try{f.editor.edit(f.target);input(f,'SYNTHETIC next');f.editor.commit();expect(observed.length).toBeGreaterThanOrEqual(3);expect(observed.every(Boolean)).toBe(true);expect(f.commits).toEqual(['SYNTHETIC next']);expect(f.editor.isEditing()).toBe(false);}finally{f.cleanup();}
});

it('foreign or disposed query receivers reject without committing or dropping an active genuine draft',()=>{
 const f=inlineEditorFixture();try{
  f.editor.edit(f.target);input(f,'SYNTHETIC retained');
  expect(()=>f.editor.isEditing.call({...f.editor})).toThrow();expect(()=>f.editor.isEditing.call(undefined)).toThrow();
  expect(f.editor.isEditing()).toBe(true);expect(f.textarea().value).toBe('SYNTHETIC retained');expect(f.commits).toEqual([]);
  f.editor.dispose();expect(()=>f.editor.isEditing()).toThrow();expect(f.commits).toEqual([]);
 }finally{f.cleanup();}
});
