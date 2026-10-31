import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

// section 2 (App wiring, .OBJECT.VISIBILITY). the recorded facts: a row hidden on the
// current interval opens the properties dialog on the Visibility tab; the drawing context menu "Visibility on intervals..." opens the same
// tab. Source assertions only (the DrawingDialog initialTab behaviour and the route helper are tested in r21-draw-dialog.test.ts); not UI evidence.
describe('App opens the drawing settings dialog on Visibility for both entries',()=>{
 it('App routes the object tree hidden-on-interval click and the context menu Visibility entry to it (source wiring)',()=>{
  const app=readFileSync('src/ui/App.tsx','utf8');
  expect(app).toContain("onOpenDrawingSettings:(id,tab)=>{setSelectedDrawing(id);const priorAuthority=dialogAuthority.current;setDialog('drawing');if(tab==='visibility'&&dialogAuthority.current!==priorAuthority)routeDrawingDialogTab(dialogAuthority.current,'Visibility');}");
  expect(app).toContain("if(action==='drawing-visibility'&&dialogAuthority.current!==priorAuthority)routeDrawingDialogTab(dialogAuthority.current,'Visibility');");
  expect(app).toContain('initialTab={drawingDialogEntryTab(renderedDialogAuthority)}');
 });
});
