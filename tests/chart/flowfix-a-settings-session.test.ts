import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createDrawingSettingsSession,installDrawingSettingsSession} from '../../src/chart/drawing-edit-transaction';
import {sameDrawingData} from '../../src/chart/drawing-data-equality';

// OK in the renderer's drawing settings panel left one undo step per property (each control change is a live
// native edit and a publication; OK only closes). The session holds publications from open to close and publishes once.
// SYNTHETIC documents. The panel stand-in has the pinned panel's shape: prototype open/close, Cancel = restore then close.
const pinned=readFileSync('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js','utf8');
function rig(){
 let doc={drawings:[{id:'d1',style:{lineColor:'#2962FF',lineWidth:1}}]};const steps:unknown[]=[];
 const session=createDrawingSettingsSession({publish:()=>steps.push(structuredClone(doc)),snapshot:()=>structuredClone(doc),same:sameDrawingData});
 // The adapter publication path: a held publication is skipped, otherwise it is one workspace step.
 const notify=()=>{if(session.hold())return;steps.push(structuredClone(doc));};
 const edit=(style:Record<string,unknown>)=>{doc={drawings:[{...doc.drawings[0],style:{...doc.drawings[0].style,...style}}]};notify();};
 class Panel{snapshot:typeof doc|null=null;open(){this.close();this.snapshot=structuredClone(doc);}close(){this.snapshot=null;}cancel(){doc=structuredClone(this.snapshot!);notify();this.close();}}
 const panel=new Panel(),release=installDrawingSettingsSession(panel,session);
 return{steps,edit,panel,session,release,doc:()=>doc};
}
describe('FLOWS-AUDIT-1028 #16 a settings dialog edit is one undo step',()=>{
 it('the pinned panel applies controls live, OK only closes and Cancel restores then closes',()=>{
  expect(pinned).toContain('footer: (foot) => foot.append(button("Cancel", false, cancel), button("Ok", true, () => this.close())),');
  expect(pinned).toMatch(/const cancel = \(\) => \{\s*actions\.preview\?\.\(null\);\s*actions\.restore\?\.\(snapshot\);\s*this\.close\(\);/);
  expect(pinned).toMatch(/edit: \(p\) => \{\s*actions\.patch\(p\);/);
 });
 it('width and color then OK: one publication holding both',()=>{
  const r=rig();r.panel.open();r.edit({lineWidth:3});r.edit({lineColor:'#FF0000'});expect(r.steps).toEqual([]);expect(r.session.holding()).toBe(true);
  r.panel.close();expect(r.steps).toHaveLength(1);expect(r.steps[0]).toEqual({drawings:[{id:'d1',style:{lineColor:'#FF0000',lineWidth:3}}]});
  r.edit({lineWidth:4});expect(r.steps,'edits after the dialog publish one by one again').toHaveLength(2);
 });
 it('Cancel that puts everything back publishes nothing; a session with no edit publishes nothing',()=>{
  const r=rig();r.panel.open();r.edit({lineWidth:3});r.panel.cancel();expect(r.steps).toEqual([]);expect(r.session.holding()).toBe(false);
  r.panel.open();r.panel.close();expect(r.steps).toEqual([]);
 });
 it('reopening on another drawing ends the first session first; release restores the prototype methods and ends',()=>{
  const r=rig();r.panel.open();r.edit({lineWidth:2});r.panel.open();expect(r.steps).toHaveLength(1);r.edit({lineWidth:5});
  r.release();expect(r.steps).toHaveLength(2);expect(Object.hasOwn(r.panel,'open')).toBe(false);expect(Object.hasOwn(r.panel,'close')).toBe(false);
  expect(installDrawingSettingsSession(null,r.session)).toBeTypeOf('function');
 });
 it('the adapter holds notifyDrawings for the session, ends it before history, and installs it on the renderer panel',()=>{
  const adapter=readFileSync('src/chart/adapter.ts','utf8');
  expect(adapter).toMatch(/const notifyDrawings=\(\)=>\{[^\n]*if\(typeof drawingSettings!=='undefined'&&drawingSettings\.hold\(\)\)return;/);
  expect(adapter).toMatch(/history:\(direction,assert\)=>\{[^\n]*drawingSettings\.end\(\);/);
  expect(adapter).toContain('installDrawingSettingsSession(popup?.panel,drawingSettings)');
  expect(pinned).toMatch(/this\.panel = new DrawingSettingsPanel\(/);
 });
});
