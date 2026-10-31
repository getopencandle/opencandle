import {expect,it} from 'vitest';
import {inlineEditorFixture,input} from './inline-editor-controlled-harness';

it('a reentrant public commit cannot invoke the publication callback twice for one draft',()=>{
 let fixture:ReturnType<typeof inlineEditorFixture>,calls=0;
 fixture=inlineEditorFixture('SYNTHETIC original',host=>{const capture=host.captureOpening;host.captureOpening=id=>{const opened=capture(id);return{...opened,commit(value){calls++;if(calls===1)fixture.editor.commit();return opened.commit(value);}};};});
 try{fixture.editor.edit(fixture.target);input(fixture,'SYNTHETIC next');fixture.editor.commit();expect(calls).toBe(1);expect(fixture.commits).toEqual(['SYNTHETIC next']);}finally{fixture.cleanup();}
});

it('Cancel cannot steal focus after its redraw retires the old source',()=>{
 let fixture:ReturnType<typeof inlineEditorFixture>,retireOnPaint=false,replacement:any;
 fixture=inlineEditorFixture('SYNTHETIC original',host=>{const paint=host.repaint;host.repaint=()=>{paint();if(retireOnPaint){fixture.retire();replacement.focus();}};});
 try{fixture.editor.edit(fixture.target);replacement=fixture.doc.createElement('button');fixture.doc.body.append(replacement);retireOnPaint=true;fixture.editor.cancel();expect(fixture.overlay()).toBeUndefined();expect(fixture.doc.activeElement).toBe(replacement);expect(fixture.commits).toEqual([]);}finally{fixture.cleanup();}
});

it('disposal inside opening acquisition prevents subsequent old-owner repaint and DOM creation',()=>{
 let fixture:ReturnType<typeof inlineEditorFixture>,retire=false;
 fixture=inlineEditorFixture('SYNTHETIC original',host=>{const capture=host.captureOpening;host.captureOpening=id=>{const opened=capture(id);if(retire)fixture.editor.dispose();return opened;};});
 try{const before=fixture.doc.created.length;retire=true;expect(()=>fixture.editor.edit(fixture.target)).toThrow();expect(fixture.repaints).toBe(0);expect(fixture.doc.created.length).toBe(before);expect(fixture.muted).toBe(false);}finally{fixture.cleanup();}
});

it('a no-op closing repaint failure remains observable after its local session has been retired',()=>{
 const original=Error('SYNTHETIC no-op repaint failure');let throwOnPaint=false;
 const fixture=inlineEditorFixture('SYNTHETIC unchanged',host=>{const paint=host.repaint;host.repaint=()=>{paint();if(throwOnPaint)throw original;};});
 try{fixture.editor.edit(fixture.target);throwOnPaint=true;fixture.editor.commit();expect(fixture.overlay()).toBeUndefined();expect(fixture.commits).toEqual([]);expect(fixture.errors.at(-1)).toEqual({error:original,accepted:false});}finally{fixture.cleanup();}
});
